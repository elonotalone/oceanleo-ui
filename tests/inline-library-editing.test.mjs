import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("library items open in the fixed main canvas without advanced navigation", () => {
  const library = source("../src/shell/WorkspaceLibrary.tsx");
  const canvas = source("../src/shell/ResultCanvas.tsx");
  assert.match(library, /onOpenEntry\(entry\)/);
  assert.doesNotMatch(library, /<AdvancedContentWorkbench/);
  assert.match(canvas, /<AdvancedContentWorkbench/);
  assert.match(canvas, /embedded/);
  assert.match(canvas, /<WorkspaceEntryCanvas/);
  assert.doesNotMatch(library, /advancedFeatureHrefForItem/);
  assert.doesNotMatch(library, /router\.push\(href\)/);
});

test("library docking changes semantic content without swapping physical panes", () => {
  const split = source("../src/shell/SplitWorkspace.tsx");
  assert.match(split, /libraryDock/);
  assert.match(split, /onDockChange/);
  assert.match(split, /showDetail/);
  assert.match(split, /clearDetail/);
  assert.match(split, /\{\[appPane, divider, libraryPane\]\}/);
  assert.match(split, /Keep every left-panel runtime mounted/);
  assert.match(split, /onPointerMove/);
  assert.match(split, /libraryDockMovedRef/);
  assert.match(split, /放到左栏/);
  assert.match(split, /放回右栏/);
  assert.match(split, /event\.detail !== 0/);
  assert.doesNotMatch(split, /onClick=\{\(\) => setLibraryDock\("left"\)\}/);
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

test("generated and material slots never wrap legacy container tabs as fake cards", () => {
  const canvas = source("../src/shell/ResultCanvas.tsx");
  assert.match(canvas, /previewPanelTabs/);
  assert.match(canvas, /\{selectedPreviewTab\.content\}/);
  assert.match(
    canvas,
    /grouped\.preview[\s\S]*?flatMap\(\(tab\)[\s\S]*?tab\.entries\?\.length[\s\S]*?tab\.libraryItem/,
  );
  assert.match(
    canvas,
    /extractedMaterialItems\(tab\)\.length === 0 &&[\s\S]*?Boolean\(tab\.libraryItem\)/,
  );
  assert.doesNotMatch(canvas, /workflowEntries/);
});

test("tool bars stay single-line and move overflow into semantic panels", () => {
  const toolbar = source("../src/shell/SelectionToolbar.tsx");
  const embedded = source("../src/shell/advanced-routes/EmbeddedRoute.tsx");
  const image = source(
    "../src/shell/image-editor/FabricImageContextToolbar.tsx",
  );
  assert.match(toolbar, /if \(!context && !leading && !trailing\) return null/);
  assert.match(toolbar, /flex-nowrap items-center/);
  assert.match(toolbar, /selectionToolbarBudget\(toolbarWidth\)/);
  assert.match(toolbar, /layout\.openTransientPanel/);
  assert.doesNotMatch(toolbar, /max-w-\[min\(52vw,38rem\)\]/);
  assert.doesNotMatch(toolbar, /overflow-x-auto/);
  assert.match(
    image,
    /if \(!selected\) return null/,
  );
  assert.match(embedded, /hostedMediaType === "canvas"/);
  assert.match(embedded, /hostedMediaType === "video_canvas"/);
  assert.match(embedded, /selection\.id === "design-canvas"/);
});

test("normal apps call the result area generation and no advanced task surface remains", () => {
  const canvas = source("../src/shell/ResultCanvas.tsx");
  const shell = source("../src/shell/InlineAdvancedWorkbenchShell.tsx");
  assert.match(canvas, /preview: "生成"/);
  assert.doesNotMatch(shell, /id: "tasks"/);
  assert.doesNotMatch(shell, /id: "uploads"/);
});
