/**
 * PDF 批注与表单的多人同改适配（work-chat W14，契约 §9.15）。
 *
 * 作品状态沿用现有的批注 sidecar（`pdf-annotations@2`，见 media-editors/pdf-next-annotations.ts）
 * 的形状：每条批注有稳定 id、页码、类型、矩形（点，原点左上）、内容、颜色。
 * 合并粒度 = 一条批注（实体 id = 批注 id）与一个表单字段（实体 id = 字段名）：
 * 两个人同时批不同的地方、或同一条批注的不同字段（内容 vs 位置）都保留，同字段后改的人胜。
 *
 * 路由层的现状（如实写明）：PDF 工作台用 pdf-lib 把批注直接写进文件字节，新建批注的 id
 * 由内核生成，工作台没有「按批注 id 写入一条批注」的入口，所以路由做「一次一人」，
 * 这份适配器服务于：回放（版本 sidecar 前后对比）与将来工作台补上写入口之后的真同改。
 */
import { readEntityRoot, type EntityDoc } from "./video";

export const PDF_ROOT = "oceanleo:pdf";

export interface PdfCollabRect {
  origin: { x: number; y: number };
  size: { width: number; height: number };
}

export interface PdfCollabAnnotation {
  id: string;
  /** 批注挂的页的稳定 id（删页、调顺序以后仍然指向原来那一页）；老数据没有。 */
  pageId?: string;
  pageIndex: number;
  typeName: string;
  rect: PdfCollabRect;
  contents: string;
  strokeColor?: string;
  opacity?: number;
  [field: string]: unknown;
}

export interface PdfCollabPage {
  index: number;
  widthPt: number;
  heightPt: number;
}

export interface PdfCollabState {
  /** 页的稳定 id，按当前页序；老数据没有。 */
  pageIds?: string[];
  pages: PdfCollabPage[];
  annotations: PdfCollabAnnotation[];
  /** 表单字段：字段名 → 当前值。 */
  fields: Record<string, string>;
}

const ANN = "a:";
const FIELD = "f:";
const PAGE = "p:";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function pdfToEntities(state: PdfCollabState): EntityDoc {
  const order: string[] = [];
  const entities: Record<string, Record<string, unknown>> = {};
  const pageIds = Array.isArray(state.pageIds) ? state.pageIds : null;
  for (const pageId of pageIds ?? []) {
    const key = `${PAGE}${pageId}`;
    if (key in entities) continue;
    order.push(key);
    entities[key] = {};
  }
  for (const annotation of state.annotations ?? []) {
    const { id, ...fields } = annotation;
    const key = `${ANN}${id}`;
    const entity: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(fields)) if (value !== undefined) entity[name] = value;
    // 批注挂在页 id 上；页码会随删页、调顺序变，不存进共享文档（读出时由页序算回来）。
    if (typeof entity.pageId === "string" && pageIds?.includes(entity.pageId)) delete entity.pageIndex;
    order.push(key);
    entities[key] = entity;
  }
  for (const [name, value] of Object.entries(state.fields ?? {})) {
    const key = `${FIELD}${name}`;
    order.push(key);
    entities[key] = { value };
  }
  return { order, entities, meta: { pages: state.pages ?? [] } };
}

export function pdfFromEntities(
  input: { order: string[]; entities: Record<string, Record<string, unknown>>; meta?: Record<string, unknown> },
  prev: PdfCollabState | null,
): PdfCollabState {
  const annotations: PdfCollabAnnotation[] = [];
  const fields: Record<string, string> = {};
  const pageIds: string[] = [];
  const seen = new Set<string>();
  for (const key of input.order) {
    if (seen.has(key)) continue;
    seen.add(key);
    const entity = input.entities[key];
    if (!isRecord(entity)) continue;
    if (key.startsWith(ANN)) annotations.push({ ...entity, id: key.slice(ANN.length) } as unknown as PdfCollabAnnotation);
    else if (key.startsWith(FIELD)) fields[key.slice(FIELD.length)] = String(entity.value ?? "");
    else if (key.startsWith(PAGE)) pageIds.push(key.slice(PAGE.length));
  }
  const pages = Array.isArray(input.meta?.pages) ? (input.meta?.pages as PdfCollabPage[]) : prev?.pages ?? [];
  if (!pageIds.length) return { pages, annotations, fields };
  // 页码由页 id 在当前页序里的位置算出：删页、调顺序以后批注还在原来那一页。
  const placed: PdfCollabAnnotation[] = [];
  for (const annotation of annotations) {
    const at = typeof annotation.pageId === "string" ? pageIds.indexOf(annotation.pageId) : -1;
    if (at >= 0) annotation.pageIndex = at;
    else if (typeof annotation.pageId === "string") continue; // 挂在已经删掉的页上
    else if (!Number.isFinite(Number(annotation.pageIndex))) annotation.pageIndex = 0;
    placed.push(annotation);
  }
  return { pageIds, pages, annotations: placed, fields };
}

export function pdfFromYDoc(doc: unknown): PdfCollabState {
  return pdfFromEntities(readEntityRoot(doc, PDF_ROOT), null);
}

const TYPE_NAMES = new Set([
  "TEXT", "FREETEXT", "LINE", "SQUARE", "CIRCLE", "HIGHLIGHT", "UNDERLINE", "SQUIGGLY", "STRIKEOUT", "STAMP", "INK",
]);

function toRect(value: unknown): PdfCollabRect | null {
  if (!isRecord(value) || !isRecord(value.origin) || !isRecord(value.size)) return null;
  const { x, y } = value.origin;
  const { width, height } = value.size;
  return [x, y, width, height].every((n) => typeof n === "number" && Number.isFinite(n))
    ? { origin: { x: x as number, y: y as number }, size: { width: width as number, height: height as number } }
    : null;
}

/** 版本 JSON：sidecar `pdf-annotations@2`（或 `{ annotations, pages, fields }`）→ 快照；认不出的批注丢弃。 */
export function pdfFromRevisionJson(json: unknown): PdfCollabState {
  const record = isRecord(json) ? json : {};
  const annotations: PdfCollabAnnotation[] = [];
  for (const raw of Array.isArray(record.annotations) ? record.annotations : []) {
    if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) continue;
    const rect = toRect(raw.rect);
    if (!rect) continue;
    const typeName = TYPE_NAMES.has(String(raw.typeName)) ? String(raw.typeName) : "TEXT";
    annotations.push({
      ...raw,
      id: raw.id,
      pageIndex: Number.isFinite(Number(raw.pageIndex)) ? Number(raw.pageIndex) : 0,
      typeName,
      rect,
      contents: typeof raw.contents === "string" ? raw.contents : "",
    });
  }
  const pages = (Array.isArray(record.pages) ? record.pages : [])
    .filter(isRecord)
    .map((page, index) => ({
      index: Number.isFinite(Number(page.index)) ? Number(page.index) : index,
      widthPt: Number(page.widthPt) || 612,
      heightPt: Number(page.heightPt) || 792,
    }));
  const fields: Record<string, string> = {};
  const rawFields = isRecord(record.fields) ? record.fields : isRecord(record.formFields) ? record.formFields : {};
  for (const [name, value] of Object.entries(rawFields)) fields[name] = String(value ?? "");
  return { pages, annotations, fields };
}

export function pdfAnnotationsOnPage(state: PdfCollabState, pageIndex: number): PdfCollabAnnotation[] {
  return state.annotations.filter((annotation) => annotation.pageIndex === pageIndex);
}

type DescribeTranslate = (zh: string, vars?: Record<string, string | number>) => string;
const plainDescribe: DescribeTranslate = (zh, vars) =>
  vars ? zh.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match)) : zh;

/**
 * 这一步改了什么。句子一律是 `tt("中文模板 {n}", vars)`，不在这里拼中文；
 * 模板与回放画法（replay/work/frames/pdf.tsx）用的是同一批，词条在回放分表里。没传 `tt` 时回落成原文。
 */
export function pdfDescribeChange(prev: unknown, next: unknown, tt?: DescribeTranslate): string | null {
  if (!isRecord(next) || !Array.isArray(next.annotations)) return null;
  const nextState = next as unknown as PdfCollabState;
  const prevState = isRecord(prev) && Array.isArray(prev.annotations) ? (prev as unknown as PdfCollabState) : null;
  const before = new Map((prevState?.annotations ?? []).map((a) => [a.id, a]));
  const after = new Map(nextState.annotations.map((a) => [a.id, a]));
  const added = [...after.keys()].filter((id) => !before.has(id));
  const removed = [...before.keys()].filter((id) => !after.has(id));
  const changed = [...after.keys()].filter(
    (id) => before.has(id) && JSON.stringify(before.get(id)) !== JSON.stringify(after.get(id)),
  );
  const pagesTouched = new Set<number>();
  for (const id of [...added, ...changed]) pagesTouched.add(after.get(id)!.pageIndex);
  const fieldsBefore = prevState?.fields ?? {};
  const fieldsChanged = Object.entries(nextState.fields ?? {}).filter(([name, value]) => fieldsBefore[name] !== value).length;
  const t = tt ?? plainDescribe;
  const parts: string[] = [];
  if (added.length) {
    const pages = [...pagesTouched].map((n) => n + 1).sort((a, b) => a - b).join(", ");
    parts.push(t("第 {pages} 页新增了 {n} 条批注", { pages, n: added.length }));
    if (changed.length) parts.push(t("改了 {n} 条批注", { n: changed.length }));
  } else if (changed.length) {
    parts.push(t("改了 {n} 条批注", { n: changed.length }));
  }
  if (removed.length) parts.push(t("删了 {n} 条批注", { n: removed.length }));
  if (fieldsChanged) parts.push(t("填了 {n} 个表单项", { n: fieldsChanged }));
  return parts.length ? parts.reduce((a, b) => t("{a}，{b}", { a, b })) : null;
}

/** 「从这一步接手」：还原成 sidecar 形状（编辑器读它即可）。 */
export function pdfToArtifactJson(snapshot: unknown): unknown {
  const state = isRecord(snapshot) && Array.isArray(snapshot.annotations) ? (snapshot as unknown as PdfCollabState) : pdfFromRevisionJson(snapshot);
  return {
    schema: "pdf-annotations@2",
    version: 2,
    source: "embedpdf",
    editorRevision: 0,
    pages: state.pages,
    annotations: state.annotations,
    ...(Object.keys(state.fields).length ? { fields: state.fields } : {}),
  };
}

// ---------------------------------------------------------------------------
// 按批注多人同改的合并（work-chat 第二轮 F05）。纯数据，不碰 PDF 字节也不碰 Yjs：
// 编辑器把本地字节读成 `local`（实体形状），共享文档读成 `shared`，`base` 是上一次对齐时的样子。
// 三方合并：只把「本地相对 base 的改动」写进共享，只把「共享相对本地的差」交给编辑器写回字节，
// 所以任何一方都不会因为「还没收到对方的东西」而把对方的批注当成删掉。
// ---------------------------------------------------------------------------

export interface PdfSyncUpsert {
  /** 实体是新的（base 里没有）。 */
  isNew: boolean;
  /** 新增：全部字段；修改：变了的字段。 */
  set: Record<string, unknown>;
  /** 修改里被拿掉的字段。 */
  unset: string[];
}

export interface PdfSyncOps {
  upserts: Record<string, PdfSyncUpsert>;
  removes: string[];
  /** 页 id 的新顺序；null = 页没有变。只有持有整页锁的一端会推它。 */
  pageOrder: string[] | null;
}

const isPageKey = (key: string): boolean => key.startsWith(PAGE);

/** 键排序后的 JSON：同一份数据不因键的先后不同而判成不等。 */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    isRecord(v)
      ? Object.fromEntries(
          Object.entries(v)
            .filter(([, x]) => x !== undefined)
            .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)),
        )
      : v,
  );
}

function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return stableJson(a) === stableJson(b);
}

function pageKeysOf(shape: EntityDoc): string[] {
  const out: string[] = [];
  for (const key of shape.order) if (isPageKey(key) && shape.entities[key] && !out.includes(key)) out.push(key);
  return out;
}

function cloneShape(shape: EntityDoc): Required<EntityDoc> {
  return JSON.parse(JSON.stringify({ order: shape.order, entities: shape.entities, meta: shape.meta ?? {} }));
}

/** 批注 / 表单字段实体的 id 列表（不含页）。 */
function dataKeys(shape: EntityDoc): string[] {
  return Object.keys(shape.entities).filter((key) => !isPageKey(key));
}

/** `next` 相对 `base` 改了什么。 */
export function pdfSyncDiff(base: EntityDoc, next: EntityDoc): PdfSyncOps {
  const ops: PdfSyncOps = { upserts: {}, removes: [], pageOrder: null };
  for (const key of dataKeys(next)) {
    const now = next.entities[key];
    const was = base.entities[key];
    if (!isRecord(now)) continue;
    if (!isRecord(was)) {
      ops.upserts[key] = { isNew: true, set: { ...now }, unset: [] };
      continue;
    }
    const set: Record<string, unknown> = {};
    const unset: string[] = [];
    for (const [name, value] of Object.entries(now)) {
      if (value === undefined) continue;
      if (!jsonEqual(was[name], value)) set[name] = value;
    }
    for (const name of Object.keys(was)) if (!(name in now) || now[name] === undefined) unset.push(name);
    if (Object.keys(set).length || unset.length) ops.upserts[key] = { isNew: false, set, unset };
  }
  for (const key of dataKeys(base)) if (!isRecord(next.entities[key])) ops.removes.push(key);
  const was = pageKeysOf(base);
  const now = pageKeysOf(next);
  if (!jsonEqual(was, now)) ops.pageOrder = now.map((key) => key.slice(PAGE.length));
  return ops;
}

export interface PdfSyncApplyOptions {
  /** 是否应用页顺序（只有持锁端推页）。默认 false。 */
  pages?: boolean;
  /** 新增实体是否要收：不收的整条跳过（页还没到本地、拿不出来的图章等）。默认全收。 */
  accept?: (key: string, entity: Record<string, unknown>) => boolean;
}

/** 把改动套到 `target` 上，返回新形状（不改入参）。同一实体被对方删了：改动作废（删除优先）。 */
export function pdfSyncApply(target: EntityDoc, ops: PdfSyncOps, options: PdfSyncApplyOptions = {}): Required<EntityDoc> {
  const out = cloneShape(target);
  for (const key of ops.removes) {
    delete out.entities[key];
  }
  for (const [key, change] of Object.entries(ops.upserts)) {
    const existing = out.entities[key];
    if (change.isNew) {
      if (options.accept && !options.accept(key, change.set)) continue;
      out.entities[key] = { ...(isRecord(existing) ? existing : {}), ...change.set };
    } else if (isRecord(existing)) {
      const entity = { ...existing, ...change.set };
      for (const name of change.unset) delete entity[name];
      out.entities[key] = entity;
    }
  }
  if (options.pages && ops.pageOrder) {
    const keep = new Set(ops.pageOrder.map((id) => `${PAGE}${id}`));
    for (const key of Object.keys(out.entities)) if (isPageKey(key) && !keep.has(key)) delete out.entities[key];
    for (const key of keep) if (!out.entities[key]) out.entities[key] = {};
  }
  const pageKeys = options.pages && ops.pageOrder ? ops.pageOrder.map((id) => `${PAGE}${id}`) : pageKeysOf({ ...out, order: target.order });
  const rest: string[] = [];
  const seen = new Set<string>(pageKeys);
  for (const key of target.order) {
    if (seen.has(key) || isPageKey(key) || !out.entities[key]) continue;
    seen.add(key);
    rest.push(key);
  }
  for (const key of Object.keys(out.entities)) {
    if (seen.has(key) || isPageKey(key)) continue;
    seen.add(key);
    rest.push(key);
  }
  out.order = [...pageKeys.filter((key) => out.entities[key]), ...rest];
  return out;
}

export interface PdfSyncReconcileInput {
  base: EntityDoc;
  local: EntityDoc;
  shared: EntityDoc;
  /** 本端是否持有整页锁（只有它能把页结构推给别人）。 */
  holdsPages: boolean;
  /** 页 id 在本地字节里有没有（没有的页上的新批注先不收）。 */
  hasLocalPage?: (pageId: string) => boolean;
  /** 这条新实体本地能不能画出来（图像图章这类拿不到内容的不收）。 */
  canBuild?: (key: string, entity: Record<string, unknown>) => boolean;
}

export interface PdfSyncReconcileResult {
  /** 应当写进共享文档的结果（已含对方的改动）。 */
  merged: Required<EntityDoc>;
  /** 本地字节要补上的改动（不含页结构）。 */
  inbound: PdfSyncOps;
  /** 对齐之后的 base。 */
  nextBase: Required<EntityDoc>;
  /** merged 与 shared 不同，要写共享文档。 */
  pushNeeded: boolean;
  /** 本端推了多少条批注 / 表单的改动（0 = 没有本地改动）。 */
  localChanges: number;
}

/** 一次对齐：本地改动并进共享，共享的差回到本地。 */
export function pdfSyncReconcile(input: PdfSyncReconcileInput): PdfSyncReconcileResult {
  const { base, local, shared, holdsPages } = input;
  const localOps = pdfSyncDiff(base, local);
  const localPages = new Set(pageKeysOf(local).map((key) => key.slice(PAGE.length)));
  const merged = pdfSyncApply(shared, localOps, { pages: holdsPages });
  // 页结构只由持锁端推：别人的本地页若与共享不同，共享以持锁端的为准（页没动就沿用共享的页序）。
  if (holdsPages || Object.keys(shared.meta ?? {}).length === 0) merged.meta = { ...(shared.meta ?? {}), ...(local.meta ?? {}) };
  const accept = (key: string, entity: Record<string, unknown>): boolean => {
    if (input.canBuild && !input.canBuild(key, entity)) return false;
    const pageId = entity.pageId;
    if (typeof pageId === "string" && input.hasLocalPage) return input.hasLocalPage(pageId);
    if (typeof pageId === "string") return localPages.has(pageId);
    return true;
  };
  const inboundAll = pdfSyncDiff(local, { ...merged, order: merged.order });
  // inboundAll 里的 pageOrder 与本地字节无关（页结构靠重新载入），丢掉。
  const inbound: PdfSyncOps = { upserts: {}, removes: [...inboundAll.removes], pageOrder: null };
  for (const [key, change] of Object.entries(inboundAll.upserts)) {
    if (change.isNew && !accept(key, change.set)) continue;
    inbound.upserts[key] = change;
  }
  const nextBase = pdfSyncApply(local, inbound, { pages: false });
  return {
    merged,
    inbound,
    nextBase,
    pushNeeded: !jsonEqual(
      { e: merged.entities, o: pageKeysOf(merged), m: merged.meta },
      { e: shared.entities, o: pageKeysOf(shared), m: shared.meta ?? {} },
    ),
    localChanges: Object.keys(localOps.upserts).length + localOps.removes.length,
  };
}
