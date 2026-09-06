// ============================================================================
// 保存成功 → 重挂 → 旧草稿被当成「未保存改动」再存一份 —— 这条环必须断
// ----------------------------------------------------------------------------
// 为什么要有这份文件（plugin-chrome X7，2026-09-06）
//
// website 开发槽实测（`signals/X7-journal.md`）：表格改 B1 再改 C1，35 s 内打出 6 份
// creations 且仍在继续，每一圈都伴随「正在读取工作簿…」闪屏。机制：
//   flush 成功 → 宿主 `setItem(savedItem)` → 编辑器整棵重挂 → 旧实例卸载时把 dirty
//   草稿写回 → 新实例挂载即 restore → dirty → 再 flush → 再重挂 → …
// 旧实例永远到不了 `saved` 那一帧去删草稿。
//
// 这里把「宿主换素材就重挂」的形状照搬进一棵真 React 树（真 hook、真控制器、
// 真 1.6 s 防抖；只有 IndexedDB 换成内存表），判三件事：
//   1. 一次编辑 → 恰好 1 份 creation，重挂后**不**恢复已入云的草稿，草稿被删；
//   2. flush 在途时又改一笔 → 那一笔必须被恢复并存进第 2 份，之后停在 2，不是 3、4…；
//   3. 没有任何成功保存（真崩溃）时，草稿照旧恢复——登记表不许误伤真正的恢复。
// ============================================================================

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

/* --------------------------------- jsdom --------------------------------- */

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(
  pathToFileURL(fabricRequire.resolve("jsdom")).href
);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://excel.oceanleo.com/advanced/spreadsheet_editing",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/* ------------------------- 内存版 IndexedDB 草稿表 ------------------------ */

globalThis.__x7RecoveryStore = {
  records: new Map(),
  writes: 0,
  deletes: 0,
  reset() {
    this.records.clear();
    this.writes = 0;
    this.deletes = 0;
  },
};

const STORE_STUB = dataModule(`
  const store = globalThis.__x7RecoveryStore;
  export function advancedRecoveryKey(editorId, item) {
    const root = String(item.meta.root_asset_id || item.meta.parent_asset_id || item.id || item.key);
    return editorId + ":" + root + ":" + String(item.id);
  }
  export async function writeAdvancedRecovery(record) {
    store.writes += 1;
    store.records.set(record.key, record);
  }
  export async function readAdvancedRecovery(key) {
    return store.records.get(key) || null;
  }
  export async function deleteAdvancedRecovery(key) {
    store.deletes += 1;
    store.records.delete(key);
  }
`);

const STUBS = { "./advanced-recovery-store": STORE_STUB };
const { useAdvancedAutoSave } = await import(
  await compileModule("src/shell/use-advanced-autosave.ts", STUBS)
);
const { useAdvancedRecovery, resetAdvancedSaveLedgerForTests } = await import(
  await compileModule("src/shell/use-advanced-recovery.ts", STUBS)
);
const { advancedRecoveryKey } = await import(STORE_STUB);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** 真控制器防抖 1 600 ms + flush + 重挂 + 恢复读盘，一圈留 2.6 s。 */
const CYCLE_MS = 2_600;

async function mount(element) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

/* ------------------------------- 台架：假云端 ------------------------------ */

function createCloud({ flushDelayMs = 0 } = {}) {
  const cloud = {
    docs: new Map([["https://cdn.oceanleo.com/sheet-v0.json", { cells: {} }]]),
    creations: [],
    flushDelayMs,
    flushStarts: [],
  };
  return cloud;
}

function initialItem() {
  return {
    key: "creation:sheet-1",
    source: "creation",
    id: "sheet-1",
    title: "agent-test-sheet",
    kind: "sheet",
    siteId: "excel",
    url: "https://cdn.oceanleo.com/sheet-v0.json",
    favorite: false,
    meta: { root_asset_id: "root-sheet-1" },
  };
}

/**
 * 一个「编辑器实例」：挂载时从 item.url 读文档；restore 与真 grid 一样**无条件**
 * 置 dirty（这正是环能转起来的前提之一，不能在台架里把它改乖）。
 */
function EditorInstance({ item, cloud, session, bed }) {
  const [doc, setDoc] = React.useState(() =>
    structuredClone(cloud.docs.get(item.url) || { cells: {} }),
  );
  const [dirty, setDirty] = React.useState(false);
  const [revision, setRevision] = React.useState(0);
  const docRef = React.useRef(doc);
  docRef.current = doc;
  const revisionRef = React.useRef(revision);
  revisionRef.current = revision;

  const edit = React.useCallback((cell, value) => {
    setDoc((current) => ({ cells: { ...current.cells, [cell]: value } }));
    setDirty(true);
    setRevision((value) => value + 1);
  }, []);

  const flush = React.useCallback(async () => {
    cloud.flushStarts.push(Date.now());
    const snapshot = structuredClone(docRef.current);
    const flushedRevision = revisionRef.current;
    if (cloud.flushDelayMs) await sleep(cloud.flushDelayMs);
    const version = cloud.creations.length + 1;
    const url = `https://cdn.oceanleo.com/sheet-v${version}.json`;
    cloud.docs.set(url, snapshot);
    cloud.creations.push({ url, snapshot });
    // 与真 grid 一样：保存回执落地后编辑器自己清 dirty（若 revision 没再动）。
    if (revisionRef.current === flushedRevision) setDirty(false);
    return { ok: true, item: { ...item, url, meta: { ...item.meta } } };
  }, [cloud, item]);

  const autoSave = useAdvancedAutoSave({ dirty, revision, flush, session });
  const recovery = React.useMemo(
    () => ({
      key: advancedRecoveryKey("grid", item),
      ready: true,
      capture: () => structuredClone(docRef.current),
      restore: (payload) => {
        bed.restores.push(structuredClone(payload));
        setDoc(structuredClone(payload));
        setDirty(true);
        setRevision((value) => value + 1);
        return true;
      },
    }),
    [bed, item],
  );
  useAdvancedRecovery({
    editorId: "grid",
    revision,
    dirty,
    persistenceState: autoSave.state,
    recovery,
  });
  bed.current = { edit, doc, dirty, state: autoSave.state, itemUrl: item.url };
  return null;
}

/** 宿主：`recordSavedItem` 一到就换素材 → `key` 变 → 编辑器整棵重挂。 */
function Host({ cloud, bed }) {
  const [item, setItem] = React.useState(initialItem);
  const session = React.useMemo(
    () => ({
      sessionId: "session-1",
      taskId: null,
      snapshot: () => ({}),
      ensure: async () => null,
      navigate: () => {},
      startNew: async () => null,
      renameTitle: async () => true,
      recordSavedItem: async (saved) => {
        bed.recorded.push(saved.url);
        setItem(saved);
        return true;
      },
      registerFlush: () => {},
    }),
    [bed],
  );
  bed.mounts = (bed.mounts || 0);
  return React.createElement(EditorInstance, {
    key: item.url,
    item,
    cloud,
    session,
    bed,
  });
}

function createBed() {
  return { current: null, recorded: [], restores: [] };
}

async function settle(ms) {
  await act(async () => {
    await sleep(ms);
  });
}

/* --------------------------------- 判据 ---------------------------------- */

test("一次编辑 → 1 份 creation；重挂后不恢复已入云的草稿，草稿被删", async () => {
  globalThis.__x7RecoveryStore.reset();
  resetAdvancedSaveLedgerForTests();
  const cloud = createCloud();
  const bed = createBed();
  const tree = await mount(React.createElement(Host, { cloud, bed }));
  await act(async () => {
    bed.current.edit("B1", "agent-test-x7");
  });
  await settle(CYCLE_MS);
  assert.equal(cloud.creations.length, 1, "第一次保存应产生 1 份 creation");
  assert.equal(bed.recorded.length, 1);
  assert.equal(bed.current.itemUrl, cloud.creations[0].url, "宿主已换到新素材（重挂）");
  // 再给两圈：没有去环时这里会变成 2、3。
  await settle(CYCLE_MS * 2);
  assert.equal(
    cloud.creations.length,
    1,
    `重挂后不得再存：实际 creations=${cloud.creations.length}`,
  );
  assert.equal(bed.restores.length, 0, "已入云的草稿不该被恢复");
  assert.equal(bed.current.dirty, false);
  assert.equal(bed.current.state, "saved");
  assert.equal(
    globalThis.__x7RecoveryStore.records.size,
    0,
    "作废草稿应已删除",
  );
  await tree.unmount();
});

test("flush 在途时又改一笔：那一笔被恢复并存进第 2 份，然后停在 2", async () => {
  globalThis.__x7RecoveryStore.reset();
  resetAdvancedSaveLedgerForTests();
  const cloud = createCloud({ flushDelayMs: 500 });
  const bed = createBed();
  const tree = await mount(React.createElement(Host, { cloud, bed }));
  await act(async () => {
    bed.current.edit("B1", "first");
  });
  // 防抖 1.6 s 后 flush 起飞；在它 500 ms 的飞行里落第二笔。
  await settle(1_750);
  assert.equal(cloud.flushStarts.length, 1, "第一次 flush 应已在途");
  await act(async () => {
    bed.current.edit("C1", "second");
  });
  await settle(CYCLE_MS * 2);
  assert.equal(cloud.creations.length, 2, "两笔应落成恰好 2 份 creations");
  assert.deepEqual(cloud.creations[1].snapshot.cells, { B1: "first", C1: "second" });
  // 第二笔由谁送上去取决于重挂与控制器循环谁先到：旧控制器在 recordSavedItem 之后
  // 还没被 dispose 时会自己续飞一次（restore=0）；先重挂则由新实例恢复草稿（restore=1）。
  // 两条路都对；不对的是 2 以上。
  assert.ok(bed.restores.length <= 1, `恢复次数 ${bed.restores.length}`);
  await settle(CYCLE_MS);
  assert.equal(cloud.creations.length, 2, "之后必须停住");
  assert.equal(bed.current.state, "saved");
  await tree.unmount();
});

test("没有成功保存过（真崩溃）时草稿照旧恢复", async () => {
  globalThis.__x7RecoveryStore.reset();
  resetAdvancedSaveLedgerForTests();
  const cloud = createCloud();
  const bed = createBed();
  const item = initialItem();
  globalThis.__x7RecoveryStore.records.set(advancedRecoveryKey("grid", item), {
    key: advancedRecoveryKey("grid", item),
    editorId: "grid",
    revision: 3,
    updatedAt: Date.now() - 60_000,
    payload: { cells: { A1: "from-crash" } },
  });
  const tree = await mount(React.createElement(Host, { cloud, bed }));
  await settle(50);
  assert.equal(bed.restores.length, 1, "崩溃草稿应被恢复");
  assert.deepEqual(bed.current.doc.cells, { A1: "from-crash" });
  assert.equal(bed.current.dirty, true);
  // 恢复出来的内容会被存一次，然后收口——不是再转起环。
  await settle(CYCLE_MS * 2);
  assert.equal(cloud.creations.length, 1);
  assert.equal(bed.restores.length, 1);
  await tree.unmount();
});
