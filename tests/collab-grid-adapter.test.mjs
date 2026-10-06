/**
 * W12：表格多人同改的适配层（`src/shell/collab/adapters/grid.ts`）。
 * 不起 Univer、不连网：直接喂工作簿快照对象；需要 `yjs` 的并发用例在依赖未装时跳过。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  GRID_COLLAB_ROOT,
  GRID_SELECTION_ID_CAP,
  applyGridCellChanges,
  createGridCollabBinder,
  diffGridSnapshots,
  gridCellKey,
  gridFromEntities,
  gridPeerSelections,
  gridSelectionToAwareness,
  gridToEntities,
  normalizeGridSnapshot,
  parseGridCellKey,
  readGridEntityState,
  safePeerColor,
  stableStringify,
} from "../src/shell/collab/adapters/grid.ts";

function workbook() {
  return {
    id: "wb-local",
    name: "预算",
    appVersion: "0.25.1",
    locale: "zhCN",
    sheetOrder: ["s1", "s2"],
    styles: { st1: { bl: 1, bg: { rgb: "#ffeecc" } } },
    sheets: {
      s1: {
        id: "s1",
        name: "收入",
        rowCount: 100,
        columnCount: 26,
        zoomRatio: 1.5,
        scrollTop: 40,
        freeze: { xSplit: 1, ySplit: 1, startRow: 1, startColumn: 1 },
        rowData: { 0: { h: 30 } },
        mergeData: [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 2 }],
        cellData: {
          0: {
            0: { v: "项目", t: 1, s: "st1", p: { body: { dataStream: "项目\r\n" } } },
            1: { v: 100, t: 2 },
            2: { f: "=B1*2", v: 200, t: 2 },
            5: { v: "", s: { cl: { rgb: "#ff0000" } } },
          },
          3: { 0: { v: "合计", t: 1 }, 1: {} },
        },
      },
      s2: {
        id: "s2",
        name: "支出",
        rowCount: 50,
        columnCount: 10,
        cellData: { 1: { 1: { v: true, t: 3 } } },
      },
    },
  };
}

test("实体键：往返解析，工作表 id 里带符号也不乱", () => {
  assert.equal(gridCellKey("s1", 2, 3), "s1!2!3");
  assert.deepEqual(parseGridCellKey("s1!2!3"), { sheetId: "s1", row: 2, col: 3 });
  assert.deepEqual(parseGridCellKey("a-b_c!0!12"), { sheetId: "a-b_c", row: 0, col: 12 });
  assert.equal(parseGridCellKey("bad"), null);
  assert.equal(parseGridCellKey("s1!x!1"), null);
  assert.equal(parseGridCellKey("s1!-1!1"), null);
});

test("toEntities：单元格是实体，样式展开成内联，空格子不进文档，meta 按工作表拆开", () => {
  const encoded = gridToEntities(workbook());
  assert.deepEqual(encoded.order, ["s1!0!0", "s1!0!1", "s1!0!2", "s1!0!5", "s1!3!0", "s2!1!1"]);
  assert.deepEqual(encoded.entities["s1!0!0"], { v: "项目", t: 1, s: { bl: 1, bg: { rgb: "#ffeecc" } } });
  assert.deepEqual(encoded.entities["s1!0!2"], { f: "=B1*2", v: 200, t: 2 });
  assert.deepEqual(encoded.entities["s1!0!5"], { s: { cl: { rgb: "#ff0000" } } });
  assert.equal(encoded.entities["s1!3!1"], undefined, "空对象格子不进协同文档");
  assert.deepEqual(encoded.meta.sheetOrder, ["s1", "s2"]);
  assert.equal(encoded.meta["sheet:s1"].name, "收入");
  assert.deepEqual(encoded.meta["sheet:s1"].rowData, { 0: { h: 30 } });
  assert.deepEqual(encoded.meta["sheet:s1"].freeze, { xSplit: 1, ySplit: 1, startRow: 1, startColumn: 1 });
  assert.equal(encoded.meta["sheet:s1"].zoomRatio, undefined, "缩放是每个人自己的视图状态");
  assert.equal(encoded.meta["sheet:s1"].scrollTop, undefined);
  assert.equal(encoded.meta["sheet:s1"].cellData, undefined);
  assert.equal(encoded.meta.workbook.name, "预算");
});

test("往返无损：fromEntities(toEntities(x)) 与规范化的 x 等价，且再编码结果不变", () => {
  const source = workbook();
  const back = gridFromEntities(gridToEntities(source), source);
  const again = gridToEntities(back);
  assert.deepEqual(again, gridToEntities(source));
  assert.equal(back.id, "wb-local", "工作簿 id 沿用本机的");
  assert.equal(back.sheets.s1.zoomRatio, 1.5, "本机视图状态由 prev 带回来");
  assert.equal(back.sheets.s1.scrollTop, 40);
  assert.deepEqual(back.sheets.s1.cellData[0][0], {
    v: "项目",
    t: 1,
    s: { bl: 1, bg: { rgb: "#ffeecc" } },
  });
  assert.deepEqual(back.sheetOrder, ["s1", "s2"]);
  // 规范化幂等
  assert.deepEqual(normalizeGridSnapshot(back), normalizeGridSnapshot(normalizeGridSnapshot(source)));
});

test("真正的富文本格子保留 p，纯文本格子的 p 不进协同", () => {
  const source = workbook();
  source.sheets.s1.cellData[7] = {
    0: {
      p: {
        id: "rich",
        body: {
          dataStream: "红字\r\n",
          textRuns: [{ st: 0, ed: 2, ts: { cl: { rgb: "#f00" } } }],
          paragraphs: [{ startIndex: 2 }],
        },
      },
    },
  };
  const encoded = gridToEntities(source);
  assert.ok(encoded.entities["s1!7!0"].p, "富文本保留");
  assert.equal(encoded.entities["s1!0!0"].p, undefined, "纯文本的 p 由舞台打开时补回");
});

test("工作表被别人删掉：它的格子在还原时一并丢弃；顺序里没有的表追加在最后", () => {
  const encoded = gridToEntities(workbook());
  delete encoded.meta["sheet:s2"];
  encoded.meta.sheetOrder = ["s1", "ghost"];
  const back = gridFromEntities(encoded, null);
  assert.deepEqual(back.sheetOrder, ["s1"]);
  assert.equal(back.sheets.s2, undefined);

  const extra = gridToEntities(workbook());
  extra.meta.sheetOrder = ["s2"];
  assert.deepEqual(gridFromEntities(extra, null).sheetOrder, ["s2", "s1"]);
});

test("diff：只改格子 / 新增格子 / 清空格子 / 结构变化", () => {
  const a = workbook();
  const b = workbook();
  b.sheets.s1.cellData[0][1] = { v: 101, t: 2 };
  b.sheets.s1.cellData[9] = { 9: { v: "新", t: 1 } };
  delete b.sheets.s1.cellData[3];
  const diff = diffGridSnapshots(a, b);
  assert.equal(diff.structural, false);
  const byKey = Object.fromEntries(diff.cells.map((c) => [gridCellKey(c.sheetId, c.row, c.col), c.cell]));
  assert.deepEqual(byKey["s1!0!1"], { v: 101, t: 2 });
  assert.deepEqual(byKey["s1!9!9"], { v: "新", t: 1 });
  assert.equal(byKey["s1!3!0"], null);
  assert.equal(Object.keys(byKey).length, 3);

  const c = workbook();
  c.sheets.s1.name = "收入明细";
  assert.equal(diffGridSnapshots(a, c).structural, true);
  const d = workbook();
  d.sheets.s1.rowData[1] = { h: 50 };
  assert.equal(diffGridSnapshots(a, d).structural, true);
  const same = workbook();
  same.sheets.s1.zoomRatio = 3;
  assert.deepEqual(diffGridSnapshots(a, same), { structural: false, cells: [] }, "缩放不算变化");
});

test("applyGridCellChanges 把格子变化叠到快照上，不改入参", () => {
  const a = workbook();
  const frozen = JSON.stringify(a);
  const next = applyGridCellChanges(a, [
    { sheetId: "s1", row: 0, col: 1, cell: { v: 7, t: 2 } },
    { sheetId: "s1", row: 3, col: 0, cell: null },
  ]);
  assert.equal(JSON.stringify(a), frozen);
  assert.deepEqual(next.sheets.s1.cellData[0][1], { v: 7, t: 2 });
  assert.equal(next.sheets.s1.cellData[3], undefined);
});

test("选区进感知：id 列表有上限，范围完整保留；别人的选区按他的颜色取出", () => {
  const payload = gridSelectionToAwareness("s1", [
    { startRow: 2, endRow: 0, startColumn: 1, endColumn: 0 },
  ]);
  assert.deepEqual(payload.selection, ["s1!0!0", "s1!0!1", "s1!1!0", "s1!1!1", "s1!2!0", "s1!2!1"]);
  assert.deepEqual(payload.selectionRanges, [
    { sheetId: "s1", startRow: 0, endRow: 2, startColumn: 0, endColumn: 1 },
  ]);
  const big = gridSelectionToAwareness("s1", [
    { startRow: 0, endRow: 999, startColumn: 0, endColumn: 25 },
  ]);
  assert.equal(big.selection.length, GRID_SELECTION_ID_CAP);
  assert.equal(big.selectionRanges[0].endRow, 999);

  const states = new Map([
    [1, { user: { id: "me", name: "我", color: "#111111" } }],
    [
      2,
      {
        user: { id: "u2", name: "小王", color: "hsl(120, 70%, 45%)" },
        selectionRanges: [{ sheetId: "s1", startRow: 1, endRow: 2, startColumn: 0, endColumn: 0 }],
      },
    ],
    [
      3,
      {
        user: { id: "u3", name: "坏人", color: "red;background:url(x)" },
        selectionRanges: [
          { sheetId: "s1", startRow: "a", endRow: 2, startColumn: 0, endColumn: 0 },
          { sheetId: "s2", startRow: 0, endRow: 0, startColumn: 4, endColumn: 4 },
        ],
      },
    ],
    [4, { user: { id: "u4", name: "没选" } }],
  ]);
  const awareness = { clientID: 1, getStates: () => states };
  const peers = gridPeerSelections(awareness);
  assert.deepEqual(
    peers.map((p) => [p.userId, p.color, p.ranges.length]),
    [
      ["u2", "hsl(120, 70%, 45%)", 1],
      ["u3", "#6366f1", 1],
    ],
  );
  assert.equal(safePeerColor("#abc"), "#abc");
  assert.equal(safePeerColor("url(javascript:1)"), "#6366f1");
});

// ── 绑定器（假房间 + 假 port + 假 bindJsonState） ───────────────────────────

function fakeAwareness() {
  const listeners = new Set();
  const local = {};
  return {
    clientID: 1,
    local,
    getStates: () => new Map(),
    on: (_event, cb) => listeners.add(cb),
    off: (_event, cb) => listeners.delete(cb),
    setLocalStateField: (field, value) => {
      local[field] = value;
    },
    emit: () => listeners.forEach((cb) => cb()),
    listenerCount: () => listeners.size,
  };
}

function harness({ needsSeed = false } = {}) {
  let live = workbook();
  const pushed = [];
  const seeded = [];
  const calls = { applyCells: [], replace: [], highlights: [] };
  let remoteCb = null;
  let localCb = null;
  let selectionCb = null;
  const timers = [];
  const room = {
    doc: {},
    awareness: fakeAwareness(),
    needsSeed,
    status: "synced",
    completed: [],
    completeSeed(roots) {
      this.completed.push(roots);
    },
    subscribe: () => () => {},
  };
  const port = {
    getSnapshot: () => structuredClone(live),
    applyCellChanges(changes) {
      calls.applyCells.push(changes);
      live = applyGridCellChanges(live, changes);
    },
    replaceWorkbook(snapshot) {
      calls.replace.push(snapshot);
      live = structuredClone(snapshot);
    },
    onLocalChange(cb) {
      localCb = cb;
      return () => {
        localCb = null;
      };
    },
    onLocalSelection(cb) {
      selectionCb = cb;
      return () => {
        selectionCb = null;
      };
    },
    highlightPeers: (peers) => calls.highlights.push(peers),
  };
  const binder = createGridCollabBinder({
    room,
    port,
    bind: (opts) => {
      assert.equal(opts.rootName, GRID_COLLAB_ROOT);
      assert.equal(opts.toEntities, gridToEntities);
      return {
        push: (state) => pushed.push(state),
        seed: (state) => seeded.push(state),
        onRemote: (cb) => {
          remoteCb = cb;
          return () => {
            remoteCb = null;
          };
        },
        destroy() {},
      };
    },
    debounceMs: 250,
    setTimer: (cb, ms) => {
      const handle = { cb, ms, cancelled: false };
      timers.push(handle);
      return handle;
    },
    clearTimer: (handle) => {
      handle.cancelled = true;
    },
  });
  return {
    binder,
    room,
    calls,
    pushed,
    seeded,
    timers,
    setLive: (next) => {
      live = next;
    },
    getLive: () => live,
    local: () => localCb?.(),
    selection: (sheetId, ranges) => selectionCb?.(sheetId, ranges),
    remote: (state) => remoteCb?.(state),
    hasRemote: () => remoteCb !== null,
    fireTimers: () => {
      for (const t of timers.splice(0)) if (!t.cancelled) t.cb();
    },
  };
}

test("绑定器：needsSeed 的客户端写种子并 completeSeed；其余客户端不写", () => {
  const seedHarness = harness({ needsSeed: true });
  assert.equal(seedHarness.seeded.length, 1);
  assert.deepEqual(seedHarness.room.completed, [[GRID_COLLAB_ROOT]]);
  const other = harness({ needsSeed: false });
  assert.equal(other.seeded.length, 0);
  assert.deepEqual(other.room.completed, []);
});

test("绑定器：本地变更合并到一次 push；写入远端变化时不回推", () => {
  const h = harness();
  const next = workbook();
  next.sheets.s1.cellData[0][1] = { v: 555, t: 2 };
  h.setLive(next);
  h.local();
  h.local();
  h.local();
  assert.equal(h.timers.filter((t) => !t.cancelled).length, 1, "连续三次变更只留一个待发定时器");
  h.fireTimers();
  assert.equal(h.pushed.length, 1);
  assert.equal(h.pushed[0].sheets.s1.cellData[0][1].v, 555);
});

test("绑定器：远端只改格子 → 逐格写回；结构变化 → 整本替换；本地未推出的格子改动保留", () => {
  const h = harness();
  const remote = workbook();
  remote.sheets.s1.cellData[0][1] = { v: 9, t: 2 };
  h.remote(remote);
  assert.equal(h.calls.applyCells.length, 1);
  assert.equal(h.calls.replace.length, 0);
  assert.equal(h.getLive().sheets.s1.cellData[0][1].v, 9);
  assert.equal(h.pushed.length, 0, "写入远端变化不会触发本地推送");

  // 同一份远端状态再来一次：无变化，不动画布
  h.remote(remote);
  assert.equal(h.calls.applyCells.length, 1);

  // 本地先改了 A5（还没推），远端随后加了一张工作表
  const local = h.getLive();
  local.sheets.s1.cellData[4] = { 0: { v: "我的", t: 1 } };
  h.setLive(local);
  h.local();
  const structural = structuredClone(remote);
  structural.sheetOrder = ["s1", "s2", "s3"];
  structural.sheets.s3 = { id: "s3", name: "新表", rowCount: 20, columnCount: 8, cellData: {} };
  h.remote(structural);
  assert.equal(h.calls.replace.length, 1);
  const replaced = h.calls.replace[0];
  assert.deepEqual(replaced.sheetOrder, ["s1", "s2", "s3"]);
  assert.equal(replaced.sheets.s1.cellData[4][0].v, "我的", "本地尚未推出的格子改动叠在远端结构上");
  h.fireTimers();
  assert.equal(h.pushed.length, 1, "替换后把叠上去的本地改动推出去");
});

test("绑定器：选区写进感知；别人的选区变化触发描边；销毁后全部解绑", () => {
  const h = harness();
  h.selection("s1", [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 1 }]);
  assert.deepEqual(h.room.awareness.local.selection, ["s1!0!0", "s1!0!1"]);
  assert.equal(h.room.awareness.local.selectionRanges[0].endColumn, 1);
  h.room.awareness.emit();
  assert.equal(h.calls.highlights.length, 1);
  h.binder.destroy();
  assert.equal(h.room.awareness.listenerCount(), 0);
  assert.equal(h.hasRemote(), false);
  assert.deepEqual(h.calls.highlights.at(-1), [], "销毁时清掉别人的描边");
});

test("绑定器：flush 立刻推出待发变更", () => {
  const h = harness();
  const next = workbook();
  next.sheets.s1.cellData[0][1] = { v: 1, t: 2 };
  h.setLive(next);
  h.local();
  h.binder.flush();
  assert.equal(h.pushed.length, 1);
  h.binder.flush();
  assert.equal(h.pushed.length, 1, "没有待发变更时 flush 什么都不做");
});

// ── 两个 Y.Doc 之间的并发（依赖 yjs；W11 装好前跳过） ──────────────────────

let Y = null;
try {
  Y = await import("yjs");
} catch {
  Y = null;
}

/** 仲裁 A-3 的布局：`doc.getMap(root)` 下 order(Y.Array) / entities(Y.Map<Y.Map>) / meta(Y.Map)。 */
function pushEntities(doc, encoded) {
  doc.transact(() => {
    const root = doc.getMap(GRID_COLLAB_ROOT);
    const ensure = (name, make) => {
      let node = root.get(name);
      if (!node) {
        node = make();
        root.set(name, node);
      }
      return node;
    };
    const entities = ensure("entities", () => new Y.Map());
    const order = ensure("order", () => new Y.Array());
    const meta = ensure("meta", () => new Y.Map());
    for (const [key, fields] of Object.entries(encoded.entities)) {
      let entity = entities.get(key);
      if (!entity) {
        entity = new Y.Map();
        entities.set(key, entity);
      }
      for (const [field, value] of Object.entries(fields)) {
        if (stableStringify(entity.get(field)) !== stableStringify(value)) entity.set(field, value);
      }
      for (const field of [...entity.keys()]) if (!(field in fields)) entity.delete(field);
    }
    for (const key of [...entities.keys()]) if (!(key in encoded.entities)) entities.delete(key);
    const present = new Set(order.toArray());
    for (const key of encoded.order) if (!present.has(key)) order.push([key]);
    for (const [key, value] of Object.entries(encoded.meta)) {
      if (stableStringify(meta.get(key)) !== stableStringify(value)) meta.set(key, value);
    }
    for (const key of [...meta.keys()]) if (!(key in encoded.meta)) meta.delete(key);
  });
}

function readEntities(doc) {
  return readGridEntityState(doc);
}

function sync(a, b) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
}

function seededPair() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  pushEntities(a, gridToEntities(workbook()));
  sync(a, b);
  return [a, b];
}

test("并发：两人同时改不同单元格都保留", { skip: !Y }, () => {
  const [a, b] = seededPair();
  const forA = readEntities(a);
  forA.entities["s1!0!1"] = { v: 111, t: 2 };
  pushEntities(a, forA);
  const forB = readEntities(b);
  forB.entities["s2!1!1"] = { v: false, t: 3 };
  pushEntities(b, forB);
  sync(a, b);
  const merged = gridFromEntities(readEntities(a), null);
  assert.equal(merged.sheets.s1.cellData[0][1].v, 111);
  assert.equal(merged.sheets.s2.cellData[1][1].v, false);
  assert.deepEqual(readEntities(a), readEntities(b));
});

test("并发：同一单元格不同字段都保留，同一字段后写者胜且两边一致", { skip: !Y }, () => {
  const [a, b] = seededPair();
  const forA = readEntities(a);
  forA.entities["s1!0!0"] = { ...forA.entities["s1!0!0"], v: "A 改的值" };
  pushEntities(a, forA);
  const forB = readEntities(b);
  forB.entities["s1!0!0"] = { ...forB.entities["s1!0!0"], s: { bl: 0, it: 1 } };
  pushEntities(b, forB);
  sync(a, b);
  const cell = gridFromEntities(readEntities(a), null).sheets.s1.cellData[0][0];
  assert.equal(cell.v, "A 改的值", "A 改了值");
  assert.deepEqual(cell.s, { bl: 0, it: 1 }, "B 改了样式");

  const [c, d] = seededPair();
  const c1 = readEntities(c);
  c1.entities["s1!0!1"] = { v: 1, t: 2 };
  pushEntities(c, c1);
  const d1 = readEntities(d);
  d1.entities["s1!0!1"] = { v: 2, t: 2 };
  pushEntities(d, d1);
  sync(c, d);
  assert.deepEqual(readEntities(c), readEntities(d));
  assert.ok([1, 2].includes(readEntities(c).entities["s1!0!1"].v));
});

test("并发：新增、删除、增删工作表收敛", { skip: !Y }, () => {
  const [a, b] = seededPair();
  const forA = readEntities(a);
  forA.entities["s1!20!0"] = { v: "A 新增", t: 1 };
  forA.order.push("s1!20!0");
  delete forA.entities["s1!3!0"];
  pushEntities(a, forA);
  const forB = readEntities(b);
  forB.entities["s1!21!0"] = { v: "B 新增", t: 1 };
  forB.order.push("s1!21!0");
  forB.meta["sheet:s3"] = { id: "s3", name: "新表", rowCount: 10, columnCount: 5 };
  forB.meta.sheetOrder = ["s1", "s2", "s3"];
  pushEntities(b, forB);
  sync(a, b);
  const merged = readEntities(a);
  assert.deepEqual(merged, readEntities(b));
  assert.ok(merged.entities["s1!20!0"] && merged.entities["s1!21!0"]);
  assert.equal(merged.entities["s1!3!0"], undefined);
  assert.deepEqual(merged.meta.sheetOrder, ["s1", "s2", "s3"]);
  const snapshot = gridFromEntities(merged, null);
  assert.deepEqual(snapshot.sheetOrder, ["s1", "s2", "s3"]);
  assert.equal(snapshot.sheets.s3.name, "新表");
});

test("并发：整表结构变更（插入行）由发起方整张重推，收敛到同一状态", { skip: !Y }, () => {
  const [a, b] = seededPair();
  // A 在第 1 行前插入一行：下面所有格子下移一格，同一事务整张重推。
  const source = workbook();
  const shifted = structuredClone(source);
  const rows = shifted.sheets.s1.cellData;
  const moved = {};
  for (const [row, line] of Object.entries(rows)) moved[Number(row) >= 1 ? Number(row) + 1 : Number(row)] = line;
  shifted.sheets.s1.cellData = moved;
  shifted.sheets.s1.rowCount = 101;
  pushEntities(a, gridToEntities(shifted));
  // B 同时改了一个不受影响的格子
  const forB = readEntities(b);
  forB.entities["s2!1!1"] = { v: false, t: 3 };
  pushEntities(b, forB);
  sync(a, b);
  assert.deepEqual(readEntities(a), readEntities(b));
  const merged = gridFromEntities(readEntities(a), null);
  assert.equal(merged.sheets.s1.rowCount, 101);
  assert.equal(merged.sheets.s1.cellData[4][0].v, "合计", "原第 3 行的格子已下移到第 4 行");
  assert.equal(merged.sheets.s2.cellData[1][1].v, false);
});
