"use client";

// 会话顶栏的「通话」入口（任务书 P1；合同 §1 A1、A20）：耳机图标 + 「通话」，aria-label 同文案。
// 点一下直接进：不预览、不检查麦克风、不邀请审批、不弹设置框（默认麦克风开、摄像头关由引擎记忆）。
// 已在这通里 → 「通话中」，点击展开小窗；在别的会话通话里 → 先确认「离开当前通话并加入这里？」。
// 交易会话不显示；已解散 / 非成员由会话视图决定不渲染。
import { useUI } from "../../../../i18n/ui/useUI";
import type { ImConversationKind } from "../../../../lib/im/types";
import { entryHidden } from "./call-entry";
import { HeadphonesIcon } from "./call-visuals";
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
      <button
        type="button"
        data-call-button={entry.state}
        aria-label={label}
        title={inThisCall ? tt("通话中，点击展开小窗") : label}
        disabled={disabled || entry.state === "busy" || entry.pending}
        onClick={() => void entry.run({ title: title || undefined })}
        className={
          "inline-flex h-[30px] shrink-0 items-center gap-1 rounded-[10px] px-2 text-[12.5px] font-medium transition-colors disabled:cursor-default disabled:opacity-50 " +
          (inThisCall
            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25"
            : "text-neutral-500 hover:bg-black/5 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-neutral-100")
        }
      >
        <HeadphonesIcon size={16} />
        <span>{label}</span>
      </button>
      {entry.dialog}
    </>
  );
}
