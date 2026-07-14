"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { fetchMediaBlob } from "../../lib/media-proxy";
import type { LibraryItem } from "../library-data";
import {
  cloneDeckDocument,
  deckId,
  deckTheme,
  emptyDeckSlide,
  normalizeDeckDocument,
  type DeckAspect,
  type DeckDocument,
  type DeckSlide,
  type DeckThemeId,
} from "./deck-schema";
import {
  blobToDataUrl,
  downloadBlob,
  downloadText,
  saveFileToLibrary,
} from "./doc-io";

interface Snapshot {
  deck: DeckDocument;
  activeId: string;
}

export interface DeckEditorState {
  deck: DeckDocument;
  activeSlide: DeckSlide;
  activeIndex: number;
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
  addSlide: () => void;
  duplicateSlide: () => void;
  deleteSlide: () => void;
  moveSlide: (direction: -1 | 1) => void;
  undo: () => void;
  redo: () => void;
  downloadJson: () => void;
  exportPptx: () => Promise<void>;
  save: () => Promise<void>;
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
  if (!item.url || item.url.startsWith("blob:")) return fallback;
  try {
    const blob = await fetchMediaBlob(item.url, {
      maxBytes: 32 * 1024 * 1024,
      signal,
    });
    const text = await blob.text();
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return normalizeDeckDocument(JSON.parse(text), item.title || "演示文稿");
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
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
  const undoRef = useRef<Snapshot[]>([]);
  const redoRef = useRef<Snapshot[]>([]);
  const mountedRef = useRef(true);
  const revisionRef = useRef(0);
  const savingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    const abort = new AbortController();
    setLoading(true);
    setDirty(false);
    setSavedUrl("");
    revisionRef.current = 0;
    void loadDeck(item, previewContent, abort.signal)
      .then((next) => {
        if (abort.signal.aborted) return;
        deckRef.current = next;
        activeRef.current = next.slides[0].id;
        setDeckState(next);
        setActiveId(next.slides[0].id);
        undoRef.current = [];
        redoRef.current = [];
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
    }),
    [],
  );

  const applySnapshot = useCallback((value: Snapshot) => {
    const next = cloneDeckDocument(value.deck);
    deckRef.current = next;
    activeRef.current = value.activeId;
    setDeckState(next);
    setActiveId(value.activeId);
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
      setNotice(tt("PPTX 已导出，可继续用 OnlyOffice 深度编辑"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tt("PPTX 导出失败"));
    } finally {
      if (mountedRef.current) setExporting(false);
    }
  }, [exporting, tt]);

  const save = useCallback(async () => {
    if (savingRef.current) return;
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
          schema: "oceanleo.deck.v1",
          slides: snapshot.slides.length,
          aspect: snapshot.aspect,
          theme: snapshot.theme,
          source_deck: snapshot,
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
    } catch (caught) {
      if (mountedRef.current) {
        setError(caught instanceof Error ? caught.message : tt("保存失败"));
      }
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }, [item, siteId, tt]);

  return {
    deck,
    activeSlide,
    activeIndex,
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
    },
    setTitle: (title) => commit((current) => ({ ...current, title })),
    setAspect: (aspect) => commit((current) => ({ ...current, aspect })),
    setTheme: (theme) => commit((current) => ({ ...current, theme })),
    patchSlide,
    addSlide: () => {
      const slide = emptyDeckSlide();
      commit((current) => {
        const slides = [...current.slides];
        slides.splice(activeIndex + 1, 0, slide);
        return { ...current, slides };
      }, slide.id);
    },
    duplicateSlide: () => {
      const copy: DeckSlide = {
        ...activeSlide,
        id: deckId(),
        title: `${activeSlide.title} ${tt("副本")}`,
        bullets: [...activeSlide.bullets],
        image: activeSlide.image ? { ...activeSlide.image } : undefined,
      };
      commit((current) => {
        const slides = [...current.slides];
        slides.splice(activeIndex + 1, 0, copy);
        return { ...current, slides };
      }, copy.id);
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
