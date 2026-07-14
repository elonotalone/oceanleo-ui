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

test("AppShell keeps the first three entries outside the only scroll region", () => {
  assert.match(appShell, /pinnedNavCount = 3/);
  assert.match(appShell, /data-oceanleo-pinned-nav/);
  assert.match(appShell, /data-oceanleo-scroll-nav/);
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
