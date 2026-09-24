import { useEffect } from "react";
import { nextPollCadence, POLL_FIRST_MS } from "./cadence";

export interface TaskPollResult {
  status: string;
  changed: boolean;
}

export function useAgentThreadPolling(
  taskId: string | null | undefined,
  status: string,
  refresh: (id: string) => Promise<TaskPollResult>,
) {
  useEffect(() => {
    if (!taskId || (status && status !== "running")) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let idleStep = -1;
    let waitedMs = 0;
    const hidden = () => typeof document !== "undefined" && document.hidden === true;
    const arm = (delay: number) => {
      if (!cancelled) timer = setTimeout(() => void poll(), delay);
    };
    const poll = async () => {
      if (cancelled) return;
      const isHidden = hidden();
      const result = isHidden ? { status: "", changed: false } : await refresh(taskId);
      if (cancelled || (result.status && result.status !== "running")) return;
      const cadence = nextPollCadence({ hidden: isHidden, changed: result.changed, idleStep, waitedMs });
      idleStep = cadence.idleStep;
      waitedMs = cadence.waitedMs;
      arm(cadence.delayMs);
    };
    const onVisibilityChange = () => {
      if (cancelled || hidden()) return;
      if (timer) clearTimeout(timer);
      idleStep = -1;
      waitedMs = 0;
      arm(0);
    };
    arm(POLL_FIRST_MS);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [taskId, status, refresh]);
}
