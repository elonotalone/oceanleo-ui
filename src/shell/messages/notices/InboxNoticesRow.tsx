"use client";

// 收件箱最上方固定的一行「通知」：显示平台通知的未读数和最新一条的标题，点开进通知视图。
// 小窗、整页、右侧栏的收件箱都画它（Inbox 自己画，境内外同一条代码路径）；搜索时 Inbox 不画。
import type { ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { NoticeAvatar } from "./notice-icons";
import { formatNoticeRowTime } from "./notice-present";
import { unreadBadgeText } from "./notice-unread";
import { useNoticeState } from "./use-notices";
import { INBOX_ROW, INBOX_ROW_IDLE, INBOX_ROW_SELECTED, UnreadBadge } from "../InboxRow";
import { noticeText } from "./notice-text";

export interface InboxNoticesRowProps {
  /** 通知视图正开着（放大 / 整页里右边就是它）。 */
  active: boolean;
  onOpen: () => void;
}

export function InboxNoticesRow({ active, onOpen }: InboxNoticesRowProps): ReactElement {
  const tt = useUI();
  const { items, unread, loaded, error } = useNoticeState(true);
  const latest = items[0];
  const badge = unreadBadgeText(unread);

  let preview = "";
  if (latest) preview = noticeText(latest, "title", tt);
  else if (loaded) preview = tt("还没有通知");
  else if (error) preview = tt("通知正在自动恢复");

  return (
    <div className="shrink-0 px-2 pb-1" data-inbox-notices-wrap="">
      <button
        type="button"
        data-testid="inbox-notices-row"
        data-inbox-notices-row=""
        data-notices-unread={unread}
        aria-current={active ? "true" : undefined}
        onClick={onOpen}
        className={`${INBOX_ROW} ${active ? INBOX_ROW_SELECTED : INBOX_ROW_IDLE}`}
      >
        <span className="relative shrink-0">
          <NoticeAvatar />
          {badge ? <UnreadBadge count={badge} label={tt("未读 {count} 条", { count: badge })} /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-medium text-stone-900">{tt("通知")}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-1 text-[12px] text-stone-500">
            <span className="truncate" data-notices-latest="">
              {preview}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-[11px] text-stone-400">
            {latest ? formatNoticeRowTime(latest.created_at, new Date(), tt("昨天")) : ""}
          </span>
        </span>
      </button>
    </div>
  );
}
