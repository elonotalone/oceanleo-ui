// ============================================================================
// 台账「正在读取工作簿…」永不消失的那条闭环，锁在这里。
// ----------------------------------------------------------------------------
// 闭环原样：ArtifactRendition 的非 durable 早退分支每次渲染新建
// `retry` / `resourceFailed` 两个函数字面量 → useOfficeArtifactSource →
// GridRoute → useGridEditor 的 onSourceAccessError 形参 → 加载 effect 的依赖数组。
// 于是每渲染一次就重跑一次加载，遮罩再也下不来。
//
// 三条断言分别对应根因、自保闸、诚实的失败态：
//   1. 非 durable / 不可见两个早退分支的回调，两次渲染之间引用相等；
//   2. 调用方每次渲染都递新回调，加载也只跑一次，loading 必定归位；
//   3. 取不到源时 loading 归位、进入可读的失败态，重试入口真能再跑一次。
// 第 4 条用 AST 检查三个编辑器的加载 effect 依赖数组，防止同一个模式第四次复发。
// ============================================================================

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import ts from "typescript";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

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

/* -------------------------- ArtifactRendition ---------------------------- */

const artifactClientStubUrl = dataModule(`
  export async function refreshArtifactRendition() {
    return { ok: false, status: 503, error: "刷新在测试里被禁用" };
  }
`);
const artifactRenditionUrl = await compileModule(
  "src/shell/ArtifactRendition.tsx",
  { "./artifact-client": artifactClientStubUrl },
);
const { useArtifactRendition } = await import(artifactRenditionUrl);

/* ------------------------------ use-grid-editor -------------------------- */

const uiStubUrl = dataModule(`
  export function useUI() {
    return (value) => value;
  }
`);
const gridModelStubUrl = dataModule(`
  let serial = 0;
  export function emptyGridSheet(name = "Sheet1") {
    serial += 1;
    return {
      id: "sheet-" + serial,
      name,
      rows: [[""]],
      formats: {},
      merges: [],
      conditionalFormats: [],
    };
  }
  export function cloneGridSheets(sheets) {
    return structuredClone(sheets);
  }
  export async function loadGridSheets(item) {
    globalThis.__gridLoads.push(item.id);
    if (globalThis.__gridLoads.length > 8) {
      throw new Error(
        "加载 effect 自激了：loadGridSheets 被反复调用 " +
          globalThis.__gridLoads.length +
          " 次",
      );
    }
    if (globalThis.__gridLoadFails) {
      throw new Error("签名地址已过期（HTTP 403）");
    }
    return [emptyGridSheet("载入的工作表")];
  }
  export async function loadGridFile() {
    return [emptyGridSheet("导入的工作表")];
  }
  export function normalizeGridProjectSheetState(sheets, activeSheetId) {
    return { sheets: sheets || [], activeSheetId: activeSheetId || "" };
  }
  export async function buildGridWorkbookBlob() {
    return new Blob([""]);
  }
  export function gridSheetToCsv() {
    return "";
  }
  export function gridCellValue() {
    return "";
  }
  export function gridDisplayValue() {
    return "";
  }
  export function gridCellFormat() {
    return {};
  }
  export function gridRowCount(sheet) {
    return sheet ? sheet.rows.length : 0;
  }
  export function gridColCount() {
    return 1;
  }
  export function setGridCell() {}
  export function sanitizeSheetName(name) {
    return String(name || "Sheet");
  }
  // 保存那条路（W19 的面）不在本文件的判据里，但 import 必须解析得开。
  export function gridCarrierProjectToIr(input) {
    return input;
  }
  export function serializeGridIrProject(project) {
    return JSON.stringify(project);
  }
  export function validateGridIrProject(project) {
    return { ok: true, project, errors: [] };
  }
`);
const gridSheetIdentityStubUrl = dataModule(`
  export function resolveGridActiveSheetId(sheets, requested) {
    if (requested && sheets.some((sheet) => sheet.id === requested)) {
      return requested;
    }
    return sheets[0] ? sheets[0].id : "";
  }
`);
const officeFileStubUrl = dataModule(`
  export function notifyOfficeAccessDenied(reason, onAccessDenied) {
    if (String(reason && reason.message).includes("403")) onAccessDenied?.();
  }
`);
const gridStructureStubUrl = dataModule(`
  export function mergeGridRange(merges) {
    return merges;
  }
  export function rangesIntersect() {
    return false;
  }
  export function splitGridRange(merges) {
    return merges;
  }
  export function transformGridRanges(ranges) {
    return ranges;
  }
`);
const docIoStubUrl = dataModule(`
  export function downloadBlob() {}
  export function downloadText() {}
  export async function loadEditorProject() {
    throw new Error("测试没有可编辑工程");
  }
  export async function saveFileToLibrary() {
    return { ok: false, error: "测试不落库" };
  }
`);
const saveContractStubUrl = dataModule(`
  export function artifactSaveStepMessage(step, detail) {
    return step + ":" + String(detail || "");
  }
`);
const previewRasterStubUrl = dataModule(`
  export async function renderGridPreviewPng() {
    return null;
  }
`);

const gridEditorUrl = await compileModule(
  "src/shell/doc-editors/use-grid-editor.ts",
  {
    "../../i18n/ui/useUI": uiStubUrl,
    "./doc-io": docIoStubUrl,
    "./artifact-save-contract": saveContractStubUrl,
    "./editor-preview-raster": previewRasterStubUrl,
    "./grid-model": gridModelStubUrl,
    "./grid-sheet-identity": gridSheetIdentityStubUrl,
    "./office-file": officeFileStubUrl,
    "./grid-structure": gridStructureStubUrl,
    // 没列出来的（`../plugin-initial-state`、导出链那三份…）一律走真模块：
    // 保存对象与导出的判据是产品口径，桩一打就可能悄悄判反。
  },
);
const { useGridEditor } = await import(gridEditorUrl);

/* --------------------------------- fixtures ------------------------------ */

/** A blank starter: exactly the non-durable shape that used to spin forever. */
function blankStarterItem() {
  return {
    key: "blank:grid",
    source: "creation",
    id: "blank-grid-starter",
    title: "未命名台账（空白起手）",
    kind: "sheet",
    siteId: "excel",
    url: "https://cdn.test/blank.xlsx",
    favorite: false,
    meta: {},
  };
}

function invisibleDurableItem() {
  return {
    key: "artifact:hidden",
    source: "artifact",
    id: "hidden",
    title: "无权查看的工作簿",
    kind: "sheet",
    siteId: "excel",
    favorite: false,
    meta: {},
    artifactId: "artifact-hidden",
    revisionId: "revision-hidden",
    artifactType: "grid",
    artifact: {
      artifactId: "artifact-hidden",
      revisionId: "revision-hidden",
      artifactType: "grid",
      renditions: {},
      access: { canRead: false, canPreview: false, canExportSource: false },
      integrity: { ok: false },
    },
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

/* ------------------------------- P1 根因 --------------------------------- */

test("非 durable 与不可见早退分支的 retry / resourceFailed 跨渲染引用相等", async () => {
  const observed = [];
  let rerender = () => {};

  function Probe({ item }) {
    const [, setTick] = React.useState(0);
    rerender = () => setTick((value) => value + 1);
    const rendition = useArtifactRendition(item, ["source", "full"]);
    observed.push(rendition);
    return null;
  }

  for (const item of [blankStarterItem(), invisibleDurableItem()]) {
    observed.length = 0;
    const mounted = await mount(React.createElement(Probe, { item }));
    try {
      await act(async () => rerender());
      await act(async () => rerender());
      assert.ok(observed.length >= 3, "至少渲染了三次");
      const first = observed[0];
      for (const later of observed.slice(1)) {
        assert.equal(
          later.retry,
          first.retry,
          `${item.id} 的 retry 每次渲染都是新函数`,
        );
        assert.equal(
          later.resourceFailed,
          first.resourceFailed,
          `${item.id} 的 resourceFailed 每次渲染都是新函数`,
        );
      }
    } finally {
      await mounted.unmount();
    }
  }
});

/* ------------------------------- P2 自保闸 -------------------------------- */

test("调用方每次渲染都递新回调，工作簿加载仍只跑一次且遮罩必定落下", async () => {
  globalThis.__gridLoads = [];
  globalThis.__gridLoadFails = false;
  let rerender = () => {};
  let latest = null;

  function Probe({ item }) {
    const [, setTick] = React.useState(0);
    rerender = () => setTick((value) => value + 1);
    // 每次渲染新建的回调 —— 修复前的 ArtifactRendition 就是这么递进来的。
    latest = useGridEditor(item, "excel", () => undefined);
    return null;
  }

  const mounted = await mount(
    React.createElement(Probe, { item: blankStarterItem() }),
  );
  try {
    assert.equal(latest.loading, false, "首次加载结束后遮罩应当落下");
    assert.deepEqual(globalThis.__gridLoads, ["blank-grid-starter"]);

    for (let round = 0; round < 5; round += 1) {
      await act(async () => rerender());
    }
    assert.deepEqual(
      globalThis.__gridLoads,
      ["blank-grid-starter"],
      "重复渲染不许重新起跑加载",
    );
    assert.equal(latest.loading, false, "重复渲染之后遮罩仍然是落下的");
    assert.equal(latest.error, "");
    assert.equal(latest.sourceFailed, false);
  } finally {
    await mounted.unmount();
    delete globalThis.__gridLoads;
    delete globalThis.__gridLoadFails;
  }
});

/* ----------------------------- P3 诚实的失败态 ---------------------------- */

test("取不到源时 loading 归位、失败文案说清缘由，重试入口真的再跑一次", async () => {
  globalThis.__gridLoads = [];
  globalThis.__gridLoadFails = true;
  let rerender = () => {};
  let latest = null;

  function Probe({ item }) {
    const [, setTick] = React.useState(0);
    rerender = () => setTick((value) => value + 1);
    latest = useGridEditor(item, "excel", () => undefined);
    return null;
  }

  const mounted = await mount(
    React.createElement(Probe, { item: blankStarterItem() }),
  );
  try {
    assert.equal(latest.loading, false, "取不到源也必须停止转圈");
    assert.equal(latest.sourceFailed, true);
    assert.match(latest.error, /没能读到这份表格的源文件/);
    assert.match(latest.error, /HTTP 403/, "失败文案要带上真实原因");
    assert.match(latest.error, /重新载入/, "失败文案要指出重试入口");
    assert.notEqual(latest.error, "工作簿加载失败");
    assert.equal(globalThis.__gridLoads.length, 1);

    // 失败态下的重复渲染同样不许自激。
    await act(async () => rerender());
    await act(async () => rerender());
    assert.equal(globalThis.__gridLoads.length, 1);

    globalThis.__gridLoadFails = false;
    await act(async () => latest.reload());
    assert.equal(globalThis.__gridLoads.length, 2, "重试入口要真的再跑一次");
    assert.equal(latest.loading, false);
    assert.equal(latest.sourceFailed, false);
    assert.equal(latest.error, "");
  } finally {
    await mounted.unmount();
    delete globalThis.__gridLoads;
    delete globalThis.__gridLoadFails;
  }
});

/* --------------------- 三个编辑器的加载 effect 依赖数组 -------------------- */

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

test("三个编辑器的加载 effect 都不再依赖调用方递进来的对象与回调", async () => {
  // `tt` belongs on this list too: it is provider-owned, and an unmemoized
  // locale provider re-arms exactly the same loop as an unmemoized callback.
  for (const [path, marker, forbidden] of [
    [
      "src/shell/doc-editors/use-grid-editor.ts",
      "loadGridSheets(",
      ["item", "onSourceAccessError", "tt"],
    ],
    [
      "src/shell/doc-editors/use-deck-editor.ts",
      "loadDeck(",
      ["item", "onSourceAccessError", "previewContent", "tt"],
    ],
    [
      "src/shell/doc-editors/use-rich-doc-editor.ts",
      "loadRichDocHtml(",
      ["item", "onSourceAccessError", "tt"],
    ],
  ]) {
    const text = await readFile(resolve(path), "utf8");
    const dependencies = loadEffectDependencies(path, marker, text);
    for (const name of forbidden) {
      assert.ok(
        !dependencies.includes(name),
        `${path} 的加载 effect 仍然依赖 ${name}，同一条死循环会再犯`,
      );
    }
    assert.ok(
      dependencies.includes("loadKey"),
      `${path} 的加载 effect 应当按值 key 起跑，而不是按对象身份`,
    );
    assert.ok(
      dependencies.includes("reloadNonce"),
      `${path} 的加载 effect 缺少显式重试入口`,
    );
    assert.match(
      text,
      /sourceAccessErrorRef\.current\?\.\(\)/,
      `${path} 没有把回调形参收进 ref`,
    );
  }
});

/* ---------------- 失败文案承诺的动作，界面必须真的允许 -------------------- */

/** 取出失败文案函数里 `tail` 那句 —— 承诺出路的就是它，`head` 只描述现状。 */
function failureMessageTail(relativePath, functionName, sourceText) {
  const file = ts.createSourceFile(
    relativePath,
    sourceText,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );
  let tail = null;
  const visit = (node) => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      node.name.text === functionName
    ) {
      const collect = (inner) => {
        if (
          ts.isVariableDeclaration(inner) &&
          ts.isIdentifier(inner.name) &&
          inner.name.text === "tail" &&
          inner.initializer
        ) {
          const literals = [];
          const walk = (child) => {
            if (
              ts.isStringLiteral(child) ||
              ts.isNoSubstitutionTemplateLiteral(child)
            ) {
              literals.push(child.text);
            }
            ts.forEachChild(child, walk);
          };
          walk(inner.initializer);
          tail = literals.join("");
        }
        ts.forEachChild(inner, collect);
      };
      collect(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(tail, `${relativePath} 的 ${functionName} 里找不到 tail 那句文案`);
  return tail;
}

/** 上传口能不能真的吃下一份文档源，而不是只收图片。 */
function routeTakesDocumentUpload(route) {
  const accept = route.match(/upload:\s*\{[\s\S]*?accept:\s*"([^"]*)"/);
  if (!accept) return false;
  // `image/*` 的选择器压根让用户选不到 PPTX/DOCX，选了也会被静默跳过。
  if (/^\s*image\/\*\s*$/.test(accept[1])) return false;
  return /editor\.importSource/.test(route);
}

/**
 * 文案里允许出现的承诺，**每一条都要有对应的界面能力做后盾**。
 * 只按字面匹配某几个字挡不住这类缺陷：上一轮「点「重新载入」」被换成
 * 「上传本地 PPTX」，按钮换成了动作，缺陷是同一个。所以这里反过来做：
 * 尾句里的每一小句都必须命中下表的某一条，并且那一条的 `available` 成立；
 * **命中不了任何一条就判红**，逼下一个改文案的人把新承诺登记进来。
 */
const PROMISED_WAYS_OUT = [
  {
    id: "reload-button",
    matches: /重新载入/,
    available: ({ stage, route }) =>
      /editor\.reload/.test(stage) || /editor\.reload/.test(route),
    missing: "文案让用户点「重新载入」，但 stage / route 都没渲染 editor.reload",
  },
  {
    id: "local-upload",
    matches: /上传本地/,
    available: ({ route }) => routeTakesDocumentUpload(route),
    missing:
      "文案让用户上传本地文件，但这条路由的上传口收不了文档源" +
      "（accept 只有 image/*，或没接到 editor.importSource）",
  },
  {
    id: "reopen",
    matches: /关掉.*重新打开/,
    // 卸载再挂载必定重跑加载 effect，这条不依赖任何外壳实现，永远成立。
    available: () => true,
    missing: "",
  },
];

test("失败文案里承诺的每一条出路，界面都必须真的支持", async () => {
  const cases = [
    {
      hookPath: "src/shell/doc-editors/use-grid-editor.ts",
      fn: "gridSourceFailureMessage",
      stagePath: "src/shell/doc-editors/GridStage.tsx",
      routePath: "src/shell/advanced-routes/GridRoute.tsx",
    },
    {
      hookPath: "src/shell/doc-editors/use-deck-editor.ts",
      fn: "deckSourceFailureMessage",
      stagePath: "src/shell/doc-editors/DeckStage.tsx",
      routePath: "src/shell/advanced-routes/DeckRoute.tsx",
    },
    {
      hookPath: "src/shell/doc-editors/use-rich-doc-editor.ts",
      fn: "richDocSourceFailureMessage",
      stagePath: "src/shell/doc-editors/RichDocStage.tsx",
      routePath: "src/shell/advanced-routes/RichDocRoute.tsx",
    },
  ];

  for (const { hookPath, fn, stagePath, routePath } of cases) {
    const [hook, stage, route] = await Promise.all([
      readFile(resolve(hookPath), "utf8"),
      readFile(resolve(stagePath), "utf8"),
      readFile(resolve(routePath), "utf8"),
    ]);
    const tail = failureMessageTail(hookPath, fn, hook);
    const clauses = tail
      .split(/[，。；]/)
      .map((clause) => clause.replace(/^或者?/, "").trim())
      .filter(Boolean);
    assert.ok(clauses.length > 0, `${fn} 的尾句是空的`);

    for (const clause of clauses) {
      const way = PROMISED_WAYS_OUT.find((entry) => entry.matches.test(clause));
      assert.ok(
        way,
        `${fn} 的「${clause}」不在已登记的出路里 —— ` +
          "新承诺必须先登记并给出界面能力的证据，否则又会变成一句空话",
      );
      assert.ok(
        way.available({ stage, route, hook }),
        `${fn} 的「${clause}」：${way.missing}`,
      );
    }
  }
});

test("grid 的失败态是本波真正交付的那一份：文案与按钮两边都在", async () => {
  const [hook, stage] = await Promise.all([
    readFile(resolve("src/shell/doc-editors/use-grid-editor.ts"), "utf8"),
    readFile(resolve("src/shell/doc-editors/GridStage.tsx"), "utf8"),
  ]);
  assert.match(
    failureMessageTail(
      "src/shell/doc-editors/use-grid-editor.ts",
      "gridSourceFailureMessage",
      hook,
    ),
    /重新载入/,
  );
  assert.match(stage, /editor\.reload/);
  assert.match(stage, /重新载入/);
});

test("deck 不许再承诺它的上传口根本不收的文件", async () => {
  const route = await readFile(
    resolve("src/shell/advanced-routes/DeckRoute.tsx"),
    "utf8",
  );
  // 这条是黄一复发的具体形状：DeckRoute 的上传口只收图片，非图片会被静默跳过。
  assert.equal(
    routeTakesDocumentUpload(route),
    false,
    "DeckRoute 的上传口如果真的能收 PPTX 了，请连同 deckSourceFailureMessage 的尾句一起更新",
  );
  const hook = await readFile(
    resolve("src/shell/doc-editors/use-deck-editor.ts"),
    "utf8",
  );
  assert.doesNotMatch(
    failureMessageTail(
      "src/shell/doc-editors/use-deck-editor.ts",
      "deckSourceFailureMessage",
      hook,
    ),
    /上传本地/,
  );
});
