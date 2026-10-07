"use client";

// 聊天列表：搜索、筛选、会话（按最近活动倒序，事件实时更新）、新建聊天。
import { useEffect, useMemo, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { fetchDraftConversationIds, type InboxFilter } from "../../lib/im/inbox-api";
import { searchQueryReady } from "../../lib/im/search-api";
import { InboxFilters } from "./InboxFilters";
import { InboxRow } from "./InboxRow";
import { ImPlusIcon } from "./messages-surface";
import { imStore, useImConnection, useImInbox, useImResync } from "./realtime/hooks";
import { SearchView } from "./search/SearchView";

export interface InboxProps {
  activeConversationId: string | null;
  initialFilter?: string;
  onOpenConversation: (conversationId: string, seq?: number) => void;
  onFilterChange?: (filter: string) => void;
  onNew: () => void;
}

export function Inbox(props: InboxProps) {
  const tt = useUI();
  const inbox = useImInbox();
  const connection = useImConnection();
  const [drafts, setDrafts] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const filter = inbox.filter;
  const searching = searchQueryReady(search);

  useEffect(() => {
    const store = imStore();
    const want = props.initialFilter || "all";
    if (!store.inbox().loaded || store.inbox().filter !== want) void store.loadInbox(want);
    // 外部（如 talent 的「在全部消息里查看」）带着新的 filter 再次打开时，也要切过去。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.initialFilter]);

  // 打开 / 切回聊天列表、重连之后，各取一次草稿。
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

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="messages-inbox">
      <div className="px-1.5 pt-1.5">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={tt("搜索消息")}
          aria-label={tt("搜索消息")}
          data-inbox-search=""
          className="w-full rounded-xl border-0 bg-neutral-100/80 px-3 py-2 text-[14px] focus:outline-none dark:bg-white/10"
        />
      </div>
      {searching ? (
        <SearchView
          query={search}
          onQueryChange={setSearch}
          hideInput
          conversationId={null}
          onOpenResult={(id, seq) => props.onOpenConversation(id, seq)}
        />
      ) : (
      <>
      <div className="flex items-center gap-0.5 pr-1.5">
        <div className="min-w-0 flex-1">
          <InboxFilters value={filter} onChange={changeFilter} />
        </div>
        <button
          type="button"
          data-im-chrome-btn
          onClick={props.onNew}
          aria-label={tt("新建聊天")}
          title={tt("新建聊天")}
        >
          <ImPlusIcon />
        </button>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={(event) => {
          const el = event.currentTarget;
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) void imStore().loadMoreInbox();
        }}
      >
        {connection !== "open" && connection !== "disabled" ? (
          <div className="px-3 py-1.5 text-center text-[12px] text-black/40 dark:text-white/40" role="status">
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
            {filter === "all" ? tt("还没有会话") : tt("这个分类下没有会话")}
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
      </>
      )}
    </div>
  );
}
