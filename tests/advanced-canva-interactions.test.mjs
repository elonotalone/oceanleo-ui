import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("advanced editor surfaces use semantic theme tokens", () => {
  const themed = [
    "../src/shell/AdvancedAgentPanel.tsx",
    "../src/shell/AdvancedFeaturePages.tsx",
    "../src/shell/AdvancedTasks.tsx",
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

test("context-only drawers remain reachable from the object property bar", () => {
  const deck = source("../src/shell/advanced-routes/DeckRoute.tsx");
  const image = source("../src/shell/advanced-routes/ImageRoute.tsx");
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
    "image-create",
    "image-layers",
    "image-canvas",
    "image-export",
  ]) {
    assert.match(imageToolbar, new RegExp(`panelId: "${drawer}"`));
  }
  for (const toolbar of [deckToolbar, imageToolbar, richToolbar]) {
    assert.doesNotMatch(toolbar, /id: "undo"/);
    assert.doesNotMatch(toolbar, /id: "redo"/);
  }
});
