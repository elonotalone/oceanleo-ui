"use client";

import { useUI } from "../../../i18n/ui/useUI";
import { isWsProgram } from "./parse";
import type { AgentDialogController } from "./types";

export function Composer({ dialog }: { dialog: AgentDialogController }) {
  const tt = useUI();
  if (!isWsProgram(dialog.program)) return null;
  const showModels = dialog.modelSource !== "none" && dialog.models.length > 0;
  const showStop = dialog.busy || dialog.agentBusy;
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
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void dialog.send();
              }
            }}
            placeholder={tt("输入你想说的话")}
            rows={3}
            className="min-h-[4.5rem] w-full resize-none rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-[13px] text-neutral-100 outline-none disabled:opacity-50"
          />
          <div className="flex flex-wrap items-center gap-2">
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
