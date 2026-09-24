"use client";

import type { ReactNode } from "react";

export type SettingsNavItem = {
  id: string;
  group: "settings" | "capabilities" | "data";
  label: string;
  icon?: ReactNode;
  href?: string;
  external?: boolean;
};

export type SettingsNavGroup = {
  id: SettingsNavItem["group"];
  label: string;
  items: SettingsNavItem[];
};

export function SettingsNav({
  groups,
  activeId,
  onSelect,
  userEmail,
  planLabel,
}: {
  groups: SettingsNavGroup[];
  activeId: string;
  onSelect: (id: string) => void;
  userEmail: string | null;
  planLabel?: string | null;
}) {
  const initial = userEmail ? userEmail[0].toUpperCase() : "?";
  const name = userEmail ? userEmail.split("@")[0] : "";

  return (
    <nav data-settings-nav className="md:w-56 md:shrink-0" aria-label="settings">
      <div className="mb-4 flex items-center gap-3 px-1">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-800 text-sm font-medium text-white">
          {initial}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-neutral-900">{name || "—"}</p>
          {planLabel ? <p className="truncate text-[12px] text-neutral-400">{planLabel}</p> : null}
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 md:flex-col md:gap-5 md:overflow-visible md:pb-0">
        {groups.map((group) => (
          <div key={group.id} data-settings-group={group.id} className="min-w-max md:min-w-0">
            <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              {group.label}
            </p>
            <div className="flex gap-1 md:flex-col">
              {group.items.map((item) => (
                <NavRow
                  key={item.id}
                  item={item}
                  active={item.id === activeId}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}

function NavRow({
  item,
  active,
  onSelect,
}: {
  item: SettingsNavItem;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const className = `flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
    active && !item.href
      ? "bg-neutral-900 text-white"
      : "text-neutral-700 hover:bg-neutral-100"
  }`;
  const label = (
    <>
      {item.icon}
      <span className="truncate">{item.label}</span>
    </>
  );

  if (item.href) {
    if (item.external) {
      return (
        <a
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          data-settings-item={item.id}
          className={className}
        >
          {label}
        </a>
      );
    }
    return (
      <a href={item.href} data-settings-item={item.id} className={className}>
        {label}
      </a>
    );
  }

  return (
    <button
      type="button"
      data-settings-item={item.id}
      aria-current={active ? "page" : undefined}
      onClick={() => onSelect(item.id)}
      className={className}
    >
      {label}
    </button>
  );
}
