export const POLL_FIRST_MS = 120;
const POLL_ACTIVE_MS = 200;
const POLL_FIRST_BYTE_MS = 225;
const POLL_FIRST_BYTE_WINDOW_MS = 2000;
const POLL_IDLE_LADDER_MS = [300, 500, 800, 1200];
const POLL_HIDDEN_RECHECK_MS = 1000;

export interface PollCadenceInput {
  hidden: boolean;
  changed: boolean;
  idleStep: number;
  waitedMs: number;
}

export interface PollCadence {
  delayMs: number;
  idleStep: number;
  waitedMs: number;
}

export function nextPollCadence({ hidden, changed, idleStep, waitedMs }: PollCadenceInput): PollCadence {
  if (hidden) return { delayMs: POLL_HIDDEN_RECHECK_MS, idleStep, waitedMs };
  if (changed) return { delayMs: POLL_ACTIVE_MS, idleStep: -1, waitedMs: 0 };
  if (waitedMs < POLL_FIRST_BYTE_WINDOW_MS) {
    return { delayMs: POLL_FIRST_BYTE_MS, idleStep: -1, waitedMs: waitedMs + POLL_FIRST_BYTE_MS };
  }
  const step = Math.min(idleStep + 1, POLL_IDLE_LADDER_MS.length - 1);
  const delayMs = POLL_IDLE_LADDER_MS[step];
  return { delayMs, idleStep: step, waitedMs: waitedMs + delayMs };
}
