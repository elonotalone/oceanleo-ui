// ============================================================================
// W19 —— 三个内核的**保存入口**按保存对象分档（`_ROUND3.md` §2A）
// ----------------------------------------------------------------------------
// W12 修的是判据那一侧（`grid-model.ts` / `geo-map-persistence.ts` /
// `interactive-doc-persistence.ts` 认 `saveTarget`）。保存**入口**那一侧当时没人改：
// `use-grid-editor.ts` 的 `save()` 无条件走 `saveFileToLibrary`，也就是发 revision
// 的素材链 —— 造一个 xlsx、渲一张预览 PNG、`kind: "sheet"`、标题拼「-编辑版」。
// 于是用户在台账 / 文献矩阵 / 三表模型里记的账，会被当成一件可下载的素材落进库，
// 直接违反 `_COMMON.md` §3.1（插件永不进货架）与 §3.3（库里只出现导出产物）。
//
// 本文件锁的是入口，不是判据：
//   · 台账按 `save()`：一次 `saveFileToLibrary` 都不许发生，xlsx 与预览一件都不许造；
//   · 同一个内核开一件用户上传的 xlsx：素材链原样保留，一个字节都不许变；
//   · 分档判定被改成恒 `"material"`（P4 反面用例），上面第一条必须当场红；
//   · 三个内核各自「存下去 → 重开 → 用户填的东西还在」；
//   · 换一个 app 打开同一个功能，两份实例互不串数据。
// 一行 mock 判据都没有：判据走产品自己的守门人，桩只有「不许发生的那几件事」
// （落库、造交付件、渲预览、取网络）与 i18n。
// ============================================================================

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import ts from "typescript";

import { pluginInstanceLibraryItem } from "../src/shell/plugin-initial-state.ts";
import { advancedRecoveryKey } from "../src/shell/advanced-recovery-store.ts";
import {
  GRID_IR_SCHEMA,
  parseGridIrSource,
} from "../src/shell/doc-editors/grid-model.ts";
import { parseGeoMapSource } from "../src/shell/geo-map-editor/geo-map-source.ts";
import { commitInteractiveDocProject } from "../src/shell/interactive-doc-editor/interactive-doc-persistence.ts";
import {
  parseInteractiveDocSource,
  serializeInteractiveDocProject,
  evaluateComputeGraph,
} from "../src/shell/interactive-doc-editor/interactive-doc-source.ts";
import {
  INTERACTIVE_DOC_PROJECT_SCHEMA,
  validateInteractiveDocProject,
} from "../src/shell/interactive-doc-editor/interactive-doc-schema.ts";

/* ------------------------------ DOM 与编译台 ------------------------------ */

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
  url: "https://excel.oceanleo.com/workspace",
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
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

function realModule(relativePath) {
  return pathToFileURL(resolve(relativePath)).href;
}

async function compileModule(relativePath, replacements) {
  const sourcePath = resolve(relativePath);
  let source = await readFile(sourcePath, "utf8");
  for (const [specifier, replacement] of Object.entries({
    react: reactUrl,
    ...replacements,
  })) {
    source = source.replaceAll(
      JSON.stringify(specifier),
      JSON.stringify(replacement),
    );
  }
  const compiled = ts
    .transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: sourcePath,
    })
    .outputText.replaceAll(
      'from "react/jsx-runtime";',
      `from ${JSON.stringify(jsxRuntimeUrl)};`,
    );
  return `${dataModule(compiled)}#${encodeURIComponent(relativePath)}`;
}

/**
 * 渲染次数上限。加载 effect 一旦自激（W13 修过的那条：effect 体里写 state，
 * 依赖数组里放着每渲染换身份的东西），React 会一直转下去 —— 没有这道闸，
 * 测试表现为永不退出的挂死而不是一条红。
 */
function renderBudget(limit, label) {
  let count = 0;
  return () => {
    count += 1;
    if (count > limit) {
      throw new Error(`${label} 渲染了 ${count} 次，加载 effect 自激了`);
    }
    return count;
  };
}

async function mount(element) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

/* --------------------------------- 桩模块 -------------------------------- */

globalThis.__pluginSaveCalls = [];
const record = (name, payload) =>
  globalThis.__pluginSaveCalls.push({ name, payload });

const uiStubUrl = dataModule(`
  export function useUI() {
    return (value) => value;
  }
`);

/**
 * 「进库」这一步的桩。它照真链的样子把 `createFile` / `createPreview` 也叫一遍 ——
 * 否则「没造 xlsx、没渲预览」这两条断言在素材路径上也会假绿。
 */
const docIoStubUrl = dataModule(`
  export function downloadBlob() {}
  export function downloadText() {}
  export async function loadEditorProject() {
    throw new Error("测试里没有可编辑工程 sidecar");
  }
  export async function saveFileToLibrary(input) {
    globalThis.__pluginSaveCalls.push({
      name: "saveFileToLibrary",
      payload: { title: input.title, kind: input.kind },
    });
    if (input.createFile) await input.createFile();
    if (input.createPreview) await input.createPreview();
    return {
      ok: true,
      url: "https://cdn.test/saved.xlsx",
      versionId: "version-2",
      projectUrl: "https://cdn.test/saved.project.json",
      projectSchema: "oceanleo.grid.v1",
      sourceFormat: "xlsx",
      sourceMediaType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      title: input.title,
      fileName: "saved.xlsx",
      savedAt: "2026-08-05T00:00:00.000Z",
      artifactId: "artifact-grid-1",
      revisionId: "revision-2",
      previousRevisionId: "revision-1",
      error: "",
    };
  }
`);

const previewRasterStubUrl = dataModule(`
  export async function renderGridPreviewPng() {
    globalThis.__pluginSaveCalls.push({ name: "renderGridPreviewPng" });
    return null;
  }
`);

const gridModelUrl = realModule("src/shell/doc-editors/grid-model.ts");
const gridModelSpyUrl = dataModule(`
  export * from ${JSON.stringify(gridModelUrl)};
  export async function buildGridWorkbookBlob() {
    globalThis.__pluginSaveCalls.push({ name: "buildGridWorkbookBlob" });
    return new Blob(["xlsx"]);
  }
`);

/** 网络在这一层一律不许发生：功能数据的字节全在手上。 */
const mediaProxyStubUrl = dataModule(`
  export async function fetchMediaBlob(url) {
    globalThis.__pluginSaveCalls.push({ name: "fetchMediaBlob", payload: url });
    throw new Error("测试不许取网络：" + url);
  }
`);

/** P4(a)：把分档判定改成恒 `"material"`，用来验证 P1 那条测试真的能变回红。 */
const alwaysMaterialStubUrl = dataModule(`
  export * from ${JSON.stringify(realModule("src/shell/plugin-initial-state.ts"))};
  export function saveTargetForItem() {
    return "material";
  }
`);

const GRID_REPLACEMENTS = {
  "../../i18n/ui/useUI": uiStubUrl,
  "./doc-io": docIoStubUrl,
  "./artifact-save-contract": realModule(
    "src/shell/doc-editors/artifact-save-contract.ts",
  ),
  "./editor-preview-raster": previewRasterStubUrl,
  "./grid-model": gridModelSpyUrl,
  "./grid-sheet-identity": realModule(
    "src/shell/doc-editors/grid-sheet-identity.ts",
  ),
  "./office-file": realModule("src/shell/doc-editors/office-file.ts"),
  "./grid-structure": realModule("src/shell/doc-editors/grid-structure.ts"),
  "../plugin-initial-state": realModule("src/shell/plugin-initial-state.ts"),
};

const { useGridEditor } = await import(
  await compileModule("src/shell/doc-editors/use-grid-editor.ts", GRID_REPLACEMENTS)
);
const { useGridEditor: useGridEditorAlwaysMaterial } = await import(
  await compileModule("src/shell/doc-editors/use-grid-editor.ts", {
    ...GRID_REPLACEMENTS,
    "../plugin-initial-state": alwaysMaterialStubUrl,
  })
);

const { useGeoMapWorkbench } = await import(
  await compileModule("src/shell/geo-map-editor/use-geo-map-workbench.ts", {
    "../../i18n/ui/useUI": uiStubUrl,
    "../../lib/media-proxy": mediaProxyStubUrl,
    "./geo-map-source": realModule("src/shell/geo-map-editor/geo-map-source.ts"),
    "./geo-map-advanced-controls": realModule(
      "src/shell/geo-map-editor/geo-map-advanced-controls.ts",
    ),
    "./geo-map-persistence": realModule(
      "src/shell/geo-map-editor/geo-map-persistence.ts",
    ),
    "./geo-map-history": realModule("src/shell/geo-map-editor/geo-map-history.ts"),
  })
);

const { useInteractiveDocWorkbench } = await import(
  await compileModule(
    "src/shell/interactive-doc-editor/use-interactive-doc-workbench.ts",
    {
      "../../lib/media-proxy": mediaProxyStubUrl,
      "../plugin-initial-state": realModule("src/shell/plugin-initial-state.ts"),
      "./interactive-doc-controls": realModule(
        "src/shell/interactive-doc-editor/interactive-doc-controls.ts",
      ),
      "./interactive-doc-history": realModule(
        "src/shell/interactive-doc-editor/interactive-doc-history.ts",
      ),
    },
  )
);

/* --------------------------------- 夹具 ---------------------------------- */

function ledgerInstance(appId = "bookkeeping", nonce = "cap:excel/bookkeeping/ledger-register:1") {
  const item = pluginInstanceLibraryItem("ledger-register", {
    siteId: "excel",
    appId,
    nonce,
  });
  assert.ok(item, "台账造不出实例");
  return item;
}

/** 用户上传的 xlsx 走「表格编辑器」这个编辑类插件 —— 它就该进库。 */
function uploadedWorkbookItem() {
  const artifactId = "artifact-grid-1";
  const revisionId = "revision-1";
  return {
    key: `artifact:${artifactId}:${revisionId}`,
    source: "artifact",
    id: artifactId,
    title: "季度费用明细",
    kind: "sheet",
    siteId: "excel",
    favorite: false,
    url: "https://cdn.test/quarterly.xlsx",
    artifactId,
    revisionId,
    artifactType: "grid",
    meta: {
      content_type: "grid",
      sheets: [
        {
          name: "Sheet1",
          rows: [
            ["日期", "科目", "金额"],
            ["2026-01-02", "差旅", "1200"],
            ["2026-01-09", "办公", "340"],
            ["2026-01-16", "差旅", "880"],
            ["2026-01-23", "培训", "2600"],
          ],
        },
      ],
    },
    artifact: {
      schema: "oceanleo.artifact.v1",
      artifactId,
      revisionId,
      artifactType: "grid",
      sourceFormat: "xlsx",
      editorCapability: "grid-editor",
      editability: "native",
      integrity: { ok: true, reason: "" },
      access: { canRead: true, canEdit: true, canFork: true },
      owner: { visibility: "private" },
      renditions: {},
    },
  };
}

/** 挂一台表格编辑器，返回最新的 hook 状态与重挂入口。 */
async function mountGridEditor(hook, initialItem) {
  let latest = null;
  let setItem = () => {};
  const budget = renderBudget(120, "表格");
  function Probe({ first }) {
    const [current, update] = React.useState(first);
    budget();
    setItem = update;
    latest = hook(current, "excel");
    return null;
  }
  const mounted = await mount(React.createElement(Probe, { first: initialItem }));
  return {
    get state() {
      return latest;
    },
    async reopen(nextItem) {
      await act(async () => setItem(nextItem));
    },
    unmount: mounted.unmount,
  };
}

function firstSheetRows(state) {
  return state.sheets[0].rows.map((row) => [...row]);
}

/**
 * P1 的判据本体，抽出来给 P4(a) 反面用例复用：同一句断言，判定被改坏之后
 * 必须当场抛 —— 「能把它变回红」不是靠另写一条相近的断言来证明的。
 */
function assertNoLibraryTraffic(names) {
  assert.ok(
    !names.includes("saveFileToLibrary"),
    `功能数据被当成素材落库了：${names.join(",") || "(无调用)"}`,
  );
  assert.ok(!names.includes("buildGridWorkbookBlob"), "不许为功能数据造 xlsx");
  assert.ok(!names.includes("renderGridPreviewPng"), "插件没有预览图");
}

/* ============================ P1 —— 缺陷本身 ============================== */

test("台账按保存：一次落库都不许发生，xlsx 与预览一件都不许造", async () => {
  globalThis.__pluginSaveCalls = [];
  const editor = await mountGridEditor(useGridEditor, ledgerInstance());
  try {
    assert.equal(editor.state.loading, false, "第一屏应当已经载入");
    await act(async () => {
      editor.state.setCell(1, 0, "2026-08-05");
    });
    await act(async () => {
      editor.state.setCell(1, 1, "地铁");
    });
    let saved = null;
    await act(async () => {
      saved = await editor.state.save();
    });

    assertNoLibraryTraffic(
      globalThis.__pluginSaveCalls.map((entry) => entry.name),
    );

    assert.ok(saved, `保存被拒了：${editor.state.error}`);
    assert.equal(saved.saveTarget, "plugin-instance");
    assert.equal(saved.artifactId || "", "", "功能数据不许拿到 artifact 身份");
    assert.equal(saved.revisionId || "", "", "功能数据不许发 revision");
    assert.equal(saved.url || "", "", "插件不可下载");
    assert.equal(saved.projectUrl || "", "", "功能数据不落对象存储");
    assert.equal(editor.state.error, "");
    assert.equal(editor.state.dirty, false, "存完了就不该还是脏的");

    // 字节回给调用方，由工作台记进本次会话（与 interactive-doc 同一机制）。
    const reparsed = parseGridIrSource(saved.json, {
      saveTarget: "plugin-instance",
    });
    assert.equal(reparsed.schema, GRID_IR_SCHEMA);
    assert.ok(
      JSON.stringify(reparsed.sheets[0].rows).includes("地铁"),
      "回给会话的字节里没有用户刚记的那一笔",
    );
  } finally {
    await editor.unmount();
  }
});

/* ==================== P4(b) —— 素材那一侧一个字节没变 ===================== */

test("同一个内核开一件用户上传的 xlsx：素材链原样保留", async () => {
  globalThis.__pluginSaveCalls = [];
  const editor = await mountGridEditor(useGridEditor, uploadedWorkbookItem());
  try {
    await act(async () => {
      editor.state.setCell(5, 0, "2026-01-30");
    });
    let saved = null;
    await act(async () => {
      saved = await editor.state.save();
    });
    const names = globalThis.__pluginSaveCalls.map((entry) => entry.name);
    assert.deepEqual(
      names,
      ["saveFileToLibrary", "buildGridWorkbookBlob", "renderGridPreviewPng"],
      "编辑类插件编辑真素材那条路被改动了",
    );
    const call = globalThis.__pluginSaveCalls[0].payload;
    assert.equal(call.kind, "sheet");
    assert.match(call.title, /-编辑版$/);
    assert.ok(saved, "素材保存不该失败");
    assert.equal(saved.saveTarget ?? "material", "material");
    assert.equal(saved.revisionId, "revision-2", "素材照旧发 revision");
    assert.equal(saved.url, "https://cdn.test/saved.xlsx");
  } finally {
    await editor.unmount();
  }
});

test("反面：给一件真 xlsx 挂上功能身份，换不到那条松判据的路", async () => {
  globalThis.__pluginSaveCalls = [];
  const disguised = uploadedWorkbookItem();
  disguised.meta = { ...disguised.meta, plugin_id: "ledger-register" };
  const editor = await mountGridEditor(useGridEditor, disguised);
  try {
    await act(async () => {
      editor.state.setCell(5, 0, "2026-01-30");
    });
    let saved = null;
    await act(async () => {
      saved = await editor.state.save();
    });
    assert.equal(saved, null, "带 artifact 身份的东西不许按功能数据存下去");
    assert.match(editor.state.error, /artifact 身份/);
    assertNoLibraryTraffic(
      globalThis.__pluginSaveCalls.map((entry) => entry.name),
    );
  } finally {
    await editor.unmount();
  }
});

/* ======================= P4(a) —— 判定改坏就必须变红 ====================== */

test("反面：分档判定恒返回 material，台账那条断言当场红", async () => {
  globalThis.__pluginSaveCalls = [];
  const editor = await mountGridEditor(
    useGridEditorAlwaysMaterial,
    ledgerInstance(),
  );
  try {
    await act(async () => {
      editor.state.setCell(1, 0, "2026-08-05");
    });
    await act(async () => {
      await editor.state.save();
    });
    const names = globalThis.__pluginSaveCalls.map((entry) => entry.name);
    assert.throws(
      () => assertNoLibraryTraffic(names),
      /功能数据被当成素材落库了/,
      "判定被改坏之后 P1 那条断言仍然是绿的，说明它没有钉住任何东西",
    );
    assert.ok(
      names.includes("buildGridWorkbookBlob") &&
        names.includes("renderGridPreviewPng"),
      "判定被改坏之后应当照旧造交付件与预览",
    );
  } finally {
    await editor.unmount();
  }
});

/* ===================== P3 —— 三个内核各自存得下、重开得回 ================== */

test("grid：台账存下去再重开，用户记的账还在", async () => {
  globalThis.__pluginSaveCalls = [];
  const editor = await mountGridEditor(useGridEditor, ledgerInstance());
  try {
    await act(async () => {
      editor.state.setCell(1, 0, "2026-08-05");
    });
    await act(async () => {
      editor.state.setCell(1, 1, "地铁");
    });
    await act(async () => {
      editor.state.setCell(1, 2, "6");
    });
    let saved = null;
    await act(async () => {
      saved = await editor.state.save();
    });
    assert.ok(saved?.item, "保存要把可重开的实例交回来");

    await editor.reopen(saved.item);
    assert.equal(editor.state.loading, false);
    const rows = firstSheetRows(editor.state);
    assert.deepEqual(
      rows[1].slice(0, 3),
      ["2026-08-05", "地铁", "6"],
      `重开之后用户填的东西没了：${JSON.stringify(rows)}`,
    );
    assert.equal(
      globalThis.__pluginSaveCalls.filter(
        (entry) => entry.name === "saveFileToLibrary",
      ).length,
      0,
      "重开这一路也不许碰库",
    );
  } finally {
    await editor.unmount();
  }
});

test("grid：换一个 app 打开同一个功能，两份实例互不串数据", async () => {
  const bookkeeping = ledgerInstance(
    "bookkeeping",
    "cap:excel/bookkeeping/ledger-register:1",
  );
  const travel = ledgerInstance("trip-planner", "cap:travel/trip-planner/ledger-register:1");

  // 今天的作用域：实例键是 `plugin:<插件>:<nonce>`，而 nonce 由入口那根线拼成
  // `cap:<站>/<app>/<插件>:<序号>`（`app-capability-launch.ts:59-62`）。
  // 也就是**站与 app 都在键里**，两个 app 各自一份实例、各自一个恢复草稿键。
  assert.notEqual(bookkeeping.key, travel.key);
  assert.notEqual(bookkeeping.id, travel.id);
  assert.notEqual(
    advancedRecoveryKey("grid", bookkeeping),
    advancedRecoveryKey("grid", travel),
  );

  globalThis.__pluginSaveCalls = [];
  const first = await mountGridEditor(useGridEditor, bookkeeping);
  let savedFirst = null;
  try {
    await act(async () => {
      first.state.setCell(1, 1, "记账 app 的账");
    });
    await act(async () => {
      savedFirst = await first.state.save();
    });
  } finally {
    await first.unmount();
  }
  assert.ok(savedFirst?.item);

  const second = await mountGridEditor(useGridEditor, travel);
  try {
    const rows = firstSheetRows(second.state);
    assert.ok(
      !JSON.stringify(rows).includes("记账 app 的账"),
      "另一个 app 打开时读到了上一份实例的数据",
    );
  } finally {
    await second.unmount();
  }
});

test("geo-map：地图上点的标注存得下去，不发 revision、不取网络，重开还在", async () => {
  globalThis.__pluginSaveCalls = [];
  const item = pluginInstanceLibraryItem("annotatable-city-map", {
    siteId: "travel",
    appId: "city-guide",
    nonce: "cap:travel/city-guide/annotatable-city-map:1",
  });
  assert.ok(item, "地图造不出实例");

  let latest = null;
  let setItem = () => {};
  const budget = renderBudget(60, "地图");
  function Probe({ first }) {
    const [current, update] = React.useState(first);
    budget();
    setItem = update;
    latest = useGeoMapWorkbench(current, "travel");
    return null;
  }
  const mounted = await mount(React.createElement(Probe, { first: item }));
  try {
    assert.equal(latest.state, "ready", `地图没进 ready：${latest.error}`);
    await act(async () => {
      latest.setTitle("我的成都散步路线");
    });
    assert.equal(latest.dirty, true);

    let saved = null;
    await act(async () => {
      saved = await latest.save();
    });
    assert.ok(saved, `地图保存被拒：${latest.error}`);
    assert.equal(saved.saveTarget, "plugin-instance");
    assert.equal(saved.artifactId, "", "功能数据不许拿到 artifact 身份");
    assert.equal(saved.revisionId, "", "功能数据不许发 revision");
    assert.equal(saved.projectUrl, "", "功能数据不落对象存储");
    assert.deepEqual(
      globalThis.__pluginSaveCalls.map((entry) => entry.name),
      [],
      "地图保存这一路碰了不该碰的东西",
    );
    const reopened = parseGeoMapSource(saved.json);
    assert.equal(reopened.metadata.title, "我的成都散步路线");

    // 重开：字节回到 `content`，与 `GeoMapRoute.buildSavedItem` 的做法同形。
    await act(async () =>
      setItem({ ...item, content: saved.json, id: `${item.id}:saved` }),
    );
    assert.equal(latest.state, "ready", `重开没进 ready：${latest.error}`);
    assert.equal(
      latest.project.metadata.title,
      "我的成都散步路线",
      "重开之后用户改的东西没了",
    );
  } finally {
    await mounted.unmount();
  }
});

test("interactive-doc：换算器里填的参数存得下去，重开还在", async () => {
  globalThis.__pluginSaveCalls = [];
  const item = pluginInstanceLibraryItem("unit-converter", {
    siteId: "study",
    appId: "unit-tools",
    nonce: "cap:study/unit-tools/unit-converter:1",
  });
  assert.ok(item, "换算器造不出实例");

  const commits = [];
  let latest = null;
  let setItem = () => {};
  const budget = renderBudget(60, "换算器");
  function Probe({ first }) {
    const [current, update] = React.useState(first);
    budget();
    setItem = update;
    const ports = React.useMemo(
      () => ({
        projectSchema: INTERACTIVE_DOC_PROJECT_SCHEMA,
        parse: (input) => parseInteractiveDocSource(input),
        serialize: (project) => serializeInteractiveDocProject(project),
        validate: (project) => validateInteractiveDocProject(project),
        evaluate: (project, inputs) => evaluateComputeGraph(project, inputs),
        commit: async (args) => {
          const result = await commitInteractiveDocProject({
            ...args,
            item: args.item ?? current,
            dependencies: {
              upload: async () => {
                record("upload");
                return { ok: false, error: "不该走到这里" };
              },
              publish: async () => {
                record("publish");
                return { ok: false, error: "不该走到这里" };
              },
              fork: async () => {
                record("fork");
                return { ok: false, error: "不该走到这里" };
              },
            },
          });
          commits.push(result);
          return result;
        },
      }),
      [current],
    );
    latest = useInteractiveDocWorkbench(current, "study", ports);
    return null;
  }
  const mounted = await mount(React.createElement(Probe, { first: item }));
  try {
    assert.equal(latest.phase, "ready", `第一屏没进 ready：${latest.error}`);
    const numeric = latest.controls.find(
      (control) => control.kind === "number" || control.control === "number",
    );
    const parameterId = numeric?.parameterId || latest.controls[0]?.parameterId;
    assert.ok(parameterId, "第一屏没有可填的参数");
    await act(async () => {
      latest.setParameter(parameterId, "42");
    });
    await act(async () => {
      latest.commitInputs();
    });

    let outcome = null;
    await act(async () => {
      outcome = await latest.save();
    });
    assert.equal(outcome.ok, true, `保存被拒：${latest.error}`);
    const [committed] = commits;
    assert.equal(committed.saveTarget, "plugin-instance");
    assert.equal(committed.artifactId, "");
    assert.equal(committed.revisionId, "");
    assert.deepEqual(
      globalThis.__pluginSaveCalls.map((entry) => entry.name),
      [],
      "功能数据保存碰了 artifact 链",
    );

    const bytes = latest.serialize();
    await act(async () =>
      setItem({ ...item, content: bytes, id: `${item.id}:saved` }),
    );
    assert.equal(latest.phase, "ready", `重开没进 ready：${latest.error}`);
    assert.equal(
      String(latest.values[parameterId]),
      "42",
      "重开之后用户填的参数没了",
    );
  } finally {
    await mounted.unmount();
  }
});

test("反面：真素材那一侧，读者试算的数不许被冻进作者的参数缺省", async () => {
  const instance = pluginInstanceLibraryItem("unit-converter", {
    siteId: "study",
    appId: "unit-tools",
    nonce: "cap:study/unit-tools/unit-converter:2",
  });
  const asMaterial = {
    ...instance,
    key: "artifact:doc-1:rev-1",
    id: "doc-1",
    artifactId: "doc-1",
    revisionId: "rev-1",
    artifactType: "interactive_doc",
    meta: { content_type: "interactive_doc" },
    artifact: {
      schema: "oceanleo.artifact.v1",
      artifactId: "doc-1",
      revisionId: "rev-1",
      artifactType: "interactive_doc",
      sourceFormat: INTERACTIVE_DOC_PROJECT_SCHEMA,
      editorCapability: "interactive-doc-editor",
      editability: "native",
      integrity: { ok: true, reason: "" },
      access: { canRead: true, canEdit: true, canFork: true },
      owner: { visibility: "private" },
      renditions: {},
    },
  };

  /** 只看守门人收到的工程是什么，不跑落库那条链。 */
  async function committedProject(item) {
    const seen = [];
    let latest = null;
    const budget = renderBudget(60, "可算文档");
    function Probe() {
      budget();
      const ports = React.useMemo(
        () => ({
          projectSchema: INTERACTIVE_DOC_PROJECT_SCHEMA,
          parse: (input) => parseInteractiveDocSource(input),
          serialize: (project) => serializeInteractiveDocProject(project),
          validate: (project) => validateInteractiveDocProject(project),
          evaluate: (project, inputs) => evaluateComputeGraph(project, inputs),
          commit: async (args) => {
            seen.push(args.project);
            return { ok: true, saveTarget: "spy" };
          },
        }),
        [],
      );
      latest = useInteractiveDocWorkbench(item, "study", ports);
      return null;
    }
    const mounted = await mount(React.createElement(Probe));
    try {
      const parameterId = latest.controls[0]?.parameterId;
      assert.ok(parameterId, "第一屏没有可填的参数");
      const before = latest.project.parameters.find(
        (parameter) => parameter.id === parameterId,
      )?.default;
      await act(async () => {
        latest.setParameter(parameterId, "42");
      });
      await act(async () => {
        latest.commitInputs();
      });
      await act(async () => {
        await latest.save();
      });
      assert.equal(seen.length, 1, "守门人应当只收到一次提交");
      const after = seen[0].parameters.find(
        (parameter) => parameter.id === parameterId,
      )?.default;
      return { parameterId, before, after };
    } finally {
      await mounted.unmount();
    }
  }

  const material = await committedProject(asMaterial);
  assert.equal(
    String(material.after),
    String(material.before),
    "素材那一侧的参数缺省属于作者，读者填的数不许改写它",
  );
  const plugin = await committedProject(instance);
  assert.equal(
    String(plugin.after),
    "42",
    "功能实例那一侧必须把用户填的数冻进字节，否则重开又是第一屏",
  );
});

/* ================= geo-map 的加载 effect：同一条死循环不许复发 ============= */

function loadEffectDependencies(relativePath, marker, sourceText) {
  const file = ts.createSourceFile(
    relativePath,
    sourceText,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );
  let dependencies = null;
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "useEffect" &&
      node.arguments.length === 2 &&
      ts.isArrayLiteralExpression(node.arguments[1]) &&
      node.arguments[0].getText().includes(marker)
    ) {
      dependencies = node.arguments[1].elements.map((element) =>
        element.getText(),
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(dependencies, `${relativePath} 里找不到含 ${marker} 的加载 effect`);
  return dependencies;
}

test("geo-map 的加载 effect 不再依赖调用方递进来的对象与 provider 的 tt", async () => {
  const path = "src/shell/geo-map-editor/use-geo-map-workbench.ts";
  const dependencies = loadEffectDependencies(
    path,
    "readGeoMapSourceBytes(",
    await readFile(resolve(path), "utf8"),
  );
  for (const name of ["item", "tt"]) {
    assert.ok(
      !dependencies.includes(name),
      `${path} 的加载 effect 仍然依赖 ${name}，W13 修过的那条死循环会在这里复发`,
    );
  }
});

test("geo-map：调用方每次渲染都换一个同值 item，也只载入一次", async () => {
  const base = pluginInstanceLibraryItem("interactive-globe", {
    siteId: "travel",
    appId: "globe",
    nonce: "cap:travel/globe/interactive-globe:1",
  });
  assert.ok(base, "地球仪造不出实例");

  let latest = null;
  let rerender = () => {};
  const seen = [];
  const budget = renderBudget(60, "地球仪");
  function Probe() {
    const [tick, setTick] = React.useState(0);
    budget();
    rerender = () => setTick((value) => value + 1);
    // 每次渲染都新建一个内容相同的 item —— 承载层今天就是这么递进来的。
    const item = { ...base, meta: { ...base.meta } };
    latest = useGeoMapWorkbench(item, "travel");
    seen.push(tick);
    return null;
  }
  const mounted = await mount(React.createElement(Probe));
  try {
    assert.equal(latest.state, "ready", `地球仪没进 ready：${latest.error}`);
    const settled = seen.length;
    for (let round = 0; round < 4; round += 1) {
      await act(async () => rerender());
    }
    assert.ok(
      seen.length <= settled + 8,
      `重复渲染把加载 effect 打成了自激：渲染了 ${seen.length} 次`,
    );
    assert.equal(latest.state, "ready");
    assert.equal(latest.error, "");
  } finally {
    await mounted.unmount();
  }
});
