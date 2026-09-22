"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  cloudComputerApi,
  type CloudComputerClient,
  type Computer,
} from "../../lib/cloud-computer-api";
import { useUI } from "../../i18n/ui/useUI";
import { SHELL_ENDED_ZH } from "../../i18n/ui/messages/shell-ended-copy";
import { openLeoAssistant } from "../LeoAssistant";
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

type ShellEnd =
  | { kind: "exit"; code: string }
  | { kind: "error"; code: string }
  | { kind: "closed" };

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
  const sessionKey = `${computerId}\0${sessionId}`;
  const [sessionKeySeen, setSessionKeySeen] = useState(sessionKey);
  const [end, setEnd] = useState<ShellEnd | null>(null);
  if (sessionKeySeen !== sessionKey) {
    setSessionKeySeen(sessionKey);
    setEnd(null);
  }
  const [computer, setComputer] = useState<Computer | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const showEnded = missing || end !== null;
  const shellLive = !showEnded;

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
    if (terminal.status === "exit") {
      setEnd({ kind: "exit", code: terminal.detail ?? "" });
    } else if (terminal.status === "error") {
      setEnd({ kind: "error", code: terminal.detail ?? "" });
    }
  }, [terminal.detail, terminal.status]);

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
    setEnd({ kind: "closed" });
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
  const endedSentence = missing
    ? tt(SHELL_ENDED_ZH.missingSession)
    : end?.kind === "exit"
      ? tt(SHELL_ENDED_ZH.endedExit, { code: end.code })
      : end?.kind === "error"
        ? tt(SHELL_ENDED_ZH.endedError, { code: end.code })
        : tt("这个 Shell 已结束");

  return (
    <div
      className="relative flex h-full min-h-[60vh] flex-col bg-neutral-950 text-neutral-100"
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
        <button
          type="button"
          onClick={() => openLeoAssistant({ toggle: true })}
          data-oceanleo-cc-leo-toggle
          className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] text-neutral-600 transition-all duration-[var(--leo-dur-3)] ease-[var(--leo-ease-standard)] active:duration-[var(--leo-dur-1)] hover:bg-neutral-100 active:scale-95"
        >
          <ShellLeoSpark />
          leo
        </button>
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
          <p
            className="text-[14px] text-neutral-200"
            data-oceanleo-cc-shell-end={missing ? "missing" : end?.kind}
          >
            {endedSentence}
          </p>
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
            <div className="absolute inset-0 z-10 flex min-h-0 flex-col bg-neutral-950">
              <AgentDialogPane dialog={dialog} onBack={() => setDialogOpen(false)} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ShellLeoSpark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
      <defs>
        <linearGradient id="leo-shell-sparkle-g" x1="0" y1="0" x2="24" y2="24">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>
      </defs>
      <path
        d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3z"
        fill="url(#leo-shell-sparkle-g)"
      />
      <path
        d="M18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9L18 14z"
        fill="url(#leo-shell-sparkle-g)"
        opacity="0.65"
      />
    </svg>
  );
}
