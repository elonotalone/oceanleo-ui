// PPT（演示文稿）的多人同改适配器 + 回放的纯函数（work-chat W13，契约 §8.4 / §9.15）。
//
// 实体模型（契约 §8.4「每个实体一个 Y.Map、顺序一个 Y.Array」）：
//   order    = 全部实体 key：先是页 id（它们在 order 里的先后 = 页顺序），再是各页元素的 key（位置无意义，
//              但必须在 order 里——W11 的绑定只保留 order 里列出的实体）；
//   页实体    key = 页 id，{kind:"slide", title, body, bullets, notes, layout, background, transition, masterId, image}；
//   元素实体  key = `${页 id}::${元素 id}`，{kind:"element", slideId, ...DeckElement 的全部字段}；
//   meta      = 整份演示文稿的顶层字段（标题、比例、主题、母版、导入警告、专业模式源）。
// 可选字段缺失时写 null（而不是省略），这样「把某个属性清掉」也能作为一次字段变更同步出去；
// fromEntities 把 null 还原成「没有这个字段」。
// 元素的层级用元素自己的 `order` 字段（页内 z 序），不另存数组顺序，所以两个人同时在同一页加元素不会互相覆盖。
//
// 本文件只放纯函数（不碰 React / 浏览器 / yjs 类型），便于在 node 里直接测；
// 回放画法的 React 部分在 src/shell/replay/work/frames/deck.tsx，那里 import 这里。
import type {
  DeckDocument,
  DeckElement,
  DeckSlide,
} from "../../doc-editors/deck-schema";
import {
  deckDocumentFromIr,
  normalizeDeckDocument,
} from "../../doc-editors/deck-schema";
import { DECK_IR_SCHEMA, validateDeckIr } from "../../doc-editors/deck-ir";

export const DECK_COLLAB_ROOT = "oceanleo:deck";

export interface EntityState {
  order: string[];
  entities: Record<string, Record<string, unknown>>;
  meta: Record<string, unknown>;
}

const SLIDE_FIELDS = [
  "title",
  "body",
  "bullets",
  "notes",
  "layout",
  "background",
  "transition",
  "masterId",
  "image",
] as const;

const ELEMENT_FIELDS = [
  "id",
  "type",
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "order",
  "text",
  "src",
  "alt",
  "shape",
  "fill",
  "color",
  "fontSize",
  "fontFamily",
  "bold",
  "italic",
  "underline",
  "align",
  "lineHeight",
  "letterSpacing",
  "borderColor",
  "borderWidth",
  "lineDash",
  "lineStart",
  "lineEnd",
  "borderRadius",
  "opacity",
  "shadow",
  "locked",
  "flipX",
  "flipY",
  "imageFit",
  "brightness",
  "contrast",
  "saturation",
  "blur",
  "rows",
  "label",
  "animation",
] as const;

/** 元素实体的 key；选择（awareness）里放的也是它。 */
export function deckElementKey(slideId: string, elementId: string): string {
  return `${slideId}::${elementId}`;
}

function cloneJson<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

/** 缺失 → null；其余按 JSON 深拷贝（Y 里的值必须是纯 JSON）。 */
function field(value: unknown): unknown {
  return value === undefined ? null : cloneJson(value);
}

export function deckToEntities(deck: DeckDocument): EntityState {
  const order: string[] = [];
  const elementKeys: string[] = [];
  const entities: Record<string, Record<string, unknown>> = {};
  for (const slide of deck.slides) {
    if (!slide.id || entities[slide.id]) continue; // 重复 id 的页只收第一份
    order.push(slide.id);
    const entity: Record<string, unknown> = { kind: "slide" };
    for (const name of SLIDE_FIELDS) {
      entity[name] = field((slide as unknown as Record<string, unknown>)[name]);
    }
    entities[slide.id] = entity;
    for (const element of slide.elements) {
      if (!element.id) continue;
      const key = deckElementKey(slide.id, element.id);
      if (entities[key]) continue;
      const row: Record<string, unknown> = { kind: "element", slideId: slide.id };
      const raw = element as unknown as Record<string, unknown>;
      for (const name of ELEMENT_FIELDS) row[name] = field(raw[name]);
      // 将来 DeckElement 新增了本表里还没有的字段：不丢，原样带上。
      for (const name of Object.keys(raw)) {
        if (!(name in row)) row[name] = field(raw[name]);
      }
      entities[key] = row;
      elementKeys.push(key);
    }
  }
  order.push(...elementKeys);
  const meta: Record<string, unknown> = {
    title: deck.title,
    aspect: deck.aspect,
    theme: deck.theme,
    masters: cloneJson(deck.masters),
    importWarnings: field(deck.importWarnings),
    pptistSource: field(deck.pptistSource),
  };
  return { order, entities, meta };
}

function strip(source: Record<string, unknown>, names: readonly string[], skip: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of names) {
    if (skip.includes(name)) continue;
    const value = source[name];
    if (value !== null && value !== undefined) out[name] = cloneJson(value);
  }
  return out;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function deckFromEntities(
  input: EntityState,
  prev: DeckDocument | null,
): DeckDocument {
  const bySlide = new Map<string, Array<[string, Record<string, unknown>]>>();
  for (const [key, entity] of Object.entries(input.entities)) {
    if (!entity || entity.kind !== "element") continue;
    const slideId = typeof entity.slideId === "string" ? entity.slideId : "";
    if (!slideId) continue;
    const list = bySlide.get(slideId) ?? [];
    list.push([key, entity]);
    bySlide.set(slideId, list);
  }
  const prevSlides = new Map((prev?.slides ?? []).map((slide) => [slide.id, slide]));
  const seen = new Set<string>();
  const slides: DeckSlide[] = [];
  for (const slideId of input.order) {
    const entity = input.entities[slideId];
    if (seen.has(slideId) || !entity || entity.kind !== "slide") continue;
    seen.add(slideId);
    const prevElementIndex = new Map(
      (prevSlides.get(slideId)?.elements ?? []).map((element, index) => [element.id, index]),
    );
    const rows = (bySlide.get(slideId) ?? []).slice().sort(([ak, a], [bk, b]) => {
      const byOrder = finiteOr(a.order, 0) - finiteOr(b.order, 0);
      if (byOrder) return byOrder;
      const ai = prevElementIndex.get(String(a.id)) ?? Number.MAX_SAFE_INTEGER;
      const bi = prevElementIndex.get(String(b.id)) ?? Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return ak < bk ? -1 : ak > bk ? 1 : 0;
    });
    const elements = rows.map(
      ([, row]) => strip(row, ELEMENT_FIELDS, []) as unknown as DeckElement,
    );
    const extras = rows.map(([, row]) => {
      const out: Record<string, unknown> = {};
      for (const name of Object.keys(row)) {
        if (name === "kind" || name === "slideId") continue;
        if ((ELEMENT_FIELDS as readonly string[]).includes(name)) continue;
        if (row[name] !== null && row[name] !== undefined) out[name] = cloneJson(row[name]);
      }
      return out;
    });
    elements.forEach((element, index) => Object.assign(element, extras[index]));
    const slide: Record<string, unknown> = { id: slideId };
    slide.title = typeof entity.title === "string" ? entity.title : "";
    slide.body = typeof entity.body === "string" ? entity.body : "";
    slide.bullets = Array.isArray(entity.bullets) ? cloneJson(entity.bullets) : [];
    slide.notes = typeof entity.notes === "string" ? entity.notes : "";
    slide.layout = typeof entity.layout === "string" ? entity.layout : "title-body";
    slide.background = typeof entity.background === "string" ? entity.background : "";
    if (entity.transition) slide.transition = cloneJson(entity.transition);
    if (typeof entity.masterId === "string" && entity.masterId) slide.masterId = entity.masterId;
    if (entity.image) slide.image = cloneJson(entity.image);
    slide.elements = elements;
    slides.push(slide as unknown as DeckSlide);
  }
  const meta = input.meta ?? {};
  const base = prev ?? normalizeDeckDocument({});
  if (!slides.length) return base; // 空文档不交给编辑器（它要求至少一页）
  const masters =
    Array.isArray(meta.masters) && meta.masters.length
      ? (cloneJson(meta.masters) as DeckDocument["masters"])
      : base.masters;
  const deck: DeckDocument = {
    version: 2,
    title: typeof meta.title === "string" && meta.title ? meta.title : base.title,
    aspect: meta.aspect === "4:3" ? "4:3" : "16:9",
    theme: (typeof meta.theme === "string" ? meta.theme : base.theme) as DeckDocument["theme"],
    masters,
    slides,
  };
  if (Array.isArray(meta.importWarnings) && meta.importWarnings.length) {
    deck.importWarnings = cloneJson(meta.importWarnings) as string[];
  }
  const source = meta.pptistSource as DeckDocument["pptistSource"] | null | undefined;
  if (source && typeof source === "object") deck.pptistSource = cloneJson(source);
  return deck;
}

/** 选中框同步用：把一组元素 id 变成实体 key 列表。 */
export function deckSelectionKeys(slideId: string, elementIds: readonly string[]): string[] {
  return elementIds.filter(Boolean).map((id) => deckElementKey(slideId, id));
}

// ---------------------------------------------------------------- 回放用纯函数

/** 从协同文档读实体（W11 的 `readEntityState` 落地后可替换；布局见 requests）。 */
export function readEntityStateFromY(doc: unknown, rootName: string): EntityState {
  const root = (doc as { getMap?: (name: string) => { get(key: string): unknown } } | null)?.getMap?.(rootName);
  const plain = (value: unknown): unknown =>
    value && typeof (value as { toJSON?: () => unknown }).toJSON === "function"
      ? (value as { toJSON: () => unknown }).toJSON()
      : value;
  const order = plain(root?.get("order"));
  const entities = plain(root?.get("entities"));
  const meta = plain(root?.get("meta"));
  return {
    order: Array.isArray(order) ? order.map(String) : [],
    entities: entities && typeof entities === "object" ? (entities as EntityState["entities"]) : {},
    meta: meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {},
  };
}

export function deckFromY(doc: unknown): DeckDocument | null {
  const state = readEntityStateFromY(doc, DECK_COLLAB_ROOT);
  return state.order.length ? deckFromEntities(state, null) : null;
}

function restableIds(deck: DeckDocument): DeckDocument {
  // 草稿（IR）转出来的 id 每次随机；回放要在相邻版本间逐页逐元素比，所以按位置重新编号。
  return {
    ...deck,
    slides: deck.slides.map((slide, si) => {
      const id = `draft-slide-${si + 1}`;
      return {
        ...slide,
        id,
        elements: slide.elements.map((element, ei) => ({ ...element, id: `${id}:el-${ei + 1}` })),
      };
    }),
  };
}

/** 作品版本 JSON → 快照。草稿（deck-ir）与普通 deck JSON 都认。 */
export function deckFromRevision(json: unknown): DeckDocument | null {
  if (!json || typeof json !== "object") return null;
  const outer = json as Record<string, unknown>;
  const wrapped = outer.data && typeof outer.data === "object" ? (outer.data as Record<string, unknown>) : null;
  const candidate = wrapped && wrapped.schema === DECK_IR_SCHEMA ? wrapped : outer;
  if (candidate.schema === DECK_IR_SCHEMA && Array.isArray(candidate.slides)) {
    const validation = validateDeckIr(candidate);
    if (validation.ok) return restableIds(deckDocumentFromIr(validation.project));
  }
  const deck = normalizeDeckDocument(json);
  return deck.slides.length ? deck : null;
}

/** 「从这一步接手」：还原成 deck 编辑器能直接打开的 JSON（普通 deck JSON，editor 读时会 normalize）。 */
export function deckToArtifactJson(snapshot: unknown): unknown {
  const deck = snapshot as DeckDocument | null;
  if (!deck || !Array.isArray(deck.slides)) return null;
  return cloneJson(deck);
}

interface ChangeNote {
  zh: string;
  vars?: Record<string, string | number>;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** 两版之间「谁变了」：页 id → 变了的元素 id 集合（含新增；删除的不在内）。 */
export function deckChangedElements(prev: DeckDocument | null | undefined, next: DeckDocument): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const before = new Map<string, Map<string, DeckElement>>();
  for (const slide of prev?.slides ?? []) before.set(slide.id, new Map(slide.elements.map((el) => [el.id, el])));
  for (const slide of next.slides) {
    const old = before.get(slide.id);
    const changed = new Set<string>();
    for (const element of slide.elements) {
      const was = old?.get(element.id);
      if (!was || !sameJson(was, element)) changed.add(element.id);
    }
    if (changed.size) out.set(slide.id, changed);
  }
  return out;
}

export function deckChangeNote(prevRaw: unknown, nextRaw: unknown): ChangeNote | null {
  const prev = prevRaw as DeckDocument | null | undefined;
  const next = nextRaw as DeckDocument | null | undefined;
  if (!next || !Array.isArray(next.slides)) return null;
  if (!prev || !Array.isArray(prev.slides)) return { zh: "创建了演示文稿" };
  const prevIds = prev.slides.map((slide) => slide.id);
  const nextIds = next.slides.map((slide) => slide.id);
  const added = next.slides.filter((slide) => !prevIds.includes(slide.id));
  if (added.length === 1) return { zh: "新增第 {n} 页", vars: { n: nextIds.indexOf(added[0].id) + 1 } };
  if (added.length > 1) return { zh: "新增 {n} 页", vars: { n: added.length } };
  const removed = prev.slides.filter((slide) => !nextIds.includes(slide.id));
  if (removed.length === 1) return { zh: "删除了第 {n} 页", vars: { n: prevIds.indexOf(removed[0].id) + 1 } };
  if (removed.length > 1) return { zh: "删除了 {n} 页", vars: { n: removed.length } };
  if (!sameJson(prevIds, nextIds)) return { zh: "调整了页的顺序" };
  for (let index = 0; index < next.slides.length; index += 1) {
    const a = prev.slides.find((slide) => slide.id === next.slides[index].id) as DeckSlide;
    const b = next.slides[index];
    const n = index + 1;
    if (a.title !== b.title) return { zh: "改了第 {n} 页的标题", vars: { n } };
    const aIds = a.elements.map((el) => el.id);
    const bIds = b.elements.map((el) => el.id);
    const newEls = b.elements.filter((el) => !aIds.includes(el.id));
    if (newEls.length) return { zh: "在第 {n} 页新增了 {k} 个元素", vars: { n, k: newEls.length } };
    const goneEls = a.elements.filter((el) => !bIds.includes(el.id));
    if (goneEls.length) return { zh: "删除了第 {n} 页的 {k} 个元素", vars: { n, k: goneEls.length } };
    for (const element of b.elements) {
      const was = a.elements.find((el) => el.id === element.id) as DeckElement;
      if (sameJson(was, element)) continue;
      if (was.text !== element.text || !sameJson(was.rows, element.rows)) return { zh: "改了第 {n} 页的文字", vars: { n } };
      if (was.src !== element.src) return { zh: "换了第 {n} 页的图片", vars: { n } };
      if (was.x !== element.x || was.y !== element.y || was.width !== element.width || was.height !== element.height || was.rotation !== element.rotation) {
        return { zh: "移动了第 {n} 页的元素", vars: { n } };
      }
      if (was.order !== element.order) return { zh: "调整了第 {n} 页元素的层级", vars: { n } };
      return { zh: "调整了第 {n} 页元素的样式", vars: { n } };
    }
    if (a.body !== b.body || !sameJson(a.bullets, b.bullets)) return { zh: "改了第 {n} 页的正文", vars: { n } };
    if (a.notes !== b.notes) return { zh: "改了第 {n} 页的备注", vars: { n } };
    if (a.background !== b.background || a.layout !== b.layout || a.masterId !== b.masterId || !sameJson(a.transition, b.transition) || !sameJson(a.image, b.image)) {
      return { zh: "改了第 {n} 页的版式或背景", vars: { n } };
    }
  }
  if (prev.title !== next.title) return { zh: "改了演示文稿的标题" };
  if (prev.theme !== next.theme || prev.aspect !== next.aspect || !sameJson(prev.masters, next.masters)) return { zh: "换了主题或母版" };
  return null;
}

export function deckDescribeChange(prev: unknown, next: unknown): string | null {
  const note = deckChangeNote(prev, next);
  if (!note) return null;
  return note.zh.replace(/\{(\w+)\}/g, (match, key: string) => (note.vars && key in note.vars ? String(note.vars[key]) : match));
}

/** 回放这一帧该画哪一页：优先第一处变化所在的页，否则第一页。 */
export function deckFocusSlideIndex(prev: DeckDocument | null | undefined, next: DeckDocument): number {
  if (!next.slides.length) return 0;
  const changed = deckChangedElements(prev, next);
  const prevIds = new Set((prev?.slides ?? []).map((slide) => slide.id));
  for (let index = 0; index < next.slides.length; index += 1) {
    const slide = next.slides[index];
    if (prev && (!prevIds.has(slide.id) || changed.has(slide.id))) return index;
  }
  if (prev) {
    for (let index = 0; index < next.slides.length; index += 1) {
      const was = prev.slides.find((slide) => slide.id === next.slides[index].id);
      if (was && (was.title !== next.slides[index].title || was.notes !== next.slides[index].notes || was.background !== next.slides[index].background)) return index;
    }
  }
  return 0;
}
