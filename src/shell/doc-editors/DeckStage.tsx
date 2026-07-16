"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useUI } from "../../i18n/ui/useUI";
import { CHROME } from "../editor-chrome";
import { deckTheme, type DeckElement, type DeckSlide } from "./deck-schema";
import type { DeckEditorState } from "./use-deck-editor";

function ElementContent({
  element,
  miniature = false,
}: {
  element: DeckElement;
  miniature?: boolean;
}) {
  if (element.type === "image" && element.src) {
    return (
      <img
        src={element.src}
        alt={element.alt || ""}
        className="h-full w-full select-none object-contain"
        draggable={false}
      />
    );
  }
  if (element.type === "table") {
    return (
      <table className="h-full w-full table-fixed border-collapse bg-white text-[0.7em]">
        <tbody>
          {(element.rows || []).slice(0, miniature ? 4 : 100).map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.slice(0, miniature ? 4 : 50).map((cell, cellIndex) => (
                <td key={cellIndex} className="overflow-hidden border border-stone-300 px-[0.2em]">
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
      <span className="grid h-full place-items-center overflow-hidden border border-dashed border-stone-300 bg-stone-50 p-1 text-center text-[0.65em] text-stone-500">
        {element.label || "原始元素"}
      </span>
    );
  }
  return (
    <span
      className="flex h-full w-full overflow-hidden whitespace-pre-wrap leading-tight"
      style={{
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
      }}
    >
      {element.text || ""}
    </span>
  );
}

function MiniElementLayer({ slide }: { slide: DeckSlide }) {
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
          <ElementContent element={element} miniature />
        </span>
      ))}
    </>
  );
}

interface ElementDragState {
  id: string;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  originWidth: number;
  originHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

function PositionedSlideCanvas({ editor }: { editor: DeckEditorState }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<ElementDragState | null>(null);
  // 双击进入原地编辑（Canva 式所见即所得）：直接在画布上敲字，浮动 bar 只管样式。
  const [editingId, setEditingId] = useState("");
  const slide = editor.activeSlide;
  const theme = deckTheme(editor.deck.theme);

  const startDrag = (
    event: ReactPointerEvent<HTMLElement>,
    element: DeckElement,
    mode: "move" | "resize",
  ) => {
    if (event.button !== 0) return;
    if (editingId === element.id && mode === "move") return; // 编辑中不拖动
    event.preventDefault();
    event.stopPropagation();
    editor.selectElement(element.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      id: element.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      originX: element.x,
      originY: element.y,
      originWidth: element.width,
      originHeight: element.height,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
    });
  };

  const updateDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!drag || !rect?.width || !rect.height) return;
    const dx = ((event.clientX - drag.startX) / rect.width) * 100;
    const dy = ((event.clientY - drag.startY) / rect.height) * 100;
    setDrag((current) =>
      !current
        ? current
        : current.mode === "move"
          ? {
              ...current,
              x: Math.min(99, Math.max(-99, current.originX + dx)),
              y: Math.min(99, Math.max(-99, current.originY + dy)),
            }
          : {
              ...current,
              width: Math.max(1, current.originWidth + dx),
              height: Math.max(1, current.originHeight + dy),
            },
    );
  };

  const finishDrag = () => {
    if (!drag) return;
    editor.patchElement(drag.id, {
      x: drag.x,
      y: drag.y,
      width: drag.width,
      height: drag.height,
    });
    setDrag(null);
  };

  return (
    <div
      ref={canvasRef}
      className="relative h-full w-full overflow-hidden rounded-xl shadow-2xl"
      style={{
        background: slide.background || theme.background,
        color: theme.text,
        fontFamily: theme.fontFamily,
        containerType: "inline-size",
      }}
      onPointerDown={() => {
        editor.selectElement("");
        setEditingId("");
      }}
    >
      {[...slide.elements]
        .sort((left, right) => left.order - right.order)
        .map((element) => {
          const preview = drag?.id === element.id ? drag : null;
          const selected = editor.selectedElementId === element.id;
          const editing = editingId === element.id;
          const editable = element.type === "text" || element.type === "shape";
          return (
            <div
              key={element.id}
              role="button"
              tabIndex={0}
              onPointerDown={(event) => !editing && startDrag(event, element, "move")}
              onPointerMove={updateDrag}
              onPointerUp={finishDrag}
              onPointerCancel={() => setDrag(null)}
              onDoubleClick={(event) => {
                if (!editable) return;
                event.stopPropagation();
                editor.selectElement(element.id);
                setEditingId(element.id);
              }}
              className={`absolute overflow-visible text-left outline-none ${
                selected ? "ring-2 ring-offset-1" : ""
              }`}
              style={{
                left: `${preview?.x ?? element.x}%`,
                top: `${preview?.y ?? element.y}%`,
                width: `${preview?.width ?? element.width}%`,
                height: `${preview?.height ?? element.height}%`,
                transform: `rotate(${element.rotation}deg)`,
                zIndex: Math.round(element.order),
                cursor: editing ? "text" : "move",
                ["--tw-ring-color" as string]: theme.accent,
                background:
                  element.type === "shape" ? element.fill || "transparent" : undefined,
                border:
                  element.type === "shape" && element.borderWidth
                    ? `${element.borderWidth}px solid ${element.borderColor || "#000"}`
                    : undefined,
              }}
            >
              {editing && editable ? (
                <textarea
                  autoFocus
                  value={element.text || ""}
                  onChange={(event) =>
                    editor.patchElement(element.id, { text: event.target.value })
                  }
                  onBlur={() => setEditingId("")}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setEditingId("");
                    }
                  }}
                  className="h-full w-full resize-none border-0 bg-transparent p-0 leading-tight outline-none"
                  style={{
                    color: element.color,
                    fontFamily: element.fontFamily,
                    fontSize: `${Math.max(0.55, (element.fontSize || 18) / 7.2)}cqi`,
                    fontWeight: element.bold ? 700 : 400,
                    fontStyle: element.italic ? "italic" : "normal",
                    textAlign: element.align || "left",
                  }}
                />
              ) : (
                <ElementContent element={element} />
              )}
              {selected && !editing && (
                <span
                  role="presentation"
                  onPointerDown={(event) => startDrag(event, element, "resize")}
                  className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-se-resize rounded-sm border border-white shadow"
                  style={{ background: theme.accent }}
                />
              )}
            </div>
          );
        })}
      <span className="pointer-events-none absolute bottom-3 right-4 text-[10px] opacity-40">
        {editor.activeIndex + 1} / {editor.deck.slides.length}
      </span>
    </div>
  );
}

function MiniSlide({
  slide,
  number,
  active,
  theme,
  onClick,
}: {
  slide: DeckSlide;
  number: number;
  active: boolean;
  theme: ReturnType<typeof deckTheme>;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="group flex w-full items-start gap-2 text-left">
      <span className="w-5 shrink-0 pt-5 text-right text-[9px] text-[var(--muted,#a8a29e)]">{number}</span>
      <span
        className="relative aspect-video min-w-0 flex-1 overflow-hidden rounded-md border p-2 shadow-sm transition"
        style={{
          borderColor: active ? theme.accent : "var(--border,#d6d3d1)",
          boxShadow: active ? `0 0 0 2px ${theme.accent}33` : undefined,
          background: slide.background || theme.background,
          color: theme.text,
          fontFamily: theme.fontFamily,
        }}
      >
        {slide.elements.length ? (
          <MiniElementLayer slide={slide} />
        ) : (
          <>
            {slide.image?.url && (
              <img src={slide.image.url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" />
            )}
            <span className="relative block truncate text-[6px] font-bold">{slide.title || " "}</span>
            <span className="relative mt-1 block line-clamp-3 text-[4px] opacity-65">{slide.body || slide.bullets.join(" · ")}</span>
          </>
        )}
      </span>
    </button>
  );
}

function SlideCanvas({ editor }: { editor: DeckEditorState }) {
  const tt = useUI();
  const slide = editor.activeSlide;
  const theme = deckTheme(editor.deck.theme);
  const isCenter = slide.layout === "title" || slide.layout === "section";
  const hasImage = slide.layout === "image-left" || slide.layout === "image-right";
  const imageLeft = slide.layout === "image-left";

  if (slide.elements.length > 0) {
    return <PositionedSlideCanvas editor={editor} />;
  }

  const textPanel = (
    <div className={`flex min-w-0 flex-1 flex-col ${isCenter ? "items-center justify-center text-center" : "justify-start"}`}>
      <textarea
        aria-label={tt("幻灯片标题")}
        value={slide.title}
        rows={isCenter ? 2 : 1}
        onChange={(event) => editor.patchSlide({ title: event.target.value })}
        placeholder={tt("输入标题")}
        className={`w-full resize-none overflow-hidden bg-transparent font-bold outline-none placeholder:opacity-30 ${
          isCenter ? "text-center text-[clamp(24px,4vw,54px)]" : "text-[clamp(20px,3vw,38px)]"
        }`}
        style={{ color: theme.text, fontFamily: theme.fontFamily }}
      />
      {slide.layout !== "blank" && (
        <textarea
          aria-label={tt("幻灯片正文")}
          value={slide.body}
          rows={isCenter ? 3 : 5}
          onChange={(event) => editor.patchSlide({ body: event.target.value })}
          placeholder={tt("输入正文")}
          className={`mt-3 w-full resize-none bg-transparent text-[clamp(12px,1.6vw,21px)] leading-relaxed outline-none placeholder:opacity-30 ${
            isCenter ? "text-center" : "text-left"
          }`}
          style={{ color: theme.muted, fontFamily: theme.fontFamily }}
        />
      )}
      {slide.layout !== "blank" && slide.bullets.length > 0 && (
        <ul className={`mt-4 w-full space-y-2 text-[clamp(12px,1.5vw,20px)] ${isCenter ? "text-left" : ""}`} style={{ color: theme.text }}>
          {slide.bullets.map((bullet, index) => (
            <li key={`${index}-${bullet}`} className="flex gap-3">
              <span className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: theme.accent }} />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const imagePanel = hasImage ? (
    <div
      className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-[min(2vw,24px)]"
      style={{ background: theme.surface }}
    >
      {slide.image?.url ? (
        <img
          src={slide.image.url}
          alt={slide.image.alt || ""}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="grid h-full min-h-40 place-items-center border border-dashed border-current/20 text-[12px] opacity-45">
          {tt("在左侧添加配图 URL")}
        </div>
      )}
    </div>
  ) : null;

  return (
    <div
      className="relative flex h-full w-full overflow-hidden rounded-xl p-[clamp(28px,5vw,72px)] shadow-2xl"
      style={{
        background: slide.background || theme.background,
        color: theme.text,
        fontFamily: theme.fontFamily,
      }}
    >
      <div
        className="absolute left-[clamp(28px,5vw,72px)] top-[clamp(20px,3vw,44px)] h-1 w-14 rounded-full"
        style={{ background: theme.accent }}
      />
      <div className={`flex min-h-0 w-full gap-[clamp(24px,4vw,64px)] ${hasImage ? "" : "items-stretch"}`}>
        {imageLeft && imagePanel}
        {textPanel}
        {!imageLeft && imagePanel}
      </div>
      <span className="absolute bottom-4 right-5 text-[10px] opacity-40">
        {editor.activeIndex + 1} / {editor.deck.slides.length}
      </span>
    </div>
  );
}

export function DeckStage({
  editor,
  accent = "#4f46e5",
}: {
  editor: DeckEditorState;
  accent?: string;
}) {
  const tt = useUI();
  const theme = deckTheme(editor.deck.theme);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) editor.redo();
        else editor.undo();
      } else if (event.key === "ArrowUp" || event.key === "PageUp") {
        event.preventDefault();
        const previous = editor.deck.slides[editor.activeIndex - 1];
        if (previous) editor.selectSlide(previous.id);
      } else if (event.key === "ArrowDown" || event.key === "PageDown") {
        event.preventDefault();
        const next = editor.deck.slides[editor.activeIndex + 1];
        if (next) editor.selectSlide(next.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor]);

  return (
    <div className="flex h-full min-h-0 bg-[var(--bg,#f5f5f4)]">
      {/* 幻灯片缩略图导航（页列表）。 */}
      <aside className={`w-40 shrink-0 overflow-y-auto border-r ${CHROME.border} ${CHROME.subtle} p-2.5`}>
        <div className="space-y-2.5">
          {editor.deck.slides.map((slide, index) => (
            <MiniSlide
              key={slide.id}
              slide={slide}
              number={index + 1}
              active={slide.id === editor.activeSlide.id}
              theme={theme}
              onClick={() => editor.selectSlide(slide.id)}
            />
          ))}
        </div>
      </aside>
      <main className="relative grid min-h-0 min-w-0 flex-1 place-items-center overflow-auto p-6 lg:p-10">
        <div
          className="w-full max-w-5xl"
          style={{ aspectRatio: editor.deck.aspect === "4:3" ? "4 / 3" : "16 / 9" }}
        >
          <SlideCanvas editor={editor} />
        </div>
        {editor.loading && (
          <div className="absolute inset-0 grid place-items-center bg-[var(--card,#ffffff)]/85 text-[12px] text-[var(--muted,#78716c)]">
            {tt("正在载入演示文稿…")}
          </div>
        )}
      </main>
    </div>
  );
}
