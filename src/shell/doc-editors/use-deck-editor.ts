"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { fetchMediaBlob } from "../../lib/media-proxy";
import type { LibraryItem } from "../library-data";
import type { WorkbenchMaterialPlacement } from "../workbench-material-provider";
import { officeExtensionForItem } from "../workbench-routes";
import {
  centeredDeckPlacement,
  clientPointToDeckPercent,
} from "./deck-geometry";
import {
  cloneDeckDocument,
  deckId,
  deckTheme,
  emptyDeckSlide,
  normalizeDeckDocument,
  type DeckAspect,
  type DeckDocument,
  type DeckElement,
  type DeckLayout,
  type DeckSlide,
  type DeckThemeId,
} from "./deck-schema";
import {
  blobToDataUrl,
  downloadBlob,
  downloadText,
  saveFileToLibrary,
  urlExtension,
} from "./doc-io";
import {
  buildDeckInkAsset,
  type DeckInkStroke,
  type DeckInkStyle,
} from "./deck-ink";
import { importPptxDeck } from "./pptx-deck-import";

interface Snapshot {
  deck: DeckDocument;
  activeId: string;
  selectedElementId: string;
}

export interface DeckEditorState {
  deck: DeckDocument;
  activeSlide: DeckSlide;
  activeIndex: number;
  selectedElement: DeckElement | null;
  selectedElementId: string;
  loading: boolean;
  saving: boolean;
  exporting: boolean;
  dirty: boolean;
  error: string;
  notice: string;
  savedUrl: string;
  canUndo: boolean;
  canRedo: boolean;
  selectSlide: (id: string) => void;
  setTitle: (title: string) => void;
  setAspect: (aspect: DeckAspect) => void;
  setTheme: (theme: DeckThemeId) => void;
  patchSlide: (patch: Partial<DeckSlide>) => void;
  applySlideLayout: (layout: DeckLayout) => void;
  selectElement: (id: string) => void;
  patchElement: (id: string, patch: Partial<DeckElement>) => void;
  addTextElement: (
    preset?: Partial<DeckElement>,
    placement?: WorkbenchMaterialPlacement,
  ) => void;
  addShapeElement: (
    shape?: string,
    placement?: WorkbenchMaterialPlacement,
    preset?: Partial<DeckElement>,
  ) => void;
  addTableElement: (rows?: number, columns?: number) => void;
  addInkElement: (
    strokes: DeckInkStroke[],
    style: DeckInkStyle,
    placement?: "canvas" | "signature",
  ) => void;
  insertImageElement: (
    src: string,
    alt?: string,
    replace?: boolean,
    placement?: WorkbenchMaterialPlacement,
  ) => void;
  duplicateElement: () => void;
  deleteElement: () => void;
  moveElementLayer: (direction: -1 | 1) => void;
  toggleElementLock: () => void;
  setCanvasElement: (element: HTMLElement | null) => void;
  addSlide: () => void;
  duplicateSlide: () => void;
  deleteSlide: () => void;
  moveSlide: (direction: -1 | 1) => void;
  undo: () => void;
  redo: () => void;
  downloadJson: () => void;
  exportPptx: () => Promise<void>;
  save: () => Promise<string | null>;
}

const HISTORY_LIMIT = 60;

function initialSource(
  item: LibraryItem,
  previewContent?: unknown,
): unknown {
  const meta = item.meta || {};
  const usablePreview =
    typeof previewContent === "string" ||
    Array.isArray(previewContent) ||
    (Boolean(previewContent) &&
      typeof previewContent === "object" &&
      !("$$typeof" in (previewContent as Record<string, unknown>)));
  return (
    (usablePreview ? previewContent : null) ||
    meta.deck ||
    meta.presentation ||
    meta.slides ||
    meta.content_json ||
    meta.content ||
    meta
  );
}

async function loadDeck(
  item: LibraryItem,
  previewContent?: unknown,
  signal?: AbortSignal,
): Promise<DeckDocument> {
  const fallback = normalizeDeckDocument(
    initialSource(item, previewContent),
    item.title || "演示文稿",
  );
  if (!item.url) return fallback;
  const extension = (
    officeExtensionForItem(item) ||
    urlExtension(item.url) ||
    String(item.meta.format || "")
  ).toLowerCase();
  try {
    const blob = await fetchMediaBlob(item.url, {
      maxBytes: 64 * 1024 * 1024,
      signal,
    });
    if (["pptx", "pptm", "potx", "potm"].includes(extension)) {
      const bytes = await blob.arrayBuffer();
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return await importPptxDeck(
        bytes,
        item.title || "演示文稿",
        extension,
      );
    }
    const text = await blob.text();
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return normalizeDeckDocument(JSON.parse(text), item.title || "演示文稿");
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (["pptx", "pptm", "potx", "potm"].includes(extension)) {
      throw new Error(
        error instanceof Error
          ? `PPTX 导入失败：${error.message}`
          : "PPTX 导入失败",
      );
    }
    return fallback;
  }
}

function cleanHex(color: string, fallback: string): string {
  return (color || fallback).replace("#", "").slice(0, 6);
}

export async function buildDeckPptxBlob(deck: DeckDocument): Promise<Blob> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = deck.aspect === "4:3" ? "LAYOUT_4X3" : "LAYOUT_WIDE";
  pptx.author = "OceanLeo";
  pptx.subject = deck.title;
  pptx.title = deck.title;
  pptx.company = "OceanLeo";
  const theme = deckTheme(deck.theme);
  const width = deck.aspect === "4:3" ? 10 : 13.333;
  const height = 7.5;

  for (const source of deck.slides) {
    const slide = pptx.addSlide();
    const background = cleanHex(source.background, theme.background);
    slide.background = { color: background };
    if (source.elements.length > 0) {
      const x = (value: number) => (value / 100) * width;
      const y = (value: number) => (value / 100) * height;
      for (const element of [...source.elements].sort(
        (left, right) => left.order - right.order,
      )) {
        const box = {
          x: x(element.x),
          y: y(element.y),
          w: x(element.width),
          h: y(element.height),
        };
        if (element.type === "text") {
          slide.addText(element.text || "", {
            ...box,
            rotate: element.rotation,
            fontFace: element.fontFamily || theme.fontFamily.split(",")[0],
            fontSize: element.fontSize || 18,
            color: cleanHex(element.color || theme.text, theme.text),
            bold: element.bold,
            italic: element.italic,
            align: element.align || "left",
            valign: "middle",
            margin: 0,
            fill: element.fill
              ? { color: cleanHex(element.fill, "FFFFFF") }
              : { color: "FFFFFF", transparency: 100 },
            line: element.borderWidth
              ? {
                  color: cleanHex(element.borderColor || "#000000", "000000"),
                  width: element.borderWidth,
                }
              : { color: "FFFFFF", transparency: 100 },
          });
          continue;
        }
        if (element.type === "image" && element.src) {
          try {
            const data = element.src.startsWith("data:")
              ? element.src
              : await blobToDataUrl(
                  await fetchMediaBlob(element.src, {
                    maxBytes: 24 * 1024 * 1024,
                  }),
                );
            slide.addImage({
              data,
              ...box,
              rotate: element.rotation,
              sizing: { type: "contain", ...box },
            });
          } catch {
            slide.addText(element.alt || "图片无法导出", {
              ...box,
              align: "center",
              valign: "middle",
              color: cleanHex(theme.muted, "64748B"),
              fontSize: 10,
            });
          }
          continue;
        }
        if (element.type === "shape") {
          const shapeName = (element.shape || "").toLowerCase();
          const shapeType =
            shapeName.includes("ellipse") || shapeName.includes("oval")
              ? pptx.ShapeType.ellipse
              : shapeName.includes("round")
                ? pptx.ShapeType.roundRect
                : shapeName.includes("triangle")
                  ? pptx.ShapeType.triangle
                  : shapeName.includes("diamond")
                    ? pptx.ShapeType.diamond
                    : shapeName.includes("star")
                      ? pptx.ShapeType.star5
                      : shapeName.includes("arrow")
                        ? pptx.ShapeType.rightArrow
                        : shapeName.includes("hexagon")
                          ? pptx.ShapeType.hexagon
                : shapeName.includes("line")
                  ? pptx.ShapeType.line
                  : pptx.ShapeType.rect;
          const marker = (value: DeckElement["lineStart"]) =>
            value === "circle" ? "oval" : value || "none";
          slide.addShape(shapeType, {
            ...box,
            rotate: element.rotation,
            fill: element.fill
              ? { color: cleanHex(element.fill, "FFFFFF") }
              : { color: "FFFFFF", transparency: 100 },
            line: {
              color: cleanHex(element.borderColor || "#000000", "000000"),
              width:
                shapeName.includes("line")
                  ? element.borderWidth || 2
                  : element.borderWidth || 0,
              transparency:
                shapeName.includes("line") || element.borderWidth ? 0 : 100,
              dashType:
                element.lineDash === "dot"
                  ? "sysDot"
                  : element.lineDash === "dash"
                    ? "dash"
                    : "solid",
              beginArrowType: marker(element.lineStart),
              endArrowType: marker(element.lineEnd),
            },
          });
          if (element.text) {
            slide.addText(element.text, {
              ...box,
              rotate: element.rotation,
              fontFace: element.fontFamily || theme.fontFamily.split(",")[0],
              fontSize: element.fontSize || 16,
              color: cleanHex(element.color || theme.text, theme.text),
              bold: element.bold,
              italic: element.italic,
              align: element.align || "center",
              valign: "middle",
              margin: 0.05,
              fill: { color: "FFFFFF", transparency: 100 },
              line: { color: "FFFFFF", transparency: 100 },
            });
          }
          continue;
        }
        if (element.type === "table" && element.rows?.length) {
          slide.addTable(
            element.rows.map((row) =>
              row.map((text) => ({ text })),
            ),
            {
            ...box,
            border: { type: "solid", color: "D1D5DB", pt: 1 },
            color: cleanHex(theme.text, "111827"),
            fill: {
              color: cleanHex(element.fill || theme.surface, "FFFFFF"),
            },
            fontFace: theme.fontFamily.split(",")[0],
            fontSize: Math.max(8, element.fontSize || 12),
            margin: 0.05,
            },
          );
          continue;
        }
        slide.addText(element.label || "此元素保留在原始 PPTX 中", {
          ...box,
          align: "center",
          valign: "middle",
          color: cleanHex(theme.muted, "64748B"),
          fill: { color: "F8FAFC" },
          line: { color: "CBD5E1", dashType: "dash" },
          fontSize: 9,
          margin: 0.04,
        });
      }
      if (source.notes) slide.addNotes(source.notes);
      continue;
    }
    const hasImage =
      (source.layout === "image-left" || source.layout === "image-right") &&
      source.image?.url;
    const textX = source.layout === "image-left" ? width * 0.48 : 0.75;
    const textW = hasImage ? width * 0.46 : width - 1.5;
    const titleY = source.layout === "title" || source.layout === "section" ? 2.25 : 0.65;
    slide.addText(source.title || "", {
      x: textX,
      y: titleY,
      w: textW,
      h: source.layout === "title" || source.layout === "section" ? 1.25 : 0.7,
      fontFace: theme.fontFamily.split(",")[0],
      fontSize: source.layout === "title" || source.layout === "section" ? 34 : 26,
      color: cleanHex(theme.text, "#111827"),
      bold: true,
      margin: 0,
      breakLine: false,
      valign: "middle",
    });
    if (source.body && source.layout !== "blank") {
      slide.addText(source.body, {
        x: textX,
        y: titleY + 1,
        w: textW,
        h: 2.2,
        fontFace: theme.fontFamily.split(",")[0],
        fontSize: 16,
        color: cleanHex(theme.muted, "#64748b"),
        margin: 0,
        breakLine: false,
        valign: "top",
      });
    }
    if (source.bullets.length && source.layout !== "blank") {
      slide.addText(
        source.bullets.map((text) => ({
          text,
          options: { bullet: { indent: 16 }, breakLine: true },
        })),
        {
          x: textX,
          y: source.body ? 4.15 : titleY + 1,
          w: textW,
          h: source.body ? 2.25 : 4.5,
          fontFace: theme.fontFamily.split(",")[0],
          fontSize: 17,
          color: cleanHex(theme.text, "#111827"),
          margin: 0,
          breakLine: false,
          valign: "top",
        },
      );
    }
    if (hasImage && source.image) {
      try {
        const imageBlob = await fetchMediaBlob(source.image.url, {
          maxBytes: 24 * 1024 * 1024,
        });
        const data = await blobToDataUrl(imageBlob);
        slide.addImage({
          data,
          x: source.layout === "image-left" ? 0.55 : width * 0.53,
          y: 0.7,
          w: width * 0.42,
          h: height - 1.4,
          sizing: {
            type: "contain",
            x: source.layout === "image-left" ? 0.55 : width * 0.53,
            y: 0.7,
            w: width * 0.42,
            h: height - 1.4,
          },
        });
      } catch {
        slide.addText("图片暂时无法嵌入", {
          x: source.layout === "image-left" ? 0.55 : width * 0.53,
          y: 3.2,
          w: width * 0.42,
          h: 0.5,
          color: cleanHex(theme.muted, "#64748b"),
          align: "center",
          fontSize: 12,
        });
      }
    }
    if (source.notes) slide.addNotes(source.notes);
  }
  return (await pptx.write({ outputType: "blob" })) as Blob;
}

export function useDeckEditor(
  item: LibraryItem,
  siteId = "",
  previewContent?: unknown,
): DeckEditorState {
  const tt = useUI();
  const initial = useMemo(
    () => normalizeDeckDocument(initialSource(item, previewContent), item.title),
    [item, previewContent],
  );
  const [deck, setDeckState] = useState(initial);
  const [activeId, setActiveId] = useState(initial.slides[0].id);
  const [selectedElementId, setSelectedElementId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [dirty, setDirty] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const deckRef = useRef(deck);
  const activeRef = useRef(activeId);
  const selectedElementRef = useRef(selectedElementId);
  const undoRef = useRef<Snapshot[]>([]);
  const redoRef = useRef<Snapshot[]>([]);
  const mountedRef = useRef(true);
  const revisionRef = useRef(0);
  const savingRef = useRef(false);
  const canvasElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    const abort = new AbortController();
    setLoading(true);
    setDirty(false);
    setSavedUrl("");
    setError("");
    setNotice("");
    revisionRef.current = 0;
    void loadDeck(item, previewContent, abort.signal)
      .then((next) => {
        if (abort.signal.aborted) return;
        deckRef.current = next;
        activeRef.current = next.slides[0].id;
        selectedElementRef.current = "";
        setDeckState(next);
        setActiveId(next.slides[0].id);
        setSelectedElementId("");
        undoRef.current = [];
        redoRef.current = [];
        if (next.importWarnings?.length) {
          setNotice(next.importWarnings.join("；"));
        }
        setHistoryRevision((value) => value + 1);
      })
      .catch((caught) => {
        if (!abort.signal.aborted) {
          setError(caught instanceof Error ? caught.message : tt("演示文稿读取失败"));
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => {
      mountedRef.current = false;
      abort.abort();
    };
  }, [item, previewContent, tt]);

  const snapshot = useCallback(
    (): Snapshot => ({
      deck: cloneDeckDocument(deckRef.current),
      activeId: activeRef.current,
      selectedElementId: selectedElementRef.current,
    }),
    [],
  );

  const applySnapshot = useCallback((value: Snapshot) => {
    const next = cloneDeckDocument(value.deck);
    deckRef.current = next;
    activeRef.current = value.activeId;
    selectedElementRef.current = value.selectedElementId;
    setDeckState(next);
    setActiveId(value.activeId);
    setSelectedElementId(value.selectedElementId);
    setHistoryRevision((revision) => revision + 1);
  }, []);

  const commit = useCallback(
    (update: (current: DeckDocument) => DeckDocument, nextActive?: string) => {
      undoRef.current.push(snapshot());
      if (undoRef.current.length > HISTORY_LIMIT) undoRef.current.shift();
      redoRef.current = [];
      const next = update(cloneDeckDocument(deckRef.current));
      const resolvedActive = nextActive || activeRef.current || next.slides[0].id;
      deckRef.current = next;
      activeRef.current = resolvedActive;
      setDeckState(next);
      setActiveId(resolvedActive);
      setSavedUrl("");
      setNotice("");
      revisionRef.current += 1;
      setDirty(true);
      setHistoryRevision((value) => value + 1);
    },
    [snapshot],
  );

  const activeIndex = Math.max(
    0,
    deck.slides.findIndex((slide) => slide.id === activeId),
  );
  const activeSlide = deck.slides[activeIndex] || deck.slides[0];
  const selectedElement =
    activeSlide.elements.find(
      (element) => element.id === selectedElementId,
    ) || null;
  const insertionPlacement = useCallback(
    (
      width: number,
      height: number,
      placement?: WorkbenchMaterialPlacement,
    ) => {
      const rect = canvasElementRef.current?.getBoundingClientRect();
      const point =
        placement?.source === "drop" &&
        Number.isFinite(placement.clientX) &&
        Number.isFinite(placement.clientY) &&
        rect?.width &&
        rect.height
          ? clientPointToDeckPercent(
              {
                x: placement.clientX as number,
                y: placement.clientY as number,
              },
              rect,
            )
          : undefined;
      return centeredDeckPlacement(width, height, point);
    },
    [],
  );
  const setCanvasElement = useCallback((element: HTMLElement | null) => {
    canvasElementRef.current = element;
  }, []);

  const patchSlide = useCallback(
    (patch: Partial<DeckSlide>) =>
      commit((current) => ({
        ...current,
        slides: current.slides.map((slide) =>
          slide.id === activeRef.current ? { ...slide, ...patch } : slide,
        ),
      })),
    [commit],
  );
  const applySlideLayout = useCallback(
    (layout: DeckLayout) => {
      commit((current) => ({
        ...current,
        slides: current.slides.map((slide) => {
          if (slide.id !== activeRef.current) return slide;
          if (layout === "blank") return { ...slide, layout };
          const orderedText = slide.elements
            .filter((element) => element.type === "text")
            .sort((left, right) => left.order - right.order);
          const titleId = orderedText[0]?.id;
          const contentIds = new Set(orderedText.slice(1).map((element) => element.id));
          const centered = layout === "title" || layout === "section";
          const imageSide =
            layout === "image-left"
              ? "left"
              : layout === "image-right"
                ? "right"
                : "";
          return {
            ...slide,
            layout,
            elements: slide.elements.map((element) => {
              if (element.type === "image" && imageSide) {
                return {
                  ...element,
                  x: imageSide === "left" ? 7 : 52,
                  y: 14,
                  width: 41,
                  height: 72,
                };
              }
              if (element.id === titleId) {
                return {
                  ...element,
                  x: imageSide ? (imageSide === "left" ? 52 : 7) : centered ? 10 : 8,
                  y: centered ? 28 : 13,
                  width: imageSide ? 41 : centered ? 80 : 84,
                  height: centered ? 20 : 14,
                  align: centered ? ("center" as const) : ("left" as const),
                };
              }
              if (contentIds.has(element.id)) {
                return {
                  ...element,
                  x: imageSide ? (imageSide === "left" ? 52 : 7) : centered ? 15 : 8,
                  y: centered ? 53 : 33,
                  width: imageSide ? 41 : centered ? 70 : 84,
                  height: centered ? 22 : 50,
                  align: centered ? ("center" as const) : ("left" as const),
                };
              }
              return element;
            }),
          };
        }),
      }));
    },
    [commit],
  );

  const selectElement = useCallback((id: string) => {
    selectedElementRef.current = id;
    setSelectedElementId(id);
  }, []);

  const patchElement = useCallback(
    (id: string, patch: Partial<DeckElement>) => {
      commit((current) => ({
        ...current,
        slides: current.slides.map((slide) =>
          slide.id === activeRef.current
            ? {
                ...slide,
                elements: slide.elements.map((element) =>
                  element.id === id ? { ...element, ...patch, id } : element,
                ),
              }
            : slide,
        ),
      }));
    },
    [commit],
  );

  const addElement = useCallback(
    (element: DeckElement) => {
      commit((current) => ({
        ...current,
        slides: current.slides.map((slide) =>
          slide.id === activeRef.current
            ? { ...slide, elements: [...slide.elements, element] }
            : slide,
        ),
      }));
      selectedElementRef.current = element.id;
      setSelectedElementId(element.id);
    },
    [commit],
  );

  const addTextElement = useCallback(
    (
      preset: Partial<DeckElement> = {},
      placement?: WorkbenchMaterialPlacement,
    ) => {
      const current = deckRef.current.slides.find(
        (slide) => slide.id === activeRef.current,
      );
      const box = insertionPlacement(
        preset.width || 54,
        preset.height || 14,
        placement,
      );
      addElement({
        ...box,
        rotation: 0,
        order:
          Math.max(
            0,
            ...(current?.elements.map((element) => element.order) || []),
          ) + 1,
        text: tt("输入文字"),
        fontSize: 32,
        fontFamily: deckTheme(deckRef.current.theme).fontFamily.split(",")[0],
        color: deckTheme(deckRef.current.theme).text,
        align: "left",
        lineHeight: 1.15,
        letterSpacing: 0,
        opacity: 1,
        ...preset,
        id: deckId("element"),
        type: "text",
      });
    },
    [addElement, insertionPlacement, tt],
  );

  const addShapeElement = useCallback(
    (
      shape = "rectangle",
      placement?: WorkbenchMaterialPlacement,
      preset: Partial<DeckElement> = {},
    ) => {
      const current = deckRef.current.slides.find(
        (slide) => slide.id === activeRef.current,
      );
      const size =
        shape === "line"
          ? { width: 36, height: 3 }
          : shape === "circle"
            ? { width: 24, height: 24 }
            : { width: 30, height: 22 };
      addElement({
        ...insertionPlacement(size.width, size.height, placement),
        rotation: 0,
        order:
          Math.max(
            0,
            ...(current?.elements.map((element) => element.order) || []),
          ) + 1,
        fill: deckTheme(deckRef.current.theme).accent,
        borderColor: "transparent",
        borderWidth: 0,
        borderRadius:
          shape === "circle" ? 999 : shape === "rounded" ? 18 : 0,
        opacity: 1,
        ...preset,
        shape,
        id: deckId("element"),
        type: "shape",
      });
    },
    [addElement, insertionPlacement],
  );

  const addInkElement = useCallback(
    (
      strokes: DeckInkStroke[],
      style: DeckInkStyle,
      placement: "canvas" | "signature" = "canvas",
    ) => {
      const asset = buildDeckInkAsset(strokes, style, placement);
      if (!asset) return;
      const current = deckRef.current.slides.find(
        (slide) => slide.id === activeRef.current,
      );
      addElement({
        id: deckId("element"),
        type: "image",
        x: asset.x,
        y: asset.y,
        width: asset.width,
        height: asset.height,
        rotation: 0,
        order:
          Math.max(
            0,
            ...(current?.elements.map((element) => element.order) || []),
          ) + 1,
        src: asset.src,
        alt: placement === "signature" ? tt("签名") : tt("画笔"),
        imageFit: "fill",
        opacity: 1,
      });
    },
    [addElement, tt],
  );

  const addTableElement = useCallback(
    (rowCount = 3, columnCount = 3) => {
      const rows = Array.from({ length: Math.max(1, rowCount) }, () =>
        Array.from({ length: Math.max(1, columnCount) }, () => ""),
      );
      const current = deckRef.current.slides.find(
        (slide) => slide.id === activeRef.current,
      );
      addElement({
        id: deckId("element"),
        type: "table",
        ...centeredDeckPlacement(58, 32),
        rotation: 0,
        order:
          Math.max(
            0,
            ...(current?.elements.map((element) => element.order) || []),
          ) + 1,
        rows,
        fill: "#ffffff",
        borderColor: "#d6d3d1",
        borderWidth: 1,
        color: "#292524",
        fontSize: 16,
        opacity: 1,
      });
    },
    [addElement],
  );

  const insertImageElement = useCallback(
    (
      src: string,
      alt = "",
      replace = false,
      placement?: WorkbenchMaterialPlacement,
    ) => {
      const selected = deckRef.current.slides
        .find((slide) => slide.id === activeRef.current)
        ?.elements.find(
          (element) => element.id === selectedElementRef.current,
        );
      if (replace && selected?.type === "image") {
        patchElement(selected.id, { src, alt });
        return;
      }
      const current = deckRef.current.slides.find(
        (slide) => slide.id === activeRef.current,
      );
      addElement({
        id: deckId("element"),
        type: "image",
        ...insertionPlacement(42, 42, placement),
        rotation: 0,
        order:
          Math.max(0, ...(current?.elements.map((element) => element.order) || [])) +
          1,
        src,
        alt,
        imageFit: "contain",
        opacity: 1,
        brightness: 1,
        contrast: 1,
        saturation: 1,
        blur: 0,
      });
    },
    [addElement, insertionPlacement, patchElement],
  );

  const deleteElement = useCallback(() => {
    const id = selectedElementRef.current;
    if (!id) return;
    commit((current) => ({
      ...current,
      slides: current.slides.map((slide) =>
        slide.id === activeRef.current
          ? {
              ...slide,
              elements: slide.elements.filter((element) => element.id !== id),
            }
          : slide,
      ),
    }));
    selectedElementRef.current = "";
    setSelectedElementId("");
  }, [commit]);

  const duplicateElement = useCallback(() => {
    const current = deckRef.current.slides.find(
      (slide) => slide.id === activeRef.current,
    );
    const selected = current?.elements.find(
      (element) => element.id === selectedElementRef.current,
    );
    if (!selected) return;
    addElement({
      ...selected,
      id: deckId("element"),
      x: Math.min(95, selected.x + 2),
      y: Math.min(95, selected.y + 2),
      order:
        Math.max(0, ...(current?.elements.map((element) => element.order) || [])) +
        1,
      rows: selected.rows?.map((row) => [...row]),
    });
  }, [addElement]);

  const moveElementLayer = useCallback(
    (direction: -1 | 1) => {
      const id = selectedElementRef.current;
      if (!id) return;
      const current = deckRef.current.slides.find(
        (slide) => slide.id === activeRef.current,
      );
      const selected = current?.elements.find((element) => element.id === id);
      if (!selected || !current) return;
      const orders = current.elements.map((element) => element.order);
      patchElement(id, {
        order:
          direction > 0
            ? Math.max(...orders, selected.order) + 1
            : Math.min(...orders, selected.order) - 1,
      });
    },
    [patchElement],
  );

  const toggleElementLock = useCallback(() => {
    const current = deckRef.current.slides
      .find((slide) => slide.id === activeRef.current)
      ?.elements.find(
        (element) => element.id === selectedElementRef.current,
      );
    if (!current) return;
    patchElement(current.id, { locked: !current.locked });
  }, [patchElement]);

  const undo = useCallback(() => {
    const previous = undoRef.current.pop();
    if (!previous) return;
    redoRef.current.push(snapshot());
    applySnapshot(previous);
    revisionRef.current += 1;
    setDirty(true);
    setSavedUrl("");
  }, [applySnapshot, snapshot]);

  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(snapshot());
    applySnapshot(next);
    revisionRef.current += 1;
    setDirty(true);
    setSavedUrl("");
  }, [applySnapshot, snapshot]);

  const exportPptx = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    setError("");
    try {
      const blob = await buildDeckPptxBlob(deckRef.current);
      downloadBlob(`${deckRef.current.title || "演示文稿"}.pptx`, blob);
      setNotice(tt("PPTX 已导出，可在 PowerPoint 或兼容软件中继续使用"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tt("PPTX 导出失败"));
    } finally {
      if (mountedRef.current) setExporting(false);
    }
  }, [exporting, tt]);

  const save = useCallback(async (): Promise<string | null> => {
    if (savingRef.current) return null;
    const savingRevision = revisionRef.current;
    const snapshot = cloneDeckDocument(deckRef.current);
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const title = `${snapshot.title || item.title || tt("演示文稿")}-${tt("编辑版")}`;
      const blob = await buildDeckPptxBlob(snapshot);
      const file = new File([blob], `${title}.pptx`, {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      });
      const result = await saveFileToLibrary({
        item,
        siteId,
        fallbackSite: "ppt",
        file,
        title,
        mediaType: "ppt",
        kind: "deck",
        meta: {
          editor: "deck",
          schema: "oceanleo.deck.v2",
          slides: snapshot.slides.length,
          aspect: snapshot.aspect,
          theme: snapshot.theme,
        },
      });
      if (!result.ok) throw new Error(result.error || tt("保存到我的库失败"));
      if (mountedRef.current) {
        setSavedUrl(result.url);
        if (revisionRef.current === savingRevision) {
          setDirty(false);
          setNotice(tt("PPTX 新版本已保存到我的库"));
        } else {
          setNotice(tt("已保存一个 PPTX 版本；之后的修改仍未保存"));
        }
      }
      return mountedRef.current ? result.url : null;
    } catch (caught) {
      if (mountedRef.current) {
        setError(caught instanceof Error ? caught.message : tt("保存失败"));
      }
      return null;
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }, [item, siteId, tt]);

  return {
    deck,
    activeSlide,
    activeIndex,
    selectedElement,
    selectedElementId,
    loading,
    saving,
    exporting,
    dirty,
    error,
    notice,
    savedUrl,
    canUndo: undoRef.current.length > 0 || historyRevision < 0,
    canRedo: redoRef.current.length > 0,
    selectSlide: (id) => {
      activeRef.current = id;
      setActiveId(id);
      selectedElementRef.current = "";
      setSelectedElementId("");
    },
    setTitle: (title) => commit((current) => ({ ...current, title })),
    setAspect: (aspect) => commit((current) => ({ ...current, aspect })),
    setTheme: (theme) => commit((current) => ({ ...current, theme })),
    patchSlide,
    applySlideLayout,
    selectElement,
    patchElement,
    addTextElement,
    addShapeElement,
    addTableElement,
    addInkElement,
    insertImageElement,
    duplicateElement,
    deleteElement,
    moveElementLayer,
    toggleElementLock,
    setCanvasElement,
    addSlide: () => {
      const slide = emptyDeckSlide();
      commit((current) => {
        const slides = [...current.slides];
        slides.splice(activeIndex + 1, 0, slide);
        return { ...current, slides };
      }, slide.id);
      selectedElementRef.current = "";
      setSelectedElementId("");
    },
    duplicateSlide: () => {
      const copy: DeckSlide = {
        ...activeSlide,
        id: deckId(),
        title: `${activeSlide.title} ${tt("副本")}`,
        bullets: [...activeSlide.bullets],
        image: activeSlide.image ? { ...activeSlide.image } : undefined,
        elements: activeSlide.elements.map((element) => ({
          ...element,
          id: deckId("element"),
          rows: element.rows?.map((row) => [...row]),
        })),
      };
      commit((current) => {
        const slides = [...current.slides];
        slides.splice(activeIndex + 1, 0, copy);
        return { ...current, slides };
      }, copy.id);
      selectedElementRef.current = "";
      setSelectedElementId("");
    },
    deleteSlide: () => {
      if (deckRef.current.slides.length <= 1) return;
      const nextId =
        deckRef.current.slides[activeIndex - 1]?.id ||
        deckRef.current.slides[activeIndex + 1]?.id;
      commit(
        (current) => ({
          ...current,
          slides: current.slides.filter((slide) => slide.id !== activeRef.current),
        }),
        nextId,
      );
      selectedElementRef.current = "";
      setSelectedElementId("");
    },
    moveSlide: (direction) => {
      const target = activeIndex + direction;
      if (target < 0 || target >= deckRef.current.slides.length) return;
      commit((current) => {
        const slides = [...current.slides];
        const [slide] = slides.splice(activeIndex, 1);
        slides.splice(target, 0, slide);
        return { ...current, slides };
      });
    },
    undo,
    redo,
    downloadJson: () =>
      downloadText(
        `${deckRef.current.title || "演示文稿"}.oceanleo-deck.json`,
        JSON.stringify(deckRef.current, null, 2),
        "application/json",
      ),
    exportPptx,
    save,
  };
}
