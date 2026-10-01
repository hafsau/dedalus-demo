"use client";

import { useState } from "react";

const DEFAULT = `// Every action in Workshop is one SDK call.
// Use the machine, and the code for it appears here.`;

export function CodePanel({ code }: { code?: string }) {
  const [copied, setCopied] = useState(false);
  const text = code ?? DEFAULT;

  return (
    <section className="reticle flex flex-col" aria-labelledby="code-title">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h2 id="code-title" className="eyebrow">
          Equivalent code
        </h2>
        <button
          type="button"
          disabled={!code}
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1_200);
          }}
          className="font-mono text-[11px] text-dim hover:text-fg disabled:opacity-0"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="bg-sunken px-4 py-3 font-mono text-[11.5px] leading-relaxed break-all whitespace-pre-wrap text-muted" aria-live="polite">
        <code>{text}</code>
      </pre>
    </section>
  );
}
