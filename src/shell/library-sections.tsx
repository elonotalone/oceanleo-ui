"use client";

// 2026-11-07 UX wave (LU): Library's four sections 我的创作 / 上传的 / 来自 LeoBay / 来自 LeoChat.
// Which section an artifact belongs to is the server's `librarySource` (contract §2.4); this file only
// names the sections and draws the row. 来自 LeoChat lists IM attachments (`LibraryChatFiles`), not artifacts.

import { useUI } from "../i18n/ui/useUI";
import type { LibrarySource } from "./artifact-contract";
import type { LibraryItem } from "./library-data";

export const LIBRARY_SECTIONS: ReadonlyArray<{ id: LibrarySource; label: string }> = [
  { id: "creation", label: "我的创作" },
  { id: "upload", label: "上传的" },
  { id: "leobay", label: "来自 LeoBay" },
  { id: "leochat", label: "来自 LeoChat" },
];

export const DEFAULT_LIBRARY_SECTION: LibrarySource = "creation";

/** Source caption shown at the bottom of every shared Library card. */
export function librarySourceLabel(item: LibraryItem): string {
  const explicit = item.meta?.library_source_label;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  const section = LIBRARY_SECTIONS.find((entry) => entry.id === item.artifact?.librarySource);
  return section?.label || "我的创作";
}

// Same chip look as LeoBay's explore axis (material-library-type-filter.tsx).
const CHIP_BASE = "min-h-8 shrink-0 rounded-full border px-3 text-[12px]";
const CHIP_ON = "border-transparent bg-[var(--fg,#292524)] text-white";
const CHIP_OFF =
  "border-[var(--border,#e7e5e4)] text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)]";

export function LibrarySectionTabs({
  value,
  onChange,
  className = "",
}: {
  value: LibrarySource;
  onChange: (section: LibrarySource) => void;
  className?: string;
}) {
  const tt = useUI();
  return (
    <div
      role="tablist"
      aria-label={tt("我的库")}
      data-library-sections=""
      className={`flex shrink-0 flex-nowrap items-center gap-1 overflow-x-auto ${className}`}
    >
      {LIBRARY_SECTIONS.map((section) => {
        const current = section.id === value;
        return (
          <button
            key={section.id}
            type="button"
            role="tab"
            aria-selected={current}
            data-library-section={section.id}
            onClick={() => onChange(section.id)}
            className={`${CHIP_BASE} ${current ? CHIP_ON : CHIP_OFF}`}
          >
            {tt(section.label)}
          </button>
        );
      })}
    </div>
  );
}
