"use client";

import type { HTMLAttributes, ReactNode } from "react";

export interface CollectionItemProps {
  cover: ReactNode;
  title: ReactNode;
  metadata?: ReactNode;
  onOpen: () => void;
  actions?: ReactNode;
  floatingActions?: ReactNode;
  selected?: boolean;
  openLabel?: string;
  disabled?: boolean;
  openHref?: string;
  openProps?: { [key: `data-${string}`]: string | boolean | undefined };
  containerProps?: HTMLAttributes<HTMLDivElement> & { [key: `data-${string}`]: unknown };
}

/** Library is the presentation source for every collection surface. */
export function CollectionItemCard({ cover, title, metadata, onOpen, actions, floatingActions, selected, openLabel, disabled, openHref, openProps, containerProps }: CollectionItemProps) {
  const Open = openHref ? "a" : "button";
  return (
    <div {...containerProps} data-selected={selected || undefined} className={`group relative overflow-hidden rounded-xl border border-neutral-200 bg-white transition-all duration-[var(--leo-dur-3)] ease-[var(--leo-ease-standard)] hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md ${selected ? "ring-2 ring-neutral-400" : ""} ${containerProps?.className || ""}`}>
      <Open {...openProps} href={openHref} type={openHref ? undefined : "button"} onClick={onOpen} disabled={disabled} aria-label={openLabel} data-collection-card-main="" className="block w-full text-left">
        <div className="relative aspect-video w-full overflow-hidden bg-neutral-50">{cover}</div>
        <div className="p-3">
          <p className="truncate text-[13px] font-medium text-neutral-900">{title}</p>
          <p className="mt-1 truncate text-[11px] text-neutral-500">{metadata ?? "\u00a0"}</p>
        </div>
      </Open>
      {floatingActions}
      {actions && <div className="flex flex-wrap items-center gap-1.5 border-t border-neutral-100 px-3 py-2">{actions}</div>}
    </div>
  );
}

export function CollectionItemRow({ cover, title, metadata, onOpen, actions, floatingActions, selected, openLabel, disabled, openHref, openProps, containerProps }: CollectionItemProps) {
  const Open = openHref ? "a" : "button";
  return (
    <div {...containerProps} data-selected={selected || undefined} className={`group relative flex items-center gap-3 px-4 py-3 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50 ${selected ? "bg-neutral-50" : ""} ${containerProps?.className || ""}`}>
      <Open {...openProps} href={openHref} type={openHref ? undefined : "button"} onClick={onOpen} disabled={disabled} aria-label={openLabel} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="block h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-neutral-100">{cover}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-neutral-900">{title}</span>
          {metadata != null && <span className="block truncate text-[11px] text-neutral-500">{metadata}</span>}
        </span>
      </Open>
      {actions}{floatingActions}
    </div>
  );
}

export function CollectionItemList({ children, className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 ${className}`}>{children}</div>;
}
