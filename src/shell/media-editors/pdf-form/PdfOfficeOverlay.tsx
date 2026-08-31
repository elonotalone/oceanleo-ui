"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { normalizedVisualRect, type PdfVisualRect } from "../pdf-annotation-operations";
import type { PdfOfficeWorkbenchState } from "./types";

function eventPoint(event: ReactPointerEvent<HTMLElement>): PdfVisualRect {
  const target = event.currentTarget;
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return {
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height,
    width: 0,
    height: 0,
  };
}

export function PdfOfficeOverlay({
  editor,
}: {
  editor: PdfOfficeWorkbenchState;
}) {
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  const dragStart = useRef<PdfVisualRect | null>(null);

  useEffect(() => {
    const find = () =>
      document.querySelector<HTMLElement>("[data-pdf-annotation-layer]");
    setLayer(find() || null);
    const timer = window.setInterval(() => {
      const next = find();
      setLayer((current) => (current === next ? current : next));
    }, 500);
    return () => window.clearInterval(timer);
  }, [editor.pageNumber, editor.loading]);

  const active =
    !editor.loading &&
    !editor.processing &&
    (editor.officeTool === "signature" || editor.officeTool === "redaction");

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!active || editor.officeTool === "none") return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragStart.current = eventPoint(event);
      editor.setRedactionPreview({
        ...dragStart.current,
        width: 0,
        height: 0,
      });
    },
    [active, editor],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragStart.current) return;
      const end = eventPoint(event);
      editor.setRedactionPreview(
        normalizedVisualRect(dragStart.current, end),
      );
    },
    [editor],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragStart.current) return;
      const end = eventPoint(event);
      const rect = normalizedVisualRect(dragStart.current, end);
      dragStart.current = null;
      editor.setRedactionPreview(null);
      if (rect.width < 0.005 || rect.height < 0.005) return;
      if (editor.officeTool === "signature") {
        void editor.placeSignatureAt(rect);
        return;
      }
      if (editor.officeTool === "redaction") {
        editor.addRedactionMark(rect);
      }
    },
    [editor],
  );

  if (!layer || !active) return null;

  const preview = editor.redactionPreview;
  return createPortal(
    <div
      data-pdf-office-overlay
      className="absolute inset-0 z-30 touch-none cursor-crosshair"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {preview && preview.width > 0 && preview.height > 0 ? (
        <div
          aria-hidden
          className="pointer-events-none absolute border-2 border-dashed"
          style={{
            left: `${preview.x * 100}%`,
            top: `${preview.y * 100}%`,
            width: `${preview.width * 100}%`,
            height: `${preview.height * 100}%`,
            borderColor:
              editor.officeTool === "redaction"
                ? "rgba(0,0,0,.85)"
                : "var(--awb-accent,#7c3aed)",
            background:
              editor.officeTool === "redaction"
                ? "rgba(0,0,0,.45)"
                : "rgba(124,58,237,.12)",
          }}
        />
      ) : null}
      {editor.officeTool === "redaction"
        ? editor.redactionMarks
            .filter((mark) => mark.pageIndex === editor.pageNumber - 1)
            .map((mark) => (
              <div
                key={mark.id}
                aria-hidden
                className="pointer-events-none absolute"
                style={{
                  left: `${mark.rect.x * 100}%`,
                  top: `${mark.rect.y * 100}%`,
                  width: `${mark.rect.width * 100}%`,
                  height: `${mark.rect.height * 100}%`,
                  background: "rgba(0,0,0,.55)",
                  outline: "1px dashed rgba(255,255,255,.6)",
                }}
              />
            ))
        : null}
    </div>,
    layer,
  );
}
