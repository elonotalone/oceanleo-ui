"use client";

// 悬停 / 长按出现的操作条：回应、引用回复、开线程、更多（复制文字、复制链接、置顶、编辑、撤回、举报）。
import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { ImMessage } from "../../../lib/im/types";
import { EmojiPicker } from "../composer/EmojiPicker";
import { ImEmojiIcon, ImMoreIcon, ImQuoteIcon, ImThreadIcon } from "../messages-surface";
import { QUICK_REACTIONS } from "./ReactionBar";

export interface MessageActionPermissions {
  canEdit: boolean;
  canRecall: boolean;
  canReact: boolean;
  canThread: boolean;
  canPin: boolean;
}

/** 哪些操作对这条消息可用（纯函数，便于测试）。 */
export function actionPermissions(input: {
  message: ImMessage;
  viewerId: string | null;
  isAdmin: boolean;
  inThread: boolean;
}): MessageActionPermissions {
  const { message, viewerId, isAdmin, inThread } = input;
  const alive = !message.recalled_at && message.hidden_reason !== "moderation" && message.seq > 0;
  const mine = Boolean(viewerId) && message.sender_id === viewerId && message.sender_kind === "user";
  return {
    canEdit: alive && mine && message.kind === "text",
    canRecall: alive && (mine || isAdmin) && message.sender_kind !== "system",
    canReact: alive,
    canThread: alive && !inThread && message.sender_kind !== "system",
    canPin: alive,
  };
}

export interface MessageActionHandlers {
  onReact: (emoji: string) => void;
  onQuote: () => void;
  onThread: () => void;
  onCopyText: () => void;
  onCopyLink: () => void;
  onTogglePin: () => void;
  onEdit: () => void;
  onRecall: () => void;
  onReport: () => void;
}

const buttonClass =
  "flex h-7 min-w-7 items-center justify-center rounded-md px-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900";

export function MessageActions({
  message,
  permissions,
  handlers,
  canReportOthers,
}: {
  message: ImMessage;
  permissions: MessageActionPermissions;
  handlers: MessageActionHandlers;
  canReportOthers: boolean;
}) {
  const tt = useUI();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => {
    setPickerOpen(false);
    setMenuOpen(false);
  };
  const item = (label: string, run: () => void, danger = false) => (
    <button
      key={label}
      type="button"
      role="menuitem"
      onClick={() => {
        close();
        run();
      }}
      className={
        "block w-full whitespace-nowrap px-3 py-1.5 text-left text-[12.5px] hover:bg-neutral-50 " +
        (danger ? "text-red-600" : "text-neutral-700")
      }
    >
      {label}
    </button>
  );

  return (
    <div
      className="relative flex items-center gap-0.5"
      data-message-actions=""
    >
      {permissions.canReact
        ? QUICK_REACTIONS.slice(0, 3).map((emoji) => (
            <button key={emoji} type="button" className={buttonClass} onClick={() => handlers.onReact(emoji)} aria-label={tt("回应 {emoji}", { emoji })}>
              {emoji}
            </button>
          ))
        : null}
      {permissions.canReact ? (
        <div className="relative">
          <button
            type="button"
            className={buttonClass}
            aria-label={tt("更多表情")}
            aria-expanded={pickerOpen}
            onClick={() => {
              setMenuOpen(false);
              setPickerOpen((value) => !value);
            }}
          >
            <ImEmojiIcon />
          </button>
          {pickerOpen ? (
            <div className="absolute right-0 top-8">
              <EmojiPicker
                onClose={() => setPickerOpen(false)}
                onPick={(emoji) => {
                  close();
                  handlers.onReact(emoji);
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {permissions.canReact ? (
        <button type="button" className={buttonClass} onClick={handlers.onQuote} aria-label={tt("引用")} title={tt("引用")}>
          <ImQuoteIcon />
        </button>
      ) : null}
      {permissions.canThread ? (
        <button type="button" className={buttonClass} onClick={handlers.onThread} aria-label={tt("线程")} title={tt("线程")}>
          <ImThreadIcon />
        </button>
      ) : null}
      <div className="relative">
        <button
          type="button"
          className={buttonClass}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={tt("更多操作")}
          onClick={() => {
            setPickerOpen(false);
            setMenuOpen((value) => !value);
          }}
        >
          <ImMoreIcon />
        </button>
        {menuOpen ? (
          <div role="menu" className="absolute right-0 top-8 z-30 min-w-[132px] overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
            {message.body ? item(tt("复制文字"), handlers.onCopyText) : null}
            {message.seq > 0 ? item(tt("复制链接"), handlers.onCopyLink) : null}
            {permissions.canPin ? item(message.pinned ? tt("取消置顶") : tt("置顶"), handlers.onTogglePin) : null}
            {permissions.canEdit ? item(tt("编辑"), handlers.onEdit) : null}
            {permissions.canRecall ? item(tt("撤回"), handlers.onRecall, true) : null}
            {canReportOthers ? item(tt("举报"), handlers.onReport, true) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
