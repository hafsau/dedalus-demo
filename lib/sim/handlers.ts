// MSW request handlers that implement the DCS HTTP contract on top of the
// SimEngine. The app's API client can't tell these apart from the real thing:
// same paths, same JSON shapes, both of the spec's error formats, and
// Idempotency-Key semantics on every mutation.

import { http, HttpResponse, type HttpResponseResolver } from "msw";
import type { CreateExecutionRequest, CreateMachineRequest, UpdateMachineRequest } from "../api/types";
import { SimError, type SimEngine } from "./engine";

export const SIM_BASE = "/dcs";

type Params = { machine_id: string; execution_id: string };

function problem(status: number, title: string, detail: string) {
  return HttpResponse.json(
    { type: "about:blank", status, title, detail },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

function errorResponse(e: SimError) {
  if (!e.code) return problem(e.status, e.title, e.detail);
  return HttpResponse.json(
    { error_code: e.code, message: e.detail, retryable: e.retryable, ...(e.details ? { details: e.details } : {}) },
    { status: e.status },
  );
}

/**
 * Idempotency per the spec: the server generates a key when omitted and
 * returns it; replaying a key with the same request returns the original
 * response; reusing it with a different request is a 409.
 */
interface Recorded {
  hash: string;
  status: number;
  body: unknown;
}

async function readJson<T>(request: Request): Promise<T | SimError> {
  const text = await request.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return new SimError(400, "Bad Request", "request body is not valid JSON");
  }
}

/**
 * Builds the handlers. `base` is a path prefix or absolute URL, so the same
 * handlers serve the browser worker (`/dcs`) and Node tests
 * (`http://localhost/dcs`).
 */
export function createHandlers(getEngine: () => SimEngine, opts: { base?: string; onChange?: () => void } = {}) {
  const base = opts.base ?? SIM_BASE;
  const v1 = `${base}/v1`;
  const idempotency = new Map<string, Recorded>();

  type Fn = (args: { engine: SimEngine; params: Params; request: Request; now: number }) => unknown | Promise<unknown>;

  const route =
    (fn: Fn, status = 200): HttpResponseResolver<Params> =>
    async ({ params, request }) => {
      const mutating = request.method !== "GET";
      const key = mutating ? (request.headers.get("Idempotency-Key") ?? crypto.randomUUID()) : null;
      const headers: Record<string, string> = key ? { "Idempotency-Key": key } : {};
      try {
        let hash = "";
        if (key) {
          hash = `${request.method} ${new URL(request.url).pathname} ${await request.clone().text()}`;
          const seen = idempotency.get(key);
          if (seen && seen.hash !== hash) {
            throw new SimError(409, "Conflict", "idempotency key reused with different request parameters", "IDEMPOTENCY_KEY_REUSED");
          }
          if (seen) return HttpResponse.json(seen.body as never, { status: seen.status, headers });
        }
        const body = await fn({ engine: getEngine(), params, request, now: Date.now() });
        if (body instanceof SimError) throw body;
        if (key) idempotency.set(key, { hash, status, body });
        return status === 204 ? new HttpResponse(null, { status, headers }) : HttpResponse.json(body as never, { status, headers });
      } catch (e) {
        if (e instanceof SimError) return errorResponse(e);
        console.error("[sim]", e);
        return problem(500, "Internal Server Error", "simulator error");
      } finally {
        opts.onChange?.();
      }
    };

  return [
    http.get(`${v1}/machines`, route(({ engine, now }) => ({ items: engine.listMachines(now) }))),

    http.post(
      `${v1}/machines`,
      route(async ({ engine, request, now }) => {
        const body = await readJson<CreateMachineRequest>(request);
        return body instanceof SimError ? body : engine.createMachine(body, now);
      }, 202),
    ),

    http.get(`${v1}/machines/:machine_id`, route(({ engine, params, now }) => engine.getMachine(params.machine_id, now))),

    http.patch(
      `${v1}/machines/:machine_id`,
      route(async ({ engine, params, request, now }) => {
        const body = await readJson<UpdateMachineRequest>(request);
        return body instanceof SimError ? body : engine.updateMachine(params.machine_id, body, now);
      }),
    ),

    http.delete(`${v1}/machines/:machine_id`, route(({ engine, params, now }) => engine.destroy(params.machine_id, now), 202)),
    http.post(`${v1}/machines/:machine_id/wake`, route(({ engine, params, now }) => engine.wake(params.machine_id, now), 202)),
    http.post(`${v1}/machines/:machine_id/sleep`, route(({ engine, params, now }) => engine.sleep(params.machine_id, now), 202)),
    http.post(`${v1}/machines/:machine_id/reboot`, route(({ engine, params, now }) => engine.reboot(params.machine_id, now), 202)),

    http.get(
      `${v1}/machines/:machine_id/executions`,
      route(({ engine, params, now }) => ({ items: engine.listExecutions(params.machine_id, now) })),
    ),

    http.post(
      `${v1}/machines/:machine_id/executions`,
      route(async ({ engine, params, request, now }) => {
        const body = await readJson<CreateExecutionRequest>(request);
        return body instanceof SimError ? body : engine.createExecution(params.machine_id, body, now);
      }),
    ),

    http.get(
      `${v1}/machines/:machine_id/executions/:execution_id`,
      route(({ engine, params, now }) => engine.getExecution(params.machine_id, params.execution_id, now)),
    ),

    http.delete(
      `${v1}/machines/:machine_id/executions/:execution_id`,
      route(({ engine, params, now }) => engine.deleteExecution(params.machine_id, params.execution_id, now), 204),
    ),

    http.get(
      `${v1}/machines/:machine_id/executions/:execution_id/events`,
      route(({ engine, params, request, now }) => {
        const url = new URL(request.url);
        const limit = url.searchParams.get("limit");
        return engine.listEvents(params.machine_id, params.execution_id, now, {
          cursor: url.searchParams.get("cursor") ?? undefined,
          limit: limit ? Number(limit) : undefined,
        });
      }),
    ),

    http.get(
      `${v1}/machines/:machine_id/executions/:execution_id/output`,
      route(({ engine, params, now }) => engine.getOutput(params.machine_id, params.execution_id, now)),
    ),

    // Everything else in the spec (SSH sessions, log tokens) is
    // honestly unimplemented rather than faked.
    http.all(`${v1}/*`, () => problem(501, "Not Implemented", "This endpoint exists in the DCS API but isn't simulated in Workshop.")),
  ];
}
