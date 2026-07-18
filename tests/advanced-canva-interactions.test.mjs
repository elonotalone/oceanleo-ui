import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("advanced editor surfaces use semantic theme tokens", () => {
  const themed = [
    "../src/shell/AdvancedFeaturePages.tsx",
    "../src/shell/InlineAdvancedWorkbenchShell.tsx",
    "../src/shell/InlineEditorMaterialPanel.tsx",
    "../src/shell/WorkspaceLibrary.tsx",
    "../src/shell/MaterialLibrary.tsx",
    "../src/shell/LibraryLayout.tsx",
    "../src/shell/doc-editors/RichDocEditor.tsx",
    "../src/shell/doc-editors/GridEditor.tsx",
    "../src/shell/doc-editors/GridStage.tsx",
    "../src/shell/video-editor/VideoTimelineEditor.tsx",
    "../src/shell/video-editor/TimelineArea.tsx",
    "../src/shell/media-editors/PdfWorkbench.tsx",
    "../src/shell/media-editors/Model3DWorkbench.tsx",
    "../src/shell/workbench-embed.tsx",
  ];
  const hardcodedSurface =
    /\b(?:bg-white|bg-stone-\d+|text-stone-\d+|border-stone-\d+|bg-neutral-\d+|text-neutral-\d+|border-neutral-\d+)\b/;
  for (const path of themed) {
    assert.doesNotMatch(source(path), hardcodedSurface, path);
  }
});

test("large Canva workbench components stay split below the frontend limit", () => {
  for (const path of [
    "../src/shell/AdvancedWorkbenchShell.tsx",
    "../src/shell/doc-editors/DeckStage.tsx",
    "../src/shell/doc-editors/DeckControls.tsx",
    "../src/shell/doc-editors/DeckContextToolbar.tsx",
    "../src/shell/image-editor/FabricImageContextToolbar.tsx",
  ]) {
    const lines = source(path).split("\n").length;
    assert.ok(lines < 600, `${path} has ${lines} lines`);
  }
});

test("creation drawers stay in fixed tools while object bars stay contextual", () => {
  const deck = source("../src/shell/advanced-routes/DeckRoute.tsx");
  const image = source("../src/shell/advanced-routes/ImageRoute.tsx");
  const shell = source("../src/shell/InlineAdvancedWorkbenchShell.tsx");
  const deckToolbar = source(
    "../src/shell/doc-editors/DeckContextToolbar.tsx",
  );
  const imageToolbar = source(
    "../src/shell/image-editor/FabricImageContextToolbar.tsx",
  );
  const richToolbar = source(
    "../src/shell/doc-editors/RichDocContextToolbar.tsx",
  );
  assert.match(deck, /id: "deck-effects"[\s\S]*?hiddenFromRail: true/);
  assert.match(deck, /id: "deck-fonts"[\s\S]*?hiddenFromRail: true/);
  assert.match(image, /id: "image-filters"[\s\S]*?hiddenFromRail: true/);
  assert.match(image, /id: "image-fonts"[\s\S]*?hiddenFromRail: true/);
  assert.match(deckToolbar, /panelId: "deck-fonts"/);
  assert.match(imageToolbar, /panelId: "image-filters"/);
  for (const drawer of [
    "image-brush",
    "image-shapes",
    "image-lines",
    "image-notes",
    "image-text",
    "image-signature",
    "image-tables",
    "image-layers",
  ]) {
    assert.match(image, new RegExp(`id: "${drawer}"`));
    assert.doesNotMatch(imageToolbar, new RegExp(`panelId: "${drawer}"`));
  }
  assert.match(shell, /drawers\.map\(\(drawer\) =>/);
  assert.match(shell, /<AdvancedWorkspaceActionBar/);
  assert.doesNotMatch(deckToolbar, /deckQuickTools|applyDeckQuickTool/);
  assert.match(
    image,
    /id: "image-export"[\s\S]*?panelId: "image-export"/,
  );
  for (const toolbar of [deckToolbar, imageToolbar, richToolbar]) {
    assert.doesNotMatch(toolbar, /id: "undo"/);
    assert.doesNotMatch(toolbar, /id: "redo"/);
  }
});

test("advanced editors autosave projects and reserve header actions for delivery", () => {
  const header = source("../src/shell/AdvancedWorkspaceActionBar.tsx");
  const autosave = source("../src/shell/use-advanced-autosave.ts");
  const imageHook = source(
    "../src/shell/image-editor/use-fabric-image-editor.ts",
  );
  const imagePersistence = source(
    "../src/shell/image-editor/editor-persistence.ts",
  );
  assert.match(header, /正在自动保存/);
  assert.match(header, /CloudAutoSaveIcon/);
  assert.match(header, /tt\("已保存"\)/);
  assert.doesNotMatch(header, /已自动保存/);
  assert.match(header, /保存遇到问题/);
  assert.match(autosave, /AdvancedPersistenceController/);
  assert.match(autosave, /controllerRef\.current\?\.observe/);
  assert.match(autosave, /controllerRef\.current\?\.flushLatest/);
  assert.doesNotMatch(autosave, /pendingItemRef|runningRef|queuedRef/);
  assert.match(imagePersistence, /persistImageProject/);
  assert.match(imagePersistence, /fabric_document_url/);
  assert.match(imageHook, /uploadFile\(file/);
  assert.doesNotMatch(imageHook, /URL\.createObjectURL\(file\)/);

  for (const [path, manualSaveCall] of [
    ["../src/shell/chart-editor/ChartControls.tsx", /editor\.save\(\)/],
    ["../src/shell/media-editors/PdfControls.tsx", /editor\.saveCopy\(\)/],
    ["../src/shell/media-editors/Model3DControls.tsx", /editor\.saveCopy\(\)/],
    [
      "../src/shell/video-editor/VideoTimelineControls.tsx",
      /state\.saveDraft\(\)/,
    ],
  ]) {
    assert.doesNotMatch(source(path), manualSaveCall, path);
  }
});
