import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mine = readFileSync(new URL("../src/shell/MyLibrary.tsx", import.meta.url), "utf8");
  const serverItem = readFileSync(new URL("../src/shell/works/server-work-item.ts", import.meta.url), "utf8");
import { siblingRepoUrl } from "./helpers/sibling-repo-url.mjs";
const page = readFileSync(siblingRepoUrl("oceanleo", "app/library/page.tsx"), "utf8");

test("Library removes Works overview and keeps file detail rendering", () => {
  assert.doesNotMatch(mine, /WorksOverview|data-library-work-tab-row|showWorks/);
  assert.match(mine, /<WorkspaceLibrary[\s\S]*onDetailOpenChange=\{setDetailOpen\}/);
});

test("full Library has one title upload trigger and Library import entries", () => {
  assert.match(mine, /data-library-upload-menu/);
  assert.match(mine, /tt\(uploading \? "上传中…" : "上传"\)/);
  assert.match(mine, /"上传文件"/);
  assert.match(mine, /tt\("上传文件夹"\)/);
  assert.match(mine, /tt\("从我的电脑添加"\)/);
  assert.match(mine, /tt\("从 GitHub 导入"\)/);
  assert.match(page, /CloneShell/);
  assert.match(page, /<ArtifactLibrary accent=\{LIBRARY_ACCENT\}/);
  assert.doesNotMatch(page, /TaskWorkspaceShell|useTaskWorkspaceState/);
});

test("server works are merged into the first My creations page", () => {
  assert.match(mine, /serverWorkLibraryItem/);
  assert.match(mine, /serverWorkItemsFromPage\(mineResult, \{\s*offset: 0/);
  assert.match(mine, /\[\.\.\.serverWorkItems, \.\.\.mineResult\.data\.items\]/);
  assert.match(mine, /offset !== 0/);
  assert.match(mine, /source !== "creation"/);
  assert.match(serverItem, /server-work:/);
});
