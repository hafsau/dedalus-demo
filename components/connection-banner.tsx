"use client";

import { useEffect, useState } from "react";
import { useFleet } from "./providers";

function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

/**
 * Shown on every console page while the control plane is unreachable, so
 * nobody mistakes the last known state for the live one.
 */
export function ConnectionBanner() {
  const { error, lastOkAt } = useFleet();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!error) return;
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, [error]);

  if (!error) return null;
  return (
    <div role="status" className="border border-warn/40 bg-warn/[0.06] px-4 py-3 text-sm text-fg">
      <p>
        <span className="font-medium text-warn">Can&apos;t reach the control plane.</span>{" "}
        {lastOkAt
          ? `Statuses below are the last known, from ${ago(now - lastOkAt)} ago.`
          : "Nothing has loaded yet."}{" "}
        Retrying automatically.
      </p>
    </div>
  );
}
