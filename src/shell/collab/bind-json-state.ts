/**
 * 实体型绑定（契约 §8.4）：把编辑器自己的 JSON 状态映射成 Yjs 文档。
 *
 * 文档布局（每个编辑器族一个顶层 `Y.Map`，名字约定 `oceanleo:<editorKind>`）：
 *
 *   doc.getMap(rootName)
 *     "order"    : Y.Array<string>           实体 id 的顺序
 *     "entities" : Y.Map<Y.Map<unknown>>     每个实体一个 Y.Map；顶层字段为键，字段内的值整体替换
 *     "meta"     : Y.Map<unknown>            作品级设置（每个键整体替换）
 *
 * 合并语义：同一实体不同字段并发修改都保留；同一字段后写者胜；两人同时新增各自保留；
 * 删除优先（实体被删后，别人对它的字段写入随之丢弃）；并发移动同一项可能让 order 里出现重复 id，
 * 读出时按「第一次出现」去重并丢掉没有实体的 id。
 *
 * 纯函数 `readJsonStateRoot` / `writeJsonStateRoot` 不依赖房间，回放的 `fromY(doc)` 与测试直接用。
 */
import { Array as YArray, Map as YMap, type Doc, type Transaction, type YEvent } from "yjs";
import type { BindJsonStateOptions, CollabRoom, EntityShape, JsonStateBinding } from "./index";
import { isCollabReadOnly } from "./provider";

/** 本地写入的事务 origin；`onRemote` 只回调来源不是它的事务。 */
export const LOCAL_ORIGIN = Symbol("oceanleo-collab-local");
/** 种子写入的事务 origin（本地写，也不回调 onRemote）。 */
export const SEED_ORIGIN = Symbol("oceanleo-collab-seed");

export interface JsonStateSnapshot {
  order: string[];
  entities: Record<string, Record<string, unknown>>;
  meta: Record<string, unknown>;
}

// ---------------------------------------------------------------- 值比较
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || typeof a !== "object") {
    return typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b);
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    if (a.length !== bb.length) return false;
    for (let i = 0; i < a.length; i += 1) if (!deepEqual(a[i], bb[i])) return false;
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).filter((k) => ao[k] !== undefined);
  const bk = Object.keys(bo).filter((k) => bo[k] !== undefined);
  if (ak.length !== bk.length) return false;
  for (const k of ak) if (!deepEqual(ao[k], bo[k])) return false;
  return true;
}

/** 存进 Yjs 的值必须是 JSON：深拷贝并剔除 undefined，避免外部之后原地修改污染文档。 */
function plain(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : plain(v)));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v !== undefined) out[k] = plain(v);
  }
  return out;
}

// ---------------------------------------------------------------- 结构
interface RootParts {
  order: YArray<string> | null;
  entities: YMap<YMap<unknown>> | null;
  meta: YMap<unknown> | null;
}

function rootParts(doc: Doc, rootName: string): RootParts {
  const root = doc.getMap<unknown>(rootName);
  const order = root.get("order");
  const entities = root.get("entities");
  const meta = root.get("meta");
  return {
    order: order instanceof YArray ? (order as YArray<string>) : null,
    entities: entities instanceof YMap ? (entities as YMap<YMap<unknown>>) : null,
    meta: meta instanceof YMap ? (meta as YMap<unknown>) : null,
  };
}

/** 在事务里补齐三个子结构（只补缺的）。 */
function ensureParts(doc: Doc, rootName: string): { order: YArray<string>; entities: YMap<YMap<unknown>>; meta: YMap<unknown> } {
  const root = doc.getMap<unknown>(rootName);
  const parts = rootParts(doc, rootName);
  let { order, entities, meta } = parts;
  if (!order) {
    order = new YArray<string>();
    root.set("order", order);
  }
  if (!entities) {
    entities = new YMap<YMap<unknown>>();
    root.set("entities", entities);
  }
  if (!meta) {
    meta = new YMap<unknown>();
    root.set("meta", meta);
  }
  return { order, entities, meta };
}

/** 文档里有没有这套状态的任何内容（没种过 = false）。 */
export function hasJsonStateRoot(doc: Doc, rootName: string): boolean {
  if (!doc.share.has(rootName)) return false;
  const { order, entities, meta } = rootParts(doc, rootName);
  return Boolean(order || entities || meta);
}

/** 只读：按本文件的布局把文档里的状态读成纯 JSON。不依赖 room。 */
export function readJsonStateRoot(doc: Doc, rootName: string): JsonStateSnapshot {
  const out: JsonStateSnapshot = { order: [], entities: {}, meta: {} };
  if (!doc.share.has(rootName)) return out;
  const { order, entities, meta } = rootParts(doc, rootName);
  if (entities) {
    entities.forEach((ent, id) => {
      if (ent instanceof YMap) out.entities[id] = ent.toJSON() as Record<string, unknown>;
    });
  }
  if (order) {
    const seen = new Set<string>();
    for (const id of order.toArray()) {
      if (typeof id !== "string" || seen.has(id) || !(id in out.entities)) continue;
      seen.add(id);
      out.order.push(id);
    }
  }
  if (meta) out.meta = meta.toJSON() as Record<string, unknown>;
  return out;
}

// ---------------------------------------------------------------- 写入
/** 最长递增子序列（返回被保留的下标集合）：移动最少的项。 */
function lisIndices(values: number[]): Set<number> {
  const tails: number[] = [];
  const tailIdx: number[] = [];
  const prev: number[] = new Array(values.length).fill(-1);
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i]!;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid]! < v) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = v;
    tailIdx[lo] = i;
    prev[i] = lo > 0 ? tailIdx[lo - 1]! : -1;
  }
  const keep = new Set<number>();
  let k = tailIdx.length ? tailIdx[tailIdx.length - 1]! : -1;
  while (k >= 0) {
    keep.add(k);
    k = prev[k]!;
  }
  return keep;
}

function writeOrder(order: YArray<string>, next: string[]): void {
  const wanted = new Set(next);
  // 1) 删：不要的、重复出现的（保留第一次出现）。
  const first = new Set<string>();
  const arr = order.toArray();
  const keepAt = new Array<boolean>(arr.length);
  for (let i = 0; i < arr.length; i += 1) {
    const id = arr[i]!;
    keepAt[i] = wanted.has(id) && !first.has(id);
    if (keepAt[i]) first.add(id);
  }
  for (let i = arr.length - 1; i >= 0; i -= 1) if (!keepAt[i]) order.delete(i, 1);

  // 2) 现有序列里，保留与目标顺序一致的最长一段，其余的删掉重插。
  const pos = new Map<string, number>();
  next.forEach((id, i) => pos.set(id, i));
  const current = order.toArray();
  const keep = lisIndices(current.map((id) => pos.get(id) ?? -1));
  for (let i = current.length - 1; i >= 0; i -= 1) if (!keep.has(i)) order.delete(i, 1);

  // 3) 自左向右补齐：前 i 项已与目标一致，第 i 项不对就插入。
  for (let i = 0; i < next.length; i += 1) {
    if (order.length > i && order.get(i) === next[i]) continue;
    order.insert(i, [next[i]!]);
  }
}

function writeFields(target: YMap<unknown>, fields: Record<string, unknown>): void {
  for (const [key, raw] of Object.entries(fields)) {
    if (raw === undefined) continue;
    const value = plain(raw);
    if (!target.has(key) || !deepEqual(target.get(key), value)) target.set(key, value);
  }
  for (const key of Array.from(target.keys())) {
    if (fields[key] === undefined) target.delete(key);
  }
}

/** 只写与文档不同的部分；一次事务。`origin` 默认 `LOCAL_ORIGIN`。 */
export function writeJsonStateRoot(doc: Doc, rootName: string, shape: EntityShape, origin: unknown = LOCAL_ORIGIN): void {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const id of shape.order) {
    if (!seen.has(id) && shape.entities[id]) {
      seen.add(id);
      ids.push(id);
    }
  }
  doc.transact(() => {
    const { order, entities, meta } = ensureParts(doc, rootName);
    for (const id of Array.from(entities.keys())) {
      if (!seen.has(id)) entities.delete(id);
    }
    for (const id of ids) {
      let ent = entities.get(id);
      if (!(ent instanceof YMap)) {
        ent = new YMap<unknown>();
        entities.set(id, ent);
      }
      writeFields(ent, shape.entities[id]!);
    }
    writeOrder(order, ids);
    writeFields(meta, shape.meta ?? {});
  }, origin);
}

// ---------------------------------------------------------------- 绑定
export function bindJsonState<T>(opts: BindJsonStateOptions<T>): JsonStateBinding<T> {
  const { room, rootName, toEntities, fromEntities } = opts;
  const doc = room.doc;
  const listeners = new Set<(state: T) => void>();
  let prev: T | null = null;
  let destroyed = false;

  const root = doc.getMap<unknown>(rootName);
  const readState = (): T | null => {
    if (!hasJsonStateRoot(doc, rootName)) return null;
    const snap = readJsonStateRoot(doc, rootName);
    return fromEntities(snap, prev);
  };

  const onDeep = (_events: Array<YEvent<any>>, tr: Transaction) => {
    if (destroyed) return;
    if (tr.origin === LOCAL_ORIGIN || tr.origin === SEED_ORIGIN) return;
    const next = readState();
    if (next === null) return;
    prev = next;
    for (const cb of Array.from(listeners)) cb(next);
  };
  root.observeDeep(onDeep);

  return {
    push(state: T) {
      if (destroyed || isCollabReadOnly(room)) return;
      writeJsonStateRoot(doc, rootName, toEntities(state), LOCAL_ORIGIN);
      prev = state;
    },
    seed(state: T) {
      if (destroyed || !room.needsSeed) return;
      writeJsonStateRoot(doc, rootName, toEntities(state), SEED_ORIGIN);
      prev = state;
      room.completeSeed([rootName]);
    },
    onRemote(cb: (state: T) => void) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    read: () => (destroyed ? null : readState()),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      root.unobserveDeep(onDeep);
      listeners.clear();
    },
  };
}

export type { CollabRoom };
