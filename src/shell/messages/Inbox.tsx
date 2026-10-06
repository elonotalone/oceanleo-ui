"use client";

// 收件箱：筛选、会话列表（按最近活动倒序，事件实时更新）、新建 / 搜索 / 联系人 / 设置入口。
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { fetchDraftConversationIds, type InboxFilter } from "../../lib/im/inbox-api";
import { InboxFilters } from "./InboxFilters";
import { InboxRow } from "./InboxRow";
import { imStore, useImConnection, useImInbox, useImResync, useImUnread } from "./realtime/hooks";

export interface InboxProps {
  activeConversationId: string | null;
  initialFilter?: string;
  onOpenConversation: (conversationId: string) => void;
  onNew: () => void;
  onSearch: () => void;
  onPeople: () => void;
  onSettings: () => void;
  onFilterChange?: (filter: string) => void;
}

function HeaderButton({
  label,
  onClick,
  badge,
  children,
}: {
  label: string;
  onClick: () => void;
  badge?: number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="relative rounded-md p-1.5 text-black/65 hover:bg-black/5 dark:text-white/65 dark:hover:bg-white/10"
    >
      {children}
      {badge && badge > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 min-w-[1rem] rounded-full bg-red-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </button>
  );
}

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-4 w-4",
  "aria-hidden": true,
};

export function Inbox(props: InboxProps) {
  const tt = useUI();
  const inbox = useImInbox();
  const unread = useImUnread();
  const connection = useImConnection();
  const [drafts, setDrafts] = useState<Set<string>>(() => new Set());
  const filter = inbox.filter;

  useEffect(() => {
    const store = imStore();
    const want = props.initialFilter || "all";
    if (!store.inbox().loaded || store.inbox().filter !== want) void store.loadInbox(want);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 打开 / 切回收件箱、重连之后，各取一次草稿。
  useEffect(() => {
    let alive = true;
    void fetchDraftConversationIds().then((ids) => {
      if (alive) setDrafts(ids);
    });
    return () => {
      alive = false;
    };
  }, [props.activeConversationId]);
  useImResync(() => {
    void fetchDraftConversationIds().then(setDrafts);
  });

  const changeFilter = (next: InboxFilter) => {
    props.onFilterChange?.(next);
    void imStore().loadInbox(next);
  };

  const rows = useMemo(() => inbox.items, [inbox.items]);
  const requests = unread?.requests ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="messages-inbox">
      <div className="flex items-center justify-between gap-1 px-2 pt-2">
        <div className="flex items-center gap-1">
          <HeaderButton label={tt("新建聊天")} onClick={props.onNew}>
            <svg {...svgProps}>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </HeaderButton>
          <HeaderButton label={tt("搜索消息")} onClick={props.onSearch}>
            <svg {...svgProps}>
              <circle cx="11" cy="11" r="6.5" />
              <path d="M20 20l-4.2-4.2" />
            </svg>
          </HeaderButton>
          <HeaderButton label={tt("联系人")} onClick={props.onPeople} badge={requests}>
            <svg {...svgProps}>
              <circle cx="9" cy="8" r="3.2" />
              <path d="M3.5 19c.6-3.2 2.9-4.8 5.5-4.8s4.9 1.6 5.5 4.8M16 11.2a3 3 0 1 0 0-6M17.5 14.6c1.8.5 3 1.9 3.5 4.4" />
            </svg>
          </HeaderButton>
        </div>
        <HeaderButton label={tt("消息设置")} onClick={props.onSettings}>
          <svg {...svgProps}>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
          </svg>
        </HeaderButton>
      </div>
      <InboxFilters value={filter} onChange={changeFilter} />
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={(event) => {
          const el = event.currentTarget;
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) void imStore().loadMoreInbox();
        }}
      >
        {connection !== "open" && connection !== "disabled" ? (
          <div className="px-3 py-1.5 text-center text-xs text-amber-600 dark:text-amber-400" role="status">
            {tt("正在连接…")}
          </div>
        ) : null}
        {rows.map((item) => (
          <InboxRow
            key={item.id}
            item={item}
            active={item.id === props.activeConversationId}
            hasDraft={drafts.has(item.id) && item.id !== props.activeConversationId}
            onOpen={props.onOpenConversation}
          />
        ))}
        {rows.length === 0 && inbox.loaded && !inbox.loading ? (
          <div className="px-4 py-10 text-center text-sm text-black/45 dark:text-white/45">
            {filter === "all" ? tt("还没有会话，点左上角「+」开始聊天") : tt("这个分类下没有会话")}
          </div>
        ) : null}
        {inbox.loading && rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-black/45 dark:text-white/45">{tt("正在加载…")}</div>
        ) : null}
        {inbox.error && rows.length === 0 && !inbox.loading ? (
          <div className="px-4 py-6 text-center text-sm text-black/55 dark:text-white/55">
            <div>{tt("会话列表暂时打不开")}</div>
            <button
              type="button"
              onClick={() => void imStore().loadInbox(filter)}
              className="mt-2 rounded-md bg-black/5 px-3 py-1 text-xs hover:bg-black/10 dark:bg-white/10"
            >
              {tt("重试")}
            </button>
          </div>
        ) : null}
        {inbox.nextCursor ? (
          <button
            type="button"
            onClick={() => void imStore().loadMoreInbox()}
            className="block w-full px-3 py-2 text-center text-xs text-black/45 hover:bg-black/5 dark:text-white/45"
          >
            {inbox.loading ? tt("正在加载…") : tt("加载更多")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
