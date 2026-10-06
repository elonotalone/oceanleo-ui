// 图片（Fabric 画布）的多人同改适配器 + 回放纯函数（work-chat W13，契约 §8.4 / §9.15）。
//
// 实体模型：
//   order    = 画布对象的叠放顺序（oceanleoId 列表，底 → 顶）；
//   对象实体  key = oceanleoId，字段 = Fabric `toObject(SNAPSHOT_PROPS)` 的顶层键（left/top/scaleX/angle/src/text/fill…，值整体替换）；
//   meta      = { doc: {width,height}, canvasBackground, json: Fabric 顶层里除 objects 之外的键 }。
// 没有稳定 id 的对象（旧稿）：编辑器在种子/推送前调用控制器的 ensureObjectIds() 写回 id；
// 万一仍然没有，这里按位置生成 `obj-<序号>`，并把它写进实体的 oceanleoId 字段，接收端因此拿到同一个 id。
//
// 纯函数、不依赖 React / 浏览器 / yjs；React 部分在 src/shell/replay/work/frames/image.tsx。

export interface EntityState {
  order: string[];
  entities: Record<string, Record<string, unknown>>;
  meta: Record<string, unknown>;
}

/** 从协同文档读实体（W11 的 `readEntityState` 落地后可替换；布局见 W13-requests）。 */
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

export const IMAGE_COLLAB_ROOT = "oceanleo:image";

export interface ImageSnapshot {
  json: Record<string, unknown>;
  doc: { width: number; height: number };
  canvasBackground: string;
}

type FabricJson = Record<string, unknown>;

function cloneJson<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function objectsOf(snapshot: { json?: Record<string, unknown> } | null | undefined): FabricJson[] {
  const list = snapshot?.json?.objects;
  return Array.isArray(list) ? (list.filter((item) => item && typeof item === "object") as FabricJson[]) : [];
}

/** 给没有 id 的对象一个按位置生成的 id（不改入参）。 */
export function imageObjectIds(objects: readonly FabricJson[]): string[] {
  const used = new Set<string>();
  return objects.map((object, index) => {
    let id = typeof object.oceanleoId === "string" && object.oceanleoId ? object.oceanleoId : `obj-${index + 1}`;
    while (used.has(id)) id = `${id}~${index}`;
    used.add(id);
    return id;
  });
}

export function imageToEntities(snapshot: ImageSnapshot): EntityState {
  const objects = objectsOf(snapshot);
  const ids = imageObjectIds(objects);
  const entities: Record<string, Record<string, unknown>> = {};
  objects.forEach((object, index) => {
    entities[ids[index]] = { ...cloneJson(object), oceanleoId: ids[index] };
  });
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snapshot.json ?? {})) {
    if (key !== "objects") rest[key] = cloneJson(value);
  }
  return {
    order: ids,
    entities,
    meta: {
      doc: { width: snapshot.doc.width, height: snapshot.doc.height },
      canvasBackground: snapshot.canvasBackground,
      json: rest,
    },
  };
}

export function imageFromEntities(input: EntityState, prev: ImageSnapshot | null): ImageSnapshot {
  const seen = new Set<string>();
  const objects: FabricJson[] = [];
  for (const id of input.order) {
    const entity = input.entities[id];
    if (seen.has(id) || !entity || typeof entity !== "object") continue;
    seen.add(id);
    objects.push({ ...cloneJson(entity) });
  }
  const meta = input.meta ?? {};
  const doc = meta.doc as { width?: unknown; height?: unknown } | undefined;
  const width = typeof doc?.width === "number" && Number.isFinite(doc.width) ? doc.width : prev?.doc.width ?? 1080;
  const height = typeof doc?.height === "number" && Number.isFinite(doc.height) ? doc.height : prev?.doc.height ?? 1080;
  const rest = meta.json && typeof meta.json === "object" ? (cloneJson(meta.json) as FabricJson) : {};
  return {
    json: { ...rest, objects },
    doc: { width, height },
    canvasBackground:
      typeof meta.canvasBackground === "string" ? meta.canvasBackground : prev?.canvasBackground ?? "#ffffff",
  };
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function byId(snapshot: ImageSnapshot | null | undefined): Map<string, FabricJson> {
  const objects = objectsOf(snapshot);
  const ids = imageObjectIds(objects);
  return new Map(ids.map((id, index) => [id, objects[index]]));
}

/** 两版之间发生变化的对象 id（新增 + 改动；删除的另算）。 */
export function imageChangedObjects(prev: ImageSnapshot | null | undefined, next: ImageSnapshot): { changed: Set<string>; added: Set<string>; removed: Set<string> } {
  const before = byId(prev);
  const after = byId(next);
  const changed = new Set<string>();
  const added = new Set<string>();
  const removed = new Set<string>();
  for (const [id, object] of after) {
    if (!before.has(id)) {
      added.add(id);
      changed.add(id);
    } else if (!sameJson(before.get(id), object)) {
      changed.add(id);
    }
  }
  for (const id of before.keys()) if (!after.has(id)) removed.add(id);
  return { changed, added, removed };
}

/**
 * 把「别人带来的变化」（base → remote）按对象套进一份旧快照（撤销/重做栈里的）：
 * 这样本地撤销只会把自己改过的对象改回去，不会把别人的改动一并撤掉。
 */
export function imageRebaseSnapshot(target: ImageSnapshot, base: ImageSnapshot, remote: ImageSnapshot): ImageSnapshot {
  const delta = imageChangedObjects(base, remote);
  if (!delta.changed.size && !delta.removed.size && sameJson(base.doc, remote.doc) && base.canvasBackground === remote.canvasBackground) {
    return target;
  }
  const remoteById = byId(remote);
  const remoteOrder = imageObjectIds(objectsOf(remote));
  const targetObjects = objectsOf(target);
  const targetIds = imageObjectIds(targetObjects);
  const next: FabricJson[] = [];
  const nextIds: string[] = [];
  targetIds.forEach((id, index) => {
    if (delta.removed.has(id)) return;
    if (delta.changed.has(id) && remoteById.has(id)) {
      next.push(cloneJson(remoteById.get(id) as FabricJson));
    } else {
      next.push(targetObjects[index]);
    }
    nextIds.push(id);
  });
  for (const id of delta.added) {
    if (nextIds.includes(id)) continue;
    // 插在它在 remote 里前一个邻居的后面（找不到就放顶层）
    const at = remoteOrder.indexOf(id);
    let insertAt = next.length;
    for (let i = at - 1; i >= 0; i -= 1) {
      const neighbour = nextIds.indexOf(remoteOrder[i]);
      if (neighbour >= 0) {
        insertAt = neighbour + 1;
        break;
      }
      if (i === 0) insertAt = 0;
    }
    next.splice(insertAt, 0, cloneJson(remoteById.get(id) as FabricJson));
    nextIds.splice(insertAt, 0, id);
  }
  const metaChanged = !sameJson(base.doc, remote.doc) || base.canvasBackground !== remote.canvasBackground;
  return {
    json: { ...target.json, objects: next },
    doc: metaChanged ? { ...remote.doc } : target.doc,
    canvasBackground: metaChanged ? remote.canvasBackground : target.canvasBackground,
  };
}

// ---------------------------------------------------------------- 回放用纯函数

export function imageFromY(doc: unknown): ImageSnapshot | null {
  const state = readEntityStateFromY(doc, IMAGE_COLLAB_ROOT);
  return state.order.length || Object.keys(state.meta).length ? imageFromEntities(state, null) : null;
}

/** 版本 JSON：`{schema:"oceanleo.fabric-image.v1", snapshot}`（也认 `data`）或直接是快照。 */
export function imageFromRevision(json: unknown): ImageSnapshot | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const wrapper = json as { snapshot?: unknown; data?: unknown; json?: unknown };
  const candidate = (wrapper.snapshot ?? wrapper.data ?? json) as Partial<ImageSnapshot> | null;
  if (!candidate || typeof candidate !== "object") return null;
  const objects = (candidate.json as { objects?: unknown } | undefined)?.objects;
  const width = candidate.doc?.width;
  const height = candidate.doc?.height;
  if (!Array.isArray(objects) || typeof width !== "number" || typeof height !== "number") return null;
  return {
    json: cloneJson(candidate.json as FabricJson),
    doc: { width, height },
    canvasBackground: typeof candidate.canvasBackground === "string" ? candidate.canvasBackground.slice(0, 100) : "#ffffff",
  };
}

/** 「从这一步接手」：还原成图片编辑器认的工程 JSON（FabricImageProject 的形状）。 */
export function imageToArtifactJson(snapshot: unknown): unknown {
  const value = snapshot as ImageSnapshot | null;
  if (!value || !value.json || !Array.isArray(value.json.objects)) return null;
  return {
    schema: "oceanleo.fabric-image.v1",
    version: 1,
    updatedAt: new Date().toISOString(),
    snapshot: cloneJson(value),
  };
}

export type ImageObjectKind = "text" | "image" | "shape" | "draw" | "other";

export function imageObjectKind(object: FabricJson): ImageObjectKind {
  const type = String(object.type ?? "").toLowerCase();
  if (type === "text" || type === "i-text" || type === "itext" || type === "textbox") return "text";
  if (type === "image") return "image";
  if (type === "path") return "draw";
  if (["rect", "circle", "ellipse", "triangle", "polygon", "polyline", "line"].includes(type)) return "shape";
  return "other";
}

export interface ImageObjectBox {
  id: string;
  kind: ImageObjectKind;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** 画布坐标下对象的外框（已考虑缩放与原点；旋转用 angle 另给）。 */
export function imageObjectBox(object: FabricJson, id: string): ImageObjectBox {
  const width = Math.abs(finite(object.width, 0) * finite(object.scaleX, 1));
  const height = Math.abs(finite(object.height, 0) * finite(object.scaleY, 1));
  const left = finite(object.left, 0);
  const top = finite(object.top, 0);
  const originX = object.originX === "center" ? 0.5 : object.originX === "right" ? 1 : 0;
  const originY = object.originY === "center" ? 0.5 : object.originY === "bottom" ? 1 : 0;
  return { id, kind: imageObjectKind(object), x: left - width * originX, y: top - height * originY, width, height, angle: finite(object.angle, 0) };
}

export function imageBoxes(snapshot: ImageSnapshot | null | undefined): Array<ImageObjectBox & { raw: FabricJson }> {
  const objects = objectsOf(snapshot);
  const ids = imageObjectIds(objects);
  return objects
    .map((object, index) => ({ ...imageObjectBox(object, ids[index]), raw: object }))
    .filter((box) => (box.raw.oceanleoRole as string | undefined) !== "background");
}

interface ChangeNote {
  zh: string;
  vars?: Record<string, string | number>;
}

const ADDED_NOTE: Record<ImageObjectKind, ChangeNote> = {
  text: { zh: "新增了一个文字图层" },
  image: { zh: "新增了一个图片图层" },
  shape: { zh: "新增了一个形状图层" },
  draw: { zh: "新增了一个画笔图层" },
  other: { zh: "新增了一个图层" },
};

export function imageChangeNote(prevRaw: unknown, nextRaw: unknown): ChangeNote | null {
  const prev = prevRaw as ImageSnapshot | null | undefined;
  const next = nextRaw as ImageSnapshot | null | undefined;
  if (!next || !next.json) return null;
  if (!prev || !prev.json) return { zh: "创建了画布" };
  const delta = imageChangedObjects(prev, next);
  const after = byId(next);
  const before = byId(prev);
  if (delta.added.size === 1) {
    const kind = imageObjectKind(after.get([...delta.added][0]) as FabricJson);
    return ADDED_NOTE[kind];
  }
  if (delta.added.size > 1) return { zh: "新增了 {n} 个图层", vars: { n: delta.added.size } };
  if (delta.removed.size) return { zh: "删除了 {n} 个图层", vars: { n: delta.removed.size } };
  const order = (snapshot: ImageSnapshot) => imageObjectIds(objectsOf(snapshot)).join("|");
  const changed = [...delta.changed];
  if (changed.length) {
    const id = changed[0];
    const a = before.get(id) as FabricJson;
    const b = after.get(id) as FabricJson;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const differing = [...keys].filter((key) => !sameJson(a[key], b[key]));
    if (differing.some((key) => key === "text")) return { zh: "改了文字内容" };
    if (differing.some((key) => key === "src")) return { zh: "换了一张图片" };
    const moveKeys = ["left", "top"];
    const sizeKeys = ["scaleX", "scaleY", "width", "height", "angle", "flipX", "flipY", "skewX", "skewY"];
    if (differing.every((key) => moveKeys.includes(key))) return { zh: "移动了一个图层" };
    if (differing.every((key) => moveKeys.includes(key) || sizeKeys.includes(key))) return { zh: "调整了一个图层的大小或角度" };
    return { zh: "改了一个图层的样式" };
  }
  if (order(prev) !== order(next)) return { zh: "调整了图层顺序" };
  if (prev.doc.width !== next.doc.width || prev.doc.height !== next.doc.height) return { zh: "改了画布大小" };
  if (prev.canvasBackground !== next.canvasBackground) return { zh: "改了画布底色" };
  return null;
}

export function imageDescribeChange(prev: unknown, next: unknown): string | null {
  const note = imageChangeNote(prev, next);
  if (!note) return null;
  return note.zh.replace(/\{(\w+)\}/g, (match, key: string) => (note.vars && key in note.vars ? String(note.vars[key]) : match));
}

/** 只允许放进 <img src> 的地址：http(s) 与位图 data URL（不放行 svg、javascript:、blob:）。 */
export function imageSafeSrc(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(value)) return value;
  return null;
}
