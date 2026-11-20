import { useEffect } from "react";
import { GATEWAY_BASE } from "../../lib/auth/config";
import { openSseStream, type SseRequestInit } from "../../lib/sse";

/** Reconnect delays after a dropped push stream (same 1 s → 10 s shape as the frame socket). */
export const TASK_EVENTS_RETRY_MS = [1_000, 2_000, 5_000, 10_000] as const;

export interface TaskEventsDeps {
  /** The page's bearer source (the caller passes its auth client's accessToken). */
  token: () => Promise<string | null>;
  open?: (init: SseRequestInit) => AsyncIterable<{ event: string }>;
  base?: string;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
}

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
});

/**
 * Follow a cloud task that other people can write in while it is idle.
 *
 * `GET /v1/tasks/{id}/events` pushes a `snapshot` whenever the task changes
 * (and `access_changed` when the caller's access does). The page then reads
 * the task through its normal path; a turn someone else started appears
 * without a reload and the running-task polling takes over from there.
 * `taskId = null` keeps the stream closed (owner-only tasks, running tasks,
 * computer tasks that already stream frames).
 */
export function useTaskEvents(taskId: string | null | undefined, onChange: (taskId: string) => void, deps: TaskEventsDeps) {
  const { token, open = openSseStream, base = GATEWAY_BASE, wait = sleep } = deps;
  useEffect(() => {
    if (!taskId) return;
    const controller = new AbortController();
    void (async () => {
      let failures = 0;
      while (!controller.signal.aborted) {
        try {
          const bearer = await token();
          const stream = open({
            url: `${base}/v1/tasks/${encodeURIComponent(taskId)}/events`,
            method: "GET",
            headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
            signal: controller.signal,
            // Idle tasks send keepalives every few seconds; a long-lived push.
            totalTimeoutMs: 3_600_000,
          });
          for await (const event of stream) {
            if (controller.signal.aborted) return;
            failures = 0;
            // The first snapshot after (re)connecting also catches up on
            // anything missed while the stream was down.
            if (event.event === "snapshot" || event.event === "access_changed") onChange(taskId);
          }
        } catch {
          if (controller.signal.aborted) return;
        }
        await wait(TASK_EVENTS_RETRY_MS[Math.min(failures, TASK_EVENTS_RETRY_MS.length - 1)], controller.signal);
        failures += 1;
      }
    })();
    return () => controller.abort();
  }, [taskId, onChange, open, token, base, wait]);
}
