"use client";

import type { ReactNode } from "react";
import { IconSettings } from "./chrome-icons";
import { tone } from "./tone";

export type ProgramStripItem = {
  id: string;
  label: string;
  dot?: "green" | "yellow" | "gray" | "none";
  running?: boolean;
  disabled?: boolean;
  title?: string;
};

export type ProgramStripProps = {
  items: ProgramStripItem[];
  selected: string | null;
  onSelect: (id: string) => void;
  /** Shows a settings button after each item. */
  onSettings?: (id: string) => void;
  /** Already translated, e.g. tt("设置"). */
  settingsLabel?: string;
  /** Extra controls on the right, before the row expand/collapse buttons. */
  trailing?: ReactNode;
  /** localStorage key that remembers whether the wrapped rows are collapsed. */
  storageKey?: string;
  ariaLabel?: string;
};

export function ProgramStrip({
  items,
  selected,
  onSelect,
  onSettings,
  settingsLabel = "",
  trailing,
  ariaLabel,
}: ProgramStripProps) {
  return (
    <div
      className="flex min-w-0 items-center gap-4"
      role="tablist"
      aria-label={ariaLabel}
      data-oceanleo-program-strip=""
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4">
        {items.map((item) => (
          <span key={item.id} className="inline-flex items-center gap-1">
            <button
              type="button"
              role="tab"
              aria-selected={selected === item.id}
              disabled={item.disabled}
              title={item.title}
              onClick={() => onSelect(item.id)}
              className={selected === item.id ? tone.tabActive : tone.tab}
              data-oceanleo-program-strip-item={item.id}
            >
              {item.label}
            </button>
            {onSettings ? (
              <button
                type="button"
                disabled={item.disabled}
                onClick={() => onSettings(item.id)}
                className={`${tone.iconBtn} size-7`}
                aria-label={`${item.label} · ${settingsLabel}`}
                title={settingsLabel}
                data-oceanleo-program-strip-settings={item.id}
              >
                <IconSettings className="size-3.5" />
              </button>
            ) : null}
          </span>
        ))}
      </div>
      {trailing}
    </div>
  );
}
