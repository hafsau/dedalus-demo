// A deliberately small, honest fake shell for simulated machines.
//
// It's not trying to be bash. It supports enough to demonstrate the semantics
// that matter for Dedalus Machines: the filesystem persists across sleep,
// while /tmp, memory and processes don't. Unsupported commands fail the way
// bash would (exit 127) instead of pretending to work.

import type { Rng } from "./random";

export interface Proc {
  pid: number;
  command: string;
  startedAt: number;
}

/** State that survives sleep (disk). */
export interface Disk {
  files: Record<string, string>;
  dirs: string[];
}

/** State that is lost on sleep (RAM). */
export interface Memory {
  procs: Proc[];
  nextPid: number;
}

export interface MachineFacts {
  machineId: string;
  vcpu: number;
  memoryMib: number;
  storageGib: number;
  bootedAt: number;
}

export interface OutputChunk {
  stream: "stdout" | "stderr";
  text: string;
  /** Milliseconds after the execution started running. */
  atMs: number;
}

export interface ShellResult {
  chunks: OutputChunk[];
  exitCode: number;
  durationMs: number;
}

export interface ShellContext {
  disk: Disk;
  memory: Memory;
  facts: MachineFacts;
  rng: Rng;
  /** Wall-clock time the execution starts running. */
  now: number;
  cwd?: string;
  env?: Record<string, string>;
  stdin?: string;
}

export const HOME = "/root";

export const SUPPORTED_COMMANDS = [
  "cat", "cd", "date", "df", "echo", "env", "exit", "false", "free", "grep",
  "head", "hostname", "ls", "mkdir", "nohup", "nproc", "printf", "ps", "pwd",
  "rm", "seq", "sleep", "sort", "tail", "touch", "true", "uname", "uptime",
  "wc", "whoami",
] as const;

export function freshDisk(machineId: string): Disk {
  const host = hostnameFor(machineId);
  return {
    dirs: ["/", "/root", "/tmp", "/etc", "/home", "/usr", "/usr/bin", "/var", "/var/log"],
    files: {
      "/etc/hostname": `${host}\n`,
      "/etc/os-release":
        'PRETTY_NAME="Workshop Simulated Linux"\nNAME="Workshop"\nID=workshop-sim\nHOME_URL="https://github.com/hafsau"\n',
      "/root/README": [
        "This is a simulated Dedalus Machine.",
        "",
        "Files you write here persist across sleep and wake.",
        "/tmp, running processes and memory do not.",
        "Try: echo hi > notes.txt   then sleep the machine, wake it, and cat notes.txt",
        "",
      ].join("\n"),
    },
  };
}

export function freshMemory(): Memory {
  return { procs: [], nextPid: 100 };
}

export function hostnameFor(machineId: string): string {
  return `dm-${machineId.slice(0, 8)}`;
}

// ───────────────────────── paths ─────────────────────────

export function resolvePath(cwd: string, input: string): string {
  const raw = input.startsWith("~") ? HOME + input.slice(1) : input;
  const parts = (raw.startsWith("/") ? raw : `${cwd}/${raw}`).split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return "/" + out.join("/");
}

function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "/" : path.slice(0, i);
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1) || "/";
}

// ───────────────────────── tokenizer ─────────────────────────

type Op = "&&" | "||" | ";" | "|" | "&" | ">" | ">>";
type Token = { kind: "word"; value: string } | { kind: "op"; value: Op };

export class ShellSyntaxError extends Error {}

export function tokenize(script: string, env: Record<string, string>): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let word: string | null = null;

  const expandVar = (): string => {
    // Called with script[i] === "$"
    i++;
    if (script[i] === "{") {
      const end = script.indexOf("}", i);
      if (end === -1) throw new ShellSyntaxError("bad substitution");
      const name = script.slice(i + 1, end);
      i = end + 1;
      return env[name] ?? "";
    }
    const m = /^[A-Za-z_][A-Za-z0-9_]*|^\?/.exec(script.slice(i));
    if (!m) return "$";
    i += m[0].length;
    return env[m[0]] ?? "";
  };

  const flush = () => {
    if (word !== null) tokens.push({ kind: "word", value: word });
    word = null;
  };

  while (i < script.length) {
    const c = script[i];
    if (c === " " || c === "\t" || c === "\n") {
      flush();
      i++;
    } else if (c === "'") {
      const end = script.indexOf("'", i + 1);
      if (end === -1) throw new ShellSyntaxError("unexpected EOF while looking for matching `''");
      word = (word ?? "") + script.slice(i + 1, end);
      i = end + 1;
    } else if (c === '"') {
      i++;
      let buf = "";
      while (i < script.length && script[i] !== '"') {
        if (script[i] === "\\" && i + 1 < script.length) {
          buf += script[i + 1];
          i += 2;
        } else if (script[i] === "$") {
          buf += expandVar();
        } else {
          buf += script[i++];
        }
      }
      if (script[i] !== '"') throw new ShellSyntaxError('unexpected EOF while looking for matching `"\'');
      i++;
      word = (word ?? "") + buf;
    } else if (c === "\\" && i + 1 < script.length) {
      word = (word ?? "") + script[i + 1];
      i += 2;
    } else if (c === "$") {
      word = (word ?? "") + expandVar();
    } else if (c === "~" && word === null && (script[i + 1] === undefined || /[\s/]/.test(script[i + 1]))) {
      word = HOME;
      i++;
    } else if (c === "&" || c === "|" || c === ";" || c === ">") {
      flush();
      const two = script.slice(i, i + 2);
      if (two === "&&" || two === "||" || two === ">>") {
        tokens.push({ kind: "op", value: two });
        i += 2;
      } else {
        tokens.push({ kind: "op", value: c as Op });
        i++;
      }
    } else if (c === "#" && word === null) {
      // Comment to end of line.
      while (i < script.length && script[i] !== "\n") i++;
    } else {
      word = (word ?? "") + c;
      i++;
    }
  }
  flush();
  return tokens;
}

// ───────────────────────── parser ─────────────────────────

interface SimpleCommand {
  argv: string[];
  redirect?: { mode: ">" | ">>"; target: string };
}
interface Pipeline {
  commands: SimpleCommand[];
  background: boolean;
}
interface Step {
  pipeline: Pipeline;
  /** How this step relates to the previous one. */
  connector: "&&" | "||" | ";";
}

export function parse(tokens: Token[]): Step[] {
  const steps: Step[] = [];
  let connector: Step["connector"] = ";";
  let commands: SimpleCommand[] = [];
  let current: SimpleCommand = { argv: [] };

  const endCommand = () => {
    if (current.argv.length === 0 && !current.redirect) {
      throw new ShellSyntaxError("syntax error near unexpected token");
    }
    commands.push(current);
    current = { argv: [] };
  };
  const endPipeline = (background: boolean) => {
    endCommand();
    steps.push({ pipeline: { commands, background }, connector });
    commands = [];
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind === "word") {
      current.argv.push(t.value);
      continue;
    }
    switch (t.value) {
      case ">":
      case ">>": {
        const target = tokens[i + 1];
        if (!target || target.kind !== "word") throw new ShellSyntaxError("syntax error near unexpected token `newline'");
        current.redirect = { mode: t.value, target: target.value };
        i++;
        break;
      }
      case "|":
        endCommand();
        break;
      case "&":
        endPipeline(true);
        connector = ";";
        break;
      case "&&":
      case "||":
      case ";":
        if (current.argv.length === 0 && commands.length === 0) {
          if (t.value === ";" ) continue; // tolerate stray/trailing semicolons
          throw new ShellSyntaxError(`syntax error near unexpected token \`${t.value}'`);
        }
        endPipeline(false);
        connector = t.value;
        break;
    }
  }
  if (current.argv.length > 0 || commands.length > 0) endPipeline(false);
  return steps;
}

// ───────────────────────── interpreter ─────────────────────────

interface Io {
  stdin: string;
  out: (text: string) => void;
  err: (text: string) => void;
}

interface Session {
  cwd: string;
  env: Record<string, string>;
  clock: number; // ms since execution start
  exited: boolean;
  ctx: ShellContext;
}

type Builtin = (args: string[], io: Io, s: Session) => number;

const isFile = (s: Session, p: string) => Object.hasOwn(s.ctx.disk.files, p);
const isDir = (s: Session, p: string) => s.ctx.disk.dirs.includes(p);

function listDir(s: Session, dir: string): string[] {
  const prefix = dir === "/" ? "/" : dir + "/";
  const names = new Set<string>();
  for (const p of [...Object.keys(s.ctx.disk.files), ...s.ctx.disk.dirs]) {
    if (p !== dir && p.startsWith(prefix)) {
      const rest = p.slice(prefix.length);
      if (rest && !rest.includes("/")) names.add(rest);
    }
  }
  return [...names].sort();
}

function writeFile(s: Session, path: string, content: string, append: boolean, io: Io): boolean {
  if (isDir(s, path)) {
    io.err(`bash: ${path}: Is a directory\n`);
    return false;
  }
  if (!isDir(s, parentOf(path))) {
    io.err(`bash: ${path}: No such file or directory\n`);
    return false;
  }
  s.ctx.disk.files[path] = (append ? (s.ctx.disk.files[path] ?? "") : "") + content;
  return true;
}

function splitFlags(args: string[]): { flags: Set<string>; rest: string[] } {
  const flags = new Set<string>();
  const rest: string[] = [];
  for (const a of args) {
    if (a.startsWith("-") && a.length > 1 && !/^-\d/.test(a)) for (const f of a.slice(1)) flags.add(f);
    else rest.push(a);
  }
  return { flags, rest };
}

function formatUptime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}` : m > 0 ? `${m} min` : `${sec} sec`;
}

function lines(text: string): string[] {
  if (text === "") return [];
  const ls = text.split("\n");
  if (ls[ls.length - 1] === "") ls.pop();
  return ls;
}

const builtins: Record<string, Builtin> = {
  true: () => 0,
  false: () => 1,
  exit: (args, _io, s) => {
    s.exited = true;
    return Number(args[0] ?? 0) & 255;
  },
  echo: (args, io) => {
    const noNewline = args[0] === "-n";
    io.out((noNewline ? args.slice(1) : args).join(" ") + (noNewline ? "" : "\n"));
    return 0;
  },
  printf: (args, io) => {
    if (args.length === 0) return 0;
    const [fmt, ...rest] = args;
    let k = 0;
    const out = fmt
      .replace(/%[sd]/g, () => rest[k++] ?? "")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t");
    io.out(out);
    return 0;
  },
  pwd: (_a, io, s) => {
    io.out(s.cwd + "\n");
    return 0;
  },
  cd: (args, io, s) => {
    const target = resolvePath(s.cwd, args[0] ?? HOME);
    if (!isDir(s, target)) {
      io.err(`bash: cd: ${args[0]}: No such file or directory\n`);
      return 1;
    }
    s.cwd = target;
    s.env.PWD = target;
    return 0;
  },
  whoami: (_a, io) => {
    io.out("root\n");
    return 0;
  },
  hostname: (_a, io, s) => {
    io.out(hostnameFor(s.ctx.facts.machineId) + "\n");
    return 0;
  },
  uname: (args, io, s) => {
    const host = hostnameFor(s.ctx.facts.machineId);
    const all = `Linux ${host} 6.12.0-dcs-sim #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux`;
    const flag = args[0];
    io.out((flag === "-a" ? all : flag === "-r" ? "6.12.0-dcs-sim" : flag === "-m" ? "x86_64" : "Linux") + "\n");
    return 0;
  },
  date: (_a, io, s) => {
    io.out(new Date(s.ctx.now + s.clock).toUTCString().replace("GMT", "UTC") + "\n");
    return 0;
  },
  uptime: (_a, io, s) => {
    const up = s.ctx.now + s.clock - s.ctx.facts.bootedAt;
    const time = new Date(s.ctx.now + s.clock).toISOString().slice(11, 19);
    io.out(` ${time} up ${formatUptime(up)},  1 user,  load average: 0.02, 0.01, 0.00\n`);
    return 0;
  },
  nproc: (_a, io, s) => {
    io.out(`${Math.max(1, Math.floor(s.ctx.facts.vcpu))}\n`);
    return 0;
  },
  free: (_a, io, s) => {
    const total = s.ctx.facts.memoryMib;
    const used = Math.round(48 + s.ctx.memory.procs.length * 12);
    const pad = (v: string | number) => String(v).padStart(12);
    io.out(
      `${"".padEnd(7)}${pad("total")}${pad("used")}${pad("free")}\n` +
        `Mem:   ${pad(total)}${pad(used)}${pad(total - used)}\n` +
        `Swap:  ${pad(0)}${pad(0)}${pad(0)}\n`,
    );
    return 0;
  },
  df: (_a, io, s) => {
    const size = s.ctx.facts.storageGib;
    const usedKb = Object.values(s.ctx.disk.files).reduce((n, f) => n + f.length, 0) / 1024;
    const used = Math.max(0.1, 1.2 + usedKb / 1024 / 1024).toFixed(1);
    io.out(
      "Filesystem      Size  Used Avail Use% Mounted on\n" +
        `/dev/vda        ${String(size).padStart(3)}G  ${used}G  ${(size - Number(used)).toFixed(1)}G  ${Math.round((Number(used) / size) * 100)}% /\n` +
        "tmpfs           64M     0   64M   0% /tmp\n",
    );
    return 0;
  },
  ps: (_a, io, s) => {
    const rows = [
      { pid: 1, command: "/sbin/init" },
      { pid: 42, command: "dcs-agent --exec" },
      ...s.ctx.memory.procs,
      { pid: s.ctx.memory.nextPid + 1, command: "ps" },
    ];
    io.out("  PID CMD\n" + rows.map((r) => `${String(r.pid).padStart(5)} ${r.command}`).join("\n") + "\n");
    return 0;
  },
  env: (_a, io, s) => {
    io.out(Object.entries(s.env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
    return 0;
  },
  sleep: (args, io, s) => {
    const secs = Number(args[0]);
    if (!Number.isFinite(secs) || secs < 0) {
      io.err(`sleep: invalid time interval '${args[0] ?? ""}'\n`);
      return 1;
    }
    s.clock += Math.min(secs, 30) * 1000; // capped so a typo can't hang the demo
    return 0;
  },
  seq: (args, io) => {
    const nums = args.map(Number);
    if (nums.length === 0 || nums.some((n) => !Number.isFinite(n))) {
      io.err("seq: invalid argument\n");
      return 1;
    }
    const [first, last] = nums.length === 1 ? [1, nums[0]] : [nums[0], nums[1]];
    const count = Math.min(Math.max(0, last - first + 1), 2000);
    for (let k = 0; k < count; k++) io.out(`${first + k}\n`);
    return 0;
  },
  ls: (args, io, s) => {
    const { flags, rest } = splitFlags(args);
    const targets = rest.length ? rest : ["."];
    let code = 0;
    for (const t of targets) {
      const p = resolvePath(s.cwd, t);
      if (isFile(s, p)) {
        io.out((flags.has("l") ? `-rw-r--r-- 1 root root ${String(s.ctx.disk.files[p].length).padStart(6)} ${t}` : t) + "\n");
        continue;
      }
      if (!isDir(s, p)) {
        io.err(`ls: cannot access '${t}': No such file or directory\n`);
        code = 2;
        continue;
      }
      let names = listDir(s, p);
      if (!flags.has("a")) names = names.filter((n) => !n.startsWith("."));
      if (flags.has("l")) {
        io.out(
          names
            .map((n) => {
              const child = p === "/" ? `/${n}` : `${p}/${n}`;
              const dir = isDir(s, child);
              const size = dir ? 4096 : s.ctx.disk.files[child].length;
              return `${dir ? "d" : "-"}rw${dir ? "x" : "-"}r-${dir ? "x" : "-"}r-${dir ? "x" : "-"} 1 root root ${String(size).padStart(6)} ${n}`;
            })
            .join("\n") + (names.length ? "\n" : ""),
        );
      } else if (names.length) {
        io.out(names.join("  ") + "\n");
      }
    }
    return code;
  },
  cat: (args, io, s) => {
    if (args.length === 0) {
      io.out(io.stdin);
      return 0;
    }
    let code = 0;
    for (const a of args) {
      const p = resolvePath(s.cwd, a);
      if (isFile(s, p)) io.out(s.ctx.disk.files[p]);
      else {
        io.err(`cat: ${a}: ${isDir(s, p) ? "Is a directory" : "No such file or directory"}\n`);
        code = 1;
      }
    }
    return code;
  },
  touch: (args, io, s) => {
    let code = 0;
    for (const a of args) {
      const p = resolvePath(s.cwd, a);
      if (isFile(s, p) || isDir(s, p)) continue;
      if (!writeFile(s, p, "", false, io)) code = 1;
    }
    return code;
  },
  mkdir: (args, io, s) => {
    const { flags, rest } = splitFlags(args);
    let code = 0;
    for (const a of rest) {
      const p = resolvePath(s.cwd, a);
      if (isDir(s, p)) {
        if (!flags.has("p")) {
          io.err(`mkdir: cannot create directory '${a}': File exists\n`);
          code = 1;
        }
        continue;
      }
      if (!isDir(s, parentOf(p))) {
        if (!flags.has("p")) {
          io.err(`mkdir: cannot create directory '${a}': No such file or directory\n`);
          code = 1;
          continue;
        }
        const segs = p.split("/").filter(Boolean);
        for (let k = 1; k <= segs.length; k++) {
          const sub = "/" + segs.slice(0, k).join("/");
          if (!isDir(s, sub)) s.ctx.disk.dirs.push(sub);
        }
        continue;
      }
      s.ctx.disk.dirs.push(p);
    }
    return code;
  },
  rm: (args, io, s) => {
    const { flags, rest } = splitFlags(args);
    let code = 0;
    for (const a of rest) {
      const p = resolvePath(s.cwd, a);
      if (isFile(s, p)) {
        delete s.ctx.disk.files[p];
      } else if (isDir(s, p)) {
        if (!flags.has("r")) {
          io.err(`rm: cannot remove '${a}': Is a directory\n`);
          code = 1;
          continue;
        }
        if (p === "/") {
          io.err("rm: it is dangerous to operate recursively on '/'\n");
          code = 1;
          continue;
        }
        const prefix = p + "/";
        for (const f of Object.keys(s.ctx.disk.files)) if (f.startsWith(prefix)) delete s.ctx.disk.files[f];
        s.ctx.disk.dirs = s.ctx.disk.dirs.filter((d) => d !== p && !d.startsWith(prefix));
      } else if (!flags.has("f")) {
        io.err(`rm: cannot remove '${a}': No such file or directory\n`);
        code = 1;
      }
    }
    return code;
  },
  head: (args, io) => {
    const n = args[0] === "-n" ? Number(args[1]) : 10;
    io.out(lines(io.stdin).slice(0, n).map((l) => l + "\n").join(""));
    return 0;
  },
  tail: (args, io) => {
    const n = args[0] === "-n" ? Number(args[1]) : 10;
    io.out(lines(io.stdin).slice(-n).map((l) => l + "\n").join(""));
    return 0;
  },
  wc: (args, io) => {
    const ls = lines(io.stdin);
    if (args[0] === "-l") io.out(`${ls.length}\n`);
    else io.out(`${String(ls.length).padStart(7)}${String(io.stdin.split(/\s+/).filter(Boolean).length).padStart(8)}${String(io.stdin.length).padStart(8)}\n`);
    return 0;
  },
  sort: (_a, io) => {
    io.out(lines(io.stdin).sort().map((l) => l + "\n").join(""));
    return 0;
  },
  grep: (args, io) => {
    const pattern = args[0] ?? "";
    const hits = lines(io.stdin).filter((l) => l.includes(pattern));
    io.out(hits.map((l) => l + "\n").join(""));
    return hits.length ? 0 : 1;
  },
};

function runSimple(cmd: SimpleCommand, stdin: string, s: Session, emit: (c: OutputChunk) => void): { code: number; stdout: string } {
  const [name, ...args] = cmd.argv;
  let stdout = "";
  const io: Io = {
    stdin,
    out: (t) => {
      stdout += t;
    },
    err: (t) => emit({ stream: "stderr", text: t, atMs: s.clock }),
  };

  s.clock += 0.4 + s.ctx.rng() * 1.6; // process spawn cost
  let code: number;
  if (!name) {
    code = 0;
  } else if (name === "nohup") {
    return runSimple({ argv: args, redirect: cmd.redirect }, stdin, s, emit);
  } else {
    const fn = builtins[name] ?? builtins[baseName(name)];
    if (!fn) {
      io.err(`bash: ${name}: command not found\n`);
      code = 127;
    } else {
      code = fn(args, io, s);
    }
  }

  if (cmd.redirect) {
    const p = resolvePath(s.cwd, cmd.redirect.target);
    if (!writeFile(s, p, stdout, cmd.redirect.mode === ">>", io)) code = 1;
    stdout = "";
  }
  return { code, stdout };
}

/** Splits text into line chunks so long output streams instead of arriving at once. */
function emitStdout(text: string, s: Session, emit: (c: OutputChunk) => void, perLineMs: number) {
  const parts = text.split(/(?<=\n)/);
  for (const part of parts) {
    if (!part) continue;
    emit({ stream: "stdout", text: part, atMs: s.clock });
    s.clock += perLineMs;
  }
}

/**
 * Runs an execution's argv against a machine. Mutates `ctx.disk` and
 * `ctx.memory` in place (that's the point: it's the machine's state).
 */
export function runExecution(argv: string[], ctx: ShellContext): ShellResult {
  const chunks: OutputChunk[] = [];
  const emit = (c: OutputChunk) => chunks.push(c);
  const s: Session = {
    cwd: ctx.cwd ? resolvePath(HOME, ctx.cwd) : HOME,
    env: { HOME, USER: "root", SHELL: "/bin/bash", PATH: "/usr/local/bin:/usr/bin:/bin", ...ctx.env },
    clock: 0,
    exited: false,
    ctx,
  };
  s.env.PWD = s.cwd;

  if (!isDir(s, s.cwd)) {
    return {
      chunks: [{ stream: "stderr", text: `cwd ${s.cwd}: No such file or directory\n`, atMs: 0 }],
      exitCode: 1,
      durationMs: 1,
    };
  }

  // The API takes argv. `bash -c "<script>"` is how the Dedalus docs run shell
  // snippets, so that's the one path that goes through the parser.
  const isShell = /^(\/bin\/|\/usr\/bin\/)?(ba)?sh$/.test(argv[0] ?? "") && /^-l?c$/.test(argv[1] ?? "");
  let steps: Step[];
  try {
    steps = isShell
      ? parse(tokenize(argv[2] ?? "", s.env))
      : [{ connector: ";", pipeline: { background: false, commands: [{ argv }] } }];
  } catch (e) {
    const msg = e instanceof ShellSyntaxError ? e.message : "parse error";
    return { chunks: [{ stream: "stderr", text: `bash: ${msg}\n`, atMs: 0 }], exitCode: 2, durationMs: 1 };
  }

  let last = 0;
  for (const step of steps) {
    if (s.exited) break;
    if (step.connector === "&&" && last !== 0) continue;
    if (step.connector === "||" && last === 0) continue;

    if (step.pipeline.background) {
      const pid = ctx.memory.nextPid++;
      ctx.memory.procs.push({
        pid,
        command: step.pipeline.commands.map((c) => c.argv.join(" ")).join(" | "),
        startedAt: ctx.now + s.clock,
      });
      emitStdout(`[1] ${pid}\n`, s, emit, 0);
      last = 0;
      continue;
    }

    let stdin = ctx.stdin ?? "";
    let code = 0;
    const cmds = step.pipeline.commands;
    for (let k = 0; k < cmds.length; k++) {
      const res = runSimple(cmds[k], stdin, s, emit);
      code = res.code;
      if (k === cmds.length - 1) {
        // A bare `seq` streams slowly enough to watch; everything else gets a light cadence.
        const perLineMs = cmds[k].argv[0] === "seq" ? 6 + ctx.rng() * 6 : 1.5;
        emitStdout(res.stdout, s, emit, perLineMs);
      } else {
        stdin = res.stdout;
      }
      if (s.exited) break;
    }
    last = code;
  }

  chunks.sort((a, b) => a.atMs - b.atMs);
  return { chunks, exitCode: last, durationMs: Math.max(1, Math.round(s.clock)) };
}
