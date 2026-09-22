"use client";

import { useEffect, useRef } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { PROGRAM_LABEL, type AgentDialogController, type DirCapability } from "./types";

function dirSentence(tt: ReturnType<typeof useUI>, capability: DirCapability): string {
  if (capability === "link_only") {
    return tt("程序本体装在它自己的默认位置，这里只放一个快捷方式");
  }
  if (capability === "none") return tt("这个程序只能装在默认位置");
  return tt("整个程序装到这个目录");
}

export function InstallSheet({ dialog }: { dialog: AgentDialogController }) {
  const tt = useUI();
  const install = dialog.install;
  const logRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [install.lines]);
  if (!install.open || !install.program) return null;
  const row = dialog.programs.find((item) => item.id === install.program);
  const capability = row?.dir_capability ?? "full";
  const dirLocked = capability === "none" || install.running;
  return (
    <div
      data-oceanleo-cc-install-sheet=""
      className="absolute inset-x-0 bottom-0 z-10 max-h-[70%] overflow-y-auto border-t border-neutral-700 bg-neutral-900 px-3 py-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[13px] text-neutral-100">
          {tt("安装")} {PROGRAM_LABEL[install.program]}
        </p>
        <button
          type="button"
          data-oceanleo-cc-install-close=""
          onClick={dialog.closeInstall}
          className="rounded-lg px-2 py-1 text-[12px] text-neutral-300 hover:bg-neutral-800"
        >
          {tt("关闭")}
        </button>
      </div>
      <p className="text-[12px] leading-relaxed text-neutral-400" data-oceanleo-cc-install-where="">
        {dirSentence(tt, capability)}
      </p>
      <label className="mt-2 block text-[11px] text-neutral-500">
        {tt("安装位置")}
        <input
          data-oceanleo-cc-install-dir=""
          value={install.dir}
          disabled={dirLocked}
          onChange={(event) => dialog.setInstallDir(event.target.value)}
          className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1.5 font-mono text-[12px] text-neutral-100 outline-none disabled:opacity-50"
        />
      </label>
      {install.lines.length > 0 ? (
        <pre
          ref={logRef}
          data-oceanleo-cc-install-log=""
          className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-neutral-300"
        >
          {install.lines.join("\n")}
        </pre>
      ) : null}
      {install.donePath ? (
        <p data-oceanleo-cc-install-path="" className="mt-2 text-[12px] text-emerald-300">
          {tt("已装到 {path}", { path: install.donePath })}
        </p>
      ) : null}
      {install.failedText ? (
        <p data-oceanleo-cc-install-error="" className="mt-2 text-[12px] text-rose-300">
          {install.failedText}
        </p>
      ) : null}
      <div className="mt-3">
        {install.running ? null : install.failedText ? (
          <button
            type="button"
            data-oceanleo-cc-install-retry=""
            onClick={dialog.startInstall}
            className="rounded-lg bg-neutral-100 px-3 py-1.5 text-[12px] font-medium text-neutral-900"
          >
            {tt("重试")}
          </button>
        ) : install.donePath ? (
          <button
            type="button"
            data-oceanleo-cc-install-done=""
            onClick={dialog.closeInstall}
            className="rounded-lg bg-neutral-100 px-3 py-1.5 text-[12px] font-medium text-neutral-900"
          >
            {tt("完成")}
          </button>
        ) : (
          <button
            type="button"
            data-oceanleo-cc-install-start=""
            onClick={dialog.startInstall}
            className="rounded-lg bg-neutral-100 px-3 py-1.5 text-[12px] font-medium text-neutral-900"
          >
            {tt("开始安装")}
          </button>
        )}
      </div>
    </div>
  );
}
