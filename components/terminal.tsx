"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ExecutionStatus } from "@/lib/api/types";
import { dcs, ApiError } from "@/lib/client/api";
import { availability, hostname } from "@/lib/client/rules";
import { streamExecution } from "@/lib/client/stream";
import type { MachineState } from "@/lib/client/fleet-store";
import { SUPPORTED_COMMANDS } from "@/lib/sim/shell";
import { useFleetStore } from "./providers";

interface Entry {
  id: number;
  command: string;
  cwd: string;
  chunks: Array<{ stream: "stdout" | "stderr" | "meta"; text: string }>;
  status: ExecutionStatus | "sending" | "local";
  exit?: number;
  startedAt: number;
  durationMs?: number;
  woke?: boolean;
}

const HOME = "/root";
const SUGGESTIONS = [
  "whoami && uname -a",
  "echo 'hello from the workshop' > notes.txt",
  "cat notes.txt",
  "seq 1 40",
  "nohup sleep 600 &",
  "ps",
  "echo scratch > /tmp/x && ls /tmp",
];

// Terminal history survives navigating away and back (per tab, in memory).
const sessions = new Map<string, { entries: Entry[]; cwd: string; history: string[] }>();
let seq = 0;

export const FOCUS_TERMINAL_EVENT = "workshop:focus-terminal";

function displayCwd(cwd: string) {
  return cwd === HOME ? "~" : cwd.startsWith(HOME + "/") ? "~" + cwd.slice(HOME.length) : cwd;
}

export function Terminal({ machine }: { machine: MachineState }) {
  const store = useFleetStore();
  const id = machine.item.machine_id;
  const host = hostname(id);
  const saved = sessions.get(id);
  const [entries, setEntries] = useState<Entry[]>(saved?.entries ?? []);
  const [cwd, setCwd] = useState(saved?.cwd ?? HOME);
  const [history, setHistory] = useState<string[]>(saved?.history ?? []);
  const [input, setInput] = useState("");
  const [cursor, setCursor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stickRef = useRef(true);
  const inputId = useId();
  const can = availability("exec", machine.item.phase, machine.item.desired_state);

  useEffect(() => {
    sessions.set(id, { entries, cwd, history });
  }, [id, entries, cwd, history]);

  useEffect(() => () => abortRef.current?.abort(new Error("unmounted")), []);

  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener(FOCUS_TERMINAL_EVENT, focus);
    return () => window.removeEventListener(FOCUS_TERMINAL_EVENT, focus);
  }, []);

  // Follow output unless the user has scrolled up to read.
  useEffect(() => {
    const el = logRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [entries]);

  const update = (entryId: number, fn: (e: Entry) => Entry) =>
    setEntries((all) => all.map((e) => (e.id === entryId ? fn(e) : e)));

  const run = useCallback(
    async (line: string) => {
      const command = line.trim();
      setInput("");
      setCursor(null);
      if (!command) return;
      setHistory((h) => [...h.filter((x) => x !== command), command].slice(-50));

      if (command === "clear") {
        setEntries([]);
        return;
      }
      const entry: Entry = { id: ++seq, command, cwd, chunks: [], status: "sending", startedAt: performance.now() };
      if (command === "help") {
        setEntries((all) => [
          ...all,
          {
            ...entry,
            status: "local",
            chunks: [
              {
                stream: "meta",
                text: `Simulated shell. Supported: ${SUPPORTED_COMMANDS.join(" ")}\nOperators: && || ; | > >> &   ·   Ctrl+C stops streaming · Ctrl+L clears\n`,
              },
            ],
          },
        ]);
        return;
      }

      // Each execution is its own process, so `cd` can't persist server-side.
      // Resolve it remotely and carry the result as `cwd` on the next call.
      const isCd = /^cd(\s|$)/.test(command);
      const script = isCd ? `${command} && pwd` : command;
      setEntries((all) => [...all, entry]);
      setBusy(true);
      stickRef.current = true;

      const client = dcs();
      const controller = new AbortController();
      abortRef.current = controller;
      store.setLastCode(
        id,
        [
          `const exec = await client.machines.executions.create({`,
          `  machine_id: "${id}",`,
          `  command: ["/bin/bash", "-lc", ${JSON.stringify(script)}],${cwd !== HOME ? `\n  cwd: ${JSON.stringify(cwd)},` : ""}`,
          `});`,
          `for await (const event of streamExecution(client, exec.machine_id, exec.execution_id)) render(event);`,
        ].join("\n"),
      );

      try {
        const exec = await client.createExecution(id, {
          command: ["/bin/bash", "-lc", script],
          ...(cwd !== HOME ? { cwd } : {}),
        });
        update(entry.id, (e) => ({ ...e, status: exec.status, woke: exec.status === "wake_in_progress" }));
        store.kick();

        let stdout = "";
        for await (const ev of streamExecution(client, id, exec.execution_id, { signal: controller.signal })) {
          if (ev.type === "lifecycle") {
            update(entry.id, (e) => ({
              ...e,
              status: ev.status ?? e.status,
              woke: e.woke || ev.status === "wake_in_progress",
              ...(ev.exit_code !== undefined ? { exit: ev.exit_code } : {}),
              ...(ev.status && ["succeeded", "failed", "cancelled", "expired"].includes(ev.status)
                ? { durationMs: performance.now() - e.startedAt }
                : {}),
              ...(ev.error_code ? { chunks: [...e.chunks, { stream: "meta" as const, text: `[${ev.error_code}] ${ev.error_message ?? ""}\n` }] } : {}),
            }));
          } else {
            if (ev.type === "stdout") stdout += ev.chunk ?? "";
            if (isCd && ev.type === "stdout") continue; // the pwd is for us, not the user
            update(entry.id, (e) => ({ ...e, chunks: [...e.chunks, { stream: ev.type as "stdout" | "stderr", text: ev.chunk ?? "" }] }));
          }
        }
        if (isCd) {
          const next = stdout.trim().split("\n").at(-1);
          if (next?.startsWith("/")) setCwd(next);
        }
      } catch (err) {
        const text =
          controller.signal.aborted ? "^C\n" : err instanceof ApiError ? `${err.code}: ${err.message}\n` : "request failed\n";
        update(entry.id, (e) => ({
          ...e,
          status: controller.signal.aborted ? "cancelled" : "failed",
          chunks: [...e.chunks, { stream: "meta", text }],
        }));
      } finally {
        abortRef.current = null;
        setBusy(false);
        store.kick();
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    },
    [cwd, id, store],
  );

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!busy) void run(input);
    } else if (e.key === "ArrowUp" && history.length) {
      e.preventDefault();
      const next = cursor === null ? history.length - 1 : Math.max(0, cursor - 1);
      setCursor(next);
      setInput(history[next]);
    } else if (e.key === "ArrowDown" && cursor !== null) {
      e.preventDefault();
      const next = cursor + 1;
      if (next >= history.length) {
        setCursor(null);
        setInput("");
      } else {
        setCursor(next);
        setInput(history[next]);
      }
    } else if (e.ctrlKey && e.key === "c") {
      if (busy) {
        e.preventDefault();
        abortRef.current?.abort(new Error("interrupted"));
      }
    } else if (e.ctrlKey && e.key === "l") {
      e.preventDefault();
      setEntries([]);
    }
  }

  const prompt = (dir: string) => (
    <span className="select-none">
      <span className="text-ok">root@{host}</span>
      <span className="text-dim">:</span>
      <span className="text-sleep">{displayCwd(dir)}</span>
      <span className="text-dim"># </span>
    </span>
  );

  return (
    <section className="reticle flex flex-col" aria-labelledby={`${inputId}-title`}>
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h2 id={`${inputId}-title`} className="eyebrow">
          Executions
        </h2>
        <span className="font-mono text-[11px] text-dim">streamed via streamExecution()</span>
      </div>

      <div
        ref={logRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        onClick={() => {
          if (!window.getSelection()?.toString()) inputRef.current?.focus();
        }}
        className="h-[340px] overflow-y-auto bg-sunken px-4 py-3 font-mono text-[12.5px] leading-[1.6]"
        role="log"
        aria-live="polite"
        aria-label="Command output"
      >
        {entries.length === 0 && (
          <p className="text-dim">
            Run a command on {host}. Each one is a real <span className="text-muted">POST /executions</span> call, with
            output streamed as it arrives. Type <span className="text-muted">help</span> for what the simulated shell
            supports.
          </p>
        )}
        {entries.map((e) => (
          <div key={e.id} className="mb-2">
            <div className="break-all whitespace-pre-wrap">
              {prompt(e.cwd)}
              <span className="text-fg">{e.command}</span>
            </div>
            {e.woke && (
              <div className="text-accent">
                {e.status === "wake_in_progress" ? "⟳ machine was asleep, waking it…" : "✓ woke the machine for this command"}
              </div>
            )}
            {e.chunks.length > 0 && (
              <pre className="font-mono break-words whitespace-pre-wrap">
                {e.chunks.map((c, i) => (
                  <span key={i} className={c.stream === "stderr" ? "text-danger" : c.stream === "meta" ? "text-dim" : "text-muted"}>
                    {c.text}
                  </span>
                ))}
              </pre>
            )}
            {e.status !== "local" && (
              <div className="text-[11px] text-dim">
                {e.durationMs === undefined ? (
                  <span>
                    {e.status === "sending" ? "sending" : e.status.replaceAll("_", " ")}
                    <span className="caret">…</span>
                  </span>
                ) : (
                  <span className={e.exit === 0 ? "" : "text-danger/80"}>
                    {e.status}
                    {e.exit !== undefined ? ` · exit ${e.exit}` : ""} · {Math.round(e.durationMs)}ms
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-0 border-t border-line px-4 py-2.5 font-mono text-[12.5px] transition-colors focus-within:border-accent/50 focus-within:bg-accent/[0.04]">
        <label htmlFor={inputId} className="shrink-0">
          {prompt(cwd)}
          <span className="sr-only">Command</span>
        </label>
        <input
          id={inputId}
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setCursor(null);
          }}
          onKeyDown={onKeyDown}
          disabled={!can.allowed}
          placeholder={can.allowed ? (busy ? "running… (Ctrl+C to stop)" : "type a command") : can.reason}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-fg caret-accent outline-none placeholder:text-dim focus-visible:outline-none disabled:cursor-not-allowed"
        />
      </div>

      <div className="flex flex-wrap gap-1.5 border-t border-line px-4 py-3">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy || !can.allowed}
            onClick={() => void run(s)}
            className="border border-line px-2 py-1 font-mono text-[11px] text-dim hover:border-line-strong hover:text-fg disabled:opacity-40"
          >
            {s}
          </button>
        ))}
      </div>
    </section>
  );
}
