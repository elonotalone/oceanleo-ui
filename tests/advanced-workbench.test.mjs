import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("every workspace detail exposes the full-screen advanced workbench", () => {
  const library = source("../src/shell/WorkspaceLibrary.tsx");
  assert.match(library, /const workbenchItem: LibraryItem/);
  assert.match(library, /setAdvancedOpen\(true\)/);
  assert.match(library, /previewContent=\{selected\.content\}/);
  assert.doesNotMatch(
    library,
    /\{selected\.libraryItem && \(\s*<button[\s\S]*?高级功能/,
  );
});

test("advanced workbench keeps Agent first and supports native rich editors", () => {
  const workbench = source("../src/shell/AdvancedContentWorkbench.tsx");
  const structured = source("../src/shell/AdvancedStructuredEditors.tsx");
  assert.match(workbench, /\{ id: "agent", label: tt\("Agent"\) \}/);
  assert.match(workbench, /onPointerDown=\{beginResize\}/);
  assert.match(workbench, /ImageWorkbenchCanvas/);
  assert.match(workbench, /TextWorkbenchCanvas/);
  assert.match(workbench, /SheetWorkbenchCanvas/);
  assert.match(workbench, /item\.siteId === "asset"/);
  assert.match(workbench, /sheetEditor\.saveRevision/);
  assert.match(structured, /保存新版本到我的库/);
  assert.match(structured, /下载 Markdown/);
  assert.match(structured, /下载 CSV/);
});

test("advanced Agent follows the current task instead of forking history", () => {
  const panel = source("../src/shell/AdvancedAgentPanel.tsx");
  const canvas = source("../src/shell/ResultCanvas.tsx");
  assert.match(panel, /setActiveTaskId\(taskId \|\| ""\)/);
  assert.match(panel, /followUp\(activeTaskId, context\)/);
  assert.match(canvas, /taskId \|\| workspaceSession\?\.taskId \|\| null/);
  assert.match(canvas, /taskId=\{effectiveTaskId\}/);
});

test("cloud browser can be opened directly and still supports takeover", () => {
  const panel = source("../src/shell/CloudBrowserPanel.tsx");
  const client = source("../src/lib/browser.ts");
  assert.match(panel, /createCloudBrowser\(url, effectiveTaskId \|\| undefined\)/);
  assert.match(panel, /reload\(session\.id\)/);
  assert.match(panel, /driving \? "release" : "takeover"/);
  assert.match(client, /export function createCloudBrowser/);
});

test("full-page library and right workspace share the heterogeneous My Library", () => {
  const artifacts = source("../src/shell/ArtifactLibrary.tsx");
  const mine = source("../src/shell/MyLibrary.tsx");
  assert.match(artifacts, /<MyLibrary/);
  assert.match(artifacts, /作品、网站、任务交付物和上传文件统一保存在这里/);
  assert.match(mine, /getDatabaseOverview/);
  assert.match(mine, /onlyFavorites/);
});

test("embedded workspaces keep SSR and hydration snapshots identical", () => {
  const embed = source("../src/lib/embed.ts");
  assert.match(embed, /useSyncExternalStore\(subscribeUrlFlags, isEmbed, serverFlag\)/);
  assert.match(embed, /useSyncExternalStore\(subscribeUrlFlags, isSolo, serverFlag\)/);
  assert.match(embed, /function serverFlag\(\): boolean \{\s*return false;/);
  assert.doesNotMatch(embed, /useState<boolean>\(\(\) => isEmbed\(\)\)/);
});
