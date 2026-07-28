// 零配置探索页的契约（`01-decisions.md` D2/D4/D5/D6）。
//   /explore              → 分区轴 = 站点 app 目录的场景词，本站素材一层
//   /explore?app=<appId>  → 同一套分区 + 一颗可清除的 app 锚点
// 另外守住四条硬要求：
//   · 站点只传 site key，`config` / `siteId` 传了也不采纳，且会被打成可门禁识别的漂移；
//   · 未 settle 只画骨架，整段 HTML 里一个「暂无」都没有（D5）；
//   · 网格卡不挂下载（D4，下载只在详情浮层里）；
//   · 缺 site key 时 fail-closed，不渲染货架。
// 组件源码经 typescript.transpileModule 编译成真文件后导入，所以可以直接
// `node --test tests/explore-sections.test.mjs`。

import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
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

// 编好的模块落成**真文件**，用 `file://` 引用，而不是把依赖的 data: URL 内联进
// 导入者的源码里。
//
// 内联那种写法在菱形依赖上是指数级的：素材库这一族里 view / effects / presentation
// 各自都拉 controller 与 template-source，每多一层 base64 再放大 4/3，实测
// `ExplorePage` 一个模块的 URL 就长到 **197 MB**（controller 4.5 MB → presentation
// 17 MB → effects 41 MB → view 103 MB），本文件因此被 cgroup OOM killer 杀在
// anon-rss 5.7 GB。落成文件后每个依赖只是一段短路径，体积不再叠加，node 也能按路径
// 给模块身份（data: URL 没有路径、不去重）。
const compiledDir = mkdtempSync(join(tmpdir(), "oceanleo-explore-sections-"));
process.on("exit", () => {
  rmSync(compiledDir, { recursive: true, force: true });
});
let compiledSeq = 0;

function fileModule(relativePath, source) {
  compiledSeq += 1;
  const name = `${String(compiledSeq).padStart(3, "0")}-${basename(relativePath).replace(/\.tsx?$/, "")}.mjs`;
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
  "./artifact-client": dataModule(`
    export const ARTIFACT_LIBRARY_CHANGE_EVENT = "oceanleo:artifact-library-change";
    export function artifactDownloadEvidence(){
      return { visible: true, available: true, reason: "", purpose: "source", mode: "attachment" };
    }
    export async function getArtifactDownload(){ return { ok: true, data: {} }; }
    export async function getArtifactItem(){ return { ok: false, status: 404 }; }
    // 素材库的深链只读落点 useLibraryEditIntent 会按 artifact id 取一次；
    // 探索页不带深链，所以这里给一个惰性的 404 桩，和上面那条保持一致。
    export async function getCurrentArtifactItem(){ return { ok: false, status: 404 }; }
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
const { registerSiteAppDirectory, resetSiteAppDirectories } = await import(
  await compileModule("src/shell/material-scene-axis.ts", OVERRIDES)
);


/** word 站工作台的真分区（`WORD_SCENES`），外加一个没有场景词的 app 与一个 agent。 */
const WORD_APPS = [
  { id: "proposal", name: "开题报告", scenes: ["学术教育", "学生常用"] },
  { id: "lit-review", name: "文献综述", scenes: ["学术教育"] },
  { id: "gov-report", name: "工作报告", scenes: ["机关单位"] },
  { id: "weekly", name: "周报生成", scenes: ["职场精选"] },
  { id: "misc", name: "自由写作", scenes: [] },
  // agent 类 app 没有独立素材，分区轴里不该出现（D2）。
  { id: "agent", name: "写作助手", scenes: ["智能体"] },
];

function markup(props) {
  return renderToStaticMarkup(createElement(ExplorePage, props));
}

function sceneChips(html) {
  return [...html.matchAll(/data-material-scene-chip="([^"]+)"/g)].map(
    ([, id]) => id,
  );
}

function typeChips(html) {
  return [...html.matchAll(/data-material-type-chip="([a-z0-9_]+)"/g)].map(
    ([, type]) => type,
  );
}

function captureErrors(run) {
  const errors = [];
  const realError = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  try {
    return { html: run(), errors };
  } finally {
    console.error = realError;
  }
}

test("零配置：只传 site key 就能渲染，标题与副标题由共享包按 app 目录推导", () => {
  resetSiteAppDirectories();
  resetExploreSiteKeyWarnings();
  registerSiteAppDirectory("word", WORD_APPS);
  const html = markup({ siteKey: "word" });
  assert.match(html, /data-explore-shape="zero-config"/);
  assert.match(html, /data-explore-site-key="word"/);
  assert.match(html, /探索 · 素材/);
  // 5 个成品 app（agent 被排除），副标题是推导出来的，不是站点写的。
  assert.match(html, /按工作台场景浏览本站 5 个 app 的素材。/);
  // 站点没传任何作废 props，就不该有漂移标记。
  assert.doesNotMatch(html, /data-explore-legacy-props/);
  assert.doesNotMatch(html, /data-explore-missing-app-directory/);
});

test("分区轴 = 工作台场景，顺序照目录，agent 类 app 被排除（D2）", () => {
  resetSiteAppDirectories();
  registerSiteAppDirectory("word", WORD_APPS);
  const html = markup({ siteKey: "word" });
  assert.deepEqual(sceneChips(html), [
    "all",
    "学术教育",
    "学生常用",
    "机关单位",
    "职场精选",
    "other",
  ]);
  assert.match(html, /role="group" aria-label="素材场景分区"/);
  // 「其它」是没有场景词的 app 那一格，文案与工作台一致。
  assert.match(html, /data-material-scene-chip="other"[^>]*>其它/);
  // 智能体那一格不许出现。
  assert.doesNotMatch(html, /智能体/);
  // 原始 appId chips 整排下线。
  assert.doesNotMatch(html, /data-material-app-chip/);
});

test("站点没登记 app 目录 = 漂移：分区轴退化，DOM 与 console 都点名", () => {
  resetSiteAppDirectories();
  resetExploreSiteKeyWarnings();
  const { html, errors } = captureErrors(() => markup({ siteKey: "excel" }));
  assert.match(html, /data-explore-missing-app-directory="excel"/);
  assert.deepEqual(sceneChips(html), []);
  assert.ok(
    errors.some((line) => line.includes("没有登记 app 目录")),
    `console.error 没点名缺目录：${JSON.stringify(errors)}`,
  );
});

test("作废的 config / siteId 传了也不采纳，并打成门禁认得的漂移", () => {
  resetSiteAppDirectories();
  resetExploreSiteKeyWarnings();
  registerSiteAppDirectory("word", WORD_APPS);
  const { html, errors } = captureErrors(() =>
    markup({
      siteKey: "word",
      siteId: "word",
      config: {
        types: ["document"],
        title: "探索 · 文档素材",
        subtitle: "站点自己写的副标题",
        emptyHint: "站点自己写的空态",
      },
    }),
  );
  assert.match(html, /data-explore-legacy-props="config,siteId"/);
  // 站点写的文案一个字都没被采纳。
  assert.doesNotMatch(html, /探索 · 文档素材/);
  assert.doesNotMatch(html, /站点自己写的/);
  assert.match(html, /探索 · 素材/);
  // 站点声明的 types 也不再预选。
  assert.doesNotMatch(html, /aria-pressed="true" data-material-type-chip=/);
  assert.ok(
    errors.some((line) => line.includes("已作废的 props")),
    `console.error 没点名作废 props：${JSON.stringify(errors)}`,
  );
});

test("未 settle 只画骨架：整段 HTML 一个「暂无」都没有（D5）", () => {
  resetSiteAppDirectories();
  registerSiteAppDirectory("word", WORD_APPS);
  const html = markup({ siteKey: "word" });
  assert.match(html, /data-material-shelf-skeleton="true"/);
  assert.match(html, /data-material-shelf-state="loading"/);
  for (const misleading of ["暂无", "没有匹配", "taxonomy"]) {
    assert.doesNotMatch(
      html,
      new RegExp(misleading),
      `未 settle 的首帧出现了「${misleading}」`,
    );
  }
  // 分区轴与类型筛选照常渲染 —— 它们不依赖请求结果，闪掉反而更晃眼。
  assert.ok(sceneChips(html).length > 1);
});

test("网格卡不挂下载：entryActions 根本没接线（D4）", () => {
  resetSiteAppDirectories();
  registerSiteAppDirectory("word", WORD_APPS);
  globalThis.__w5cardProbe = {
    id: "entry:tpl-1",
    title: "本站模板 1",
    libraryItem: {
      key: "artifact:tpl-1:r1",
      source: "artifact",
      id: "tpl-1",
      artifactId: "tpl-1",
      revisionId: "r1",
      artifactType: "document",
      title: "本站模板 1",
      kind: "document",
      siteId: "word",
      favorite: false,
      meta: { workspace_library_surface: "materials" },
      artifact: {
        artifactId: "tpl-1",
        revisionId: "r1",
        artifactType: "document",
        owner: { originSiteKey: "word", visibility: "public" },
        bindings: [],
      },
    },
  };
  let html = "";
  try {
    html = markup({ siteKey: "word" });
  } finally {
    globalThis.__w5cardProbe = null;
  }
  assert.doesNotMatch(html, /data-material-card-download/);
  assert.doesNotMatch(html, /data-entry-actions-wired="true"/);
  // 源码侧也不许再把下载渲染函数挂回 entryActions。
  const source = readFileSync(
    new URL("../src/shell/material-library-view.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /entryActions=\{/);
  assert.doesNotMatch(source, /materialEntryDownloadAction/);
});

test("缺 site key 时 fail-closed：不渲染货架，只留点名的错误", () => {
  resetSiteAppDirectories();
  resetExploreSiteKeyWarnings();
  const { html, errors } = captureErrors(() => markup({}));
  assert.match(html, /data-explore-missing-site-key="true"/);
  // 货架整块不挂：没有分区轴、没有类型筛选、没有骨架。
  assert.doesNotMatch(html, /data-material-library-scope/);
  assert.doesNotMatch(html, /data-material-shelf-skeleton/);
  assert.deepEqual(typeChips(html), []);
  assert.ok(
    errors.some((line) => line.includes("缺少 siteKey")),
    `console.error 没点名缺 siteKey：${JSON.stringify(errors)}`,
  );

  // 带 ?app= 锚点也一样：那一层同样拿不到 context。
  const anchored = markup({ appId: "proposal" });
  assert.doesNotMatch(anchored, /data-material-library-scope/);
});

test("siteId 仍作为 siteKey 的旧拼写生效（但记为漂移）", () => {
  resetSiteAppDirectories();
  resetExploreSiteKeyWarnings();
  registerSiteAppDirectory("word", WORD_APPS);
  const html = markup({ siteId: "word" });
  assert.match(html, /data-explore-site-key="word"/);
  assert.match(html, /data-explore-legacy-props="siteId"/);
  assert.ok(sceneChips(html).length > 1);
});

test("次级类型筛选：多选 chips 不是下拉，且只铺货架上真实存在的类型", () => {
  resetSiteAppDirectories();
  registerSiteAppDirectory("word", WORD_APPS);
  const html = markup({ siteKey: "word" });
  assert.doesNotMatch(html, /<select/);
  // 首帧货架还没有任何素材，所以除了「全部类型」没有别的 chip 可铺——
  // 铺满 13 颗里 12 颗点了必空，那不是筛选而是噪音。
  assert.deepEqual(typeChips(html), []);
  assert.match(html, /aria-pressed="true"[^>]*>全部类型</);
  assert.match(html, /role="group" aria-label="货架"/);
});

test("ExplorePage 对外只剩 site key + app 锚点，URL 契约不变", () => {
  const source = readFileSync(
    new URL("../src/shell/ExplorePage.tsx", import.meta.url),
    "utf8",
  );
  // 站点声明的类型/文案不再有任何取值路径。
  assert.doesNotMatch(source, /configuredTypes/);
  assert.doesNotMatch(source, /config\.title/);
  assert.doesNotMatch(source, /config\.emptyHint/);
  // URL 契约：?app= / ?types= / ?scene=
  assert.match(source, /params\.get\("app"\)/);
  assert.match(source, /materialTypesFromCsv\(params\.get\("types"\)/);
  assert.match(source, /params\.get\(SCENE_QUERY_KEY\)/);
  assert.match(source, /window\.history\.replaceState/);
  assert.match(source, /canonicalArtifactContextId\(resolvedSiteKey, exploreAppId\)/);
  // 本站素材是唯一一层：不再有 more。
  assert.doesNotMatch(source, /"more"/);
});
