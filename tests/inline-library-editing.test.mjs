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

test("fixed library buttons replace left semantic content without draggable docking", () => {
  const split = source("../src/shell/SplitWorkspace.tsx");
  assert.match(split, /registerLibraryPanel/);
  assert.match(split, /openLibraryPanel/);
  assert.match(split, /activeLibraryPanelId/);
  assert.match(split, /WorkspaceLibraryPanelId/);
  assert.match(split, /showDetail/);
  assert.match(split, /clearDetail/);
  assert.match(split, /\{\[appPane, divider, libraryPane\]\}/);
  assert.match(split, /Keep every left-panel runtime mounted/);
  assert.doesNotMatch(
    split,
    /libraryDockMovedRef|libraryDockStartXRef|libraryDockDragging|放到左栏|放回右栏/,
  );
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

test("workspace actions expose both static libraries and opaque fullscreen chrome", () => {
  const actionBar = source("../src/shell/AdvancedWorkspaceActionBar.tsx");
  const canvas = source("../src/shell/ResultCanvas.tsx");
  const theme = source("../src/theme/globals.css");
  assert.match(actionBar, /data-advanced-workspace-actions/);
  assert.match(actionBar, /onOpenLibrary\("materials"\)/);
  assert.match(actionBar, /onOpenLibrary\("mine"\)/);
  assert.match(actionBar, /tt\("素材库"\)/);
  assert.match(actionBar, /tt\("我的库"\)/);
  assert.match(canvas, /registerLibraryPanel\("materials"/);
  assert.match(canvas, /registerLibraryPanel\("mine"/);
  assert.match(theme, /\[data-workspace-split\]:fullscreen::backdrop/);
  assert.match(theme, /height: 100vh !important/);
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
  const toolbar =
    source("../src/shell/SelectionToolbar.tsx") +
    source("../src/shell/SelectionToolbarSelectControl.tsx") +
    source("../src/shell/selection-inspector-host.tsx");
  const embedded = source("../src/shell/advanced-routes/EmbeddedRoute.tsx");
  const image = source(
    "../src/shell/image-editor/FabricImageContextToolbar.tsx",
  );
  assert.match(toolbar, /if \(!context && !leading && !trailing\) return null/);
  assert.match(toolbar, /flex-nowrap items-center/);
  assert.match(toolbar, /partitionSelectionControls/);
  assert.match(toolbar, /SELECTION_TOOLBAR_MAX_WIDTH/);
  assert.match(toolbar, /role="dialog"/);
  assert.match(toolbar, /event\.key === "Escape"/);
  assert.doesNotMatch(toolbar, /selectionToolbarBudget/);
  assert.match(toolbar, /openTransientPanel/);
  assert.doesNotMatch(toolbar, /max-w-\[min\(52vw,38rem\)\]/);
  assert.doesNotMatch(toolbar, /overflow-x-auto/);
  assert.match(image, /if \(!selected\) return null/);
  assert.match(image, /kind: selected\.kind/);
  assert.doesNotMatch(image, /tt\("创建与编辑"\)/);
  assert.match(embedded, /hostedMediaType === "canvas"/);
  assert.match(embedded, /hostedMediaType === "video_canvas"/);
  assert.doesNotMatch(embedded, /selection\.id === "design-canvas"/);
});

test("normal apps call the result area generation and no advanced task surface remains", () => {
  const canvas = source("../src/shell/ResultCanvas.tsx");
  const shell = source("../src/shell/InlineAdvancedWorkbenchShell.tsx");
  assert.match(canvas, /preview: "生成"/);
  assert.doesNotMatch(shell, /id: "tasks"/);
  assert.doesNotMatch(shell, /id: "uploads"/);
});
