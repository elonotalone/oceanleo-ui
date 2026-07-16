"use client";

import type { DeckElement, DeckSlide } from "./deck-schema";

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
                      className={`overflow-hidden border border-[var(--divider,#d6d3d1)] px-[0.2em] ${
                        editing
                          ? "cursor-text outline-none focus:bg-white/20 focus:ring-1 focus:ring-inset focus:ring-[var(--accent,#7c3aed)]"
                          : ""
                      }`}
                      onPointerDown={(event) => {
                        if (editing) event.stopPropagation();
                      }}
                      onBlur={(event) =>
                        onCommitCell?.(
                          rowIndex,
                          cellIndex,
                          event.currentTarget.textContent || "",
                        )
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
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
      <div
        contentEditable
        suppressContentEditableWarning
        autoFocus
        className="flex h-full w-full cursor-text overflow-hidden whitespace-pre-wrap rounded-sm outline-none ring-2 ring-white/70"
        style={textStyle}
        onPointerDown={(event) => event.stopPropagation()}
        onBlur={(event) => onCommitText?.(event.currentTarget.innerText || "")}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.currentTarget.textContent = element.text || "";
            onCancelEditing?.();
            event.currentTarget.blur();
          }
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      >
        {element.text || ""}
      </div>
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
            background: element.type === "shape" ? element.fill : undefined,
            border:
              element.type === "shape" && element.borderWidth
                ? `${Math.max(0.25, element.borderWidth / 4)}px solid ${element.borderColor || "#000"}`
                : undefined,
          }}
        >
          <DeckElementContent element={element} miniature />
        </span>
      ))}
    </>
  );
}
