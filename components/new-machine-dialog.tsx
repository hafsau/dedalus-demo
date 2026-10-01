"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { computeRatePerHour, formatUsd } from "@/lib/cost";
import { useFleetStore } from "./providers";

const SIZES = [
  { key: "small", label: "Small", vcpu: 1, memory_mib: 2048, note: "Agents, scripts" },
  { key: "standard", label: "Standard", vcpu: 1, memory_mib: 4096, note: "API default" },
  { key: "large", label: "Large", vcpu: 4, memory_mib: 16_384, note: "Hobby max" },
] as const;

const AUTOSLEEP = [
  { value: "30s", label: "30s", note: "watch it happen" },
  { value: "5m", label: "5m", note: "API default" },
  { value: "never", label: "never", note: "always on" },
] as const;

export const OPEN_CREATE_EVENT = "workshop:new-machine";

// A click can land before the simulator (and this dialog) has mounted.
// Remember it, and open as soon as the dialog exists.
let pendingOpen = false;
export function requestCreate() {
  pendingOpen = true;
  window.dispatchEvent(new Event(OPEN_CREATE_EVENT));
}

export function NewMachineDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const store = useFleetStore();
  const router = useRouter();
  const [size, setSize] = useState<(typeof SIZES)[number]["key"]>("standard");
  const [autosleep, setAutosleep] = useState<string>("30s");
  const [busy, setBusy] = useState(false);
  const titleId = useId();

  useEffect(() => {
    const open = () => {
      pendingOpen = false;
      if (!ref.current?.open) ref.current?.showModal();
    };
    if (pendingOpen) open();
    window.addEventListener(OPEN_CREATE_EVENT, open);
    return () => window.removeEventListener(OPEN_CREATE_EVENT, open);
  }, []);

  const chosen = SIZES.find((s) => s.key === size)!;
  const body = { vcpu: chosen.vcpu, memory_mib: chosen.memory_mib, storage_gib: 10, autosleep };
  const hourly = computeRatePerHour(body);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const id = await store.create(body);
    setBusy(false);
    if (id) {
      ref.current?.close();
      router.push(`/machines/${id}`, { transitionTypes: ["nav-forward"] });
    }
  }

  return (
    <dialog ref={ref} className="sheet" aria-labelledby={titleId} closedby="any">
      <form onSubmit={submit} className="flex flex-col gap-6 p-6">
        <div>
          <p className="eyebrow">New machine</p>
          <h2 id={titleId} className="mt-2 text-lg text-fg">
            Boot a persistent Linux machine
          </h2>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="eyebrow mb-2">Size</legend>
          <div className="grid grid-cols-3 gap-2">
            {SIZES.map((s) => (
              <label
                key={s.key}
                className="cursor-pointer border border-line p-3 text-left transition-colors hover:border-line-strong has-checked:border-accent has-checked:bg-accent/5 has-focus-visible:outline has-focus-visible:outline-accent"
              >
                <input
                  type="radio"
                  name="size"
                  value={s.key}
                  checked={size === s.key}
                  onChange={() => setSize(s.key)}
                  className="sr-only"
                />
                <span className="block text-sm text-fg">{s.label}</span>
                <span className="mt-1 block font-mono text-[11px] text-dim">
                  {s.vcpu} vCPU · {s.memory_mib / 1024} GiB
                </span>
                <span className="mt-2 block text-[11px] text-dim">{s.note}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="eyebrow mb-2">Autosleep after idle</legend>
          <div className="flex gap-2">
            {AUTOSLEEP.map((a) => (
              <label
                key={a.value}
                className="flex-1 cursor-pointer border border-line px-3 py-2 transition-colors hover:border-line-strong has-checked:border-accent has-checked:bg-accent/5 has-focus-visible:outline has-focus-visible:outline-accent"
              >
                <input
                  type="radio"
                  name="autosleep"
                  value={a.value}
                  checked={autosleep === a.value}
                  onChange={() => setAutosleep(a.value)}
                  className="sr-only"
                />
                <span className="block font-mono text-sm text-fg">{a.label}</span>
                <span className="block text-[11px] text-dim">{a.note}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="border border-line bg-sunken p-3 font-mono text-[11px] leading-relaxed text-muted" aria-label="Equivalent SDK call">
          <span className="text-dim">{"// equivalent call"}</span>
          <br />
          <span className="text-accent">await</span> client.machines.create({"{"} vcpu: {body.vcpu}, memory_mib: {body.memory_mib}, autosleep: &quot;{autosleep}&quot; {"}"});
        </div>

        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-dim">
            <span className="tabular text-fg">{formatUsd(hourly, 4)}/hr</span> while running. Storage only while asleep.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className="px-3 py-2 text-sm text-muted hover:text-fg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="whitespace-nowrap bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-[filter,box-shadow] hover:shadow-[0_0_24px_var(--accent-glow)] disabled:opacity-60"
            >
              {busy ? "Creating…" : "Create machine"}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
