// Which actions the API will accept in which state, mirrored from the spec's
// INVALID_STATE examples. The UI uses these to disable buttons *before* a
// click instead of surfacing a 409 after it.

import type { DesiredState, Phase } from "../api/types";

export type Action = "wake" | "sleep" | "reboot" | "destroy" | "exec";

export interface Availability {
  allowed: boolean;
  /** Why not, in the user's terms. */
  reason?: string;
}

export function availability(action: Action, phase: Phase, desired: DesiredState): Availability {
  const no = (reason: string): Availability => ({ allowed: false, reason });
  if (desired === "destroyed") return no(phase === "destroyed" ? "Machine is destroyed" : "Machine is being destroyed");

  switch (action) {
    case "wake":
      if (phase === "sleeping" && desired === "sleeping") return { allowed: true };
      if (phase === "running") return no("Already running");
      if (phase === "failed") return no("Failed machines can't be woken. Destroy it and create a new one");
      return no(`Can only wake from sleeping (currently ${phaseLabel(phase)})`);
    case "sleep":
      if (phase === "running" && desired === "running") return { allowed: true };
      if (phase === "sleeping") return no("Already sleeping");
      return no(`Can only sleep from running (currently ${phaseLabel(phase)})`);
    case "reboot":
      if (phase === "running" && desired === "running") return { allowed: true };
      return no("Machine must be awake to reboot");
    case "destroy":
      return { allowed: true };
    case "exec":
      if (phase === "failed") return no("Machine failed to start");
      return { allowed: true }; // sleeping machines auto-wake for executions
  }
}

const LABELS: Record<Phase, string> = {
  accepted: "accepted",
  placement_pending: "placing",
  starting: "starting",
  running: "running",
  stopping: "stopping",
  sleeping: "sleeping",
  destroying: "destroying",
  destroyed: "destroyed",
  failed: "failed",
};

export function phaseLabel(phase: Phase): string {
  return LABELS[phase];
}

export type Tone = "ok" | "warn" | "sleep" | "danger" | "dim";

export function phaseTone(phase: Phase): Tone {
  switch (phase) {
    case "running":
      return "ok";
    case "sleeping":
      return "sleep";
    case "failed":
      return "danger";
    case "destroyed":
    case "destroying":
      return "dim";
    default:
      return "warn";
  }
}

export function hostname(machineId: string): string {
  return `dm-${machineId.slice(0, 8)}`;
}
