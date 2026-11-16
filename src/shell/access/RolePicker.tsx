"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { SHARE_ACCESS_COPY_SOURCE as copy } from "../../i18n/ui/messages/share-access-copy-source";
import { AnchoredPopover } from "../anchored-popover";
import type { AccessRole } from "./access-types";

export interface RolePickerProps {
  value: AccessRole;
  memberName: string;
  disabled?: boolean;
  onChange: (role: AccessRole) => void;
}

/** One compact role control for tasks and Projects. The execution warning stays fully readable. */
export function RolePicker({ value, memberName, disabled, onChange }: RolePickerProps) {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const roles: readonly AccessRole[] = ["view", "collaborate"];
  const navigate = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const options = [...(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])];
    const index = options.indexOf(event.currentTarget);
    const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
    options[next]?.focus();
  };
  return <>
    <button ref={anchorRef} type="button" disabled={disabled} aria-haspopup="menu" aria-expanded={open}
      aria-controls={open ? menuId : undefined} aria-label={tt(copy.memberRole, { name: memberName })}
      className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs text-[var(--fg)] hover:bg-[var(--surface)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-50"
      onClick={() => setOpen(!open)} onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); } }}>
      {tt(value === "collaborate" ? copy.collaborate : copy.view)}<span aria-hidden="true">⌄</span>
    </button>
    <AnchoredPopover open={open && !disabled} anchorRef={anchorRef} onClose={() => setOpen(false)} role="menu"
      ariaLabel={tt(copy.memberRole, { name: memberName })} align="end"
      initialFocusSelector='[role="menuitemradio"][aria-checked="true"]'
      className="z-[1100] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-1 text-[var(--fg)] shadow-xl"
      style={{ width: 360 }}>
      <div id={menuId}>
        {roles.map((role) => <button key={role} type="button" role="menuitemradio" aria-checked={value === role}
          onKeyDown={navigate} onClick={() => { setOpen(false); anchorRef.current?.focus(); if (role !== value) onChange(role); }}
          className="flex w-full items-start gap-2 rounded-lg p-3 text-start hover:bg-[var(--surface)] focus-visible:bg-[var(--surface)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
          <span className="w-4 shrink-0" aria-hidden="true">{value === role ? "✓" : ""}</span>
          <span className="min-w-0"><span className="block text-sm font-medium">{tt(role === "collaborate" ? copy.collaborate : copy.view)}</span>
            <span className="mt-1 block text-xs leading-relaxed text-[var(--muted)]">{tt(role === "collaborate" ? copy.collaborateDescription : copy.viewDescription)}</span></span>
        </button>)}
      </div>
    </AnchoredPopover>
  </>;
}
