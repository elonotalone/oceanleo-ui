// 探索页「本站素材」的主分类轴 = app（不是文件类型）。
//
// 读者是从某个 app 的卡片进来的，问的是「这个 app 有什么」，所以本站层按 app 分组，
// 文件类型降级成能与 app 选择叠加的次级筛选。这份用例钉死四件事：
//   ① `libraryItemOriginAppId` 的三个来源与优先级（owner ｜ 目录行 meta ｜ 绑定 context）；
//   ② `materialSiteAppGroups` 的分组与排序（锚定 app 排头 → 条目数降序 → appId 字典序，
//      解析不出归属的永远最后）；
//   ③ `materialSiteAppChips` 的「单组不挂轴」与「选中项被清空也保留」；
//   ④ 渲染层：本站层出 app chips、点选后只剩该组、类型筛选可叠加，而 primary / more
//      两层既不出 app chips，category 也仍是旧的类型分类标签（回归护栏）。
//
// 组件源码经 typescript.transpileModule 编译成真文件后导入（写法与
// `tests/explore-sections.test.mjs` 一致），交互部分在 jsdom 里挂载
// （写法与 `tests/artifact-surface-rendered.test.mjs` 一致）。

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
import {
  artifactEntry,
  libraryItemOriginAppId as reexportedOriginAppId,
} from "../src/shell/material-library-controller.ts";
import { libraryItemOriginAppId } from "../src/shell/material-library-scope.ts";
import {
  MATERIAL_SITE_APP_OTHER_LABEL,
  materialShelfEntries,
  materialSiteAppChips,
  materialSiteAppGroups,
  materialSiteAppLabel,
} from "../src/shell/material-library-presentation.ts";
import { templateMaterialEntry } from "../src/shell/material-library-template-source.ts";

// ---------------------------------------------------------------------------
// 素材条目夹具
// ---------------------------------------------------------------------------

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
    artifactId: `artifact-${id}`,
    artifactType,
    siteKey,
    appId,
    width: 1200,
    height: 800,
  };
}

function groupEntry(id, appId, meta) {
  return {
    id,
    title: id,
    libraryItem: durableItem({
      id,
      originAppId: appId,
      meta,
    }),
  };
}

// ---------------------------------------------------------------------------
// ① 归属 app 的三个来源
// ---------------------------------------------------------------------------

test("owner.originAppId 是第一来源，且只在站点不冲突时直接采信", () => {
  // 控制器把这一支原样 re-export 出去，视图层拿的就是同一份实现。
  assert.equal(reexportedOriginAppId, libraryItemOriginAppId);

  const local = durableItem({ originSiteKey: "image", originAppId: "poster" });
  assert.equal(libraryItemOriginAppId(local, "image"), "poster");
  // 不给 siteKey 时不做站点校验。
  assert.equal(libraryItemOriginAppId(local), "poster");

  // 在别的站铸出来的素材，在本站属于「绑定点名的那个 app」，而不是它出生的 app。
  const relocated = durableItem({
    id: "relocated",
    originSiteKey: "asset",
    originAppId: "studio",
    bindings: [{ contextId: "olctx:v1:image:app:banner", role: "primary" }],
  });
  assert.equal(libraryItemOriginAppId(relocated, "image"), "banner");
  // 同一份素材脱离站点语境时，owner 仍然是它的归属。
  assert.equal(libraryItemOriginAppId(relocated), "studio");
});

test("目录行只有 meta.template_material_app_id，优先级排在绑定之前", () => {
  const catalogRow = {
    key: "template-material:poster-1",
    source: "artifact",
    id: "template-material:poster-1",
    kind: "image",
    title: "官方模板",
    favorite: false,
    meta: { template_material_app_id: "poster" },
  };
  assert.equal(libraryItemOriginAppId(catalogRow, "image"), "poster");
  assert.equal(libraryItemOriginAppId(catalogRow, "word"), "poster");

  // owner 没给 app id 时，meta 先于绑定被采信。
  const both = durableItem({
    id: "both",
    originAppId: "",
    meta: { template_material_app_id: "meta-app" },
    bindings: [{ contextId: "olctx:v1:image:app:bound-app", role: "primary" }],
  });
  assert.equal(libraryItemOriginAppId(both, "image"), "meta-app");
});

test("绑定 context 是第三来源，appId 按 URL 转义解码", () => {
  const bound = durableItem({
    id: "bound",
    originAppId: "",
    bindings: [
      { contextId: "olctx:v1:word:app:doc", role: "primary" },
      { contextId: "olctx:v1:image:app:my%20app", role: "primary" },
    ],
  });
  assert.equal(libraryItemOriginAppId(bound, "image"), "my app");
  assert.equal(libraryItemOriginAppId(bound, "word"), "doc");
  // 不给 siteKey 时第一条绑定就作数。
  assert.equal(libraryItemOriginAppId(bound), "doc");
});

test("三个来源都解析不出就返回空串；站点不匹配时退回 owner 而不是丢掉这一条", () => {
  assert.equal(libraryItemOriginAppId(null, "image"), "");
  assert.equal(libraryItemOriginAppId(undefined), "");
  assert.equal(
    libraryItemOriginAppId(
      durableItem({ id: "loose", originAppId: "", bindings: [] }),
      "image",
    ),
    "",
  );
  // 非 durable、也没有目录 meta 的条目同样落进「未归组」。
  assert.equal(
    libraryItemOriginAppId(
      { key: "plain", source: "artifact", id: "plain", kind: "image", meta: {} },
      "image",
    ),
    "",
  );

  // 站点对不上、本站也没有绑定：兜底仍然是 owner 的 app，货架上不会凭空少一条。
  const foreign = durableItem({
    id: "foreign",
    originSiteKey: "asset",
    originAppId: "studio",
    bindings: [{ contextId: "olctx:v1:word:app:doc", role: "primary" }],
  });
  assert.equal(libraryItemOriginAppId(foreign, "image"), "studio");
});

// ---------------------------------------------------------------------------
// ② 分组与排序
// ---------------------------------------------------------------------------

test("materialSiteAppGroups：锚定 app 排头，其余按条目数，未归组永远最后", () => {
  const entries = [
    groupEntry("beta-1", "beta"),
    groupEntry("loose-1", ""),
    groupEntry("alpha-1", "alpha"),
    groupEntry("gamma-1", "gamma"),
    groupEntry("beta-2", "beta"),
    groupEntry("alpha-2", "alpha", { template_material_app_title: "阿尔法" }),
  ];

  const unanchored = materialSiteAppGroups(entries, { siteKey: "image" });
  assert.deepEqual(
    unanchored.map((group) => [group.appId, group.count]),
    [
      // 条目数相同就按 appId 字典序，排序是稳定可预期的。
      ["alpha", 2],
      ["beta", 2],
      ["gamma", 1],
      ["", 1],
    ],
  );
  assert.deepEqual(
    unanchored[0].entries.map((entry) => entry.id),
    ["alpha-1", "alpha-2"],
  );
  // 组内某一条带了友好名，整组就用它当标签。
  assert.equal(unanchored[0].label, "阿尔法");
  assert.equal(unanchored[1].label, "beta");
  assert.equal(unanchored[3].label, MATERIAL_SITE_APP_OTHER_LABEL);

  // 锚定的 app 排头，哪怕它条目最少；未归组仍然垫底。
  const anchored = materialSiteAppGroups(entries, {
    siteKey: "image",
    anchoredAppId: "gamma",
  });
  assert.deepEqual(
    anchored.map((group) => group.appId),
    ["gamma", "alpha", "beta", ""],
  );
  // 锚定的 app 在本站一条素材都没有时不影响其余排序。
  assert.deepEqual(
    materialSiteAppGroups(entries, {
      siteKey: "image",
      anchoredAppId: "nobody",
    }).map((group) => group.appId),
    ["alpha", "beta", "gamma", ""],
  );

  assert.deepEqual(materialSiteAppGroups([], { siteKey: "image" }), []);
});

test("materialSiteAppLabel：appId 就是标签，除非本行自带友好名", () => {
  assert.equal(materialSiteAppLabel("poster"), "poster");
  assert.equal(materialSiteAppLabel("poster", { poster: "海报设计" }), "海报设计");
  assert.equal(materialSiteAppLabel("poster", { poster: "  " }), "poster");
  assert.equal(materialSiteAppLabel(""), MATERIAL_SITE_APP_OTHER_LABEL);
  assert.equal(materialSiteAppLabel("  "), MATERIAL_SITE_APP_OTHER_LABEL);
});

// ---------------------------------------------------------------------------
// ③ chips
// ---------------------------------------------------------------------------

test("materialSiteAppChips：一组不挂轴，选中的 app 被清空也保留", () => {
  const groups = materialSiteAppGroups(
    [groupEntry("solo-1", "solo"), groupEntry("solo-2", "solo")],
    { siteKey: "image" },
  );
  // 只有一个 app 时这条轴什么都分不开，不挂。
  assert.deepEqual(materialSiteAppChips(groups, null), []);
  // 但已经选中时必须留着，否则读者解不掉这个筛选。
  assert.deepEqual(materialSiteAppChips(groups, "solo"), [
    { appId: "solo", label: "solo", count: 2 },
  ]);

  const two = materialSiteAppGroups(
    [groupEntry("a-1", "alpha"), groupEntry("b-1", "beta")],
    { siteKey: "image" },
  );
  const chips = materialSiteAppChips(two, null);
  assert.deepEqual(chips, [
    { appId: "alpha", label: "alpha", count: 1 },
    { appId: "beta", label: "beta", count: 1 },
  ]);
  // chip 只是标签，不拖着整组条目走。
  assert.ok(chips.every((chip) => !("entries" in chip)));

  // 类型筛选把选中的那一组清空了：chip 留下，计数归零。
  assert.deepEqual(materialSiteAppChips(two, "gamma"), [
    ...chips,
    { appId: "gamma", label: "gamma", count: 0 },
  ]);
  assert.deepEqual(materialSiteAppChips([], "gamma"), [
    { appId: "gamma", label: "gamma", count: 0 },
  ]);
  // 未归组那一组同理，且用得是它自己的文案。
  assert.deepEqual(materialSiteAppChips([], ""), [
    { appId: "", label: MATERIAL_SITE_APP_OTHER_LABEL, count: 0 },
  ]);
  assert.deepEqual(materialSiteAppChips([], null), []);
});

// ---------------------------------------------------------------------------
// ④ materialShelfEntries：只有 site 层换轴
// ---------------------------------------------------------------------------

const SHELF_DURABLE = artifactEntry(
  editableLibraryItem({
    id: "durable-poster",
    title: "本站可编辑素材",
    originAppId: "poster",
  }),
);
const SHELF_TEMPLATE = templateMaterialEntry(
  templateRow({ id: "poster-1", title: "官方海报模板", appId: "poster" }),
);
const SHELF_LOOSE_TEMPLATE = templateMaterialEntry(
  templateRow({ id: "loose-1", title: "无归属模板", appId: "" }),
);
const SHELF_UNTRUSTED = {
  id: "untrusted",
  title: "既非 durable 也非官方目录",
  libraryItem: {
    key: "untrusted",
    source: "artifact",
    id: "untrusted",
    kind: "image",
    title: "既非 durable 也非官方目录",
    favorite: false,
    meta: {},
  },
};

function shelf(level) {
  return materialShelfEntries({
    level,
    siteKey: "image",
    deepLinked: [],
    officialTemplates: [SHELF_TEMPLATE, SHELF_LOOSE_TEMPLATE],
    remote: [SHELF_DURABLE, SHELF_UNTRUSTED],
    exactLocal: [],
  });
}

test("site 层把 category 换成 app 标签，keywords 补上 appId，description 不动", () => {
  const entries = shelf("site");
  const byTitle = new Map(entries.map((entry) => [entry.title, entry]));
  // 两类可信条目同场，不可信的那一条照旧被挡在货架外。
  assert.deepEqual(
    entries.map((entry) => entry.title),
    ["官方海报模板", "无归属模板", "本站可编辑素材"],
  );

  const durable = byTitle.get("本站可编辑素材");
  assert.equal(durable.category, "poster");
  // 类型分类标签留在 description 上，位置不变。
  assert.equal(durable.description, "单文件图片");
  assert.ok(durable.keywords.includes("poster"));
  assert.ok(durable.keywords.includes("single_file_image"));

  const template = byTitle.get("官方海报模板");
  assert.equal(template.category, "poster");
  assert.equal(template.description, "官方模板简介");
  // 目录行的 keywords 本来就带 appId，不许重复补一遍。
  assert.equal(
    template.keywords.filter((keyword) => keyword === "poster").length,
    1,
  );

  // 解析不出归属的落进「其他素材」，而不是从货架上消失。
  const loose = byTitle.get("无归属模板");
  assert.equal(loose.category, MATERIAL_SITE_APP_OTHER_LABEL);
  assert.deepEqual(loose.keywords, SHELF_LOOSE_TEMPLATE.keywords);
});

test("primary / more 两层的 category / description / keywords 与旧行为逐字一致", () => {
  for (const level of ["primary", "more"]) {
    const entries = shelf(level);
    const byTitle = new Map(entries.map((entry) => [entry.title, entry]));

    const durable = byTitle.get("本站可编辑素材");
    assert.equal(durable.category, "单文件图片", `${level} 层动了 category`);
    assert.equal(durable.description, "单文件图片");
    assert.deepEqual(durable.keywords, SHELF_DURABLE.keywords);

    const template = byTitle.get("官方海报模板");
    assert.equal(template.category, "单文件图片", `${level} 层动了 category`);
    assert.equal(template.description, "官方模板简介");
    assert.deepEqual(template.keywords, SHELF_TEMPLATE.keywords);

    assert.equal(byTitle.get("既非 durable 也非官方目录"), undefined);
  }
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

function appChips(container) {
  return [...container.querySelectorAll("[data-material-app-chip]")].map(
    (chip) => ({
      appId: chip.getAttribute("data-material-app-chip"),
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
  levels: ["primary", "site", "more"],
  initialLevel: "site",
};

test("本站层挂出 app 轴：每组一颗 chip、带计数，锚定的 app 排头", async () => {
  primeShelf();
  const anchored = await createMounted(MaterialLibrary, {
    ...SITE_PROPS,
    appId: "poster",
  });
  try {
    await settle();
    assert.deepEqual(appChips(anchored.container), [
      { appId: "all", pressed: true, count: "" },
      { appId: "poster", pressed: false, count: "2" },
      { appId: "banner", pressed: false, count: "2" },
      { appId: "other", pressed: false, count: "1" },
    ]);
    // 「全部」也按分组顺序铺开，卡片天然成组。
    assert.deepEqual(cardTitles(anchored.container), [
      "海报模板一",
      "海报模板二",
      "横幅模板",
      "横幅素材",
      "未归组模板",
    ]);
    // 归属 app 成了卡片的分类轴，类型分类标签退到 description。
    const first = anchored.container.querySelector(
      '[data-entry-title="海报模板一"]',
    );
    assert.equal(first.getAttribute("data-entry-category"), "poster");
    assert.match(first.getAttribute("data-entry-keywords"), /poster/);
    assert.equal(
      anchored.container
        .querySelector('[data-entry-title="横幅素材"]')
        .getAttribute("data-entry-description"),
      "单文件图片",
    );
    // app 轴是新增的一条轴，类型筛选的 DOM 契约原样还在。
    assert.ok(
      anchored.container.querySelector('[role="group"][aria-label="按 app 分组"]'),
    );
    assert.ok(
      anchored.container.querySelector('[role="group"][aria-label="货架"]'),
    );
    assert.ok(
      anchored.container.querySelector(
        '[data-material-type-chip="single_file_image"][aria-pressed="false"]',
      ),
    );
  } finally {
    await anchored.unmount();
  }

  // 没有锚定 app 时条目数相同就按 appId 字典序，顺序不靠运气。
  primeShelf();
  const plain = await createMounted(MaterialLibrary, SITE_PROPS);
  try {
    await settle();
    assert.deepEqual(
      appChips(plain.container).map((chip) => chip.appId),
      ["all", "banner", "poster", "other"],
    );
  } finally {
    await plain.unmount();
  }
});

test("点选某个 app 后只剩该组卡片，「全部」能原路解开", async () => {
  primeShelf();
  const mounted = await createMounted(MaterialLibrary, {
    ...SITE_PROPS,
    appId: "poster",
  });
  try {
    await settle();
    await click(
      mounted.container.querySelector('[data-material-app-chip="poster"]'),
    );
    assert.deepEqual(cardTitles(mounted.container), ["海报模板一", "海报模板二"]);
    assert.deepEqual(
      appChips(mounted.container).filter((chip) => chip.pressed),
      [{ appId: "poster", pressed: true, count: "2" }],
    );

    // 解析不出归属的那一组也点得开。
    await click(
      mounted.container.querySelector('[data-material-app-chip="other"]'),
    );
    assert.deepEqual(cardTitles(mounted.container), ["未归组模板"]);

    await click(
      mounted.container.querySelector('[data-material-app-chip="all"]'),
    );
    assert.equal(cardTitles(mounted.container).length, 5);
  } finally {
    await mounted.unmount();
  }
});

test("类型筛选是次级筛选：与 app 选择叠加，清空该组也留得住 chip", async () => {
  primeShelf();
  const mounted = await createMounted(MaterialLibrary, {
    ...SITE_PROPS,
    appId: "poster",
  });
  try {
    await settle();
    await click(
      mounted.container.querySelector('[data-material-app-chip="poster"]'),
    );
    await click(
      mounted.container.querySelector('[data-material-type-chip="deck"]'),
    );
    // 两条轴同时生效：poster 组里的幻灯片，仅此一张。
    assert.deepEqual(cardTitles(mounted.container), ["海报模板二"]);
    assert.deepEqual(appChips(mounted.container), [
      { appId: "all", pressed: false, count: "" },
      { appId: "poster", pressed: true, count: "1" },
    ]);

    // 选中的 app 被类型筛成空组：chip 留着且计数归零，否则读者被留在一个
    // 看不见也解不掉的筛选里。
    await click(
      mounted.container.querySelector('[data-material-type-chip="deck"]'),
    );
    await click(
      mounted.container.querySelector('[data-material-type-chip="model_3d"]'),
    );
    assert.deepEqual(cardTitles(mounted.container), []);
    assert.deepEqual(appChips(mounted.container), [
      { appId: "all", pressed: false, count: "" },
      { appId: "poster", pressed: true, count: "0" },
    ]);
  } finally {
    await mounted.unmount();
  }
});

test("primary / more 两层不挂 app 轴，回到本站层时选择已重置", async () => {
  primeShelf();
  const mounted = await createMounted(MaterialLibrary, {
    ...SITE_PROPS,
    appId: "poster",
  });
  try {
    await settle();
    await click(
      mounted.container.querySelector('[data-material-app-chip="poster"]'),
    );
    assert.deepEqual(cardTitles(mounted.container), ["海报模板一", "海报模板二"]);

    await click(
      mounted.container.querySelector('[data-material-library-section="more"]'),
    );
    assert.equal(
      mounted.container.querySelector("[data-material-app-chip]"),
      null,
      "更多素材层不该出现 app 轴",
    );
    // 换轴只发生在本站层：这里的 category 仍然是类型分类标签。
    assert.equal(
      mounted.container
        .querySelector('[data-entry-title="海报模板一"]')
        .getAttribute("data-entry-category"),
      "单文件图片",
    );

    await click(
      mounted.container.querySelector(
        '[data-material-library-section="primary"]',
      ),
    );
    assert.equal(
      mounted.container.querySelector("[data-material-app-chip]"),
      null,
      "此 app 层不该出现 app 轴",
    );

    await click(
      mounted.container.querySelector('[data-material-library-section="site"]'),
    );
    assert.deepEqual(
      appChips(mounted.container).filter((chip) => chip.pressed),
      [{ appId: "all", pressed: true, count: "" }],
    );
    assert.equal(cardTitles(mounted.container).length, 5);
  } finally {
    await mounted.unmount();
  }
});
