"use client";

// 会话顶部的置顶条：显示最新一条置顶，点开看全部，点某一条跳到那条消息。
import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { ImMessage } from "../../../lib/im/types";
import { plainTextOf } from "./message-format";

function previewOf(message: ImMessage, fallback: string): string {
  if (message.recalled_at) return fallback;
  const text = plainTextOf(message.body).replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 80);
  if (message.card) return message.card.title;
  if (message.attachments[0]) return message.attachments[0].name;
  return fallback;
}

export function PinnedBar({
  pins,
  nameOf,
  onJump,
  onUnpin,
}: {
  pins: ImMessage[];
  nameOf: (userId: string | null) => string;
  onJump: (message: ImMessage) => void;
  onUnpin?: (message: ImMessage) => void;
}) {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  if (pins.length === 0) return null;
  const latest = pins[pins.length - 1];
  const fallback = tt("[消息]");
  return (
    <div className="relative border-b border-neutral-200/80" data-pinned-bar="">
      <div className="flex items-center gap-2 px-3 py-1.5 text-[12.5px]">
        <button
          type="button"
          onClick={() => onJump(latest)}
          className="min-w-0 flex-1 truncate text-left text-neutral-700 hover:text-neutral-900"
        >
          <span className="mr-1.5 font-medium text-neutral-500">{tt("置顶")}</span>
          {previewOf(latest, fallback)}
        </button>
        {pins.length > 1 ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="shrink-0 rounded px-1.5 py-0.5 text-[12px] text-neutral-400 hover:bg-neutral-100"
          >
            {tt("共 {n} 条", { n: pins.length })}
          </button>
        ) : null}
      </div>
      {open ? (
        <ul className="max-h-56 overflow-y-auto border-t border-neutral-100 bg-white dark:border-white/10 dark:bg-neutral-900">
          {[...pins].reverse().map((pin) => (
            <li key={pin.id} className="flex items-center gap-2 px-3 py-1.5 text-[12.5px] hover:bg-neutral-50">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onJump(pin);
                }}
                className="min-w-0 flex-1 truncate text-left text-neutral-700"
              >
                <span className="mr-1.5 text-neutral-400">{nameOf(pin.sender_id)}</span>
                {previewOf(pin, fallback)}
              </button>
              {onUnpin ? (
                <button
                  type="button"
                  onClick={() => onUnpin(pin)}
                  className="shrink-0 text-[11.5px] text-neutral-400 hover:text-neutral-700"
                >
                  {tt("取消置顶")}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
