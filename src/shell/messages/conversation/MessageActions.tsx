"use client";

// 消息上下文菜单：复制、翻译、转发、多选、引用、删除。
import { useEffect, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { ImMessage } from "../../../lib/im/types";
import { ImMoreIcon } from "../messages-surface";

export interface MessageActionPermissions {
  canQuote: boolean;
  canDelete: boolean;
}

/** 哪些操作对这条消息可用（纯函数，便于测试）。 */
export function actionPermissions(input: {
  message: ImMessage;
  viewerId: string | null;
  isAdmin: boolean;
}): MessageActionPermissions {
  const { message, viewerId, isAdmin } = input;
  const alive = !message.recalled_at && message.hidden_reason !== "moderation" && message.seq > 0;
  const mine = Boolean(viewerId) && message.sender_id === viewerId && message.sender_kind === "user";
  return {
    canQuote: alive,
    canDelete: alive && (mine || isAdmin) && message.sender_kind !== "system",
  };
}

export interface MessageActionHandlers {
  onQuote: () => void;
  onTranslate: () => void;
  onForward: () => void;
  onMultiSelect: () => void;
  onCopyText: () => void;
  onRecall: () => void;
}

const buttonClass =
  "flex h-7 min-w-7 items-center justify-center rounded-md px-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900";

export function MessageActions({
  message,
  permissions,
  handlers,
  open = false,
}: {
  message: ImMessage;
  permissions: MessageActionPermissions;
  handlers: MessageActionHandlers;
  open?: boolean;
}) {
  const tt = useUI();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { if (open) setMenuOpen(true); }, [open]);
  const close = () => {
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
      <div className="relative">
        <button
          type="button"
          className={buttonClass}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={tt("更多操作")}
          onClick={() => {
            setMenuOpen((value) => !value);
          }}
        >
          <ImMoreIcon />
        </button>
        {menuOpen ? (
          <div role="menu" className="absolute right-0 top-8 z-30 min-w-[132px] overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
            {message.body ? item(tt("复制"), handlers.onCopyText) : null}
            {message.body ? item(tt("翻译"), handlers.onTranslate) : null}
            {item(tt("转发"), handlers.onForward)}
            {item(tt("多选"), handlers.onMultiSelect)}
            {permissions.canQuote ? item(tt("引用"), handlers.onQuote) : null}
            {permissions.canDelete ? item(tt("删除"), handlers.onRecall, true) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
