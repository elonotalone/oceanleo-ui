"use client";

// 表情选择：内置固定一组标准 Unicode 表情，不做自定义表情（契约 §2.2 / 产品范围）。
// 输入框插入、消息回应共用同一组。
import { useEffect, useRef } from "react";
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
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={tt("选择表情")}
      className="z-30 grid w-[290px] max-w-[calc(100vw-1rem)] grid-cols-6 gap-0.5 rounded-xl border border-neutral-200 bg-white p-2 shadow-lg md:w-[248px] md:grid-cols-8"
    >
      {EMOJI_SET.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onPick(emoji)}
          className="flex h-11 w-11 items-center justify-center rounded-md text-[17px] hover:bg-neutral-100 md:h-7 md:w-7"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
