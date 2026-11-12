"use client";

import type { AdvancedEditorDraftAdapter } from "../advanced-editor-adapter";
import type { AdvancedFlushResult } from "../advanced-session-context";
import { ADVANCED_DRAFT_META_KEY, type AdvancedDraftPointer } from "../advanced-draft";
import { DECK_DRAFT_SCHEMA, deckDocumentFromWorkingDraft, loadDeckServerDraft } from "../advanced-draft-deck";
import { unzipSync } from "fflate";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { fetchMediaBlob } from "../../lib/media-proxy";
import type { LibraryItem } from "../library-data";
import type { WorkbenchMaterialPlacement } from "../workbench-material-provider";
import { officeExtensionForItem } from "../workbench-routes";
import { deckRebase } from "../collab/adapters/deck";
import { getArtifactItem } from "../artifact-client";
import { deckExistingVersion, deckSaveBaseItem, isDeckOwnSaveEcho } from "./deck-save-echo";
import {
  recordUserMutation,
  userEditItemKey,
  userMutationGeneration,
} from "../user-edit-session";
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
  type DeckMaster,
  type DeckSlide,
  type DeckThemeId,
} from "./deck-schema";
import {
  blobToDataUrl,
  downloadBlob,
  saveFileToLibrary,
  urlExtension,
  type PreparedDeliveryUpload,
  type PreparedPreviewUpload,
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
import { deckPptxTextRuns } from "./deck-text-format";
import { AUTOSAVE_ERROR_NETWORK } from "../../lib/auth/autosave-error-message";
import { importPptxDeck } from "./pptx-deck-import";
import {
  fetchValidatedOfficePackage,
  notifyOfficeAccessDenied,
  validateOfficePackageBlob,
} from "./office-file";

interface Snapshot {
  deck: DeckDocument;
  activeId: string;
  selectedElementId: string;
}

export interface DeckEditorState {
  item: LibraryItem;
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
  /** Canvas in-place text editing; not part of the save path. */
  textEditingElementId: string;
  beginTextEditing: (elementId: string) => void;
  endTextEditing: () => void;
  setCanvasElement: (element: HTMLElement | null) => void;
  addSlide: () => void;
  duplicateSlide: () => void;
  deleteSlide: () => void;
  moveSlide: (direction: -1 | 1) => void;
  undo: () => void;
  redo: () => void;
  /** Re-run the source load for the same item after a failure. */
  reload: () => void;
  /** 用本地上传的 PPTX 顶掉当前演示文稿（.ppt/.odp 由调用方先归一化成 pptx）。 */
  importSource: (file: File) => Promise<void>;
  draft: AdvancedEditorDraftAdapter;
  flushBeforeExport: () => Promise<void>;
  persistInBackground: () => void;
  exportPptx: () => Promise<void>;
  save: () => Promise<PersistedEditorVersion | null>;
  restoreRecovery: (payload: unknown, updatedAt?: number) => boolean;
  /**
   * 多人同改：把别人的最新状态套进编辑器。保住本人的选中页 / 选中元素、撤销栈（别人的改动同时套进栈里的旧快照，
   * 本地撤销不会撤掉别人的改动）；本人正在拖动的那一手保留。不触发本地的「新一步」历史。
   */
  applyRemoteDeck: (next: DeckDocument) => void;
  /** 多人同改：别人保存了新版本（AI / 专业模式）。读出该版本的文稿并把本地「已保存的基线」换成它；读不到返回 null。 */
  adoptExternalRevision: (artifactId: string, revisionId: string) => Promise<DeckDocument | null>;
  /** 多人同改里只能看（浏览者，或别人在专业模式编辑）：画布不让拖动、不进文字编辑。 */
  readOnly: boolean;
  /** 多人同改：这一版已被房间里的存档人落库，清掉「未保存」。 */
  markCollabSaved: () => void;
}

/**
 * 放映态看得到的全部东西。
 *
 * `DeckEditorState` 有 47 个成员，其中三十来个会改文档。演讲者模式一个都不需要：
 * 它只读当前这份 deck，从哪一页开始。**窄到这个程度是判据，不是风格**——
 * 放映视图拿不到写操作，就不可能在放映途中改坏用户的文稿。
 *
 * 翻页不在这里：那是放映自己的状态（`use-deck-presenter.ts`），
 * 与编辑器选中哪一页是两件事。讲者跳到第 12 页不该把编辑器的选中跟着拖走。
 */
export interface DeckPresentationSource {
  readonly deck: DeckDocument;
  readonly startIndex: number;
}

export function deckPresentationSource(
  editor: Pick<DeckEditorState, "deck" | "activeIndex">,
): DeckPresentationSource {
  return { deck: editor.deck, startIndex: editor.activeIndex };
}

const HISTORY_LIMIT = 60;
export const DECK_SOURCE_FORMAT = "pptx";
export const DECK_SOURCE_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

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
      value === "application/json" ||
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

/** Download/source handoff never selects the JSON editor project. */
export function deckDeliveryUrlFor(item: LibraryItem): string {
  const artifactSource = item.artifact?.renditions.source;
  const candidates: Array<{ url: unknown; hints: unknown[] }> = [
    // `useOfficeArtifactSource` writes the freshly re-signed source/full URL
    // here. The artifact projection can still contain the catalog URL that
    // was signed five minutes ago, so it must be the fallback rather than the
    // first candidate.
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
  ];
  for (const candidate of candidates) {
    const url = httpUrl(candidate.url);
    if (!url) continue;
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
  const meta = { ...base.meta };
  for (const key of Object.keys(meta)) {
    if (key.startsWith("editor_project_") || key.startsWith("editor_manifest") ||
        key.startsWith("editor_working_head") || key === "deck_asset_urls") delete meta[key];
  }
  return {
    ...base,
    title: saved.title || base.title,
    url: saved.url,
    kind: "ppt",
    artifactId: saved.artifactId || base.artifactId,
    revisionId: saved.revisionId || base.revisionId,
    artifactType: "deck",
    meta: {
      ...meta,
      source_format: DECK_SOURCE_FORMAT,
      source_media_type: DECK_SOURCE_MEDIA_TYPE,
      source_url: saved.url,
      format: DECK_SOURCE_FORMAT,
      mime: DECK_SOURCE_MEDIA_TYPE,
      delivery_format: DECK_SOURCE_FORMAT,
      file_name: saved.fileName || `${saved.title || base.title || "deck"}.pptx`,
      representation: DECK_SOURCE_FORMAT,
      editor_saved_at: saved.savedAt,
      ...(saved.previousRevisionId
        ? { previous_revision_id: saved.previousRevisionId }
        : {}),
    },
  };
}

interface DeckLoad {
  serverDraft?: AdvancedDraftPointer;
  deck: DeckDocument;
}

async function loadDeck(
  item: LibraryItem,
  previewContent?: unknown,
  signal?: AbortSignal,
  onSourceAccessError?: () => void,
): Promise<DeckLoad> {
  const serverDraft = await loadDeckServerDraft(item, signal);
  if (serverDraft) return serverDraft;
  const deliveryUrl = deckDeliveryUrlFor(item);
  if (!deliveryUrl) throw new Error("没有可读取的 PPTX 文件，请上传 PPTX 后重试。");
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
        item,
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
  const contentTypes = new TextDecoder().decode(archive["[Content_Types].xml"]);
  const normalizePart = (value: string): string => {
    const parts: string[] = [];
    for (const segment of value.replace(/^\//, "").split("/")) {
      if (!segment || segment === ".") continue;
      if (segment === "..") parts.pop();
      else parts.push(segment);
    }
    return parts.join("/");
  };
  const overrideParts = Array.from(
    contentTypes.matchAll(/<Override\b[^>]*\bPartName="([^"]+)"/g),
  ).map((match) => normalizePart(match[1]));
  const missingOverrides = overrideParts.filter((part) => !archive[part]?.length);
  if (missingOverrides.length) {
    throw new Error(
      `PPTX 交付声明了不存在的部件：${missingOverrides.join(", ")}`,
    );
  }
  for (const [path, bytes] of Object.entries(archive)) {
    if (!path.endsWith(".rels")) continue;
    const xml = new TextDecoder().decode(bytes);
    for (const match of xml.matchAll(
      /<Relationship\b([^>]*?)\bTarget="([^"]+)"([^>]*)\/>/g,
    )) {
      const attributes = `${match[1]} ${match[3]}`;
      if (/\bTargetMode="External"\b/i.test(attributes)) continue;
      const target = match[2].split("#", 1)[0];
      if (/^[a-z][a-z\d+.-]*:/i.test(target)) continue;
      const owner = path.startsWith("_rels/")
        ? ""
        : path.slice(0, -5).replace(/\/_rels\/[^/]+$/, "");
      const targetPath = normalizePart(`${owner}/${target}`);
      if (!archive[targetPath]?.length) {
        throw new Error(`PPTX 交付关系指向不存在的部件：${path} -> ${target}`);
      }
    }
  }
  const slideCount = Object.keys(archive).filter((path) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(path),
  ).length;
  if (slideCount !== Math.max(1, expectedSlideCount)) {
    throw new Error("PPTX 交付页数与结构化工程不一致");
  }
}

/**
 * PPTX 写出器按需载入。只缓存成功的那次：断网时载入失败若被缓存，恢复网络后点「重试」
 * 还是同一个失败（10-23 W07 实测）。编辑器载入完成后会先预热一次（`warmDeckPptxWriter`）。
 */
let pptxWriterModule: Promise<typeof import("pptxgenjs")> | null = null;
export function warmDeckPptxWriter(): Promise<typeof import("pptxgenjs")> {
  if (!pptxWriterModule) {
    pptxWriterModule = import("pptxgenjs").catch((caught: unknown) => {
      pptxWriterModule = null;
      throw caught;
    });
  }
  return pptxWriterModule;
}

/** 断网、分包载不下来：给人话（与顶栏同一句），不把内部路径甩给用户。 */
export function deckSaveFailureMessage(caught: unknown): string | null {
  const message = caught instanceof Error ? caught.message : String(caught ?? "");
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return offline ||
    /chunk|failed to fetch|networkerror|load failed|network-error/i.test(message)
    ? AUTOSAVE_ERROR_NETWORK
    : null;
}

export async function buildDeckPptxBlob(deck: DeckDocument): Promise<Blob> {
  const { default: PptxGenJS } = await warmDeckPptxWriter();
  const pinnedDeck = cloneDeckDocument(deck);
  const pptx = new PptxGenJS();
  pptx.layout =
    pinnedDeck.aspect === "4:3" ? "LAYOUT_4x3" : "LAYOUT_WIDE";
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
          slide.addText(deckPptxTextRuns(element.text || "", element), {
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
  _previewContent?: unknown,
): string {
  return boundedLoadKey([
    item.id,
    item.key,
    item.title,
    item.url || "",
    item.previewUrl || "",
    deckDeliveryUrlFor(item),
    item.meta[ADVANCED_DRAFT_META_KEY] ?? null,
    // `loadDeck` picks the unpacker by extension, so the format hints are load
    // inputs too: leaving them out turns "reloads too often" into "never
    // reloads when the same address is re-typed as another format".
    officeExtensionForItem(item),
    item.meta.source_format ?? "",
    item.meta.format ?? "",
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
export type DeckUserEditOrigin = "local-history" | "remote-collab" | "load";

/**
 * Native-deck person-write choke. History commit / gesture / undo / redo
 * record; remote collab merge and load do not.
 */
export function applyDeckUserEditSession(
  item: { key?: string; id?: string } | null | undefined,
  origin: DeckUserEditOrigin,
): number {
  const key = userEditItemKey(item);
  if (origin !== "local-history") return userMutationGeneration(key);
  return recordUserMutation(key);
}

/** Same helper `commit` / `endGesture` call after a real document inequality. */
export function applyDeckHistoryWriteIfChanged(
  item: { key?: string; id?: string } | null | undefined,
  before: DeckDocument,
  after: DeckDocument,
): number {
  if (deckDocumentsEqual(after, before)) {
    return userMutationGeneration(userEditItemKey(item));
  }
  return applyDeckUserEditSession(item, "local-history");
}

export function deckSourceFailureMessage(
  caught: unknown,
  translate: (value: string) => string,
): string {
  const detail =
    caught instanceof Error
      ? translate(caught.message).replace(/\bHTTP\s+\d{3}\b/gi, "文件服务器暂时无法提供内容").trim()
      : "";
  const head = translate("没能读到这份演示文稿。");
  const tail = translate("点「重新载入」再试一次，或关掉这份素材重新打开。");
  return detail ? `${head}原因：${detail}。${tail}` : `${head}${tail}`;
}

export function useDeckEditor(
  item: LibraryItem,
  siteId = "",
  previewContent?: unknown,
  onSourceAccessError?: () => void,
  /**
   * 多人同改：`readOnly` = 浏览者、或别人在专业模式编辑——一切改文档的入口都不动作；
   * `onSaved` = 存成功后告诉房间这一版已落库（新版本 id）。
   */
  collab?: { readOnly?: boolean; onSaved?: (revisionId: string) => void },
): DeckEditorState {
  const tt = useUI();
  const readOnlyRef = useRef(Boolean(collab?.readOnly));
  readOnlyRef.current = Boolean(collab?.readOnly);
  const onSavedRef = useRef(collab?.onSaved);
  onSavedRef.current = collab?.onSaved;
  const initial = useMemo(
    () => normalizeDeckDocument(null, item.title),
    [item.title],
  );
  const [deck, setDeckState] = useState(initial);
  const [activeId, setActiveId] = useState(initial.slides[0].id);
  const [selectedElementId, setSelectedElementId] = useState("");
  const [textEditingElementId, setTextEditingElementId] = useState("");
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
  const textEditingRef = useRef(textEditingElementId);
  textEditingRef.current = textEditingElementId;
  const undoRef = useRef<Snapshot[]>([]);
  const redoRef = useRef<Snapshot[]>([]);
  const gestureRef = useRef<Snapshot | null>(null);
  const mountedRef = useRef(true);
  const revisionRef = useRef(0);
  const savingRef = useRef(false);
  const sourceFailedRef = useRef(false);
  const sourceLoadingRef = useRef(true);
  const serverDraftRef = useRef<AdvancedDraftPointer | null>(null);
  const exportFlushRef = useRef<(() => Promise<AdvancedFlushResult>) | null>(null);
  const bindDraftFlush = useCallback((flush: (() => Promise<AdvancedFlushResult>) | null) => { exportFlushRef.current = flush; }, []);
  const flushBeforeExport = useCallback(async () => {
    const result = await exportFlushRef.current?.();
    if (result && !result.ok) throw new Error(result.error || "保存版本失败，请重试后导出");
  }, []);
  const persistedItemRef = useRef(item);
  /** Revisions this editor committed since the last real load (`deck-save-echo.ts`). */
  const ownSavedRevisionsRef = useRef<Set<string>>(new Set());
  /** Receipt of the last commit; a re-flush of the same edit returns it instead of a duplicate revision. */
  const lastSavedRef = useRef<{ editRevision: number; item: LibraryItem; version: PersistedEditorVersion } | null>(null);
  const preparedSaveRef = useRef<{
    key: string;
    delivery?: PreparedDeliveryUpload;
    preview?: PreparedPreviewUpload;
  } | null>(null);
  const workingHeadUrlRef = useRef(
    deckDeliveryUrlFor(item),
  );

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
  const rawLoadKey = useMemo(
    () => deckSourceLoadKey(item, previewContent),
    [item, previewContent],
  );
  // 宿主把本编辑器刚存的那一版传回来不算换文稿：不重载（重载会拿旧基线再存一次）。
  const loadKeyRef = useRef(rawLoadKey);
  if (
    rawLoadKey !== loadKeyRef.current &&
    !isDeckOwnSaveEcho(item, persistedItemRef.current, ownSavedRevisionsRef.current)
  ) {
    loadKeyRef.current = rawLoadKey;
  }
  const loadKey = loadKeyRef.current;

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
    sourceFailedRef.current = false;
    sourceLoadingRef.current = true;
    serverDraftRef.current = null;
    setNotice("");
    revisionRef.current = 0;
    persistedItemRef.current = source;
    ownSavedRevisionsRef.current = new Set();
    lastSavedRef.current = null;
    preparedSaveRef.current = null;
    workingHeadUrlRef.current =
      deckDeliveryUrlFor(source);
    void loadDeck(source, sourcePreview, abort.signal, notifySourceAccessError)
      .then((loaded) => {
        if (abort.signal.aborted) return;
        const next = loaded.deck;
        serverDraftRef.current = loaded.serverDraft || null;
        if (loaded.serverDraft) {
          revisionRef.current = typeof loaded.serverDraft.editRevision === "number" ? loaded.serverDraft.editRevision : 1;
          setDirty(true);
          applyDeckUserEditSession(source, "load");
        }
        deckRef.current = next;
        const existingVersion = deckExistingVersion(source, deckDeliveryUrlFor(source) || source.url || "", "");
        if (existingVersion && !loaded.serverDraft) lastSavedRef.current = { editRevision: revisionRef.current, item: source, version: existingVersion };
        activeRef.current = next.slides[0].id;
        selectedElementRef.current = "";
        setDeckState(next);
        setActiveId(next.slides[0].id);
        setSelectedElementId("");
        setTextEditingElementId("");
        undoRef.current = [];
        redoRef.current = [];
        gestureRef.current = null;
        if (next.importWarnings?.length) {
          setNotice(next.importWarnings.join("；"));
        }
        // 保存要用的写出器趁在线先载好，断网时改动仍能在恢复后一次存上。
        void warmDeckPptxWriter().catch(() => undefined);
        setHistoryRevision((value) => value + 1);
      })
      .catch((caught) => {
        if (!abort.signal.aborted) {
          setSourceFailed(true);
          sourceFailedRef.current = true;
          setError(deckSourceFailureMessage(caught, translate));
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) { sourceLoadingRef.current = false; setLoading(false); }
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
    setTextEditingElementId("");
    setHistoryRevision((revision) => revision + 1);
  }, []);

  const commit = useCallback(
    (update: (current: DeckDocument) => DeckDocument, nextActive?: string) => {
      // 载入完成前画布上是占位稿：改了会被真文稿顶掉，却照样报「已保存」（10-23 W07 实测）。
      if (readOnlyRef.current || sourceLoadingRef.current) return false;
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
      applyDeckHistoryWriteIfChanged(persistedItemRef.current, base.deck, next);
      setHistoryRevision((value) => value + 1);
      return true;
    },
    [snapshot],
  );

  const applyTransient = useCallback(
    (update: (current: DeckDocument) => DeckDocument) => {
      if (readOnlyRef.current || sourceLoadingRef.current) return false;
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
    if (readOnlyRef.current || sourceLoadingRef.current) return;
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
    applyDeckHistoryWriteIfChanged(
      persistedItemRef.current,
      base.deck,
      deckRef.current,
    );
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

  const selectElement = useCallback((id: string) => {
    selectedElementRef.current = id;
    setSelectedElementId(id);
    setTextEditingElementId((current) => (current === id ? current : ""));
  }, []);

  const beginTextEditing = useCallback((elementId: string) => {
    if (readOnlyRef.current) return;
    if (!elementId) return;
    selectedElementRef.current = elementId;
    setSelectedElementId(elementId);
    setTextEditingElementId(elementId);
  }, []);

  const endTextEditing = useCallback(() => {
    setTextEditingElementId("");
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
    setTextEditingElementId("");
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

  const applyRemoteDeck = useCallback((incoming: DeckDocument) => {
    const current = deckRef.current;
    const gesture = gestureRef.current;
    // 没有进行中的手势时，当前文稿就是「应用前」的基线；拖动中以手势开始时的文稿为基线，
    // 这样别人的变化 = 基线 → incoming，本人这一手 = 基线 → 此刻。
    const before = gesture ? gesture.deck : current;
    const remote = cloneDeckDocument(incoming);
    const next = gesture ? deckRebase(remote, gesture.deck, current) : remote;
    if (deckDocumentsEqual(next, current)) return;
    const rebaseSnapshot = (value: Snapshot): Snapshot => {
      const rebased = deckRebase(value.deck, before, remote);
      return rebased === value.deck ? value : { ...value, deck: rebased };
    };
    undoRef.current = undoRef.current.map(rebaseSnapshot);
    redoRef.current = redoRef.current.map(rebaseSnapshot);
    if (gesture) gestureRef.current = rebaseSnapshot(gesture);
    // 选中页：还在就留着；被别人删了就落到原来位置附近的页
    let active = activeRef.current;
    if (!next.slides.some((slide) => slide.id === active)) {
      const oldIndex = current.slides.findIndex((slide) => slide.id === active);
      active = next.slides[Math.min(Math.max(oldIndex, 0), next.slides.length - 1)]?.id || next.slides[0].id;
    }
    const activeSlide = next.slides.find((slide) => slide.id === active);
    const selected = activeSlide?.elements.some((element) => element.id === selectedElementRef.current)
      ? selectedElementRef.current
      : "";
    deckRef.current = next;
    activeRef.current = active;
    selectedElementRef.current = selected;
    setDeckState(next);
    setActiveId(active);
    setSelectedElementId(selected);
    if (
      textEditingRef.current &&
      !activeSlide?.elements.some((element) => element.id === textEditingRef.current)
    ) {
      setTextEditingElementId("");
    }
    // 别人的改动让这份文稿和库里最近一版不同：存档人要存，所以记一次未保存（只在存档人那里真的会存）。
    revisionRef.current += 1;
    setDirty(true);
    applyDeckUserEditSession(persistedItemRef.current, "remote-collab");
    setHistoryRevision((value) => value + 1);
  }, []);

  const adoptExternalRevision = useCallback(
    async (artifactId: string, revisionId: string): Promise<DeckDocument | null> => {
      try {
        const result = await getArtifactItem(artifactId, revisionId);
        const revisionItem = (result as { data?: LibraryItem }).data;
        if (!revisionItem) return null;
        const loaded = await loadDeck(revisionItem, undefined, undefined, undefined);
        persistedItemRef.current = revisionItem;
        workingHeadUrlRef.current = deckDeliveryUrlFor(revisionItem);
        preparedSaveRef.current = null;
        return loaded.deck;
      } catch {
        return null;
      }
    },
    [],
  );

  const markCollabSaved = useCallback(() => {
    setDirty(false);
  }, []);

  const undo = useCallback(() => {
    if (readOnlyRef.current) return;
    const previous = undoRef.current.pop();
    if (!previous) return;
    redoRef.current.push(snapshot());
    applySnapshot(previous);
    revisionRef.current += 1;
    setDirty(true);
    applyDeckUserEditSession(persistedItemRef.current, "local-history");
    setSavedUrl("");
  }, [applySnapshot, snapshot]);

  const redo = useCallback(() => {
    if (readOnlyRef.current) return;
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(snapshot());
    applySnapshot(next);
    revisionRef.current += 1;
    setDirty(true);
    applyDeckUserEditSession(persistedItemRef.current, "local-history");
    setSavedUrl("");
  }, [applySnapshot, snapshot]);

  const buildDelivery = useCallback(async (snapshot: DeckDocument) => ({
    blob: await buildDeckPptxBlob(snapshot), notes: [] as string[],
  }), []);

  const exportPptx = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    setError("");
    try {
      await flushBeforeExport();
      const { blob, notes } = await buildDelivery(deckRef.current);
      // 标题常带着上传时的扩展名（「x.pptx」）：不再补成「x.pptx.pptx」（W01 实测）。
      downloadBlob(`${(deckRef.current.title || "演示文稿").replace(/\.(?:pptx?|odp|key)$/i, "")}.pptx`, blob);
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
  }, [buildDelivery, exporting, flushBeforeExport, tt]);

  const save = useCallback(async (): Promise<PersistedEditorVersion | null> => {
    if (savingRef.current || sourceFailedRef.current || sourceLoadingRef.current) return null;
    const savingRevision = revisionRef.current;
    // 外壳（会话补记、重试）可能对同一次改动再要一次保存：没有新改动就交回上次的回执（D11 §5.5）。
    const lastSaved = lastSavedRef.current;
    if (lastSaved && lastSaved.editRevision === savingRevision && lastSaved.item === persistedItemRef.current) {
      return lastSaved.version;
    }
    const snapshot = cloneDeckDocument(deckRef.current);
    const baseItem = deckSaveBaseItem(persistedItemRef.current);
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
          const { blob: delivery } = await buildDelivery(snapshot);
          return new File([delivery], `${fileStem}.pptx`, {
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
          result.preparedDelivery ||
          result.preparedPreview
            ? {
                key: saveKey,
                delivery: result.preparedDelivery,
                preview: result.preparedPreview,
              }
            : preparedSaveRef.current;
        throw new Error(
          result.error || artifactSaveStepMessage("revision-publish", ""),
        );
      }
      preparedSaveRef.current = null;
      const handoff = deckSavedItemForHandoff(
        result.item || baseItem,
        result,
      );
      persistedItemRef.current = handoff;
      for (const id of [result.revisionId, result.versionId, handoff.revisionId]) {
        const saved = String(id || "");
        if (saved && saved !== baseRevision && saved !== rootId) ownSavedRevisionsRef.current.add(saved);
      }
      workingHeadUrlRef.current =
        result.url;
      if (mountedRef.current) {
        setSavedUrl(result.url);
        if (revisionRef.current === savingRevision) {
          setDirty(false);
        }
        setNotice("");
      }
      const savedRevisionId = String(handoff.revisionId || result.versionId || "");
      if (savedRevisionId) onSavedRef.current?.(savedRevisionId);
      const version: PersistedEditorVersion = {
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
          };
      lastSavedRef.current = { editRevision: savingRevision, item: handoff, version };
      return version;
    } catch (caught) {
      // Keep the in-memory deck, dirty flag, and reusable upload receipts.
      // A failed publish must not discard the page the user just edited.
      if (mountedRef.current) {
        const network = deckSaveFailureMessage(caught);
        setError(
          network
            ? tt(network)
            : caught instanceof Error
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

  /**
   * 本地上传的演示文稿接进编辑器。
   *
   * 只认 PPTX 包：`.ppt`/`.odp` 这些先由路由走后端转换端点归一化成 pptx 再进来，
   * 前端不加第二个解析器。包坏了、根本不是 OOXML 包，`validateOfficePackageBlob`
   * 会带着诊断码抛出来，用户看到的是原因而不是一个空白编辑器。
   */
  const importSource = useCallback(
    async (file: File) => {
      // 只能查看：不解析、不提示「已接进编辑器」（commit 本来也会拒绝，但那样会留一句假的成功提示）
      if (readOnlyRef.current) return;
      setError("");
      try {
        const bytes = await validateOfficePackageBlob(file, "pptx");
        const fallbackTitle =
          file.name.replace(/\.[^.]+$/, "") || item.title || "演示文稿";
        const next = await importPptxDeck(bytes, fallbackTitle, "pptx");
        if (!mountedRef.current) return;
        commit(() => next, next.slides[0].id);
        setNotice(tt("已把上传的演示文稿接进编辑器，可以直接改了"));
      } catch (caught) {
        if (!mountedRef.current) return;
        setError(
          caught instanceof Error
            ? caught.message
            : tt("这份演示文稿没能打开"),
        );
      }
    },
    [commit, item.title, tt],
  );

  const restoreRecovery = useCallback(
    (payload: unknown, updatedAt?: number): boolean => {
      if (updatedAt !== undefined && serverDraftRef.current &&
          Date.parse(serverDraftRef.current.savedAt) >= updatedAt) return false;
      if (sourceFailedRef.current) return false;
      const next = deckDocumentFromWorkingDraft(payload, item.title || "演示文稿");
      if (!next) return false;
      commit(() => next, next.slides[0].id);
      setNotice(tt("已恢复上次未同步的本地草稿"));
      return true;
    },
    [commit, item.title, tt],
  );

  return {
    item,
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
    draft: {
      schema: DECK_DRAFT_SCHEMA,
      capture: () => sourceLoadingRef.current || sourceFailedRef.current ? null : {
        deck: cloneDeckDocument(deckRef.current),
      },
      restoredRevision: serverDraftRef.current ? (typeof serverDraftRef.current.editRevision === "number" ? serverDraftRef.current.editRevision : 1) : undefined,
      bindFlush: bindDraftFlush,
    },
    applyRemoteDeck,
    adoptExternalRevision,
    markCollabSaved,
    readOnly: Boolean(collab?.readOnly),
    flushBeforeExport,
    persistInBackground: () => {
      // Reuse the host controller (and its session commit) when draft saving is
      // connected. The unconnected legacy route keeps its existing behavior.
      const saving = exportFlushRef.current ? exportFlushRef.current() : save();
      void saving.catch(() => undefined);
    },
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
      setTextEditingElementId("");
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
    textEditingElementId,
    beginTextEditing,
    endTextEditing,
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
      setTextEditingElementId("");
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
      setTextEditingElementId("");
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
      setTextEditingElementId("");
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
    importSource,
    exportPptx,
    save,
    restoreRecovery,
  };
}
