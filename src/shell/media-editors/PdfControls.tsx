"use client";

import { useRef } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { CHROME, PanelSection } from "../editor-chrome";
import type { PdfWorkbenchState } from "./use-pdf-workbench";

// PDF「页面工具」overlay 侧栏内容：视图缩放、加页/合并。撤销/重做、下载、保存
// 副本已上移到统一顶栏（AdvancedTopBar）；单页操作（旋转/排序/提取/删除）仍在
// 选中页浮动 bar（PdfContextToolbar）。全部走 CHROME/CSS 变量令牌跟随双主题。

function ControlButton({
  children,
  onClick,
  disabled,
  accent,
  primary = false,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  accent?: string;
  primary?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={
        primary
          ? "rounded-lg px-2 py-2 text-[11px] font-semibold text-white disabled:opacity-45"
          : `rounded-lg border ${CHROME.border} px-2 py-2 text-[11px] ${CHROME.fg2} ${CHROME.hover} disabled:opacity-40`
      }
      style={primary ? { background: accent || "#4f46e5" } : undefined}
    >
      {children}
    </button>
  );
}

export function PdfControls({
  editor,
  accent = "#4f46e5",
}: {
  editor: PdfWorkbenchState;
  accent?: string;
}) {
  const tt = useUI();
  const mergeInputRef = useRef<HTMLInputElement | null>(null);
  const busy = editor.loading || editor.processing || editor.saving;
  void accent;

  return (
    <div className="space-y-1">
      <PanelSection title={tt("视图")}>
        <div className="mb-2 flex items-center justify-end">
          <span className={`text-[10px] tabular-nums ${CHROME.muted}`}>
            {editor.zoom}% · {editor.rotation}°
          </span>
        </div>
        <input
          type="range"
          min={25}
          max={300}
          step={5}
          value={editor.zoom}
          disabled={editor.loading}
          onChange={(event) => editor.setZoom(Number(event.target.value))}
          className="w-full"
          style={{ accentColor: accent }}
        />
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <ControlButton disabled={editor.loading} onClick={() => editor.zoomBy(-25)}>
            − {tt("缩小")}
          </ControlButton>
          <ControlButton disabled={editor.loading} onClick={() => editor.zoomBy(25)}>
            + {tt("放大")}
          </ControlButton>
        </div>
      </PanelSection>

      <PanelSection title={tt("添加页面")}>
        <div className="grid grid-cols-1 gap-1.5">
          <ControlButton disabled={busy} onClick={() => void editor.addBlankPage()}>
            + {tt("添加空白页")}
          </ControlButton>
        </div>
        <input
          ref={mergeInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void editor.mergePdf(file, "append");
          }}
        />
        <div className="mt-1.5">
          <ControlButton
            disabled={busy}
            onClick={() => mergeInputRef.current?.click()}
          >
            {editor.processing ? tt("处理中…") : tt("合并另一个 PDF 到末尾")}
          </ControlButton>
        </div>
        <p className={`mt-1.5 text-[10px] leading-relaxed ${CHROME.muted}`}>
          {tt("选择当前页后，旋转、排序、提取和删除会出现在页面上方。")}
        </p>
      </PanelSection>
    </div>
  );
}
