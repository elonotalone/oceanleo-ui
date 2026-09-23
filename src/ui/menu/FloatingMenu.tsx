"use client";

import type { ReactNode, RefObject } from "react";
import { AnchoredPopover } from "../../shell/anchored-popover";

export type FloatingMenuProps = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  align?: "start" | "center" | "end";
  /** Flips to the other side automatically when there is no room. */
  preferredPlacement?: "above" | "below";
  /** Open beside the anchor (submenus); falls back to above/below when there is no room. */
  side?: "right" | "left";
  /** px; defaults to 224. */
  width?: number;
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
};

export function FloatingMenu({
  open,
  anchorRef,
  onClose,
  align = "end",
  preferredPlacement,
  width = 224,
  ariaLabel,
  className = "",
  children,
}: FloatingMenuProps) {
  return (
    <AnchoredPopover
      open={open}
      anchorRef={anchorRef}
      onClose={() => onClose()}
      role="menu"
      ariaLabel={ariaLabel}
      align={align}
      preferredPlacement={preferredPlacement}
      className={`overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1 shadow-xl ${className}`}
      style={{ width }}
    >
      {children}
    </AnchoredPopover>
  );
}

export type FloatingMenuItemProps = {
  icon?: ReactNode;
  label: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  danger?: boolean;
  href?: string;
  external?: boolean;
  disabled?: boolean;
  selected?: boolean;
  onSelect?: () => void;
};

export function FloatingMenuItem({
  icon,
  label,
  description,
  trailing,
  danger = false,
  href,
  external = false,
  disabled = false,
  selected = false,
  onSelect,
}: FloatingMenuItemProps) {
  const className = `flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] disabled:cursor-not-allowed disabled:opacity-50 ${
    danger ? "text-rose-600 hover:bg-rose-50" : "text-neutral-800 hover:bg-neutral-100"
  }`;
  const body = (
    <>
      {icon ? <span className="shrink-0 text-neutral-500">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {description ? (
          <span className="block truncate text-[11px] text-neutral-500">{description}</span>
        ) : null}
      </span>
      {trailing ? <span className="shrink-0 text-neutral-400">{trailing}</span> : null}
    </>
  );
  if (href && !disabled) {
    return (
      <a
        role="menuitem"
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
        aria-current={selected ? "true" : undefined}
        className={className}
        onClick={() => onSelect?.()}
      >
        {body}
      </a>
    );
  }
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      aria-checked={selected || undefined}
      className={className}
      onClick={() => onSelect?.()}
    >
      {body}
    </button>
  );
}

export function FloatingMenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-neutral-100" />;
}

export function FloatingMenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pb-1 pt-2 text-[11px] font-medium text-neutral-400">{children}</div>;
}
