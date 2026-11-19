"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { SHARE_ACCESS_COPY_SOURCE as copy } from "../../i18n/ui/messages/share-access-copy-source";
import { AccessPopover } from "../access/AccessPopover";
import { MemberPanel } from "../access/MemberPanel";
import type { AccessMember } from "../access/access-types";
import { notifyTaskAccessChanged } from "../access/useTaskAccess";
import { taskAccessClient, type GeneralAccess, type TaskAccess, type TaskAccessClient } from "../access/task-access-client";
import { writeClipboardText } from "./share-clipboard";
import { ShareEntryButton } from "./ShareActionBar";
import { FloatingMenuItem, FloatingMenuLabel, FloatingMenuSeparator } from "../../ui/menu/FloatingMenu";
import type { ShareModeState } from "./useShareMode";

export interface TaskSharePanelProps {
  taskId: string;
  taskUrl: string;
  access: TaskAccess;
  share: ShareModeState;
  client?: TaskAccessClient;
  onParticipants?: (count: number) => void;
}

export function TaskSharePanel({ taskId, taskUrl, access, share, client = taskAccessClient, onParticipants }: TaskSharePanelProps) {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<"actions" | "members">("actions");
  const [general, setGeneral] = useState<GeneralAccess>(access.general_access);
  const [members, setMembers] = useState<AccessMember[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const anchorRef = useRef<HTMLButtonElement>(null);
  const generation = useRef(0);
  const initRef = useRef<Promise<unknown> | null>(null);
  const panelId = useId();
  const canManage = access.can_manage && access.role === "owner" && access.state === "owner";
  useEffect(() => {
    ++generation.current;
    setOpen(false); setPage("actions"); setLoaded(false); setMembers([]); setError(""); setNotice("");
    setGeneral(access.general_access); initRef.current = null;
    // Access polling must not reset the panel while a member changes roles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);
  useEffect(() => { setGeneral(access.general_access); }, [access.general_access]);
  useEffect(() => { if (!canManage && page === "members") setPage("actions"); }, [canManage, page]);

  const openMembers = async () => {
    if (!canManage || busy) return;
    const current = generation.current;
    setPage("members"); setError(""); setBusy(true);
    try {
      // No access row means private. Exactly here, not on opening the actions menu,
      // the first PUT publishes the owner's task using the contract default.
      if (general === "private") {
        initRef.current ??= client.setAccess(taskId, "public_view");
        try { await initRef.current; } catch (failure) { initRef.current = null; throw failure; }
        if (current !== generation.current) return;
        setGeneral("public_view"); notifyTaskAccessChanged(taskId);
      }
      const rows = await client.members(taskId);
      if (current !== generation.current) return;
      setMembers(rows); setLoaded(true);
      onParticipants?.(1 + rows.filter(row => row.role !== "owner" && row.status !== "removed" && row.status !== "declined").length);
    } catch { if (current === generation.current) setError(tt(copy.saveFailed)); }
    finally { if (current === generation.current) setBusy(false); }
  };
  const setAccess = async (value: Exclude<GeneralAccess, "private">) => {
    const previous = general;
    setGeneral(value); setError(""); setBusy(true);
    try { await client.setAccess(taskId, value); notifyTaskAccessChanged(taskId); }
    catch { setGeneral(previous); setError(tt(copy.saveFailed)); }
    finally { setBusy(false); }
  };
  const mutate = async <T,>(action: () => Promise<T>) => {
    const result = await action();
    notifyTaskAccessChanged(taskId);
    // MemberPanel keeps its optimistic row while this refresh settles.
    void client.members(taskId).then(rows => { setMembers(rows); onParticipants?.(1 + rows.filter(row => row.role !== "owner" && row.status !== "removed" && row.status !== "declined").length); }).catch(() => {});
    return result;
  };
  const close = () => { setOpen(false); share.exit(); };
  const copyLink = async () => {
    const ok = await writeClipboardText(taskUrl);
    setNotice(ok ? tt("链接已复制。") : tt("复制失败，请手动复制链接。"));
  };
  const exportDisabled = !!share.busy || !share.selectedCount;
  return <>
    <ShareEntryButton anchorRef={anchorRef} active={share.active} expanded={open} panelId={panelId}
      onClick={() => {
        if (open) { close(); return; }
        setPage("actions"); setNotice(""); share.enter("all"); setOpen(true);
      }} />
    <AccessPopover open={open} anchorRef={anchorRef} onClose={close} title={tt(page === "actions" ? copy.share : copy.membersAndAccess)}
      ignoreOutsideSelector={page === "actions" ? "[data-agent-stream]" : undefined}
      id={panelId} role={page === "actions" ? "menu" : "dialog"} width={page === "actions" ? 224 : 480}>
      {page === "actions" ? <div data-task-share-actions>
        {canManage && <><FloatingMenuItem icon={<ShareIcon name="members" />} label={tt(copy.membersAndAccess)} onSelect={() => void openMembers()} />
          <FloatingMenuSeparator /></>}
        <FloatingMenuItem icon={<ShareIcon name="link" />} label={tt(copy.copyLink)} title={tt(copy.copyLink)} onSelect={() => void copyLink()} />
        <FloatingMenuItem icon={<ShareIcon name="copy" />} label={tt("复制文本")} title={tt("复制文本")} disabled={exportDisabled} onSelect={() => void share.copyText()} />
        <FloatingMenuItem icon={<ShareIcon name="image" />} label={tt("生成长图")} title={tt("生成长图")} disabled={exportDisabled} onSelect={() => void share.generateImage()} />
        <FloatingMenuItem icon={<ShareIcon name="document" />} label={tt("生成文档")} title={tt("生成文档")} disabled={exportDisabled} onSelect={() => void share.generateDocument()} />
        <FloatingMenuSeparator />
        <FloatingMenuLabel>{tt("已选 {count} 条", { count: share.selectedCount })}</FloatingMenuLabel>
        <FloatingMenuItem icon={<ShareIcon name="select" />} label={tt(share.allSelected ? "取消全选" : "全选")} onSelect={share.toggleAll} />
        {share.notice && <p role="status" className={`px-2.5 py-1.5 text-xs ${share.notice.tone === "ok" ? "text-neutral-500 dark:text-neutral-400" : "text-rose-600 dark:text-rose-400"}`}>{share.notice.text}</p>}
        {notice && <p role="status" className="px-2.5 py-1.5 text-xs text-neutral-500 dark:text-neutral-400">{notice}</p>}
      </div> : <div data-task-share-members>
        <FloatingMenuItem icon={<ShareIcon name="back" />} label={tt(copy.back)} onSelect={() => setPage("actions")} />
        <FloatingMenuSeparator />
        <FloatingMenuLabel>{tt(copy.membersAndAccess)}</FloatingMenuLabel>
        <div className="space-y-2 px-2.5 pb-2.5 text-neutral-800 dark:text-neutral-100">
          <label className="block text-[13px]" htmlFor={`${panelId}-general`}>{tt(copy.generalAccess)}</label>
          <select id={`${panelId}-general`} value={general === "private" ? "public_view" : general} disabled={busy || general === "private"}
            onChange={event => void setAccess(event.target.value as "public_view" | "restricted")}
            className="w-full rounded-lg border border-neutral-200/80 bg-white px-2.5 py-1.5 text-[13px] outline-none focus-visible:border-neutral-400 dark:border-white/10 dark:bg-neutral-950">
            <option value="public_view">{tt(copy.publicView)}</option><option value="restricted">{tt(copy.restricted)}</option>
          </select>
        </div>
        <FloatingMenuSeparator />
        {error && <div role="alert" className="px-2.5 py-1.5 text-[13px] text-rose-600 dark:text-rose-400">{error} <button type="button" onClick={() => void openMembers()} className="underline">{tt(copy.retry)}</button></div>}
        {loaded && <MemberPanel owner={access.owner} members={members} canManage={canManage} busy={busy}
          onInvite={(email, role) => mutate(() => client.invite(taskId, email, role))}
          onChangeRole={(id, role) => mutate(() => client.changeRole(taskId, id, role))}
          onRemove={id => mutate(() => client.remove(taskId, id))} />}
        {busy && <span role="status" aria-label={tt("正在加载…")} className="v-spinner" />}
      </div>}
    </AccessPopover>
  </>;
}

const SHARE_ICONS = {
  members: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2m3 6a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2",
  copy: "M9 9h11v11H9zM5 15V5h10",
  image: "M3 3h18v18H3zM21 15l-5-5-9 9M7 7h.01",
  document: "M14 2H4v20h16V8zM14 2v6h6M8 13h8M8 17h8",
  select: "M4 12l5 5L20 6",
  back: "m12 19-7-7 7-7m-7 7h14",
} as const;

function ShareIcon({ name }: { name: keyof typeof SHARE_ICONS }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={SHARE_ICONS[name]} /></svg>;
}
