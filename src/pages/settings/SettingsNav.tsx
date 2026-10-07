"use client";

import type { ReactNode } from "react";
import { SettingsIdentityCard } from "./SettingsIdentityCard";
import { settingsNavIcon } from "./SettingsNavIcons";

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
  displayName,
  avatarUrl,
  userEmail,
  onCreateOrganization,
}: {
  groups: SettingsNavGroup[];
  activeId: string;
  onSelect: (id: string) => void;
  /** 有全名用全名；没有再回落到邮箱 @ 前。 */
  displayName?: string | null;
  avatarUrl?: string | null;
  userEmail: string | null;
  onCreateOrganization?: () => void;
}) {
  return (
    <nav data-settings-nav className="flex min-h-0 w-full flex-col overflow-hidden md:h-full" aria-label="settings">
      <div data-settings-identity-wrap="" className="mb-3 w-fit max-w-full shrink-0 overflow-visible">
        <SettingsIdentityCard
          displayName={displayName}
          avatarUrl={avatarUrl}
          userEmail={userEmail}
          onCreateOrganization={onCreateOrganization}
        />
      </div>

      <div
        data-settings-nav-scroll=""
        data-settings-nav-tabs=""
        className="v-scroll flex min-h-0 flex-row flex-nowrap items-end gap-1 overflow-x-auto overflow-y-hidden pb-1 md:flex-1 md:flex-col md:items-stretch md:gap-5 md:overflow-x-hidden md:overflow-y-auto md:pb-0"
      >
        {groups.map((group) => (
          <div
            key={group.id}
            data-settings-group={group.id}
            className="flex shrink-0 flex-row flex-nowrap items-center gap-1 md:w-full md:flex-col md:items-stretch"
          >
            <p
              data-settings-group-label=""
              className="mb-1 hidden truncate px-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 md:block"
            >
              {group.label}
            </p>
            {group.items.map((item) => (
              <NavRow key={item.id} item={item} active={item.id === activeId} onSelect={onSelect} />
            ))}
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
  const selected = active && !item.href;
  const className = `inline-flex w-fit max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-none border-b-2 px-2.5 py-2 text-left text-[13px] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] md:w-full md:gap-2 md:rounded-lg md:border-b-0 ${
    selected
      ? "border-neutral-900 font-semibold text-neutral-900 md:border-transparent md:bg-neutral-100"
      : "border-transparent font-normal text-neutral-500 hover:text-neutral-800 md:text-neutral-700 md:hover:bg-neutral-100"
  }`;
  const label = (
    <>
      <span data-settings-item-icon="" className="flex size-4 shrink-0 items-center justify-center">
        {item.icon ?? settingsNavIcon(item.id)}
      </span>
      <span className="min-w-0 truncate">{item.label}</span>
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
