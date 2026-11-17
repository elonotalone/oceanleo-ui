import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("Fabric image editor exposes object, layer, filter, crop and durable-save tools", () => {
  const types = source("../src/shell/image-editor/types.ts");
  const controls = source("../src/shell/image-editor/FabricImageControls.tsx");
  const creationPanels = source(
    "../src/shell/image-editor/FabricImageCreationPanels.tsx",
  );
  const toolbar = source(
    "../src/shell/image-editor/fabric-image-toolbar-controls.ts",
  );
  const commands = source("../src/shell/image-editor/fabric-image-commands.ts");
  const stage = source("../src/shell/image-editor/FabricImageStage.tsx");
  const hook = source("../src/shell/image-editor/use-fabric-image-editor.ts");
  const controller = source("../src/shell/image-editor/fabric-controller.ts");
  for (const capability of [
    "addText",
    "addShape",
    "duplicateLayer",
    "setSelectedShadow",
    "setFilter",
    "startCrop",
    "undo",
    "redo",
  ]) {
    assert.match(types, new RegExp(capability));
  }
  assert.match(controls, /图层/);
  // 10-23 W09：调色与字体进编辑栏（adjust 面板、font-family 下拉），左侧两个抽屉删除。
  assert.doesNotMatch(controls, /FabricImageFilterPanel|FabricImageFontPanel/);
  assert.match(toolbar, /inspector\("adjust"/);
  assert.match(toolbar, /id: "font-family"/);
  assert.match(commands, /startCrop/);
  assert.match(commands, /setFilter/);
  assert.match(commands, /duplicateSelected/);
  assert.match(toolbar, /panelAction: "replace"/);
  assert.match(toolbar, /selected\.kind === "image"/);
  assert.match(creationPanels, /FabricImageShapePanel/);
  assert.match(creationPanels, /FabricImageTablePanel/);
  assert.match(creationPanels, /addSignatureFromSvg/);
  assert.match(creationPanels, /kind: "curve"/);
  assert.match(toolbar, /table-header-fill/);
  assert.match(commands, /setSelectedTableStyle/);
  assert.match(stage, /图片编辑画布/);
  assert.match(stage, /data-editor-unlocked-image-count/);
  assert.match(stage, /data-layer-id=\{preferredUnlockedImageId\}/);
  assert.match(stage, /data-editor-geometry-readback/);
  assert.match(stage, /data-selection-control-id=\{id\}/);
  assert.match(stage, /"position-x"/);
  assert.match(stage, /"object-width"/);
  assert.match(hook, /persistImageProject/);
  assert.doesNotMatch(hook, /saveLocalImageDraft/);
  assert.match(hook, /createFabricImageWorkingCopy/);
  assert.match(hook, /loadEditableImageProject/);
  assert.match(hook, /structuredSourceRequired/);
  assert.match(hook, /replaceSelectedImageFromUrl/);
  assert.match(controller, /replaceActiveImage/);
  assert.match(
    controller,
    /applyFilterSettings\([\s\S]*?readFilterSettings\(current\)/,
  );
  assert.match(hook, /onSaved/);
});

test("document editors cover rich text, workbooks and PPTX freeform decks", () => {
  const rich = source("../src/shell/doc-editors/use-rich-doc-editor.ts");
  // 表格只剩 Univer 舞台（core-swap:delete grid）；存盘走同一个 saveFileToLibrary。
  const grid = source("../src/shell/doc-editors/GridUniverStage.tsx");
  const deck = source("../src/shell/doc-editors/use-deck-editor.ts");
  const deckStage = source("../src/shell/doc-editors/DeckStage.tsx");
  const deckInteraction = source("../src/shell/doc-editors/use-deck-element-interaction.ts");
  const deckLayout = source(
    "../src/shell/doc-editors/DeckPreviewLayout.tsx",
  );
  const deckFit = source(
    "../src/shell/doc-editors/deck-preview-geometry.ts",
  );
  const wheelZoom = source("../src/shell/use-centered-wheel-zoom.ts");
  const deckElementContent = source(
    "../src/shell/doc-editors/DeckElementContent.tsx",
  );
  const deckControls = source("../src/shell/doc-editors/DeckControls.tsx");
  // 10-23 D9：字体抽屉、效果抽屉删了，字体是统一栏下拉，层级是规范 arrange 下拉。
  const deckBar = source("../src/shell/doc-editors/deck-edit-bar-controls.ts");
  const deckToolbar = source("../src/shell/doc-editors/use-deck-selection-adapter.ts");
  const deckToolbarCommand = source(
    "../src/shell/doc-editors/deck-toolbar-command.ts",
  );
  const deckGeometry = source("../src/shell/doc-editors/deck-geometry.ts");
  const deckSchema = source("../src/shell/doc-editors/deck-schema.ts");
  const pptxImport = source("../src/shell/doc-editors/pptx-deck-import.ts");
  assert.match(rich, /tiptapJsonToDocxBlob/);
  assert.match(rich, /saveFileToLibrary/);
  assert.match(grid, /buildGridXlsxFromUniverSnapshot/);
  assert.match(grid, /saveFileToLibrary/);
  assert.match(grid, /univerSnapshotToGridSheets/);
  assert.match(deck, /pptxgenjs/);
  assert.match(deck, /saveFileToLibrary/);
  assert.match(deck, /importPptxDeck/);
  assert.match(pptxImport, /pptxtojson\/dist\/index\.js/);
  assert.match(pptxImport, /imageMode: "base64"/);
  assert.match(deckStage, /PositionedSlideCanvas/);
  assert.match(deckStage, /startInteraction/);
  assert.match(deckElementContent, /contentEditable/);
  assert.match(deckElementContent, /onCommitCell/);
  assert.match(deckStage, /RESIZE_HANDLES/);
  assert.match(deckStage, /data-deck-canvas/);
  assert.match(deckStage, /useDeckElementInteraction\(editor\)/);
  assert.match(deckInteraction, /moveDeckElement\(/);
  assert.match(deckInteraction, /resizeDeckElement\(/);
  assert.match(deckInteraction, /rotateDeckElement\(/);
  assert.match(deckStage, /<DeckPreviewLayout/);
  assert.match(deckLayout, /useCenteredWheelZoom/);
  assert.match(deckLayout, /contentWidth: geometry\.width/);
  assert.match(deckLayout, /new ResizeObserver\(measure\)/);
  assert.match(deckLayout, /data-deck-page-frame/);
  assert.match(deckFit, /DECK_PREVIEW_FIT_ZOOM_PERCENT = 50/);
  assert.match(deckFit, /fitScale/);
  assert.match(wheelZoom, /addEventListener\("wheel", onWheel, \{ passive: false \}\)/);
  assert.match(wheelZoom, /requestAnimationFrame/);
  assert.match(wheelZoom, /Math\.exp\(-delta \* 0\.0025\)/);
  assert.match(wheelZoom, /viewport\.scrollLeft/);
  assert.match(deckControls, /DeckTextPanel/);
  assert.match(deckControls, /DeckElementsPanel/);
  assert.match(deckToolbar, /deckElementSelectionControls/);
  assert.match(deckBar, /canon\("font-family"\)[\s\S]*?kind: "select"/);
  assert.match(deckBar, /canon\("arrange"\)[\s\S]*?choices\("arrange"\)/);
  assert.match(deckBar, /panel\("adjust"\)/);
  assert.doesNotMatch(deckToolbar, /panelId: "deck-(?:effects|fonts)"/);
  assert.match(deckToolbarCommand, /deckArrangedElements/);
  assert.doesNotMatch(deckToolbarCommand, /applySlideLayout/);
  assert.match(deckGeometry, /moveDeckElement/);
  assert.match(deckGeometry, /resizeDeckElement/);
  assert.match(deckGeometry, /rotateDeckElement/);
  assert.match(deckSchema, /elements: normalizedElements/);
  assert.match(deckSchema, /layout: "blank"/);
  assert.doesNotMatch(deckSchema, /legacySlideElements/);
});

test("timeline preview uses the same transition semantics as export", () => {
  const preview = source("../src/shell/video-editor/preview-engine.ts");
  assert.match(preview, /blackTransitionAlpha/);
  assert.match(preview, /clip\.transition_in\?\.type === "black"/);
  assert.match(preview, /type === "fade" \|\| type === "crossfade"/);
});
