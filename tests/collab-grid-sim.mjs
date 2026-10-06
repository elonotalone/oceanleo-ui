/**
 * 表格多人同改（work-chat 第二轮 F10）的测试替身：不是测试文件（不以 .test.mjs 结尾，整套测试不会跑它）。
 *
 * - `refApplyOp`：结构操作作用在「按位置存的工作簿快照」上的参考语义（插入 / 删除 / 移动行列、排序）。
 *   `collab-grid-engine.test.mjs` 把它和真实的 Univer 引擎逐条对照过，所以可信。
 * - `makeClient` / `makeNetwork`：两个客户端共用一份文档（两个 Y.Doc 手动同步），
 *   每个客户端是「真 bindJsonState + 真绑定器 + 真行列布局存储 + 参考语义的假画布」。
 */
import * as Y from "yjs";

import { bindJsonState } from "../src/shell/collab/bind-json-state.ts";
import {
  GRID_COLLAB_ROOT,
  applyGridCellChanges,
  createGridCollabBinder,
  gridFromY,
} from "../src/shell/collab/adapters/grid.ts";
import { createGridLayoutStore } from "../src/shell/doc-editors/grid-univer/collab-layout-store.ts";

export { Y, GRID_COLLAB_ROOT, gridFromY };

function isRec(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** 旧下标 → 新下标（null = 被删掉）。 */
function remap(op, size) {
  const ids = Array.from({ length: size }, (_, i) => i);
  if (op.kind === "insert") {
    return (i) => (i >= op.at ? i + op.count : i);
  }
  if (op.kind === "remove") {
    return (i) => (i < op.at ? i : i < op.at + op.count ? null : i - op.count);
  }
  if (op.kind === "move") {
    const next = ids.slice();
    const block = next.splice(op.from, op.count);
    next.splice(op.to, 0, ...block);
    const where = new Map(next.map((old, now) => [old, now]));
    return (i) => where.get(i) ?? i;
  }
  const where = new Map();
  op.order.forEach((source, i) => where.set(op.start + source, op.start + i));
  return (i) => where.get(i) ?? i;
}

function reindexRecord(record, fn) {
  const out = {};
  for (const key of Object.keys(record ?? {})) {
    const to = fn(Number(key));
    if (to === null) continue;
    out[String(to)] = record[key];
  }
  return out;
}

/** 在位置形式的快照上执行一个结构操作（原地修改）。 */
export function refApplyOp(snapshot, op) {
  const sheet = snapshot.sheets[op.sheetId];
  if (!sheet) return;
  const rowsAxis = op.kind === "reorder" || op.axis === "row";
  const size = Math.max(sheet.rowCount ?? 0, sheet.columnCount ?? 0, 4096);
  const fn = remap(op, size);
  if (rowsAxis) {
    sheet.cellData = reindexRecord(sheet.cellData, fn);
    if (op.kind !== "reorder") {
      if (sheet.rowData) sheet.rowData = reindexRecord(sheet.rowData, fn);
      if (op.kind === "insert") sheet.rowCount += op.count;
      if (op.kind === "remove") sheet.rowCount -= op.count;
    }
  } else {
    for (const row of Object.keys(sheet.cellData ?? {})) {
      sheet.cellData[row] = reindexRecord(sheet.cellData[row], fn);
    }
    if (sheet.columnData) sheet.columnData = reindexRecord(sheet.columnData, fn);
    if (op.kind === "insert") sheet.columnCount += op.count;
    if (op.kind === "remove") sheet.columnCount -= op.count;
  }
}

/** 按计划在位置形式的快照上执行（参考语义；和 `executeRemotePlan` 在真引擎里的效果对照过）。 */
export function refApplyPlan(snapshot, plan) {
  for (const op of plan.meta) {
    if (op.kind === "sheet-remove") {
      delete snapshot.sheets[op.sheetId];
      snapshot.sheetOrder = snapshot.sheetOrder.filter((id) => id !== op.sheetId);
    }
  }
  for (const op of plan.structure) refApplyOp(snapshot, op);
  for (const op of plan.meta) {
    const sheet = snapshot.sheets[op.sheetId];
    if (op.kind === "row-data" && sheet) {
      sheet.rowData ??= {};
      for (const [row, value] of Object.entries(op.data)) {
        if (value === null) delete sheet.rowData[row];
        else sheet.rowData[row] = { ...(sheet.rowData[row] ?? {}), ...value };
      }
    } else if (op.kind === "col-data" && sheet) {
      sheet.columnData ??= {};
      for (const [col, value] of Object.entries(op.data)) {
        if (value === null) delete sheet.columnData[col];
        else sheet.columnData[col] = { ...(sheet.columnData[col] ?? {}), ...value };
      }
    } else if (op.kind === "merge" && sheet) {
      sheet.mergeData = structuredClone(op.add);
    }
  }
  const next = applyGridCellChanges(snapshot, plan.cells);
  for (const key of Object.keys(snapshot)) delete snapshot[key];
  Object.assign(snapshot, next);
  for (const op of plan.meta) {
    if (op.kind === "sheet-insert") {
      snapshot.sheets[op.sheetId] = structuredClone(op.sheet);
      snapshot.sheetOrder.splice(op.index, 0, op.sheetId);
    } else if (op.kind === "sheet-name") {
      snapshot.sheets[op.sheetId].name = op.name;
    } else if (op.kind === "sheet-order") {
      snapshot.sheetOrder = op.order.slice();
    } else if (op.kind === "workbook-name") {
      snapshot.name = op.name;
    }
  }
}

export function sampleWorkbook({ rows = 20, cols = 6, filled = 12 } = {}) {
  const cellData = {};
  for (let r = 0; r < filled; r += 1) {
    cellData[r] = {};
    for (let c = 0; c < cols; c += 1) cellData[r][c] = { v: `${r}-${c}`, t: 1 };
  }
  return {
    id: "wb",
    name: "预算",
    appVersion: "0.25.1",
    locale: "zhCN",
    sheetOrder: ["s1"],
    styles: {},
    sheets: {
      s1: { id: "s1", name: "收入", rowCount: rows, columnCount: cols, cellData },
    },
  };
}

/** 一个客户端：参考语义的假画布 + 真绑定器。 */
export function makeClient({ doc, needsSeed, snapshot, withStore = true, readOnly = false, newId }) {
  let live = structuredClone(snapshot);
  const calls = { replace: 0, plan: 0, planDims: [], cells: 0, replaceReasons: [] };
  const undoStack = ["undo-1", "undo-2"];
  let localChange = null;
  let localStructure = null;
  const timers = [];
  const listeners = new Set();
  const awareness = {
    clientID: doc.clientID,
    getStates: () => new Map(),
    on: () => {},
    off: () => {},
    setLocalStateField: () => {},
  };
  const room = {
    roomKey: "artifact:test",
    doc,
    awareness,
    role: readOnly ? "viewer" : "editor",
    status: "syncing",
    self: { id: `u-${doc.clientID}`, name: "我", color: "#111", avatar_url: null },
    needsSeed,
    isSaver: needsSeed,
    lock: null,
    peers: [],
    seeded: [],
    completeSeed(roots) {
      this.seeded.push(roots);
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    setStatus(status) {
      this.status = status;
      listeners.forEach((cb) => cb());
    },
  };
  const port = {
    getSnapshot: () => structuredClone(live),
    applyCellChanges(changes) {
      calls.cells += 1;
      live = applyGridCellChanges(live, changes);
    },
    replaceWorkbook(next) {
      calls.replace += 1;
      undoStack.length = 0; // 整张替换会清空本地撤销栈
      live = structuredClone(next);
    },
    applyRemotePlan(plan) {
      calls.plan += 1;
      refApplyPlan(live, plan);
      return true;
    },
    onLocalChange(cb) {
      localChange = cb;
      return () => {
        localChange = null;
      };
    },
    onLocalStructure(cb) {
      localStructure = cb;
      return () => {
        localStructure = null;
      };
    },
    onLocalSelection: () => () => {},
    highlightPeers: () => {},
  };
  const isReadOnly = () => readOnly;
  const store = withStore
    ? createGridLayoutStore({ doc, canWrite: () => !isReadOnly() })
    : undefined;
  let counter = 0;
  const binder = createGridCollabBinder({
    room,
    port,
    bind: (opts) => bindJsonState({ ...opts, room }),
    layoutStore: store,
    newId: newId ?? (() => `n${doc.clientID % 1000}x${(counter += 1)}`),
    debounceMs: 10,
    setTimer: (cb) => {
      const handle = { cb, cancelled: false };
      timers.push(handle);
      return handle;
    },
    clearTimer: (handle) => {
      handle.cancelled = true;
    },
    onFullReplace: (reason) => calls.replaceReasons.push(reason),
  });
  const client = {
    room,
    port,
    binder,
    store,
    calls,
    undoStack,
    get live() {
      return live;
    },
    setLive(next) {
      live = next;
    },
    /** 触发所有待发的去抖定时器（推送）。 */
    tick() {
      for (const t of timers.splice(0)) if (!t.cancelled) t.cb();
    },
    // ── 用户动作 ──
    edit(mutator) {
      mutator(live);
      localChange?.();
    },
    setCell(sheetId, row, col, cell) {
      client.edit((snapshot) => {
        const data = snapshot.sheets[sheetId].cellData;
        (data[row] ??= {})[col] = cell;
      });
    },
    structure(op) {
      refApplyOp(live, op);
      localStructure?.(op);
      localChange?.();
    },
    insertRows(sheetId, at, count = 1) {
      client.structure({ kind: "insert", axis: "row", sheetId, at, count });
    },
    removeRows(sheetId, at, count = 1) {
      client.structure({ kind: "remove", axis: "row", sheetId, at, count });
    },
    insertCols(sheetId, at, count = 1) {
      client.structure({ kind: "insert", axis: "col", sheetId, at, count });
    },
    removeCols(sheetId, at, count = 1) {
      client.structure({ kind: "remove", axis: "col", sheetId, at, count });
    },
    /** 整行排序：`order[i]` = 新的第 i 行取自旧的第几行（相对 start）。 */
    reorderRows(sheetId, start, order) {
      client.structure({ kind: "reorder", sheetId, start, order, cols: 0 });
    },
    cell(sheetId, row, col) {
      return live.sheets[sheetId].cellData[row]?.[col];
    },
  };
  return client;
}

/** 两个 Y.Doc，手动同步（模拟「同时」操作：先各自动，再 sync）。 */
export function makeNetwork() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    for (let i = 0; i < 3; i += 1) {
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), "relay");
      Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), "relay");
    }
  };
  return { a, b, sync };
}

/** A 播种、B 同步后拿到同一本；返回两个客户端和同步函数。 */
export function seededPair(snapshot = sampleWorkbook(), options = {}) {
  const net = makeNetwork();
  const a = makeClient({ doc: net.a, needsSeed: true, snapshot, ...options });
  net.sync();
  const placeholder = {
    id: "wb-b",
    name: "占位",
    sheetOrder: ["x"],
    sheets: { x: { id: "x", name: "旧", rowCount: 3, columnCount: 3, cellData: {} } },
  };
  const b = makeClient({ doc: net.b, needsSeed: false, snapshot: placeholder, ...options });
  b.room.setStatus("synced");
  a.room.setStatus("synced");
  net.sync();
  const settle = () => {
    for (let i = 0; i < 4; i += 1) {
      a.tick();
      b.tick();
      net.sync();
    }
  };
  settle();
  return { net, a, b, settle };
}
