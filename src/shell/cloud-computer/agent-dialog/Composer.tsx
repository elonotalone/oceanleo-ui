"use client";

import { useEffect, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { getTask } from "../../../lib/agent";
import { shellSessionFromTask } from "../../history-model";
import { LeoEntryButton, type LeoContext } from "../../LeoEntryButton";
import type { AgentDialogController } from "./types";

// ============================================================================
// Shell 对话框输入框（合同 I7）：对**所有**程序渲染——OceanLeo agent 与
// Cursor/Hermes/Claude Code/Codex 共用同一个消息列表、同一个输入框（含左下角
// 同一颗 ✦ leo 按钮）。模型/模式选择器仅在有数据时出现（条件渲染，未变）。
// Enter 守 isComposing：中文输入法候选态按 Enter 是选字，不是发送（事实 D3）。
// ============================================================================

/** 合同 I5 的 Shell 页 leo 上下文（解析结果，缓存一次）。 */
type ShellLeoInfo = {
  taskId?: string;
  computerId?: string;
  shellSessionId?: string;
  computerName?: string;
};

// 每个 Shell 任务只解析一次（模块级缓存）。做法与 ProgramRow.computerIdForThisShell
// 相同：最近的 [data-oceanleo-cc-shell-task] 取任务 id，再 getTask 取电脑/会话。
const shellLeoInfoCache = new Map<string, Promise<ShellLeoInfo>>();

function resolveShellLeoInfo(): Promise<ShellLeoInfo> {
  if (typeof document === "undefined") return Promise.resolve({});
  const taskId =
    document
      .querySelector("[data-oceanleo-cc-shell-task]")
      ?.getAttribute("data-oceanleo-cc-shell-task")
      ?.trim() || "";
  if (!taskId) return Promise.resolve({});
  const cached = shellLeoInfoCache.get(taskId);
  if (cached) return cached;
  const pending = getTask(taskId)
    .then((result): ShellLeoInfo => {
      if (!result.ok || !result.data?.task) return { taskId };
      const task = result.data.task;
      const shell = shellSessionFromTask(task);
      const computerId = (shell?.computerId || task.computer_id || "").trim();
      return {
        taskId,
        computerId: computerId || undefined,
        shellSessionId: shell?.sessionId || undefined,
        computerName: shell?.computerName,
      };
    })
    .catch((): ShellLeoInfo => ({ taskId }));
  shellLeoInfoCache.set(taskId, pending);
  return pending;
}

export function Composer({ dialog }: { dialog: AgentDialogController }) {
  const tt = useUI();
  const [shellInfo, setShellInfo] = useState<ShellLeoInfo>({});
  useEffect(() => {
    let alive = true;
    void resolveShellLeoInfo().then((info) => {
      if (alive) setShellInfo(info);
    });
    return () => {
      alive = false;
    };
  }, []);
  // 还没选程序时不渲染（合同 I6 起默认选中 OceanLeo agent，正常不会走到这里）。
  if (!dialog.program) return null;
  const showModels = dialog.modelSource !== "none" && dialog.models.length > 0;
  const showStop = dialog.busy || dialog.agentBusy;
  const leoContext: LeoContext = { page: "shell", ...shellInfo };
  return (
    <form
      className="border-t border-neutral-800 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void dialog.send();
      }}
    >
      <div className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <textarea
            data-oceanleo-cc-dialog-input=""
            value={dialog.draft}
            disabled={dialog.agentBusy || dialog.offline}
            onChange={(event) => dialog.setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void dialog.send();
              }
            }}
            placeholder={tt("输入你想说的话")}
            rows={3}
            className="min-h-[4.5rem] w-full resize-none rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-[13px] text-neutral-100 outline-none disabled:opacity-50"
          />
          <div className="flex flex-wrap items-center gap-2">
            {/* 全站唯一的 leo 入口（合同 I5）：Shell 对话框左下角同一颗 ✦ leo
                按钮，深色底用 tone="dark"；context 带这台电脑，leo 建的任务挂上来。 */}
            <LeoEntryButton tone="dark" context={leoContext} />
            {showModels ? (
              <label className="flex items-center gap-1 text-[11px] text-neutral-400">
                {tt("模型")}
                <select
                  data-oceanleo-cc-model=""
                  value={dialog.selectedModel}
                  onChange={(event) => dialog.setSelectedModel(event.target.value)}
                  className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1 text-[12px] text-neutral-100"
                >
                  {dialog.models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {dialog.mode && dialog.mode.options.length > 0 ? (
              <label className="flex items-center gap-1 text-[11px] text-neutral-400">
                {dialog.mode.name || tt("模式")}
                <select
                  data-oceanleo-cc-mode=""
                  value={dialog.selectedMode}
                  onChange={(event) => dialog.setMode(event.target.value)}
                  className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1 text-[12px] text-neutral-100"
                >
                  {dialog.mode.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button
              type="button"
              data-oceanleo-cc-fresh=""
              aria-pressed={dialog.fresh}
              onClick={() => dialog.setFresh(!dialog.fresh)}
              className={`rounded-lg px-2 py-1 text-[11px] ${
                dialog.fresh ? "bg-neutral-100 text-neutral-900" : "text-neutral-400 hover:bg-neutral-800"
              }`}
            >
              {tt("新对话")}
            </button>
          </div>
        </div>
        {showStop ? (
          <button
            type="button"
            data-oceanleo-cc-stop=""
            onClick={dialog.abort}
            className="rounded-lg border border-neutral-700 px-3 py-2 text-[12px] text-neutral-200"
          >
            {tt("停止")}
          </button>
        ) : (
          <button
            type="submit"
            disabled={dialog.offline}
            className="rounded-lg bg-neutral-100 px-3 py-2 text-[12px] font-medium text-neutral-900 disabled:opacity-40"
          >
            {tt("发送")}
          </button>
        )}
      </div>
    </form>
  );
}
