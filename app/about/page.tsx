import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SpringVsTween } from "@/components/spring-vs-tween";

export const metadata: Metadata = {
  title: "Case study",
  description: "How Workshop was built: the user's problem, one investigation, what failed, and who did what.",
};

function Section({ eyebrow, title, children, id }: { eyebrow: string; title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="grid scroll-mt-20 gap-6 border-t border-line py-14 md:grid-cols-[220px_minmax(0,1fr)]">
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-line pt-3 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-4">
      <dt className="eyebrow pt-1">{label}</dt>
      <dd className="text-sm leading-relaxed text-muted">{children}</dd>
    </div>
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
          That was the question in the recruiter&apos;s email. Workshop is a fast prototype of my answer: a control room
          for <span className="text-fg">Dedalus Machines</span>, built in a week against a simulated control plane that
          follows Dedalus&apos; public API spec. I built it with Claude Code as a pair;{" "}
          <a href="#ownership" className="text-fg underline underline-offset-4 hover:text-accent">
            here&apos;s who did what
          </a>
          .
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

      <Section eyebrow="01 · The user's problem" title="People can't tell what their agents' computers are doing">
        <P>
          Machines are built for agents, but the people responsible for those agents still have to answer simple
          questions: is it awake? Why did that fail? What is it costing? Can I do this now? I read the docs, the OpenAPI
          spec and the pricing page, and four gaps stood out:
        </P>
        <ul className="flex flex-col gap-4">
          <Item title="“<50ms” is a claim, not an experience.">
            Nothing in the product lets a developer see a machine wake. The number only lives in copy.
          </Item>
          <Item title="The quickstart asks you to write a polling loop.">
            Every developer hand-writes <Code>while status not in done: sleep(retry_after_ms)</Code> before they see any
            output.
          </Item>
          <Item title="The API is strict, but nothing tells you up front.">
            Sleep only from running, wake only from sleeping; everything else is <Code>409 INVALID_STATE</Code>. A UI
            should prevent that error, not report it.
          </Item>
          <Item title="Failure and recovery are left to the developer.">
            When a boot fails, a request times out or a reply is lost, the developer has to work out what state the
            machine is really in.
          </Item>
        </ul>
      </Section>

      <Section eyebrow="02 · Principles" title="Five rules I designed against">
        <ul className="flex flex-col gap-4">
          <Item title="Never show a status that might be false.">
            If the control plane can&apos;t be reached, statuses are marked &ldquo;last known&rdquo; with their age. If you
            stop watching a command, the terminal says it may still be running, rather than &ldquo;cancelled&rdquo;. After
            a lost reply, the app says it&apos;s checking, not that nothing changed.
          </Item>
          <Item title="Always say what to do next.">
            A failed machine explains what happened and offers &ldquo;Destroy&rdquo; and &ldquo;Create a new
            machine&rdquo;. Disabled buttons say why they&apos;re disabled, in the button and in ⌘K.
          </Item>
          <Item title="Make speed felt.">
            Wake a machine and a stopwatch runs next to a 2.5s sandbox start bar, on one linear scale.
          </Item>
          <Item title="Every click teaches the API.">Each action shows the SDK call it made.</Item>
          <Item title="Motion only where it explains something.">
            The lifecycle ring moves on a spring because phase updates arrive faster than a tween can finish. Page-wide
            slide transitions were removed: they delayed every navigation by about 360ms and explained nothing.
          </Item>
        </ul>
      </Section>

      <Section eyebrow="03 · Motion" title="Why the ring uses a spring">
        <P>
          During a create, phase updates arrive about every 20–150ms. A tween restarts from zero velocity on every update,
          so it stutters and arrives late. A spring keeps its momentum and re-aims. The ring uses exactly the spring below,
          and reduced-motion settings turn it into a jump.
        </P>
        <SpringVsTween />
      </Section>

      <Section eyebrow="04 · How it's built" title="One client, two backends">
        <P>
          Types are generated from Dedalus&apos; published OpenAPI spec, and CI fails if they drift. The app calls{" "}
          <Code>/dcs/v1/*</Code> over real HTTP. In this demo a Service Worker answers those calls with a simulated control
          plane, so each visitor gets an isolated fleet. With an API key, a server route would forward the same calls to
          the real API.
        </P>
        <Architecture />
        <ul className="flex flex-col gap-4">
          <Item title="The simulator follows the spec, not my guesses.">
            It has nine lifecycle phases, desired vs observed state, both of the spec&apos;s error formats,{" "}
            <Code>Idempotency-Key</Code> replay, autosleep, reboot, and <Code>wake_in_progress</Code> for executions on a
            sleeping machine. Files survive sleep; RAM, processes and <Code>/tmp</Code> don&apos;t. Its state is a pure
            function of a snapshot and the time, so tests can jump an hour in a millisecond.
          </Item>
          <Item title="You can try the network going wrong.">
            The <span className="text-fg">Simulated</span> pill in the header switches between normal, slow, flaky and
            offline networks. Flaky drops some requests, and some replies <em>after</em> the work is done. That case is why
            every mutation carries an idempotency key and a retry can&apos;t create two machines.
          </Item>
          <Item title="streamExecution(): the helper I’d add to the SDK.">
            An async iterator over execution events. It pages by cursor, uses the server&apos;s{" "}
            <Code>retry_after_ms</Code>, backs off when idle, and stops on a terminal event.
          </Item>
          <Item title="Performance, measured before changing.">
            Console LCP went from 4.7s to 1.7s by server-rendering the empty state. One attempt (booting on idle) was
            measured, made boot take ~5s, and was reverted.
          </Item>
        </ul>
      </Section>

      <Section eyebrow="05 · Investigation" title="It passed every test, then broke on the live site">
        <dl className="flex flex-col gap-3">
          <Field label="Symptom">
            Right after deploying, creating a machine worked, but every action after it failed. The terminal showed{" "}
            <Code>404: HTTP 404</Code> and Sleep did nothing.
          </Field>
          <Field label="First explanation">
            Some routes weren&apos;t matched by the simulator&apos;s handlers, since creating a machine still worked.
          </Field>
          <Field label="Evidence that changed it">
            I probed every endpoint from the page. <em>All</em> of them, including the list call that had worked a
            minute earlier, returned Vercel&apos;s HTML 404 with an <Code>x-vercel-id</Code> header. So this wasn&apos;t
            routing: interception had stopped entirely. The Service Worker was still registered and
            &ldquo;activated&rdquo;, and the tab was hidden. Reading the worker&apos;s source showed it keeps its list of
            mocked tabs in an in-memory <Code>Set</Code>. Browsers stop idle workers, and a restarted worker has an empty
            list, so it passes every request through to the network.
          </Field>
          <Field label="Fix">
            Every simulator response now carries an <Code>x-workshop-sim</Code> header. A response without it means it
            skipped the simulator, so the client re-sends the worker&apos;s activation message, waits for confirmation and
            retries once. The retry is safe: the stray request only hit a static 404. I rejected MSW&apos;s public
            stop/start, because stopping makes the worker unregister itself when it&apos;s the only tab.
          </Field>
          <Field label="How I established it">
            A Playwright test stops the worker through the DevTools protocol mid-session, then checks that sleep and exec
            still work. I confirmed the test fails without the fix, then reran the same scenario against the live URL.
          </Field>
          <Field label="Who it affected">
            Anyone who left the demo in a background tab for a while, which is exactly how a recruiter opens a link.
          </Field>
          <Field label="Limitations">
            The fix relies on MSW&apos;s internal message protocol (a test pins the worker version to the library
            version). It retries once. A hard refresh, which bypasses Service Workers, isn&apos;t handled.
          </Field>
        </dl>
      </Section>

      <Section eyebrow="06 · What failed" title="Other things I got wrong, and what I changed">
        <ul className="flex flex-col gap-4">
          <Item title="The terminal said “cancelled” when nothing was cancelled.">
            Ctrl+C only stopped the stream; the command kept running on the machine. The API has no documented cancel for
            executions, so the terminal now says &ldquo;stopped watching, may still be running&rdquo; and offers
            &ldquo;check status&rdquo;, which reports what really happened.
          </Item>
          <Item title="On a slow network, actions looked ignored.">
            A pending action only greyed out the buttons. A new slow-network test caught it, and the pressed button now
            says &ldquo;Sleeping…&rdquo; until the change lands.
          </Item>
          <Item title="My first engine let you sleep a machine mid-wake.">
            Then I read the 409 examples in the spec: the real API is strict. I rebuilt the rules to match and moved the
            forgiveness into the UI.
          </Item>
          <Item title="I assumed one error format. There are two.">
            401/403/409/429/503 return <Code>{"{ error_code, message, retryable }"}</Code>; everything else is RFC 7807
            problem+json.
          </Item>
          <Item title="A dependency was overwriting my Service Worker.">
            Vitest ships its own MSW 2, whose install hook replaced my v3 worker on every <Code>npm install</Code>. A test
            now fails if the versions drift.
          </Item>
        </ul>
      </Section>

      <Section eyebrow="07 · API questions" title="What I'd ask the backend team">
        <P>Building against the spec surfaced a few places where the contract is unclear to someone building a UI:</P>
        <ul className="flex flex-col gap-4">
          <Item title="Does deleting an execution stop it?">
            The spec has <Code>DELETE /executions/{"{id}"}</Code> but doesn&apos;t say whether it cancels a running
            command. A Stop button can&apos;t promise anything until it does.
          </Item>
          <Item title="When was a wake accepted?">
            Lifecycle responses carry no timestamp, so a client can only time a wake from its own click, including the
            network round trip. An <Code>accepted_at</Code> would let the UI show control-plane time.
          </Item>
          <Item title="When will this machine autosleep?">
            There&apos;s no last-activity or autosleep-deadline field, so a UI can&apos;t show &ldquo;sleeping in
            12s&rdquo;. Machines just fall asleep without warning.
          </Item>
          <Item title="Per second, or per hour?">
            The pricing page labels rates &ldquo;per second&rdquo;, but its own FAQ arithmetic only works hourly.
          </Item>
        </ul>
      </Section>

      <Section eyebrow="08 · Testing & shipping" title="How I know it works">
        <ul className="grid gap-3 font-mono text-sm sm:grid-cols-2">
          {[
            ["Engine", "lifecycle, strict state rules, autosleep, persistence, limits"],
            ["Contract", "typed client → HTTP → handlers → engine, both error shapes, idempotency"],
            ["Network", "lost requests, lost replies, timeouts, offline; retries never repeat work"],
            ["States", "offline banner, last-known statuses, slow pending, stop watching, failed machine"],
            ["Resilience", "the Service Worker is killed mid-session and the app recovers"],
            ["Accessibility", "axe audits of every page; reduced motion; phone widths"],
          ].map(([k, v]) => (
            <li key={k} className="border border-line p-3">
              <span className="text-fg">{k}</span>
              <span className="mt-1 block text-xs text-dim">{v}</span>
            </li>
          ))}
        </ul>
        <P>
          GitHub Actions runs typecheck, lint, unit, contract and end-to-end tests, plus Lighthouse budgets, on every push.
          It also checks that the generated API types still match the spec. Before trusting a regression test, I check
          that it fails without its fix.
        </P>
      </Section>

      <Section id="ownership" eyebrow="09 · Ownership" title="What I owned, what I reused, where AI helped">
        <ul className="flex flex-col gap-4">
          <Item title="I owned the direction and the judgment calls.">
            What to build and for whom; simulating rather than paying for access; holding the simulator to the spec; the
            principles above; which fixes to keep or revert after measuring; and how the work is presented, including
            its limits.
          </Item>
          <Item title="Claude Code wrote much of the code and drafted much of the writing.">
            I worked with it as a pair: it proposed designs and implementations, I reviewed them, asked for changes, and
            checked behavior with the tests and measurements on this page. I can walk through any part of it.
          </Item>
          <Item title="I reused, rather than built:">
            Next.js, React, Tailwind, Motion, MSW, openapi-typescript and openapi-fetch, cmdk, Playwright, axe and
            Lighthouse CI. Dedalus&apos; public OpenAPI spec and published numbers define the simulator&apos;s
            behavior.
          </Item>
        </ul>
      </Section>

      <Section eyebrow="10 · Limits" title="What this prototype isn't">
        <ul className="flex flex-col gap-4">
          <Item title="It hasn't been tested with users.">
            It&apos;s a fast prototype. The first thing I&apos;d test is whether people read the ring&apos;s dot and
            dashed target as &ldquo;where it is&rdquo; and &ldquo;where it&apos;s going&rdquo; without being told.
          </Item>
          <Item title="It runs on a simulator.">
            Timings and costs are modeled on published figures. Nothing here measures Dedalus&apos; infrastructure.
          </Item>
        </ul>
      </Section>

      <Section eyebrow="11 · Next" title="What I'd want to build at Dedalus">
        <ul className="flex flex-col gap-4">
          <Item title="Accurate states across the console">
            Loading, progress, cancellation, failure and recovery that always tell the truth, backed by API fields that
            make the truth knowable.
          </Item>
          <Item title="executions.stream() in every SDK">Server-sent events from the API, so nobody writes a polling loop again.</Item>
          <Item title="Real wake telemetry in the dashboard">p50/p95 per org, so the &lt;50ms claim is something customers see for themselves.</Item>
          <Item title="An agent flight recorder">A machine&apos;s executions, lifecycle and cost on one replayable timeline.</Item>
        </ul>
      </Section>

      <p className="border-t border-line pt-8 text-xs leading-relaxed text-dim">
        Unofficial concept. Not affiliated with Dedalus Labs. All latency and cost figures in the console are simulated
        from published numbers. Nothing here measures Dedalus&apos; infrastructure.
      </p>
    </article>
  );
}
