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
import type { ShareModeState } from "./useShareMode";

export interface TaskSharePanelProps {
  taskId: string;
  taskUrl: string;
  access: TaskAccess;
  share: ShareModeState;
  client?: TaskAccessClient;
  onParticipants?: (count: number) => void;
  /** Allows the task actions menu to open this same panel. */
  openRequest?: number;
}

export function TaskSharePanel({ taskId, taskUrl, access, share, client = taskAccessClient, onParticipants, openRequest = 0 }: TaskSharePanelProps) {
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
  useEffect(() => { if (openRequest) { setOpen(true); setPage("actions"); } }, [openRequest]);
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
  const actionClass = "w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ring)] disabled:opacity-50";
  return <>
    <button ref={anchorRef} type="button" data-share-entry={open ? "active" : "idle"} aria-label={tt(copy.share)} title={tt(copy.share)}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined}
      onClick={() => {
        if (!open) { setPage("actions"); if (!share.active && share.selectable.length) share.enter("all"); }
        setOpen(!open);
      }} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-[var(--foreground)] hover:bg-[var(--muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ring)]">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 16V3m-5 5 5-5 5 5M5 13v7h14v-7" /></svg>
      <span className="hidden sm:inline">{tt(copy.share)}</span>
    </button>
    <AccessPopover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} title={tt(copy.share)} id={panelId} width={page === "actions" ? 264 : 480}>
      {page === "actions" ? <div data-task-share-actions>
        {canManage && <button type="button" className={actionClass} onClick={() => void openMembers()}>{tt(copy.share)}</button>}
        <button type="button" className={actionClass} title={tt("复制文本")} disabled={!!share.busy || !share.selectedCount} onClick={() => void share.copyText()}>{tt("复制文本")}</button>
        <button type="button" className={actionClass} title={tt("生成长图")} disabled={!!share.busy || !share.selectedCount} onClick={() => void share.generateImage()}>{tt("生成长图")}</button>
        <button type="button" className={actionClass} title={tt("生成文档")} disabled={!!share.busy || !share.selectedCount} onClick={() => void share.generateDocument()}>{tt("生成文档")}</button>
        <button type="button" className={actionClass} onClick={() => { share.exit(); setOpen(false); }}>{tt(copy.clearSelection)}</button>
        {share.active && <div className="mt-1 flex items-center justify-between border-t border-[var(--border)] px-3 pt-2 text-xs text-[var(--muted-foreground)]">
          <span>{tt("已选 {count} 条", { count: share.selectedCount })}</span>
          <button type="button" onClick={share.toggleAll}>{tt(share.allSelected ? "取消全选" : "全选")}</button>
        </div>}
        {share.notice && <p role="status" className="px-3 pt-2 text-xs">{share.notice.text}</p>}
      </div> : <div data-task-share-members>
        <div className="mb-3 flex items-center gap-2">
          <button type="button" aria-label={tt(copy.back)} onClick={() => setPage("actions")} className="rounded-lg p-2 hover:bg-[var(--muted)]">←</button>
          <h2 className="font-semibold">{tt(copy.share)}</h2>
        </div>
        <label className="block text-sm" htmlFor={`${panelId}-general`}>{tt(copy.generalAccess)}</label>
        <select id={`${panelId}-general`} value={general === "private" ? "public_view" : general} disabled={busy || general === "private"}
          onChange={event => void setAccess(event.target.value as "public_view" | "restricted")}
          className="my-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 text-sm">
          <option value="public_view">{tt(copy.publicView)}</option><option value="restricted">{tt(copy.restricted)}</option>
        </select>
        <button type="button" className="mb-3 rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--muted)]" disabled={busy || general === "private"}
          onClick={() => void writeClipboardText(taskUrl).then(ok => { setNotice(ok ? tt("链接已复制。") : tt("复制失败，请手动复制链接。")); })}>{tt(copy.copyLink)}</button>
        {error && <div role="alert" className="mb-2 text-sm">{error} <button type="button" onClick={() => void openMembers()} className="underline">{tt(copy.retry)}</button></div>}
        {notice && <p role="status" className="mb-2 text-xs">{notice}</p>}
        {loaded && <MemberPanel owner={access.owner} members={members} canManage={canManage} busy={busy}
          onInvite={(email, role) => mutate(() => client.invite(taskId, email, role))}
          onChangeRole={(id, role) => mutate(() => client.changeRole(taskId, id, role))}
          onRemove={id => mutate(() => client.remove(taskId, id))} />}
        {busy && <span role="status" aria-label={tt("正在加载…")} className="v-spinner" />}
      </div>}
    </AccessPopover>
  </>;
}
