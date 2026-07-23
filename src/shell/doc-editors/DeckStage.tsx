"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useUI } from "../../i18n/ui/useUI";
import { AdvancedEditorIcon } from "../AdvancedEditorIcon";
import { useAdvancedLayout } from "../advanced-layout-context";
import { useCenteredWheelZoom } from "../use-centered-wheel-zoom";
import {
  deckPageViewport,
  moveDeckElement,
  resizeDeckElement,
  rotateDeckElement,
  type DeckResizeHandle,
} from "./deck-geometry";
import {
  deckMasterFor,
  deckTheme,
  type DeckElement,
  type DeckSlide,
} from "./deck-schema";
import {
  DeckElementContent,
  deckShapeClipPath,
} from "./DeckElementContent";
import type { DeckInkStyle } from "./deck-ink";
import { deckTextGestureProps } from "./deck-text-gesture";
import { DeckInkOverlay } from "./DeckInkOverlay";
import { DeckSlideRail } from "./DeckSlideRail";
import { useDeckStageShortcuts } from "./use-deck-stage-shortcuts";
import type { DeckEditorState } from "./use-deck-editor";

interface ElementInteraction {
  id: string;
  mode: "move" | "resize" | "rotate";
  handle?: DeckResizeHandle;
  startX: number;
  startY: number;
  origin: DeckElement;
  preview: Partial<DeckElement>;
}

const RESIZE_HANDLES: {
  id: DeckResizeHandle;
  className: string;
  cursor: string;
}[] = [
  { id: "nw", className: "-left-1.5 -top-1.5", cursor: "nwse-resize" },
  { id: "n", className: "left-1/2 -top-1.5 -translate-x-1/2", cursor: "ns-resize" },
  { id: "ne", className: "-right-1.5 -top-1.5", cursor: "nesw-resize" },
  { id: "e", className: "-right-1.5 top-1/2 -translate-y-1/2", cursor: "ew-resize" },
  { id: "se", className: "-bottom-1.5 -right-1.5", cursor: "nwse-resize" },
  { id: "s", className: "-bottom-1.5 left-1/2 -translate-x-1/2", cursor: "ns-resize" },
  { id: "sw", className: "-bottom-1.5 -left-1.5", cursor: "nesw-resize" },
  { id: "w", className: "-left-1.5 top-1/2 -translate-y-1/2", cursor: "ew-resize" },
];

function PositionedSlideCanvas({
  editor,
  activeTool,
  inkStyle,
}: {
  editor: DeckEditorState;
  activeTool: string;
  inkStyle: DeckInkStyle;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const layout = useAdvancedLayout();
  const [interaction, setInteraction] = useState<ElementInteraction | null>(
    null,
  );
  const [editingId, setEditingId] = useState("");
  const slide = editor.activeSlide;
  const theme = deckTheme(editor.deck.theme);
  const master = deckMasterFor(editor.deck, slide);

  useEffect(() => {
    editor.setCanvasElement(canvasRef.current);
    return () => editor.setCanvasElement(null);
  }, [editor.setCanvasElement]);
  useEffect(() => {
    if (
      editingId &&
      slide.elements.some(
        (element) => element.id === editingId && element.locked,
      )
    ) {
      setEditingId("");
    }
  }, [editingId, slide.elements]);

  const startInteraction = (
    event: ReactPointerEvent<HTMLElement>,
    element: DeckElement,
    mode: ElementInteraction["mode"],
    handle?: DeckResizeHandle,
  ) => {
    if (event.button !== 0 || element.locked || editingId === element.id) return;
    event.preventDefault();
    event.stopPropagation();
    editor.selectElement(element.id);
    canvasRef.current?.setPointerCapture(event.pointerId);
    setInteraction({
      id: element.id,
      mode,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...element, rows: element.rows?.map((row) => [...row]) },
      preview: {},
    });
  };

  const updateInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!interaction || !rect?.width || !rect.height) return;
    const start = { x: interaction.startX, y: interaction.startY };
    const current = { x: event.clientX, y: event.clientY };
    let preview: Partial<DeckElement>;
    if (interaction.mode === "move") {
      preview = moveDeckElement(interaction.origin, start, current, rect);
    } else if (interaction.mode === "resize" && interaction.handle) {
      preview = resizeDeckElement(
        interaction.origin,
        interaction.handle,
        start,
        current,
        rect,
        event.shiftKey || interaction.origin.type === "image",
      );
    } else {
      preview = rotateDeckElement(
        interaction.origin,
        start,
        current,
        rect,
        event.shiftKey,
      );
    }
    setInteraction((state) => (state ? { ...state, preview } : state));
  };

  const finishInteraction = () => {
    if (!interaction) return;
    if (Object.keys(interaction.preview).length) {
      editor.patchElement(interaction.id, interaction.preview);
    }
    setInteraction(null);
  };

  return (
    <div
      ref={canvasRef}
      data-deck-canvas
      className="relative h-full w-full overflow-hidden rounded-lg shadow-2xl"
      style={{
        background: slide.background || master.background || theme.background,
        color: master.textColor || theme.text,
        fontFamily: master.fontFamily || theme.fontFamily,
        containerType: "inline-size",
      }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          setEditingId("");
          editor.selectElement("");
        }
      }}
      onPointerMove={updateInteraction}
      onPointerUp={finishInteraction}
      onPointerCancel={() => setInteraction(null)}
    >
      {[...slide.elements]
        .sort((left, right) => left.order - right.order)
        .map((element) => {
          const preview =
            interaction?.id === element.id ? interaction.preview : null;
          const rendered = preview ? { ...element, ...preview } : element;
          const selected = editor.selectedElementId === element.id;
          const editing = editingId === element.id && !element.locked;
          const shapeClip =
            element.type === "shape"
              ? deckShapeClipPath(element.shape)
              : undefined;
          return (
            <div
              key={element.id}
              role="button"
              tabIndex={selected ? 0 : -1}
              aria-label={element.alt || element.label || element.type}
              aria-pressed={selected}
              onPointerDown={(event) => {
                editor.selectElement(element.id);
                if (
                  event.detail >= 2 &&
                  !element.locked &&
                  (element.type === "text" ||
                    element.type === "table" ||
                    (element.type === "shape" && Boolean(element.text)))
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                  setEditingId(element.id);
                  return;
                }
                if (!editing) startInteraction(event, element, "move");
              }}
              onDoubleClick={(event) => {
                if (
                  !element.locked &&
                  (element.type === "text" ||
                    element.type === "table" ||
                    (element.type === "shape" && element.text))
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                  editor.selectElement(element.id);
                  setEditingId(element.id);
                }
              }}
              className={`absolute overflow-visible text-left outline-none ${
                selected
                  ? "after:pointer-events-none after:absolute after:-inset-[2px] after:rounded-[inherit] after:border-2 after:border-[#8b5cf6]"
                  : ""
              } ${element.locked ? "cursor-default" : editing ? "cursor-text" : "cursor-move"}`}
              data-deck-element={element.id}
              data-element-type={element.type}
              data-locked={element.locked ? "true" : "false"}
              style={{
                left: `${rendered.x}%`,
                top: `${rendered.y}%`,
                width: `${rendered.width}%`,
                height: `${rendered.height}%`,
                transform: `rotate(${rendered.rotation}deg)`,
                zIndex: Math.round(rendered.order),
                opacity: rendered.opacity ?? 1,
                background:
                  rendered.type === "shape" && rendered.shape !== "line"
                    ? rendered.fill || "transparent"
                    : undefined,
                border:
                  (rendered.type === "shape" ||
                    rendered.type === "image") &&
                  rendered.borderWidth
                    ? `${rendered.borderWidth}px solid ${rendered.borderColor || "#000"}`
                    : undefined,
                borderRadius:
                  rendered.type === "shape" && rendered.shape === "circle"
                    ? "50%"
                    : `${rendered.borderRadius || 0}px`,
                boxShadow: rendered.shadow
                  ? "0 14px 32px rgba(15,23,42,.24)"
                  : undefined,
                clipPath: shapeClip,
              }}
            >
              <div
                className="h-full w-full overflow-hidden rounded-[inherit]"
                style={{
                  animation: rendered.animation
                    ? `oleo-deck-element-${rendered.animation.type} ${rendered.animation.durationMs}ms ease-out ${rendered.animation.delayMs}ms both`
                    : undefined,
                }}
              >
                <DeckElementContent
                  element={rendered}
                  editing={editing}
                  onCancelEditing={() => setEditingId("")}
                  onCommitText={(text) => {
                    setEditingId("");
                    if (text !== element.text) {
                      editor.patchElement(element.id, { text });
                    }
                  }}
                  onCommitCell={(rowIndex, columnIndex, text) => {
                    const rows = (element.rows || []).map((row) => [...row]);
                    if (!rows[rowIndex] || rows[rowIndex][columnIndex] === text) {
                      return;
                    }
                    rows[rowIndex][columnIndex] = text;
                    editor.patchElement(element.id, { rows });
                  }}
                />
              </div>
              {selected && (
                <>
                  <div
                    className="absolute left-1/2 top-[-44px] z-30 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-1 text-[var(--fg,#292524)] shadow-xl"
                    style={{
                      transform: `translateX(-50%) rotate(${-rendered.rotation}deg)`,
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => layout?.openDrawer("agent")}
                      className="grid h-7 w-7 place-items-center rounded-lg hover:bg-[var(--surface-hover,rgba(0,0,0,.06))]"
                      title="让 AI 改"
                      aria-label="让 AI 改"
                    >
                      <AdvancedEditorIcon name="ai" className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={element.locked}
                      onClick={editor.duplicateElement}
                      className="grid h-7 w-7 place-items-center rounded-lg hover:bg-[var(--surface-hover,rgba(0,0,0,.06))] disabled:cursor-not-allowed disabled:opacity-35"
                      title="复制"
                      aria-label="复制"
                    >
                      <AdvancedEditorIcon name="duplicate" className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={editor.toggleElementLock}
                      className="grid h-7 w-7 place-items-center rounded-lg hover:bg-[var(--surface-hover,rgba(0,0,0,.06))]"
                      title={element.locked ? "解锁" : "锁定"}
                      aria-label={element.locked ? "解锁" : "锁定"}
                    >
                      <AdvancedEditorIcon
                        name={element.locked ? "unlock" : "lock"}
                        className="h-4 w-4"
                      />
                    </button>
                    <button
                      type="button"
                      disabled={element.locked}
                      onClick={editor.deleteElement}
                      className="grid h-7 w-7 place-items-center rounded-lg text-rose-600 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-35"
                      title="删除"
                      aria-label="删除"
                    >
                      <AdvancedEditorIcon name="delete" className="h-4 w-4" />
                    </button>
                  </div>
                  {!element.locked &&
                    RESIZE_HANDLES.map((handle) => (
                      <span
                        key={handle.id}
                        role="presentation"
                        onPointerDown={(event) =>
                          startInteraction(event, element, "resize", handle.id)
                        }
                        className={`absolute z-20 h-3 w-3 rounded-[3px] border-2 border-white bg-[#8b5cf6] shadow ${handle.className}`}
                        style={{ cursor: handle.cursor }}
                      />
                    ))}
                  {!element.locked && (
                    <>
                      <span className="pointer-events-none absolute -bottom-7 left-1/2 h-7 w-px -translate-x-1/2 bg-[#8b5cf6]" />
                      <span
                        role="presentation"
                        onPointerDown={(event) =>
                          startInteraction(event, element, "rotate")
                        }
                        className="absolute -bottom-10 left-1/2 z-20 grid h-4 w-4 -translate-x-1/2 cursor-grab place-items-center rounded-full border-2 border-white bg-[#8b5cf6] shadow active:cursor-grabbing"
                      />
                    </>
                  )}
                </>
              )}
            </div>
          );
        })}
      {activeTool === "draw" && (
        <DeckInkOverlay
          style={inkStyle}
          onCommit={(stroke) =>
            editor.addInkElement([stroke], inkStyle, "canvas")
          }
        />
      )}
      <span className="pointer-events-none absolute bottom-3 right-4 text-[10px] opacity-40">
        {editor.activeIndex + 1} / {editor.deck.slides.length}
      </span>
    </div>
  );
}

function SlideCanvas({
  editor,
  activeTool,
  inkStyle,
}: {
  editor: DeckEditorState;
  activeTool: string;
  inkStyle: DeckInkStyle;
}) {
  const tt = useUI();
  const slide = editor.activeSlide;
  const theme = deckTheme(editor.deck.theme);
  const master = deckMasterFor(editor.deck, slide);
  const isCenter = slide.layout === "title" || slide.layout === "section";
  const hasImage = slide.layout === "image-left" || slide.layout === "image-right";
  const imageLeft = slide.layout === "image-left";

  if (slide.elements.length > 0 || activeTool === "draw") {
    return (
      <PositionedSlideCanvas
        editor={editor}
        activeTool={activeTool}
        inkStyle={inkStyle}
      />
    );
  }

  const textPanel = (
    <div className={`flex min-w-0 flex-1 flex-col ${isCenter ? "items-center justify-center text-center" : "justify-start"}`}>
      <textarea
        aria-label={tt("幻灯片标题")}
        value={slide.title}
        rows={isCenter ? 2 : 1}
        {...deckTextGestureProps(editor, "title")}
        placeholder={tt("输入标题")}
        className={`w-full resize-none overflow-hidden bg-transparent font-bold outline-none placeholder:opacity-30 ${
          isCenter ? "text-center text-[clamp(24px,4vw,54px)]" : "text-[clamp(20px,3vw,38px)]"
        }`}
        style={{
          color: master.textColor || theme.text,
          fontFamily: master.fontFamily || theme.fontFamily,
        }}
      />
      {slide.layout !== "blank" && (
        <textarea
          aria-label={tt("幻灯片正文")}
          value={slide.body}
          rows={isCenter ? 3 : 5}
          {...deckTextGestureProps(editor, "body")}
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
              <span className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: master.accentColor || theme.accent }} />
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
      className="relative flex h-full w-full overflow-hidden rounded-lg p-[clamp(28px,5vw,72px)] shadow-2xl"
      style={{
        background: slide.background || master.background || theme.background,
        color: master.textColor || theme.text,
        fontFamily: master.fontFamily || theme.fontFamily,
      }}
    >
      <div
        className="absolute left-[clamp(28px,5vw,72px)] top-[clamp(20px,3vw,44px)] h-1 w-14 rounded-full"
        style={{ background: master.accentColor || theme.accent }}
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
  zoom = 100,
  onZoomChange,
  activeTool = "select",
  inkStyle = {
    color: "#111827",
    width: 4,
    opacity: 1,
  },
}: {
  editor: DeckEditorState;
  accent?: string;
  zoom?: number;
  onZoomChange?: (value: number) => void;
  activeTool?: string;
  inkStyle?: DeckInkStyle;
}) {
  const tt = useUI();
  const stageRef = useRef<HTMLDivElement>(null);
  const page = deckPageViewport(editor.deck.aspect, zoom);
  const slideTransition = editor.activeSlide.transition;
  const hasContent = editor.deck.slides.some(
    (slide) =>
      Boolean(slide.title.trim() || slide.body.trim() || slide.image?.url) ||
      slide.bullets.some((bullet) => bullet.trim()) ||
      slide.elements.length > 0,
  );
  const viewportRef = useCenteredWheelZoom({
    value: zoom,
    min: 10,
    max: 300,
    contentWidth: page.width,
    contentHeight: page.height,
    onChange: onZoomChange,
  });
  useDeckStageShortcuts(editor, stageRef);

  return (
    <div
      ref={stageRef}
      role="region"
      tabIndex={0}
      aria-label={tt("演示文稿编辑器")}
      aria-busy={editor.loading}
      className="flex h-full min-h-0 flex-col bg-[var(--advanced-stage-bg,#f4f1e8)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--awb-accent)]"
    >
      <style>{`
        @keyframes oleo-deck-slide-fade{from{opacity:0}to{opacity:1}}
        @keyframes oleo-deck-slide-push-left{from{translate:14% 0;opacity:.65}to{translate:0 0;opacity:1}}
        @keyframes oleo-deck-slide-push-right{from{translate:-14% 0;opacity:.65}to{translate:0 0;opacity:1}}
        @keyframes oleo-deck-slide-wipe{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0)}}
        @keyframes oleo-deck-slide-zoom{from{scale:.82;opacity:0}to{scale:1;opacity:1}}
        @keyframes oleo-deck-element-fade{from{opacity:0}to{opacity:1}}
        @keyframes oleo-deck-element-fly-up{from{translate:0 28%;opacity:0}to{translate:0 0;opacity:1}}
        @keyframes oleo-deck-element-wipe{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0)}}
        @keyframes oleo-deck-element-zoom{from{scale:.72;opacity:0}to{scale:1;opacity:1}}
      `}</style>
      <div className="flex min-h-0 flex-1">
        <DeckSlideRail editor={editor} />
        <main
          ref={viewportRef}
          className="relative min-h-0 min-w-0 flex-1 overflow-auto bg-[var(--advanced-stage-bg,#f4f1e8)]"
        >
          <div
            className="flex items-center justify-center p-8 lg:p-12"
            style={{
              minWidth: `max(100%, ${page.width + 96}px)`,
              minHeight: `max(100%, ${page.height + 96}px)`,
            }}
          >
            <div
              data-deck-page-frame
              className="relative shrink-0"
              style={{
                width: `${page.width}px`,
                height: `${page.height}px`,
              }}
            >
              <div
                key={editor.activeSlide.id}
                className="absolute left-0 top-0 origin-top-left"
                style={{
                  width: `${page.logicalWidth}px`,
                  height: `${page.logicalHeight}px`,
                  transform: `scale(${page.scale})`,
                }}
              >
                <div
                  className="h-full w-full"
                  style={{
                    animation: slideTransition
                      ? `oleo-deck-slide-${slideTransition.type} ${slideTransition.durationMs}ms ease-out both`
                      : undefined,
                  }}
                >
                  <SlideCanvas
                    editor={editor}
                    activeTool={activeTool}
                    inkStyle={inkStyle}
                  />
                </div>
              </div>
            </div>
          </div>
          {editor.loading && (
            <div
              role="status"
              aria-live="polite"
              className="absolute inset-0 grid place-items-center bg-[var(--card,#fff)]/85 text-[12px] text-[var(--muted,#78716c)]"
            >
              {tt("正在载入演示文稿…")}
            </div>
          )}
          {!editor.loading && editor.error && (
            <div
              role="alert"
              className="absolute left-1/2 top-4 z-40 w-fit max-w-[calc(100%_-_2rem)] -translate-x-1/2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 shadow-sm"
            >
              {tt(editor.error)}
            </div>
          )}
          {!editor.loading && !editor.error && !hasContent && (
            <p
              role="status"
              className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-lg bg-[var(--card,#fff)]/90 px-3 py-2 text-[11px] text-[var(--muted,#78716c)] shadow-sm"
            >
              {tt("空白演示文稿，双击页面文字开始编辑")}
            </p>
          )}
        </main>
      </div>

    </div>
  );
}
