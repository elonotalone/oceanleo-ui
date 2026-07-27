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
    export function artifactDownloadEvidence(){
      return { visible: true, available: true, reason: "", purpose: "source", mode: "attachment" };
    }
    export async function getArtifactDownload(){ return { ok: true, data: {} }; }
    export async function getArtifactItem(){ return { ok: false, status: 404 }; }
    export async function listPrimaryArtifacts(){ return { ok: true, data: { items: [], nextCursor: null } }; }
    export async function listEditableShelfArtifacts(){ return { ok: true, data: { items: [], nextCursor: null } }; }
    export async function searchArtifactLibrary(){ return { ok: true, data: { items: [], nextCursor: null } }; }
  `),
  // 桩件照 WorkspaceLibrary 真身的做法把 entryActions 喂给一张素材卡，
  // 这样「按钮造好了但没接线」会被这份用例当场抓住。
  "./WorkspaceLibrary": dataModule(`
    import { createElement } from ${JSON.stringify(reactUrl)};
    export function WorkspaceLibrary(props) {
      const probe = globalThis.__w5cardProbe;
      return createElement(
        "section",
        {
          "data-search-placeholder": props.searchPlaceholder,
          "data-empty-title": props.emptyTitle,
          "data-entry-count": String(props.entries.length),
          "data-entry-actions-wired": String(
            typeof props.entryActions === "function",
          ),
        },
        props.toolbarActions,
        probe
          ? createElement(
              "article",
              { "data-probe-card": "true" },
              props.entryActions?.(probe),
            )
          : null,
      );
    }
  `),
};

const { ExplorePage, resetExploreSiteKeyWarnings } = await import(
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
  assert.match(source, /canonicalArtifactContextId\(\s*resolvedSiteKey,/);
  assert.match(source, /const resolvedSiteKey = \(siteKey \|\| siteId\)\.trim\(\)/);
  // 历史营销分类表不授予可见性，不能当类型筛选用。
  assert.doesNotMatch(source, /EXPLORE_CATEGORY_LABELS\[[^\]]*\]\s*as ArtifactType/);
});

test("探索页素材卡上真的挂出了下载动作（合同 §0.6，不是「造好了没接线」）", () => {
  const item = {
    key: "artifact:tpl-1:r1",
    source: "artifact",
    id: "tpl-1",
    artifactId: "tpl-1",
    revisionId: "r1",
    artifactType: "single_file_image",
    title: "本站模板 1",
    kind: "image",
    siteId: "image",
    favorite: false,
    meta: { workspace_library_surface: "materials" },
    artifact: {
      artifactId: "tpl-1",
      revisionId: "r1",
      artifactType: "single_file_image",
      owner: { originSiteKey: "image", visibility: "public" },
      bindings: [],
    },
  };
  globalThis.__w5cardProbe = {
    id: "entry:tpl-1",
    title: item.title,
    libraryItem: item,
  };
  let markup = "";
  try {
    markup = renderToStaticMarkup(
      createElement(ExplorePage, { config: CONFIG, siteKey: "image" }),
    );
  } finally {
    globalThis.__w5cardProbe = null;
  }
  // ① 接缝接上了：MaterialLibrary 确实把一个函数交给了 entryActions。
  assert.match(markup, /data-entry-actions-wired="true"/);
  // ② 这个函数在素材卡上真的渲染出了下载按钮，而不是返回 null。
  assert.match(
    markup,
    /data-probe-card="true"><div[^>]*><button[^>]*data-material-card-download="tpl-1"/,
  );
  assert.match(markup, /aria-label="下载「本站模板 1」revision r1"/);
  // ③ 卡片上只多出「下载」，另外四个动作仍然只许待在详情头。
  const card = markup.slice(markup.indexOf('data-probe-card="true"'));
  assert.equal((card.match(/<button/g) || []).length, 1);
  for (const forbidden of ["编辑", "收藏", "全屏", "链接"]) {
    assert.doesNotMatch(card, new RegExp(forbidden));
  }
});

test("编辑器抽屉注册了主动作时，卡片不挂下载（喂画布优先）", () => {
  globalThis.__w5cardProbe = null;
  const markup = renderToStaticMarkup(
    createElement(ExplorePage, {
      config: CONFIG,
      siteKey: "image",
      materialActions: ["insert"],
    }),
  );
  assert.match(markup, /data-entry-actions-wired="false"/);
});

test("siteKey 是站级作用域的正名，siteId 作为旧拼写继续认", () => {
  for (const props of [
    { config: CONFIG, siteKey: "image" },
    { config: CONFIG, siteId: "image" },
  ]) {
    const markup = renderToStaticMarkup(createElement(ExplorePage, props));
    assert.deepEqual(sections(markup), ["site", "more"]);
    assert.equal(activeSection(markup), "site");
  }
});

test("拿不到 siteKey 就不许挂「本站素材」的招牌（V5 §3 的静默退化）", () => {
  const errors = [];
  // 去重是模块级的，先清一次，免得用例顺序变了就吞掉告警。
  resetExploreSiteKeyWarnings();
  const realError = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  let markup = "";
  try {
    markup = renderToStaticMarkup(
      createElement(ExplorePage, { config: CONFIG }),
    );
  } finally {
    console.error = realError;
  }
  // 标题不许撒谎：站级那两层直接不渲染，只留「更多素材」。
  // 只剩一段时连分区 tab 都不必渲染，靠 scope 标记确认落在哪一层。
  assert.equal(activeSection(markup), "more");
  assert.deepEqual(sections(markup), []);
  assert.doesNotMatch(markup, /data-material-library-section="site"/);
  assert.doesNotMatch(markup, /data-material-library-section="primary"/);
  // 开发态页面上有一条看得见的告警，控制台有点名。
  assert.match(markup, /data-explore-missing-site-key="true"/);
  assert.ok(
    errors.some((line) => line.includes("缺少 siteKey")),
    `console.error 没有点名缺 siteKey：${JSON.stringify(errors)}`,
  );

  // 缺 siteKey 时连 ?app= 都不该把首屏定到「此 app」——那层同样拿不到 context。
  const anchored = renderToStaticMarkup(
    createElement(ExplorePage, { config: CONFIG, appId: "poster" }),
  );
  assert.equal(activeSection(anchored), "more");
  assert.doesNotMatch(anchored, /data-material-library-section="primary"/);
});

test("长文档站点有正经的 document 取值，不必再借 image/font", () => {
  const markup = renderToStaticMarkup(
    createElement(ExplorePage, {
      config: { type: "document" },
      siteKey: "word",
    }),
  );
  assert.match(
    markup,
    /aria-pressed="true" data-material-type-chip="document"/,
  );
  // 没有被误标成图片。
  assert.match(
    markup,
    /aria-pressed="false" data-material-type-chip="single_file_image"/,
  );
  const source = readFileSync(
    new URL("../src/shell/ExplorePage.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /\| "document";/);
  assert.match(source, /document: "document",/);
  // 旧的 font → document 映射保留兼容，不删。
  assert.match(source, /font: "document",/);
});

test("config.type 可以整个省掉，只给 types 或什么都不给", () => {
  const markup = renderToStaticMarkup(
    createElement(ExplorePage, {
      config: { types: ["document", "ppt"] },
      siteKey: "word",
    }),
  );
  assert.match(markup, /aria-pressed="true" data-material-type-chip="document"/);
  assert.match(markup, /aria-pressed="true" data-material-type-chip="deck"/);

  const unfiltered = renderToStaticMarkup(
    createElement(ExplorePage, { config: {}, siteKey: "word" }),
  );
  // 两个都不传 = 不限类型：「全部类型」是选中态。
  assert.match(unfiltered, /aria-pressed="true"[^>]*>全部类型</);
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
