import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SpringVsTween } from "@/components/spring-vs-tween";

export const metadata: Metadata = {
  title: "Case study",
  description: "How Workshop was designed, built, tested and shipped, including what failed.",
};

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section className="grid gap-6 border-t border-line py-14 md:grid-cols-[220px_minmax(0,1fr)]">
      <div>
        <p className="eyebrow md:sticky md:top-24">{eyebrow}</p>
      </div>
      <div className="flex max-w-[68ch] flex-col gap-5">
        <h2 className="text-xl tracking-tight text-fg">{title}</h2>
        {children}
      </div>
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="leading-relaxed text-muted">{children}</p>;
}

function Item({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="border-l border-line-strong pl-4">
      <p className="text-fg">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">{children}</p>
    </li>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="bg-sunken px-1 py-0.5 font-mono text-[0.85em] text-fg">{children}</code>;
}

function Architecture() {
  const box = (x: number, y: number, w: number, h: number, title: string, sub: string, accent = false) => (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={accent ? "color-mix(in oklab, var(--accent) 10%, var(--bg-raised))" : "var(--bg-raised)"} stroke={accent ? "var(--accent)" : "var(--line-strong)"} />
      <text x={x + 14} y={y + 24} fill="var(--fg)" fontSize="13">
        {title}
      </text>
      <text x={x + 14} y={y + 42} fill="var(--fg-dim)" fontSize="10.5" fontFamily="var(--font-geist-mono)">
        {sub}
      </text>
    </g>
  );
  const arrow = (x1: number, y1: number, x2: number, y2: number, label: string, dashed = false) => (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--fg-dim)" strokeDasharray={dashed ? "4 4" : undefined} markerEnd="url(#arrow)" />
      <text x={(x1 + x2) / 2 + 8} y={(y1 + y2) / 2 + 4} fill="var(--fg-dim)" fontSize="10" fontFamily="var(--font-geist-mono)">
        {label}
      </text>
    </g>
  );
  return (
    <figure className="m-0">
      <svg viewBox="0 0 640 400" className="w-full" role="img" aria-labelledby="arch-title arch-desc">
        <title id="arch-title">Workshop architecture</title>
        <desc id="arch-desc">
          The React UI calls a typed client generated from the DCS OpenAPI spec. Requests go over HTTP to /dcs, answered in
          the demo by a Service Worker running the simulated control plane. In production the same path would go to a
          server route holding the API key, which forwards to dcs.dedaluslabs.ai.
        </desc>
        <defs>
          <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 L8 4 L0 8 z" fill="var(--fg-dim)" />
          </marker>
        </defs>
        <text x="20" y="22" fill="var(--fg-dim)" fontSize="10" letterSpacing="2" fontFamily="var(--font-geist-mono)">
          BROWSER
        </text>
        <rect x="10" y="32" width="620" height="226" fill="none" stroke="var(--line)" strokeDasharray="2 4" />
        {box(30, 50, 250, 58, "React UI", "fleet · ring · terminal · ⌘K")}
        {box(30, 170, 250, 58, "Typed DCS client", "openapi-fetch + streamExecution()")}
        {arrow(155, 108, 155, 168, "FleetStore polls 16ms→1s")}
        {box(360, 170, 250, 58, "Service Worker (MSW)", "implements /v1/* from the spec", true)}
        {box(360, 50, 250, 58, "SimEngine", "seeded · time-derived · pure")}
        {arrow(282, 199, 358, 199, "HTTP")}
        {arrow(485, 168, 485, 110, "")}
        <text x="20" y="292" fill="var(--fg-dim)" fontSize="10" letterSpacing="2" fontFamily="var(--font-geist-mono)">
          PRODUCTION (SAME CLIENT, DIFFERENT BASE URL)
        </text>
        {box(30, 310, 250, 58, "Server route /dcs/*", "holds DEDALUS_API_KEY")}
        {box(360, 310, 250, 58, "dcs.dedaluslabs.ai", "the real control plane")}
        {arrow(155, 230, 155, 308, "", true)}
        {arrow(282, 339, 358, 339, "HTTPS")}
      </svg>
    </figure>
  );
}

export default function AboutPage() {
  return (
    <article>
      <header className="pt-6 pb-14">
        <p className="eyebrow">Case study · Hafsa Usmani</p>
        <h1 className="mt-4 max-w-3xl text-4xl leading-[1.1] tracking-tight text-fg md:text-5xl">
          Could you make AI infrastructure feel effortless?
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
          That was the question in the recruiter&apos;s email. Workshop is my answer: a control room for{" "}
          <span className="text-fg">Dedalus Machines</span>, which I designed, built, tested and shipped myself. It runs
          against a simulated control plane that follows Dedalus&apos; public API spec.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/"
            className="bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-shadow hover:shadow-[0_0_24px_var(--accent-glow)]"
          >
            Open the console →
          </Link>
          <a href="https://github.com/hafsau/dedalus-demo" className="border border-line-strong px-4 py-2 text-sm text-fg hover:border-accent">
            Read the source
          </a>
        </div>
      </header>

      <Section eyebrow="01 · What I noticed" title="The product is fast. Nothing lets you feel it.">
        <P>
          Dedalus moved from an MCP gateway to persistent VMs for agents. The headline is a sub-50ms wake. I read the
          docs, the OpenAPI spec and the pricing page, and four gaps stood out:
        </P>
        <ul className="flex flex-col gap-4">
          <Item title="“<50ms” is a claim, not an experience.">
            Nothing in the product lets a developer see a machine wake. The number only lives in copy.
          </Item>
          <Item title="The quickstart asks you to write a polling loop.">
            Every developer hand-writes{" "}
            <Code>while status not in done: sleep(retry_after_ms)</Code> before they see any output.
          </Item>
          <Item title="The API is strict, but nothing tells you up front.">
            Sleep only from running, wake only from sleeping; everything else is <Code>409 INVALID_STATE</Code>. A UI
            should prevent that error, not report it.
          </Item>
          <Item title="Machines are built for agents, but people still have to watch them.">
            The docs say Machines don&apos;t need a dashboard. Agents don&apos;t. The people responsible for those
            agents&apos; computers do.
          </Item>
        </ul>
      </Section>

      <Section eyebrow="02 · Principles" title="Five rules I designed against">
        <ul className="flex flex-col gap-4">
          <Item title="Make speed felt.">
            Wake a machine and a stopwatch runs next to a 2.5s sandbox start bar, on one linear scale. The difference
            doesn&apos;t need explaining.
          </Item>
          <Item title="Show declarative state.">
            The lifecycle ring shows the observed phase as a dot and the desired state as a dashed target. You can watch the
            control plane reconcile.
          </Item>
          <Item title="Every click teaches the API.">
            Each action shows the SDK call it made. The UI is a tutorial for the API it drives.
          </Item>
          <Item title="Disable, don&apos;t error.">
            The state rules from the spec&apos;s 409 examples are mirrored in the client. Invalid actions are disabled
            and say why, in the buttons and in ⌘K.
          </Item>
          <Item title="Springs for state, tweens for time.">
            Anything that represents state moves on a spring. The 2.5s reference bar is a linear tween, because it
            represents elapsed time.
          </Item>
        </ul>
      </Section>

      <Section eyebrow="03 · Motion" title="Why a spring beats a tween here">
        <P>
          During a create, phase updates arrive about every 20–150ms. That&apos;s faster than a typical 400ms tween can
          finish. A tween restarts from zero velocity on every update; a spring keeps its momentum. The lifecycle ring uses
          exactly the spring below.
        </P>
        <SpringVsTween />
      </Section>

      <Section eyebrow="04 · Implementation" title="One client, two backends">
        <P>
          Types are generated from Dedalus&apos; published OpenAPI spec, and CI fails if they drift. The app calls{" "}
          <Code>/dcs/v1/*</Code> over real HTTP. In this demo a Service Worker answers those calls with a simulated control
          plane, so each visitor gets an isolated fleet and the demo can&apos;t go down. With a key, a server route would
          forward the same calls to the real API.
        </P>
        <Architecture />
        <ul className="flex flex-col gap-4">
          <Item title="The simulator follows the spec, not my guesses.">
            It has nine lifecycle phases, desired vs observed state, both of the spec&apos;s error formats,{" "}
            <Code>Idempotency-Key</Code> replay, autosleep, reboot, and <Code>wake_in_progress</Code> for executions on a
            sleeping machine. It also follows the documented persistence rules: files survive sleep; RAM, processes
            and <Code>/tmp</Code> don&apos;t.
          </Item>
          <Item title="streamExecution(): the helper I’d add to the SDK.">
            An async iterator over execution events. It pages by cursor, uses the server&apos;s{" "}
            <Code>retry_after_ms</Code>, backs off when idle, and stops on a terminal event. It replaces the polling loop
            from the quickstart.
          </Item>
          <Item title="Performance.">
            The simulator and MSW load lazily, only on console routes. This page is a static server component. Motion
            is transform-only, and everything respects <Code>prefers-reduced-motion</Code>.
          </Item>
        </ul>
      </Section>

      <Section eyebrow="05 · Testing & shipping" title="Proof it works">
        <ul className="grid gap-3 font-mono text-sm sm:grid-cols-2">
          {[
            ["Engine", "lifecycle, reconciliation, autosleep, persistence, limits"],
            ["Contract", "typed client → HTTP → handlers → engine, both error shapes, idempotency"],
            ["Streaming", "cursor paging, retry hints, auto-wake, abort"],
            ["Cost", "checked against the pricing page's own FAQ and calculator"],
            ["End-to-end", "Playwright drives the real browser + Service Worker"],
            ["Accessibility", "axe checks on every page in CI"],
          ].map(([k, v]) => (
            <li key={k} className="border border-line p-3">
              <span className="text-fg">{k}</span>
              <span className="mt-1 block text-xs text-dim">{v}</span>
            </li>
          ))}
        </ul>
        <P>
          GitHub Actions runs typecheck, lint, unit, contract and end-to-end tests on every push. It also checks that the
          generated API types still match the spec.
        </P>
      </Section>

      <Section eyebrow="06 · What failed" title="What I got wrong, and what I changed">
        <ul className="flex flex-col gap-4">
          <Item title="My first engine let you sleep a machine mid-wake.">
            I&apos;d built a forgiving reconciler. Then I read the 409 examples in the spec: the real API is strict. I
            rebuilt the rules to match, and moved the &ldquo;forgiveness&rdquo; into the UI. Actions are disabled with a
            reason instead.
          </Item>
          <Item title="I assumed one error format. There are two.">
            401/403/409/429/503 return <Code>{"{ error_code, message, retryable }"}</Code>; everything else is RFC 7807
            problem+json. The client now handles both.
          </Item>
          <Item title="A server-side simulator would have flaked on serverless hosting.">
            Serverless instances don&apos;t share memory. Moving the control plane into a Service Worker fixed that,
            and gave every visitor an isolated fleet.
          </Item>
          <Item title="A dependency was overwriting my Service Worker.">
            Vitest ships its own MSW 2. Its install hook quietly replaced my v3 worker on every <Code>npm install</Code>.
            I removed the config it keyed on, and a test now fails if the versions ever drift.
          </Item>
          <Item title="I mislabeled a number.">
            My wake timer said &ldquo;control plane&rdquo;, but it starts at the click, so it includes the API round trip. I
            renamed it rather than adjust the number.
          </Item>
        </ul>
      </Section>

      <Section eyebrow="07 · Hardest problem" title="A simulation that is time-based and deterministic">
        <P>
          Machines change on their own. They finish booting, autosleep after idle, and executions emit output over
          time. But tests need to be exact, and a reload shouldn&apos;t lose anything. So the engine has no timers. Its
          state is a pure function of a snapshot and <Code>now</Code>. Every read replays scheduled transitions in
          chronological order, across a machine and its executions. That&apos;s why a machine you left idle is asleep when
          you come back, and why tests can jump an hour in a millisecond.
        </P>
      </Section>

      <Section eyebrow="08 · Next" title="What I'd want to build at Dedalus">
        <ul className="flex flex-col gap-4">
          <Item title="executions.stream() in every SDK">Server-sent events from the API, so nobody writes a polling loop again.</Item>
          <Item title="Real wake telemetry in the dashboard">p50/p95 per org, so the &lt;50ms claim is something customers see for themselves.</Item>
          <Item title="An interactive quickstart">Boot a machine from the docs page and watch it wake. The fastest way to sell speed is to show it.</Item>
          <Item title="An agent flight recorder">A machine&apos;s executions, lifecycle and cost on one replayable timeline. It answers &ldquo;what did my agent do on its computer?&rdquo;</Item>
        </ul>
      </Section>

      <p className="border-t border-line pt-8 text-xs leading-relaxed text-dim">
        Unofficial concept. Not affiliated with Dedalus Labs. All latency and cost figures in the console are simulated
        from published numbers. Nothing here measures Dedalus&apos; infrastructure.
      </p>
    </article>
  );
}
