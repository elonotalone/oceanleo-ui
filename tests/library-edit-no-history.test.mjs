// ============================================================================
// DEV-U6 —— 网站素材从门户库编辑不进 /history
// ----------------------------------------------------------------------------
// 真机：门户 /library 点「投资咨询企业官网」的「编辑」，地址变成
// /history/c19785ed-…，页上写「该工作会话所属网站已下线」。
//
// 合同：全页库（plain、无 app）按类型就地打开编辑器；落点不得是 /history/<id>；
// 会话不得绑项目 UUID / 门户宿主键去给门户 history 页当回看身份。
// ============================================================================

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isFullPageLibraryEditHost,
  isHistorySessionPath,
  isUnmountablePortalHistorySiteId,
  libraryEditLanding,
  libraryStandaloneEditorBinding,
  resolveLibraryEditRoute,
} from "../src/shell/library-edit-landing.ts";

const source = (rel) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

const DEAD_HISTORY = "/history/c19785ed-aaaa-4bbb-8ccc-ddddeeeeffff";
const WEBSITE_OWNING_HREF =
  "/workspace/website?tab=materials&item=art-consult&mode=preview";

test("网站素材从门户库编辑不进 /history", () => {
  const host = { appId: "", plain: true };
  assert.equal(isFullPageLibraryEditHost(host), true);
  assert.equal(resolveLibraryEditRoute("deep-link", host), "in-place");
  assert.equal(resolveLibraryEditRoute("none", host), "none");

  const landing = libraryEditLanding("deep-link", host, WEBSITE_OWNING_HREF);
  assert.equal(landing.kind, "typed-editor");
  assert.equal(landing.href, null);
  assert.equal(isHistorySessionPath(DEAD_HISTORY), true);
  assert.ok(
    !landing.href || !isHistorySessionPath(landing.href),
    "门户库编辑落点不得是 /history/<session>",
  );

  const slides = libraryEditLanding("deep-link", host, DEAD_HISTORY);
  assert.equal(slides.kind, "typed-editor");
  assert.equal(slides.href, null);
});

test("站内工作台跨 app 深链仍去归属工作台，只是不许落成 /history/", () => {
  const workbench = { appId: "ppt-studio", plain: false };
  assert.equal(isFullPageLibraryEditHost(workbench), false);
  assert.equal(resolveLibraryEditRoute("deep-link", workbench), "deep-link");

  const ok = libraryEditLanding("deep-link", workbench, WEBSITE_OWNING_HREF);
  assert.equal(ok.kind, "owning-workbench");
  assert.equal(ok.href, WEBSITE_OWNING_HREF);

  const rejected = libraryEditLanding("deep-link", workbench, DEAD_HISTORY);
  assert.equal(rejected.kind, "typed-editor");
  assert.equal(rejected.href, null);
});

test("explore 无 app 且非全页库时深链判据不变", () => {
  const explore = { appId: "", plain: false };
  assert.equal(isFullPageLibraryEditHost(explore), false);
  assert.equal(resolveLibraryEditRoute("deep-link", explore), "deep-link");
});

test("门户库就地编辑不绑对不上清册的 site_id", () => {
  assert.equal(isUnmountablePortalHistorySiteId(""), true);
  assert.equal(isUnmountablePortalHistorySiteId("oceanleo"), true);
  assert.equal(isUnmountablePortalHistorySiteId("library"), true);
  assert.equal(
    isUnmountablePortalHistorySiteId("c19785ed-aaaa-4bbb-8ccc-ddddeeeeffff"),
    true,
  );
  assert.equal(isUnmountablePortalHistorySiteId("website"), false);
  assert.equal(isUnmountablePortalHistorySiteId("ppt"), false);

  const fromProject = libraryStandaloneEditorBinding({
    hostSiteId: "",
    itemSiteId: "c19785ed-aaaa-4bbb-8ccc-ddddeeeeffff",
  });
  assert.equal(fromProject.appId, "library");
  assert.equal(fromProject.siteId, "library");
  assert.notEqual(fromProject.siteId, "c19785ed-aaaa-4bbb-8ccc-ddddeeeeffff");

  const fromWebsite = libraryStandaloneEditorBinding({
    hostSiteId: "",
    itemSiteId: "website",
  });
  assert.deepEqual(fromWebsite, { siteId: "website", appId: "library" });
});

test("MyLibrary 全页库编辑走 libraryStandaloneEditorBinding，不再用 siteId 冒充 app", () => {
  const library = source("../src/shell/MyLibrary.tsx");
  assert.match(library, /libraryStandaloneEditorBinding/);
  assert.match(library, /siteId=\{editorBinding\.siteId\}/);
  assert.match(library, /appId=\{editorBinding\.appId\}/);
  assert.doesNotMatch(library, /appId=\{siteId \|\| "library"\}/);
  assert.doesNotMatch(
    library,
    /siteId=\{siteId \|\| standaloneEditorItem\.siteId\}/,
  );
});

test("WorkspaceLibrary 全页库把跨应用深链收成就地编辑", () => {
  const workspace = source("../src/shell/WorkspaceLibrary.tsx");
  assert.match(workspace, /resolveLibraryEditRoute/);
  assert.match(workspace, /hostEditRoute/);
  assert.match(workspace, /hostDetailPlan/);
  assert.match(workspace, /plan=\{hostDetailPlan\}/);
  assert.doesNotMatch(workspace, /historySessionHref/);
  assert.doesNotMatch(workspace, /router\.(push|replace)\([^)]*history/);
});

test("全页库就地工作台不得把 library 会话送去 /history/", () => {
  const workbench = source("../src/shell/AdvancedContentWorkbench.tsx");
  assert.match(workbench, /workspace\.appId === "library"/);
  assert.doesNotMatch(workbench, /historySessionHref/);
});
