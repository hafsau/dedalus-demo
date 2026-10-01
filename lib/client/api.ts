// Typed client for the DCS API. Every path, param and response shape here is
// checked against types generated from Dedalus' OpenAPI spec.
//
// In the deployed demo, `/dcs` is answered by the in-browser simulator. Point
// the same code at a server-side proxy that holds a real key and it would talk
// to dcs.dedaluslabs.ai unchanged.

import createClient from "openapi-fetch";
import type {
  CreateExecutionRequest,
  CreateMachineRequest,
  Execution,
  ExecutionEventsResponse,
  LifecycleResponse,
  MachineDetail,
  MachineListItem,
  paths,
  UpdateMachineRequest,
} from "../api/types";
import { SIM_HEADER } from "../sim/protocol";

/**
 * Normalises the spec's two error shapes:
 *  - domain errors (401/403/409/429/503): { error_code, message, retryable, details }
 *  - everything else: RFC 7807 problem+json { title, status, detail }
 */
export class ApiError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly details: Record<string, string>;

  constructor(
    readonly status: number,
    body: unknown,
  ) {
    const b = (typeof body === "object" && body ? body : {}) as Record<string, unknown>;
    super(String(b.message ?? b.detail ?? b.title ?? `HTTP ${status}`));
    this.code = String(b.error_code ?? b.title ?? status);
    this.retryable = b.retryable === true;
    this.retryAfterMs = typeof b.retry_after_ms === "number" ? b.retry_after_ms : undefined;
    this.details = (b.details as Record<string, string>) ?? {};
  }
}

type Result<T> = { data?: T; error?: unknown; response: Response };

function unwrap<T>({ data, error, response }: Result<T>): T {
  if (error !== undefined || data === undefined) throw new ApiError(response.status, error);
  return data;
}

type FetchFn = (req: Request) => Promise<Response>;

/**
 * Every mutation carries an Idempotency-Key, so a request whose response was
 * lost can be retried without, say, creating two machines. One retry on a
 * network error is the case the key exists for.
 */
const idempotentFetch =
  (inner: FetchFn): FetchFn =>
  async (req) => {
    if (req.method === "GET" || req.headers.has("Idempotency-Key")) return inner(req);
    const headers = new Headers(req.headers);
    headers.set("Idempotency-Key", crypto.randomUUID());
    const body = await req.text();
    const make = () => new Request(req.url, { method: req.method, headers, body: body || undefined, signal: req.signal });
    try {
      return await inner(make());
    } catch (e) {
      if (req.signal.aborted) throw e;
      return inner(make());
    }
  };

export function createDcsClient(baseUrl: string, fetchImpl?: FetchFn) {
  // Late-bound so test interceptors that patch globalThis.fetch still apply.
  const base: FetchFn = fetchImpl ?? ((req) => globalThis.fetch(req));
  const c = createClient<paths>({ baseUrl, fetch: idempotentFetch(base) });
  const machine = (machine_id: string) => ({ params: { path: { machine_id } } });
  const exec = (machine_id: string, execution_id: string) => ({ params: { path: { machine_id, execution_id } } });

  return {
    listMachines: async (): Promise<MachineListItem[]> => unwrap(await c.GET("/v1/machines")).items ?? [],
    createMachine: async (body: CreateMachineRequest): Promise<LifecycleResponse> =>
      unwrap(await c.POST("/v1/machines", { body })),
    getMachine: async (id: string): Promise<MachineDetail> => unwrap(await c.GET("/v1/machines/{machine_id}", machine(id))),
    updateMachine: async (id: string, body: UpdateMachineRequest): Promise<LifecycleResponse> =>
      unwrap(await c.PATCH("/v1/machines/{machine_id}", { ...machine(id), body })),
    wake: async (id: string): Promise<LifecycleResponse> => unwrap(await c.POST("/v1/machines/{machine_id}/wake", machine(id))),
    sleep: async (id: string): Promise<LifecycleResponse> => unwrap(await c.POST("/v1/machines/{machine_id}/sleep", machine(id))),
    reboot: async (id: string): Promise<LifecycleResponse> => unwrap(await c.POST("/v1/machines/{machine_id}/reboot", machine(id))),
    destroy: async (id: string): Promise<LifecycleResponse> => unwrap(await c.DELETE("/v1/machines/{machine_id}", machine(id))),

    createExecution: async (id: string, body: CreateExecutionRequest): Promise<Execution> =>
      unwrap(await c.POST("/v1/machines/{machine_id}/executions", { ...machine(id), body })),
    getExecution: async (id: string, executionId: string): Promise<Execution> =>
      unwrap(await c.GET("/v1/machines/{machine_id}/executions/{execution_id}", exec(id, executionId))),
    listEvents: async (
      id: string,
      executionId: string,
      query: { cursor?: string; limit?: number } = {},
      signal?: AbortSignal,
    ): Promise<ExecutionEventsResponse> =>
      unwrap(
        await c.GET("/v1/machines/{machine_id}/executions/{execution_id}/events", {
          params: { path: { machine_id: id, execution_id: executionId }, query },
          signal,
        }),
      ),
  };
}

export type DcsClient = ReturnType<typeof createDcsClient>;

let browserClient: DcsClient | null = null;

/**
 * Every simulator response is stamped with SIM_HEADER. One without it reached
 * the real network, which means the browser restarted an idle Service Worker
 * and it forgot this tab. Reconnect and retry once. That's safe: the stray
 * request only hit a static 404 and changed nothing.
 */
async function simulatorAwareFetch(req: Request): Promise<Response> {
  const res = await globalThis.fetch(req.clone());
  if (res.headers.has(SIM_HEADER)) return res;
  const { reactivateSimulator } = await import("../sim/browser");
  await reactivateSimulator();
  return globalThis.fetch(req);
}

/** The app's client: same-origin `/dcs`, served by the simulator in this demo. */
export function dcs(): DcsClient {
  browserClient ??= createDcsClient(`${location.origin}/dcs`, simulatorAwareFetch);
  return browserClient;
}
