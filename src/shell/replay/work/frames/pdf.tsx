"use client";

// pdf 的回放画法（work-chat W14，契约 §8.4）：页面缩略 + 批注框。
// 每页画成一张纸（按页面真实宽高比），批注按矩形叠在上面；这一步新增或改过的批注用作者颜色描边。
import { useUI } from "../../../../i18n/ui/useUI";
import {
  pdfAnnotationsOnPage,
  pdfFromRevisionJson,
  pdfFromYDoc,
  pdfToArtifactJson,
  type PdfCollabState,
} from "../../../collab/adapters/pdf";
import type { ReplayFrameProps, ReplayFrameRenderer } from "../frame-types";
import { joinNotes, plainChangeTranslate, type ChangeTranslate } from "./notes";

const FILL: Record<string, string> = {
  HIGHLIGHT: "rgba(250, 204, 21, 0.45)",
  UNDERLINE: "rgba(59, 130, 246, 0.35)",
  STRIKEOUT: "rgba(239, 68, 68, 0.35)",
  SQUIGGLY: "rgba(168, 85, 247, 0.35)",
};

function safeColor(value: unknown, fallback: string): string {
  const color = typeof value === "string" ? value : "";
  return /^#[0-9a-f]{3,8}$/i.test(color) ? color : fallback;
}

function PdfFrame({ snapshot, prev, width, height, authorColor = "#4f46e5" }: ReplayFrameProps) {
  const tt = useUI();
  const state = snapshot as PdfCollabState;
  const before = new Map(((prev as PdfCollabState | undefined)?.annotations ?? []).map((a) => [a.id, JSON.stringify(a)]));
  const pages = state.pages.length
    ? state.pages
    : [...new Set(state.annotations.map((a) => a.pageIndex))].sort((a, b) => a - b).map((index) => ({ index, widthPt: 612, heightPt: 792 }));
  const gap = 6;
  const label = 14;
  const pageHeight = Math.max(20, height - label - 8);
  const shown = pages.slice(0, Math.max(1, Math.floor(width / (pageHeight * 0.6 + gap))));
  return (
    <div
      data-replay-frame="pdf"
      style={{ width, height }}
      className="flex gap-1.5 overflow-hidden rounded border border-[var(--border,#e7e5e4)] bg-[var(--muted,#f5f5f4)] p-1 text-[10px] text-[var(--foreground,#292524)]"
    >
      {state.annotations.length === 0 && pages.length === 0 ? (
        <p className="p-2 text-[var(--muted-foreground,#57534e)]">{tt("还没有批注")}</p>
      ) : (
        shown.map((page) => {
          const pageWidth = Math.round((pageHeight * page.widthPt) / page.heightPt);
          return (
            <div key={page.index} className="shrink-0">
              <div className="truncate" style={{ height: label, width: pageWidth }}>{tt("第 {n} 页", { n: page.index + 1 })}</div>
              <div className="relative bg-white shadow-sm" style={{ width: pageWidth, height: pageHeight }}>
                {pdfAnnotationsOnPage(state, page.index).map((annotation) => {
                  const mark = before.get(annotation.id) !== JSON.stringify(annotation);
                  const color = safeColor(annotation.strokeColor, "#f59e0b");
                  return (
                    <div
                      key={annotation.id}
                      data-annotation-id={annotation.id}
                      data-changed={prev && mark ? "true" : undefined}
                      className="absolute overflow-hidden"
                      style={{
                        left: `${(annotation.rect.origin.x / page.widthPt) * 100}%`,
                        top: `${(annotation.rect.origin.y / page.heightPt) * 100}%`,
                        width: `${Math.max(1, (annotation.rect.size.width / page.widthPt) * 100)}%`,
                        height: `${Math.max(1, (annotation.rect.size.height / page.heightPt) * 100)}%`,
                        background: FILL[annotation.typeName] ?? `${color}33`,
                        border: `1px solid ${color}`,
                        outline: prev && mark ? `2px solid ${authorColor}` : undefined,
                        outlineOffset: prev && mark ? 1 : undefined,
                      }}
                    >
                      {annotation.contents ? <span className="px-0.5 text-[8px] leading-none">{annotation.contents}</span> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

/** 这一步改了什么（批注、表单项）。 */
export function describePdfChange(prev: unknown, next: unknown, tt?: ChangeTranslate): string | null {
  if (!isRecord(next) || !Array.isArray(next.annotations)) return null;
  const nextState = next as unknown as PdfCollabState;
  const prevState = isRecord(prev) && Array.isArray(prev.annotations) ? (prev as unknown as PdfCollabState) : null;
  const before = new Map((prevState?.annotations ?? []).map((a) => [a.id, a]));
  const after = new Map(nextState.annotations.map((a) => [a.id, a]));
  const added = [...after.keys()].filter((id) => !before.has(id));
  const removed = [...before.keys()].filter((id) => !after.has(id));
  const changed = [...after.keys()].filter(
    (id) => before.has(id) && JSON.stringify(before.get(id)) !== JSON.stringify(after.get(id)),
  );
  const pagesTouched = new Set<number>();
  for (const id of [...added, ...changed]) pagesTouched.add(after.get(id)!.pageIndex);
  const fieldsBefore = prevState?.fields ?? {};
  const fieldsChanged = Object.entries(nextState.fields ?? {}).filter(([name, value]) => fieldsBefore[name] !== value).length;
  const t = tt ?? plainChangeTranslate;
  const parts: string[] = [];
  if (added.length) {
    const pages = [...pagesTouched].map((n) => n + 1).sort((a, b) => a - b).join(", ");
    parts.push(t("第 {pages} 页新增了 {n} 条批注", { pages, n: added.length }));
    if (changed.length) parts.push(t("改了 {n} 条批注", { n: changed.length }));
  } else if (changed.length) {
    parts.push(t("改了 {n} 条批注", { n: changed.length }));
  }
  if (removed.length) parts.push(t("删了 {n} 条批注", { n: removed.length }));
  if (fieldsChanged) parts.push(t("填了 {n} 个表单项", { n: fieldsChanged }));
  return joinNotes(tt, parts);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const renderer: ReplayFrameRenderer = {
  kind: "pdf",
  fromY: pdfFromYDoc,
  fromRevision: pdfFromRevisionJson,
  Frame: PdfFrame,
  describeChange: describePdfChange,
  toArtifactJson: pdfToArtifactJson,
};

export default renderer;
