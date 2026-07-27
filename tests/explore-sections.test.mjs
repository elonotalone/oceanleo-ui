// 探索页三段式分区（合同 2026-07-27 §0.6）的契约。
//   /explore              → 本站素材 ｜ 更多素材        （首屏 = 本站素材）
//   /explore?app=<appId>  → 此 app ｜ 本站素材 ｜ 更多素材（首屏 = 此 app）
// 另外守住：类型筛选是多选 chips（不是单选下拉）、`lockLevel="more"` 已解开、
// chips 选中态进 URL。组件源码经 typescript.transpileModule 编译成 data: 模块后
// 导入，所以可以直接 `node --test tests/explore-sections.test.mjs`。

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
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

const compiledModules = new Map();
const inFlight = new Set();

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
  const url = `${dataModule(output)}#${encodeURIComponent(relativePath)}`;
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
  "./artifact-client": dataModule(`
    export const ARTIFACT_LIBRARY_CHANGE_EVENT = "oceanleo:artifact-library-change";
    export async function getArtifactItem(){ return { ok: false, status: 404 }; }
    export async function listPrimaryArtifacts(){ return { ok: true, data: { items: [], nextCursor: null } }; }
    export async function listEditableShelfArtifacts(){ return { ok: true, data: { items: [], nextCursor: null } }; }
    export async function searchArtifactLibrary(){ return { ok: true, data: { items: [], nextCursor: null } }; }
  `),
  "./WorkspaceLibrary": dataModule(`
    import { createElement } from ${JSON.stringify(reactUrl)};
    export function WorkspaceLibrary(props) {
      return createElement(
        "section",
        {
          "data-search-placeholder": props.searchPlaceholder,
          "data-empty-title": props.emptyTitle,
          "data-entry-count": String(props.entries.length),
        },
        props.toolbarActions,
      );
    }
  `),
};

const { ExplorePage } = await import(
  await compileModule("src/shell/ExplorePage.tsx", OVERRIDES)
);

const CONFIG = { type: "image", title: "探索 · 素材" };

function sections(markup) {
  return [...markup.matchAll(/data-material-library-section="([a-z]+)"/g)].map(
    ([, level]) => level,
  );
}

function activeSection(markup) {
  return /data-material-library-scope="([a-z]+)"/.exec(markup)?.[1] || "";
}

test("/explore 默认两段：本站素材 ｜ 更多素材，首屏是本站素材", () => {
  const markup = renderToStaticMarkup(
    createElement(ExplorePage, { config: CONFIG, siteId: "image" }),
  );
  assert.deepEqual(sections(markup), ["site", "more"]);
  assert.equal(activeSection(markup), "site");
  assert.match(markup, /本站素材/);
  assert.match(markup, /更多素材/);
  // 本站层不是「全平台」那一层了。
  assert.doesNotMatch(markup, /data-material-library-scope="more"/);
});

test("/explore?app=<id> 三段：此 app ｜ 本站素材 ｜ 更多素材，首屏定位到此 app", () => {
  const markup = renderToStaticMarkup(
    createElement(ExplorePage, {
      config: CONFIG,
      siteId: "image",
      appId: "poster",
    }),
  );
  assert.deepEqual(sections(markup), ["primary", "site", "more"]);
  assert.equal(activeSection(markup), "primary");
  assert.match(markup, /此 app/);
});

test("类型筛选是多选 chips，不是单选下拉；config.type 作为默认选中", () => {
  const markup = renderToStaticMarkup(
    createElement(ExplorePage, { config: CONFIG, siteId: "image" }),
  );
  assert.doesNotMatch(markup, /<select/);
  const chips = [
    ...markup.matchAll(/data-material-type-chip="([a-z0-9_]+)"/g),
  ].map(([, type]) => type);
  assert.ok(chips.length >= 13, `只渲染了 ${chips.length} 个类型 chip`);
  assert.ok(chips.includes("single_file_image"));
  assert.ok(chips.includes("model_3d"));
  // 每个 chip 是可切换的按钮（aria-pressed），能同时选「图片 + 3D」。
  assert.match(
    markup,
    /aria-pressed="true" data-material-type-chip="single_file_image"/,
  );
  assert.match(
    markup,
    /aria-pressed="false" data-material-type-chip="model_3d"/,
  );
});

test("ExplorePage 解开 lockLevel 并按 §3.1 认 ?app= / ?types=", () => {
  const source = readFileSync(
    new URL("../src/shell/ExplorePage.tsx", import.meta.url),
    "utf8",
  );
  // 现状不合格的根因就是这两行写死。
  assert.doesNotMatch(source, /lockLevel/);
  assert.doesNotMatch(source, /initialLevel="more"/);
  assert.match(source, /params\.get\("app"\)/);
  assert.match(source, /materialTypesFromCsv\(params\.get\("types"\)/);
  // chips 选中态进 URL，刷新不丢。
  assert.match(source, /url\.searchParams\.set\("types", csv\)/);
  assert.match(source, /window\.history\.replaceState/);
  // 此 app 那层要有 catalog context 才能命中 exact binding。
  assert.match(source, /canonicalArtifactContextId\(siteId, exploreAppId\)/);
  // 历史营销分类表不授予可见性，不能当类型筛选用。
  assert.doesNotMatch(source, /EXPLORE_CATEGORY_LABELS\[[^\]]*\]\s*as ArtifactType/);
});

test("站点只传 siteId 时也能工作：单值 ExploreConfig.type 保留兼容", () => {
  const markup = renderToStaticMarkup(
    createElement(ExplorePage, {
      config: { type: "3d", types: ["3d", "image"] },
      siteId: "threed",
    }),
  );
  assert.match(
    markup,
    /aria-pressed="true" data-material-type-chip="model_3d"/,
  );
  assert.match(
    markup,
    /aria-pressed="true" data-material-type-chip="single_file_image"/,
  );
});
