"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { SHARE_ACCESS_COPY_SOURCE as copy } from "../../i18n/ui/messages/share-access-copy-source";
import { SW_TS_COPY as taskCopy } from "../../i18n/ui/messages/sw-ts-copy";
import { AnchoredPopover } from "../anchored-popover";
import { RolePicker } from "./RolePicker";
import type { AccessMember, AccessOwner, AccessRole } from "./access-types";

export type { AccessMember, AccessOwner, AccessRole } from "./access-types";

export interface MemberPanelProps {
  taskCollaboration?: boolean;
  owner: AccessOwner;
  members: AccessMember[];
  canManage: boolean;
  busy?: boolean;
  onInvite: (email: string, role: AccessRole) => Promise<AccessMember | void>;
  onChangeRole?: (id: string, role: AccessRole) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

function Avatar({ name, initial }: { name: string; initial?: string | null }) {
  return <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-neutral-100 dark:bg-white/10 text-sm font-medium text-neutral-800 dark:text-neutral-100">{initial || [...name.trim()][0]?.toLocaleUpperCase() || "?"}</span>;
}

/** Invitations never send a notification. All mutations render immediately and restore the row on failure. */
export function MemberPanel({ taskCollaboration = false, owner, members, canManage, busy = false, onInvite, onChangeRole, onRemove }: MemberPanelProps) {
  const tt = useUI();
  const [items, setItems] = useState(members);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<AccessMember | null>(null);
  const savingRef = useRef(false);
  const membersRef = useRef(members);
  membersRef.current = members;
  const mutationSourceRef = useRef(members);
  const inputRef = useRef<HTMLInputElement>(null);
  const removalAnchorRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const errorId = useId();
  const disabled = busy || saving;
  // A server refresh normally replaces the list; don't erase an in-flight optimistic mutation.
  useEffect(() => { if (!savingRef.current) setItems(members); }, [members]);
  useEffect(() => { if (!canManage) setRemoving(null); }, [canManage]);
  const begin = () => { if (disabled || savingRef.current || !canManage) return false; savingRef.current = true; mutationSourceRef.current = membersRef.current; setSaving(true); setError(""); return true; };
  const end = () => { savingRef.current = false; setSaving(false); if (membersRef.current !== mutationSourceRef.current) setItems(membersRef.current); };

  const invite = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) { setError(tt(copy.invalidEmail)); inputRef.current?.focus(); return; }
    if (!begin()) return;
    const previous = items;
    const existing = items.find((member) => member.email?.toLowerCase() === normalized && ["invited", "accepted"].includes(member.status));
    const optimistic: AccessMember = existing ?? { id: `pending:${normalized}`, email: normalized, role: taskCollaboration ? "collaborate" : "view", status: "invited" };
    setItems(existing ? items : [...items, optimistic]);
    setEmail("");
    try {
      const saved = await onInvite(normalized, taskCollaboration ? "collaborate" : "view");
      if (saved) setItems((current) => current.map((member) => member.id === optimistic.id ? saved : member));
    } catch {
      setItems(previous); setEmail(normalized); setError(tt(copy.saveFailed));
    } finally { end(); }
  };
  const changeRole = async (id: string, role: AccessRole) => {
    if (!begin()) return;
    const previous = items;
    setItems(items.map((member) => member.id === id ? { ...member, role } : member));
    try { await onChangeRole?.(id, role); } catch { setItems(previous); setError(tt(copy.saveFailed)); } finally { end(); }
  };
  const closeRemoval = () => { setRemoving(null); removalAnchorRef.current?.focus(); };
  const remove = async () => {
    if (!removing || !begin()) return;
    const member = removing;
    const previous = items;
    setRemoving(null);
    setItems(items.filter((item) => item.id !== member.id));
    try { await onRemove(member.id); inputRef.current?.focus(); } catch { setItems(previous); setError(tt(copy.saveFailed)); } finally { end(); }
  };
  return <section data-member-panel="" className="min-w-0 px-2.5 py-1.5 text-neutral-800 dark:text-neutral-100" aria-busy={disabled}>
    {canManage && <form onSubmit={(event) => void invite(event)} className="mb-2 flex min-w-0 gap-2">
      <input ref={inputRef} type="email" required autoComplete="email" value={email} disabled={disabled}
        aria-label={tt(copy.email)} placeholder={tt(copy.email)} aria-describedby={error ? errorId : undefined}
        onChange={(event) => setEmail(event.target.value)}
        className="min-h-8 min-w-0 flex-1 rounded-lg border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-neutral-950 px-3 text-sm text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus-visible:outline-2 focus-visible:outline-neutral-400 disabled:opacity-50" />
      <button type="submit" disabled={disabled || !email.trim()} className="min-h-8 shrink-0 rounded-lg bg-neutral-900 dark:bg-neutral-100 px-4 text-sm font-medium text-white dark:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 disabled:opacity-50">{tt(copy.invite)}</button>
    </form>}
    {error && <p id={errorId} role="alert" className="mb-2 text-[13px] text-rose-600 dark:text-rose-400">{error}</p>}
    {taskCollaboration && <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">{tt(taskCopy.people)}</p>}
    <ul className="space-y-2" aria-label={tt(taskCollaboration ? taskCopy.people : copy.share)}>
      <li data-member-owner="" className="flex min-w-0 items-center gap-3">
        <Avatar name={owner.name} initial={owner.initial} />
        <span className="min-w-0 flex-1"><span className="block truncate text-[13px]">{owner.name}</span>{owner.email && canManage && <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">{owner.email}</span>}</span>
        <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">{tt(copy.owner)}</span>
      </li>
      {items.filter((member) => member.role !== "owner" && ["invited", "accepted"].includes(member.status) && (!taskCollaboration || member.role === "collaborate")).map((member) => {
        const name = member.name || member.email || tt(copy.sender);
        return <li key={member.id} data-member-id={member.id} className="flex min-w-0 items-center gap-2">
          <Avatar name={name} initial={member.initial} />
          <span className="min-w-0 flex-1"><span className="block truncate text-[13px]">{name}</span>{member.name && member.email && <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">{member.email}</span>}
            {member.status === "invited" && <span className="block text-xs text-neutral-500 dark:text-neutral-400">{tt(copy.invited)}</span>}</span>
          {canManage ? <>{taskCollaboration ? <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">{tt(taskCopy.collaborator)}</span> : <RolePicker value={member.role === "collaborate" ? "collaborate" : "view"} memberName={name} disabled={disabled || member.id.startsWith("pending:")} onChange={(role) => void changeRole(member.id, role)} />}
            <button type="button" disabled={disabled || member.id.startsWith("pending:")} aria-label={tt(copy.removeMember, { name })} onClick={(event) => { removalAnchorRef.current = event.currentTarget; setRemoving(member); }}
              className="grid size-9 shrink-0 place-items-center rounded-lg text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/10 hover:text-neutral-800 dark:hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-neutral-400 disabled:opacity-50">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></svg>
            </button></> : <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">{tt(taskCollaboration ? taskCopy.collaborator : member.role === "collaborate" ? copy.collaborate : copy.view)}</span>}
        </li>;
      })}
    </ul>
    {removing && canManage && <AnchoredPopover open anchorRef={removalAnchorRef} role="dialog" ariaModal ariaLabelledBy={titleId} onClose={closeRemoval} align="end" style={{ width: 384 }} className="z-[1200] rounded-lg border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-neutral-950 text-neutral-800 dark:text-neutral-100 shadow-[0_8px_32px_rgba(0,0,0,0.14)]">
      <div className="p-5">
        <h2 id={titleId} className="text-base font-semibold">{tt(copy.confirmRemoval)}</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">{tt(copy.removalDescription, { name: removing.name || removing.email || tt(copy.sender) })}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={closeRemoval} className="min-h-8 rounded-lg border border-neutral-200/80 dark:border-white/10 px-4 text-sm focus-visible:outline-2 focus-visible:outline-neutral-400">{tt(copy.cancel)}</button>
          <button type="button" disabled={disabled} onClick={() => void remove()} className="min-h-8 rounded-lg bg-neutral-900 dark:bg-neutral-100 px-4 text-sm text-white dark:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 disabled:opacity-50">{tt(copy.remove)}</button>
        </div>
      </div>
    </AnchoredPopover>}
  </section>;
}
