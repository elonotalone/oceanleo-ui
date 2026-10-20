"use client";

// 请求：收到的联系人请求（接受 / 拒绝）、发出的（撤回）、别人拉我进群的邀请（接受 / 拒绝）。

import { useEffect, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  listContactRequests,
  deleteContactRequestHistory,
  listGroupInvites,
  reasonOf,
  respondContactRequest,
  respondGroupInvite,
  useLoader,
} from "../../../lib/im/people-api";
import { GroupAvatar, PersonAvatar } from "../groups/GroupAvatar";
import { useImEvent } from "../realtime/hooks";

export interface RequestsListProps {
  query?: string;
  onOpenProfile?: (userId: string) => void;
  onOpenConversation?: (conversationId: string) => void;
  /** 处理完一条后通知上层（刷新角标） */
  onChanged?: () => void;
}

const btn = "rounded-lg border border-neutral-200 px-2.5 py-1 text-[12px] text-neutral-700 hover:bg-white disabled:opacity-50";
const btnPrimary = "rounded-lg bg-neutral-900 px-2.5 py-1 text-[12px] font-medium text-white disabled:opacity-50";

export function RequestsList({ query, onOpenProfile, onOpenConversation, onChanged }: RequestsListProps) {
  const tt = useUI();
  const incoming = useLoader(() => listContactRequests("in"), []);
  const outgoing = useLoader(() => listContactRequests("out"), []);
  const invites = useLoader(listGroupInvites, []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const menuAnchorRef = useRef<HTMLElement | null>(null);

  function reloadAll() {
    incoming.reload();
    outgoing.reload();
    invites.reload();
    onChanged?.();
  }
  useImEvent("contact.request", reloadAll);
  useImEvent("contact.changed", reloadAll);
  useImEvent("group.invite", reloadAll);

  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!(target instanceof Element) || !target.closest('[role="menu"]')) closeMenu();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      closeMenu();
      menuAnchorRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [menu]);

  function openMenu(id: string, anchor: HTMLElement, x?: number, y?: number) {
    menuAnchorRef.current = anchor;
    const rect = anchor.getBoundingClientRect();
    setMenu({ id, x: x ?? rect.left, y: y ?? rect.bottom });
  }

  function closeMenu() {
    setMenu(null);
  }

  async function act(id: string, action: () => Promise<void>) {
    setBusyId(id);
    setNote(null);
    try {
      await action();
    } catch (e) {
      setNote(reasonOf(e, tt("没成功，请稍后再试。")));
    } finally {
      setBusyId(null);
      reloadAll();
    }
  }

  const needle = (query ?? "").trim().toLocaleLowerCase();
  const hit = (name: string) => !needle || name.toLocaleLowerCase().includes(needle);
  const pendingIn = (incoming.data ?? []).filter((r) => hit(r.from.display_name));
  const pendingOut = (outgoing.data ?? []).filter((r) => hit(r.to.display_name));
  const statusCopy = { pending: "等对方同意", accepted: "已添加", declined: "已拒绝", cancelled: "已撤回", expired: "已过期" } as const;
  const groupInvites = (invites.data ?? []).filter((g) => hit(g.conversation.title));
  const empty = pendingIn.length + pendingOut.length + groupInvites.length === 0;

  return (
    <div className="min-h-0 overflow-y-auto" data-requests-list>
      {menu && <div role="menu" aria-label={tt("更多")} className="fixed z-50 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg" style={{ left: menu.x, top: menu.y }}>
        <button type="button" role="menuitem" autoFocus className="rounded-md px-5 py-2 text-left text-[13px] text-red-600 hover:bg-red-50" onClick={() => { const id = menu.id; closeMenu(); void act(id, () => deleteContactRequestHistory(id)); }}>{tt("删除")}</button>
      </div>}
      {note && (
        <p role="status" className="px-3 pb-2 text-[12px] text-red-600">
          {note}
        </p>
      )}
      {empty && (
        <p className="px-3 py-8 text-center text-[12px] text-neutral-400" data-requests-empty>
          {incoming.loading || outgoing.loading || invites.loading ? tt("加载中…") : tt("没有待处理的请求。")}
        </p>
      )}

      {pendingIn.length > 0 && (
        <section data-section="incoming">
          <h4 className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">{tt("收到的联系人请求")}</h4>
          <ul>
            {pendingIn.map((r) => (
              <li key={r.id} data-request={r.id} tabIndex={0} aria-haspopup="menu" onContextMenu={(event) => { event.preventDefault(); openMenu(r.id, event.currentTarget, event.clientX, event.clientY); }} onKeyDown={(event) => { if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); openMenu(r.id, event.currentTarget); } }} className="flex items-center gap-3 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-400">
                <button type="button" onClick={() => onOpenProfile?.(r.from.user_id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <PersonAvatar name={r.from.display_name} src={r.from.avatar_url} seed={r.from.user_id} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-neutral-900">{r.from.display_name}</span>
                    {r.message && <span className="block truncate text-[12px] text-neutral-500">{r.message}</span>}
                  </span>
                </button>
                {r.status !== "pending" ? <span className="text-[12px] text-neutral-400">{tt(statusCopy[r.status])}</span> : <><button type="button" disabled={busyId === r.id} data-action="accept" className={btnPrimary} onClick={() => act(r.id, () => respondContactRequest(r.id, "accept"))}>
                  {tt("接受")}
                </button>
                <button type="button" disabled={busyId === r.id} data-action="decline" className={btn} onClick={() => act(r.id, () => respondContactRequest(r.id, "decline"))}>
                  {tt("拒绝")}
                </button></>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {groupInvites.length > 0 && (
        <section data-section="group-invites">
          <h4 className="mt-2 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">{tt("拉你进群的邀请")}</h4>
          <ul>
            {groupInvites.map((g) => (
              <li key={g.id} data-group-invite={g.id} className="flex items-center gap-3 px-3 py-2">
                <GroupAvatar name={g.conversation.title} src={g.conversation.avatar_url} seed={g.conversation.id} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-neutral-900">{g.conversation.title}</span>
                  <span className="block truncate text-[12px] text-neutral-500">
                    {tt("{name} 邀请你加入 · {n} 人", { name: g.inviter.display_name, n: g.conversation.member_count })}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busyId === g.id}
                  data-action="accept-group"
                  className={btnPrimary}
                  onClick={() =>
                    act(g.id, async () => {
                      const r = await respondGroupInvite(g.id, "accept");
                      const id = r.conversation_id ?? g.conversation.id;
                      if (id) onOpenConversation?.(id);
                    })
                  }
                >
                  {tt("加入")}
                </button>
                <button type="button" disabled={busyId === g.id} data-action="decline-group" className={btn} onClick={() => act(g.id, async () => void (await respondGroupInvite(g.id, "decline")))}>
                  {tt("拒绝")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pendingOut.length > 0 && (
        <section data-section="outgoing">
          <h4 className="mt-2 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">{tt("我发出的请求")}</h4>
          <ul>
            {pendingOut.map((r) => (
              <li key={r.id} data-request={r.id} tabIndex={0} aria-haspopup="menu" onContextMenu={(event) => { event.preventDefault(); openMenu(r.id, event.currentTarget, event.clientX, event.clientY); }} onKeyDown={(event) => { if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); openMenu(r.id, event.currentTarget); } }} className="flex items-center gap-3 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-400">
                <PersonAvatar name={r.to.display_name} src={r.to.avatar_url} seed={r.to.user_id} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-neutral-900">{r.to.display_name}</span>
                  <span className="block text-[12px] text-neutral-500">{tt(statusCopy[r.status])}</span>
                </span>
                {r.status === "pending" && <button type="button" disabled={busyId === r.id} data-action="cancel" className={btn} onClick={() => act(r.id, () => respondContactRequest(r.id, "cancel"))}>
                  {tt("撤回")}
                </button>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
