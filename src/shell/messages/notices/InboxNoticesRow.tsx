"use client";

// 收件箱最上方固定的一行「通知」：显示平台通知的未读数和最新一条的标题，点开进通知视图。
// 小窗、整页、右侧栏的收件箱都画它（Inbox 自己画，境内外同一条代码路径）；搜索时 Inbox 不画。
import type { ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { NoticeAvatar } from "./notice-icons";
import { formatNoticeRowTime } from "./notice-present";
import { unreadBadgeText } from "./notice-unread";
import { useNoticeState } from "./use-notices";

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
  if (latest) preview = tt(latest.title);
  else if (loaded) preview = tt("还没有通知");
  else if (error) preview = tt("通知暂时打不开");

  return (
    <div className="shrink-0 border-b border-black/[0.06] py-0.5 dark:border-white/10" data-inbox-notices-wrap="">
      <button
        type="button"
        data-testid="inbox-notices-row"
        data-inbox-notices-row=""
        data-notices-unread={unread}
        aria-current={active ? "true" : undefined}
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
      >
        <span className="relative shrink-0">
          <NoticeAvatar />
          {badge ? (
            <span
              data-im-unread=""
              data-im-unread-count={badge}
              aria-label={tt("未读 {count} 条", { count: badge })}
              className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium leading-none text-white"
            >
              {badge}
            </span>
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold tracking-tight">{tt("通知")}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-1 text-[12px] text-black/40 dark:text-white/40">
            <span className="truncate" data-notices-latest="">
              {preview}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-[12px] text-black/35 dark:text-white/35">
            {latest ? formatNoticeRowTime(latest.created_at, new Date(), tt("昨天")) : ""}
          </span>
        </span>
      </button>
    </div>
  );
}
