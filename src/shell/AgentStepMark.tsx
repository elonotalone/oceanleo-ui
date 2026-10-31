"use client";

// The step indicator of the one process timeline (2026-10-31 W4, replaces the
// accent-blue dot / spinner). One small block that changes colour AND shape
// with the state, with smooth transitions (styles: `.leo-step-mark` in
// theme/globals.css; durations are motion tokens, so reduced motion holds still
// except a soft opacity breathe on the live states):
//
//   running  → soft neutral gradient squircle that slowly turns and rounds
//   waiting  → hollow ring that breathes (the program waits on the user)
//   done     → solid dark rounded block with a white check
//   failed   → warm (rose) diamond
//   stopped  → small light dot (turn ended before the steps finished)
//
// Neutral stone palette; never blue. Used for the OceanLeo agent and the
// computer programs alike (AgentProgress serves both).

import type { ProcessEntry } from "../lib/agent-progress";

export type AgentStepState = "running" | "waiting" | "done" | "failed" | "stopped";

export const AGENT_STEP_STATES: readonly AgentStepState[] = ["running", "waiting", "done", "failed", "stopped"];

/** One block's state from its entries and whether its turn is still live. */
export function agentStepState(entries: readonly ProcessEntry[], running: boolean, failed: number): AgentStepState {
  const last = entries[entries.length - 1];
  if (running) return last?.type === "tool" && last.status === "pending" ? "waiting" : "running";
  if (failed > 0) return "failed";
  const unfinished = entries.some((entry) => entry.type === "tool" && (entry.status === "running" || entry.status === "pending"));
  return unfinished ? "stopped" : "done";
}

export function AgentStepMark({ state, className = "" }: { state: AgentStepState; className?: string }) {
  return (
    <span aria-hidden="true" className={`leo-step-mark ${className}`.trim()} data-step-state={state}>
      <span className="leo-step-mark-core" />
      <svg className="leo-step-mark-check" viewBox="0 0 12 12" fill="none">
        <path d="M3.4 6.2l1.8 1.8 3.4-3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
