"use client";

// 聊天列表：搜索、全部会话（按最近活动倒序，事件实时更新）、新建聊天。
// 通话（calls-v2 W08）：每行读 `active_call`，实时 `call` 事件更新人数；标记组件 InboxCallDecor 注入给 InboxRow。
import { useEffect, useMemo, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { fetchDraftConversationIds } from "../../lib/im/inbox-api";
import { clearConversationHistory, markConversationUnread, patchMySettings } from "../../lib/im/groups-api";
import { ConfirmDialog } from "../../ui";
import { reasonOf } from "../../lib/im/people-api";
import type { ImConversationSummary } from "../../lib/im/types";
import { searchQueryReady } from "../../lib/im/search-api";
import { PanelToolbar } from "../leochat/PanelToolbar";
import { InboxRow } from "./InboxRow";
import { InboxCallDecor } from "./call/chat/InboxCallBadge";
import { InviteLinkDialog } from "./people/InviteLinkDialog";
import { imStore, useImConnection, useImInbox, useImResync } from "./realtime/hooks";
import { SearchView } from "./search/SearchView";

export interface InboxProps {
  activeConversationId: string | null;
  onOpenConversation: (conversationId: string, seq?: number) => void;
  onNew: () => void;
}

export function Inbox(props: InboxProps) {
  const tt = useUI();
  const inbox = useImInbox();
  const connection = useImConnection();
  const [drafts, setDrafts] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [inviting, setInviting] = useState(false);
  const [menu, setMenu] = useState<{ item: ImConversationSummary; x: number; y: number } | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [menuBusy, setMenuBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const filter = "all";
  const searching = searchQueryReady(search);

  useEffect(() => {
    const store = imStore();
    const live = store.inbox();
    // 已加载或正在加载（实时层 start() 已经在补拉）就不重复发请求。
    if (live.filter === "all" && (live.loaded || live.loading)) return;
    void store.loadInbox("all");
  }, []);

  // 实时层停 / 启把列表清空、而本组件还挂着（LeoChat 整页 / 右侧栏和全局宿主不在一棵树里）：
  // 没在加载、也没报错，就自己补拉一次，不让列表一直空着（V02 D1；正常情况下 store.start() 已经补拉）。
  const idleUnloaded = !inbox.loaded && !inbox.loading && !inbox.error;
  useEffect(() => {
    if (!idleUnloaded) return;
    const store = imStore();
    const live = store.inbox();
    if (live.loaded || live.loading || live.error) return;
    void store.loadInbox("all");
  }, [idleUnloaded]);

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

  const rows = useMemo(() => inbox.items, [inbox.items]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  async function updateConversation(patch: Parameters<typeof patchMySettings>[1] | "unread") {
    if (!menu || menuBusy) return;
    setMenuBusy(true);
    setMenuError(null);
    try {
      if (patch === "unread") await markConversationUnread(menu.item.id);
      else await patchMySettings(menu.item.id, patch);
      setMenu(null);
      await imStore().loadInbox("all");
    } catch (error) {
      setMenuError(reasonOf(error, tt("没成功，请稍后再试。")));
    } finally {
      setMenuBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="messages-inbox">
      <PanelToolbar
        search={search}
        onSearch={setSearch}
        placeholder={tt("搜索消息")}
        plusLabel={tt("新建")}
        actions={[
          { id: "new-chat", label: tt("新建聊天"), onSelect: props.onNew },
          { id: "add-contact", label: tt("添加联系人"), onSelect: () => setInviting(true) },
        ]}
      />
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
            callDecor={InboxCallDecor}
            onContextMenu={(event, item) => {
              if (item.kind === "talent") return;
              event.preventDefault();
              setMenuError(null);
              setMenu({ item, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 184)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 336)) });
            }}
          />
        ))}
        {rows.length === 0 && inbox.loaded && !inbox.loading ? (
          <div className="px-4 py-10 text-center text-sm text-black/45 dark:text-white/45">
            {tt("还没有会话")}
          </div>
        ) : null}
        {rows.length === 0 && (inbox.loading || (!inbox.loaded && !inbox.error)) ? (
          // 列表空且还没加载完（含刚被实时层清空、补拉还没发出的那一瞬）：显示「正在加载」，不留一片空白（V02 D1）。
          <div className="px-4 py-10 text-center text-sm text-black/45 dark:text-white/45" data-inbox-loading="">
            {tt("正在加载…")}
          </div>
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
      {inviting ? <InviteLinkDialog onClose={() => setInviting(false)} /> : null}
      {menu && <div role="menu" aria-label={tt("会话设置")} data-inbox-context-menu className="fixed z-[100] max-h-[min(20rem,calc(100vh-1rem))] w-[min(11rem,calc(100vw-1rem))] overflow-y-auto rounded-lg border border-neutral-200 bg-white p-1 text-[12px] text-neutral-800 shadow-xl ring-1 ring-black/5 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100" style={{ left: menu.x, top: menu.y }} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(index + (event.key === "ArrowDown" ? 1 : buttons.length - 1) + buttons.length) % buttons.length]?.focus();
      }}>
        <button autoFocus role="menuitem" type="button" disabled={menuBusy} data-inbox-action="pin" className="min-h-8 w-full rounded-md px-2.5 text-left hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:hover:bg-neutral-800" onClick={() => void updateConversation({ pinned: !menu.item.pinned })}>{menu.item.pinned ? tt("取消置顶") : tt("置顶")}</button>
        <button role="menuitem" type="button" disabled={menuBusy} data-inbox-action="unread" className="min-h-8 w-full rounded-md px-2.5 text-left hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:hover:bg-neutral-800" onClick={() => void updateConversation("unread")}>{tt("标为未读")}</button>
        <button role="menuitem" type="button" disabled={menuBusy} data-inbox-action="mute" className="min-h-8 w-full rounded-md px-2.5 text-left hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:hover:bg-neutral-800" onClick={() => void updateConversation({ muted: !menu.item.muted })}>{menu.item.muted ? tt("取消消息免打扰") : tt("消息免打扰")}</button>
        <div role="separator" className="my-1 border-t border-neutral-100 dark:border-neutral-800" />
        <button role="menuitem" type="button" data-inbox-action="window" className="min-h-8 w-full rounded-md px-2.5 text-left hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:hover:bg-neutral-800" onClick={() => {
          window.open(`/leochat?im=${encodeURIComponent(menu.item.id)}`, "_blank", "noopener,noreferrer,popup,width=1000,height=760");
          setMenu(null);
        }}>{tt("独立窗口显示")}</button>
        <button role="menuitem" type="button" disabled={menuBusy} data-inbox-action="hide" className="min-h-8 w-full rounded-md px-2.5 text-left hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:hover:bg-neutral-800" onClick={() => void updateConversation({ hidden: true })}>{tt("不显示")}</button>
        <div role="separator" className="my-1 border-t border-neutral-100 dark:border-neutral-800" />
        <button role="menuitem" type="button" disabled={menuBusy} data-inbox-action="delete" className="min-h-8 w-full rounded-md px-2.5 text-left text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 dark:hover:bg-red-950/40" onClick={() => { setDeleting(menu.item.id); setMenu(null); }}>{tt("删除")}</button>
        {menuError && <p role="alert" className="px-3 py-2 text-red-600">{menuError}</p>}
      </div>}
      {deleting && <ConfirmDialog title={tt("删除聊天")} body={tt("删除此聊天及你自己的聊天记录，其他成员的记录不受影响。新消息到来时会话会重新显示。")} confirmLabel={tt("删除")} danger onCancel={() => setDeleting(null)} onConfirm={async () => {
        try {
          await clearConversationHistory(deleting, true);
          setDeleting(null);
          await imStore().loadInbox("all");
        } catch (error) {
          setMenuError(reasonOf(error, tt("没成功，请稍后再试。")));
          setDeleting(null);
        }
      }} />}
      {menuError && !menu && <p role="alert" className="px-3 py-2 text-[12px] text-red-600">{menuError}</p>}
    </div>
  );
}
