"use client";

// LeoChat 里的「通知」：平台发给本人的消息（交易订单、任务交付、账单、团队邀请、内容处置……），境内外同一套。
// 点一条：标为已读，并去它的链接——LeoBay / 会话 / 内容处置在站内打开，其余站内页站内跳，别的站新窗口（open-notice.ts）。
// 顶上「全部标记已读」。占着 LeoChat 的详情位（小窗 / 窄屏里就是整块内容区），左上角的返回回到聊天。
import { useEffect, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { ImBackIcon } from "../messages-surface";
import { useOwnerCases } from "../cases/use-owner-cases";
import { NoticeBellIcon, NoticeChevronIcon } from "./notice-icons";
import { formatNoticeTime } from "./notice-present";
import { noticeActionable, openNotice } from "./open-notice";
import { noticeStore, useNoticeState } from "./use-notices";

export interface NoticesViewProps {
  onBack: () => void;
  onCases?: () => void;
}

// This lookup is independent of the latest 200 notifications. A case remains
// reachable after its notification scrolls out of that window or is read.
function CaseRecovery({ onOpen }: { onOpen: () => void }): ReactElement | null {
  const tt = useUI();
  const { phase, cases } = useOwnerCases();
  if (phase !== "ready" || cases.length === 0) return null;
  return (
    <button
      type="button"
      data-notices-cases=""
      onClick={onOpen}
      className="shrink-0 rounded-lg px-2 py-1 text-[12px] font-medium text-[color:var(--im-accent)] hover:bg-black/5 dark:hover:bg-white/10"
    >
      {tt("内容处置")}
    </button>
  );
}

export function NoticesView({ onBack, onCases }: NoticesViewProps): ReactElement {
  const tt = useUI();
  const state = useNoticeState(true);
  const store = noticeStore();

  // 点进来先取一次最新的（轮询是 60 秒一次，点开时不该让人看 59 秒前的）。
  useEffect(() => {
    void store.refresh();
  }, [store]);

  const now = new Date();
  const yesterday = tt("昨天");

  let body: ReactElement;
  if (!state.loaded && state.error) {
    body = (
      <div className="px-4 py-10 text-center text-sm text-black/55 dark:text-white/55" data-notices-error="">
        <div>{tt("通知暂时打不开")}</div>
        <button
          type="button"
          onClick={() => void store.refresh()}
          className="mt-2 rounded-md bg-black/5 px-3 py-1 text-xs hover:bg-black/10 dark:bg-white/10"
        >
          {tt("重试")}
        </button>
      </div>
    );
  } else if (!state.loaded) {
    body = (
      <div className="px-4 py-10 text-center text-sm text-black/45 dark:text-white/45" data-notices-loading="">
        {tt("正在加载…")}
      </div>
    );
  } else if (state.items.length === 0) {
    body = (
      <div className="flex flex-col items-center px-6 py-14 text-center" data-notices-empty="">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-black/[0.04] text-black/35 dark:bg-white/10 dark:text-white/40">
          <NoticeBellIcon className="h-6 w-6" />
        </span>
        <p className="mt-3 text-[14px] font-semibold tracking-tight">{tt("还没有通知")}</p>
        <p className="mt-1 max-w-xs text-[12px] text-black/45 dark:text-white/45">
          {tt("订单、任务、账单和内容处置等平台消息会出现在这里。")}
        </p>
      </div>
    );
  } else {
    body = (
      <>
        {state.error ? (
          // 列表是旧的，最近一次刷新没成功：留着旧的，另给一条细提示和重试。
          <div
            className="flex items-center justify-center gap-2 px-3 py-1.5 text-[12px] text-black/45 dark:text-white/45"
            role="status"
            data-notices-stale=""
          >
            <span>{tt("通知暂时打不开")}</span>
            <button type="button" onClick={() => void store.refresh()} className="underline underline-offset-2">
              {tt("重试")}
            </button>
          </div>
        ) : null}
        <ul role="list" aria-label={tt("通知")} data-notices-list="">
          {state.items.map((item) => {
            const unread = !item.read_at;
            const go = noticeActionable(item);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  data-notice-row=""
                  data-notice-id={item.id}
                  data-notice-kind={item.kind}
                  data-notice-unread={unread ? "true" : "false"}
                  onClick={() => openNotice(item)}
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-white/10 dark:text-amber-400">
                    <NoticeBellIcon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      {unread ? (
                        <span
                          data-notice-dot=""
                          role="img"
                          aria-label={tt("未读")}
                          className="mb-px h-2 w-2 shrink-0 translate-y-[-1px] rounded-full bg-red-500"
                        />
                      ) : null}
                      <span
                        className={`min-w-0 flex-1 truncate text-[13px] tracking-tight ${
                          unread ? "font-semibold" : "font-medium text-black/55 dark:text-white/55"
                        }`}
                      >
                        {tt(item.title)}
                      </span>
                      <span className="shrink-0 text-[11px] text-black/35 dark:text-white/35">
                        {formatNoticeTime(item.created_at, now, yesterday)}
                      </span>
                    </span>
                    {item.body ? (
                      <span
                        className={`mt-0.5 line-clamp-2 block whitespace-pre-line text-[12px] leading-snug ${
                          unread ? "text-black/60 dark:text-white/60" : "text-black/40 dark:text-white/40"
                        }`}
                      >
                        {tt(item.body)}
                      </span>
                    ) : null}
                  </span>
                  {go ? (
                    <span className="mt-1 shrink-0 text-black/25 dark:text-white/25" data-notice-go="">
                      <NoticeChevronIcon />
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
        {state.hasMore ? (
          <button
            type="button"
            onClick={() => void store.loadMore()}
            className="block w-full px-3 py-2 text-center text-xs text-black/45 hover:bg-black/5 dark:text-white/45"
          >
            {state.loading ? tt("正在加载…") : tt("加载更多")}
          </button>
        ) : null}
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-notices-view="" data-testid="notices-view">
      <header className="flex shrink-0 items-center gap-1 border-b border-neutral-200/80 px-2 py-2">
        <button type="button" data-im-chrome-btn data-notices-back="" onClick={onBack} aria-label={tt("返回")}>
          <ImBackIcon />
        </button>
        <h2 className="min-w-0 flex-1 truncate px-1 text-[13px] font-semibold tracking-tight text-neutral-900 dark:text-white">
          {tt("通知")}
        </h2>
        {onCases ? <CaseRecovery onOpen={onCases} /> : null}
        {state.unread > 0 ? (
          <button
            type="button"
            data-notices-read-all=""
            onClick={() => void store.markAllRead()}
            className="shrink-0 rounded-lg px-2 py-1 text-[12px] font-medium text-[color:var(--im-accent)] hover:bg-black/5 dark:hover:bg-white/10"
          >
            {tt("全部标记已读")}
          </button>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
    </div>
  );
}
