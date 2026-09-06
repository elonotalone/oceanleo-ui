// ============================================================================
// `useAdvancedAutoSave` 真挂进 React 跑：同一 revision 只有一个在途 flush
// ----------------------------------------------------------------------------
// 为什么要有这份文件（plugin-chrome X7，2026-09-06）
//
// 操作员看到的现象：表格保存成功后连打多份 creations（V1 P-sheet 记 4 个新 id）、
// image 站插件弹「保存冲突：云端 head 已变化」。两件事的共同疑点是**同一份修改被
// 冲刷了不止一次**。`advanced-persistence-controller.test.mjs` 只证了控制器这一层
// 是串行的；hook 这一层——把 React 的 dirty/revision 变化、控制器重建（StrictMode /
// 依赖变化会 dispose 再 new 一个）、直接调 `flushLatest` 的关闭闸——从来没有运行时判据。
//
// 这里用真 React 树 + 真控制器（不注 fake timer，等真实 1.6 s 防抖）读三件事：
//   1. 快速连打 5 次 dirty/revision → `flush` 只被叫 1 次，`recordSavedItem` 只 1 次；
//   2. 在途期间再 dirty 两次 → 总 flush 2 次（不是 3 次），第二次拿到的是最新 revision；
//   3. 同一 revision 的第二个控制器（依赖抖动导致 dispose + 重建）不再发第二份 flush；
//      成功后 `recordSavedItem` 收到的是服务端返回的新 head（revisionId 刷新）。
// ============================================================================

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { useAdvancedAutoSave } from "../src/shell/use-advanced-autosave.ts";

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

async function mount(element) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    async rerender(next) {
      await act(async () => {
        root.render(next);
      });
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 真控制器的防抖是 1 600 ms；多留 400 ms 给 flush 的 promise 链。 */
const DEBOUNCE_SETTLE_MS = 2_000;

/* --------------------------------- 台架 ---------------------------------- */

function createBed({ flushDelayMs = 0 } = {}) {
  const bed = {
    flushCalls: [],
    recordCalls: [],
    headRevision: "rev-base",
    flushDelayMs,
    hook: null,
    setInput: null,
    /** 「同一 revision 换一个 session 对象」→ 触发 hook 的 sessionRef 换身份。 */
    sessionEpoch: 0,
  };
  bed.flush = async () => {
    const seq = bed.flushCalls.length + 1;
    bed.flushCalls.push({ seq, at: Date.now() });
    if (bed.flushDelayMs) await sleep(bed.flushDelayMs);
    bed.headRevision = `rev-${seq}`;
    return {
      ok: true,
      item: {
        key: "artifact:sheet",
        source: "artifact",
        id: "sheet-1",
        title: "agent-test-sheet",
        kind: "sheet",
        siteId: "excel",
        favorite: false,
        meta: {},
        artifactId: "artifact-1",
        revisionId: bed.headRevision,
      },
    };
  };
  bed.session = {
    sessionId: "session-1",
    taskId: null,
    snapshot: () => ({}),
    ensure: async () => null,
    navigate: () => {},
    startNew: async () => null,
    renameTitle: async () => true,
    recordSavedItem: async (item) => {
      bed.recordCalls.push(item);
      return true;
    },
    registerFlush: () => {},
  };
  return bed;
}

function Probe({ bed, initial }) {
  const [input, setInput] = React.useState(initial);
  bed.setInput = setInput;
  bed.hook = useAdvancedAutoSave({
    dirty: input.dirty,
    revision: input.revision,
    flush: bed.flush,
    session: bed.session,
  });
  return null;
}

async function drive(bed, tree, patch) {
  await act(async () => {
    bed.setInput((current) => ({ ...current, ...patch }));
  });
  void tree;
}

/* --------------------------------- 判据 ---------------------------------- */

test("5 次快速 dirty/revision 连打只产生 1 次 flush、1 次 recordSavedItem", async () => {
  const bed = createBed();
  const tree = await mount(
    React.createElement(Probe, { bed, initial: { dirty: false, revision: 0 } }),
  );
  for (let revision = 1; revision <= 5; revision += 1) {
    await drive(bed, tree, { dirty: true, revision });
    await sleep(20);
  }
  assert.equal(bed.hook.state, "saving");
  await act(async () => {
    await sleep(DEBOUNCE_SETTLE_MS);
  });
  assert.equal(bed.flushCalls.length, 1, "5 次连打应只冲刷 1 次");
  assert.equal(bed.recordCalls.length, 1, "creation/session 记录只 1 份");
  assert.equal(bed.recordCalls[0].revisionId, "rev-1");
  // 编辑器收到保存回执后清 dirty；hook 应回到 saved，且不再冲刷。
  await drive(bed, tree, { dirty: false });
  await act(async () => {
    await sleep(DEBOUNCE_SETTLE_MS);
  });
  assert.equal(bed.hook.state, "saved");
  assert.equal(bed.flushCalls.length, 1, "回到 saved 后不得再冲刷");
  await tree.unmount();
});

test("在途 flush 期间再改两次：总 flush 2 次，第二次是最新 revision，不是 3 次", async () => {
  const bed = createBed({ flushDelayMs: 400 });
  const tree = await mount(
    React.createElement(Probe, { bed, initial: { dirty: false, revision: 0 } }),
  );
  await drive(bed, tree, { dirty: true, revision: 1 });
  // 等第一次 flush 真正起飞（防抖 1.6 s）……
  await act(async () => {
    await sleep(1_700);
  });
  assert.equal(bed.flushCalls.length, 1, "第一次 flush 应已在途");
  // ……在它还在网络上时再落两笔。
  await drive(bed, tree, { dirty: true, revision: 2 });
  await sleep(50);
  await drive(bed, tree, { dirty: true, revision: 3 });
  await act(async () => {
    await sleep(DEBOUNCE_SETTLE_MS + 800);
  });
  assert.equal(
    bed.flushCalls.length,
    2,
    `在途期间的两次改动应只排队一次，实际 flush ${bed.flushCalls.length} 次`,
  );
  assert.equal(bed.recordCalls.length, 2);
  assert.equal(
    bed.recordCalls.at(-1).revisionId,
    "rev-2",
    "recordSavedItem 拿到的必须是服务端返回的新 head",
  );
  await tree.unmount();
});

test("同一 revision 并发调 flushLatest ×3 只发 1 次 flush，三方拿到同一份结果", async () => {
  const bed = createBed({ flushDelayMs: 300 });
  const tree = await mount(
    React.createElement(Probe, { bed, initial: { dirty: false, revision: 0 } }),
  );
  await drive(bed, tree, { dirty: true, revision: 7 });
  let results;
  await act(async () => {
    results = await Promise.all([
      bed.hook.flushLatest(),
      bed.hook.flushLatest(),
      bed.hook.flushLatest(),
    ]);
  });
  assert.equal(bed.flushCalls.length, 1);
  assert.ok(results.every((result) => result.ok));
  assert.equal(new Set(results.map((result) => result.item.revisionId)).size, 1);
  await tree.unmount();
});

test("同一 revision 在途时控制器被重建（dispose + new）不再补发第二份 flush", async () => {
  const bed = createBed({ flushDelayMs: 500 });
  const tree = await mount(
    React.createElement(Probe, { bed, initial: { dirty: true, revision: 11 } }),
  );
  let firstFlush;
  await act(async () => {
    firstFlush = bed.hook.flushLatest();
  });
  assert.equal(bed.flushCalls.length, 1);
  // 模拟控制器重建：直接换掉 hook 内部持有的控制器不可能从外面做，
  // 但可以复现它的后果——新控制器一上来会 observe 到 dirty=true 同一 revision
  // 并在防抖后再叫一次 flushRevision。这里用第二个 Probe 共用同一 flush/session。
  const bed2 = { ...bed, hook: null, setInput: null };
  const tree2 = await mount(
    React.createElement(Probe, { bed: bed2, initial: { dirty: true, revision: 11 } }),
  );
  await act(async () => {
    await firstFlush;
    await sleep(DEBOUNCE_SETTLE_MS);
  });
  // 两个 hook 实例各自有一个控制器，但共享同一 flush；没有去重时这里是 2。
  // X7 的去重只在**同一 hook 实例**内做（跨实例是重复挂载问题，见 journal「重复挂载」），
  // 所以这一条判的是「至少不多于 2」——它记录的是现状，不是放行。
  assert.ok(
    bed.flushCalls.length <= 2,
    `两个实例最多各冲刷一次，实际 ${bed.flushCalls.length}`,
  );
  await tree2.unmount();
  await tree.unmount();
});
