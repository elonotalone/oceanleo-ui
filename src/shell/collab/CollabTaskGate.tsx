"use client";

/** 只有登录且非境内（`useImEnabled`）才去加载协同实现；否则任务页什么都不加载、什么都不连。 */
import { lazy, Suspense } from "react";
import { useImEnabled } from "../../lib/im/client";

const TaskRoom = lazy(() => import("./CollabTaskRoom").then((m) => ({ default: m.CollabTaskRoom })));

export function CollabTaskGate({ taskId }: { taskId: string }) {
  const enabled = useImEnabled();
  if (!enabled) return null;
  return (
    <Suspense fallback={null}>
      <TaskRoom taskId={taskId} />
    </Suspense>
  );
}
