"use client";

import { AutoRecovery } from "../AutoRecovery";
// 聊天列表：搜索、全部会话（按最近活动倒序，事件实时更新）、新建聊天。
// 通话（calls-v2 W08）：每行读 `active_call`，实时 `call` 事件更新人数；标记组件 InboxCallDecor 注入给 InboxRow。
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FloatingMenu, FloatingMenuItem, FloatingMenuSeparator } from "../../ui/menu/FloatingMenu";
import { useUI } from "../../i18n/ui/useUI";
import { RoutePageSkeleton } from "../nav-source/route-boundary";
import { fetchDraftConversationIds } from "../../lib/im/inbox-api";
import { clearConversationHistory, markConversationUnread, patchMySettings } from "../../lib/im/groups-api";
import { MessageConfirmDialog as ConfirmDialog } from "./MessageSettingsFrame";
import { reasonOf } from "../../lib/im/people-api";
import type { ImConversationSummary } from "../../lib/im/types";
import { searchQueryReady } from "../../lib/im/search-api";
import { PanelToolbar } from "../leochat/PanelToolbar";
import { InboxRow } from "./InboxRow";
import { InboxCallDecor } from "./call/chat/InboxCallBadge";
import { InboxNoticesRow } from "./notices/InboxNoticesRow";
import { NewConversationDialog } from "./groups/NewConversationDialog";
import { imStore, useImConnection, useImInbox, useImResync } from "./realtime/hooks";
import { SearchView } from "./search/SearchView";
import { isInboxConversation } from "./inbox-view";

export interface InboxProps {
  activeConversationId: string | null;
  onOpenConversation: (conversationId: string, seq?: number) => void;
  onNew: () => void;
  /** 最上方固定的「通知」行被点开：进通知视图（小窗、整页、右侧栏三处都画这一行，境内外一样）。 */
  onOpenNotices: () => void;
  /** 通知视图正开着（放大 / 整页里右边就是它）。 */
  noticesActive?: boolean;
}

/** 右键菜单的一项：外面包一层带 `data-inbox-action` 的 contents 节点，菜单本身仍是共用的 FloatingMenuItem。 */
function MenuAction({ action, children }: { action: string; children: ReactNode }) {
  return <div data-inbox-action={action} className="contents">{children}</div>;
}

export function Inbox(props: InboxProps) {
  const tt = useUI();
  const inbox = useImInbox();
  const connection = useImConnection();
  const [drafts, setDrafts] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [menu, setMenu] = useState<{ item: ImConversationSummary; x: number; y: number } | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [menuBusy, setMenuBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const filter = "all";
  const menuAnchorRef = useRef<HTMLSpanElement | null>(null);
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

  // 项目里的会话（session）与旧的任务会话不属于 LeoChat：服务端已经不给，这里再挡一次。
  const rows = useMemo(() => inbox.items.filter(isInboxConversation), [inbox.items]);
  const openRow = (id: string) => props.onOpenConversation(id);

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

  if (creating) return <NewConversationDialog open onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); props.onOpenConversation(id); }} />;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="messages-inbox">
      <PanelToolbar
        search={search}
        onSearch={setSearch}
        placeholder={tt("搜索消息")}
        plusLabel={tt("新建聊天")}
        actions={[
          { id: "new-chat", label: tt("新建聊天"), onSelect: () => setCreating(true) },
        ]}
      />
      {searching ? (
        <SearchView
          onBack={() => setSearch("")}
          query={search}
          onQueryChange={setSearch}
          hideInput
          conversationId={null}
          onOpenResult={(id, seq) => props.onOpenConversation(id, seq)}
        />
      ) : (
      <>
      <InboxNoticesRow active={props.noticesActive === true} onOpen={props.onOpenNotices} />
      <div
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-2"
        onScroll={(event) => {
          const el = event.currentTarget;
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) void imStore().loadMoreInbox();
        }}
      >
        {connection !== "open" && connection !== "disabled" ? (
          <div className="px-3 py-1.5 text-center text-[12px] text-stone-400" role="status">
            {tt("正在连接…")}
          </div>
        ) : null}
        {rows.map((item) => (
          <InboxRow
            key={item.id}
            item={item}
            active={item.id === props.activeConversationId}
            hasDraft={drafts.has(item.id) && item.id !== props.activeConversationId}
            onOpen={openRow}
            callDecor={InboxCallDecor}
            onContextMenu={(event, item) => {
              if (item.kind === "talent") return;
              event.preventDefault();
              setMenuError(null);
              setMenu({ item, x: event.clientX, y: event.clientY });
            }}
          />
        ))}
        {rows.length === 0 && inbox.loaded && !inbox.loading ? (
          <div className="px-4 py-10 text-center text-[13px] text-stone-400" data-inbox-empty="all">
            {tt("还没有会话")}
          </div>
        ) : null}
        {rows.length === 0 && (inbox.loading || (!inbox.loaded && !inbox.error)) ? (
          // 列表空且还没加载完（含刚被实时层清空、补拉还没发出的那一瞬）：显示「正在加载」，不留一片空白（V02 D1）。
          // 2026-10-31 W5：与 LeoChat 页、任务切换同一个页面级骨架（`/projects` 那一套），不再是一行字。
          <div data-inbox-loading="">
            <RoutePageSkeleton variant="list" label={tt("正在加载…")} />
          </div>
        ) : null}
        {inbox.error && rows.length === 0 && !inbox.loading ? (
          <AutoRecovery identity="src/shell/messages/Inbox.tsx:0" error={inbox.error} recover={() => imStore().loadInbox(filter)} />
        ) : null}
        {inbox.nextCursor ? (
          <button
            type="button"
            onClick={() => void imStore().loadMoreInbox()}
            className="mt-1 block w-full rounded-lg px-3 py-1.5 text-center text-[12px] text-stone-500 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-stone-100 hover:text-stone-800"
          >
            {inbox.loading ? tt("正在加载…") : tt("加载更多")}
          </button>
        ) : null}
      </div>
      </>
      )}
      {menu ? (
        <span ref={menuAnchorRef} aria-hidden="true" className="pointer-events-none fixed h-0 w-0" style={{ left: menu.x, top: menu.y }} />
      ) : null}
      <FloatingMenu
        open={menu != null}
        anchorRef={menuAnchorRef}
        onClose={() => setMenu(null)}
        align="start"
        preferredPlacement="below"
        width={184}
        ariaLabel={tt("会话设置")}
        attributes={{ "data-inbox-context-menu": "" }}
      >
        {menu ? (
          <>
            <MenuAction action="pin"><FloatingMenuItem disabled={menuBusy} label={menu.item.pinned ? tt("取消置顶") : tt("置顶聊天")} onSelect={() => void updateConversation({ pinned: !menu.item.pinned })} /></MenuAction>
            <MenuAction action="unread"><FloatingMenuItem disabled={menuBusy} label={tt("标为未读")} onSelect={() => void updateConversation("unread")} /></MenuAction>
            <MenuAction action="mute"><FloatingMenuItem disabled={menuBusy} label={menu.item.muted ? tt("取消消息免打扰") : tt("消息免打扰")} onSelect={() => void updateConversation({ muted: !menu.item.muted })} /></MenuAction>
            <FloatingMenuSeparator />
            <MenuAction action="window">
              <FloatingMenuItem
              label={tt("独立窗口显示")}
              onSelect={() => {
                window.open(`/leochat?im=${encodeURIComponent(menu.item.id)}`, "_blank", "noopener,noreferrer,popup,width=1000,height=760");
                setMenu(null);
              }}
            />
            </MenuAction>
            <MenuAction action="hide"><FloatingMenuItem disabled={menuBusy} label={tt("不显示")} onSelect={() => void updateConversation({ hidden: true })} /></MenuAction>
            <FloatingMenuSeparator />
            <MenuAction action="delete"><FloatingMenuItem danger disabled={menuBusy} label={tt("删除")} onSelect={() => { setDeleting(menu.item.id); setMenu(null); }} /></MenuAction>
            {menuError ? <p role="alert" className="px-2.5 py-1.5 text-[12px] text-rose-600">{menuError}</p> : null}
          </>
        ) : null}
      </FloatingMenu>
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
      {menuError && !menu && <p role="alert" className="px-3 py-2 text-[12px] text-rose-600">{menuError}</p>}
    </div>
  );
}
