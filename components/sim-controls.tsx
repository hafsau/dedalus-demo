"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import {
  getNetworkMode,
  NETWORK_MODES,
  setNetworkMode,
  subscribeNetworkMode,
  type NetworkMode,
} from "@/lib/sim/network";

const serverMode = (): NetworkMode => "normal";

/**
 * The "Simulated" pill: what this is, and controls to try the states a real
 * network produces. The pill shows a non-normal mode, so a deliberately slow
 * app is never mistaken for a broken one.
 */
export function SimControls() {
  const mode = useSyncExternalStore(subscribeNetworkMode, getNetworkMode, serverMode);
  const onConsole = !usePathname().startsWith("/about");
  const degraded = mode !== "normal";

  return (
    <>
      <button
        type="button"
        popoverTarget="sim-explainer"
        className={`ml-1 border px-1.5 py-0.5 font-mono text-[10px] tracking-[0.18em] uppercase ${
          degraded ? "border-warn/60 text-warn hover:bg-warn/10" : "border-accent/40 text-accent hover:bg-accent/10"
        }`}
      >
        {degraded ? (
          <>
            <span className="hidden sm:inline">Simulated · </span>
            {mode}
          </>
        ) : (
          "Simulated"
        )}
      </button>
      <div
        id="sim-explainer"
        popover="auto"
        className="m-0 mt-2 max-w-sm border border-line-strong bg-raised p-4 text-sm leading-relaxed text-muted [inset:auto] [position-area:bottom_span-right] [position-try-fallbacks:flip-block]"
      >
        <p className="text-fg">Everything here runs against a simulated control plane.</p>
        <p className="mt-2">
          It implements the public DCS OpenAPI spec over real HTTP, inside a Service Worker in your browser. Wake latency
          is sampled around Dedalus&apos; published &lt;50ms figure. Nothing here measures their infrastructure.
        </p>

        {onConsole && (
          <fieldset className="mt-4 border-t border-line pt-4">
            <legend className="eyebrow mb-2">Network conditions</legend>
            <div className="flex flex-col gap-1">
              {NETWORK_MODES.map((m) => (
                <label
                  key={m.mode}
                  className="flex cursor-pointer items-baseline gap-2 px-2 py-1 hover:bg-white/[0.03] has-checked:bg-accent/[0.06] has-focus-visible:outline has-focus-visible:outline-accent"
                >
                  <input
                    type="radio"
                    name="network-mode"
                    value={m.mode}
                    checked={mode === m.mode}
                    onChange={() => setNetworkMode(m.mode)}
                    className="accent-[var(--accent)]"
                  />
                  <span className="text-fg">{m.label}</span>
                  <span className="text-xs text-dim">{m.detail}</span>
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-dim">
              Resets when you reload. To see a boot failure: open ⌘K on a sleeping machine and choose &ldquo;Fail the next
              boot&rdquo;.
            </p>
          </fieldset>
        )}

        <p className="mt-4 text-dim">Unofficial concept. Not affiliated with Dedalus Labs.</p>
      </div>
    </>
  );
}
