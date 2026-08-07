// 探索页那块白底板（台账 §A1 ＋ 裁决 §A5b）。
//
// 底板由 `WorkspaceLibrary` 自己的 `plain` 开关控制，开关一直都在，缺的是**接线**：
// `ExplorePage` 只在 DOM 上标了 `data-explore-shelf-shell="plain"`，没有把 prop 传下去。
// 而同一块底板有两处：settle 之后的货架（`WorkspaceLibrary`）与首帧骨架
// （`material-library-skeleton.tsx:32`，class 串与货架逐字相同但当时没有开关）。
// **两处必须同时无底板**，否则用户看到的是「白底板闪一下再消失」。
//
// 这份用例守三件事：
//   · 首帧：探索页真渲一遍，骨架上不许出现 `bg-[var(--card`；
//   · settle 后：探索页真渲一遍，`WorkspaceLibrary` 收到的 `plain` 必须是 true；
//   · 抽屉/面板（不传 plain 的调用方）**照旧有底板** —— 这次改的是探索页，不是全体。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// 桩是 `data:` 模块，没有包作用域：裸名 `react` 在里面解析不了，必须钉成 file URL。
const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;

/**
 * 底板的签名 class 串。**不能只搜 `bg-[var(--card`**：骨架卡片自己也用这个变量做卡面，
 * 那是正常的（V3 信号里点过名）。底板独有的是它后面跟着的那组内边距。
 */
const CARD_PANEL = /bg-\[var\(--card,#fff\)\] px-3 pb-3 pt-5/;

const BASE_OVERRIDES = {
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
    export async function getCurrentArtifactItem(){ return { ok: false, status: 404 }; }
    export async function listPrimaryArtifacts(){ return { ok: true, data: { items: [], nextCursor: null } }; }
    export async function listEditableShelfArtifacts(){ return { ok: true, data: { items: [], nextCursor: null } }; }
    export async function searchArtifactLibrary(){ return { ok: true, data: { items: [], nextCursor: null } }; }
  `),
  // 货架真身太重（内含各类查看器），这里只要它把收到的 `plain` 原样报出来。
  "./WorkspaceLibrary": dataModule(`
    import { createElement } from ${JSON.stringify(reactUrl)};
    export function WorkspaceLibrary(props) {
      return createElement("section", {
        "data-workspace-library": "true",
        "data-plain": String(Boolean(props.plain)),
      });
    }
  `),
};

/** settle 之后那一帧：取数与热度探针都已有结论，呈现层走 `WorkspaceLibrary`。 */
const SETTLED_OVERRIDES = {
  ...BASE_OVERRIDES,
  "./material-library-effects": dataModule(`
    export function useMaterialLibraryChangeEvents(){}
    export function useMaterialLibraryDeepLink(){}
    export function useMaterialLibraryPreviewIntent(){}
    export function useMaterialShelfSettle(){
      return { settled: true, markSettled(){} };
    }
    export function useOfficialTemplateMaterials(){
      return { entries: [], loading: false, error: "", status: undefined, deepLinkEntryId: "" };
    }
  `),
  "./explore-shelf-dispatch": dataModule(`
    export function useExploreShelfDispatch(){
      return {
        enabled: false,
        artifactClass: "material",
        renderMode: "grid",
        axis: null,
        entries: [],
        settled: true,
        playableCount: 0,
        playableTruncated: false,
        playableError: "",
      };
    }
    export function ExplorePlayableSurface(){ return null; }
  `),
};

const WORD_APPS = [
  { id: "proposal", name: "开题报告", scenes: ["学术教育"] },
  { id: "weekly", name: "周报生成", scenes: ["职场精选"] },
];

const { ExplorePage: FirstFrameExplorePage } = await import(
  await compileModule("src/shell/ExplorePage.tsx", BASE_OVERRIDES)
);
const { registerSiteAppDirectory: registerFirstFrame } = await import(
  await compileModule("src/shell/material-scene-axis.ts", BASE_OVERRIDES)
);
const { ExplorePage: SettledExplorePage } = await import(
  await compileModule("src/shell/ExplorePage.tsx", SETTLED_OVERRIDES)
);
const { MaterialLibrary: SettledMaterialLibrary } = await import(
  await compileModule("src/shell/material-library-view.tsx", SETTLED_OVERRIDES)
);
const { registerSiteAppDirectory: registerSettled } = await import(
  await compileModule("src/shell/material-scene-axis.ts", SETTLED_OVERRIDES)
);
const { MaterialShelfSkeleton } = await import(
  await compileModule("src/shell/material-library-skeleton.tsx", BASE_OVERRIDES)
);

test("首帧骨架：探索页刚打开的那一瞬间也没有白底板（裁决 §A5b）", () => {
  registerFirstFrame("word", WORD_APPS);
  const html = renderToStaticMarkup(
    createElement(FirstFrameExplorePage, { siteKey: "word" }),
  );
  // 首帧走的确实是骨架分支——否则下面那条断言等于什么都没测。
  assert.match(html, /data-material-shelf-skeleton="true"/);
  assert.match(html, /data-material-shelf-state="loading"/);
  assert.doesNotMatch(
    html,
    CARD_PANEL,
    "探索页首帧仍然画了白底板：底板会闪一下再消失",
  );
});

test("settle 之后：探索页把 plain 一路传到货架", () => {
  registerSettled("word", WORD_APPS);
  const html = renderToStaticMarkup(
    createElement(SettledExplorePage, { siteKey: "word" }),
  );
  assert.match(html, /data-workspace-library="true"/);
  assert.match(
    html,
    /data-plain="true"/,
    "ExplorePage → MaterialLibrary → WorkspaceLibrary 这条透传链断了",
  );
  // 意图标记与真开关必须同时在场：只留标记就是修好之前的样子。
  assert.match(html, /data-explore-shelf-shell="plain"/);
});

test("不传 plain 的调用方照旧有底板：改的是探索页，不是全体货架", () => {
  const html = renderToStaticMarkup(
    createElement(SettledMaterialLibrary, {
      materials: [],
      siteId: "word",
      appId: "proposal",
      contextId: "word:proposal",
      levels: ["site"],
      lockLevel: "site",
      fetchPrimary: false,
    }),
  );
  assert.match(html, /data-plain="false"/);
});

test("骨架的 plain 与货架逐字同义：开着无底色，关着还是那串白底板 class", () => {
  const bare = renderToStaticMarkup(
    createElement(MaterialShelfSkeleton, { plain: true }),
  );
  assert.doesNotMatch(bare, CARD_PANEL);
  assert.match(bare, /bg-transparent/);

  const panelled = renderToStaticMarkup(createElement(MaterialShelfSkeleton, {}));
  assert.match(panelled, CARD_PANEL);
});
