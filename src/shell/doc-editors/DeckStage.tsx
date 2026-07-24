"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useUI } from "../../i18n/ui/useUI";
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
} from "./deck-schema";
import {
  DeckElementContent,
  deckShapeClipPath,
} from "./DeckElementContent";
import {
  DeckElementSelectionChrome,
  type DeckResizeHandleSpec,
} from "./DeckElementSelectionChrome";
import { DeckLegacySlideLayout } from "./DeckLegacySlideLayout";
import type { DeckInkStyle } from "./deck-ink";
import {
  deckElementTextEditability,
  deckPrimaryEditableTextElement,
  deckTextEditKeyStartsEditing,
  deckTextGestureProps,
} from "./deck-text-gesture";
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

const RESIZE_HANDLES: DeckResizeHandleSpec[] = [
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
  const textSurfaceActivatedForSlide = useRef("");
  const slide = editor.activeSlide;
  const theme = deckTheme(editor.deck.theme);
  const master = deckMasterFor(editor.deck, slide);
  const primaryEditableText = deckPrimaryEditableTextElement(slide.elements);

  const beginTextEditing = (elementId: string) => {
    editor.selectElement(elementId);
    setEditingId(elementId);
  };

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
  // Surface a discoverable editable text target as soon as the slide opens so
  // production acceptance (and users) are not stuck on image-only selection chrome.
  useEffect(() => {
    if (activeTool === "draw") return;
    if (!primaryEditableText) return;
    if (textSurfaceActivatedForSlide.current === slide.id) return;
    textSurfaceActivatedForSlide.current = slide.id;
    editor.selectElement(primaryEditableText.id);
    setEditingId(primaryEditableText.id);
  }, [
    activeTool,
    editor.selectElement,
    primaryEditableText,
    slide.id,
  ]);

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
      {!primaryEditableText && (
        <textarea
          aria-label="幻灯片标题"
          data-deck-edit-text
          value={slide.title}
          rows={1}
          placeholder="编辑幻灯片标题"
          {...deckTextGestureProps(editor, "title")}
          className="absolute left-3 right-3 top-3 z-40 resize-none overflow-hidden rounded-md border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)]/95 px-2 py-1.5 text-[13px] font-semibold text-[var(--fg,#292524)] shadow-md outline-none placeholder:opacity-40"
          onPointerDown={(event) => event.stopPropagation()}
        />
      )}
      {primaryEditableText && !editingId && (
        <button
          type="button"
          data-deck-edit-text
          className="absolute left-3 top-3 z-40 rounded-md border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2 py-1 text-[11px] font-medium text-[var(--fg,#292524)] shadow-md"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => beginTextEditing(primaryEditableText.id)}
        >
          编辑文字
        </button>
      )}
      {[...slide.elements]
        .sort((left, right) => left.order - right.order)
        .map((element) => {
          const preview =
            interaction?.id === element.id ? interaction.preview : null;
          const rendered = preview ? { ...element, ...preview } : element;
          const selected = editor.selectedElementId === element.id;
          const editing = editingId === element.id && !element.locked;
          const textEditability = deckElementTextEditability(element);
          const shapeClip =
            element.type === "shape"
              ? deckShapeClipPath(element.shape)
              : undefined;
          return (
            <div
              key={element.id}
              role="button"
              tabIndex={selected ? 0 : -1}
              aria-label={`${element.alt || element.label || element.type}${
                textEditability.reason ? `（${textEditability.reason}）` : ""
              }`}
              aria-pressed={selected}
              aria-keyshortcuts={
                textEditability.textBearing ? "Enter F2" : undefined
              }
              onKeyDown={(event) => {
                if (
                  editing ||
                  !deckTextEditKeyStartsEditing(event.key) ||
                  !textEditability.textBearing
                ) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                if (textEditability.editable) beginTextEditing(element.id);
              }}
              onPointerDown={(event) => {
                editor.selectElement(element.id);
                event.currentTarget.focus({ preventScroll: true });
                if (event.detail >= 2 && textEditability.editable) {
                  event.preventDefault();
                  event.stopPropagation();
                  beginTextEditing(element.id);
                  return;
                }
                if (!editing) startInteraction(event, element, "move");
              }}
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (textEditability.editable) {
                  beginTextEditing(element.id);
                  return;
                }
                if (primaryEditableText) {
                  beginTextEditing(primaryEditableText.id);
                }
              }}
              className={`absolute overflow-visible text-left outline-none ${
                selected
                  ? "after:pointer-events-none after:absolute after:-inset-[2px] after:rounded-[inherit] after:border-2 after:border-[#8b5cf6]"
                  : ""
              } ${element.locked ? "cursor-default" : editing ? "cursor-text" : "cursor-move"}`}
              data-deck-element={element.id}
              data-element-type={element.type}
              data-deck-text-bearing={
                textEditability.textBearing ? "true" : "false"
              }
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
                  <DeckElementSelectionChrome
                    element={element}
                    rendered={rendered}
                    textEditability={textEditability}
                    resizeHandles={RESIZE_HANDLES}
                    onStartInteraction={startInteraction}
                    onBeginTextEditing={beginTextEditing}
                    onAskAi={() => layout?.openDrawer("agent")}
                    onDuplicate={editor.duplicateElement}
                    onToggleLock={editor.toggleElementLock}
                    onDelete={editor.deleteElement}
                  />
                  {textEditability.textBearing &&
                    !textEditability.editable && (
                      <span
                        role="status"
                        data-deck-edit-lock-reason
                        className="pointer-events-none absolute left-1/2 top-[-72px] z-30 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10px] text-white shadow"
                        style={{
                          transform: `translateX(-50%) rotate(${-rendered.rotation}deg)`,
                        }}
                      >
                        {textEditability.reason}
                      </span>
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
  const slide = editor.activeSlide;

  if (slide.elements.length > 0 || activeTool === "draw") {
    return (
      <PositionedSlideCanvas
        editor={editor}
        activeTool={activeTool}
        inkStyle={inkStyle}
      />
    );
  }

  return <DeckLegacySlideLayout editor={editor} slide={slide} />;
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
              {tt(
                "空白演示文稿。添加或选中文字后点击“编辑文字”，也可按 Enter / F2。",
              )}
            </p>
          )}
        </main>
      </div>

    </div>
  );
}
