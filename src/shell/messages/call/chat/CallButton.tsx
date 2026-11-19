"use client";

// 会话顶栏的「通话」入口（任务书 P1；合同 §1 A1、A20）：耳机图标 + 「通话」，aria-label 同文案。
// 进入前选择语音或视频，只决定本次加入时是否打开摄像头。
// 已在这通里 → 「通话中」，点击展开小窗；在别的会话通话里 → 先确认「离开当前通话并加入这里？」。
// 交易会话不显示；已解散 / 非成员由会话视图决定不渲染。
import { useUI } from "../../../../i18n/ui/useUI";
import type { ImConversationKind } from "../../../../lib/im/types";
import { entryHidden } from "./call-entry";
import { HeadphonesIcon } from "./call-visuals";
import { CallMediaMenu } from "./CallMediaMenu";
import { useCallEntry } from "./use-call-entry";

export interface CallButtonProps {
  conversationId: string;
  title: string;
  kind: ImConversationKind;
  disabled?: boolean;
}

export function CallButton({ conversationId, title, kind, disabled = false }: CallButtonProps) {
  const tt = useUI();
  const entry = useCallEntry(conversationId, entryHidden(conversationId, kind));
  if (entry.state === "hidden") return null;
  const inThisCall = entry.state === "in_this_call";
  const label = inThisCall ? tt("通话中") : tt("通话");
  return (
    <>
      <CallMediaMenu inCall={inThisCall} onChoose={(camera) => void entry.run({ title: title || undefined, camera })} onFocus={() => void entry.run()}>
        <button
          type="button"
          data-call-button={entry.state}
          aria-label={label}
          title={inThisCall ? tt("通话中，点击展开小窗") : label}
          disabled={disabled || entry.state === "busy" || entry.pending}
          className={
            "inline-flex h-[30px] shrink-0 items-center gap-1 rounded-[10px] px-2 text-[12.5px] font-medium transition-colors duration-[var(--leo-dur-2)] disabled:cursor-default disabled:opacity-50 " +
            (inThisCall
              ? "bg-neutral-50 text-neutral-700 hover:bg-neutral-100 dark:bg-neutral-900/15 dark:text-neutral-300 dark:hover:bg-neutral-900/25"
              : "text-neutral-500 hover:bg-black/5 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-neutral-100")
          }
        >
          <HeadphonesIcon size={16} />
          <span>{label}</span>
        </button>
      </CallMediaMenu>
      {entry.dialog}
    </>
  );
}
