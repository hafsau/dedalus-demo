import { describe, expect, it } from "vitest";
import { createRng } from "@/lib/sim/random";
import { freshDisk, freshMemory, resolvePath, runExecution, tokenize } from "@/lib/sim/shell";

function machine() {
  const id = "0b7a2c9e-1111-4222-8333-444455556666";
  return {
    disk: freshDisk(id),
    memory: freshMemory(),
    facts: { machineId: id, vcpu: 2, memoryMib: 4096, storageGib: 10, bootedAt: 0 },
    rng: createRng(1),
    now: 60_000,
  };
}

function bash(script: string, ctx = machine(), extra: { cwd?: string } = {}) {
  const r = runExecution(["/bin/bash", "-c", script], { ...ctx, ...extra });
  const stdout = r.chunks.filter((c) => c.stream === "stdout").map((c) => c.text).join("");
  const stderr = r.chunks.filter((c) => c.stream === "stderr").map((c) => c.text).join("");
  return { stdout, stderr, code: r.exitCode, r, ctx };
}

describe("tokenizer", () => {
  it("handles quotes, escapes and variable expansion", () => {
    const toks = tokenize(`echo 'a $X' "b $X" c\\ d \${X}z`, { X: "1" });
    expect(toks.map((t) => t.value)).toEqual(["echo", "a $X", "b 1", "c d", "1z"]);
  });

  it("splits operators", () => {
    const toks = tokenize("a&&b||c;d|e>f>>g&", {});
    expect(toks.map((t) => t.value)).toEqual(["a", "&&", "b", "||", "c", ";", "d", "|", "e", ">", "f", ">>", "g", "&"]);
  });
});

describe("paths", () => {
  it("normalises . .. and ~", () => {
    expect(resolvePath("/root", "../etc/./hostname")).toBe("/etc/hostname");
    expect(resolvePath("/tmp", "~/x")).toBe("/root/x");
    expect(resolvePath("/", "..")).toBe("/");
  });
});

describe("commands", () => {
  it("runs the quickstart snippet from the Dedalus docs", () => {
    const { stdout, code } = bash("whoami && uname -a");
    expect(code).toBe(0);
    expect(stdout).toMatch(/^root\nLinux dm-0b7a2c9e /);
  });

  it("short-circuits && and ||", () => {
    expect(bash("false && echo no || echo yes").stdout).toBe("yes\n");
    expect(bash("true || echo no; echo after").stdout).toBe("after\n");
  });

  it("writes, appends and reads files", () => {
    const { stdout } = bash("echo one > f && echo two >> f && cat f && ls");
    expect(stdout).toBe("one\ntwo\nREADME  f\n");
  });

  it("pipes", () => {
    expect(bash("seq 1 20 | grep 1 | wc -l").stdout).toBe("11\n");
    expect(bash("seq 5 | tail -n 2").stdout).toBe("4\n5\n");
  });

  it("fails like bash on unknown commands", () => {
    const { stderr, code } = bash("kubectl get pods");
    expect(code).toBe(127);
    expect(stderr).toBe("bash: kubectl: command not found\n");
  });

  it("reports syntax errors with exit 2", () => {
    const { stderr, code } = bash("echo 'unterminated");
    expect(code).toBe(2);
    expect(stderr).toMatch(/unexpected EOF/);
  });

  it("respects cwd and cd within a script", () => {
    expect(bash("pwd", machine(), { cwd: "/etc" }).stdout).toBe("/etc\n");
    expect(bash("cd /tmp && pwd && cd nope").stdout).toBe("/tmp\n");
  });

  it("refuses rm -r /", () => {
    expect(bash("rm -r /").code).toBe(1);
  });

  it("advances the clock for sleep, capped at 30s", () => {
    expect(bash("sleep 2").r.durationMs).toBeGreaterThanOrEqual(2000);
    expect(bash("sleep 9999").r.durationMs).toBeLessThan(31_000);
  });

  it("streams seq output over time rather than all at once", () => {
    const { r } = bash("seq 1 100");
    const times = r.chunks.map((c) => c.atMs);
    expect(times.at(-1)! - times[0]).toBeGreaterThan(400);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("reflects machine size in nproc and free", () => {
    expect(bash("nproc").stdout).toBe("2\n");
    expect(bash("free -m").stdout).toContain("4096");
  });

  it("exit sets the code and stops the script", () => {
    const { stdout, code } = bash("echo a; exit 3; echo b");
    expect(stdout).toBe("a\n");
    expect(code).toBe(3);
  });
});
