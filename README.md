# Workshop

[![CI](https://github.com/hafsau/dedalus-demo/actions/workflows/ci.yml/badge.svg)](https://github.com/hafsau/dedalus-demo/actions/workflows/ci.yml)

**▶ Live: [dedalus-demo-delta.vercel.app](https://dedalus-demo-delta.vercel.app)** · [Case study](https://dedalus-demo-delta.vercel.app/about)

**A control room for Dedalus Machines.** It's an unofficial concept by [Hafsa Usmani](https://hafsausmani.com), built to answer one question:

> *Could you make AI infrastructure feel effortless?*

Workshop is a web console for [Dedalus Machines](https://www.dedaluslabs.ai), persistent Linux microVMs for AI agents. It's built on Dedalus' public OpenAPI spec and runs against a simulated control plane in your browser.

> **Not affiliated with Dedalus Labs.** Latency and cost figures are simulated from published numbers. Nothing here measures Dedalus' infrastructure.

The full write-up is on the **[case study page](https://dedalus-demo-delta.vercel.app/about)**. It covers the design principles, an interactive spring-vs-tween demo, the architecture, and what failed.

---

## What it does

| | |
|---|---|
| **Lifecycle ring** | The observed phase springs around the control-plane loop toward a dashed *desired-state* target. You can watch declarative state reconcile. |
| **Wake stopwatch** | Sleep a machine, wake it, and see the latency next to a 2.5s sandbox start on one linear scale. Also shows p50/p95 across your wakes. |
| **Executions** | A terminal where every command is a real `POST /executions`, streamed as it runs. Run a command on a sleeping machine and it auto-wakes (`wake_in_progress`). |
| **Cost meter** | Spent vs. *saved by sleeping*, using the published rates. |
| **Equivalent code** | Every action shows the SDK call it made. |
| **Guardrails** | Actions the API would reject (`409 INVALID_STATE`) are disabled with the reason, in buttons and in ⌘K. |

## How it's built

```
React UI ──▶ typed client (generated from spec/dcs-openapi.json)
                │  HTTP  /dcs/v1/*
                ▼
        Service Worker (MSW) ──▶ SimEngine   ← this demo
        server route + API key ──▶ dcs.dedaluslabs.ai   ← production, same client
```

- **`spec/dcs-openapi.json`**: Dedalus' published spec. `lib/api/schema.ts` is generated from it, and CI fails if they drift.
- **`lib/sim/engine.ts`**: the simulated control plane. It's pure, seeded and time-derived: state is a function of a snapshot and `now`, with no timers. It follows the spec's rules:
  - nine phases, with desired and observed state
  - strict `INVALID_STATE` transitions
  - both error formats
  - `Idempotency-Key` replay
  - autosleep and reboot
  - documented persistence: disk survives sleep; RAM, processes and `/tmp` don't
- **`lib/sim/shell.ts`**: a small, honest shell. Unknown commands exit 127; it doesn't pretend to be bash.
- **`lib/client/stream.ts`**: `streamExecution()`, an async iterator that replaces the quickstart's polling loop. It pages by cursor and uses `retry_after_ms`.
- **`lib/client/fleet-store.ts`**: one polling loop. It polls every 16ms while anything is in transition and every 1s when idle, so a 30ms wake is actually *seen*.

**Stack:** Next.js 16 (App Router, View Transitions), React 19, TypeScript (strict), Tailwind v4, Motion, MSW 3, openapi-fetch, cmdk, Vitest, Playwright, axe and Lighthouse CI.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit + contract tests (Vitest)
npm run e2e        # Playwright against a production build
```

Add `?seed=42` to the URL for a clean, reproducible simulator.

## Testing

- **Unit and contract** (Vitest), covering:
  - engine lifecycle, reconciliation, autosleep and persistence
  - the shell parser
  - cost math, checked against the pricing page's own FAQ and calculator
  - the typed client → HTTP → handlers path, with both error shapes and idempotency
  - stream paging and abort
- **End-to-end** (Playwright, production build, real Service Worker):
  - create, exec, sleep and auto-wake, persistence, streaming
  - wake timing, ⌘K, reload, destroy, failure injection
  - reduced motion, and no horizontal scroll on phones
- **Accessibility:** axe audits of every page.
- **Performance:** Lighthouse CI budgets. Accessibility, CLS and SEO fail the build; performance, LCP and TBT warn.

## Decisions worth knowing

- **Why the simulator runs in a Service Worker:** a server-side simulator would flake on serverless hosting, where instances don't share memory. In the browser, each visitor gets an isolated fleet and the demo can't go down.
- **Why every simulator response is stamped:** browsers stop idle Service Workers, and MSW's worker forgets its tabs when that happens. That broke the live site before any test caught it. The client now spots a response that skipped the simulator, reconnects and retries. `e2e/resilience.spec.ts` kills the worker mid-session to prove it.
- **Why the empty state is server-rendered:** the largest paint shouldn't wait for the simulator. A pre-paint script tells CSS whether this visitor has a saved fleet, so first visits paint the real empty state instantly. Measured console LCP went from 4.7s to 1.7s.
- **Springs vs. tweens:** anything that represents *state* uses a spring, because phase updates arrive faster than a tween can finish. The 2.5s reference bar is a linear tween because it represents *time*.

---

Built by Hafsa Usmani. Feedback welcome.
