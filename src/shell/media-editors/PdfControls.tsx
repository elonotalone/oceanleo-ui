"use client";

import { useRef, type ReactNode } from "react";
import { useUI } from "../../i18n/ui/useUI";
import {
  AdvancedEditorIcon,
  type WorkbenchIconName,
} from "../AdvancedEditorIcon";
import type { PdfWorkbenchState } from "./use-pdf-workbench";

function ControlButton({
  children,
  icon,
  iconOnly = false,
  onClick,
  disabled,
  title,
  active = false,
}: {
  children?: ReactNode;
  icon?: WorkbenchIconName;
  iconOnly?: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active || undefined}
      className={`rounded-xl border bg-[var(--card,#fff)] text-[11px] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))] disabled:opacity-40 ${
        iconOnly ? "grid h-9 w-9 place-items-center p-0" : "px-2.5 py-2"
      } ${
        active
          ? "border-[var(--accent,#7c3aed)] text-[var(--accent,#7c3aed)]"
          : "border-[var(--border,#e7e5e4)] text-[var(--fg-2,#57534e)]"
      }`}
    >
      {icon ? <AdvancedEditorIcon name={icon} /> : children}
      {icon && children ? <span className="sr-only">{children}</span> : null}
    </button>
  );
}

export function PdfControls({
  editor,
}: {
  editor: PdfWorkbenchState;
}) {
  const tt = useUI();
  const mergeInputRef = useRef<HTMLInputElement | null>(null);
  const busy = editor.loading || editor.processing || editor.saving;

  return (
    <div className="min-h-full space-y-4 overflow-y-auto bg-[var(--card,#fff)] p-4">
      <section className="space-y-2">
        <p className="text-[11px] font-semibold text-[var(--fg,#292524)]">
          {tt("页面")}
        </p>
        <div className="flex items-center gap-1.5">
          <ControlButton
            icon="add"
            iconOnly
            title={tt("添加空白页")}
            disabled={busy}
            onClick={() => void editor.addBlankPage()}
          >
            {tt("添加空白页")}
          </ControlButton>
          <ControlButton
            icon="pages"
            iconOnly
            title={tt("合并另一个 PDF 到末尾")}
            disabled={busy}
            onClick={() => mergeInputRef.current?.click()}
          >
            {tt("合并另一个 PDF 到末尾")}
          </ControlButton>
        </div>
        <input
          ref={mergeInputRef}
          type="file"
          accept="application/pdf,.pdf"
          aria-label={tt("合并另一个 PDF 到末尾")}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void editor.mergePdf(file, "append");
          }}
        />
        <p className="text-[10px] leading-relaxed text-[var(--muted,#78716c)]">
          {tt("选择当前页后，旋转、排序、提取和删除会出现在页面上方。")}
        </p>
      </section>

      <section className="space-y-2 border-t border-[var(--border,#e7e5e4)] pt-3">
        <p className="text-[11px] font-semibold text-[var(--fg,#292524)]">
          {tt("批注")}
        </p>
        <input
          type="text"
          value={editor.annotationText}
          disabled={busy}
          onChange={(event) => editor.setAnnotationText(event.target.value)}
          placeholder={tt("批注内容")}
          aria-label={tt("批注内容")}
          className="w-full rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2.5 py-2 text-[11px] text-[var(--fg,#292524)] outline-none focus:border-[var(--accent,#7c3aed)] disabled:opacity-40"
        />
        <div className="flex items-center gap-1.5">
          <ControlButton
            icon="select"
            iconOnly
            title={tt("选择和移动批注")}
            active={editor.annotationTool === "select"}
            disabled={busy}
            onClick={() => editor.setAnnotationTool("select")}
          >
            {tt("选择和移动批注")}
          </ControlButton>
          <ControlButton
            icon="note"
            iconOnly
            title={tt("点画布放置文字批注")}
            active={editor.annotationTool === "text"}
            disabled={busy || !editor.annotationText.trim()}
            onClick={() => editor.setAnnotationTool("text")}
          >
            {tt("点画布放置文字批注")}
          </ControlButton>
          <ControlButton
            icon="draw"
            iconOnly
            title={tt("拖画高亮批注")}
            active={editor.annotationTool === "highlight"}
            disabled={busy}
            onClick={() => editor.setAnnotationTool("highlight")}
          >
            {tt("拖画高亮批注")}
          </ControlButton>
        </div>
      </section>
    </div>
  );
}
