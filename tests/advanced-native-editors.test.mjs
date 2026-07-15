import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("Fabric image editor exposes object, layer, filter, crop and durable-save tools", () => {
  const types = source("../src/shell/image-editor/types.ts");
  const controls = source("../src/shell/image-editor/FabricImageControls.tsx");
  const stage = source("../src/shell/image-editor/FabricImageStage.tsx");
  const hook = source("../src/shell/image-editor/use-fabric-image-editor.ts");
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
  assert.match(controls, /滤镜与调色/);
  assert.match(controls, /AI 局部创作/);
  assert.match(stage, /图片编辑画布/);
  assert.match(hook, /persistImageBlob/);
  assert.match(hook, /onSaved/);
});

test("structured document editors cover rich text, workbooks and editable decks", () => {
  const rich = source("../src/shell/doc-editors/use-rich-doc-editor.ts");
  const grid = source("../src/shell/doc-editors/use-grid-editor.ts");
  const deck = source("../src/shell/doc-editors/use-deck-editor.ts");
  const deckStage = source("../src/shell/doc-editors/DeckStage.tsx");
  assert.match(rich, /saveFileToLibrary/);
  assert.match(grid, /buildGridWorkbookBlob/);
  assert.match(grid, /gridSelectionRange/);
  assert.match(deck, /pptxgenjs/);
  assert.match(deck, /saveFileToLibrary/);
  assert.match(deckStage, /导出 PPTX/);
});

test("native editors preserve history and never clear newer unsaved revisions", () => {
  const shell = source("../src/shell/AdvancedWorkbenchShell.tsx");
  const rich = source("../src/shell/doc-editors/use-rich-doc-editor.ts");
  const grid = source("../src/shell/doc-editors/use-grid-editor.ts");
  const deck = source("../src/shell/doc-editors/use-deck-editor.ts");
  const image = source("../src/shell/image-editor/use-fabric-image-editor.ts");
  const audio = source("../src/shell/media-editors/AudioWorkbench.tsx");
  const pdf = source("../src/shell/media-editors/use-pdf-workbench.ts");
  const timeline = source("../src/shell/video-editor/use-video-timeline.ts");

  assert.match(shell, /editorAvailable \? "edit" : "agent"/);
  assert.match(shell, /beforeunload/);
  assert.match(shell, /当前有未保存的修改/);
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
