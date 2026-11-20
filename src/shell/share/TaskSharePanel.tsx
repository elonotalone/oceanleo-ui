"use client";

import { BackButton } from "../../ui/BackButton";
import { useEffect, useId, useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { AutoRecovery } from "../AutoRecovery";
import { SHARE_ACCESS_COPY_SOURCE as copy } from "../../i18n/ui/messages/share-access-copy-source";
import { SW_TS_COPY as text } from "../../i18n/ui/messages/sw-ts-copy";
import { AccessPopover } from "../access/AccessPopover";
import { MemberPanel } from "../access/MemberPanel";
import type { AccessMember } from "../access/access-types";
import { notifyTaskAccessChanged } from "../access/useTaskAccess";
import { taskAccessClient, type TaskAccess, type TaskAccessClient } from "../access/task-access-client";
import { writeClipboardText } from "./share-clipboard";
import { ShareLinkError, sendShareLink } from "./share-client";
import { RW_FN_COPY as fn } from "../../i18n/ui/messages/rw-fn-copy";
import { TR_PANEL_COPY as trPanel } from "../../i18n/ui/messages/tr-panel-copy";
import { PeopleSuggestions } from "../messages/people/PeopleDiscovery";
import type { PersonCard } from "../../lib/im/people-api";
import { ShareEntryButton } from "./ShareActionBar";
import { FloatingMenuItem, FloatingMenuLabel, FloatingMenuSeparator } from "../../ui/menu/FloatingMenu";
import type { ShareModeState } from "./useShareMode";

export interface TaskSharePanelProps {
  taskId: string;
  taskUrl: string;
  access: TaskAccess;
  share: ShareModeState;
  client?: TaskAccessClient;
  /** Notify chosen people about the Share link; it grants nothing beyond the link. */
  sendShare?: (shareId: string, userIds: string[]) => Promise<void>;
  /**
   * "Invite people to discuss": this agent task becomes a sub task of a new task where people talk (the host asks
   * to confirm, then opens it). Absent = no such entry (no task rooms, a task that already has a parent task, a viewer).
   */
  onDiscuss?: () => void;
}

export function TaskSharePanel({ taskId, taskUrl, access, share, client = taskAccessClient, sendShare = sendShareLink, onDiscuss }: TaskSharePanelProps) {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<"actions" | "snapshot" | "collaborate" | "send">("actions");
  const [recipients, setRecipients] = useState<PersonCard[]>([]);
  const [members, setMembers] = useState<AccessMember[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [readError, setReadError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const [help, setHelp] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const generation = useRef(0);
  const operation = useRef(false);
  const panelId = useId();
  const canManage = access.can_manage && access.role === "owner" && access.state === "owner";
  const canParticipate = access.role === "owner" || access.role === "collaborate" || access.state === "invited" && access.invite_role === "collaborate";
  useEffect(() => {
    ++generation.current;
    setOpen(false); setPage("actions"); setLoaded(false); setMembers([]); setError(""); setReadError(null); setNotice(""); setHelp(false); setRecipients([]);
    return () => { ++generation.current; };
  }, [taskId]);

  const openPage = async (next: "snapshot" | "collaborate") => {
    if (operation.current || next === "snapshot" && !canManage) return;
    operation.current = true;
    const current = generation.current;
    setPage(next); setError(""); setReadError(null); setNotice(""); setLoaded(false); setBusy(true); setHelp(false);
    try {
      if (next === "snapshot") await share.loadSnapshot();
      else {
        const rows = await client.members(taskId);
        if (current !== generation.current) return;
        setMembers(rows);
      }
      if (current === generation.current) setLoaded(true);
    } catch (failure) { if (current === generation.current) setReadError(failure || new Error("share_read_unavailable")); }
    finally { operation.current = false; if (current === generation.current) setBusy(false); }
  };
  const setSnapshot = async (enabled: boolean) => {
    if (operation.current || !canManage) return;
    operation.current = true; setBusy(true); setError(""); setNotice("");
    try { await share.setSnapshotEnabled(enabled); }
    catch { setError(tt(copy.saveFailed)); }
    finally { operation.current = false; setBusy(false); }
  };
  const mutate = async <T,>(action: () => Promise<T>) => {
    const current = generation.current;
    const result = await action();
    notifyTaskAccessChanged(taskId);
    void client.members(taskId).then(rows => { if (current === generation.current) setMembers(rows); }).catch(() => {});
    return result;
  };
  const close = () => { setOpen(false); share.exit(); };
  const toggleRecipient = (person: PersonCard) => setRecipients((current) => current.some((item) => item.user_id === person.user_id)
    ? current.filter((item) => item.user_id !== person.user_id) : current.length >= 20 ? current : [...current, person]);
  const send = async () => {
    const link = share.snapshotLink;
    if (operation.current || !canManage || !link || !recipients.length) return;
    operation.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await sendShare(link.shareId, recipients.map((person) => person.user_id));
      setNotice(tt(fn.sent, { count: recipients.length })); setRecipients([]); setPage("snapshot");
    } catch (failure) {
      setError(tt(failure instanceof ShareLinkError && failure.status === 429 ? fn.sendTooOften : fn.sendFailed));
    } finally { operation.current = false; setBusy(false); }
  };
  const copyLink = async (url: string) => {
    const ok = await writeClipboardText(url);
    setNotice(ok ? tt("链接已复制。") : tt("复制失败，请手动复制链接。"));
  };
  const exportDisabled = !!share.busy || !share.selectedCount;
  const title = tt(page === "snapshot" ? text.shareLink : page === "collaborate" ? text.collaborate : page === "send" ? fn.sendTo : copy.share);
  return <>
    <ShareEntryButton anchorRef={anchorRef} active={share.active} expanded={open} panelId={panelId}
      onClick={() => {
        if (open) { close(); return; }
        setPage("actions"); setNotice(""); share.enter("all"); setOpen(true);
      }} />
    <AccessPopover open={open} anchorRef={anchorRef} onClose={close} title={title}
      ignoreOutsideSelector="[data-share-select-control]"
      id={panelId} role={page === "actions" ? "menu" : "dialog"} width={page === "actions" ? 224 : 288}>
      {page === "actions" ? <div data-task-share-actions>
        {canManage && <FloatingMenuItem icon={<ShareIcon name="link" />} label={tt(text.shareLink)} onSelect={() => void openPage("snapshot")} />}
        {canParticipate && <FloatingMenuItem icon={<ShareIcon name="members" />} label={tt(text.collaborate)} onSelect={() => void openPage("collaborate")} />}
        <FloatingMenuSeparator />
        <FloatingMenuItem icon={<ShareIcon name="copy" />} label={tt("复制文本")} title={tt("复制文本")} disabled={exportDisabled} onSelect={() => void share.copyText()} />
        <FloatingMenuItem icon={<ShareIcon name="image" />} label={tt("生成长图")} title={tt("生成长图")} disabled={exportDisabled} onSelect={() => void share.generateImage()} />
        <FloatingMenuItem icon={<ShareIcon name="document" />} label={tt("生成文档")} title={tt("生成文档")} disabled={exportDisabled} onSelect={() => void share.generateDocument()} />
        <FloatingMenuSeparator />
        <FloatingMenuLabel>{tt("已选 {count} 条", { count: share.selectedCount })}</FloatingMenuLabel>
        <FloatingMenuItem icon={<ShareIcon name="select" />} label={tt(share.allSelected ? "取消全选" : "全选")} onSelect={share.toggleAll} />
        {share.notice && <p role="status" className={`px-2.5 py-1.5 text-xs ${share.notice.tone === "ok" ? "text-neutral-500 dark:text-neutral-400" : "text-rose-600 dark:text-rose-400"}`}>{share.notice.text}</p>}
      </div> : <div data-task-share-page={page}>
        <div className="flex min-w-0 items-center gap-2">
          <div className="shrink-0"><BackButton label={tt(copy.back)} onClick={() => { setPage(page === "send" ? "snapshot" : "actions"); setNotice(""); setError(""); }} /></div>
          <span className="min-w-0 flex-1 text-[13px] font-medium">{title}</span>
          {page === "collaborate" && <button type="button" aria-label={tt(text.help)} aria-expanded={help} onClick={() => setHelp(!help)} className="grid size-8 shrink-0 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/10">?</button>}
        </div>
        <FloatingMenuSeparator />
        {page === "collaborate" && help && <p data-task-collaboration-rules className="px-2.5 py-1.5 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">{tt(text.rules)}</p>}
        {page === "snapshot" ? <div className="space-y-2 px-2.5 py-1.5 text-[13px]">
          <label className="flex items-center gap-2">
            <input type="checkbox" role="switch" checked={!!share.snapshotLink} disabled={!canManage || busy || !!share.busy || !loaded || !share.snapshotLink && exportDisabled}
              onChange={event => void setSnapshot(event.target.checked)} />
            <span>{tt(copy.publicView)}</span>
          </label>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{tt(text.snapshot)}</p>
          <button type="button" disabled={!loaded || !share.snapshotLink || busy} onClick={() => share.snapshotLink && void copyLink(share.snapshotLink.url)}
            className="min-h-8 w-full rounded-lg border border-neutral-200/80 px-3 disabled:opacity-50 dark:border-white/10">{tt(copy.copyLink)}</button>
          {loaded && share.snapshotLink && <button type="button" data-share-send-entry="" disabled={busy} onClick={() => { setPage("send"); setNotice(""); setError(""); }}
            className="min-h-8 w-full rounded-lg border border-neutral-200/80 px-3 disabled:opacity-50 dark:border-white/10">{tt(fn.sendTo)}</button>}
        </div> : page === "send" ? <div data-share-send="" className="space-y-2 px-2.5 py-1.5 text-[13px]">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{tt(fn.sendNote)}</p>
          <div className="max-h-64 overflow-y-auto">
            <PeopleSuggestions mode="select" selectedIds={recipients.map((person) => person.user_id)} placeholder={tt(fn.findPlaceholder)} onPick={toggleRecipient} />
          </div>
          {recipients.length > 0 && <p data-share-recipients="" className="truncate text-xs text-neutral-500 dark:text-neutral-400">{recipients.map((person) => person.name).join(", ")}</p>}
          <button type="button" disabled={busy || !recipients.length || !share.snapshotLink} onClick={() => void send()}
            className="min-h-8 w-full rounded-lg bg-neutral-900 px-3 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">{tt(fn.send, { count: recipients.length })}</button>
        </div> : <>
          {loaded && <MemberPanel taskCollaboration owner={access.owner} members={members} canManage={canManage} busy={busy}
            onInvite={email => mutate(() => client.invite(taskId, email, "collaborate"))}
            onInviteUser={person => mutate(() => client.inviteUser(taskId, person.user_id))}
            onRemove={id => mutate(() => client.remove(taskId, id))} />}
          <FloatingMenuSeparator />
          <div className="space-y-2 px-2.5 py-1.5 text-[13px]">
            <p>{tt(text.link)}</p>
            <button type="button" onClick={() => void copyLink(taskUrl)} className="min-h-8 w-full rounded-lg border border-neutral-200/80 px-3 dark:border-white/10">{tt(text.copyTask)}</button>
            {onDiscuss && <button type="button" data-task-share-discuss="" title={tt(trPanel.discussNote)} onClick={() => { close(); onDiscuss(); }}
              className="min-h-8 w-full rounded-lg border border-neutral-200/80 px-3 dark:border-white/10">{tt(trPanel.inviteDiscuss)}</button>}
          </div>
        </>}
        {Boolean(readError) && <AutoRecovery identity={`task-share:${taskId}:${page}`} error={readError} recover={() => openPage(page === "send" ? "snapshot" : page)} />}
        {error && <div role="alert" className="px-2.5 py-1.5 text-[13px] text-rose-600 dark:text-rose-400">{error}</div>}
        {busy && <span role="status" aria-label={tt("正在加载…")} className="v-spinner" />}
        {notice && <p role="status" className="px-2.5 py-1.5 text-xs text-neutral-500 dark:text-neutral-400">{notice}</p>}
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
} as const;

function ShareIcon({ name }: { name: keyof typeof SHARE_ICONS }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={SHARE_ICONS[name]} /></svg>;
}
