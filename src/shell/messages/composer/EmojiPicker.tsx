"use client";

// 表情选择：内置固定一组标准 Unicode 表情，不做自定义表情（契约 §2.2 / 产品范围）。
// 输入框插入、消息回应共用同一组。
import { MessageSettingsDialog } from "../MessageSettingsFrame";
import { useUI } from "../../../i18n/ui/useUI";

export const EMOJI_SET: readonly string[] = [
  "👍", "👎", "❤️", "😂", "😊", "😍", "🎉", "🙏",
  "👀", "🔥", "💯", "✅", "❌", "🤔", "😅", "😭",
  "😮", "🙌", "👏", "💪", "🚀", "⭐", "💡", "📌",
  "😀", "😁", "😉", "😎", "🤝", "😴", "🙈", "😡",
  "🥳", "😢", "🤗", "🙂", "😬", "😇", "🤣", "😘",
];

export function EmojiPicker({
  onPick,
  onClose,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const tt = useUI();
  return (
    <MessageSettingsDialog title={tt("选择表情")} onClose={onClose}>
      <div className="mx-auto grid w-full max-w-[320px] grid-cols-8 gap-1">
      {EMOJI_SET.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onPick(emoji)}
          className="flex h-8 w-full items-center justify-center rounded-md text-[16px] hover:bg-neutral-100"
        >
          {emoji}
        </button>
      ))}
      </div>
    </MessageSettingsDialog>
  );
}
