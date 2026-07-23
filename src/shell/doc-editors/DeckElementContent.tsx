"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import type { DeckElement, DeckSlide } from "./deck-schema";

export function deckShapeClipPath(shape?: string): string | undefined {
  switch (shape) {
    case "triangle":
      return "polygon(50% 0, 100% 100%, 0 100%)";
    case "diamond":
      return "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)";
    case "star":
      return "polygon(50% 0, 61% 35%, 98% 35%, 68% 57%, 79% 94%, 50% 72%, 21% 94%, 32% 57%, 2% 35%, 39% 35%)";
    case "arrow":
      return "polygon(0 30%, 62% 30%, 62% 5%, 100% 50%, 62% 95%, 62% 70%, 0 70%)";
    case "hexagon":
      return "polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)";
    default:
      return undefined;
  }
}

export function deckEditableTextValue(element: HTMLElement): string {
  return (element.innerText || element.textContent || "").replace(/\r\n?/g, "\n");
}

function DeckEditableText({
  element,
  textStyle,
  onCommitText,
  onCancelEditing,
}: {
  element: DeckElement;
  textStyle: CSSProperties;
  onCommitText?: (text: string) => void;
  onCancelEditing?: () => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const settledRef = useRef(false);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }, []);
  const commit = (editor: HTMLDivElement) => {
    if (settledRef.current) return;
    settledRef.current = true;
    onCommitText?.(deckEditableTextValue(editor));
  };
  return (
    <div
      ref={editorRef}
      role="textbox"
      aria-multiline="true"
      contentEditable
      suppressContentEditableWarning
      data-deck-editable-text
      className="flex h-full w-full cursor-text overflow-hidden whitespace-pre-wrap rounded-sm outline-none ring-2 ring-white/70"
      style={textStyle}
      onPointerDown={(event) => event.stopPropagation()}
      onBlur={(event) => commit(event.currentTarget)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          settledRef.current = true;
          event.currentTarget.textContent = element.text || "";
          onCancelEditing?.();
          event.currentTarget.blur();
        } else if (
          (event.metaKey || event.ctrlKey) &&
          event.key === "Enter"
        ) {
          event.preventDefault();
          commit(event.currentTarget);
          event.currentTarget.blur();
        }
      }}
    >
      {element.text || ""}
    </div>
  );
}

export function DeckElementContent({
  element,
  miniature = false,
  editing = false,
  onCommitText,
  onCommitCell,
  onCancelEditing,
}: {
  element: DeckElement;
  miniature?: boolean;
  editing?: boolean;
  onCommitText?: (text: string) => void;
  onCommitCell?: (row: number, column: number, text: string) => void;
  onCancelEditing?: () => void;
}) {
  if (element.type === "image" && element.src) {
    return (
      <img
        src={element.src}
        alt={element.alt || ""}
        className="h-full w-full select-none"
        style={{
          objectFit: element.imageFit || "contain",
          filter: `brightness(${element.brightness ?? 1}) contrast(${element.contrast ?? 1}) saturate(${element.saturation ?? 1}) blur(${element.blur ?? 0}px)`,
          transform: `scaleX(${element.flipX ? -1 : 1}) scaleY(${element.flipY ? -1 : 1})`,
        }}
        draggable={false}
      />
    );
  }
  if (element.type === "table") {
    return (
      <table
        className="h-full w-full table-fixed border-collapse text-[0.7em]"
        style={{
          background: element.fill || "#ffffff",
          color: element.color || "#292524",
          fontSize: miniature
            ? undefined
            : `${Math.max(0.45, (element.fontSize || 16) / 7.2)}cqi`,
          fontWeight: element.bold ? 700 : 400,
          fontStyle: element.italic ? "italic" : "normal",
          textDecoration: element.underline ? "underline" : "none",
          lineHeight: element.lineHeight || 1.15,
          letterSpacing: `${element.letterSpacing || 0}px`,
        }}
      >
        <tbody>
          {(element.rows || [])
            .slice(0, miniature ? 4 : 100)
            .map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row
                  .slice(0, miniature ? 4 : 50)
                  .map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      contentEditable={editing && !miniature}
                      suppressContentEditableWarning
                      autoFocus={
                        editing &&
                        !miniature &&
                        rowIndex === 0 &&
                        cellIndex === 0
                      }
                      style={{
                        borderColor:
                          element.borderColor || "var(--divider,#d6d3d1)",
                        borderWidth: `${Math.max(
                          0,
                          element.borderWidth ?? 1,
                        )}px`,
                      }}
                      className={`overflow-hidden border border-[var(--divider,#d6d3d1)] px-[0.2em] ${
                        editing
                          ? "cursor-text outline-none focus:bg-white/20 focus:ring-1 focus:ring-inset focus:ring-[var(--accent,#7c3aed)]"
                          : ""
                      }`}
                      onPointerDown={(event) => {
                        if (editing) event.stopPropagation();
                      }}
                      onBlur={(event) => {
                        if (event.currentTarget.dataset.deckEditCancelled) {
                          delete event.currentTarget.dataset.deckEditCancelled;
                          return;
                        }
                        onCommitCell?.(
                          rowIndex,
                          cellIndex,
                          event.currentTarget.textContent || "",
                        );
                        const nextTarget = event.relatedTarget;
                        const staysInTable =
                          nextTarget instanceof Node &&
                          Boolean(
                            event.currentTarget
                              .closest("table")
                              ?.contains(nextTarget),
                          );
                        if (!staysInTable) onCancelEditing?.();
                      }}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Escape") {
                          event.preventDefault();
                          event.currentTarget.dataset.deckEditCancelled = "true";
                          event.currentTarget.textContent = cell;
                          onCancelEditing?.();
                          event.currentTarget.blur();
                        } else if (
                          (event.metaKey || event.ctrlKey) &&
                          event.key === "Enter"
                        ) {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                    >
                      {cell}
                    </td>
                  ))}
              </tr>
            ))}
        </tbody>
      </table>
    );
  }
  if (element.type === "shape" && element.shape === "line") {
    const markerId = element.id.replace(/[^a-z0-9_-]/gi, "");
    const startMarker =
      element.lineStart && element.lineStart !== "none"
        ? `url(#${markerId}-start-${element.lineStart})`
        : undefined;
    const endMarker =
      element.lineEnd && element.lineEnd !== "none"
        ? `url(#${markerId}-end-${element.lineEnd})`
        : undefined;
    const dash =
      element.lineDash === "dot"
        ? "1 8"
        : element.lineDash === "dash"
          ? "12 9"
          : undefined;
    const marker = (position: "start" | "end", kind: string) => (
      <marker
        id={`${markerId}-${position}-${kind}`}
        viewBox="0 0 10 10"
        refX={position === "start" ? 3 : 7}
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        {kind === "circle" ? (
          <circle cx="5" cy="5" r="3.3" fill="currentColor" />
        ) : kind === "diamond" ? (
          <path d="M5 1 9 5 5 9 1 5Z" fill="currentColor" />
        ) : (
          <path d="M1 1 9 5 1 9Z" fill="currentColor" />
        )}
      </marker>
    );
    const color =
      element.borderColor && element.borderColor !== "transparent"
        ? element.borderColor
        : element.fill || "#111827";
    return (
      <svg
        viewBox="0 0 100 20"
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
        style={{ color }}
        aria-hidden="true"
      >
        <defs>
          {element.lineStart &&
            element.lineStart !== "none" &&
            marker("start", element.lineStart)}
          {element.lineEnd &&
            element.lineEnd !== "none" &&
            marker("end", element.lineEnd)}
        </defs>
        <line
          x1="4"
          y1="10"
          x2="96"
          y2="10"
          stroke="currentColor"
          strokeWidth={Math.max(1.5, element.borderWidth || 3)}
          strokeLinecap="round"
          strokeDasharray={dash}
          markerStart={startMarker}
          markerEnd={endMarker}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }
  if (element.type === "unsupported") {
    return (
      <span className="grid h-full place-items-center overflow-hidden border border-dashed border-[var(--border,#d6d3d1)] bg-[var(--surface,#fafaf9)] p-1 text-center text-[0.65em] text-[var(--muted,#78716c)]">
        {element.label || "原始元素"}
      </span>
    );
  }
  const textStyle = {
    alignItems: "center",
    justifyContent:
      element.align === "center"
        ? "center"
        : element.align === "right"
          ? "flex-end"
          : "flex-start",
    textAlign: element.align || "left",
    color: element.color,
    fontFamily: element.fontFamily,
    fontSize: miniature
      ? undefined
      : `${Math.max(0.55, (element.fontSize || 18) / 7.2)}cqi`,
    fontWeight: element.bold ? 700 : 400,
    fontStyle: element.italic ? "italic" : "normal",
    textDecoration: element.underline ? "underline" : "none",
    lineHeight: element.lineHeight || 1.15,
    letterSpacing: `${element.letterSpacing || 0}px`,
  } as const;
  if (editing && !miniature) {
    return (
      <DeckEditableText
        element={element}
        textStyle={textStyle}
        onCommitText={onCommitText}
        onCancelEditing={onCancelEditing}
      />
    );
  }
  return (
    <span
      className="flex h-full w-full overflow-hidden whitespace-pre-wrap leading-tight"
      style={textStyle}
    >
      {element.text || ""}
    </span>
  );
}

export function MiniDeckElementLayer({ slide }: { slide: DeckSlide }) {
  return (
    <>
      {slide.elements.map((element) => (
        <span
          key={element.id}
          className="absolute overflow-hidden text-[3px] leading-none"
          style={{
            left: `${element.x}%`,
            top: `${element.y}%`,
            width: `${element.width}%`,
            height: `${element.height}%`,
            transform: `rotate(${element.rotation}deg)`,
            zIndex: Math.round(element.order),
            opacity: element.opacity ?? 1,
            background:
              element.type === "shape" && element.shape !== "line"
                ? element.fill
                : undefined,
            border:
              (element.type === "shape" || element.type === "image") &&
              element.borderWidth
                ? `${Math.max(0.25, element.borderWidth / 4)}px solid ${element.borderColor || "#000"}`
                : undefined,
            borderRadius:
              element.type === "shape" && element.shape === "circle"
                ? "50%"
                : `${Math.max(0, (element.borderRadius || 0) / 4)}px`,
            boxShadow: element.shadow
              ? "0 3.5px 8px rgba(15,23,42,.24)"
              : undefined,
            clipPath:
              element.type === "shape"
                ? deckShapeClipPath(element.shape)
                : undefined,
          }}
        >
          <DeckElementContent element={element} miniature />
        </span>
      ))}
    </>
  );
}
