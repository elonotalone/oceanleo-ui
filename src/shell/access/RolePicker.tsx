"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { SHARE_ACCESS_COPY_SOURCE as copy } from "../../i18n/ui/messages/share-access-copy-source";
import { FloatingMenu, FloatingMenuItem } from "../../ui/menu/FloatingMenu";
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
      className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs text-neutral-800 hover:bg-neutral-100 focus-visible:bg-neutral-100 outline-none dark:text-neutral-100 dark:hover:bg-white/10 dark:focus-visible:bg-white/10 disabled:opacity-50"
      onClick={() => setOpen(!open)} onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); } }}>
      {tt(value === "collaborate" ? copy.collaborate : copy.view)}<span aria-hidden="true">⌄</span>
    </button>
    <FloatingMenu open={open && !disabled} anchorRef={anchorRef} onClose={() => setOpen(false)}
      ariaLabel={tt(copy.memberRole, { name: memberName })} align="end" width={360} zClassName="z-[1100]"
      initialFocusSelector='[role="menuitemradio"][aria-checked="true"]'>
      <div id={menuId}>
        {roles.map((role) => <FloatingMenuItem key={role} role="menuitemradio" selected={value === role}
          onKeyDown={navigate} onSelect={() => { setOpen(false); anchorRef.current?.focus(); if (role !== value) onChange(role); }}
          label={tt(role === "collaborate" ? copy.collaborate : copy.view)} wrapDescription
          description={tt(role === "collaborate" ? copy.collaborateDescription : copy.viewDescription)} />)}
      </div>
    </FloatingMenu>
  </>;
}
