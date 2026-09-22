"use client";

import { useUI } from "../../../i18n/ui/useUI";
import { Composer } from "./Composer";
import { InstallSheet } from "./InstallSheet";
import { LoginCard } from "./LoginCard";
import { MessageList } from "./MessageList";
import { ProgramRow } from "./ProgramRow";
import { PROGRAM_LABEL, type AgentDialogController } from "./types";

export function AgentDialogPane({
  dialog,
  onBack,
  onOpenLeo,
}: {
  dialog: AgentDialogController;
  onBack: () => void;
  onOpenLeo?: () => void;
}) {
  const tt = useUI();
  const title = dialog.program ? PROGRAM_LABEL[dialog.program] : tt("用对话界面继续");
  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col bg-neutral-950 text-neutral-100"
      data-oceanleo-cc-agent-dialog-pane=""
      data-oceanleo-cc-reconnect={dialog.offline ? "paused" : "on"}
    >
      <div className="flex items-center justify-between gap-2 border-b border-neutral-800 px-3 py-2">
        <p className="text-[12px] text-neutral-400">{title}</p>
        <button
          type="button"
          onClick={onBack}
          data-oceanleo-cc-dialog-back=""
          className="rounded-lg px-2 py-1 text-[12px] text-neutral-300 hover:bg-neutral-800"
        >
          {tt("回到终端")}
        </button>
      </div>
      <ProgramRow dialog={dialog} onOpenLeo={onOpenLeo} />
      {!dialog.program ? (
        <p className="px-3 py-3 text-[13px] leading-relaxed text-neutral-300">
          {tt(
            "选一个程序。没装的点安装，没登录的点登录。字打在这里，发到那台电脑上，程序用它自己保存的会话接着说。网站不保存这些字。",
          )}
        </p>
      ) : null}
      <MessageList dialog={dialog} />
      <Composer dialog={dialog} />
      <InstallSheet dialog={dialog} />
      <LoginCard dialog={dialog} />
    </div>
  );
}
