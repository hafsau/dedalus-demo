"use client";

import { usePathname } from "next/navigation";

export const OPEN_PALETTE_EVENT = "workshop:open-palette";

export function PaletteButton() {
  // The palette drives the console; on static pages there's nothing to command.
  if (usePathname().startsWith("/about")) return null;
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
      className="ml-2 flex items-center gap-2 border border-line px-2 py-1 font-mono text-xs text-dim hover:border-line-strong hover:text-fg"
      aria-label="Open command palette"
      aria-keyshortcuts="Meta+K Control+K"
    >
      <span>⌘K</span>
    </button>
  );
}
