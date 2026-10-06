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
  pages: PdfCollabPage[];
  annotations: PdfCollabAnnotation[];
  /** 表单字段：字段名 → 当前值。 */
  fields: Record<string, string>;
}

const ANN = "a:";
const FIELD = "f:";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function pdfToEntities(state: PdfCollabState): EntityDoc {
  const order: string[] = [];
  const entities: Record<string, Record<string, unknown>> = {};
  for (const annotation of state.annotations ?? []) {
    const { id, ...fields } = annotation;
    const key = `${ANN}${id}`;
    const entity: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(fields)) if (value !== undefined) entity[name] = value;
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
  const seen = new Set<string>();
  for (const key of input.order) {
    if (seen.has(key)) continue;
    seen.add(key);
    const entity = input.entities[key];
    if (!isRecord(entity)) continue;
    if (key.startsWith(ANN)) annotations.push({ ...entity, id: key.slice(ANN.length) } as unknown as PdfCollabAnnotation);
    else if (key.startsWith(FIELD)) fields[key.slice(FIELD.length)] = String(entity.value ?? "");
  }
  const pages = Array.isArray(input.meta?.pages) ? (input.meta?.pages as PdfCollabPage[]) : prev?.pages ?? [];
  return { pages, annotations, fields };
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

export function pdfDescribeChange(prev: unknown, next: unknown): string | null {
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
  const parts: string[] = [];
  if (added.length) parts.push(`第 ${[...pagesTouched].map((n) => n + 1).sort((a, b) => a - b).join("、")} 页新增了 ${added.length} 条批注`);
  else if (changed.length) parts.push(`改了 ${changed.length} 条批注`);
  if (added.length && changed.length) parts.push(`改了 ${changed.length} 条批注`);
  if (removed.length) parts.push(`删了 ${removed.length} 条批注`);
  if (fieldsChanged) parts.push(`填了 ${fieldsChanged} 个表单项`);
  return parts.length ? parts.join("，") : null;
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
