"use client";

import { useEffect, useRef } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { tone } from "../server-page/tone";
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
  // 已装好的程序不再出「开始安装」：状态帧可能先于用户点按到达，此时只给实话。
  const alreadyInstalled = row?.installed === true && !install.running && !install.failedText && !install.donePath;
  const dirLocked = capability === "none" || install.running || alreadyInstalled;
  return (
    <div
      data-oceanleo-cc-install-sheet=""
      className={`absolute inset-x-0 bottom-0 z-10 max-h-[70%] overflow-y-auto border-t px-3 py-3 ${tone.border} ${tone.page}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[13px]">
          {tt("安装")} {PROGRAM_LABEL[install.program]}
        </p>
        <button
          type="button"
          data-oceanleo-cc-install-close=""
          onClick={dialog.closeInstall}
          className={`h-11 rounded-lg px-2 py-1 text-[13px] ${tone.muted} ${tone.hover}`}
        >
          {tt("关闭")}
        </button>
      </div>
      <p className={`text-[12px] leading-relaxed ${tone.muted}`} data-oceanleo-cc-install-where="">
        {dirSentence(tt, capability)}
      </p>
      <label className={`mt-2 block text-[11px] ${tone.muted}`}>
        {tt("安装位置")}
        <input
          data-oceanleo-cc-install-dir=""
          value={install.dir}
          disabled={dirLocked}
          onChange={(event) => dialog.setInstallDir(event.target.value)}
          className={`mt-1 w-full h-11 rounded-lg border px-2 py-1.5 font-mono text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))]/45 disabled:opacity-50 ${tone.input}`}
        />
      </label>
      {install.lines.length > 0 ? (
        <pre
          ref={logRef}
          data-oceanleo-cc-install-log=""
          className={`mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] ${tone.muted}`}
        >
          {install.lines.join("\n")}
        </pre>
      ) : null}
      {install.donePath ? (
        <p data-oceanleo-cc-install-path="" className="mt-2 text-[12px] text-emerald-700 dark:text-emerald-300">
          {tt("已装到 {path}", { path: install.donePath })}
        </p>
      ) : null}
      {install.failedText ? (
        <p data-oceanleo-cc-install-error="" className="mt-2 text-[12px] text-rose-700 dark:text-rose-300">
          {install.failedText}
        </p>
      ) : null}
      {alreadyInstalled ? (
        <p data-oceanleo-cc-install-already="" className="mt-2 text-[12px] text-emerald-700 dark:text-emerald-300">
          {tt("这个程序已经装好了。")}
        </p>
      ) : null}
      <div className="mt-3">
        {install.running || alreadyInstalled ? null : install.failedText ? (
          <button
            type="button"
            data-oceanleo-cc-install-retry=""
            onClick={dialog.startInstall}
            className={`h-11 rounded-lg px-3 py-1.5 text-[13px] font-medium ${tone.primary}`}
          >
            {tt("重试")}
          </button>
        ) : install.donePath ? (
          <button
            type="button"
            data-oceanleo-cc-install-done=""
            onClick={dialog.closeInstall}
            className={`h-11 rounded-lg px-3 py-1.5 text-[13px] font-medium ${tone.primary}`}
          >
            {tt("完成")}
          </button>
        ) : (
          <button
            type="button"
            data-oceanleo-cc-install-start=""
            onClick={dialog.startInstall}
            className={`h-11 rounded-lg px-3 py-1.5 text-[13px] font-medium ${tone.primary}`}
          >
            {tt("开始安装")}
          </button>
        )}
      </div>
    </div>
  );
}
