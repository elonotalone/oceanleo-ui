"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { CloudComputerClient } from "../../lib/cloud-computer-api";
import { useUI } from "../../i18n/ui/useUI";
import { SHELL_ENDED_ZH } from "../../i18n/ui/messages/shell-ended-copy";
import { serverPageHref } from "./server-page/href";
import { tone } from "./server-page/tone";

export type ShellTaskViewProps = {
  taskId: string;
  computerId: string;
  sessionId: string;
  computerName?: string;
  client?: CloudComputerClient;
  onEnded?: () => void;
  onReopened?: (taskId: string) => void;
};

/**
 * Shell 已不再是一类任务。旧任务入口只负责把仍可辨认的记录送到服务器页；
 * `client` 与回调字段保留在 props 上，避免旧消费方升级共享包时发生类型断裂。
 */
export function ShellTaskView({
  taskId,
  computerId,
  sessionId,
}: ShellTaskViewProps) {
  const tt = useUI();
  const router = useRouter();
  const target =
    computerId && sessionId
      ? serverPageHref(computerId, {
          card: "terminal",
          session: sessionId,
        })
      : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [router, target]);

  if (target) return null;

  return (
    <main
      className={`grid h-full min-h-[60vh] place-items-center p-6 ${tone.page}`}
      data-oceanleo-cc-shell-task={taskId}
      data-oceanleo-cc-shell-redirect-missing
    >
      <div className="max-w-md text-center">
        <p>{tt(SHELL_ENDED_ZH.missingSession)}</p>
        <a
          href="/"
          className={`mt-4 inline-flex rounded-lg px-3 py-2 text-sm ${tone.primary}`}
        >
          {tt("返回首页")}
        </a>
      </div>
    </main>
  );
}
