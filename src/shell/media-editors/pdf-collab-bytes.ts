"use client";

/**
 * PDF 多人同改的字节层（work-chat 第二轮 F05，契约 §9.15「PDF 按批注合并」）。
 *
 * 一份 PDF 里有三种东西要在多人之间对齐：
 *   页      —— 稳定 id 写在页字典 `/OLPageId` 里，随页一起被复制、移动、删除、进撤销快照；
 *   批注    —— 每条批注的稳定 id 就是标准批注字典里的 `/NM`（`appendPdfAnnotation` 一直在写）；
 *   表单字段 —— 字段名就是 id，值是字段当前值。
 *
 * 这里把字节读成「实体形状」（`order` / `entities` / `meta`，与 collab/adapters/pdf.ts 的
 * `pdfToEntities` 同一套键：`p:<页 id>`、`a:<批注 id>`、`f:<字段名>`），并把别人的改动按 id 写回字节。
 * 不碰撤销栈、不碰 React，纯函数 + pdf-lib。
 */
import { PDFDocument, PDFHexString, PDFName, PDFString } from "pdf-lib";
import type { EntityDoc } from "../collab/adapters/video";
import type { PdfSyncOps } from "../collab/adapters/pdf";
import {
  PDF_ANNOTATION_KINDS,
  ensurePdfAnnotationIdsInDocument,
  findPdfAnnotationPage,
  listPdfAnnotationsInDocument,
  movePdfAnnotationInDocument,
  pdfPageGeometry,
  removePdfAnnotationInDocument,
  setPdfAnnotationStyleInDocument,
  updatePdfAnnotationContentsInDocument,
  appendPdfAnnotation,
  type PdfAnnotationDraft,
  type PdfAnnotationKind,
  type PdfAnnotationView,
  type PdfVisualPoint,
  type PdfVisualRect,
} from "./pdf-annotation-operations";
import { fillPdfForm, listPdfFormFields } from "./pdf-form/acroform";
import type { PdfFormFieldView } from "./pdf-form/types";

export const PDF_PAGE_ID_KEY = "OLPageId";
const PAGE_ID = PDFName.of(PDF_PAGE_ID_KEY);
const PAGE_PREFIX = "p:";
const ANN_PREFIX = "a:";
const FIELD_PREFIX = "f:";

const LOAD_OPTIONS = { ignoreEncryption: false, updateMetadata: false } as const;

const loadPdf = (bytes: Uint8Array): Promise<PDFDocument> =>
  PDFDocument.load(Uint8Array.from(bytes), LOAD_OPTIONS);
const savePdf = (document: PDFDocument): Promise<Uint8Array> =>
  document.save({ useObjectStreams: true, objectsPerTick: 25 });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function randomSuffix(): string {
  return (
    globalThis.crypto?.randomUUID?.().slice(0, 8) ||
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  );
}

/** 4 位小数：来回换算（页坐标 ↔ 0..1）不会因为浮点误差让两端互相「改」对方的批注。 */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ------------------------------------------------------------------ 页 id

function readPageId(document: PDFDocument, pageIndex: number): string {
  const value = document
    .getPage(pageIndex)
    .node.lookupMaybe(PAGE_ID, PDFString, PDFHexString);
  if (!value) return "";
  try {
    return value.decodeText().trim();
  } catch {
    return "";
  }
}

/**
 * 每页的稳定 id。缺的或重复的补上：没有 id 的页先试 `pg-<页序号>`——同一份字节上所有客户端算出同一个值，
 * 第一次打开一份没标过的 PDF 时大家天然对齐；撞了才用随机的。返回 `[ids, 补了几页]`。
 */
function resolvePageIds(document: PDFDocument): { ids: string[]; patched: number[] } {
  const count = document.getPageCount();
  const ids: string[] = [];
  const used = new Set<string>();
  const pending: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const id = readPageId(document, index);
    if (id && !used.has(id)) {
      used.add(id);
      ids.push(id);
    } else {
      ids.push("");
      pending.push(index);
    }
  }
  for (const index of pending) {
    let id = `pg-${index}`;
    if (used.has(id)) id = `pg-${randomSuffix()}`;
    used.add(id);
    ids[index] = id;
  }
  return { ids, patched: pending };
}

/**
 * 给页和原文件自带的批注补上稳定 id。没有要补的就原样返回同一份字节（`changed=false`）。
 */
export async function ensurePdfCollabIds(
  bytes: Uint8Array,
): Promise<{ bytes: Uint8Array; changed: boolean }> {
  const document = await loadPdf(bytes);
  const { ids, patched } = resolvePageIds(document);
  for (const index of patched) {
    document.getPage(index).node.set(PAGE_ID, PDFHexString.fromText(ids[index]!));
  }
  const annotationsPatched = ensurePdfAnnotationIdsInDocument(document, (index) => ids[index]!);
  if (!patched.length && !annotationsPatched) return { bytes, changed: false };
  return { bytes: await savePdf(document), changed: true };
}

/** 页 id 按当前页序（没标过的页用同样的确定性补法，但不写回）。 */
export async function readPdfPageIds(bytes: Uint8Array): Promise<string[]> {
  return resolvePageIds(await loadPdf(bytes)).ids;
}

// ------------------------------------------------------------------ 批注 ↔ 实体

const TYPE_NAME: Record<PdfAnnotationKind, string> = {
  text: "TEXT",
  highlight: "HIGHLIGHT",
  underline: "UNDERLINE",
  strikeout: "STRIKEOUT",
  squiggly: "SQUIGGLY",
  freehand: "INK",
  square: "SQUARE",
  circle: "CIRCLE",
  line: "LINE",
  arrow: "LINE",
  stamp: "STAMP",
};

const roundRect = (rect: PdfVisualRect): PdfVisualRect => ({
  x: round4(rect.x),
  y: round4(rect.y),
  width: round4(rect.width),
  height: round4(rect.height),
});
const roundPoint = (point: PdfVisualPoint): PdfVisualPoint => ({ x: round4(point.x), y: round4(point.y) });

/** 图片图章（签章）的图像在外观流里，没法从字段重建：只同步位置 / 备注，不在别的客户端凭空画出来。 */
export function isOpaquePdfAnnotation(entity: Record<string, unknown>): boolean {
  return entity.opaque === true;
}

function annotationEntity(
  view: PdfAnnotationView,
  pageId: string,
  visualWidthPt: number,
  visualHeightPt: number,
): Record<string, unknown> {
  const vrect = roundRect(view.rect);
  const entity: Record<string, unknown> = {
    pageId,
    kind: view.kind,
    typeName: TYPE_NAME[view.kind],
    contents: view.contents,
    // 契约里回放读的矩形：页面点，原点左上。
    rect: {
      origin: { x: round2(vrect.x * visualWidthPt), y: round2(vrect.y * visualHeightPt) },
      size: { width: round2(vrect.width * visualWidthPt), height: round2(vrect.height * visualHeightPt) },
    },
    // 重建用的精确矩形：0..1，原点左上，已按页面旋转换算。
    vrect,
    strokeColor: view.color,
    opacity: round4(view.opacity),
  };
  if (view.quads.length) entity.quads = view.quads.map(roundRect);
  if (view.strokes.length) entity.strokes = view.strokes.map((stroke) => stroke.map(roundPoint));
  if (view.endpoints) entity.endpoints = view.endpoints.map(roundPoint);
  if (view.kind === "stamp") {
    if (view.stampName) entity.stampName = view.stampName;
    else entity.opaque = true;
  }
  return entity;
}

// ------------------------------------------------------------------ 表单字段 ↔ 实体

type FieldValue = string | boolean | string[];

function encodeFieldValue(field: PdfFormFieldView): { value: string; vtype: "text" | "bool" | "list" } {
  const raw = field.value;
  if (typeof raw === "boolean") return { value: raw ? "true" : "false", vtype: "bool" };
  if (Array.isArray(raw)) return { value: JSON.stringify(raw), vtype: "list" };
  return { value: String(raw ?? ""), vtype: "text" };
}

function decodeFieldValue(entity: Record<string, unknown>): FieldValue {
  const value = String(entity.value ?? "");
  if (entity.vtype === "bool") return value === "true";
  if (entity.vtype === "list") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return value;
}

// ------------------------------------------------------------------ 读

export interface PdfCollabRead {
  shape: Required<EntityDoc>;
  pageIds: string[];
}

/**
 * 把字节读成实体形状：页（含页尺寸 meta）、批注、表单字段。
 * 没有稳定 id 的批注（`ref:` / `direct:`）不进来——`ensurePdfCollabIds` 之后它们都有 id。
 */
export async function readPdfCollabShape(
  bytes: Uint8Array,
  options: { fields?: boolean } = {},
): Promise<PdfCollabRead> {
  const document = await loadPdf(bytes);
  const { ids } = resolvePageIds(document);
  const order: string[] = [];
  const entities: Record<string, Record<string, unknown>> = {};
  const pages: Array<{ index: number; widthPt: number; heightPt: number }> = [];
  for (const id of ids) {
    order.push(`${PAGE_PREFIX}${id}`);
    entities[`${PAGE_PREFIX}${id}`] = {};
  }
  for (let index = 0; index < ids.length; index += 1) {
    const geometry = pdfPageGeometry(document, index);
    const sideways = geometry.rotation % 180 !== 0;
    const widthPt = sideways ? geometry.height : geometry.width;
    const heightPt = sideways ? geometry.width : geometry.height;
    pages.push({ index, widthPt: round2(widthPt), heightPt: round2(heightPt) });
    for (const view of listPdfAnnotationsInDocument(document, index)) {
      if (view.id.startsWith("ref:") || view.id.startsWith("direct:")) continue;
      const key = `${ANN_PREFIX}${view.id}`;
      if (entities[key]) continue;
      order.push(key);
      entities[key] = annotationEntity(view, ids[index]!, widthPt, heightPt);
    }
  }
  if (options.fields) {
    let fields: PdfFormFieldView[] = [];
    try {
      fields = await listPdfFormFields(bytes);
    } catch {
      fields = [];
    }
    for (const field of fields) {
      if (field.kind === "signature") continue;
      const key = `${FIELD_PREFIX}${field.name}`;
      if (entities[key]) continue;
      order.push(key);
      entities[key] = encodeFieldValue(field);
    }
  }
  return { shape: { order, entities, meta: { pages } }, pageIds: ids };
}

// ------------------------------------------------------------------ 写

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function asRect(value: unknown): PdfVisualRect | null {
  if (!isRecord(value)) return null;
  const { x, y, width, height } = value;
  return [x, y, width, height].every((n) => typeof n === "number" && Number.isFinite(n))
    ? { x: x as number, y: y as number, width: width as number, height: height as number }
    : null;
}
function asPoint(value: unknown): PdfVisualPoint | null {
  if (!isRecord(value)) return null;
  return typeof value.x === "number" && typeof value.y === "number" && Number.isFinite(value.x) && Number.isFinite(value.y)
    ? { x: value.x, y: value.y }
    : null;
}

/** 从实体字段拼出画一条批注要的草稿；认不出的返回 null。 */
export function pdfDraftFromEntity(id: string, entity: Record<string, unknown>): PdfAnnotationDraft | null {
  const kind = String(entity.kind || "") as PdfAnnotationKind;
  if (!PDF_ANNOTATION_KINDS.includes(kind)) return null;
  if (isOpaquePdfAnnotation(entity)) return null;
  const draft: PdfAnnotationDraft = { kind, id };
  if (typeof entity.contents === "string") draft.contents = entity.contents;
  if (typeof entity.strokeColor === "string" && HEX_COLOR.test(entity.strokeColor)) draft.color = entity.strokeColor;
  if (typeof entity.opacity === "number" && Number.isFinite(entity.opacity)) draft.opacity = entity.opacity;
  const rect = asRect(entity.vrect);
  if (rect) draft.rect = rect;
  if (Array.isArray(entity.quads)) {
    const quads = entity.quads.map(asRect).filter((item): item is PdfVisualRect => item !== null);
    if (quads.length) draft.quads = quads;
  }
  if (Array.isArray(entity.strokes)) {
    const strokes = entity.strokes
      .map((stroke) =>
        Array.isArray(stroke) ? stroke.map(asPoint).filter((item): item is PdfVisualPoint => item !== null) : [],
      )
      .filter((stroke) => stroke.length > 0);
    if (strokes.length) draft.strokes = strokes;
  }
  if (Array.isArray(entity.endpoints) && entity.endpoints.length === 2) {
    const a = asPoint(entity.endpoints[0]);
    const b = asPoint(entity.endpoints[1]);
    if (a && b) draft.endpoints = [a, b];
  }
  if (kind === "stamp" && typeof entity.stampName === "string") {
    draft.stampName = entity.stampName as PdfAnnotationDraft["stampName"];
  }
  return draft;
}

export interface PdfApplyOutcome {
  bytes: Uint8Array;
  changed: boolean;
  /** 没能写进去的条目（认不出的类型、页不在本地等）：只用于排查，不报给用户。 */
  skipped: string[];
}

/**
 * 把别人的改动按 id 写进本地字节：新增（已存在就跳过）、改字段、删除、表单字段值。
 * 对同一份字节重复执行结果不变（幂等），所以「对方的改动到了、本地又改了一点」也安全。
 */
export async function applyPdfSyncOps(
  bytes: Uint8Array,
  ops: PdfSyncOps,
  /** 合并后的完整实体（表单字段要靠它拿到值的类型）；缺省只用改动本身。 */
  fullEntities: Record<string, Record<string, unknown>> = {},
): Promise<PdfApplyOutcome> {
  const skipped: string[] = [];
  const touchesAnnotations =
    ops.removes.some((key) => key.startsWith(ANN_PREFIX)) ||
    Object.keys(ops.upserts).some((key) => key.startsWith(ANN_PREFIX));
  const fieldValues: Record<string, FieldValue> = {};
  for (const [key, change] of Object.entries(ops.upserts)) {
    if (!key.startsWith(FIELD_PREFIX)) continue;
    fieldValues[key.slice(FIELD_PREFIX.length)] = decodeFieldValue({ ...change.set, ...fullEntities[key] });
  }
  let next = bytes;
  let changed = false;

  if (touchesAnnotations) {
    const document = await loadPdf(bytes);
    const { ids } = resolvePageIds(document);
    const indexOfPage = new Map(ids.map((id, index) => [id, index] as const));
    let dirty = false;

    for (const key of ops.removes) {
      if (!key.startsWith(ANN_PREFIX)) continue;
      const id = key.slice(ANN_PREFIX.length);
      const at = findPdfAnnotationPage(document, id);
      if (at < 0) continue;
      try {
        removePdfAnnotationInDocument(document, at, id);
        dirty = true;
      } catch {
        skipped.push(key);
      }
    }

    for (const [key, change] of Object.entries(ops.upserts)) {
      if (!key.startsWith(ANN_PREFIX)) continue;
      const id = key.slice(ANN_PREFIX.length);
      const at = findPdfAnnotationPage(document, id);
      try {
        if (at < 0) {
          // 本地没有：只有「新增」才画；对方改了一条我这里不存在的（已被我删）→ 删除优先，不复活。
          if (!change.isNew) continue;
          const pageId = typeof change.set.pageId === "string" ? change.set.pageId : "";
          const pageIndex = indexOfPage.get(pageId);
          const draft = pdfDraftFromEntity(id, change.set);
          if (pageIndex === undefined || !draft) {
            skipped.push(key);
            continue;
          }
          await appendPdfAnnotation(document, pageIndex, draft);
          dirty = true;
          continue;
        }
        if (change.isNew) continue; // 同 id 已存在（我们两边都画了同一条）：不重复画
        const set = change.set;
        if ("contents" in set && typeof set.contents === "string") {
          updatePdfAnnotationContentsInDocument(document, at, id, set.contents);
          dirty = true;
        }
        const rect = asRect(set.vrect);
        if (rect && rect.width > 0 && rect.height > 0) {
          movePdfAnnotationInDocument(document, at, id, rect);
          dirty = true;
        }
        const color = typeof set.strokeColor === "string" ? set.strokeColor : undefined;
        const opacity = typeof set.opacity === "number" ? set.opacity : undefined;
        if (color !== undefined || opacity !== undefined) {
          setPdfAnnotationStyleInDocument(document, at, id, { color, opacity });
          dirty = true;
        }
      } catch {
        skipped.push(key);
      }
    }
    if (dirty) {
      next = await savePdf(document);
      changed = true;
    }
  }

  if (Object.keys(fieldValues).length) {
    try {
      next = await fillPdfForm(next, fieldValues, false);
      changed = true;
    } catch {
      skipped.push("fields");
    }
  }
  return { bytes: next, changed, skipped };
}

/**
 * 撤销 / 重做 / 重新载入之后：字节被换成一份旧的（或别人保存的）版本，
 * 把「不是我改的」批注与表单字段按 `keep` 里的样子补回去，我自己的批注保持字节里（旧版本）的样子。
 *
 * `keep`：id（`a:` / `f:` 键）→ 该保留的实体；null = 该删。没出现在 `keep` 里的键不动。
 */
export async function applyPdfKeepTargets(
  bytes: Uint8Array,
  keep: Record<string, Record<string, unknown> | null>,
): Promise<PdfApplyOutcome> {
  const restored = (await readPdfCollabShape(bytes, { fields: true })).shape;
  const ops: PdfSyncOps = { upserts: {}, removes: [], pageOrder: null };
  for (const [key, target] of Object.entries(keep)) {
    const now = restored.entities[key];
    if (target === null) {
      if (now) ops.removes.push(key);
      continue;
    }
    if (!now) {
      ops.upserts[key] = { isNew: true, set: { ...target }, unset: [] };
      continue;
    }
    const set: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(target)) {
      if (JSON.stringify(now[name]) !== JSON.stringify(value)) set[name] = value;
    }
    if (Object.keys(set).length) ops.upserts[key] = { isNew: false, set, unset: [] };
  }
  // 页已经不在的批注补不回去，交给 applyPdfSyncOps 跳过（不报错）。
  const full: Record<string, Record<string, unknown>> = {};
  for (const [key, target] of Object.entries(keep)) if (target) full[key] = target;
  return applyPdfSyncOps(bytes, ops, full);
}
