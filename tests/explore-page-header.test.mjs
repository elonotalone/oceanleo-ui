// 探索页页头：左上小标题、同一行右边货架搜索，不要副标题。
//
// 标题不再由 ExplorePage 自画 22px header，而是交给货架
// `MaterialLibrary pageTitle` → `WorkspaceLibrary.pageTitle`（W1 放进搜索行左侧）。
// 这份用例守四件事：
//   · 源码不再调用 exploreSubtitle(，根用 APP_PAGE_FRAME_CLASS，不再 py-7 / 22px；
//   · settle 后 pageTitle 到货架，markup 有「探索 · 素材」，没有「按工作台场景浏览」；
//   · data-explore-shape="zero-config" 仍在；
//   · material-library-view.tsx / ExplorePage.tsx ≤800 行。
// exploreSubtitle 导出本身保留（别人还可能 import）。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  EXPLORE_TITLE,
  exploreSubtitle,
} from "../src/shell/material-scene-axis.ts";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;

const WORD_APPS = [
  { id: "proposal", name: "开题报告", scenes: ["学术教育"] },
  { id: "weekly", name: "周报生成", scenes: ["职场精选"] },
];

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
    export async function getCurrentArtifactItem(){ return { ok: false, status: 404 }; }
    export async function listPrimaryArtifacts(){ return { ok: true, data: { items: [], nextCursor: null } }; }
    export async function listEditableShelfArtifacts(){ return { ok: true, data: { items: [], nextCursor: null } }; }
    export async function searchArtifactLibrary(){ return { ok: true, data: { items: [], nextCursor: null } }; }
  `),
  "./material-library-effects": dataModule(`
    export function useMaterialLibraryChangeEvents(){}
    export function useMaterialLibraryDeepLink(){}
    export function useMaterialLibraryPreviewIntent(){}
    export function useLibraryCurrentIdentityRestore(){}
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
  "./WorkspaceLibrary": dataModule(`
    import { createElement } from ${JSON.stringify(reactUrl)};
    export function WorkspaceLibrary(props) {
      return createElement(
        "section",
        {
          "data-workspace-library": "true",
          "data-plain": String(Boolean(props.plain)),
          "data-page-title": props.pageTitle == null ? "" : String(props.pageTitle),
        },
        props.pageTitle,
      );
    }
  `),
};

const { ExplorePage } = await import(
  await compileModule("src/shell/ExplorePage.tsx", OVERRIDES)
);
const { registerSiteAppDirectory } = await import(
  await compileModule("src/shell/material-scene-axis.ts", OVERRIDES)
);

function sourceOf(rel) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

function lineCount(rel) {
  return sourceOf(rel).split("\n").length;
}

test("exploreSubtitle 导出仍在，页面源码不再调用", () => {
  assert.equal(typeof exploreSubtitle, "function");
  assert.equal(EXPLORE_TITLE, "探索 · 素材");
  assert.match(exploreSubtitle({ apps: [{ id: "a" }, { id: "b" }] }), /2 个 app/);
  const source = sourceOf("../src/shell/ExplorePage.tsx");
  assert.doesNotMatch(source, /exploreSubtitle\(/);
  assert.doesNotMatch(source, /py-7/);
  assert.doesNotMatch(source, /text-\[22px\]/);
  assert.match(source, /APP_PAGE_FRAME_CLASS/);
  assert.match(source, /pageTitle=\{tt\(EXPLORE_TITLE\)\}/);
});

test("material-library-view 把 pageTitle 透传给货架，且不超过 800 行", () => {
  const view = sourceOf("../src/shell/material-library-view.tsx");
  assert.match(view, /pageTitle=\{pageTitle\}/);
  assert.ok(
    lineCount("../src/shell/material-library-view.tsx") <= 800,
    `material-library-view.tsx 有 ${lineCount("../src/shell/material-library-view.tsx")} 行`,
  );
  assert.ok(
    lineCount("../src/shell/ExplorePage.tsx") <= 800,
    `ExplorePage.tsx 有 ${lineCount("../src/shell/ExplorePage.tsx")} 行`,
  );
});

test("settle 之后：标题交给货架，副标题不在 DOM 里", () => {
  registerSiteAppDirectory("word", WORD_APPS);
  const html = renderToStaticMarkup(
    createElement(ExplorePage, { siteKey: "word" }),
  );
  assert.match(html, /data-explore-shape="zero-config"/);
  assert.match(html, /data-workspace-library="true"/);
  assert.match(html, /data-page-title="探索 · 素材"/);
  assert.match(html, /探索 · 素材/);
  assert.match(html, /pt-3/);
  assert.doesNotMatch(html, /py-7/);
  assert.doesNotMatch(html, /text-\[22px\]/);
  assert.doesNotMatch(html, /按工作台场景浏览/);
});
