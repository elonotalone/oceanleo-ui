import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appShell = readFileSync(
  new URL("../src/shell/AppShell.tsx", import.meta.url),
  "utf8",
);
const workspacePages = readFileSync(
  new URL("../src/shell/WorkspacePages.tsx", import.meta.url),
  "utf8",
);
const artifactLibrary = readFileSync(
  new URL("../src/shell/ArtifactLibrary.tsx", import.meta.url),
  "utf8",
);
const fileLibrary = readFileSync(
  new URL("../src/shell/FileLibrary.tsx", import.meta.url),
  "utf8",
);

// 2026-08-07：这条原本钉的是「前三项固定、其余跟着历史一起滚」（`pinnedNavCount = 3`）。
// 操作员把侧栏行为改成了两类 —— 一类要**全部**导航键都不动，一类要**整条**侧栏一起动 ——
// 数字旋钮表达不了，换成 `sidebarScroll` 枚举。断言跟着换成新行为，**没有放宽**：
// 「固定区与滚动区各自存在」这件事仍然钉着，包含关系由
// `tests/sidebar-scroll-scope.test.mjs` 真渲一遍来判。
test("AppShell 的滚动范围是一个说得清的枚举，默认导航键不动", () => {
  assert.match(appShell, /export type ShellSidebarScroll = "history" \| "whole"/);
  assert.match(
    appShell,
    /WHOLE_SCROLL_SIDEBAR_SITES = new Set\(\["asset", "aitools"\]\)/,
  );
  assert.match(appShell, /\? "whole"\s*:\s*"history"\)/);
  assert.match(appShell, /data-oceanleo-pinned-nav/);
  assert.match(appShell, /data-oceanleo-scroll-nav/);
  assert.match(appShell, /data-oceanleo-pinned-account/);
  // 旧旋钮不许还在起作用：留着字段是为了旧消费端不必锁步发布，取值一律忽略。
  assert.doesNotMatch(appShell, /pinnedNavCount = 3/);
  assert.doesNotMatch(appShell, /pinnedNav\.slice|Math\.min\(pinnedNavCount/);
  assert.doesNotMatch(appShell, /activeSubItem|setSubNavOverride|closeSubNav/);
});

test("nested page shells unwrap under one persistent layout shell", () => {
  assert.match(appShell, /const AppShellPresence = createContext\(false\)/);
  assert.match(appShell, /if \(nested\) return <>\{props\.children\}<\/>/);
});

test("My Tasks is an inline disclosure and subsite home means New", () => {
  assert.match(workspacePages, /home: "新建"/);
  assert.match(workspacePages, /p === "history" \? opts\.subNav\?\.history/);
  assert.match(workspacePages, /defaultOpen: true/);
  assert.doesNotMatch(workspacePages, /subNav: opts\.subNav\?\.\[p\]/);
});

test("file categories and legacy tabs always render in the main page", () => {
  assert.match(artifactLibrary, /v5：文件类型永远在右侧页面顶部横排/);
  assert.doesNotMatch(
    artifactLibrary,
    /controlledFilter === undefined && \(\s*<LibraryChips/,
  );
  assert.match(fileLibrary, /<div className="flex gap-1 rounded-xl bg-stone-100 p-1">/);
  assert.doesNotMatch(
    fileLibrary,
    /!hideHeader && \(\s*<div className="flex gap-1 rounded-xl bg-stone-100 p-1">/,
  );
});

test("every FileLibrary panel offers a retry action in its error state", () => {
  assert.equal(
    fileLibrary.split("onRetry={").length - 1,
    4,
    "FilesPanel, WorksPanel, AssetsPanel and KnowledgePanel each wire onRetry",
  );
  assert.match(fileLibrary, /onRetry\?: \(\) => void/);
  assert.match(fileLibrary, /\{tt\("重试"\)\}/);
});
