import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mine = readFileSync(new URL("../src/shell/MyLibrary.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../../oceanleo/app/library/library-page-client.tsx", import.meta.url), "utf8");

test("Library removes Works overview and keeps file detail rendering", () => {
  assert.doesNotMatch(mine, /WorksOverview|data-library-work-tab-row|showWorks/);
  assert.match(mine, /<WorkspaceLibrary[\s\S]*onDetailOpenChange=\{setDetailOpen\}/);
});

test("full Library has one title upload trigger and two menu entries", () => {
  assert.match(mine, /data-library-upload-menu/);
  assert.match(mine, /tt\(uploading \? "上传中…" : "上传"\)/);
  assert.match(mine, /"上传文件"/);
  assert.match(mine, /tt\("上传文件夹"\)/);
  assert.match(page, /TaskWorkspaceShell/);
  assert.match(page, /useTaskWorkspaceState/);
  assert.match(page, /left=\{<ArtifactLibrary/);
});
