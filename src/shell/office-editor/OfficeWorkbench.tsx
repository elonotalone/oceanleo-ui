"use client";

import { useId } from "react";
import { useUI } from "../../i18n/ui/useUI";
import {
  lightweightOfficeRouteForExtension,
  type LightweightOfficeRoute,
} from "../../lib/office-client";
import type { LibraryItem } from "../library-data";
import { officeExtensionForItem } from "../workbench-routes";

/**
 * Compatibility location for the former Office workbench. It now contains
 * only native-route selection and the fail-closed empty state; no embedded
 * editor lifecycle remains.
 */
export function lightweightOfficeRouteForItem(
  item: LibraryItem,
): LightweightOfficeRoute | null {
  const byExtension = lightweightOfficeRouteForExtension(
    officeExtensionForItem(item),
  );
  if (byExtension) return byExtension;

  const artifactType = item.artifact?.artifactType || item.artifactType;
  if (artifactType === "grid" || item.kind === "sheet") return "grid";
  if (artifactType === "deck" || item.kind === "ppt") return "deck";
  if (artifactType === "document" || item.kind === "document") {
    return "richdoc";
  }
  return null;
}

export function LightweightOfficeEmptyState({
  item,
  accent = "#4f46e5",
}: {
  item: LibraryItem;
  accent?: string;
}) {
  const tt = useUI();
  const titleId = useId();
  const sourceUrl = item.url || "";
  return (
    <section
      data-lightweight-office-state="unavailable"
      role="alert"
      aria-labelledby={titleId}
      className="grid h-full place-items-center bg-[var(--surface,#f5f5f4)] p-6"
    >
      <div className="max-w-md rounded-2xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-5 text-center shadow-sm">
        <h2
          id={titleId}
          className="text-[14px] font-semibold text-[var(--fg,#292524)]"
        >
          {tt("无法识别可编辑的 Office 格式")}
        </h2>
        <p className="mt-2 text-[12px] leading-5 text-[var(--muted,#78716c)]">
          {tt(
            "请上传 DOCX、XLSX 或 PPTX 源文件。轻量编辑器不会使用预览图代替源文件。",
          )}
        </p>
        {sourceUrl && (
          <a
            href={sourceUrl}
            download={item.title || "office-file"}
            className="mt-4 inline-flex min-h-9 items-center justify-center rounded-lg px-3 text-[12px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{ background: accent }}
          >
            {tt("下载原文件")}
          </a>
        )}
      </div>
    </section>
  );
}
