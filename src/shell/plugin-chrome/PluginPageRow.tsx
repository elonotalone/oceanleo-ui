"use client";

import { useUI } from "../../i18n/ui/useUI";
import { Button } from "../../ui/Button";
import type { PluginPage } from "./plugin-pages";

export interface PluginPageRowProps {
  pages: readonly PluginPage[];
  activePageId: string;
  onSelectPage(id: string): void;
}

export function PluginPageRow({
  pages,
  activePageId,
  onSelectPage,
}: PluginPageRowProps) {
  const tt = useUI();
  return (
    <div
      data-plugin-page-row
      role="tablist"
      className="relative z-[2147483647] flex h-9 w-full min-w-0 items-center gap-0.5 overflow-x-auto"
    >
      {pages.map((page) => {
        const active = page.id === activePageId;
        const blocked = Boolean(page.unavailableReason);
        const label = tt(page.label);
        const title = page.unavailableReason
          ? `${label}：${page.unavailableReason}`
          : label;
        return (
          <Button
            key={page.id}
            type="button"
            variant="ghost"
            selected={active}
            data-plugin-page={page.id}
            aria-current={active ? "page" : undefined}
            title={title}
            aria-label={title}
            onClick={() => {
              if (blocked) return;
              onSelectPage(page.id);
            }}
          >
            {label}
          </Button>
        );
      })}
    </div>
  );
}
