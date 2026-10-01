// Friendly aliases over the types generated from Dedalus' public OpenAPI spec
// (spec/dcs-openapi.json → lib/api/schema.ts via `npm run gen:api`).
// Nothing in this file is hand-modeled: if the spec changes, these change.
import type { components, paths } from "./schema";

type Schemas = components["schemas"];

export type { paths };
export type MachineListItem = Schemas["MachineListItem"];
export type MachineListResponse = Schemas["MachineListResponse"];
export type MachineDetail = Schemas["MachineDetailResponse"];
export type LifecycleResponse = Schemas["LifecycleResponse"];
export type LifecycleStatus = Schemas["LifecycleStatus"];
export type CreateMachineRequest = Schemas["CreateMachineRequest"];
export type UpdateMachineRequest = Schemas["UpdateMachineRequest"];
export type CreateExecutionRequest = Schemas["CreateExecutionRequest"];
export type Execution = Schemas["ExecutionResponse"];
export type ExecutionEvent = Schemas["ExecutionEvent"];
export type ExecutionEventsResponse = Schemas["ExecutionEventsResponse"];
export type ExecutionOutput = Schemas["ExecutionOutputResponse"];
export type ErrorModel = Schemas["ErrorModel"];

export type Phase = MachineListItem["phase"];
export type DesiredState = MachineListItem["desired_state"];
export type ExecutionStatus = Execution["status"];

export const PHASES = [
  "accepted",
  "placement_pending",
  "starting",
  "running",
  "stopping",
  "sleeping",
  "destroying",
  "destroyed",
  "failed",
] as const satisfies readonly Phase[];

/** Phases the control plane is actively moving a machine through. */
export const TRANSITIONAL_PHASES: ReadonlySet<Phase> = new Set([
  "accepted",
  "placement_pending",
  "starting",
  "stopping",
  "destroying",
]);

export const TERMINAL_EXECUTION_STATUSES: ReadonlySet<ExecutionStatus> = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "expired",
]);
