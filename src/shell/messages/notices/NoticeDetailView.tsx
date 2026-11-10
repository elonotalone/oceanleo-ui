"use client";

import type { ReactElement } from "react";
import type { NotificationItem } from "../../../api/notifications";
import { useUI } from "../../../i18n/ui/useUI";
import { ImBackIcon } from "../messages-surface";
import { NoticeBellIcon } from "./notice-icons";
import { formatNoticeTime } from "./notice-present";
import { browserNoticeActions, noticeActionable, noticeTargetOf, runNoticeTarget } from "./open-notice";
import { useNoticeState } from "./use-notices";
import { SERVER_NOTICE_KIND } from "./server-notice";
import { ServerNoticeCounts, ServerNoticeMeta } from "./ServerNoticeMeta";

interface NoticeDetailViewProps {
  noticeId: string | null;
  onBack: () => void;
}

function targetLabel(target: ReturnType<typeof noticeTargetOf>, tt: ReturnType<typeof useUI>): string {
  switch (target.kind) {
    case "conversation":
      return tt("消息");
    case "cases":
      return tt("内容处置");
    case "view":
      return tt(target.view === "people" ? "联系人" : target.view === "notices" ? "通知" : "聊天");
    case "bay":
      return tt("查看订单");
    case "internal":
    case "external":
      return tt("打开链接");
    case "none":
      return "";
  }
}

function DetailHeader({ onBack, tt }: { onBack: () => void; tt: ReturnType<typeof useUI> }): ReactElement {
  return (
    <header className="flex shrink-0 items-center gap-1 border-b border-neutral-200/80 px-2 py-2">
      <button type="button" data-im-chrome-btn data-notice-detail-back="" onClick={onBack} aria-label={tt("返回")}>
        <ImBackIcon />
      </button>
      <h2 className="min-w-0 flex-1 truncate px-1 text-[13px] font-semibold tracking-tight text-neutral-900 dark:text-white">
        {tt("通知详情")}
      </h2>
    </header>
  );
}

export function NoticeDetailView({ noticeId, onBack }: NoticeDetailViewProps): ReactElement {
  const tt = useUI();
  const state = useNoticeState(true);
  const item: NotificationItem | undefined = noticeId ? state.items.find((candidate) => candidate.id === noticeId) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-notice-detail="" data-testid="notice-detail-view">
      <DetailHeader onBack={onBack} tt={tt} />
      {item ? <NoticeDetailContent item={item} tt={tt} /> : <MissingNotice tt={tt} />}
    </div>
  );
}

function MissingNotice({ tt }: { tt: ReturnType<typeof useUI> }): ReactElement {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10 text-center text-sm text-black/50 dark:text-white/50">
      {tt("通知暂时打不开")}
    </div>
  );
}

function NoticeDetailContent({ item, tt }: { item: NotificationItem; tt: ReturnType<typeof useUI> }): ReactElement {
  const target = noticeTargetOf(item);
  const actionable = noticeActionable(item);
  const now = new Date();
  const time = formatNoticeTime(item.created_at, now, tt("昨天"));
  return (
    <article className="min-h-0 flex-1 overflow-y-auto px-4 py-4" data-notice-detail-content="">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-white/10 dark:text-amber-400">
          <NoticeBellIcon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-[15px] font-semibold leading-snug tracking-tight text-neutral-900 dark:text-white">
            {item.kind === SERVER_NOTICE_KIND ? item.title : tt(item.title)}
          </h3>
          <ServerNoticeMeta item={item} />
          {time ? <time className="mt-1 block text-[11px] text-black/40 dark:text-white/40">{time}</time> : null}
        </div>
      </div>
      {item.body ? (
        <p className="mt-5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-black/70 dark:text-white/70">
          {item.kind === SERVER_NOTICE_KIND ? item.body : tt(item.body)}
        </p>
      ) : null}
      <ServerNoticeCounts item={item} />
      {actionable ? (
        <button
          type="button"
          data-notice-detail-target=""
          className="mt-6 rounded-lg bg-[color:var(--im-accent)] px-3 py-2 text-[12px] font-medium text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--im-accent)] focus-visible:ring-offset-2"
          onClick={() => {
            runNoticeTarget(target, browserNoticeActions());
          }}
        >
          {targetLabel(target, tt)}
        </button>
      ) : null}
    </article>
  );
}
