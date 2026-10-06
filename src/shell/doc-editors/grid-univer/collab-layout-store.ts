// 表格多人同改：行列 id 顺序在共享文档里的存取（work-chat 第二轮 F10）。
//
// 布局放在 `oceanleo:grid` 根 Map 里（和 `order / entities / meta` 同一层），每张工作表两个 `Y.Array<string>`：
//   `rows:<sheetId>`  行 id 顺序        `cols:<sheetId>`  列 id 顺序
// 再加一个 `format = "ids-v2"` 标记。放在这个根里，服务端按根转 JSON（回放）时自然带上它们。
//
// 合并语义（Yjs 数组）：两人同时在同一位置各插一行，两行都在、顺序双方一致；删行 = 删掉那个 id；
// 排序 = 只动行顺序。并发移动同一项可能让数组里出现重复 id：读出时按「第一次出现」去重，
// `dedupe()` 再把后面的重复删掉（所有客户端按同一规则删同一批，互相不冲突）。
//
// 本地结构命令即时写进数组（`applyLocal`，按行列在数组里的原位置精确插入 / 删除），
// 不等去抖，所以别人那边几乎立刻看到行列变化。

import { Array as YArray, type Doc } from "yjs";
import { LOCAL_ORIGIN, SEED_ORIGIN, readJsonStateRoot, writeJsonStateRoot } from "../../collab/bind-json-state";
import { GRID_COLLAB_ROOT, migrateGridEntities } from "../../collab/adapters/grid";
import {
  GRID_LAYOUT_COLS_PREFIX,
  GRID_LAYOUT_FORMAT,
  GRID_LAYOUT_FORMAT_KEY,
  GRID_LAYOUT_ROWS_PREFIX,
  gridLayoutKey,
  type GridAxis,
  type GridLayout,
  type GridLayoutStore,
} from "./collab-layout-model";

export type { GridLayoutStore } from "./collab-layout-model";

export interface GridLayoutStoreOptions {
  doc: Doc;
  canWrite?: () => boolean;
  rootName?: string;
}

/** 数组里按第一次出现去重后的「可见」id，以及它们在原数组里的下标。 */
function visibleOf(arr: YArray<string>): { ids: string[]; raw: number[]; length: number } {
  const seen = new Set<string>();
  const ids: string[] = [];
  const raw: number[] = [];
  const all = arr.toArray();
  all.forEach((id, i) => {
    if (typeof id !== "string" || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
    raw.push(i);
  });
  return { ids, raw, length: all.length };
}

function lis(values: number[]): Set<number> {
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

/** 把数组改成 `next`，只做最少的删 / 插（和实体绑定里 `order` 的写法一致）。 */
function writeIds(arr: YArray<string>, next: readonly string[]): void {
  const wanted = new Set(next);
  const first = new Set<string>();
  const all = arr.toArray();
  const keepAt = all.map((id) => {
    const keep = typeof id === "string" && wanted.has(id) && !first.has(id);
    if (keep) first.add(id);
    return keep;
  });
  for (let i = all.length - 1; i >= 0; i -= 1) if (!keepAt[i]) arr.delete(i, 1);
  const pos = new Map<string, number>();
  next.forEach((id, i) => pos.set(id, i));
  const current = arr.toArray();
  const keep = lis(current.map((id) => pos.get(id) ?? -1));
  for (let i = current.length - 1; i >= 0; i -= 1) if (!keep.has(i)) arr.delete(i, 1);
  for (let i = 0; i < next.length; i += 1) {
    if (arr.length > i && arr.get(i) === next[i]) continue;
    arr.insert(i, [next[i]!]);
  }
}

export function createGridLayoutStore(options: GridLayoutStoreOptions): GridLayoutStore {
  const { doc } = options;
  const rootName = options.rootName ?? GRID_COLLAB_ROOT;
  const root = doc.getMap<unknown>(rootName);
  const canWrite = () => (options.canWrite ? options.canWrite() : true);

  const arrayOf = (axis: GridAxis, sheetId: string): YArray<string> | null => {
    const value = root.get(gridLayoutKey(axis, sheetId));
    return value instanceof YArray ? (value as YArray<string>) : null;
  };

  const read = (): GridLayout | null => {
    if (root.get(GRID_LAYOUT_FORMAT_KEY) !== GRID_LAYOUT_FORMAT) return null;
    const layout: GridLayout = {};
    for (const key of Array.from(root.keys())) {
      let axis: "rows" | "cols" | null = null;
      let sheetId = "";
      if (key.startsWith(GRID_LAYOUT_ROWS_PREFIX)) {
        axis = "rows";
        sheetId = key.slice(GRID_LAYOUT_ROWS_PREFIX.length);
      } else if (key.startsWith(GRID_LAYOUT_COLS_PREFIX)) {
        axis = "cols";
        sheetId = key.slice(GRID_LAYOUT_COLS_PREFIX.length);
      }
      const value = root.get(key);
      if (!axis || !sheetId || !(value instanceof YArray)) continue;
      const sheet = (layout[sheetId] ??= { rows: [], cols: [] });
      sheet[axis] = visibleOf(value as YArray<string>).ids;
    }
    return layout;
  };

  const writeSheet = (sheetId: string, ids: { rows: readonly string[]; cols: readonly string[] }) => {
    for (const axis of ["row", "col"] as const) {
      const wanted = axis === "row" ? ids.rows : ids.cols;
      const arr = arrayOf(axis, sheetId);
      if (!arr) {
        const created = new YArray<string>();
        if (wanted.length > 0) created.insert(0, wanted.slice());
        root.set(gridLayoutKey(axis, sheetId), created);
        continue;
      }
      const have = visibleOf(arr);
      if (have.length === have.ids.length && have.ids.length === wanted.length && have.ids.every((id, i) => id === wanted[i])) {
        continue;
      }
      writeIds(arr, wanted);
    }
  };

  const isLegacy = (): boolean => {
    if (root.get(GRID_LAYOUT_FORMAT_KEY) === GRID_LAYOUT_FORMAT) return false;
    if (!doc.share.has(rootName)) return false;
    const state = readJsonStateRoot(doc, rootName);
    return Object.keys(state.entities).length > 0 || Object.keys(state.meta).length > 0;
  };

  return {
    read,
    isLegacy,
    canWrite,
    batch(fn) {
      if (!canWrite()) return fn();
      doc.transact(fn, LOCAL_ORIGIN);
    },
    seed(layout) {
      doc.transact(() => {
        root.set(GRID_LAYOUT_FORMAT_KEY, GRID_LAYOUT_FORMAT);
        for (const [sheetId, ids] of Object.entries(layout)) writeSheet(sheetId, ids);
      }, SEED_ORIGIN);
    },
    applyLocal(op) {
      if (!canWrite()) return;
      doc.transact(() => {
        if (op.kind === "reorder") {
          const arr = arrayOf("row", op.sheetId);
          if (!arr) return;
          const view = visibleOf(arr);
          const next = view.ids.slice();
          const old = next.slice(op.start, op.start + op.order.length);
          op.order.forEach((source, i) => {
            const id = old[source];
            if (id !== undefined) next[op.start + i] = id;
          });
          writeIds(arr, next);
          return;
        }
        const arr = arrayOf(op.axis, op.sheetId);
        if (!arr) return;
        if (op.kind === "insert") {
          const ids = op.ids ?? [];
          if (ids.length === 0) return;
          const view = visibleOf(arr);
          const at = Math.max(0, Math.min(op.at, view.ids.length));
          const rawAt = at < view.ids.length ? view.raw[at]! : view.length;
          arr.insert(rawAt, ids.slice());
          return;
        }
        const view = visibleOf(arr);
        if (op.kind === "remove") {
          const targets = view.raw.slice(op.at, op.at + op.count);
          for (let i = targets.length - 1; i >= 0; i -= 1) arr.delete(targets[i]!, 1);
          return;
        }
        // move：整块取出再插回去。
        const next = view.ids.slice();
        const block = next.splice(op.from, op.count);
        next.splice(Math.max(0, Math.min(op.to, next.length)), 0, ...block);
        writeIds(arr, next);
      }, LOCAL_ORIGIN);
    },
    sync(layout, removedSheets = []) {
      if (!canWrite()) return;
      doc.transact(() => {
        for (const [sheetId, ids] of Object.entries(layout)) writeSheet(sheetId, ids);
        for (const sheetId of removedSheets) {
          root.delete(gridLayoutKey("row", sheetId));
          root.delete(gridLayoutKey("col", sheetId));
        }
      }, LOCAL_ORIGIN);
    },
    migrate() {
      if (!canWrite()) return false;
      let migrated = false;
      doc.transact(() => {
        // 在事务里再查一次：别的客户端的迁移可能刚刚到达。
        if (root.get(GRID_LAYOUT_FORMAT_KEY) === GRID_LAYOUT_FORMAT) return;
        if (!doc.share.has(rootName)) return;
        const legacy = readJsonStateRoot(doc, rootName);
        if (Object.keys(legacy.entities).length === 0 && Object.keys(legacy.meta).length === 0) return;
        const { layout, encoded } = migrateGridEntities(legacy);
        root.set(GRID_LAYOUT_FORMAT_KEY, GRID_LAYOUT_FORMAT);
        for (const [sheetId, ids] of Object.entries(layout)) writeSheet(sheetId, ids);
        writeJsonStateRoot(doc, rootName, encoded, LOCAL_ORIGIN);
        migrated = true;
      }, LOCAL_ORIGIN);
      return migrated;
    },
    dedupe() {
      if (!canWrite()) return 0;
      let removed = 0;
      doc.transact(() => {
        for (const key of Array.from(root.keys())) {
          if (!key.startsWith(GRID_LAYOUT_ROWS_PREFIX) && !key.startsWith(GRID_LAYOUT_COLS_PREFIX)) continue;
          const value = root.get(key);
          if (!(value instanceof YArray)) continue;
          const arr = value as YArray<string>;
          const all = arr.toArray();
          for (let i = all.length - 1; i >= 0; i -= 1) {
            // 从后往前删：保留第一次出现的那个。
            const id = all[i]!;
            const firstAt = all.indexOf(id);
            if (firstAt !== i) {
              arr.delete(i, 1);
              removed += 1;
            }
          }
        }
      }, LOCAL_ORIGIN);
      return removed;
    },
  };
}

