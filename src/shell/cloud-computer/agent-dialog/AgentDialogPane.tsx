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
}: {
  // computerName 由控制器（W6A）提供；W3 把它并进 types.ts 后这个交叉可删。
  dialog: AgentDialogController & { computerName?: string };
  onBack: () => void;
}) {
  const tt = useUI();
  // 合同 I6：onOpenLeo 已删——OceanLeo agent 是程序行第一项，不再开另一个面板。
  const title = !dialog.program
    ? tt("用对话界面继续")
    : dialog.program === "oceanleo"
      ? dialog.computerName
        ? tt("OceanLeo agent · {name}", { name: dialog.computerName })
        : tt("OceanLeo agent")
      : PROGRAM_LABEL[dialog.program];
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
      <ProgramRow dialog={dialog} />
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
