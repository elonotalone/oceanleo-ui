"use client";

import { QUIET, MessageSettingsFrame } from "../MessageSettingsFrame";

// LeoChat 里的「通知」：平台发给本人的消息（交易订单、任务交付、账单、团队邀请、内容处置……），境内外同一套。
// 点一条：标为已读，并去它的链接——LeoBay / 会话 / 内容处置在站内打开，其余站内页站内跳，别的站新窗口（open-notice.ts）。
// 顶上「全部标记已读」。占着 LeoChat 的详情位（小窗 / 窄屏里就是整块内容区），左上角的返回回到聊天。
import { useEffect, useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { useOwnerCases } from "../cases/use-owner-cases";
import { NoticeBellIcon, NoticeChevronIcon } from "./notice-icons";
import { formatNoticeTime } from "./notice-present";
import { noticeActionable, openNoticeDetail } from "./open-notice";
import { activeNoticeSection, selectNoticeSection, noticeStore, useNoticeState } from "./use-notices";
import { listNotificationSections } from "../../../api/notifications";
import { OfficialNoticeForm } from "./OfficialNoticeForm";
import { useNoticeResource } from "./use-notice-resource";
import { SERVER_NOTICE_KIND } from "./server-notice";
import { ServerNoticeCounts, ServerNoticeMeta } from "./ServerNoticeMeta";
import { noticeText } from "./notice-text";

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
      className={`${QUIET} shrink-0`}
    >
      {tt("内容处置")}
    </button>
  );
}

export function NoticesView({ onBack, onCases }: NoticesViewProps): ReactElement {
  const tt = useUI();
  const sectionResult = useNoticeResource(true, listNotificationSections);
  const sections = sectionResult?.ok ? sectionResult.data?.sections : undefined;
  const builtinTitles: Record<string, string> = { leobay: "LeoBay", agent: "OceanLeo 智能体", official: "官方", system: "系统" };
  const ordered = sections ? [...sections].sort((a, b) => {
    const order = ["leobay", "agent", "official", "system"];
    return (order.includes(a.key) ? order.indexOf(a.key) : 4) - (order.includes(b.key) ? order.indexOf(b.key) : 4);
  }) : [];
  const [selected, setSelected] = useState(activeNoticeSection);
  const section = sections?.find(item => item.key === selected)?.key ?? ordered[0]?.key;
  const state = useNoticeState(true, section);
  const store = noticeStore(section);
  const current = sections?.find(item => item.key === section);
  useEffect(() => { selectNoticeSection(section); }, [section]);


  // 点进来先取一次最新的（轮询是 60 秒一次，点开时不该让人看 59 秒前的）。
  useEffect(() => {
    void store.refresh();
  }, [store]);

  const now = new Date();
  const yesterday = tt("昨天");

  let body: ReactElement;
  if (!state.loaded) {
    body = (
      <div className="px-4 py-10 text-center text-sm text-stone-500" data-notices-loading="">
        {tt("正在加载…")}
      </div>
    );
  } else if (state.items.length === 0) {
    body = (
      <div className="flex flex-col items-center px-6 py-14 text-center" data-notices-empty="">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-stone-400">
          <NoticeBellIcon className="h-6 w-6" />
        </span>
        <p className="mt-3 text-[14px] font-medium text-stone-800">{tt("还没有通知")}</p>
        <p className="mt-1 max-w-xs text-[12px] text-stone-500">
          {tt("订单、任务、账单和内容处置等平台消息会出现在这里。")}
        </p>
      </div>
    );
  } else {
    body = (
      <>
        {state.error ? (
          <div
            className="flex items-center justify-center gap-2 px-3 py-1.5 text-[12px] text-stone-500"
            role="status" data-notices-stale="">
            {tt("通知正在自动恢复")}
          </div>
        ) : null}
        <ul role="list" aria-label={tt("通知")} data-notices-list="" className="px-2 py-1">
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
                  onClick={() => openNoticeDetail(item, store)}
                  className="flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-stone-200/50"
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-200 text-stone-600">
                    <NoticeBellIcon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      {unread ? (
                        <span
                          data-notice-dot=""
                          role="img"
                          aria-label={tt("未读")}
                          className="mb-px h-2 w-2 shrink-0 translate-y-[-1px] rounded-full bg-stone-900"
                        />
                      ) : null}
                      <span
                        className={`min-w-0 flex-1 truncate text-[13px] ${
                          unread ? "font-semibold" : "font-medium text-stone-500"
                        }`}
                      >
                        {item.kind === SERVER_NOTICE_KIND ? item.title : noticeText(item, "title", tt)}
                      </span>
                      <span className="shrink-0 text-[11px] text-stone-400">
                        {formatNoticeTime(item.created_at, now, yesterday)}
                      </span>
                    </span>
                    <ServerNoticeMeta item={item} />
                    {item.body ? (
                      <span
                        className={`mt-0.5 line-clamp-2 block whitespace-pre-line text-[12px] leading-snug ${
                          unread ? "text-stone-600" : "text-stone-400"
                        }`}
                      >
                        {item.kind === SERVER_NOTICE_KIND ? item.body : noticeText(item, "body", tt)}
                      </span>
                    ) : null}
                    <ServerNoticeCounts item={item} />
                  </span>
                  {go ? (
                    <span className="mt-1 shrink-0 text-stone-400" data-notice-go="">
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
            className="block w-full px-3 py-2 text-center text-xs text-stone-500 hover:bg-stone-100"
          >
            {state.loading ? tt("正在加载…") : tt("加载更多")}
          </button>
        ) : null}
      </>
    );
  }

  return (
    <MessageSettingsFrame title={tt("通知")} onBack={onBack} backButtonProps={{ "data-notices-back": "" } as React.ButtonHTMLAttributes<HTMLButtonElement>} headerActions={<>
        {onCases ? <CaseRecovery onOpen={onCases} /> : null}
        {(current?.unread ?? state.unread) > 0 ? (
          <button
            type="button"
            data-notices-read-all=""
            onClick={() => void store.markAllRead()}
            className={`${QUIET} shrink-0`}
          >
            {tt("全部标记已读")}
          </button>
        ) : null}
      </>} data-notices-view="" data-testid="notices-view">
      {ordered.length > 0 ? (
        <div role="tablist" aria-label={tt("通知分类")} className="flex shrink-0 gap-2 overflow-x-auto border-b border-stone-200 px-3 py-2">
          {ordered.map(item => <button key={item.key} type="button" role="tab" aria-selected={section === item.key}
            data-notice-section={item.key} className="shrink-0 rounded-lg px-3 py-2 text-sm"
            onClick={() => { selectNoticeSection(item.key); setSelected(item.key); }}>
            {item.builtin ? tt(builtinTitles[item.key] ?? item.title) : item.title}
            {item.unread > 0 ? <span data-notice-section-unread className="ml-1 text-xs">{item.unread > 99 ? "99+" : item.unread}</span> : null}
          </button>)}
        </div>
      ) : null}
      {section === "official" ? <OfficialNoticeForm onSent={() => void store.refresh()} /> : null}
      {body}
    </MessageSettingsFrame>
  );
}
