import Link from "next/link";
import { PaletteButton } from "./palette-button";
import { SimControls } from "./sim-controls";

function Mark() {
  // A reticle with a single live point: the machine.
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M1 5V1h4M13 1h4v4M17 13v4h-4M5 17H1v-4" stroke="currentColor" strokeWidth="1.2" />
      <rect x="7" y="7" width="4" height="4" fill="var(--accent)" />
    </svg>
  );
}

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2.5 text-fg" aria-label="Workshop: fleet">
          <Mark />
          <span className="text-sm font-medium tracking-tight">Workshop</span>
          <span className="hidden text-sm text-dim sm:inline">for Dedalus Machines</span>
        </Link>

        <SimControls />

        <nav className="ml-auto flex items-center gap-1 text-sm">
          <Link href="/" className="px-2 py-1 text-muted hover:text-fg">
            Fleet
          </Link>
          <Link href="/about" className="px-2 py-1 text-muted hover:text-fg">
            About
          </Link>
          <PaletteButton />
        </nav>
      </div>
    </header>
  );
}
