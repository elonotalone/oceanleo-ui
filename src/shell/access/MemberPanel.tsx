"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { SHARE_ACCESS_COPY_SOURCE as copy } from "../../i18n/ui/messages/share-access-copy-source";
import { Modal } from "../../ui";
import { RolePicker } from "./RolePicker";
import type { AccessMember, AccessOwner, AccessRole } from "./access-types";

export type { AccessMember, AccessOwner, AccessRole } from "./access-types";

export interface MemberPanelProps {
  owner: AccessOwner;
  members: AccessMember[];
  canManage: boolean;
  busy?: boolean;
  onInvite: (email: string, role: AccessRole) => Promise<AccessMember | void>;
  onChangeRole: (id: string, role: AccessRole) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

function Avatar({ name, initial }: { name: string; initial?: string | null }) {
  return <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-sm font-medium text-[var(--fg)]">{initial || [...name.trim()][0]?.toLocaleUpperCase() || "?"}</span>;
}

/** Invitations never send a notification. All mutations render immediately and restore the row on failure. */
export function MemberPanel({ owner, members, canManage, busy = false, onInvite, onChangeRole, onRemove }: MemberPanelProps) {
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
    const normalized = email.trim().toLocaleLowerCase();
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) { setError(tt(copy.invalidEmail)); inputRef.current?.focus(); return; }
    if (!begin()) return;
    const previous = items;
    const existing = items.find((member) => member.email?.toLocaleLowerCase() === normalized && ["invited", "accepted"].includes(member.status));
    const optimistic: AccessMember = existing ?? { id: `pending:${normalized}`, email: normalized, role: "view", status: "invited" };
    setItems(existing ? items : [...items, optimistic]);
    setEmail("");
    try {
      const saved = await onInvite(normalized, "view");
      if (saved) setItems((current) => current.map((member) => member.id === optimistic.id ? saved : member));
    } catch {
      setItems(previous); setEmail(normalized); setError(tt(copy.saveFailed));
    } finally { end(); }
  };
  const changeRole = async (id: string, role: AccessRole) => {
    if (!begin()) return;
    const previous = items;
    setItems(items.map((member) => member.id === id ? { ...member, role } : member));
    try { await onChangeRole(id, role); } catch { setItems(previous); setError(tt(copy.saveFailed)); } finally { end(); }
  };
  const remove = async () => {
    if (!removing || !begin()) return;
    const member = removing;
    const previous = items;
    setRemoving(null);
    setItems(items.filter((item) => item.id !== member.id));
    try { await onRemove(member.id); inputRef.current?.focus(); } catch { setItems(previous); setError(tt(copy.saveFailed)); } finally { end(); }
  };
  return <section data-member-panel="" className="min-w-0 text-[var(--fg)]" aria-busy={disabled}>
    {canManage && <form onSubmit={(event) => void invite(event)} className="mb-4 flex min-w-0 gap-2">
      <input ref={inputRef} type="email" required autoComplete="email" value={email} disabled={disabled}
        aria-label={tt(copy.email)} placeholder={tt(copy.email)} aria-describedby={error ? errorId : undefined}
        onChange={(event) => setEmail(event.target.value)}
        className="min-h-10 min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-50" />
      <button type="submit" disabled={disabled || !email.trim()} className="min-h-10 shrink-0 rounded-xl bg-[var(--fg)] px-4 text-sm font-medium text-[var(--card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-50">{tt(copy.invite)}</button>
    </form>}
    {error && <p id={errorId} role="alert" className="mb-3 text-sm text-[var(--fg)]">{error}</p>}
    <ul className="space-y-3" aria-label={tt(copy.share)}>
      <li data-member-owner="" className="flex min-w-0 items-center gap-3">
        <Avatar name={owner.name} initial={owner.initial} />
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{owner.name}</span>{owner.email && canManage && <span className="block truncate text-xs text-[var(--muted)]">{owner.email}</span>}</span>
        <span className="shrink-0 text-xs text-[var(--muted)]">{tt(copy.owner)}</span>
      </li>
      {items.filter((member) => member.role !== "owner" && ["invited", "accepted"].includes(member.status)).map((member) => {
        const name = member.name || member.email || tt(copy.sender);
        return <li key={member.id} data-member-id={member.id} className="flex min-w-0 items-center gap-2">
          <Avatar name={name} initial={member.initial} />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{name}</span>{member.name && member.email && <span className="block truncate text-xs text-[var(--muted)]">{member.email}</span>}
            {member.status === "invited" && <span className="block text-xs text-[var(--muted)]">{tt(copy.invited)}</span>}</span>
          {canManage ? <><RolePicker value={member.role === "collaborate" ? "collaborate" : "view"} memberName={name} disabled={disabled} onChange={(role) => void changeRole(member.id, role)} />
            <button type="button" disabled={disabled} aria-label={tt(copy.removeMember, { name })} onClick={() => setRemoving(member)}
              className="grid size-9 shrink-0 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-50">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></svg>
            </button></> : <span className="shrink-0 text-xs text-[var(--muted)]">{tt(member.role === "collaborate" ? copy.collaborate : copy.view)}</span>}
        </li>;
      })}
    </ul>
    {removing && canManage && <Modal labelledBy={titleId} onClose={() => setRemoving(null)} className="max-w-sm !border-[var(--border)] !bg-[var(--card)] !text-[var(--fg)]">
      <div className="p-5" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setRemoving(null); } }}>
        <h2 id={titleId} className="text-base font-semibold">{tt(copy.confirmRemoval)}</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{tt(copy.removalDescription, { name: removing.name || removing.email || tt(copy.sender) })}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => setRemoving(null)} className="min-h-10 rounded-lg border border-[var(--border)] px-4 text-sm focus-visible:outline-2 focus-visible:outline-[var(--accent)]">{tt(copy.cancel)}</button>
          <button type="button" disabled={disabled} onClick={() => void remove()} className="min-h-10 rounded-lg bg-[var(--fg)] px-4 text-sm text-[var(--card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-50">{tt(copy.remove)}</button>
        </div>
      </div>
    </Modal>}
  </section>;
}
