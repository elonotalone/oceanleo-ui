"use client";

// 2026-11-07 UX wave (LU): drop files or folders anywhere on a Library page. Only drags that carry files
// count — dragging a Library card out to a workbench is not a drop target here.

import { useRef, useState, type DragEvent } from "react";
import { useUI } from "../i18n/ui/useUI";
import { readDataTransfer, type DroppedFolder } from "./dropped-entries";

export interface LibraryDrop {
  files: File[];
  folders: DroppedFolder[];
}

export function isFileDrag(event: { dataTransfer: DataTransfer | null }): boolean {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

export function useLibraryDrop({
  disabled,
  onDrop,
  onError,
}: {
  disabled: boolean;
  onDrop: (drop: LibraryDrop) => void;
  onError?: (error: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const dropProps = {
    onDragEnter(event: DragEvent<HTMLElement>) {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      depth.current += 1;
      if (!disabled) setDragging(true);
    },
    onDragOver(event: DragEvent<HTMLElement>) {
      if (!isFileDrag(event)) return;
      // Always claim a file drag: otherwise the browser opens the dropped file in place of the page.
      event.preventDefault();
      event.dataTransfer.dropEffect = disabled ? "none" : "copy";
    },
    onDragLeave(event: DragEvent<HTMLElement>) {
      if (!isFileDrag(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDrop(event: DragEvent<HTMLElement>) {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      if (disabled) return;
      // Entries must be taken from the DataTransfer inside this event; readDataTransfer does that first.
      void readDataTransfer(event.dataTransfer).then((drop) => {
        if (drop.files.length || drop.folders.length) onDrop(drop);
      }).catch((error: unknown) => onError?.(error instanceof Error ? error.message : "无法读取拖入的文件夹，请重试"));
    },
  };
  return { dragging, dropProps };
}

export function LibraryDropOverlay({ show }: { show: boolean }) {
  const tt = useUI();
  if (!show) return null;
  return (
    <div
      aria-hidden="true"
      data-library-drop-overlay=""
      className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-xl border-2 border-dashed border-[var(--fg,#292524)]/30 bg-[var(--card,#fff)]/85 text-[14px] font-medium text-[var(--fg,#292524)]"
    >
      {tt("松手即可添加文件")}
    </div>
  );
}
