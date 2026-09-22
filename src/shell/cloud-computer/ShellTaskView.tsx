"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  cloudComputerApi,
  type CloudComputerClient,
  type Computer,
} from "../../lib/cloud-computer-api";
import { useUI } from "../../i18n/ui/useUI";
import {
  canOpenShell,
  computerDisplayState,
  type ComputerDisplayState,
} from "./computer-state";
import { useComputerTerminal } from "./TerminalPanel";
import { AgentDialogPane, useAgentDialog } from "./useAgentDialog";

export type ShellTaskViewProps = {
  taskId: string;
  computerId: string;
  sessionId: string;
  computerName?: string;
  client?: CloudComputerClient;
  onEnded?: () => void;
  onReopened?: (taskId: string) => void;
};

function statusDotClass(state: ComputerDisplayState | null): string {
  if (state === "ready") return "bg-emerald-500";
  if (state === "unpaid") return "bg-rose-500";
  return "bg-neutral-300";
}

export function ShellTaskView({
  taskId,
  computerId,
  sessionId,
  computerName,
  client = cloudComputerApi,
  onEnded,
  onReopened,
}: ShellTaskViewProps) {
  const tt = useUI();
  const router = useRouter();
  const missing = !computerId || !sessionId;
  const [ended, setEnded] = useState(missing);
  const [computer, setComputer] = useState<Computer | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const shellLive = !ended && !missing;

  const terminal = useComputerTerminal({
    computerId,
    sessionId: shellLive ? sessionId : null,
    enabled: shellLive,
  });
  const dialog = useAgentDialog({
    computerId,
    sessionId,
    enabled: dialogOpen && shellLive,
  });

  useEffect(() => {
    if (
      terminal.status === "exit" ||
      terminal.status === "error"
    ) {
      setEnded(true);
    }
  }, [terminal.status]);

  useEffect(() => {
    let alive = true;
    void client
      .getComputer(computerId)
      .then((row) => {
        if (alive) setComputer(row);
      })
      .catch(() => {
        /* chip falls back to the name we already have */
      });
    return () => {
      alive = false;
    };
  }, [client, computerId]);

  const endShell = useCallback(async () => {
    try {
      await client.closeTerminal(computerId, sessionId);
    } catch {
      /* session may already be gone on the node */
    }
    setEnded(true);
    onEnded?.();
  }, [client, computerId, onEnded, sessionId]);

  const [reopenError, setReopenError] = useState<string | null>(null);
  const reopen = useCallback(async () => {
    setReopenError(null);
    let opened: { task_id?: string };
    try {
      opened = await client.openTerminal(computerId, {
        cols: 80,
        rows: 24,
        as_task: true,
      });
    } catch {
      // 机器此刻离线/停机时网关会拒绝；告诉用户去哪里看，而不是静默失败。
      setReopenError(tt("云电脑离线，先到我的设备里检查节点"));
      return;
    }
    if (!opened.task_id) return;
    if (onReopened) {
      onReopened(opened.task_id);
      return;
    }
    router.push(`/history?task=${encodeURIComponent(opened.task_id)}`);
  }, [client, computerId, onReopened, router, tt]);

  const state = computer ? computerDisplayState(computer) : null;
  const name = computer?.name || computerName || tt("接入云电脑");
  const showEnded = ended || missing;

  return (
    <div
      className="flex h-full min-h-[60vh] flex-col bg-neutral-950 text-neutral-100"
      data-oceanleo-cc-shell-task={taskId}
      data-ended={showEnded ? "1" : "0"}
    >
      <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2 text-[12px]">
        <span
          className={`h-1.5 w-1.5 rounded-full ${statusDotClass(state)}`}
          data-oceanleo-cc-online={state === "ready" ? "1" : "0"}
        />
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {!showEnded && !dialogOpen && (
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            data-oceanleo-cc-agent-dialog
            className="rounded-lg px-2 py-1 text-neutral-300 hover:bg-neutral-800"
          >
            {tt("用对话界面继续")}
          </button>
        )}
        {!showEnded && (
          <button
            type="button"
            onClick={() => void endShell()}
            data-oceanleo-cc-end-shell
            className="rounded-lg px-2 py-1 text-neutral-300 hover:bg-neutral-800"
          >
            {tt("结束 Shell")}
          </button>
        )}
      </div>
      {showEnded ? (
        <div className="grid flex-1 place-items-center p-8 text-center">
          <p className="text-[14px] text-neutral-200">{tt("这个 Shell 已结束")}</p>
          {canOpenShell(computer) || computerId ? (
            <button
              type="button"
              onClick={() => void reopen()}
              data-oceanleo-cc-reopen-shell
              className="mt-3 rounded-lg bg-neutral-800 px-3 py-1.5 text-[12px] text-neutral-100 hover:bg-neutral-700"
            >
              {tt("在同一台电脑再开一个")}
            </button>
          ) : null}
          {reopenError ? (
            <p className="mt-2 text-[12px] text-rose-300" data-oceanleo-cc-reopen-error>
              {reopenError}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          <div
            ref={terminal.hostRef}
            className={`h-full min-h-0 px-2 py-1 ${dialogOpen ? "invisible" : ""}`}
            data-oceanleo-cc-xterm
            aria-hidden={dialogOpen || undefined}
          />
          {dialogOpen ? (
            <div className="absolute inset-0 flex min-h-0 flex-col bg-neutral-950">
              <AgentDialogPane dialog={dialog} onBack={() => setDialogOpen(false)} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
