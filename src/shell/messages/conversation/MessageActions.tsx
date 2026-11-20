"use client";

// The per-message menu: Copy, Translate, Forward, Select multiple, Quote, Delete. It opens ONLY on a right click (or a
// long press on touch) at the pointer — no hover toolbar, no "…" button (operator 2026-11-20 (i)). Same FloatingMenu as
// the task page's "…" and Share menus.
import { useRef } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { SS_UC_COPY as copy } from "../../../i18n/ui/messages/ss-uc-copy";
import type { ImMessage } from "../../../lib/im/types";
import { FloatingMenu, FloatingMenuItem, FloatingMenuSeparator } from "../../../ui/menu/FloatingMenu";

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

export interface MenuPoint {
  x: number;
  y: number;
}

const ICONS = {
  copy: "M9 9h11v11H9zM5 15V5h10",
  translate: "M4 5h8M8 3v2m2 0c-1 4-3.5 7-6 8m2.5-4.5C7.5 10 9.5 12 12 13m1 8 4-9 4 9m-6.8-3h5.6",
  forward: "M4 12v-1a7 7 0 0 1 7-7h8m0 0-4-4m4 4-4 4",
  select: "M4 12l5 5L20 6",
  quote: "M7 7h4v4H8a1 1 0 0 0-1 1v5M13 7h4v4h-3a1 1 0 0 0-1 1v5",
  delete: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
} as const;

function MenuIcon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[name]} />
    </svg>
  );
}

/** The menu at `at` (viewport coordinates of the right click / long press); closed when `at` is null. */
export function MessageContextMenu({
  message,
  permissions,
  handlers,
  at,
  onClose,
}: {
  message: ImMessage;
  permissions: MessageActionPermissions;
  handlers: MessageActionHandlers;
  at: MenuPoint | null;
  onClose: () => void;
}) {
  const tt = useUI();
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const run = (action: () => void) => () => {
    onClose();
    action();
  };
  const hasText = Boolean(message.body);
  return (
    <>
      {/* A 1 px point at the pointer is the menu's anchor; the menu flips when there is no room. */}
      {at ? (
        <span
          ref={anchorRef}
          aria-hidden="true"
          data-message-menu-anchor=""
          className="pointer-events-none fixed h-px w-px"
          style={{ left: at.x, top: at.y }}
        />
      ) : null}
      <FloatingMenu
        key={at ? `${at.x}:${at.y}` : "closed"}
        open={Boolean(at)}
        anchorRef={anchorRef}
        onClose={onClose}
        align="start"
        preferredPlacement="below"
        width={200}
        ariaLabel={tt(copy.messageActions)}
        attributes={{ "data-message-actions": "" }}
      >
        {hasText ? <FloatingMenuItem icon={<MenuIcon name="copy" />} label={tt("复制")} onSelect={run(handlers.onCopyText)} /> : null}
        {hasText ? <FloatingMenuItem icon={<MenuIcon name="translate" />} label={tt("翻译")} onSelect={run(handlers.onTranslate)} /> : null}
        <FloatingMenuItem icon={<MenuIcon name="forward" />} label={tt("转发")} onSelect={run(handlers.onForward)} />
        <FloatingMenuItem icon={<MenuIcon name="select" />} label={tt("多选")} onSelect={run(handlers.onMultiSelect)} />
        {permissions.canQuote ? <FloatingMenuItem icon={<MenuIcon name="quote" />} label={tt("引用")} onSelect={run(handlers.onQuote)} /> : null}
        {permissions.canDelete ? (
          <>
            <FloatingMenuSeparator />
            <FloatingMenuItem icon={<MenuIcon name="delete" />} label={tt("删除")} danger onSelect={run(handlers.onRecall)} />
          </>
        ) : null}
      </FloatingMenu>
    </>
  );
}
