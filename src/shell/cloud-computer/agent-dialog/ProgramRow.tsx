"use client";

// 程序行：OceanLeo agent 恒第一项（就绪、无按钮），其余四项按 status 帧的 auth 三态展示——
// 未装→「安装」；装了没认证→「登录」+「Key」；auth=key→绿点「Key ✓」+「移除」；
// auth=login→绿点+版本+「已登录」；探针没结论→灰「未知」+「刷新」。
// 按钮文案只认探针结论：没确认前永远是「登录」，确认后才出「已登录」。

import { useState } from "react";
import { getTask } from "../../../lib/agent";
import { useUI } from "../../../i18n/ui/useUI";
import { shellSessionFromTask } from "../../history-model";
import { KeySheet } from "./KeySheet";
import {
  PROGRAM_LABEL,
  WS_PROGRAMS,
  type AgentDialogController,
  type AgentProgram,
  type ProgramStatus,
  type WsProgram,
} from "./types";

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

type RowState = "missing" | "unauthed" | "authed-login" | "authed-key" | "unknown";

// malformed 是存的登录材料坏了，网关幂等修复后再探；修好前按未认证展示（W2-interface）。
function stateOf(row: ProgramStatus | undefined): RowState {
  if (!row) return "unknown";
  if (!row.installed) return "missing";
  if (row.auth === "login") return "authed-login";
  if (row.auth === "key") return "authed-key";
  if (row.auth === "none" || row.auth === "malformed") return "unauthed";
  return "unknown";
}

const DOT_CLASS = {
  missing: "bg-neutral-500",
  unauthed: "bg-amber-400",
  "authed-login": "bg-emerald-500",
  "authed-key": "bg-emerald-500",
  unknown: "bg-neutral-600",
} as const;

export function ProgramRow({
  dialog,
}: {
  dialog: AgentDialogController;
}) {
  const tt = useUI();
  const [keyProgram, setKeyProgram] = useState<WsProgram | null>(null);
  const [keyComputerId, setKeyComputerId] = useState("");
  const ids: AgentProgram[] = ["oceanleo", ...WS_PROGRAMS];

  function openKeySheet(program: WsProgram) {
    void computerIdForThisShell().then((next) => {
      setKeyComputerId(next);
      setKeyProgram(program);
    });
  }

  const keyRow = keyProgram ? dialog.programs.find((item) => item.id === keyProgram) : undefined;
  return (
    <>
      <div className="flex flex-wrap gap-2 border-b border-neutral-800 px-3 py-2">
      {ids.map((id) => {
        if (id === "oceanleo") {
          const selected = dialog.program === "oceanleo";
          return (
            <div key={id} className="flex items-center gap-1" data-oceanleo-cc-program="oceanleo">
              <button
                type="button"
                data-oceanleo-cc-dialog-oceanleo=""
                onClick={() => dialog.setProgram("oceanleo")}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] ${
                  selected ? "bg-neutral-100 font-medium text-neutral-900" : "bg-neutral-800 text-neutral-100"
                }`}
              >
                <span
                  data-oceanleo-cc-dot="green"
                  className={`inline-block h-2 w-2 rounded-full ${DOT_CLASS["authed-login"]}`}
                />
                {PROGRAM_LABEL.oceanleo}
              </button>
            </div>
          );
        }
        const row = dialog.programs.find((item) => item.id === id);
        const state = stateOf(row);
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
                data-oceanleo-cc-dot={state === "missing" ? "gray" : state === "unauthed" ? "yellow" : state === "unknown" ? "unknown" : "green"}
                className={`inline-block h-2 w-2 rounded-full ${DOT_CLASS[state]}`}
              />
              {PROGRAM_LABEL[id]}
              {row?.running ? (
                <span
                  data-oceanleo-cc-running="1"
                  className="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-emerald-400"
                />
              ) : null}
            </button>
            {state === "authed-login" ? (
              <span className="flex items-center gap-1 text-[11px] text-neutral-400">
                {row?.version ? (
                  <span data-oceanleo-cc-version={id} className="font-mono">
                    {row.version}
                  </span>
                ) : null}
                <span data-oceanleo-cc-signed-in={id} className="text-emerald-300">
                  {tt("已登录")}
                </span>
              </span>
            ) : null}
            {state === "authed-key" ? (
              <>
                <button
                  type="button"
                  data-oceanleo-cc-key-saved={id}
                  onClick={() => openKeySheet(id)}
                  className="px-1 text-[11px] text-emerald-300"
                >
                  {tt("Key ✓")}
                </button>
                <button
                  type="button"
                  data-oceanleo-cc-key-remove={id}
                  onClick={() => openKeySheet(id)}
                  className="px-1 text-[11px] text-neutral-300 underline"
                >
                  {tt("移除")}
                </button>
              </>
            ) : null}
            {state === "unknown" ? (
              <>
                <span data-oceanleo-cc-unknown={id} className="px-1 text-[11px] text-neutral-500">
                  {tt("未知")}
                </span>
                <button
                  type="button"
                  data-oceanleo-cc-refresh={id}
                  onClick={() => dialog.retryConnect()}
                  className="px-1 text-[11px] text-neutral-300 underline"
                >
                  {tt("刷新")}
                </button>
              </>
            ) : null}
            {state === "missing" ? (
              <button
                type="button"
                data-oceanleo-cc-install={id}
                onClick={() => dialog.openInstall(id)}
                className="px-1 text-[11px] text-neutral-300 underline"
              >
                {tt("安装")}
              </button>
            ) : null}
            {state === "unauthed" ? (
              <>
                <button
                  type="button"
                  data-oceanleo-cc-login={id}
                  onClick={() => dialog.openLogin(id)}
                  className="px-1 text-[11px] text-amber-200 underline"
                >
                  {tt("登录")}
                </button>
                <button
                  type="button"
                  data-oceanleo-cc-key={id}
                  onClick={() => openKeySheet(id)}
                  className="px-1 text-[11px] text-neutral-300 underline"
                >
                  {tt("Key")}
                </button>
              </>
            ) : null}
            {row?.running || dialog.openedPrograms.includes(id) ? (
              <button
                type="button"
                data-oceanleo-cc-close-session={id}
                onClick={() => dialog.closeProgram(id)}
                className="px-1 text-[11px] text-neutral-300 underline"
              >
                {tt("关掉会话")}
              </button>
            ) : null}
          </div>
        );
      })}
      </div>
      <KeySheet
        open={keyProgram !== null}
        computerId={keyComputerId}
        program={keyProgram}
        hasKey={keyRow?.auth === "key"}
        onClose={() => setKeyProgram(null)}
        onChanged={() => dialog.retryConnect()}
      />
    </>
  );
}
