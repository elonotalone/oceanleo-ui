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
  const toolbar = source("../src/shell/image-editor/FabricImageContextToolbar.tsx");
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
  assert.match(controls, /FabricImageFilterPanel/);
  assert.match(controls, /FabricImageFontPanel/);
  assert.match(commands, /startCrop/);
  assert.match(commands, /setFilter/);
  assert.match(commands, /duplicateSelected/);
  assert.match(toolbar, /panelId: "image-filters"/);
  assert.match(toolbar, /panelAction: "replace"/);
  assert.match(toolbar, /selected\.kind === "image"/);
  assert.match(creationPanels, /FabricImageShapePanel/);
  assert.match(creationPanels, /FabricImageTablePanel/);
  assert.match(creationPanels, /addSignatureFromSvg/);
  assert.match(creationPanels, /kind: "curve"/);
  assert.match(toolbar, /table-header-fill/);
  assert.match(commands, /setSelectedTableStyle/);
  assert.match(stage, /图片编辑画布/);
  assert.match(hook, /persistImageProject/);
  assert.match(hook, /saveLocalImageDraft/);
  assert.match(hook, /loadImageProject/);
  assert.match(hook, /replaceSelectedImageFromUrl/);
  assert.match(controller, /replaceActiveImage/);
  assert.match(
    controller,
    /applyFilterSettings\([\s\S]*?readFilterSettings\(current\)/,
  );
  assert.match(hook, /onSaved/);
});

test("structured document editors cover rich text, workbooks and editable decks", () => {
  const rich = source("../src/shell/doc-editors/use-rich-doc-editor.ts");
  const grid = source("../src/shell/doc-editors/use-grid-editor.ts");
  const deck = source("../src/shell/doc-editors/use-deck-editor.ts");
  const deckStage = source("../src/shell/doc-editors/DeckStage.tsx");
  const deckElementContent = source(
    "../src/shell/doc-editors/DeckElementContent.tsx",
  );
  const deckControls = source("../src/shell/doc-editors/DeckControls.tsx");
  const deckFonts = source("../src/shell/doc-editors/DeckFontPanel.tsx");
  const deckToolbar = source("../src/shell/doc-editors/DeckContextToolbar.tsx");
  const deckToolbarCommand = source(
    "../src/shell/doc-editors/deck-toolbar-command.ts",
  );
  const deckGeometry = source("../src/shell/doc-editors/deck-geometry.ts");
  const deckSchema = source("../src/shell/doc-editors/deck-schema.ts");
  const pptxImport = source("../src/shell/doc-editors/pptx-deck-import.ts");
  assert.match(rich, /saveFileToLibrary/);
  assert.match(grid, /buildGridWorkbookBlob/);
  assert.match(grid, /gridSelectionRange/);
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
  assert.match(deckStage, /rotateDeckElement/);
  assert.match(deckControls, /DeckTextPanel/);
  assert.match(deckControls, /DeckElementsPanel/);
  assert.match(deckFonts, /DeckFontPanel/);
  assert.match(deckToolbar, /上移一层/);
  assert.match(deckToolbar, /panelId: "deck-effects"/);
  assert.match(deckToolbar, /panelId: "deck-fonts"/);
  assert.match(deckToolbarCommand, /applySlideLayout/);
  assert.match(deckGeometry, /moveDeckElement/);
  assert.match(deckGeometry, /resizeDeckElement/);
  assert.match(deckGeometry, /rotateDeckElement/);
  assert.match(deckSchema, /legacySlideElements/);
  assert.match(deckSchema, /normalizedElements\.length > 0/);
});

test("native editors preserve history and never clear newer unsaved revisions", () => {
  const shell = source("../src/shell/InlineAdvancedWorkbenchShell.tsx");
  const rich = source("../src/shell/doc-editors/use-rich-doc-editor.ts");
  const grid = source("../src/shell/doc-editors/use-grid-editor.ts");
  const deck = source("../src/shell/doc-editors/use-deck-editor.ts");
  const image = source("../src/shell/image-editor/use-fabric-image-editor.ts");
  const audio = source("../src/shell/media-editors/AudioWorkbench.tsx");
  const pdf = source("../src/shell/media-editors/use-pdf-workbench.ts");
  const timeline = source("../src/shell/video-editor/use-video-timeline.ts");

  assert.match(shell, /useState\(""\)/);
  assert.match(shell, /activeDrawerId/);
  assert.match(shell, /beforeunload/);
  assert.match(shell, /handleDrop/);
  assert.match(shell, /source: "drop"/);
  assert.match(shell, /修改仍安全保留在当前编辑器，但尚未同步到云端/);
  assert.match(shell, /useAdvancedRecovery/);
  for (const editor of [rich, grid, deck, image, audio, pdf, timeline]) {
    assert.match(editor, /revisionRef/);
    assert.match(editor, /setDirty\(true\)/);
    assert.match(editor, /revisionRef\.current === savingRevision/);
  }
  assert.match(audio, /canRedo/);
  assert.match(audio, /const redo = useCallback/);
  assert.match(pdf, /const undo = useCallback/);
  assert.match(pdf, /const redo = useCallback/);
  assert.match(deck, /\.pptx/);
  assert.match(
    deck,
    /application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation/,
  );
});

test("timeline preview uses the same transition semantics as export", () => {
  const preview = source("../src/shell/video-editor/preview-engine.ts");
  assert.match(preview, /blackTransitionAlpha/);
  assert.match(preview, /clip\.transition_in\?\.type === "black"/);
  assert.match(preview, /type === "fade" \|\| type === "crossfade"/);
});

test("media editors expose usable first-draft surfaces without a source URL", () => {
  const audio = source("../src/shell/media-editors/AudioWorkbench.tsx");
  const pdf = source("../src/shell/media-editors/use-pdf-workbench.ts");
  const pdfOperations = source("../src/shell/media-editors/pdf-operations.ts");
  const pdfSource = source("../src/shell/media-editors/pdf-source.ts");
  const model =
    source("../src/shell/media-editors/use-model3d-workbench.ts") +
    source("../src/shell/media-editors/model3d-workbench-state.ts");
  const modelControls = source("../src/shell/media-editors/Model3DControls.tsx");
  const modelStage = source("../src/shell/media-editors/Model3DStage.tsx");
  assert.match(audio, /new AudioBuffer\(\{/);
  assert.match(audio, /importSource: \(file: File\)/);
  assert.match(pdfOperations, /export async function createBlankPdf/);
  assert.match(pdfSource, /await createBlankPdf\(\)/);
  assert.match(pdf, /loadInitialPdfSource/);
  assert.match(model, /importModel: \(file: File\)/);
  assert.match(modelControls, /导入 GLB \/ glTF/);
  assert.match(modelStage, /空白 3D 场景/);
});
