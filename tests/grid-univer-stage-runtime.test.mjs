// 一个 Univer 实例、两种 chrome —— **运行期**判据（plugin-ui-overhaul U3 任务书 §5 (a)(b)(c)(d)）。
//
// `grid-univer-stage-mode.test.mjs` 用 AST 判 effect 的形状；这一份把 `GridUniverStage`
// 真挂进 jsdom，把 `@univerjs/presets` 的 `createUniver` 换成计数桩，走用户那条路：
//   (a) 页面行切 普通 ↔ 专业 五个来回，`createUniver` 仍是 1 次、`dispose` 0 次；
//   (b) 关掉文档：cleanup 当下 `dispose` 还是 0（不在 React 提交里同步卸另一个 root），
//       下一个宏任务里恰好 1 次；
//   (c) 切档之后 **不等任何微任务** 容器上的 chrome 属性已经翻过来（useLayoutEffect 同步）；
//   (d) 首帧：`createUniver` 返回的那一刻起 `setUIVisible(toolbar,false)` 已经调过，
//       容器 `data-grid-univer-toolbar="off"`，ribbon 一帧都没露过。
//
// Univer 的 12 个 preset 包与 locale 全是替身（它们的真身要 canvas / ResizeObserver，
// jsdom 起不来），其余全走真模块——module-bench 自动解析，被测文件再加 import 也不会哑。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule, realModule } from "./helpers/module-bench.mjs";
import { GRID_UNIVER_CHROME_ATTRS } from "../src/shell/doc-editors/grid-univer/stage-plan.ts";
import {
  resetPluginModeCache,
  setPluginMode,
} from "../src/shell/plugin-chrome/plugin-mode-store.ts";

/* ------------------------------ jsdom 宿主 ------------------------------- */

const require = createRequire(import.meta.url);
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
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
  HTMLDivElement: window.HTMLDivElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  localStorage: window.localStorage,
  getComputedStyle: window.getComputedStyle.bind(window),
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
if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

/* ------------------------------ Univer 替身 ------------------------------ */

/** 全局计数器：桩模块是 data: URL，只能经 globalThis 与测试通话。 */
const counters = {
  createUniver: 0,
  dispose: 0,
  setUIVisible: [],
};
globalThis.__gridUniverRuntimeCounters = counters;

const presetsStubUrl = dataModule(`
  const counters = globalThis.__gridUniverRuntimeCounters;
  export const LocaleType = { ZH_CN: "zhCN", EN_US: "enUS" };
  export const IUndoRedoService = "IUndoRedoService";
  export function mergeLocales(...parts) { return Object.assign({}, ...parts); }
  // snapshot.ts 用它把富文本单元格压成纯文本；替身照 Univer 的实现只拼 body.dataStream。
  export function getPlainText(doc) {
    const stream = doc && doc.body && typeof doc.body.dataStream === "string" ? doc.body.dataStream : "";
    return stream.endsWith("\\r\\n") ? stream.slice(0, -2) : stream;
  }
  function fakeRange() {
    return {
      getRow: () => 0, getColumn: () => 0, getWidth: () => 1, getHeight: () => 1,
      getValue: () => null, getValues: () => [[null]], setValue() {}, setValues() {},
      getA1Notation: () => "A1",
    };
  }
  export function createUniver(config) {
    counters.createUniver += 1;
    counters.lastConfig = config;
    let snapshot = null;
    let topUndo = null;
    let workbookTop = null;
    let topRedo = null;
    let commandCallback = null;
    let statusCallback = null;
    const undoService = {
      pitchTopUndoElement: () => topUndo,
      pitchTopRedoElement: () => topRedo,
      undoRedoStatus$: { subscribe(cb) { statusCallback = cb; return { unsubscribe() { statusCallback = null; } }; } },
    };
    const sheet = {
      getSheetId: () => "s1",
      getSheetName: () => "Sheet1",
      getRange: () => fakeRange(),
      getSelection: () => ({ getActiveRange: () => fakeRange() }),
      getMaxRows: () => 100,
      getMaxColumns: () => 26,
    };
    const workbook = {
      getId: () => "wb",
      getActiveSheet: () => sheet,
      getSheets: () => [sheet],
      getSnapshot: () => structuredClone(snapshot),
      save: () => structuredClone(snapshot),
      setEditable() {},
      onCommandExecuted: () => ({ dispose() {} }),
      undo() {}, redo() {},
    };
    const univerAPI = {
      createWorkbook(data) { snapshot = data; return workbook; },
      getActiveWorkbook: () => (snapshot ? workbook : null),
      disposeUnit() { snapshot = null; return true; },
      setUIVisible(part, visible) { counters.setUIVisible.push([part, visible]); },
      getFormula: () => ({ executeCalculation() {} }),
      onCommandExecuted: (cb) => { commandCallback = cb; return { dispose() { commandCallback = null; } }; },
      addEvent: () => ({ dispose() {} }),
      Event: {},
    };
    counters.edit = (value = "Edited cell") => {
      snapshot.sheets[Object.keys(snapshot.sheets)[0]].cellData = { 0: { 0: { v: value, t: 1 } } };
      topUndo = workbookTop = {unitID:"wb",id:Math.random()};
      statusCallback?.();
      commandCallback?.();
    };
    counters.cellTyping = () => { topUndo={unitID:"cell-editor",id:"typing"};statusCallback?.();commandCallback?.(); };
    counters.cellEmpty = () => { topUndo=null;statusCallback?.();commandCallback?.(); };
    counters.focusWorkbook = () => { topUndo=workbookTop;statusCallback?.();commandCallback?.(); };
    const univer = {
      __getInjector: () => ({ get: (id) => id === "IUndoRedoService" ? undoService : null }),
      dispose() { counters.dispose += 1; },
    };
    return { univer, univerAPI };
  }
`);

const presetNames = {
  "@univerjs/preset-sheets-core": "UniverSheetsCorePreset",
  "@univerjs/preset-sheets-filter": "UniverSheetsFilterPreset",
  "@univerjs/preset-sheets-sort": "UniverSheetsSortPreset",
  "@univerjs/preset-sheets-data-validation": "UniverSheetsDataValidationPreset",
  "@univerjs/preset-sheets-conditional-formatting":
    "UniverSheetsConditionalFormattingPreset",
  "@univerjs/preset-sheets-find-replace": "UniverSheetsFindReplacePreset",
  "@univerjs/preset-sheets-hyper-link": "UniverSheetsHyperLinkPreset",
  "@univerjs/preset-sheets-thread-comment": "UniverSheetsThreadCommentPreset",
  "@univerjs/preset-sheets-drawing": "UniverSheetsDrawingPreset",
  "@univerjs/preset-sheets-table": "UniverSheetsTablePreset",
  "@univerjs/preset-sheets-note": "UniverSheetsNotePreset",
};
const stubs = { "@univerjs/presets": presetsStubUrl };
for (const [pkg, name] of Object.entries(presetNames)) {
  stubs[pkg] = dataModule(`export function ${name}(config) { return { name: ${JSON.stringify(name)}, config }; } export const ICanvasColorService = "ICanvasColorService"; export const IRenderManagerService = "IRenderManagerService";`);
  if (pkg.endsWith("drawing")) stubs[pkg] = dataModule(`export function ${name}(config) { return { name: ${JSON.stringify(name)}, config }; } export const IImageIoService = "IImageIoService"; export class ImageIoService {async saveImage(){return {imageId:"native",source:"data:image/png;base64,AA==",imageSourceType:"BASE64",base64Cache:"AA==",status:"0"};}} export const ImageSourceType = { URL: "URL" };`);
  stubs[`${pkg}/locales/zh-CN`] = dataModule(`export default {};`);
  stubs[`${pkg}/lib/index.css`] = dataModule(``);
}

// 取源：长期库件的签名解析在别的测试里判；这里给一份稳定、已就位的源，
// 让加载 effect 只跑一次，判据聚焦在实例与 chrome 上。
stubs["../office-editor"] = dataModule(`
  export function useOfficeArtifactSource(item) {
    return {
      item,
      url: "",
      purpose: null,
      loading: false,
      error: "",
      version: 0,
      retry() {},
      resourceFailed() {},
    };
  }
`);
// 库 / 落盘 / 网络：`doc-io` 走真模块（`grid-model` 也从它拿 `urlExtension`），
// 只把它底下的 Supabase / artifact 客户端换成不取网的替身。
stubs["../../lib/database"] = dataModule(`
  export async function saveCreations() { return { ok: false, error: "测试不落库" }; }
  export async function uploadFile() { return { ok: false, error: "测试不上传" }; }
`);
// `artifact-client` 走真模块，只换掉它拿 token 的那一层：空白起手件没有 artifactId，
// 这条路在本测试里不会被走到，替身只是保证没有任何网络。
stubs["../lib/auth/client"] = dataModule(`
  export async function accessToken() { return ""; }
`);
stubs["../../lib/media-proxy"] = dataModule(`
  export async function fetchMediaBlob() { throw new Error("测试不取网"); }
`);
// 文案：舞台的 `useUI()` 需要 locale provider；这里原文照出（判据不看文案，
// 16 语齐全由 `tests/i18n-tt-key-coverage.test.mjs` 守）。
stubs["../../i18n/ui/useUI"] = dataModule(`
  export function useUI() {
    return (zh, vars) =>
      vars
        ? String(zh).replace(/\\{(\\w+)\\}/g, (_, k) => (k in vars ? String(vars[k]) : "{" + k + "}"))
        : zh;
  }
`);
// 外壳：只把 `adapter.stage` 与文档动作画出来，chrome 的判据全在 stage 容器上。
const saverUrl=await compileModule("src/shell/use-advanced-autosave.ts",{
  "../lib/auth/client":dataModule('export async function accessToken(){return "test";}'),
  "../lib/auth/config":dataModule('export const GATEWAY_BASE="https://gateway.invalid",SUPABASE_URL="https://database.invalid";'),
});
stubs["../AdvancedWorkbenchShell"] = dataModule(`
  import { jsx, jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
  import {useAdvancedAutoSave} from ${JSON.stringify(saverUrl)};
  export function AdvancedWorkbenchShell(props) {
    const adapter = props.adapter || {};
    const counters=globalThis.__gridUniverRuntimeCounters;
    counters.adapter = adapter;
    const p=adapter.persistence;
    counters.save=useAdvancedAutoSave({item:props.item,editorId:"grid",dirty:p.dirty,revision:p.editRevision,flush:p.flush,preparePublish:p.preparePublish,recovery:{...p.recovery,ready:Boolean(counters.integrated&&p.recovery.ready)},session:null});
    return jsxs("div", {
      "data-shell": "1",
      "data-status": adapter.status || "",
      children: [
        jsx("div", { "data-shell-stage": "1", children: adapter.stage || null }),
        jsx("button", { "data-edit": "grid", onClick: () => { globalThis.__gridUniverRuntimeCounters.edit(); }, children: "Edit cell" }),
        jsx("div", {
          "data-shell-actions": (adapter.documentActions || []).map((a) => a.id).join(","),
        }),
      ],
    });
  }
`);

stubs["./editor-insert-media"] = dataModule('export async function uploadEditorMedia(){globalThis.__gridUniverRuntimeCounters.imageUploads=(globalThis.__gridUniverRuntimeCounters.imageUploads||0)+1;return "https://example.invalid/upload.png";}');
stubs["./doc-io"] = dataModule(`
  export * from ${JSON.stringify(realModule("src/shell/doc-editors/doc-io.ts"))};
  export async function saveFileToLibrary(input) {
    const counters = globalThis.__gridUniverRuntimeCounters;
    counters.publishInput = input;
    if(counters.integrated)return {ok:true,item:{...input.item,revisionId:"published-grid"},url:"https://example.invalid/grid.xlsx",revisionId:"published-grid"};
    return new Promise((resolve) => { counters.resolvePublish = () => resolve({ok:true,url:"https://example.invalid/saved.xlsx",versionId:"revision-grid",revisionId:"revision-grid",projectUrl:"https://example.invalid/grid.json",item:{...input.item,revisionId:"revision-grid"}}); });
  }
`);
stubs["next/dynamic"] = dataModule(`
  import {createElement,useEffect,useState} from ${JSON.stringify(pathToFileURL(require.resolve("react")).href)};
  export default function dynamic(loader) {return function Dynamic(props) {
    const [Component,setComponent]=useState(null);
    useEffect(()=>{let alive=true;loader().then((component)=>{if(alive)setComponent(()=>component);});return ()=>{alive=false;};},[]);
    return Component ? createElement(Component,props) : null;
  };}
`);

const stageUrl = await compileModule(
  "src/shell/doc-editors/GridUniverStage.tsx",
  stubs,
);
const { GridUniverStage } = await import(stageUrl);
const { GridRoute } = await import(await compileModule("src/shell/advanced-routes/GridRoute.tsx", stubs));

/* -------------------------------- 工具 ---------------------------------- */

function blankItem() {
  return {
    key: "blank:grid",
    source: "creation",
    id: "blank-grid-runtime",
    title: "运行期判据用的空表",
    kind: "sheet",
    siteId: "excel",
    favorite: false,
    meta: {},
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
    root,
    async flush() {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await new Promise((resolveTick) => setTimeout(resolveTick, 0));
      });
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

const nextMacrotask = () => new Promise((resolveTick) => setTimeout(resolveTick, 0));

function stageContainer(container) {
  return container.querySelector("[data-grid-univer-stage]");
}

function resetCounters() {
  counters.createUniver = 0;
  counters.dispose = 0;
  counters.setUIVisible.length = 0;
  counters.lastConfig = null;
}

/* -------------------------------- 判据 ---------------------------------- */

test("(d) 首帧无 ribbon：createUniver 返回后 chrome 立刻按普通档收起，一帧都没露", async () => {
  resetPluginModeCache();
  resetCounters();
  const mounted = await mount(
    React.createElement(GridUniverStage, { item: blankItem(), onClose() {} }),
  );
  try {
    await mounted.flush();
    assert.equal(counters.createUniver, 1, "实例建了一次");
    const stage = stageContainer(mounted.container);
    assert.ok(stage, "舞台容器在树上");
    assert.equal(stage.getAttribute(GRID_UNIVER_CHROME_ATTRS.toolbar), "off");
    assert.equal(stage.getAttribute(GRID_UNIVER_CHROME_ATTRS.formulaBar), "off");
    assert.equal(stage.getAttribute(GRID_UNIVER_CHROME_ATTRS.header), "off");
    assert.equal(stage.getAttribute(GRID_UNIVER_CHROME_ATTRS.footer), "on");
    const toolbarCalls = counters.setUIVisible.filter(([part]) => /toolbar/i.test(part));
    assert.ok(toolbarCalls.length > 0, "createUniver 之后就对 api 说了 toolbar 的可见性");
    assert.ok(
      toolbarCalls.every(([, visible]) => visible === false),
      "普通档下每一次对 toolbar 的 setUIVisible 都是 false：ribbon 从没被打开过",
    );
    // 加载遮罩已撤：用户不会一直看着转圈。
    assert.equal(mounted.container.querySelector("[data-grid-univer-loading]"), null);
  } finally {
    await mounted.unmount();
    await nextMacrotask();
    resetPluginModeCache();
  }
});

test("(a)(c) 普通 ↔ 专业 来回五次：createUniver 仍 1、dispose 0；切档同步落 DOM", async () => {
  resetPluginModeCache();
  resetCounters();
  const mounted = await mount(
    React.createElement(GridUniverStage, { item: blankItem(), onClose() {} }),
  );
  try {
    await mounted.flush();
    assert.equal(counters.createUniver, 1);
    const stage = stageContainer(mounted.container);
    for (let round = 0; round < 5; round += 1) {
      // (c) 页面行点「Univer」= 改 L0 store。act() 同步提交，useLayoutEffect 在提交内跑，
      // 出了 act 就必须已经翻好，不再等微任务 / 宏任务。
      act(() => {
        setPluginMode("grid", "pro");
      });
      assert.equal(stage.getAttribute(GRID_UNIVER_CHROME_ATTRS.toolbar), "on", `第 ${round + 1} 回：专业档 ribbon 同步出现`);
      assert.equal(stage.getAttribute(GRID_UNIVER_CHROME_ATTRS.formulaBar), "on");
      assert.equal(stage.getAttribute("data-grid-univer-mode"), "pro");
      act(() => {
        setPluginMode("grid", "normal");
      });
      assert.equal(stage.getAttribute(GRID_UNIVER_CHROME_ATTRS.toolbar), "off", `第 ${round + 1} 回：普通档 ribbon 同步收起`);
      assert.equal(stage.getAttribute("data-grid-univer-mode"), "normal");
    }
    await mounted.flush();
    // (a) 十次切档之后实例还是那一台。
    assert.equal(counters.createUniver, 1, "切模式不许重建实例");
    assert.equal(counters.dispose, 0, "切模式不许 dispose");
    const proToolbar = counters.setUIVisible.filter(([part, visible]) => /toolbar/i.test(part) && visible === true);
    assert.ok(proToolbar.length >= 5, "专业档每次都真对 api 开了 toolbar");
  } finally {
    await mounted.unmount();
    await nextMacrotask();
    resetPluginModeCache();
  }
});

test("(b) 关掉文档：卸载当下 dispose 仍是 0，下一个宏任务里恰好 1 次", async () => {
  resetPluginModeCache();
  resetCounters();
  const mounted = await mount(
    React.createElement(GridUniverStage, { item: blankItem(), onClose() {} }),
  );
  await mounted.flush();
  assert.equal(counters.createUniver, 1);
  assert.equal(counters.dispose, 0);

  // 同步版 act：回调不是 async，act 在返回前就把 unmount 与 passive cleanup 冲完，
  // 中间不让出事件循环——否则并行跑整套测试时机器一慢，`setTimeout(…,0)` 的 dispose
  // 会在 `await act(async …)` 让出的那一拍里先到，把「cleanup 里没同步 dispose」判成假红。
  act(() => {
    mounted.root.unmount();
  });
  // React 的 cleanup 已经跑完，但 dispose 还没发生：它不许在 React 提交里同步卸另一个 root。
  assert.equal(counters.dispose, 0, "cleanup 里不许同步 dispose");
  await nextMacrotask();
  assert.equal(counters.dispose, 1, "下一个宏任务里 dispose 恰好一次");
  await nextMacrotask();
  assert.equal(counters.dispose, 1, "不许重复 dispose");
  assert.equal(counters.createUniver, 1, "卸载不许再建");
  mounted.container.remove();
  resetPluginModeCache();
});

// StrictMode 双挂双卸那条（收回停车的实例）在这里判不了：node 端 `react` 解析到
// production 构建，StrictMode 不双跑 effect，写了也是空判。它的形状由
// `grid-univer-stage-mode.test.mjs` 用 AST 盯着（parkedRef 收回分支）。


test("working copy restores all workbook fields without a user revision and reports native edits", async () => {
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  resetCounters();
  resetPluginModeCache();
  const mounted = await mount(React.createElement(GridUniverStage, { item: blankItem(), onClose() {} }));
  try {
    await mounted.flush();
    let persistence = counters.adapter.persistence;
    assert.equal(persistence.editRevision, 0);
    assert.equal(persistence.dirty, false);
    assert.equal(persistence.recovery.draftSchema, "oceanleo.univer-working-document.v1");
    const copy = persistence.recovery.capture();
    copy.styles = { custom: { bl: 1, bg: { rgb: "#aabbcc" } } };
    copy.resources = [{ name: "SHEET_NOTE_PLUGIN", data: JSON.stringify({ s1: { 0: { 0: "note" } } }) }];
    await act(async () => { assert.equal(persistence.recovery.restore(copy), true); });
    persistence = counters.adapter.persistence;
    assert.equal(persistence.editRevision, 0, "server restoration is not a user edit");
    assert.deepEqual(persistence.recovery.capture(), copy);
    await act(async () => mounted.container.querySelector("[data-edit=grid]").click());
    persistence = counters.adapter.persistence;
    assert.equal(persistence.dirty, true);
    assert.equal(persistence.editRevision, 1, "native undo-stack edit advances once");
    assert.equal(persistence.recovery.capture().sheets[Object.keys(copy.sheets)[0]].cellData[0][0].v, "Edited cell");
    const frozen = persistence.recovery.capture();
    const next = structuredClone(frozen);
    next.sheets[Object.keys(next.sheets)[0]].cellData[0][0].v = "Later";
    await act(async () => { persistence.recovery.restore(next); });
    assert.equal(frozen.sheets[Object.keys(copy.sheets)[0]].cellData[0][0].v, "Edited cell");
    assert.equal(typeof persistence.preparePublish, "function");
    assert.equal(errors.length, 0, errors.join("\n"));
  } finally {
    await mounted.unmount();
    await nextMacrotask();
    console.error = originalError;
  }
});


test("real GridRoute: ready snapshot capture, concurrent edits and publication after unmount", async () => {
  const errors = []; const originalError = console.error; console.error = (...args) => errors.push(args.join(" "));
  resetCounters(); resetPluginModeCache(); counters.publishInput = null;
  const mounted = await mount(React.createElement(GridRoute, { item: blankItem(), onClose() {} }));
  try {
    for (let i = 0; i < 20 && !mounted.container.querySelector("[data-edit=grid]"); i++) await mounted.flush();
    await act(async () => mounted.container.querySelector("[data-edit=grid]").click());
    let persistence = counters.adapter.persistence;
    assert.equal(persistence.editRevision, 1); assert.equal(persistence.dirty, true);
    const publish = persistence.preparePublish();
    await act(async () => counters.edit("Later edit"));
    let pending;
    await act(async () => { pending = publish(); });
    assert.equal(counters.publishInput.project.data.sheets[Object.keys(counters.publishInput.project.data.sheets)[0]].cellData[0][0].v, "Edited cell");
    await act(async () => { counters.resolvePublish(); await pending; });
    assert.equal(counters.adapter.persistence.dirty, true, "older publish cannot clear a newer edit");
    const echoed = {...blankItem(),revisionId:"revision-grid",url:"https://example.invalid/saved.xlsx"};
    await act(async () => mounted.root.render(React.createElement(GridRoute,{item:echoed,onClose(){}})));
    assert.equal(counters.adapter.persistence.editRevision, 2, "own save echo is not a source reload");
    const afterClose = counters.adapter.persistence.preparePublish();
    await mounted.unmount(); await nextMacrotask();
    pending = afterClose();
    assert.equal(counters.publishInput.project.data.sheets[Object.keys(counters.publishInput.project.data.sheets)[0]].cellData[0][0].v, "Later edit");
    counters.resolvePublish(); assert.equal((await pending).ok, true);
    assert.deepEqual(errors, [], errors.join("\n"));
  } finally {
    if (mounted.container.isConnected) await mounted.unmount();
    await nextMacrotask(); console.error = originalError;
  }
});


test("real GridRoute capture stays within budget for a 72000-cell workbook", async () => {
  const errors = []; const originalError = console.error; console.error = (...args) => errors.push(args.join(" "));
  resetCounters(); resetPluginModeCache();
  const mounted = await mount(React.createElement(GridRoute, {item:blankItem(),onClose(){}}));
  try {
    for (let i=0;i<20&&!mounted.container.querySelector("[data-edit=grid]");i++) await mounted.flush();
    const doc = counters.adapter.persistence.recovery.capture();
    const sheets = {};
    for(let s=0;s<4;s++) { const cellData={};for(let r=0;r<1500;r++)cellData[r]=Object.fromEntries(Array.from({length:12},(_,c)=>[c,{v:`Row ${r} column ${c}`,t:1}]));sheets[`s${s}`]={id:`s${s}`,name:`Sheet ${s}`,rowCount:2000,columnCount:26,cellData}; }
    const large={...doc,sheets,sheetOrder:Object.keys(sheets)};
    await act(async()=>assert.equal(counters.adapter.persistence.recovery.restore(large),true));
    const times=[];let copy;for(let i=0;i<9;i++){const start=performance.now();copy=counters.adapter.persistence.recovery.capture();times.push(performance.now()-start);}
    times.sort((a,b)=>a-b);
    console.log(`ROUTE_CAPTURE grid 4 sheets/72000 cells: bytes=${Buffer.byteLength(JSON.stringify(copy))} p50=${times[4].toFixed(2)}ms p95=${times[8].toFixed(2)}ms n=9`);
    assert.ok(times[8]<=100);assert.deepEqual(copy,large);assert.deepEqual(errors,[]);
  } finally {await mounted.unmount();await nextMacrotask();console.error=originalError;}
});


test("native Univer image insertion uploads the device file before returning a document reference", async () => {
  resetCounters();resetPluginModeCache();counters.imageUploads=0;
  const mounted=await mount(React.createElement(GridUniverStage,{item:blankItem(),onClose(){}}));
  try {
    await mounted.flush();
    const ImageIo = counters.lastConfig.override[0][1].useClass;
    const image=await new ImageIo().saveImage(new File(["image"],"local.png",{type:"image/png"}));
    assert.equal(counters.imageUploads,1);assert.equal(image.source,"https://example.invalid/upload.png");assert.equal(image.imageSourceType,"URL");
  } finally {await mounted.unmount();await nextMacrotask();}
});


test("integrated sheet reopen and 40 committed cells: no false conflict and exactly one PUT per edit",async()=>{
  const errors=[];const oldError=console.error;console.error=(...args)=>errors.push(args.join(" "));
  const previousFetch=globalThis.fetch;let puts=0,releaseGet,delay=0;
  const original={id:"wb",name:"Book",sheetOrder:["s1"],sheets:{s1:{id:"s1",name:"Sheet1",rowCount:100,columnCount:26,cellData:{0:{0:{v:"Existing",t:1}}}}}};
  let copy={schema:"oceanleo.univer-working-document.v1",seq:55,published_seq:0,base_revision_id:null,saved_at:new Date().toISOString(),doc:original};
  globalThis.fetch=async(_url,init={})=>{
    if(!init.method||init.method==="GET"){await new Promise(done=>releaseGet=done);return new Response(JSON.stringify(copy));}
    if(init.method==="POST")return new Response("{}");
    const input=JSON.parse(init.body);assert.equal(input.if_seq,copy.seq);puts++;if(delay)await new Promise(r=>setTimeout(r,delay));
    copy={...copy,seq:copy.seq+1,doc:input.doc};
    return new Response(JSON.stringify({ok:true,seq:copy.seq,saved_at:copy.saved_at,server_ms:0}));
  };
  resetCounters();resetPluginModeCache();counters.integrated=true;
  const view=await mount(React.createElement(GridRoute,{item:blankItem(),onClose(){}}));
  try {
    for(let i=0;i<30&&!releaseGet;i++)await view.flush();
    await act(async()=>{counters.cellTyping();counters.cellEmpty();counters.focusWorkbook();});
    assert.equal(counters.adapter.persistence.editRevision,0,"cell-document focus never creates a pre-GET edit");
    await act(async()=>{releaseGet();await new Promise(r=>setTimeout(r,0));});
    assert.equal(counters.save.conflict,false);assert.equal(counters.save.state,"saved");assert.equal(puts,0);
    let edit=0;
    const settled=async()=>{for(let n=0;n<100&&counters.save.state!=="saved";n++)await act(async()=>{await new Promise(r=>setTimeout(r,5));});assert.equal(counters.save.state,"saved");};
    for(const rtt of [0,150]){
      delay=rtt+33;const samples=[],bursts=[];
      for(let i=0;i<20;i++){
        const before=puts;
        await act(async()=>counters.cellTyping());assert.equal(puts,before,"cell document produces no PUT");
        const start=performance.now();
        await act(async()=>counters.edit(`Committed ${++edit}`));await settled();
        samples.push(performance.now()-start);assert.equal(puts,before+1);assert.equal(counters.adapter.persistence.editRevision,edit);
      }
      for(let b=0;b<3;b++){
        for(let i=0;i<10;i++){await act(async()=>{counters.cellTyping();counters.edit(`Committed ${++edit}`);await new Promise(r=>setTimeout(r,15));});}
        const last=performance.now();await settled();bursts.push(performance.now()-last);
      }
      samples.sort((a,b)=>a-b);
      console.log(`VS_MATRIX sheet RTT=${rtt}ms gateway=33ms isolated=20 burst=3x10 p50=${samples[10].toFixed(2)}ms p95=${samples[18].toFixed(2)}ms max=${samples[19].toFixed(2)}ms burst-last-ack-max=${Math.max(...bursts).toFixed(2)}ms`);
      assert.ok(samples[19]<500);assert.ok(Math.max(...bursts)<500);
    }
    assert.equal(copy.seq,55+puts);assert.equal(edit,100);
    assert.deepEqual(errors,[]);
  } finally {
    await view.unmount();await nextMacrotask();counters.integrated=false;globalThis.fetch=previousFetch;console.error=oldError;
  }
});
