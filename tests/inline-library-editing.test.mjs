import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("library items open typed editors in place without advanced navigation", () => {
  const library = source("../src/shell/WorkspaceLibrary.tsx");
  assert.match(library, /<AdvancedContentWorkbench/);
  assert.match(library, /embedded/);
  assert.doesNotMatch(library, /advancedFeatureHrefForItem/);
  assert.doesNotMatch(library, /router\.push\(href\)/);
});

test("the library can dock on either side while preserving the app pane", () => {
  const split = source("../src/shell/SplitWorkspace.tsx");
  assert.match(split, /libraryDock/);
  assert.match(split, /onDockChange/);
  assert.match(split, /showDetail/);
  assert.match(split, /clearDetail/);
  assert.match(split, /hidden[\s\S]*left/);
});

test("editor tools exist only inside an opened item and delegate details to the app pane", () => {
  const shell = source("../src/shell/AdvancedWorkbenchShell.tsx");
  const inline = source("../src/shell/InlineAdvancedWorkbenchShell.tsx");
  assert.match(shell, /<InlineAdvancedWorkbenchShell/);
  assert.match(inline, /workspacePane/);
  assert.match(inline, /showDetail/);
  assert.match(inline, /clearDetail/);
  assert.match(inline, /data-inline-editor/);
});

test("normal apps call the result area generation and no advanced task surface remains", () => {
  const canvas = source("../src/shell/ResultCanvas.tsx");
  const shell = source("../src/shell/InlineAdvancedWorkbenchShell.tsx");
  assert.match(canvas, /preview: "生成"/);
  assert.doesNotMatch(shell, /id: "tasks"/);
  assert.doesNotMatch(shell, /id: "uploads"/);
});
