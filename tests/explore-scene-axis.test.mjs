// 探索页的主分区轴 = **站点 app 目录的场景词**（`01-decisions.md` D2/D3/D4/D5）。
//
// 工作台的分区来自各站 `lib/app-catalog.ts` 的 `scenes[]`；探索页必须是同一套分区，
// 而不是 13 个 artifactType chips 加一排原始 appId。这份用例钉死五件事：
//   ① `registerSiteAppDirectory` 的归一化：场景顺序照目录、agent 类 app 排除、
//      没有场景词的 app 落「其它」；
//   ② `materialSceneView` 的去重与归属：一个 artifact 一张卡，卡片标题后缀是归属 app 名，
//      选中分区时标该分区下的那个 app，「全部」视图取主 app（D3）；
//   ③ 渲染层：分区 chips 带计数、点选后只剩该分区、类型筛选可叠加、原始 appId chips 不存在；
//   ④ 网格卡上没有下载按钮（D4）；
//   ⑤ 首帧未 settle 只有骨架，settle 之后才允许出空态（D5）。
//
// 组件源码经 typescript.transpileModule 编译成真文件后导入（写法与
// `tests/explore-sections.test.mjs` 一致），交互部分在 jsdom 里挂载
// （写法与 `tests/artifact-surface-rendered.test.mjs` 一致）。

import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import ts from "typescript";

import { normalizeArtifactProjection } from "../src/shell/artifact-contract.ts";
import { artifactProjectionToLibraryItem } from "../src/shell/library-data.ts";
import { artifactEntry } from "../src/shell/material-library-controller.ts";
import { materialShelfEntries } from "../src/shell/material-library-presentation.ts";
import {
  MATERIAL_SITE_APP_OTHER_LABEL,
  materialSceneView,
  registerSiteAppDirectory,
  resetSiteAppDirectories,
} from "../src/shell/material-scene-axis.ts";
import { templateMaterialEntry } from "../src/shell/material-library-template-source.ts";

function durableItem({
  id = "artifact-1",
  revisionId = "r1",
  title = "素材",
  artifactType = "single_file_image",
  originSiteKey = "image",
  originAppId = "poster",
  bindings = [],
  meta,
} = {}) {
  const item = {
    key: `artifact:${id}:${revisionId}`,
    source: "artifact",
    id,
    artifactId: id,
    revisionId,
    artifactType,
    title,
    kind: "image",
    favorite: false,
    meta: meta || {},
    artifact: {
      artifactId: id,
      revisionId,
      artifactType,
      owner: { originSiteKey, originAppId, visibility: "public" },
      bindings,
    },
  };
  return item;
}

/** 一份能过 durable / 可见 / 可高级编辑三道闸的真投影。 */
function editableProjection({
  id,
  title,
  originAppId,
  originSiteKey = "image",
  artifactType = "single_file_image",
  revisionId = "r1",
}) {
  return {
    schema: "oceanleo.artifact.v1",
    artifact_id: id,
    revision_id: revisionId,
    artifact_type: artifactType,
    roles: ["template"],
    title,
    favorite: false,
    owner: {
      principal_id: "user-1",
      visibility: "public",
      origin_site_key: originSiteKey,
      origin_app_id: originAppId,
    },
    access: {
      can_read: true,
      can_preview: true,
      can_edit: true,
      can_fork: false,
      can_insert: true,
      can_replace: true,
      can_favorite: true,
      can_bind: true,
      can_export_source: true,
    },
    editability: "bounded",
    editor_capability: "image-editor",
    source_format: "png",
    renditions: {
      preview: {
        purpose: "preview",
        revision_id: revisionId,
        url: `https://signed.test/${id}.png`,
        format: "png",
      },
      source: {
        purpose: "source",
        revision_id: revisionId,
        url: `https://signed.test/${id}-source.png`,
        format: "png",
        digest: `sha256:${id}`,
      },
    },
    provenance: { id: `prov-${id}`, source_kind: "owned", license_code: "owned" },
    integrity: { ok: true, code: "ok", reason: "" },
    context_bindings: [],
  };
}

function editableLibraryItem(options) {
  const projection = normalizeArtifactProjection(editableProjection(options));
  assert.ok(projection, `投影没通过归一化：${options.id}`);
  return artifactProjectionToLibraryItem(projection);
}

function templateRow({
  id,
  title,
  appId,
  artifactId,
  artifactType = "single_file_image",
  summary = "官方模板简介",
  siteKey = "image",
}) {
  return {
    id,
    title,
    summary,
    tags: [],
    // 目录响应里的字段名是 previewUrl，归一化之后叫 previewKey：两个都带上，同一份
    // 夹具既能喂 `/v1/template-materials` 桩，也能直接当 listing 用。
    previewUrl: `design-scene/${id}`,
    previewKey: `design-scene/${id}`,
    artifactId: artifactId || `artifact-${id}`,
    artifactType,
    siteKey,
    appId,
    width: 1200,
    height: 800,
  };
}


// ---------------------------------------------------------------------------
// ① 站点 app 目录的归一化
// ---------------------------------------------------------------------------

/** image 站的目录片段：跨 app 素材那两个 app 在不同场景里。 */
const IMAGE_APPS = [
  { id: "avatar-removebg", name: "人像去背", scenes: ["图像处理", "AI 写真"] },
  { id: "inpaint", name: "智能消除", scenes: ["图像处理"] },
  { id: "expand", name: "AI 扩图", scenes: ["图像生成"] },
  { id: "sketch", name: "线稿上色", scenes: [] },
  { id: "agent", name: "图像助手", scenes: ["智能体"] },
  { id: "hidden-app", name: "内部工具", scenes: ["图像生成"], hiddenFromDirectory: true },
];

test("registerSiteAppDirectory：场景顺序照目录，agent 与隐藏 app 不进轴", () => {
  resetSiteAppDirectories();
  const directory = registerSiteAppDirectory("image", IMAGE_APPS);
  assert.deepEqual(
    directory.apps.map((app) => app.appId),
    ["avatar-removebg", "inpaint", "expand", "sketch"],
  );
  // 场景词按首次出现顺序，与工作台 chips 同序。
  assert.deepEqual(directory.scenes, ["图像处理", "AI 写真", "图像生成"]);
  assert.equal(directory.hasUnscopedApps, true);
  assert.deepEqual(directory.excludedAgentAppIds, ["agent"]);
  // position 就是声明顺序，D3 的主 app 判据直接用它。
  assert.deepEqual(
    directory.apps.map((app) => app.position),
    [0, 1, 2, 3],
  );
  // 同一份数据重复注册返回同一个对象，不会让订阅者白刷新一遍。
  assert.equal(registerSiteAppDirectory("image", IMAGE_APPS), directory);
});

// ---------------------------------------------------------------------------
// ② 去重、归属与分区（纯函数）
// ---------------------------------------------------------------------------

/** 「人像去背前后对照」同属 avatar-removebg 与 inpaint —— 生产库里真实存在的那 9 组之一。 */
const CROSS_APP_ROWS = [
  templateRow({
    id: "avatar-removebg-1",
    title: "人像去背前后对照",
    appId: "avatar-removebg",
    artifactId: "artifact-cutout-compare",
  }),
  templateRow({
    id: "inpaint-3",
    title: "人像去背前后对照",
    appId: "inpaint",
    artifactId: "artifact-cutout-compare",
  }),
];

function sceneShelf(rows, extraRemote = []) {
  return materialShelfEntries({
    level: "site",
    siteKey: "image",
    deepLinked: [],
    officialTemplates: rows.map(templateMaterialEntry),
    remote: extraRemote,
    exactLocal: [],
  });
}

test("同一个 artifact 绑两个 app：一个视图只渲染一张卡（D3.1）", () => {
  resetSiteAppDirectories();
  const directory = registerSiteAppDirectory("image", IMAGE_APPS);
  const entries = sceneShelf(CROSS_APP_ROWS);
  const view = materialSceneView({
    entries,
    siteKey: "image",
    directory,
    scene: null,
  });
  assert.equal(view.cards.length, 1, "跨 app 素材渲染成了两张卡");
  // 「全部」视图取主 app：目录里 avatar-removebg 在前。
  assert.deepEqual(view.cards[0].owningAppIds, ["avatar-removebg", "inpaint"]);
  assert.equal(view.cards[0].appId, "avatar-removebg");
  assert.equal(view.cards[0].entry.title, "人像去背前后对照 · 人像去背");
  // 它同时落在两个 app 的分区里。
  assert.deepEqual(view.cards[0].scenes, ["图像处理", "AI 写真"]);
});

test("选中某个分区时，卡片标的是该分区下的那个 app（D3.3）", () => {
  resetSiteAppDirectories();
  const directory = registerSiteAppDirectory("image", [
    // 故意把两个 app 分到不同场景，好看出「跟着分区走」。
    { id: "avatar-removebg", name: "人像去背", scenes: ["AI 写真"] },
    { id: "inpaint", name: "智能消除", scenes: ["图像处理"] },
  ]);
  const entries = sceneShelf(CROSS_APP_ROWS);
  const inpaintView = materialSceneView({
    entries,
    siteKey: "image",
    directory,
    scene: "图像处理",
  });
  assert.equal(inpaintView.cards.length, 1);
  assert.equal(inpaintView.cards[0].appId, "inpaint");
  assert.equal(inpaintView.cards[0].entry.title, "人像去背前后对照 · 智能消除");

  const selfieView = materialSceneView({
    entries,
    siteKey: "image",
    directory,
    scene: "AI 写真",
  });
  assert.equal(selfieView.cards[0].appId, "avatar-removebg");
  assert.equal(selfieView.cards[0].entry.title, "人像去背前后对照 · 人像去背");
});

test("分区 chips：全部在最前、其它在最后，计数按去重后的卡数", () => {
  resetSiteAppDirectories();
  const directory = registerSiteAppDirectory("image", IMAGE_APPS);
  const entries = sceneShelf([
    ...CROSS_APP_ROWS,
    templateRow({ id: "expand-1", title: "扩图构图对照", appId: "expand" }),
    templateRow({ id: "sketch-1", title: "线稿上色样例", appId: "sketch" }),
    templateRow({ id: "orphan-1", title: "无归属素材", appId: "" }),
  ]);
  const view = materialSceneView({
    entries,
    siteKey: "image",
    directory,
    scene: null,
  });
  assert.deepEqual(
    view.chips.map((chip) => [chip.id, chip.count]),
    [
      ["all", 4],
      ["图像处理", 1],
      ["AI 写真", 1],
      ["图像生成", 1],
      // 没有场景词的 app（sketch）与解析不出归属的那一条都落「其它」。
      ["other", 2],
    ],
  );
  const other = materialSceneView({
    entries,
    siteKey: "image",
    directory,
    scene: "",
  });
  assert.deepEqual(
    other.cards.map((card) => card.entry.title),
    ["线稿上色样例 · 线稿上色", `无归属素材 · ${MATERIAL_SITE_APP_OTHER_LABEL}`],
  );
});

test("站点没登记目录时不崩：只有「全部」，卡片仍然按 artifact 去重", () => {
  resetSiteAppDirectories();
  const view = materialSceneView({
    entries: sceneShelf(CROSS_APP_ROWS),
    siteKey: "image",
    directory: null,
    scene: null,
  });
  assert.deepEqual(view.chips.map((chip) => chip.id), ["all"]);
  assert.equal(view.cards.length, 1);
  // 目录缺席时归属名退回 appId，不留白。
  assert.equal(view.cards[0].entry.title, "人像去背前后对照 · avatar-removebg");
});
// ---------------------------------------------------------------------------
// 渲染层：jsdom + 编译后的组件
// ---------------------------------------------------------------------------

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
  url: "https://image.oceanleo.com/explore",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
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

function resolveRelative(fromPath, specifier) {
  for (const suffix of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidate = resolve(dirname(fromPath), specifier + suffix);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

// 编好的模块落成真文件再用 `file://` 引用（理由见 explore-sections.test.mjs：
// 内联 data: URL 在这一族的菱形依赖上是指数级膨胀）。
const compiledModules = new Map();
const inFlight = new Set();
const compiledDir = mkdtempSync(join(tmpdir(), "oceanleo-site-app-axis-"));
process.on("exit", () => {
  rmSync(compiledDir, { recursive: true, force: true });
});
let compiledSeq = 0;

function fileModule(relativePath, source) {
  compiledSeq += 1;
  const name = `${String(compiledSeq).padStart(3, "0")}-${basename(
    relativePath,
  ).replace(/\.tsx?$/, "")}.mjs`;
  const file = join(compiledDir, name);
  writeFileSync(file, source);
  return pathToFileURL(file).href;
}

async function compileModule(relativePath, overrides = {}) {
  const sourcePath = resolve(relativePath);
  const cached = compiledModules.get(sourcePath);
  if (cached) return cached;
  assert.ok(!inFlight.has(sourcePath), `循环依赖：${relativePath}`);
  inFlight.add(sourcePath);

  let output = ts.transpileModule(await readFile(sourcePath, "utf8"), {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;

  for (const specifier of new Set(
    [...output.matchAll(/from\s+"([^"]+)"/g)].map(([, spec]) => spec),
  )) {
    let replacement = overrides[specifier];
    if (!replacement && specifier === "react") replacement = reactUrl;
    if (!replacement && specifier === "react/jsx-runtime") {
      replacement = jsxRuntimeUrl;
    }
    if (!replacement && specifier.startsWith(".")) {
      const target = resolveRelative(sourcePath, specifier);
      assert.ok(target, `${relativePath} 里解析不到 ${specifier}`);
      replacement = await compileModule(
        relative(process.cwd(), target),
        overrides,
      );
    }
    assert.ok(replacement, `${relativePath} 依赖了无法解析的 ${specifier}`);
    output = output.replaceAll(`from "${specifier}"`, `from "${replacement}"`);
  }

  inFlight.delete(sourcePath);
  const url = fileModule(relativePath, output);
  compiledModules.set(sourcePath, url);
  return url;
}

const OVERRIDES = {
  "../i18n/ui/useUI": dataModule("export function useUI(){ return (zh) => zh; }"),
  "./AdvancedContentWorkbench": dataModule(
    "export function AdvancedContentWorkbench(){ return null; }",
  ),
  "./WorkspaceSession": dataModule(
    "export function useOptionalWorkspaceSession(){ return null; }",
  ),
  "./workbench-material-registry": dataModule(`
    export function materialScopeKey(siteId, appId){ return siteId + ":" + appId; }
    export function registerWorkbenchMaterialSource(){ return () => {}; }
  `),
  // 后端桩：本站层走 `searchArtifactLibrary`，它按请求里的类型参数收窄，这样
  // 「类型筛选 + app 选择叠加」测的是真的叠加，而不是浏览器侧的兜底收窄。
  "./artifact-client": dataModule(`
    export const ARTIFACT_LIBRARY_CHANGE_EVENT = "oceanleo:artifact-library-change";
    export function artifactDownloadEvidence(){
      return { visible: false, available: false, reason: "", purpose: null, mode: null };
    }
    export async function getArtifactDownload(){ return { ok: false, status: 404 }; }
    export async function getArtifactItem(){ return { ok: false, status: 404 }; }
    export async function getCurrentArtifactItem(){ return { ok: false, status: 404 }; }
    export async function listPrimaryArtifacts(){
      return { ok: true, data: { items: globalThis.__siteAxisPrimary || [], nextCursor: null } };
    }
    export async function listEditableShelfArtifacts(){
      return { ok: true, data: { items: globalThis.__siteAxisShelf || [], nextCursor: null } };
    }
    export async function searchArtifactLibrary(options = {}){
      const wanted = String(options.artifactTypes || options.artifactType || "")
        .split(",")
        .filter(Boolean);
      const items = (globalThis.__siteAxisSearch || []).filter(
        (item) => wanted.length === 0 || wanted.includes(item.artifactType),
      );
      return { ok: true, data: { items, nextCursor: null } };
    }
  `),
  "./WorkspaceLibrary": dataModule(`
    import { createElement } from ${JSON.stringify(reactUrl)};
    export function WorkspaceLibrary(props) {
      return createElement(
        "section",
        { "data-entry-count": String(props.entries.length) },
        props.toolbarActions,
        createElement(
          "div",
          { "data-entry-list": "true" },
          ...props.entries.map((entry) =>
            createElement("article", {
              key: entry.id,
              "data-entry-title": entry.title,
              "data-entry-category": entry.category || "",
              "data-entry-description": entry.description || "",
              "data-entry-keywords": (entry.keywords || []).join(" "),
            }),
          ),
        ),
      );
    }
  `),
};

const templateSourceUrl = await compileModule(
  "src/shell/material-library-template-source.ts",
  OVERRIDES,
);
const { invalidateTemplateMaterialCache } = await import(templateSourceUrl);
const controllerUrl = await compileModule(
  "src/shell/material-library-controller.ts",
  OVERRIDES,
);
const { invalidateMaterialLibraryCache } = await import(controllerUrl);
const { MaterialLibrary } = await import(
  await compileModule("src/shell/material-library-view.tsx", OVERRIDES)
);
// 登记处是**模块级**的。上面用类型擦除直接 import 的那份 `material-scene-axis.ts` 与
// 组件编译出来的那份不是同一个模块实例，所以渲染用例必须往组件那一份里登记，
// 否则货架永远看不到目录。
const {
  registerSiteAppDirectory: registerRenderedDirectory,
  resetSiteAppDirectories: resetRenderedDirectories,
} = await import(await compileModule("src/shell/material-scene-axis.ts", OVERRIDES));

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

async function createMounted(Component, props) {
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(Component, props));
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function settle(ms = 30) {
  await act(async () => {
    await new Promise((done) => window.setTimeout(done, ms));
  });
}

async function click(target) {
  assert.ok(target, "要点的元素不存在");
  await act(async () => {
    target.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
  await settle();
}

const SITE_TEMPLATE_ROWS = [
  templateRow({ id: "poster-1", title: "海报模板一", appId: "poster" }),
  templateRow({
    id: "poster-2",
    title: "海报模板二",
    appId: "poster",
    artifactType: "deck",
  }),
  templateRow({ id: "banner-1", title: "横幅模板", appId: "banner" }),
  templateRow({ id: "loose-1", title: "未归组模板", appId: "" }),
];

/** 渲染用的站点目录：poster 在「营销物料」，banner 在「站点装饰」。 */
const RENDER_APPS = [
  { id: "poster", name: "海报生成", scenes: ["营销物料"] },
  { id: "banner", name: "横幅生成", scenes: ["站点装饰"] },
  { id: "agent", name: "图像助手", scenes: ["智能体"] },
];

/** 每份用例都从干净的目录/素材库缓存与同一份货架数据出发。 */
function primeShelf() {
  invalidateMaterialLibraryCache();
  invalidateTemplateMaterialCache();
  globalThis.__siteAxisPrimary = [];
  globalThis.__siteAxisShelf = [];
  globalThis.__siteAxisSearch = [
    editableLibraryItem({
      id: "durable-banner",
      title: "横幅素材",
      originAppId: "banner",
    }),
  ];
  globalThis.fetch = async (input) =>
    String(input).includes("/v1/template-materials")
      ? jsonResponse({ items: SITE_TEMPLATE_ROWS })
      : jsonResponse({ items: [] });
}

function chips(container) {
  return [...container.querySelectorAll("[data-material-scene-chip]")].map(
    (chip) => ({
      id: chip.getAttribute("data-material-scene-chip"),
      pressed: chip.getAttribute("aria-pressed") === "true",
      count: chip.querySelector("span")?.textContent || "",
    }),
  );
}

function cardTitles(container) {
  return [...container.querySelectorAll("[data-entry-title]")].map((card) =>
    card.getAttribute("data-entry-title"),
  );
}

const SITE_PROPS = {
  materials: [],
  siteId: "image",
  contextId: "olctx:v1:image:app:poster",
  levels: ["site"],
  initialLevel: "site",
  lockLevel: "site",
};

async function mountShelf(props = {}) {
  resetRenderedDirectories();
  registerRenderedDirectory("image", RENDER_APPS);
  primeShelf();
  const mounted = await createMounted(MaterialLibrary, {
    ...SITE_PROPS,
    ...props,
  });
  await settle();
  return mounted;
}

test("本站货架挂出场景分区轴：每个分区一颗 chip、带计数，原始 appId chips 不存在", async () => {
  const mounted = await mountShelf();
  try {
    assert.deepEqual(chips(mounted.container), [
      { id: "all", pressed: true, count: "5" },
      { id: "营销物料", pressed: false, count: "2" },
      { id: "站点装饰", pressed: false, count: "2" },
      { id: "other", pressed: false, count: "1" },
    ]);
    // D2：那排 appId chips 整排下线；「智能体」分区不出现。
    assert.equal(mounted.container.querySelector("[data-material-app-chip]"), null);
    assert.doesNotMatch(mounted.container.innerHTML, /智能体/);
    // 卡片标题后缀是归属 app 名。
    assert.deepEqual(cardTitles(mounted.container), [
      "海报模板一 · 海报生成",
      "海报模板二 · 海报生成",
      "横幅模板 · 横幅生成",
      `未归组模板 · ${MATERIAL_SITE_APP_OTHER_LABEL}`,
      "横幅素材 · 横幅生成",
    ]);
    // 类型筛选还在，只是降级成次级筛选；且只铺货架上真有的类型。
    assert.ok(
      mounted.container.querySelector('[role="group"][aria-label="货架"]'),
    );
    assert.deepEqual(
      [...mounted.container.querySelectorAll("[data-material-type-chip]")].map(
        (chip) => chip.getAttribute("data-material-type-chip"),
      ),
      ["single_file_image", "deck"],
    );
  } finally {
    await mounted.unmount();
  }
});

test("点选分区后只剩该分区的卡，「全部」能原路解开", async () => {
  const mounted = await mountShelf();
  try {
    await click(
      mounted.container.querySelector('[data-material-scene-chip="营销物料"]'),
    );
    assert.deepEqual(cardTitles(mounted.container), [
      "海报模板一 · 海报生成",
      "海报模板二 · 海报生成",
    ]);
    await click(
      mounted.container.querySelector('[data-material-scene-chip="other"]'),
    );
    assert.deepEqual(cardTitles(mounted.container), [
      `未归组模板 · ${MATERIAL_SITE_APP_OTHER_LABEL}`,
    ]);
    await click(
      mounted.container.querySelector('[data-material-scene-chip="all"]'),
    );
    assert.equal(cardTitles(mounted.container).length, 5);
  } finally {
    await mounted.unmount();
  }
});

test("类型筛选是次级筛选：与分区叠加", async () => {
  const mounted = await mountShelf();
  try {
    await click(
      mounted.container.querySelector('[data-material-scene-chip="营销物料"]'),
    );
    await click(
      mounted.container.querySelector('[data-material-type-chip="deck"]'),
    );
    assert.deepEqual(cardTitles(mounted.container), ["海报模板二 · 海报生成"]);
    assert.deepEqual(
      chips(mounted.container).filter((chip) => chip.pressed),
      [{ id: "营销物料", pressed: true, count: "1" }],
    );
  } finally {
    await mounted.unmount();
  }
});

test("?app= 锚点是一颗可清除的 chip，不是一条轴", async () => {
  const mounted = await mountShelf({ appId: "banner" });
  try {
    const anchor = mounted.container.querySelector("[data-material-app-anchor]");
    assert.ok(anchor, "缺少 app 锚点 chip");
    assert.equal(anchor.getAttribute("data-material-app-anchor"), "banner");
    assert.deepEqual(cardTitles(mounted.container), [
      "横幅模板 · 横幅生成",
      "横幅素材 · 横幅生成",
    ]);
    await click(anchor);
    assert.equal(
      mounted.container.querySelector("[data-material-app-anchor]"),
      null,
    );
    assert.equal(cardTitles(mounted.container).length, 5);
  } finally {
    await mounted.unmount();
  }
});

test("网格卡上没有下载按钮（D4）", async () => {
  const mounted = await mountShelf();
  try {
    assert.equal(
      mounted.container.querySelector("[data-material-card-download]"),
      null,
    );
    assert.equal(mounted.container.querySelector("[data-entry-actions]"), null);
  } finally {
    await mounted.unmount();
  }
});

test("首帧只有骨架，settle 之前一个「暂无」都没有（D5）", async () => {
  resetRenderedDirectories();
  registerRenderedDirectory("image", RENDER_APPS);
  primeShelf();
  // 库检索也空着：只要还有一条链没有结论，读者看到的就必须是骨架。
  globalThis.__siteAxisSearch = [];
  // 目录请求挂着不回：settle 之前的每一帧都必须是骨架。
  let releaseTemplates = () => {};
  const pending = new Promise((resolve) => {
    releaseTemplates = resolve;
  });
  globalThis.fetch = async (input) => {
    if (String(input).includes("/v1/template-materials")) {
      await pending;
      return jsonResponse({ items: SITE_TEMPLATE_ROWS });
    }
    return jsonResponse({ items: [] });
  };
  const mounted = await createMounted(MaterialLibrary, SITE_PROPS);
  try {
    assert.ok(
      mounted.container.querySelector("[data-material-shelf-skeleton]"),
      "未 settle 却没有渲染骨架",
    );
    assert.doesNotMatch(mounted.container.textContent, /暂无/);
    assert.equal(
      mounted.container
        .querySelector("[data-material-shelf-state]")
        .getAttribute("data-material-shelf-state"),
      "loading",
    );
    releaseTemplates();
    await settle();
    assert.equal(
      mounted.container.querySelector("[data-material-shelf-skeleton]"),
      null,
      "settle 之后骨架没有撤掉",
    );
    assert.equal(cardTitles(mounted.container).length, 4);
  } finally {
    await mounted.unmount();
  }
});

test("settle 之后真的空了才允许出空态", async () => {
  resetRenderedDirectories();
  registerRenderedDirectory("image", RENDER_APPS);
  invalidateMaterialLibraryCache();
  invalidateTemplateMaterialCache();
  globalThis.__siteAxisSearch = [];
  globalThis.fetch = async () => jsonResponse({ items: [] });
  const mounted = await createMounted(MaterialLibrary, SITE_PROPS);
  try {
    await settle();
    assert.equal(
      mounted.container.querySelector("[data-material-shelf-skeleton]"),
      null,
    );
    assert.equal(cardTitles(mounted.container).length, 0);
    assert.equal(
      mounted.container
        .querySelector("[data-material-shelf-state]")
        .getAttribute("data-material-shelf-state"),
      "settled",
    );
  } finally {
    await mounted.unmount();
  }
});

test("本轮新增的呈现模块同样守住 800 行硬顶", () => {
  // `material-library-scope.test.mjs` 管着既有那 6 个文件；分区轴这三个是本轮新增的，
  // 由本文件接着管，免得「拆出去」变成「换个地方继续长」。
  for (const path of [
    "../src/shell/material-scene-axis.ts",
    "../src/shell/material-library-toolbar.tsx",
    "../src/shell/material-library-skeleton.tsx",
    "../src/shell/material-library-type-filter.tsx",
  ]) {
    const lines = readFileSync(new URL(path, import.meta.url), "utf8").split(
      "\n",
    ).length;
    assert.ok(lines <= 800, `${path} 有 ${lines} 行，超过 800 行硬顶`);
  }
});
