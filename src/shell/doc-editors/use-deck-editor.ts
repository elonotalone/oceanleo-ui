"use client";

import { unzipSync } from "fflate";
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
  createDeckMaster,
  deckId,
  deckMasterFor,
  deckTheme,
  emptyDeckSlide,
  normalizeDeckDocument,
  type DeckAspect,
  type DeckDocument,
  type DeckElement,
  type DeckLayout,
  type DeckMaster,
  type DeckSlide,
  type DeckThemeId,
} from "./deck-schema";
import {
  blobToDataUrl,
  downloadBlob,
  downloadText,
  loadEditorProject,
  saveFileToLibrary,
  urlExtension,
  type PreparedDeliveryUpload,
  type PreparedProjectUpload,
  type PersistedEditorVersion,
} from "./doc-io";
import {
  buildDeckInkAsset,
  type DeckInkStroke,
  type DeckInkStyle,
} from "./deck-ink";
import {
  applyDeckElementPatch,
  deckDocumentsEqual,
  deckElementMutationAllowed,
  deckElementPatchAllowed,
} from "./DeckMutationPolicy";
import {
  deckPptxImageStyle,
  deckPptxShadow,
  deckPptxShapeStyle,
  deckPptxTableImageData,
  deckPptxTableRequiresImage,
  deckPptxTextStyle,
  deckPptxTransparency,
  deckPptxVisualObjectName,
  injectDeckPptxVisuals,
} from "./DeckPptxVisuals";
import { injectDeckPptxOoxml } from "./deck-pptx-ooxml";
import { importPptxDeck } from "./pptx-deck-import";
import {
  fetchValidatedOfficePackage,
  notifyOfficeAccessDenied,
} from "./office-file";

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
  activeMaster: DeckMaster;
  loading: boolean;
  saving: boolean;
  exporting: boolean;
  dirty: boolean;
  editRevision: number;
  error: string;
  notice: string;
  savedUrl: string;
  canUndo: boolean;
  canRedo: boolean;
  selectSlide: (id: string) => void;
  setTitle: (title: string) => void;
  setTitleTransient: (title: string) => void;
  setAspect: (aspect: DeckAspect) => void;
  setTheme: (theme: DeckThemeId) => void;
  patchMaster: (id: string, patch: Partial<DeckMaster>) => void;
  duplicateMaster: () => void;
  deleteMaster: () => void;
  patchSlide: (patch: Partial<DeckSlide>) => void;
  patchSlideTransient: (patch: Partial<DeckSlide>) => void;
  applySlideLayout: (layout: DeckLayout) => void;
  selectElement: (id: string) => void;
  patchElement: (id: string, patch: Partial<DeckElement>) => void;
  patchElementTransient: (id: string, patch: Partial<DeckElement>) => void;
  beginGesture: () => void;
  endGesture: () => void;
  cancelGesture: () => void;
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
  save: () => Promise<PersistedEditorVersion | null>;
  restoreRecovery: (payload: unknown) => boolean;
}

const HISTORY_LIMIT = 60;
export const DECK_PROJECT_SCHEMA = "oceanleo.deck.v1";
export const DECK_SOURCE_FORMAT = "pptx";
export const DECK_SOURCE_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function httpUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : "";
  } catch {
    return "";
  }
}

function textHint(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** True when a URL/format/media type is structured editor JSON, never OOXML. */
export function isDeckEditorJsonHint(...hints: unknown[]): boolean {
  for (const hint of hints) {
    const value = textHint(hint);
    if (!value) continue;
    if (
      value === DECK_PROJECT_SCHEMA ||
      value === "application/json" ||
      value === "application/vnd.oceanleo.deck+json" ||
      value.startsWith("application/vnd.oceanleo") ||
      value.includes("oceanleo.deck") ||
      value.includes("oceanleo-project") ||
      value.includes("oceanleo-deck") ||
      value.endsWith("+json") ||
      /\.json(?:$|[?#])/i.test(value)
    ) {
      return true;
    }
  }
  return false;
}

function looksLikePptxDelivery(...hints: unknown[]): boolean {
  for (const hint of hints) {
    const value = textHint(hint);
    if (!value || isDeckEditorJsonHint(value)) continue;
    if (
      value === DECK_SOURCE_FORMAT ||
      value === "ppt" ||
      value === DECK_SOURCE_MEDIA_TYPE ||
      value.includes("presentationml") ||
      value.includes("ms-powerpoint") ||
      /\.pptx?(?:$|[?#])/i.test(value)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Load a durable deck working head. Accepts both the wrapped
 * `{schema,version,data}` project envelope and legacy raw deck JSON that was
 * historically published as the artifact source.
 */
export async function loadDeckEditorHead(
  url: string,
  title: string,
  signal?: AbortSignal,
): Promise<DeckDocument> {
  try {
    const project = await loadEditorProject<unknown>(
      url,
      DECK_PROJECT_SCHEMA,
      signal,
    );
    return normalizeDeckDocument(project, title || "演示文稿");
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === "AbortError") {
      throw caught;
    }
    const response = await fetch(url, {
      signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw caught instanceof Error
        ? caught
        : new Error(`可编辑工程读取失败（HTTP ${response.status}）`);
    }
    const text = await response.text();
    if (!text || new TextEncoder().encode(text).byteLength > 20_000_000) {
      throw caught instanceof Error
        ? caught
        : new Error("可编辑工程为空或超过 20MB 安全上限");
    }
    return normalizeDeckDocument(JSON.parse(text), title || "演示文稿");
  }
}

/** Structured head wins for reopen; the PPTX source remains a separate URL. */
export function deckProjectUrlFor(item: LibraryItem): string {
  const manifest = record(item.meta.editor_manifest);
  const manifestSource = record(manifest?.source);
  const artifactManifest = item.artifact?.renditions.editor_manifest;
  const artifactSource = item.artifact?.renditions.source;
  const legacyJsonSource =
    isDeckEditorJsonHint(
      item.artifact?.sourceFormat,
      artifactSource?.format,
      artifactSource?.mediaType,
      item.meta.source_format,
      item.meta.source_media_type,
      item.meta.format,
      item.meta.mime,
      item.url,
    ) && !looksLikePptxDelivery(artifactSource?.format, artifactSource?.mediaType)
      ? artifactSource?.url || item.meta.source_url || item.url
      : "";
  const candidates = [
    item.meta.editor_project_url,
    item.meta.editor_manifest_url,
    manifestSource?.format === DECK_PROJECT_SCHEMA ||
    isDeckEditorJsonHint(manifestSource?.format)
      ? manifestSource?.url
      : "",
    item.meta.editor_working_head_schema === DECK_PROJECT_SCHEMA ||
    isDeckEditorJsonHint(item.meta.editor_working_head_schema)
      ? item.meta.editor_working_head_project_url ||
        item.meta.editor_working_head_url
      : "",
    artifactManifest?.url,
    isDeckEditorJsonHint(artifactManifest?.format, artifactManifest?.mediaType)
      ? artifactManifest?.url
      : "",
    legacyJsonSource,
  ];
  for (const candidate of candidates) {
    const url = httpUrl(candidate);
    if (url) return url;
  }
  return "";
}

/** Download/source handoff never selects the JSON editor project. */
export function deckDeliveryUrlFor(item: LibraryItem): string {
  const projectUrl = deckProjectUrlFor(item);
  const artifactSource = item.artifact?.renditions.source;
  const candidates: Array<{ url: unknown; hints: unknown[] }> = [
    {
      url: artifactSource?.url,
      hints: [
        artifactSource?.format,
        artifactSource?.mediaType,
        item.artifact?.sourceFormat,
      ],
    },
    {
      url: item.meta.source_url,
      hints: [
        item.meta.source_format,
        item.meta.source_media_type,
        item.meta.format,
        item.meta.mime,
        item.meta.delivery_format,
        item.meta.file_name,
        item.meta.source_url,
      ],
    },
    {
      url: item.url,
      hints: [
        item.artifact?.sourceFormat,
        item.meta.source_format,
        item.meta.source_media_type,
        item.meta.format,
        item.meta.mime,
        item.meta.file_name,
        item.url,
      ],
    },
  ];
  for (const candidate of candidates) {
    const url = httpUrl(candidate.url);
    if (!url || url === projectUrl) continue;
    if (isDeckEditorJsonHint(...candidate.hints, url)) continue;
    if (
      looksLikePptxDelivery(...candidate.hints, url) ||
      looksLikePptxDelivery(item.meta.source_format, item.meta.delivery_format)
    ) {
      return url;
    }
  }
  return "";
}

export function deckSavedItemForHandoff(
  original: LibraryItem,
  saved: PersistedEditorVersion,
): LibraryItem {
  const rootId = String(
    original.meta.root_asset_id ||
      original.meta.parent_asset_id ||
      original.artifactId ||
      original.id,
  );
  const projectUrl = saved.projectUrl || "";
  const projectSchema = saved.projectSchema || DECK_PROJECT_SCHEMA;
  const sourceFormat = saved.sourceFormat || DECK_SOURCE_FORMAT;
  const sourceMediaType = saved.sourceMediaType || DECK_SOURCE_MEDIA_TYPE;
  const editorManifest = projectUrl
    ? {
        schema: "oceanleo.editor-manifest.v1",
        id: "deck-editor",
        version: 1,
        capabilities: ["load", "mutate", "save", "reopen"],
        source: {
          kind: "url",
          format: projectSchema,
          url: projectUrl,
        },
      }
    : undefined;
  const base: LibraryItem =
    saved.item ||
    ({
      ...original,
      id: saved.versionId || original.id,
      title: saved.title || original.title,
      url: saved.url,
      meta: {
        ...original.meta,
        parent_asset_id: rootId,
        root_asset_id: rootId,
      },
    } satisfies LibraryItem);
  return {
    ...base,
    title: saved.title || base.title,
    url: saved.url,
    kind: "ppt",
    artifactId: saved.artifactId || base.artifactId,
    revisionId: saved.revisionId || base.revisionId,
    artifactType: "deck",
    meta: {
      ...base.meta,
      source_format: sourceFormat,
      source_media_type: sourceMediaType,
      source_url: saved.url,
      format: sourceFormat,
      mime: sourceMediaType,
      delivery_format: DECK_SOURCE_FORMAT,
      file_name: saved.fileName || `${saved.title || base.title || "deck"}.pptx`,
      representation: DECK_SOURCE_FORMAT,
      editor_project_url: projectUrl,
      editor_project_schema: projectSchema,
      editor_manifest_url: projectUrl,
      editor_manifest_schema: projectSchema,
      editor_manifest_media_type: "application/json",
      ...(editorManifest ? { editor_manifest: editorManifest } : {}),
      editor_working_head_url: projectUrl,
      editor_working_head_project_url: projectUrl,
      editor_working_head_schema: projectSchema,
      editor_saved_at: saved.savedAt,
      ...(saved.previousRevisionId
        ? { previous_revision_id: saved.previousRevisionId }
        : {}),
    },
  };
}

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
  onSourceAccessError?: () => void,
): Promise<DeckDocument> {
  const projectUrl = deckProjectUrlFor(item);
  let projectError: unknown;
  if (projectUrl) {
    try {
      return await loadDeckEditorHead(
        projectUrl,
        item.title || "演示文稿",
        signal,
      );
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        throw caught;
      }
      projectError = caught;
    }
  }
  const fallback = normalizeDeckDocument(
    initialSource(item, previewContent),
    item.title || "演示文稿",
  );
  const deliveryUrl = deckDeliveryUrlFor(item);
  if (!deliveryUrl) {
    if (projectError) {
      notifyOfficeAccessDenied(projectError, onSourceAccessError);
      throw projectError;
    }
    return fallback;
  }
  const extension = (
    officeExtensionForItem(item) ||
    urlExtension(deliveryUrl) ||
    String(item.meta.source_format || "") ||
    String(item.meta.format || "") ||
    DECK_SOURCE_FORMAT
  ).toLowerCase();
  if (["ppt", "pot", "odp"].includes(extension)) {
    throw new Error(
      `轻量演示编辑器暂不能解析 .${extension} 源文件；请转换为 PPTX 后重试。`,
    );
  }
  try {
    const { arrayBuffer } = await fetchValidatedOfficePackage(
      deliveryUrl,
      "pptx",
      {
        maxBytes: 64 * 1024 * 1024,
        signal,
        onAccessDenied: onSourceAccessError,
      },
    );
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return await importPptxDeck(
      arrayBuffer,
      item.title || "演示文稿",
      extension === "ppt" ? "pptx" : extension || "pptx",
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    notifyOfficeAccessDenied(error, onSourceAccessError);
    throw new Error(
      error instanceof Error
        ? `PPTX 导入失败：${error.message}`
        : "PPTX 导入失败",
    );
  }
}

function cleanHex(color: string, fallback: string): string {
  const normalize = (value: string) => value.trim().replace(/^#/, "");
  const candidate = normalize(color || "");
  if (/^[0-9a-f]{6}$/i.test(candidate)) return candidate.toUpperCase();
  if (/^[0-9a-f]{3}$/i.test(candidate)) {
    return candidate
      .split("")
      .map((part) => `${part}${part}`)
      .join("")
      .toUpperCase();
  }
  const safeFallback = normalize(fallback || "000000");
  return /^[0-9a-f]{6}$/i.test(safeFallback)
    ? safeFallback.toUpperCase()
    : "000000";
}

function visibleColor(color: string | undefined): boolean {
  return Boolean(color && color.toLowerCase() !== "transparent");
}

export async function assertDeckPptxDelivery(
  blob: Blob,
  expectedSlideCount: number,
): Promise<void> {
  if (!blob.size || blob.size > 64 * 1024 * 1024) {
    throw new Error("PPTX 交付为空或超过 64MB 安全上限");
  }
  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  } catch {
    throw new Error("PPTX 交付不是有效的 OOXML ZIP");
  }
  const required = [
    "[Content_Types].xml",
    "_rels/.rels",
    "ppt/presentation.xml",
    "ppt/_rels/presentation.xml.rels",
  ];
  if (required.some((path) => !archive[path]?.length)) {
    throw new Error("PPTX 交付缺少必要的 OOXML 部件");
  }
  const slideCount = Object.keys(archive).filter((path) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(path),
  ).length;
  if (slideCount !== Math.max(1, expectedSlideCount)) {
    throw new Error("PPTX 交付页数与结构化工程不一致");
  }
}

export async function buildDeckPptxBlob(deck: DeckDocument): Promise<Blob> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pinnedDeck = cloneDeckDocument(deck);
  const pptx = new PptxGenJS();
  pptx.layout =
    pinnedDeck.aspect === "4:3" ? "LAYOUT_4X3" : "LAYOUT_WIDE";
  pptx.author = "OceanLeo";
  pptx.subject = pinnedDeck.title;
  pptx.title = pinnedDeck.title;
  pptx.company = "OceanLeo";
  const theme = deckTheme(pinnedDeck.theme);
  const width = pinnedDeck.aspect === "4:3" ? 10 : 13.333;
  const height = 7.5;

  for (const source of pinnedDeck.slides) {
    const slide = pptx.addSlide();
    const master = deckMasterFor(pinnedDeck, source);
    const background = cleanHex(
      source.background,
      master.background || theme.background,
    );
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
          const textStyle = deckPptxTextStyle(element);
          const transparency = deckPptxTransparency(element);
          slide.addText(element.text || "", {
            ...box,
            objectName: deckPptxVisualObjectName(element.id),
            rotate: element.rotation,
            fontFace:
              element.fontFamily || master.fontFamily.split(",")[0],
            fontSize: element.fontSize || 18,
            color: cleanHex(
              element.color || master.textColor,
              master.textColor || theme.text,
            ),
            bold: element.bold,
            italic: element.italic,
            ...textStyle,
            align: element.align || "left",
            valign: "middle",
            margin: 0,
            fill: visibleColor(element.fill)
              ? {
                  color: cleanHex(element.fill || "", "FFFFFF"),
                  transparency,
                }
              : { color: "FFFFFF", transparency: 100 },
            line: element.borderWidth
              ? {
                  color: cleanHex(element.borderColor || "#000000", "000000"),
                  width: element.borderWidth,
                  transparency,
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
              objectName: deckPptxVisualObjectName(element.id),
              rotate: element.rotation,
              ...deckPptxImageStyle(element, box),
            });
          } catch {
            slide.addText(element.alt || "图片无法导出", {
              ...box,
              objectName: deckPptxVisualObjectName(element.id),
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
            shapeName.includes("ellipse") ||
            shapeName.includes("oval") ||
            shapeName.includes("circle")
              ? pptx.ShapeType.ellipse
              : shapeName.includes("round") ||
                  ((shapeName === "rectangle" || shapeName === "rect") &&
                    (element.borderRadius || 0) > 0)
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
          const {
            transparency,
            ...shapeStyle
          } = deckPptxShapeStyle(element, box, pinnedDeck.aspect);
          const lineColor = visibleColor(element.borderColor)
            ? element.borderColor || "#000000"
            : visibleColor(element.fill)
              ? element.fill || "#111827"
              : "#111827";
          const lineVisible =
            shapeName.includes("line")
              ? visibleColor(element.borderColor) || visibleColor(element.fill)
              : Boolean(element.borderWidth) &&
                visibleColor(element.borderColor);
          slide.addShape(shapeType, {
            ...box,
            objectName: deckPptxVisualObjectName(element.id),
            rotate: element.rotation,
            ...shapeStyle,
            fill: visibleColor(element.fill)
              ? {
                  color: cleanHex(element.fill || "", "FFFFFF"),
                  transparency,
                }
              : { color: "FFFFFF", transparency: 100 },
            line: {
              color: cleanHex(lineColor, "000000"),
              width:
                shapeName.includes("line")
                  ? element.borderWidth || 2
                  : element.borderWidth || 0,
              transparency: lineVisible ? transparency : 100,
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
              objectName: deckPptxVisualObjectName(element.id, "label"),
              rotate: element.rotation,
              fontFace:
                element.fontFamily || master.fontFamily.split(",")[0],
              fontSize: element.fontSize || 16,
              color: cleanHex(
                element.color || master.textColor,
                master.textColor || theme.text,
              ),
              bold: element.bold,
              italic: element.italic,
              ...deckPptxTextStyle(element, { includeShadow: false }),
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
          const transparency = deckPptxTransparency(element);
          if (deckPptxTableRequiresImage(element)) {
            slide.addImage({
              data: deckPptxTableImageData(element, pinnedDeck.aspect),
              ...box,
              objectName: deckPptxVisualObjectName(element.id),
              altText: element.alt || element.label || "Table",
              rotate: element.rotation,
              transparency,
              shadow: deckPptxShadow(element),
              flipH: element.flipX === true,
              flipV: element.flipY === true,
            });
            continue;
          }
          slide.addTable(
            element.rows.map((row) =>
              row.map((text) => ({ text })),
            ),
            {
              ...box,
              objectName: deckPptxVisualObjectName(element.id),
              border: {
                type: "solid",
                color: cleanHex(element.borderColor || "#D1D5DB", "D1D5DB"),
                pt: Math.max(0.25, element.borderWidth || 1),
              },
              color: cleanHex(
                element.color || master.textColor,
                "111827",
              ),
              fill: {
                color: cleanHex(element.fill || theme.surface, "FFFFFF"),
                transparency:
                  element.fill?.toLowerCase() === "transparent"
                    ? 100
                    : transparency,
              },
              fontFace:
                element.fontFamily || master.fontFamily.split(",")[0],
              fontSize: Math.max(8, element.fontSize || 12),
              margin: 0.05,
            },
          );
          continue;
        }
        slide.addText(element.label || "此元素保留在原始 PPTX 中", {
          ...box,
          objectName: deckPptxVisualObjectName(element.id),
          rotate: element.rotation,
          ...deckPptxTextStyle(element),
          align: "center",
          valign: "middle",
          color: cleanHex(theme.muted, "64748B"),
          fill: {
            color: "F8FAFC",
            transparency: deckPptxTransparency(element),
          },
          line: {
            color: "CBD5E1",
            dashType: "dash",
            transparency: deckPptxTransparency(element),
          },
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
      fontFace: master.fontFamily.split(",")[0],
      fontSize: source.layout === "title" || source.layout === "section" ? 34 : 26,
      color: cleanHex(master.textColor, "#111827"),
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
        fontFace: master.fontFamily.split(",")[0],
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
          fontFace: master.fontFamily.split(",")[0],
          fontSize: 17,
          color: cleanHex(master.textColor, "#111827"),
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
  const blob = (await pptx.write({ outputType: "blob" })) as Blob;
  const withMotion = await injectDeckPptxOoxml(blob, pinnedDeck.slides);
  const delivery = await injectDeckPptxVisuals(
    withMotion,
    pinnedDeck.slides,
    pinnedDeck.aspect,
  );
  await assertDeckPptxDelivery(delivery, pinnedDeck.slides.length);
  return delivery;
}

export function useDeckEditor(
  item: LibraryItem,
  siteId = "",
  previewContent?: unknown,
  onSourceAccessError?: () => void,
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
  const gestureRef = useRef<Snapshot | null>(null);
  const mountedRef = useRef(true);
  const revisionRef = useRef(0);
  const savingRef = useRef(false);
  const persistedItemRef = useRef(item);
  const preparedSaveRef = useRef<{
    key: string;
    project?: PreparedProjectUpload;
    delivery?: PreparedDeliveryUpload;
  } | null>(null);
  const workingHeadUrlRef = useRef(
    deckProjectUrlFor(item) || item.previewUrl || "",
  );
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
    persistedItemRef.current = item;
    preparedSaveRef.current = null;
    workingHeadUrlRef.current =
      deckProjectUrlFor(item) || item.previewUrl || "";
    void loadDeck(item, previewContent, abort.signal, onSourceAccessError)
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
        gestureRef.current = null;
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
  }, [item, onSourceAccessError, previewContent, tt]);

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
      const base = snapshot();
      const next = update(cloneDeckDocument(base.deck));
      const resolvedActive = nextActive || base.activeId || next.slides[0].id;
      if (deckDocumentsEqual(next, base.deck)) {
        if (resolvedActive !== base.activeId) {
          activeRef.current = resolvedActive;
          setActiveId(resolvedActive);
        }
        return false;
      }
      undoRef.current.push(base);
      if (undoRef.current.length > HISTORY_LIMIT) undoRef.current.shift();
      redoRef.current = [];
      deckRef.current = next;
      activeRef.current = resolvedActive;
      setDeckState(next);
      setActiveId(resolvedActive);
      setSavedUrl("");
      setNotice("");
      revisionRef.current += 1;
      setDirty(true);
      setHistoryRevision((value) => value + 1);
      return true;
    },
    [snapshot],
  );

  const applyTransient = useCallback(
    (update: (current: DeckDocument) => DeckDocument) => {
      const current = deckRef.current;
      const next = update(cloneDeckDocument(current));
      if (deckDocumentsEqual(next, current)) return false;
      deckRef.current = next;
      setDeckState(next);
      setHistoryRevision((value) => value + 1);
      return true;
    },
    [],
  );
  const beginGesture = useCallback(() => {
    if (!gestureRef.current) gestureRef.current = snapshot();
  }, [snapshot]);
  const endGesture = useCallback(() => {
    const base = gestureRef.current;
    if (!base) return;
    gestureRef.current = null;
    if (deckDocumentsEqual(base.deck, deckRef.current)) return;
    undoRef.current.push(base);
    if (undoRef.current.length > HISTORY_LIMIT) undoRef.current.shift();
    redoRef.current = [];
    revisionRef.current += 1;
    setDirty(true);
    setSavedUrl("");
    setNotice("");
    setHistoryRevision((value) => value + 1);
  }, []);
  const cancelGesture = useCallback(() => {
    const base = gestureRef.current;
    if (!base) return;
    gestureRef.current = null;
    applySnapshot(base);
  }, [applySnapshot]);

  const activeIndex = Math.max(
    0,
    deck.slides.findIndex((slide) => slide.id === activeId),
  );
  const activeSlide = deck.slides[activeIndex] || deck.slides[0];
  const activeMaster = deckMasterFor(deck, activeSlide);
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
  const patchSlideTransient = useCallback(
    (patch: Partial<DeckSlide>) =>
      applyTransient((current) => ({
        ...current,
        slides: current.slides.map((slide) =>
          slide.id === activeRef.current ? { ...slide, ...patch } : slide,
        ),
      })),
    [applyTransient],
  );
  const patchMaster = useCallback(
    (id: string, patch: Partial<DeckMaster>) =>
      commit((current) => ({
        ...current,
        masters: current.masters.map((master) =>
          master.id === id
            ? {
                ...master,
                ...patch,
                id: master.id,
                name: String(patch.name ?? master.name).slice(0, 120),
              }
            : master,
        ),
      })),
    [commit],
  );
  const duplicateMaster = useCallback(() => {
    const current = deckMasterFor(
      deckRef.current,
      deckRef.current.slides.find((slide) => slide.id === activeRef.current) ||
        deckRef.current.slides[0],
    );
    const copy = {
      ...current,
      id: deckId("master"),
      name: `${current.name} ${tt("副本")}`,
    };
    commit((deck) => ({
      ...deck,
      masters: [...deck.masters, copy],
      slides: deck.slides.map((slide) =>
        slide.id === activeRef.current ? { ...slide, masterId: copy.id } : slide,
      ),
    }));
  }, [commit, tt]);
  const deleteMaster = useCallback(() => {
    const current = deckRef.current;
    if (current.masters.length <= 1) return;
    const slide = current.slides.find((entry) => entry.id === activeRef.current);
    const removingId = slide?.masterId || current.masters[0].id;
    const fallback =
      current.masters.find((master) => master.id !== removingId) ||
      createDeckMaster(current.theme, "默认母版", "master-default");
    commit((deck) => ({
      ...deck,
      masters: deck.masters.filter((master) => master.id !== removingId),
      slides: deck.slides.map((entry) =>
        entry.masterId === removingId
          ? { ...entry, masterId: fallback.id }
          : entry,
      ),
    }));
  }, [commit]);
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
              if (element.locked) return element;
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
      const selected = deckRef.current.slides
        .find((slide) => slide.id === activeRef.current)
        ?.elements.find((element) => element.id === id);
      if (!selected || !deckElementPatchAllowed(selected, patch)) return;
      commit((current) => ({
        ...current,
        slides: current.slides.map((slide) =>
          slide.id === activeRef.current
            ? {
                ...slide,
                elements: slide.elements.map((element) =>
                  element.id === id
                    ? applyDeckElementPatch(element, patch)
                    : element,
                ),
              }
            : slide,
        ),
      }));
    },
    [commit],
  );
  const patchElementTransient = useCallback(
    (id: string, patch: Partial<DeckElement>) => {
      const selected = deckRef.current.slides
        .find((slide) => slide.id === activeRef.current)
        ?.elements.find((element) => element.id === id);
      if (!selected || !deckElementPatchAllowed(selected, patch)) return;
      applyTransient((current) => ({
        ...current,
        slides: current.slides.map((slide) =>
          slide.id === activeRef.current
            ? {
                ...slide,
                elements: slide.elements.map((element) =>
                  element.id === id
                    ? applyDeckElementPatch(element, patch)
                    : element,
                ),
              }
            : slide,
        ),
      }));
    },
    [applyTransient],
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
    const selected = deckRef.current.slides
      .find((slide) => slide.id === activeRef.current)
      ?.elements.find((element) => element.id === id);
    if (
      !selected ||
      !deckElementMutationAllowed(selected, "delete")
    ) {
      return;
    }
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
    if (
      !selected ||
      !deckElementMutationAllowed(selected, "duplicate")
    ) {
      return;
    }
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
      if (
        !selected ||
        !current ||
        !deckElementMutationAllowed(selected, "layer")
      ) {
        return;
      }
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

  const save = useCallback(async (): Promise<PersistedEditorVersion | null> => {
    if (savingRef.current) return null;
    const savingRevision = revisionRef.current;
    const snapshot = cloneDeckDocument(deckRef.current);
    const baseItem = persistedItemRef.current;
    const baseRevision = String(
      baseItem.revisionId || baseItem.meta.revision_id || baseItem.id,
    );
    const rootId = String(
      baseItem.artifactId ||
        baseItem.meta.artifact_id ||
        baseItem.meta.root_asset_id ||
        baseItem.meta.parent_asset_id ||
        baseItem.id,
    );
    const saveKey =
      `deck:${savingRevision}:${baseRevision.slice(-80)}:${rootId.slice(-80)}`;
    const prepared =
      preparedSaveRef.current?.key === saveKey
        ? preparedSaveRef.current
        : null;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const title =
        String(snapshot.title || baseItem.title || tt("演示文稿")).trim() ||
        tt("演示文稿");
      const fileStem =
        title.replace(/[\\/:*?"<>|]/g, "-").trim().slice(0, 180) ||
        tt("演示文稿");
      const result = await saveFileToLibrary({
        item: baseItem,
        siteId,
        fallbackSite: "ppt",
        createFile: async () => {
          const delivery = await buildDeckPptxBlob(snapshot);
          return new File([delivery], `${fileStem}.pptx`, {
            type: DECK_SOURCE_MEDIA_TYPE,
          });
        },
        sourceFormat: DECK_SOURCE_FORMAT,
        sourceMediaType: DECK_SOURCE_MEDIA_TYPE,
        title,
        mediaType: "ppt",
        kind: "deck",
        idempotencyKey: saveKey,
        workingHeadUrl: workingHeadUrlRef.current,
        preparedProject: prepared?.project,
        preparedDelivery: prepared?.delivery,
        meta: {
          editor: "deck-editor",
          editor_capability: "deck-editor",
          content_type: "deck",
          representation: DECK_SOURCE_FORMAT,
          slides: snapshot.slides.length,
          aspect: snapshot.aspect,
          theme: snapshot.theme,
          deck_version: snapshot.version,
        },
        project: {
          schema: DECK_PROJECT_SCHEMA,
          data: snapshot,
        },
        editorManifest: {
          id: "deck-editor",
          format: DECK_PROJECT_SCHEMA,
        },
        artifactRevision: {
          artifactType: "deck",
          provenance: {
            editorRevision: savingRevision,
            deckVersion: snapshot.version,
          },
        },
      });
      if (!result.ok) {
        preparedSaveRef.current =
          result.preparedProject || result.preparedDelivery
            ? {
                key: saveKey,
                project: result.preparedProject,
                delivery: result.preparedDelivery,
              }
            : preparedSaveRef.current;
        throw new Error(result.error || tt("保存到我的库失败"));
      }
      preparedSaveRef.current = null;
      const handoff = deckSavedItemForHandoff(
        result.item || baseItem,
        result,
      );
      persistedItemRef.current = handoff;
      workingHeadUrlRef.current =
        result.projectUrl || deckProjectUrlFor(handoff);
      if (mountedRef.current) {
        setSavedUrl(result.url);
        if (revisionRef.current === savingRevision) {
          setDirty(false);
        }
        setNotice("");
      }
      return mountedRef.current
        ? {
            url: result.url,
            versionId: result.versionId,
            projectUrl: result.projectUrl,
            projectSchema: result.projectSchema,
            sourceFormat: result.sourceFormat || DECK_SOURCE_FORMAT,
            sourceMediaType: result.sourceMediaType || DECK_SOURCE_MEDIA_TYPE,
            title: result.title,
            fileName: result.fileName,
            savedAt: result.savedAt,
            artifactId: result.artifactId,
            revisionId: result.revisionId,
            previousRevisionId: result.previousRevisionId,
            item: handoff,
            preparedProject: result.preparedProject,
            preparedDelivery: result.preparedDelivery,
          }
        : null;
    } catch (caught) {
      if (mountedRef.current) {
        setError(caught instanceof Error ? caught.message : tt("保存失败"));
      }
      return null;
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }, [siteId, tt]);

  const restoreRecovery = useCallback(
    (payload: unknown): boolean => {
      if (
        !payload ||
        typeof payload !== "object" ||
        !Array.isArray((payload as { slides?: unknown }).slides)
      ) {
        return false;
      }
      const next = normalizeDeckDocument(payload, item.title || "演示文稿");
      commit(() => next, next.slides[0].id);
      setNotice(tt("已恢复上次未同步的本地草稿"));
      return true;
    },
    [commit, item.title, tt],
  );

  return {
    deck,
    activeSlide,
    activeIndex,
    selectedElement,
    selectedElementId,
    activeMaster,
    loading,
    saving,
    exporting,
    dirty,
    editRevision: revisionRef.current,
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
    setTitleTransient: (title) =>
      applyTransient((current) => ({ ...current, title })),
    setAspect: (aspect) => commit((current) => ({ ...current, aspect })),
    setTheme: (theme) => commit((current) => ({ ...current, theme })),
    patchMaster,
    duplicateMaster,
    deleteMaster,
    patchSlide,
    patchSlideTransient,
    applySlideLayout,
    selectElement,
    patchElement,
    patchElementTransient,
    beginGesture,
    endGesture,
    cancelGesture,
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
      const slide = {
        ...emptyDeckSlide(),
        masterId: activeSlide.masterId || deckRef.current.masters[0]?.id,
      };
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
          animation: element.animation ? { ...element.animation } : undefined,
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
        `${deckRef.current.title || "演示文稿"}.oceanleo-deck.v1.json`,
        JSON.stringify(deckRef.current, null, 2),
        "application/json",
      ),
    exportPptx,
    save,
    restoreRecovery,
  };
}
