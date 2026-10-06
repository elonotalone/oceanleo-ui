/**
 * W12：表格多人同改的适配层（`src/shell/collab/adapters/grid.ts`）。
 * 不起 Univer、不连网：直接喂工作簿快照对象；需要 `yjs` 的并发用例在依赖未装时跳过。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { bindJsonState, readJsonStateRoot, writeJsonStateRoot } from "../src/shell/collab/bind-json-state.ts";
import {
  GRID_COLLAB_ROOT,
  gridCollabPhase,
  GRID_SELECTION_ID_CAP,
  applyGridCellChanges,
  colorWithAlpha,
  createGridCollabBinder,
  createGridUniverPort,
  isGridContentCommand,
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
  let doc = null;
  const roomListeners = new Set();
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
    subscribe: (cb) => {
      roomListeners.add(cb);
      return () => roomListeners.delete(cb);
    },
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
        seed: (state) => {
          seeded.push(state);
          room.completeSeed([opts.rootName]);
        },
        read: () => doc,
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
    setDoc: (state) => {
      doc = state;
    },
    setStatus: (status) => {
      room.status = status;
      roomListeners.forEach((cb) => cb());
    },
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

test("绑定器：非播种者等到 synced 再把协同文档的状态换进画布；没内容时不动", () => {
  const h = harness({ needsSeed: false });
  h.room.status = "syncing";
  h.setStatus("syncing");
  assert.equal(h.calls.applyCells.length + h.calls.replace.length, 0, "同步完成前不动画布");
  const remote = workbook();
  remote.sheets.s1.cellData[0][1] = { v: 321, t: 2 };
  h.setDoc(null);
  h.setStatus("synced");
  assert.equal(h.calls.applyCells.length, 0, "文档里还没有内容就不动");
  h.setDoc(remote);
  h.setStatus("synced");
  assert.equal(h.calls.applyCells.length, 1);
  assert.equal(h.getLive().sheets.s1.cellData[0][1].v, 321);
  h.setStatus("synced");
  assert.equal(h.calls.applyCells.length, 1, "只换一次");
});

test("协同阶段：不在协同里 off；播种者与已同步的人 live；其余等待", () => {
  assert.equal(gridCollabPhase({ room: null }), "off");
  assert.equal(gridCollabPhase({ room: { status: "denied", needsSeed: false } }), "off");
  assert.equal(gridCollabPhase({ room: { status: "syncing", needsSeed: true } }), "live");
  assert.equal(gridCollabPhase({ room: { status: "synced", needsSeed: false } }), "live");
  assert.equal(gridCollabPhase({ room: { status: "syncing", needsSeed: false } }), "waiting");
  assert.equal(gridCollabPhase({ room: { status: "offline", needsSeed: false }, wasLive: true }), "live");
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

test("绑定器：adopt 把外部新版本整本换进画布并整张推出去，不留待发定时器", () => {
  const h = harness();
  const local = workbook();
  local.sheets.s1.cellData[0][1] = { v: 1, t: 2 };
  h.setLive(local);
  h.local();
  const external = workbook();
  external.sheets.s1.name = "AI 改的名字";
  h.binder.adopt(external);
  assert.equal(h.calls.replace.length, 1);
  assert.equal(h.pushed.length, 1);
  assert.equal(h.pushed[0].sheets.s1.name, "AI 改的名字");
  assert.equal(h.timers.filter((t) => !t.cancelled).length, 0);
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

/** 用 W11 的写入函数（仲裁 A-3 的布局：order / entities / meta）。 */
function pushEntities(doc, encoded) {
  writeJsonStateRoot(doc, GRID_COLLAB_ROOT, encoded);
}

function readEntities(doc) {
  const own = readGridEntityState(doc);
  assert.deepEqual(own, readJsonStateRoot(doc, GRID_COLLAB_ROOT), "自带的读取与 W11 的 readJsonStateRoot 等价");
  return own;
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

// ── 真实的 bindJsonState + 绑定器，两个房间之间 ──────────────────────────────

function fakeRoom(needsSeed) {
  const doc = new Y.Doc();
  const states = new Map();
  const listeners = new Set();
  const awareness = {
    clientID: doc.clientID,
    getStates: () => states,
    on: () => {},
    off: () => {},
    setLocalStateField: () => {},
  };
  const room = {
    roomKey: "artifact:test",
    doc,
    awareness,
    role: "editor",
    status: "syncing",
    self: { id: "u", name: "我", color: "#111", avatar_url: null },
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
  return room;
}

function livePort(initial) {
  let live = structuredClone(initial);
  let localCb = null;
  const port = {
    getSnapshot: () => structuredClone(live),
    applyCellChanges: (changes) => {
      live = applyGridCellChanges(live, changes);
    },
    replaceWorkbook: (snapshot) => {
      live = structuredClone(snapshot);
    },
    onLocalChange: (cb) => {
      localCb = cb;
      return () => {};
    },
    onLocalSelection: () => () => {},
    highlightPeers: () => {},
  };
  return {
    port,
    get: () => live,
    edit(mutator) {
      const next = structuredClone(live);
      mutator(next);
      live = next;
      localCb?.();
    },
  };
}

test("端到端（真 bindJsonState）：A 播种，B 同步后拿到同一本；A 改格子，B 立刻看到；B 加工作表，A 整本替换", { skip: !Y }, async () => {
  const roomA = fakeRoom(true);
  const roomB = fakeRoom(false);
  const relay = (from, to) =>
    from.doc.on("update", (update, origin) => {
      if (origin !== "relay") Y.applyUpdate(to.doc, update, "relay");
    });
  relay(roomA, roomB);
  relay(roomB, roomA);

  const a = livePort(workbook());
  const timers = [];
  const options = (room, live) => ({
    room,
    port: live.port,
    bind: bindJsonState,
    debounceMs: 10,
    setTimer: (cb) => {
      timers.push(cb);
      return cb;
    },
    clearTimer: (handle) => {
      const at = timers.indexOf(handle);
      if (at >= 0) timers.splice(at, 1);
    },
  });
  const binderA = createGridCollabBinder(options(roomA, a));
  assert.deepEqual(roomA.seeded, [[GRID_COLLAB_ROOT]], "播种者种完通知服务端");

  const emptyOnB = livePort({ id: "wb-b", name: "本地读到的旧内容", sheetOrder: ["x"], sheets: { x: { id: "x", name: "旧", cellData: {} } } });
  const binderB = createGridCollabBinder(options(roomB, emptyOnB));
  roomB.setStatus("synced");
  assert.deepEqual(gridToEntities(emptyOnB.get()), gridToEntities(workbook()), "B 同步后画布换成协同文档里的工作簿");

  a.edit((next) => {
    next.sheets.s1.cellData[0][1] = { v: 777, t: 2 };
  });
  timers.splice(0).forEach((cb) => cb());
  assert.equal(emptyOnB.get().sheets.s1.cellData[0][1].v, 777, "A 的改动 B 立刻看到");

  emptyOnB.edit((next) => {
    next.sheetOrder.push("s3");
    next.sheets.s3 = { id: "s3", name: "B 加的表", rowCount: 10, columnCount: 5, cellData: { 0: { 0: { v: "hi", t: 1 } } } };
  });
  timers.splice(0).forEach((cb) => cb());
  assert.deepEqual(a.get().sheetOrder, ["s1", "s2", "s3"]);
  assert.equal(a.get().sheets.s3.cellData[0][0].v, "hi");
  binderA.destroy();
  binderB.destroy();
});

// ── Univer 端口（假 facade） ─────────────────────────────────────────────────

function fakeUniverApi(initial) {
  const events = [];
  const commands = [];
  const highlighted = [];
  const sheetFor = (id) => ({
    getSheetId: () => id,
    getRange: (row, col, rows, cols) => ({ row, col, rows, cols, id }),
    highlightRanges: (ranges, style) => {
      const handle = { disposed: false, ranges, style, dispose() { this.disposed = true; } };
      highlighted.push(handle);
      return handle;
    },
  });
  const workbook = {
    getId: () => "unit-1",
    save: () => structuredClone(initial),
    getSheetBySheetId: (id) => (initial.sheets[id] ? sheetFor(id) : null),
  };
  const api = {
    Event: { CommandExecuted: "CommandExecuted" },
    addEvent(name, cb) {
      assert.equal(name, "CommandExecuted");
      events.push(cb);
      return { dispose: () => events.splice(events.indexOf(cb), 1) };
    },
    syncExecuteCommand(id, params) {
      commands.push({ id, params });
      // 真实 Univer 会同步广播这条 mutation
      for (const cb of [...events]) cb({ id, params });
      return true;
    },
    getActiveWorkbook: () => workbook,
  };
  return { api, events, commands, highlighted };
}

test("端口：哪些命令算本地改了内容", () => {
  for (const id of [
    "sheet.mutation.set-range-values",
    "sheet.mutation.insert-row",
    "sheet.mutation.remove-col",
    "sheet.mutation.set-worksheet-name",
    "sheet.mutation.add-worksheet-merge",
    "sheet.mutation.add-conditional-rule",
    "data-validation.mutation.addRule",
  ]) {
    assert.equal(isGridContentCommand(id), true, id);
  }
  for (const id of [
    "sheet.mutation.set-worksheet-active",
    "sheet.operation.set-selections",
    "sheet.command.set-range-values",
    "formula.mutation.set-formula-calculation-start",
    "sheet.operation.set-scroll",
    undefined,
    42,
  ]) {
    assert.equal(isGridContentCommand(id), false, String(id));
  }
});

test("端口：写别人的格子走 set-range-values mutation，清空的格子给 null，写入期间不触发本地变更", () => {
  const fake = fakeUniverApi(workbook());
  const port = createGridUniverPort({ getApi: () => fake.api, replaceWorkbook: () => {} });
  let local = 0;
  port.onLocalChange(() => {
    local += 1;
  });
  port.applyCellChanges([
    { sheetId: "s1", row: 0, col: 1, cell: { v: 5, t: 2, s: { bl: 1 } } },
    { sheetId: "s1", row: 3, col: 0, cell: null },
    { sheetId: "s2", row: 1, col: 1, cell: { f: "=A1", v: 9 } },
  ]);
  assert.equal(fake.commands.length, 2, "每张工作表一条 mutation");
  const first = fake.commands.find((c) => c.params.subUnitId === "s1");
  assert.equal(first.id, "sheet.mutation.set-range-values");
  assert.equal(first.params.unitId, "unit-1");
  assert.deepEqual(first.params.cellValue, { 0: { 1: { v: 5, t: 2, s: { bl: 1 } } }, 3: { 0: null } });
  assert.deepEqual(fake.commands.find((c) => c.params.subUnitId === "s2").params.cellValue, {
    1: { 1: { f: "=A1", v: 9 } },
  });
  assert.equal(local, 0, "写入远端变化时不触发本地变更");

  // 用户自己的改动照常触发
  fake.api.syncExecuteCommand("sheet.mutation.set-range-values", {});
  assert.equal(local, 1);
});

test("端口：本地选区事件解析成范围；坏参数忽略", () => {
  const fake = fakeUniverApi(workbook());
  const port = createGridUniverPort({ getApi: () => fake.api, replaceWorkbook: () => {} });
  const seen = [];
  const off = port.onLocalSelection((sheetId, ranges) => seen.push([sheetId, ranges]));
  const fire = (params) => fake.events.forEach((cb) => cb({ id: "sheet.operation.set-selections", params }));
  fire({ subUnitId: "s1", selections: [{ range: { startRow: 1, endRow: 2, startColumn: 0, endColumn: 3 } }] });
  fire({ subUnitId: "s1", selections: [{ range: { startRow: "x", endRow: 2, startColumn: 0, endColumn: 3 } }] });
  fire({ selections: [] });
  assert.deepEqual(seen, [["s1", [{ startRow: 1, endRow: 2, startColumn: 0, endColumn: 3 }]]]);
  off();
  assert.equal(fake.events.length, 0);
});

test("端口：别人的选区用他的颜色描边；同样的选区不重复画；变化时先撤掉旧的", () => {
  const fake = fakeUniverApi(workbook());
  const port = createGridUniverPort({ getApi: () => fake.api, replaceWorkbook: () => {} });
  const peers = [
    { userId: "u2", name: "小王", color: "#336699", ranges: [{ sheetId: "s1", startRow: 1, endRow: 2, startColumn: 0, endColumn: 1 }] },
  ];
  port.highlightPeers(peers);
  assert.equal(fake.highlighted.length, 1);
  assert.deepEqual(fake.highlighted[0].ranges[0], { row: 1, col: 0, rows: 2, cols: 2, id: "s1" });
  assert.equal(fake.highlighted[0].style.stroke, "#336699");
  assert.equal(fake.highlighted[0].style.fill, "rgba(51, 102, 153, 0.12)");
  port.highlightPeers(peers);
  assert.equal(fake.highlighted.length, 1, "没变化不重画");
  port.highlightPeers([]);
  assert.equal(fake.highlighted[0].disposed, true);
  port.highlightPeers([{ ...peers[0], ranges: [{ sheetId: "ghost", startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 }] }]);
  assert.equal(fake.highlighted.length, 1, "不存在的工作表直接跳过");
  assert.equal(colorWithAlpha("hsl(120, 70%, 45%)", 0.3), "hsla(120, 70%, 45%, 0.3)");
  assert.equal(colorWithAlpha("javascript:1", 0.3), "rgba(99, 102, 241, 0.3)");
});

test("端口：整本替换期间也屏蔽本地变更；快照读的是 workbook.save()", () => {
  const fake = fakeUniverApi(workbook());
  let local = 0;
  const port = createGridUniverPort({
    getApi: () => fake.api,
    replaceWorkbook: () => {
      fake.api.syncExecuteCommand("sheet.mutation.insert-sheet", {});
    },
  });
  port.onLocalChange(() => {
    local += 1;
  });
  port.replaceWorkbook({ sheetOrder: [], sheets: {} });
  assert.equal(local, 0);
  const snapshot = port.getSnapshot();
  assert.equal(snapshot.sheets.s1.name, "收入");
  snapshot.sheets.s1.name = "被改";
  assert.equal(port.getSnapshot().sheets.s1.name, "收入", "返回的是拷贝");
});
