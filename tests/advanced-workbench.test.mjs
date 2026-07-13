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
  assert.match(structured, /保存新版本到我的库/);
  assert.match(structured, /下载 Markdown/);
  assert.match(structured, /下载 CSV/);
});

test("advanced Agent follows the current task instead of forking history", () => {
  const panel = source("../src/shell/AdvancedAgentPanel.tsx");
  assert.match(panel, /setActiveTaskId\(taskId \|\| ""\)/);
  assert.match(panel, /followUp\(activeTaskId, context\)/);
});

test("cloud browser can be opened directly and still supports takeover", () => {
  const panel = source("../src/shell/CloudBrowserPanel.tsx");
  const client = source("../src/lib/browser.ts");
  assert.match(panel, /createCloudBrowser\(url, effectiveTaskId \|\| undefined\)/);
  assert.match(panel, /driving \? "release" : "takeover"/);
  assert.match(client, /export function createCloudBrowser/);
});
