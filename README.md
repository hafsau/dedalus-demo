# Workshop

**A control room for Dedalus Machines.** An unofficial concept by [Hafsa Usmani](https://hafsausmani.com), built in answer to one question: *could you make AI infrastructure feel effortless?*

> Not affiliated with Dedalus Labs. Runs against a simulated control plane. See below.

## What's here so far

- **`spec/dcs-openapi.json`**: Dedalus' public DCS OpenAPI spec. Types in `lib/api/schema.ts` are generated from it, and CI fails if they drift.
- **`lib/sim/`**: a simulated DCS control plane. It's a pure, seeded, time-derived engine that follows the spec's actual rules:
  - nine lifecycle phases, with desired and observed state
  - `INVALID_STATE` conflicts
  - both error formats
  - `Idempotency-Key` replay
  - autosleep
  - reboot
  - documented persistence: disk survives sleep; RAM, processes and `/tmp` don't

  It's served over real HTTP by Mock Service Worker, so the app can't tell it from the real API.
- **`lib/client/stream.ts`**: `streamExecution()`, the async iterator that replaces the quickstart's hand-written polling loop.
- **`lib/cost.ts`**: billing math using the published rates, checked against the pricing page's own FAQ and calculator.

## Run it

```bash
npm install
npm test          # unit + contract tests
npm run dev
```

The full write-up (decisions, tradeoffs, what failed) is coming with the UI.
