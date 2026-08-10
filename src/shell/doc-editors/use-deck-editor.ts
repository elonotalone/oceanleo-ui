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
  deckCarrierPlacement,
  deckFontPoints,
  deckId,
  deckLayoutIsCarrierGrammar,
  deckMasterFor,
  deckTheme,
  emptyDeckSlide,
  normalizeDeckDocument,
  type DeckAspect,
  type DeckDocument,
  type DeckElement,
  type DeckLayout,
  type DeckLegacyLayout,
  type DeckMaster,
  type DeckPercentBox,
  type DeckSlide,
  type DeckThemeId,
} from "./deck-schema";
import {
  DECK_IR_SCHEMA,
  validateDeckIr,
  type DeckIrAsset,
  type DeckIrDocument,
} from "./deck-ir";
import { buildDeckPptx, type DeckAssetBytes } from "./deck-ooxml-package";
import {
  blobToDataUrl,
  downloadBlob,
  downloadText,
  loadEditorProject,
  saveFileToLibrary,
  urlExtension,
  type PreparedDeliveryUpload,
  type PreparedPreviewUpload,
  type PreparedProjectUpload,
  type PersistedEditorVersion,
} from "./doc-io";
import { artifactSaveStepMessage } from "./artifact-save-contract";
import { renderDeckPreviewPng } from "./editor-preview-raster";
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
  /** The source could not be read; the stage owes the user a retry, not a mask. */
  sourceFailed: boolean;
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
  /** Re-run the source load for the same item after a failure. */
  reload: () => void;
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
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    // Auth-gated source-tree must never be handed to anonymous browser GETs.
    if (/\/source-tree\/@source\/?$/.test(parsed.pathname)) return "";
    return parsed.toString();
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
  return normalizeDeckDocument(
    await loadDeckEditorPayload(url, signal),
    title || "演示文稿",
  );
}

/**
 * The same fetch as `loadDeckEditorHead`, stopping one step earlier.
 *
 * Normalizing straight into the editor's own model is lossy by design, and a
 * production draft cannot survive it: everything the writer needs — the layout
 * grammar per page, the declared pictures, the credits — is dropped on the way
 * in. So the raw payload is read first, and the caller decides what it is.
 */
export async function loadDeckEditorPayload(
  url: string,
  signal?: AbortSignal,
): Promise<unknown> {
  try {
    return await loadEditorProject<unknown>(url, DECK_PROJECT_SCHEMA, signal);
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
    return JSON.parse(text);
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

interface DeckLoad {
  deck: DeckDocument;
  draft: DeckDraftState | null;
}

async function loadDeck(
  item: LibraryItem,
  previewContent?: unknown,
  signal?: AbortSignal,
  onSourceAccessError?: () => void,
): Promise<DeckLoad> {
  const projectUrl = deckProjectUrlFor(item);
  let projectError: unknown;
  if (projectUrl) {
    try {
      const payload = await loadDeckEditorPayload(projectUrl, signal);
      const project = deckDraftFrom(payload);
      if (project) {
        const assetUrls = deckDraftAssetUrlsFor(item, payload);
        return {
          deck: deckDocumentFromDraft(project, assetUrls),
          draft: { project, assetUrls },
        };
      }
      return {
        deck: normalizeDeckDocument(payload, item.title || "演示文稿"),
        draft: null,
      };
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
    return { deck: fallback, draft: null };
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
    return {
      deck: await importPptxDeck(
        arrayBuffer,
        item.title || "演示文稿",
        extension === "ppt" ? "pptx" : extension || "pptx",
      ),
      draft: null,
    };
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

/* ───────────────────────── editing the draft, not the file ─────────────────
 *
 * A deck on the shelf is one of two things.
 *
 * Almost every one of them today is a PPTX file and nothing else. The only way
 * in is to unpack the OOXML into this editor's own model, and the only way out
 * is `buildDeckPptxBlob` writing a fresh file with `pptxgenjs` — which is why
 * changing one character in a title hands the user a wholly regenerated deck,
 * with the master, the theme, the real chart objects and the credit line gone.
 * That path is untouched below; those files have nothing else to offer.
 *
 * The other kind carries the document the production line built it from. For
 * those the editor edits that document and hands it to the same writer the line
 * uses, so what the user downloads and what the line produces are one thing.
 *
 * `DECK_PROJECT_SCHEMA` and `DECK_IR_SCHEMA` are the same string, so the schema
 * id cannot tell the two apart. The shape decides.
 * ──────────────────────────────────────────────────────────────────────────*/

export type DeckDraftPathSegment = string | number;

export interface DeckDraftAssetUrls {
  readonly [assetId: string]: string;
}

export interface DeckDraftState {
  project: DeckIrDocument;
  assetUrls: DeckDraftAssetUrls;
}

const DRAFT_ELEMENT_PREFIX = "draft:";
/** Keys whose string value is a machine identifier or an enum, never prose. */
const DRAFT_OPAQUE_KEYS = new Set(["layout", "assetId", "fit", "chartType"]);
const DRAFT_TITLE_BOX: DeckPercentBox = { x: 6, y: 7, width: 88, height: 14 };
const DRAFT_CONTENT_BOX: DeckPercentBox = { x: 6, y: 26, width: 88, height: 58 };
const DRAFT_IMAGE_BOX: DeckPercentBox = { x: 56, y: 26, width: 38, height: 52 };
const DRAFT_MIN_ROW_HEIGHT = 4;

/** Read a production draft out of an editor project payload, wrapped or not. */
export function deckDraftFrom(value: unknown): DeckIrDocument | null {
  const outer = record(value);
  const wrapped = outer ? record(outer.data) : null;
  const candidate =
    wrapped && wrapped.schema === DECK_IR_SCHEMA ? wrapped : outer;
  if (!candidate || candidate.schema !== DECK_IR_SCHEMA) return null;
  if (!Array.isArray(candidate.slides)) return null;
  const validation = validateDeckIr(candidate);
  return validation.ok ? validation.project : null;
}

/**
 * Where a picture's bytes can be fetched from.
 *
 * The draft declares its pictures by id, digest and size and deliberately
 * carries no address — the same document has to stay valid wherever it is
 * stored. So the addresses travel beside it, on the library record.
 */
export function deckDraftAssetUrlsFor(
  item: LibraryItem,
  payload?: unknown,
): DeckDraftAssetUrls {
  const urls: Record<string, string> = {};
  const absorb = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const entry of value) {
        const asset = record(entry);
        const id = typeof asset?.id === "string" ? asset.id : "";
        const url = httpUrl(asset?.url);
        if (id && url) urls[id] = url;
      }
      return;
    }
    const map = record(value);
    if (!map) return;
    for (const [id, candidate] of Object.entries(map)) {
      const url = httpUrl(candidate);
      if (id && url) urls[id] = url;
    }
  };
  const envelope = record(payload);
  absorb(item.meta.deck_asset_urls);
  absorb(item.meta.asset_urls);
  absorb(envelope?.assetUrls);
  absorb(envelope?.asset_urls);
  return urls;
}

export function deckDraftElementId(
  slideIndex: number,
  path: readonly DeckDraftPathSegment[],
): string {
  return `${DRAFT_ELEMENT_PREFIX}${slideIndex}/${path.join("/")}`;
}

export function deckDraftElementPath(
  id: string,
): { slideIndex: number; path: DeckDraftPathSegment[] } | null {
  if (!id.startsWith(DRAFT_ELEMENT_PREFIX)) return null;
  const [head, ...rest] = id.slice(DRAFT_ELEMENT_PREFIX.length).split("/");
  const slideIndex = Number(head);
  if (!Number.isInteger(slideIndex) || slideIndex < 0 || !rest.length) {
    return null;
  }
  return {
    slideIndex,
    path: rest.map((part) => (/^\d+$/.test(part) ? Number(part) : part)),
  };
}

interface DeckDraftTextLeaf {
  path: DeckDraftPathSegment[];
  value: string;
}

/**
 * Every piece of prose in one page of the draft, each with the exact place it
 * came from. Addressing the text by where it lives — rather than by matching it
 * back up afterwards — is what makes the return trip exact.
 */
function draftTextLeaves(
  value: unknown,
  path: DeckDraftPathSegment[] = [],
): DeckDraftTextLeaf[] {
  if (typeof value === "string") return [{ path, value }];
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      draftTextLeaves(entry, [...path, index]),
    );
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, entry]) =>
        DRAFT_OPAQUE_KEYS.has(key) ? [] : draftTextLeaves(entry, [...path, key]),
    );
  }
  return [];
}

function draftTextAt(
  slide: unknown,
  path: readonly DeckDraftPathSegment[],
): string | null {
  let cursor: unknown = slide;
  for (const part of path) {
    if (!cursor || typeof cursor !== "object") return null;
    cursor = (cursor as Record<DeckDraftPathSegment, unknown>)[part];
  }
  return typeof cursor === "string" ? cursor : null;
}

/** Write prose back where it came from. Refuses anything that is not prose. */
function setDraftTextAt(
  slide: unknown,
  path: readonly DeckDraftPathSegment[],
  value: string,
): boolean {
  if (!path.length) return false;
  let cursor: unknown = slide;
  for (const part of path.slice(0, -1)) {
    if (!cursor || typeof cursor !== "object") return false;
    cursor = (cursor as Record<DeckDraftPathSegment, unknown>)[part];
  }
  if (!cursor || typeof cursor !== "object") return false;
  const holder = cursor as Record<DeckDraftPathSegment, unknown>;
  const last = path[path.length - 1];
  if (typeof holder[last] !== "string") return false;
  holder[last] = value;
  return true;
}

function draftBox(
  box: DeckPercentBox | undefined,
  fallback: DeckPercentBox,
): DeckPercentBox {
  return box || fallback;
}

function draftStackedBox(
  box: DeckPercentBox,
  index: number,
  count: number,
): DeckPercentBox {
  const height = Math.max(DRAFT_MIN_ROW_HEIGHT, box.height / Math.max(1, count));
  return {
    x: box.x,
    y: box.y + index * height,
    width: box.width,
    height,
  };
}

/**
 * One page of the draft as stage elements.
 *
 * The picture and the two text regions sit on the §4 grid the writer itself
 * uses, so the stage and the exported file agree on the big shapes. The rest of
 * the page's prose — table cells, KPI labels, milestone dates — is stacked
 * inside the body region: the writer decides where each of those really lands,
 * and pretending otherwise on the stage would be a promise this path cannot
 * keep.
 */
function draftSlideElements(
  slide: DeckIrDocument["slides"][number],
  slideIndex: number,
  assetUrls: DeckDraftAssetUrls,
): DeckElement[] {
  const placement = deckLayoutIsCarrierGrammar(slide.layout)
    ? deckCarrierPlacement(slide.layout)
    : {};
  const titleBox = draftBox(placement.title, DRAFT_TITLE_BOX);
  const contentBox = draftBox(placement.content, DRAFT_CONTENT_BOX);
  const imageBox = draftBox(placement.image, DRAFT_IMAGE_BOX);
  const leaves = draftTextLeaves(slide).filter(
    (leaf) => leaf.path[0] !== "layout",
  );
  const titlePath = leaves.some((leaf) => leaf.path.join("/") === "title")
    ? ["title"]
    : slide.layout === "quote" &&
        leaves.some((leaf) => leaf.path.join("/") === "quote/text")
      ? ["quote", "text"]
      : null;
  const titleKey = titlePath?.join("/") || "";
  const body = leaves.filter((leaf) => leaf.path.join("/") !== titleKey);
  const elements: DeckElement[] = [];
  let order = 0;

  (slide.images || []).forEach((image, index) => {
    const url = assetUrls[image.assetId];
    if (!url) return;
    const box =
      index === 0
        ? imageBox
        : draftStackedBox(imageBox, index, (slide.images || []).length);
    elements.push({
      id: `${deckDraftElementId(slideIndex, ["images", index])}/#picture`,
      type: "image",
      ...box,
      rotation: 0,
      order: (order += 1),
      src: url,
      alt: image.alt,
      imageFit: image.fit === "contain" ? "contain" : "cover",
      opacity: 1,
    });
  });

  if (titlePath) {
    elements.push({
      id: deckDraftElementId(slideIndex, titlePath),
      type: "text",
      ...titleBox,
      rotation: 0,
      order: (order += 1),
      text: draftTextAt(slide, titlePath) || "",
      fontSize: deckFontPoints("heading"),
      bold: true,
      align: placement.title?.align || "left",
      lineHeight: 1.12,
      opacity: 1,
      label: "标题",
    });
  }

  body.forEach((leaf, index) => {
    elements.push({
      id: deckDraftElementId(slideIndex, leaf.path),
      type: "text",
      ...draftStackedBox(contentBox, index, body.length),
      rotation: 0,
      order: (order += 1),
      text: leaf.value,
      fontSize: deckFontPoints("body-sm"),
      align: placement.content?.align || "left",
      lineHeight: 1.3,
      opacity: 1,
    });
  });

  return elements;
}

/** Load a draft into the editor's working model without touching any PPTX. */
export function deckDocumentFromDraft(
  project: DeckIrDocument,
  assetUrls: DeckDraftAssetUrls = {},
): DeckDocument {
  const master = createDeckMaster("ocean", "默认母版", "master-default");
  const slides: DeckSlide[] = project.slides.map((slide, index) => ({
    id: `draft-slide-${index + 1}`,
    title: slide.title || slide.quote?.attribution || `第 ${index + 1} 页`,
    body: slide.body || slide.subtitle || "",
    bullets: [...(slide.bullets || [])],
    notes: slide.note || "",
    layout: slide.layout,
    background: "",
    masterId: master.id,
    elements: draftSlideElements(slide, index, assetUrls),
  }));
  return {
    version: 2,
    title: project.title,
    aspect: "16:9",
    theme: "ocean",
    masters: [
      { ...master, accentColor: `#${project.theme.accent.toUpperCase()}` },
    ],
    slides: slides.length
      ? slides
      : [{ ...emptyDeckSlide(), masterId: master.id }],
  };
}

/**
 * Fold the edits back into the draft.
 *
 * Only text that came out of the draft goes back in, and only into the exact
 * field it came from. Anything the user added on the stage that the draft has
 * no room for is left where it is rather than guessed at — see
 * `deckDraftUnexpressibleEdits`, which is what tells the user about it.
 */
export function applyDeckDocumentToDraft(
  project: DeckIrDocument,
  deck: DeckDocument,
): DeckIrDocument {
  const next = structuredClone(project) as DeckIrDocument;
  const title = deck.title.trim();
  if (title && title !== next.title) next.title = title;
  for (const slide of deck.slides) {
    for (const element of slide.elements) {
      if (typeof element.text !== "string") continue;
      const address = deckDraftElementPath(element.id);
      if (!address) continue;
      const target = next.slides[address.slideIndex];
      if (!target) continue;
      setDraftTextAt(target, address.path, element.text);
    }
  }
  return next;
}

/**
 * Edits the stage accepted that the draft cannot hold, in plain language.
 *
 * The stage is a free canvas and the draft is a set of named regions, so the
 * two do not cover the same ground. Saying which edits fall through is the only
 * honest option: the alternative is a download that quietly differs from what
 * the user just spent ten minutes arranging.
 */
export function deckDraftUnexpressibleEdits(
  project: DeckIrDocument,
  deck: DeckDocument,
): string[] {
  const notes: string[] = [];
  const added = deck.slides.reduce(
    (total, slide) =>
      total +
      slide.elements.filter((element) => !deckDraftElementPath(element.id))
        .length,
    0,
  );
  if (added > 0) {
    notes.push(
      `这一版里有 ${added} 个自己加上去的元素（文字框、形状、图片等）。` +
        "这份演示文稿是按版式生成的，加上去的元素没有对应的位置，不会出现在下载到的文件里。",
    );
  }
  if (deck.slides.length !== project.slides.length) {
    notes.push(
      `编辑器里有 ${deck.slides.length} 页，这份演示文稿原本是 ${project.slides.length} 页。` +
        "增删页面暂时不会带到下载的文件里。",
    );
  }
  return notes;
}

export class DeckDraftAssetError extends Error {
  readonly code = "deck-draft-assets-missing";
  readonly assetIds: string[];

  constructor(assetIds: string[], detail = "") {
    super(
      `导出已中止：这份演示文稿里有 ${assetIds.length} 张图片取不回原图` +
        `（${assetIds.join("、")}）。` +
        "继续导出只会得到一份缺图的文件，所以没有生成。" +
        (detail ? `原因：${detail}。` : "") +
        "请重新打开这份素材再试一次，或先把图片重新上传。",
    );
    this.name = "DeckDraftAssetError";
    this.assetIds = assetIds;
  }
}

export type DeckDraftAssetLoader = (
  asset: DeckIrAsset,
  url: string,
) => Promise<Uint8Array>;

export interface DeckDraftExportOptions {
  assetUrls?: DeckDraftAssetUrls;
  loadAsset?: DeckDraftAssetLoader;
  timestamp?: string;
}

async function fetchDraftAssetBytes(
  _asset: DeckIrAsset,
  url: string,
): Promise<Uint8Array> {
  const blob = await fetchMediaBlob(url, { maxBytes: 24 * 1024 * 1024 });
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * The declared pictures, as bytes. Every one of them or none: the writer treats
 * a picture it was given no bytes for as an empty frame and carries on, which
 * is right for a batch run and wrong for someone who just pressed download.
 */
export async function resolveDeckDraftAssets(
  project: DeckIrDocument,
  options: DeckDraftExportOptions = {},
): Promise<DeckAssetBytes[]> {
  const declared = project.assets || [];
  if (!declared.length) return [];
  const urls = options.assetUrls || {};
  const load = options.loadAsset || fetchDraftAssetBytes;
  const resolved: DeckAssetBytes[] = [];
  const missing: string[] = [];
  const reasons: string[] = [];
  for (const asset of declared) {
    const url = urls[asset.id] || "";
    if (!url) {
      missing.push(asset.id);
      reasons.push(`${asset.id} 没有可用的图片地址`);
      continue;
    }
    try {
      const bytes = await load(asset, url);
      if (!bytes?.length) throw new Error("取回 0 字节");
      resolved.push({
        id: asset.id,
        bytes,
        width: asset.width,
        height: asset.height,
      });
    } catch (caught) {
      missing.push(asset.id);
      reasons.push(
        `${asset.id} ${caught instanceof Error ? caught.message : "取图失败"}`,
      );
    }
  }
  if (missing.length) throw new DeckDraftAssetError(missing, reasons.join("；"));
  return resolved;
}

/** The production writer, called with exactly what the production line calls it with. */
export async function buildDeckDraftPptxBytes(
  project: DeckIrDocument,
  options: DeckDraftExportOptions = {},
): Promise<Uint8Array> {
  const assets = await resolveDeckDraftAssets(project, options);
  const { bytes } = buildDeckPptx(project, {
    assets,
    ...(options.timestamp ? { timestamp: options.timestamp } : {}),
  });
  return bytes;
}

export async function buildDeckDraftPptxBlob(
  project: DeckIrDocument,
  options: DeckDraftExportOptions = {},
): Promise<Blob> {
  const bytes = await buildDeckDraftPptxBytes(project, options);
  return new Blob([bytes as unknown as BlobPart], {
    type: DECK_SOURCE_MEDIA_TYPE,
  });
}

function boundedLoadKey(parts: readonly unknown[]): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(parts) || "";
  } catch {
    return "unserializable";
  }
  return serialized.length <= 8192
    ? serialized
    : `${serialized.length}:${serialized.slice(0, 8192)}`;
}

/**
 * Everything the load effect reads out of `item` and `previewContent`, flattened
 * into one string. Keying the effect on the value rather than on the object
 * identity is what makes a caller that rebuilds either one every render
 * harmless.
 */
export function deckSourceLoadKey(
  item: LibraryItem,
  previewContent?: unknown,
): string {
  return boundedLoadKey([
    item.id,
    item.key,
    item.title,
    item.url || "",
    item.previewUrl || "",
    deckProjectUrlFor(item),
    deckDeliveryUrlFor(item),
    // `loadDeck` picks the unpacker by extension, so the format hints are load
    // inputs too: leaving them out turns "reloads too often" into "never
    // reloads when the same address is re-typed as another format".
    officeExtensionForItem(item),
    item.meta.source_format ?? "",
    item.meta.format ?? "",
    initialSource(item, previewContent),
  ]);
}

/**
 * Name the step that failed and the way out. A bare「演示文稿读取失败」tells the
 * user nothing they can act on, and an endless mask tells them even less.
 *
 * Every way out named here has to be one the deck surface really offers.
 * `DeckStage` now renders `EditorSourceFailurePanel` on `sourceFailed`, so the
 * retry button behind `reload()` is real; reopening always is. Local upload
 * stays unnamed on purpose: the deck upload slot takes `image/*` only
 * (`DeckRoute.tsx`) and silently skips a PPTX the user picks, and naming an
 * action the UI refuses is the same defect as naming a button that does not exist.
 */
export function deckSourceFailureMessage(
  caught: unknown,
  translate: (value: string) => string,
): string {
  const detail =
    caught instanceof Error ? translate(caught.message).trim() : "";
  const head = translate("没能读到这份演示文稿的源文件，现在停在一份空白稿上。");
  const tail = translate("点「重新载入」再试一次，或关掉这份素材重新打开。");
  return detail ? `${head}原因：${detail}。${tail}` : `${head}${tail}`;
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
  const [sourceFailed, setSourceFailed] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
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
    preview?: PreparedPreviewUpload;
  } | null>(null);
  const workingHeadUrlRef = useRef(
    deckProjectUrlFor(item) || item.previewUrl || "",
  );
  /**
   * The draft this deck was built from, when it has one. Pinned rather than
   * kept in state: nothing on screen depends on it, and the user is never told
   * it exists.
   */
  const draftRef = useRef<DeckDraftState | null>(null);
  const canvasElementRef = useRef<HTMLElement | null>(null);

  /**
   * The caller hands these in fresh on every render. Reading them through refs
   * is what keeps them out of the load effect's dependency array — with them in
   * it, every render restarted the load and the mask never came down.
   */
  const sourceAccessErrorRef = useRef(onSourceAccessError);
  useEffect(() => {
    sourceAccessErrorRef.current = onSourceAccessError;
  }, [onSourceAccessError]);
  const notifySourceAccessError = useCallback(() => {
    sourceAccessErrorRef.current?.();
  }, []);
  const loadInputRef = useRef({ item, previewContent });
  useEffect(() => {
    loadInputRef.current = { item, previewContent };
  }, [item, previewContent]);
  // `tt` is memoized today, but it is a provider-owned function: one unmemoized
  // locale provider would re-arm the very loop this file exists to kill.
  const translateRef = useRef(tt);
  useEffect(() => {
    translateRef.current = tt;
  }, [tt]);
  const translate = useCallback(
    (value: string) => translateRef.current(value),
    [],
  );
  const loadKey = useMemo(
    () => deckSourceLoadKey(item, previewContent),
    [item, previewContent],
  );

  useEffect(() => {
    const source = loadInputRef.current.item;
    const sourcePreview = loadInputRef.current.previewContent;
    mountedRef.current = true;
    const abort = new AbortController();
    setLoading(true);
    setDirty(false);
    setSavedUrl("");
    setError("");
    setSourceFailed(false);
    setNotice("");
    revisionRef.current = 0;
    persistedItemRef.current = source;
    preparedSaveRef.current = null;
    draftRef.current = null;
    workingHeadUrlRef.current =
      deckProjectUrlFor(source) || source.previewUrl || "";
    void loadDeck(source, sourcePreview, abort.signal, notifySourceAccessError)
      .then((loaded) => {
        if (abort.signal.aborted) return;
        const next = loaded.deck;
        draftRef.current = loaded.draft;
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
          setSourceFailed(true);
          setError(deckSourceFailureMessage(caught, translate));
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => {
      mountedRef.current = false;
      abort.abort();
    };
  }, [loadKey, notifySourceAccessError, reloadNonce, translate]);

  const reload = useCallback(() => {
    setReloadNonce((value) => value + 1);
  }, []);

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
          // deck-extension.md §4 — the 16 carrier grammars are placed from the
          // §2.2 EMU grid instead of the pre-contract hand-tuned percentages.
          if (deckLayoutIsCarrierGrammar(layout)) {
            const placement = deckCarrierPlacement(layout);
            return {
              ...slide,
              layout,
              elements: slide.elements.map((element) => {
                if (element.locked) return element;
                if (element.type === "image" && placement.image) {
                  return { ...element, ...placement.image };
                }
                if (element.id === titleId && placement.title) {
                  const { fontSize, align, ...box } = placement.title;
                  return { ...element, ...box, fontSize, align };
                }
                if (contentIds.has(element.id) && placement.content) {
                  const { fontSize, align, ...box } = placement.content;
                  return { ...element, ...box, fontSize, align };
                }
                return element;
              }),
            };
          }
          // `blank` returned above and the 16 §4 grammars took the carrier
          // branch, so `title-body` is the only grammar still placed from the
          // pre-contract percentages. The annotation is the guard: adding a
          // third legacy grammar to `DeckLayout` fails here instead of silently
          // inheriting the title-body geometry.
          const titleBody: Exclude<DeckLegacyLayout, "blank"> = layout;
          return {
            ...slide,
            layout: titleBody,
            elements: slide.elements.map((element) => {
              if (element.locked) return element;
              if (element.id === titleId) {
                return {
                  ...element,
                  x: 8,
                  y: 13,
                  width: 84,
                  height: 14,
                  align: "left" as const,
                };
              }
              if (contentIds.has(element.id)) {
                return {
                  ...element,
                  x: 8,
                  y: 33,
                  width: 84,
                  height: 50,
                  align: "left" as const,
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

  /**
   * One PPTX out of the current edit.
   *
   * A deck with a draft behind it goes out through the writer the production
   * line uses, so the file the user gets is the file the line would have made.
   * Everything else keeps the old route, which is all a bare PPTX has.
   */
  const buildDelivery = useCallback(
    async (
      snapshot: DeckDocument,
    ): Promise<{ blob: Blob; notes: string[] }> => {
      const draft = draftRef.current;
      if (!draft) {
        return { blob: await buildDeckPptxBlob(snapshot), notes: [] };
      }
      const project = applyDeckDocumentToDraft(draft.project, snapshot);
      return {
        blob: await buildDeckDraftPptxBlob(project, {
          assetUrls: draft.assetUrls,
        }),
        notes: deckDraftUnexpressibleEdits(draft.project, snapshot),
      };
    },
    [],
  );

  const exportPptx = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    setError("");
    try {
      const { blob, notes } = await buildDelivery(deckRef.current);
      downloadBlob(`${deckRef.current.title || "演示文稿"}.pptx`, blob);
      setNotice(
        [tt("PPTX 已导出，可在 PowerPoint 或兼容软件中继续使用"), ...notes].join(
          "；",
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tt("PPTX 导出失败"));
    } finally {
      if (mountedRef.current) setExporting(false);
    }
  }, [buildDelivery, exporting, tt]);

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
      const draft = draftRef.current;
      const savedProject = draft
        ? applyDeckDocumentToDraft(draft.project, snapshot)
        : null;
      const result = await saveFileToLibrary({
        item: baseItem,
        siteId,
        fallbackSite: "ppt",
        createFile: async () => {
          const { blob } = await buildDelivery(snapshot);
          return new File([blob], `${fileStem}.pptx`, {
            type: DECK_SOURCE_MEDIA_TYPE,
          });
        },
        // pptx can never satisfy the backend's displayable-primary assertion,
        // so the deck ships its own first-slide cover alongside the delivery.
        createPreview: () => renderDeckPreviewPng(snapshot),
        sourceFormat: DECK_SOURCE_FORMAT,
        sourceMediaType: DECK_SOURCE_MEDIA_TYPE,
        title,
        mediaType: "ppt",
        kind: "deck",
        idempotencyKey: saveKey,
        workingHeadUrl: workingHeadUrlRef.current,
        preparedProject: prepared?.project,
        preparedDelivery: prepared?.delivery,
        preparedPreview: prepared?.preview,
        meta: {
          editor: "deck-editor",
          editor_capability: "deck-editor",
          content_type: "deck",
          representation: DECK_SOURCE_FORMAT,
          slides: snapshot.slides.length,
          aspect: snapshot.aspect,
          theme: snapshot.theme,
          deck_version: snapshot.version,
          // The draft declares its pictures by id and carries no address, so
          // the addresses have to be kept beside it or the next person to open
          // this deck cannot export it.
          ...(draft ? { deck_asset_urls: draft.assetUrls } : {}),
        },
        project: {
          schema: DECK_PROJECT_SCHEMA,
          data: savedProject || snapshot,
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
          result.preparedProject ||
          result.preparedDelivery ||
          result.preparedPreview
            ? {
                key: saveKey,
                project: result.preparedProject,
                delivery: result.preparedDelivery,
                preview: result.preparedPreview,
              }
            : preparedSaveRef.current;
        throw new Error(
          result.error || artifactSaveStepMessage("revision-publish", ""),
        );
      }
      preparedSaveRef.current = null;
      if (draft && savedProject) {
        draftRef.current = { ...draft, project: savedProject };
      }
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
        setError(
          caught instanceof Error
            ? artifactSaveStepMessage("revision-publish", caught.message)
            : artifactSaveStepMessage("revision-publish", caught),
        );
      }
      return null;
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }, [buildDelivery, siteId, tt]);

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
    sourceFailed,
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
    reload,
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
