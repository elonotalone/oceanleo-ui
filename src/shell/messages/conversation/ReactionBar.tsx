"use client";

// 消息下面的表情回应。点已有的 = 加入/取消；表情只许标准 Unicode（服务端白名单），不做自定义表情。
import { useUI } from "../../../i18n/ui/useUI";
import type { ImReactionSummary } from "../../../lib/im/types";

/** 悬停菜单里的快速回应。 */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "🙏", "👀"] as const;

export function ReactionBar({
  reactions,
  nameOf,
  onToggle,
}: {
  reactions: ImReactionSummary[];
  nameOf: (userId: string) => string;
  onToggle: (emoji: string) => void;
}) {
  const tt = useUI();
  if (reactions.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1" data-reactions="">
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          onClick={() => onToggle(reaction.emoji)}
          title={reaction.user_ids.map(nameOf).join("、") || undefined}
          aria-pressed={reaction.mine}
          aria-label={tt("{emoji} {n} 人回应", { emoji: reaction.emoji, n: reaction.count })}
          className={
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] leading-5 transition-colors " +
            (reaction.mine
              ? "border-sky-300 bg-sky-50 text-sky-800"
              : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300")
          }
        >
          <span>{reaction.emoji}</span>
          <span className="tabular-nums">{reaction.count}</span>
        </button>
      ))}
    </div>
  );
}
