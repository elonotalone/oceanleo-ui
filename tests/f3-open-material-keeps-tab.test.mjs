import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// 操作员 2026-09-24：打开网站素材时右栏自己跳到「云端浏览器」。网站宿主把它自己那份栏位
// （`canvasView`）跟着会话快照一起恢复，作为受控 `active` 喂回右栏；这里钉住的是
// 「用户/深链已经选定的栏位，不被这份受控值拽走」。

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const actionsUrl = dataModule(`
  export const FIXED_WORKSPACE_SLOTS = ["template", "preview", "materials", "mine", "browser"];
  export const WORKSPACE_ACTION_EVENT = "f3-workspace-action";
  export function normalizeWorkspaceAction() { return null; }
  export function isWorkspaceActionConsumed() { return false; }
`);
const slotUrl = await compileModule("src/shell/result-canvas-slot-state.ts", {
  "./workspace-actions": actionsUrl,
});
const { useWorkspaceSlotState } = await import(slotUrl);
const { libraryLocationIntentFromSearch } = await import(
  await compileModule("src/shell/site-catalog-deeplink.tsx")
);

function makeHydration(identity) {
  return {
    identity,
    rightTab: null,
    restoredSnapshot: false,
    snapshotRestoreEpoch: 0,
    setRightTab(tab) { this.rightTab = tab; },
    setDefaultRightTab() {},
  };
}

async function withHost(run) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://example.test/workspace/corp-site",
  });
  const previous = new Map();
  for (const [name, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
  })) {
    previous.set(name, globalThis[name]);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);
  const hydration = makeHydration("website:site:corp-site:session");
  const changes = [];
  let state;
  function Harness({ active }) {
    state = useWorkspaceSlotState({
      active,
      showTemplate: true,
      runtimeHydration: hydration,
      slotForId: (id) => id || "preview",
      callerIdForSlot: (slot) => slot,
      onChange: (id) => changes.push(id),
    });
    return null;
  }
  const render = (active) =>
    act(async () => root.render(React.createElement(Harness, { active })));
  // 与 `FunctionAgentChat` 恢复会话时同一次提交：共享快照的 `right_tab` 与宿主的受控值一起回来。
  const restore = (rightTab, active) => {
    hydration.rightTab = rightTab;
    hydration.restoredSnapshot = true;
    hydration.snapshotRestoreEpoch += 1;
    return render(active);
  };
  try {
    await run({ render, restore, hydration, changes, state: () => state });
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [name, value] of previous) {
      if (value === undefined) delete globalThis[name];
      else Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    }
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

test("已选定素材库时，快照把宿主受控值带回 browser 也不跳，并把宿主改回素材库", async () => {
  await withHost(async ({ render, restore, hydration, changes, state }) => {
    await render("preview");
    await act(async () => state().select("materials"));
    await render("materials");
    changes.length = 0;
    await restore("browser", "browser");
    assert.equal(state().selected, "materials");
    assert.equal(hydration.rightTab, "materials");
    assert.deepEqual(changes, ["materials"]);
    await render("materials");
    assert.equal(state().selected, "materials");
    assert.deepEqual(changes, ["materials"]);
  });
});

test("没有选定栏位时，快照与宿主受控值照旧恢复到 browser，且不回调宿主", async () => {
  await withHost(async ({ render, restore, changes, state }) => {
    await render("preview");
    await restore("browser", "browser");
    assert.equal(state().selected, "browser");
    assert.deepEqual(changes, []);
  });
});

test("恢复那一轮过去之后，宿主自己切栏位仍照常生效", async () => {
  await withHost(async ({ render, restore, changes, state }) => {
    await render("preview");
    await act(async () => state().select("materials"));
    await render("materials");
    await restore("browser", "browser");
    await render("materials");
    changes.length = 0;
    await render("preview");
    assert.equal(state().selected, "preview");
    assert.deepEqual(changes, []);
  });
});

test("不带 mode 的库位置链接解析成同一份预览意图，别的 mode 与非库栏位不认", () => {
  assert.deepEqual(
    libraryLocationIntentFromSearch("?tab=materials&item=25685292-a04b&entry=abc"),
    { artifactId: "25685292-a04b", mode: "preview", surface: "materials" },
  );
  assert.deepEqual(libraryLocationIntentFromSearch("tab=library&item=a1"), {
    artifactId: "a1",
    mode: "preview",
  });
  assert.equal(libraryLocationIntentFromSearch("?tab=materials&item=a1&mode=edit"), null);
  assert.equal(libraryLocationIntentFromSearch("?tab=materials&item=a1&mode=preview"), null);
  assert.equal(libraryLocationIntentFromSearch("?tab=browser&item=a1"), null);
  assert.equal(libraryLocationIntentFromSearch("?tab=materials"), null);
  assert.equal(libraryLocationIntentFromSearch(""), null);
});
