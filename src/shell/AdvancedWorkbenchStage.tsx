"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";
import { AdvancedEditorIcon } from "./AdvancedEditorIcon";
import type { LibraryItem } from "./library-data";
import { LibraryItemViewer } from "./library-viewers";

export function AdvancedWorkbenchStage({
  editorAvailable,
  editorStage,
  item,
  accent,
  draggedTitle,
  acceptLocalFiles = false,
  dropMessage,
  onMaterialDrop,
}: {
  editorAvailable: boolean;
  editorStage?: ReactNode;
  item: LibraryItem;
  accent: string;
  draggedTitle?: string;
  acceptLocalFiles?: boolean;
  dropMessage: string;
  onMaterialDrop: (event: DragEvent<HTMLDivElement>) => void;
}) {
  const tt = useUI();
  const dragDepth = useRef(0);
  const [localFileDragging, setLocalFileDragging] = useState(false);
  const acceptsFiles = (event: DragEvent<HTMLDivElement>) =>
    acceptLocalFiles &&
    Array.from(event.dataTransfer.types || []).includes("Files");
  return (
    <div
      role="main"
      className="relative h-full min-h-0 min-w-0 overflow-hidden bg-[var(--advanced-stage-bg,#f4f1e8)]"
      onDragEnter={(event) => {
        if (!acceptsFiles(event)) return;
        event.preventDefault();
        dragDepth.current += 1;
        setLocalFileDragging(true);
      }}
      onDragOver={(event) => {
        if (!acceptsFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (!localFileDragging && !acceptsFiles(event)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setLocalFileDragging(false);
      }}
      onDrop={(event) => {
        if (!acceptsFiles(event)) return;
        dragDepth.current = 0;
        setLocalFileDragging(false);
        onMaterialDrop(event);
      }}
    >
      {editorAvailable ? (
        <div className="h-full">{editorStage}</div>
      ) : (
        <div className="h-full overflow-auto bg-[var(--card,#fff)]">
          <LibraryItemViewer item={item} accent={accent} />
        </div>
      )}
      {(draggedTitle || localFileDragging) && (
        <div
          className="absolute inset-3 z-[80] grid place-items-center rounded-2xl border-2 border-dashed bg-[var(--card,#fff)]/88 p-6 text-center shadow-2xl backdrop-blur-sm"
          style={{ borderColor: accent }}
          onDragEnter={(event) => event.preventDefault()}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(event) => {
            event.stopPropagation();
            dragDepth.current = 0;
            setLocalFileDragging(false);
            onMaterialDrop(event);
          }}
        >
          <div>
            <span
              className="mx-auto grid h-14 w-14 place-items-center rounded-2xl text-white shadow-lg"
              style={{ background: accent }}
            >
              <AdvancedEditorIcon name="add" className="h-7 w-7" />
            </span>
            <p className="mt-4 text-[15px] font-semibold text-[var(--fg,#292524)]">
              {tt("拖到这里，添加到画布")}
            </p>
            <p className="mt-1 text-[11px] text-[var(--muted,#78716c)]">
              {draggedTitle || tt("本地文件")}
            </p>
          </div>
        </div>
      )}
      {dropMessage && (
        <div
          role="status"
          className="absolute bottom-5 left-1/2 z-[90] -translate-x-1/2 rounded-full bg-[var(--fg,#292524)] px-4 py-2 text-[11px] font-medium text-[var(--card,#fff)] shadow-xl"
        >
          {dropMessage}
        </div>
      )}
    </div>
  );
}
