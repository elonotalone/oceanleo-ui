"use client";

import { useEffect, useRef } from "react";
import type { TerminalRecord } from "../../../lib/cloud-computer-api";
import { useUI } from "../../../i18n/ui/useUI";
import { SHELL_ENDED_ZH } from "../../../i18n/ui/messages/shell-ended-copy";
import { useComputerTerminal } from "../TerminalPanel";
import { tone } from "../server-page/tone";

export function TerminalViewport({
  computerId,
  active = true,
  record,
  readOnly = !record.alive,
  onEnded,
}: {
  computerId: string;
  active?: boolean;
  record: TerminalRecord;
  readOnly?: boolean;
  onEnded?: () => void;
}) {
  const tt = useUI();
  const terminal = useComputerTerminal({
    computerId,
    sessionId: record.id,
    enabled: true,
    active,
    readOnly,
  });
  const notified = useRef(false);

  useEffect(() => {
    if (terminal.status !== "exit" && terminal.status !== "gone") return;
    if (notified.current) return;
    notified.current = true;
    onEnded?.();
  }, [onEnded, terminal.status]);

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col bg-white dark:bg-neutral-950"
      data-oceanleo-terminal-viewport={record.id}
      data-read-only={readOnly ? "1" : "0"}
    >
      {terminal.status === "reconnecting" && (
        <div className={`border-b px-3 py-1.5 text-xs ${tone.warn}`} role="status">
          {tt(SHELL_ENDED_ZH.reconnecting)}
        </div>
      )}
      {terminal.status === "error" && (
        <div
          className={`flex items-center justify-between gap-3 border-b px-3 py-1.5 text-xs ${tone.warn}`}
          role="alert"
        >
          <span>{tt(SHELL_ENDED_ZH.connectionLost)}</span>
          <button
            type="button"
            className="font-medium underline underline-offset-2"
            onClick={terminal.retry}
          >
            {tt(SHELL_ENDED_ZH.retryConnection)}
          </button>
        </div>
      )}
      <div
        ref={terminal.hostRef}
        className="min-h-0 w-full flex-1 px-2 py-1"
        data-oceanleo-card-xterm=""
      />
      {!terminal.ready && (
        <div
          className={`pointer-events-none absolute inset-0 grid place-items-center text-xs ${tone.muted}`}
          data-oceanleo-terminal-loading=""
        >
          {tt("终端加载中")}
        </div>
      )}
    </div>
  );
}
