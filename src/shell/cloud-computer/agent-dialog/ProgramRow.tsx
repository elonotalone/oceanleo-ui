"use client";

import { useState } from "react";
import { getTask } from "../../../lib/agent";
import { useUI } from "../../../i18n/ui/useUI";
import { shellSessionFromTask } from "../../history-model";
import { CursorKeySheet } from "./CursorKeySheet";
import { isWsProgram } from "./parse";
import { PROGRAM_LABEL, WS_PROGRAMS, type AgentDialogController, type AgentProgram, type ProgramStatus } from "./types";

async function computerIdForThisShell(): Promise<string> {
  if (typeof document === "undefined") return "";
  const taskId =
    document.querySelector("[data-oceanleo-cc-shell-task]")?.getAttribute("data-oceanleo-cc-shell-task")?.trim() ||
    "";
  if (!taskId) return "";
  const result = await getTask(taskId);
  if (!result.ok || !result.data?.task) return "";
  const task = result.data.task;
  const shell = shellSessionFromTask(task);
  return (shell?.computerId || task.computer_id || "").trim();
}

function dotOf(row: ProgramStatus | undefined): "unknown" | "gray" | "yellow" | "green" {
  if (!row) return "unknown";
  if (!row.installed) return "gray";
  if (row.logged_in === false) return "yellow";
  return "green";
}

const DOT_CLASS = {
  unknown: "bg-neutral-600",
  gray: "bg-neutral-500",
  yellow: "bg-amber-400",
  green: "bg-emerald-500",
} as const;

export function ProgramRow({
  dialog,
  onOpenLeo,
}: {
  dialog: AgentDialogController;
  onOpenLeo?: () => void;
}) {
  const tt = useUI();
  const [cursorKeyOpen, setCursorKeyOpen] = useState(false);
  const [cursorComputerId, setCursorComputerId] = useState("");
  const ids: AgentProgram[] = onOpenLeo ? [...WS_PROGRAMS, "oceanleo"] : [...WS_PROGRAMS];
  return (
    <>
      <div className="flex flex-wrap gap-2 border-b border-neutral-800 px-3 py-2">
      {ids.map((id) => {
        if (id === "oceanleo") {
          return (
            <button
              key={id}
              type="button"
              data-oceanleo-cc-dialog-oceanleo=""
              onClick={() => onOpenLeo?.()}
              className="rounded-lg bg-neutral-800 px-2.5 py-1 text-[12px] text-neutral-100"
            >
              {PROGRAM_LABEL.oceanleo}
            </button>
          );
        }
        const row = dialog.programs.find((item) => item.id === id);
        const dot = dotOf(row);
        const selected = dialog.program === id;
        return (
          <div key={id} className="flex items-center gap-1" data-oceanleo-cc-program={id}>
            <button
              type="button"
              {...{ [`data-oceanleo-cc-dialog-${id}`]: "" }}
              onClick={() => dialog.setProgram(id)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] ${
                selected ? "bg-neutral-100 font-medium text-neutral-900" : "bg-neutral-800 text-neutral-100"
              }`}
            >
              <span
                data-oceanleo-cc-dot={dot}
                className={`inline-block h-2 w-2 rounded-full ${DOT_CLASS[dot]}`}
              />
              {PROGRAM_LABEL[id]}
              {row?.running ? (
                <span
                  data-oceanleo-cc-running="1"
                  className="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-emerald-400"
                />
              ) : null}
            </button>
            {row && !row.installed ? (
              <button
                type="button"
                data-oceanleo-cc-install={id}
                onClick={() => dialog.openInstall(id)}
                className="px-1 text-[11px] text-neutral-300 underline"
              >
                {tt("安装")}
              </button>
            ) : null}
            {id === "cursor" && row?.installed ? (
              <button
                type="button"
                data-oceanleo-cc-cursor-key=""
                onClick={() => {
                  void computerIdForThisShell().then((next) => {
                    setCursorComputerId(next);
                    setCursorKeyOpen(true);
                  });
                }}
                className="px-1 text-[11px] text-neutral-300 underline"
              >
                {tt("Key")}
              </button>
            ) : null}
            {row?.running || dialog.openedPrograms.includes(id) ? (
              <button
                type="button"
                data-oceanleo-cc-close-session={id}
                onClick={() => dialog.closeProgram(id)}
                className="px-1 text-[11px] text-neutral-400 underline"
              >
                {tt("关掉会话")}
              </button>
            ) : null}
            {row && row.installed && row.logged_in === false && isWsProgram(id) ? (
              <button
                type="button"
                data-oceanleo-cc-login={id}
                onClick={() => dialog.openLogin(id)}
                className="px-1 text-[11px] text-amber-200 underline"
              >
                {tt("登录")}
              </button>
            ) : null}
          </div>
        );
      })}
      </div>
      <CursorKeySheet
        open={cursorKeyOpen}
        computerId={cursorComputerId}
        onClose={() => setCursorKeyOpen(false)}
      />
    </>
  );
}
