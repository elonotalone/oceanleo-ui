"use client";

import { QUIET, MessageSettingsFrame } from "../MessageSettingsFrame";

import type { ReactElement } from "react";
import type { NotificationItem } from "../../../api/notifications";
import { useUI } from "../../../i18n/ui/useUI";
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

export function NoticeDetailView({ noticeId, onBack }: NoticeDetailViewProps): ReactElement {
  const tt = useUI();
  const state = useNoticeState(true);
  const item: NotificationItem | undefined = noticeId ? state.items.find((candidate) => candidate.id === noticeId) : undefined;

  return (
    <MessageSettingsFrame title={tt("通知详情")} onBack={onBack} backButtonProps={{ "data-notice-detail-back": "" } as React.ButtonHTMLAttributes<HTMLButtonElement>} data-notice-detail="" data-testid="notice-detail-view">
      {item ? <NoticeDetailContent item={item} tt={tt} /> : <MissingNotice tt={tt} />}
    </MessageSettingsFrame>
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
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 dark:bg-white/10 dark:text-neutral-300">
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
          className={`${QUIET} mt-6`}
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
