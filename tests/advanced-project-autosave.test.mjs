import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  editorWorkingHeadUrl,
  savedItemVisualUrls,
} from "../src/shell/editor-working-head.ts";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function section(path, start, end) {
  const contents = source(path);
  const first = contents.indexOf(start);
  const last = contents.indexOf(end, first + start.length);
  assert.notEqual(first, -1, `${path}: missing ${start}`);
  assert.notEqual(last, -1, `${path}: missing ${end}`);
  return contents.slice(first, last);
}

function libraryItem(overrides = {}) {
  return {
    key: "artifact:working-head",
    source: "artifact",
    id: "asset-1",
    title: "Working head",
    kind: "image",
    siteId: "image",
    url: "https://cdn.oceanleo.com/original.png",
    previewUrl: "https://cdn.oceanleo.com/original-preview.png",
    thumbUrl: "https://cdn.oceanleo.com/original-thumb.png",
    favorite: false,
    meta: {},
    ...overrides,
  };
}

test("project autosave keeps one stable creation URL with an explicit blank fallback", () => {
  const item = libraryItem();
  assert.equal(
    editorWorkingHeadUrl(
      item,
      "",
      "https://cdn.oceanleo.com/revision-2.project.json",
    ),
    item.url,
  );
  assert.equal(
    editorWorkingHeadUrl(
      { url: "blob:temporary", previewUrl: item.previewUrl },
      "",
      "https://cdn.oceanleo.com/revision-2.project.json",
    ),
    item.previewUrl,
  );
  assert.equal(
    editorWorkingHeadUrl(
      { url: "", previewUrl: "" },
      "https://cdn.oceanleo.com/first.project.json",
      "https://cdn.oceanleo.com/revision-2.project.json",
    ),
    "https://cdn.oceanleo.com/first.project.json",
  );
  assert.equal(
    editorWorkingHeadUrl(
      { url: "", previewUrl: "" },
      "",
      "https://cdn.oceanleo.com/first.project.json",
    ),
    "https://cdn.oceanleo.com/first.project.json",
  );

  const io = source("../src/shell/doc-editors/doc-io.ts");
  const projectOnly = section(
    "../src/shell/doc-editors/doc-io.ts",
    "export async function saveProjectWorkingHead",
    "/** 上传交付文件或轻量工程",
  );
  assert.match(projectOnly, /projectOnly: true/);
  assert.doesNotMatch(projectOnly, /new File|deliveryUrl|deliveryProjectSchema/);
  assert.match(io, /const projectJson = JSON\.stringify/);
  assert.match(io, /editor_project_url: projectUrl/);
  assert.match(io, /editor_working_head_url: url/);
  assert.match(io, /editor_working_head_uses_project_url/);
});

test("autosaved items preserve visual previews and never use project JSON as a thumbnail", () => {
  const original = libraryItem();
  assert.deepEqual(savedItemVisualUrls(original, {}), {
    previewUrl: original.previewUrl,
    thumbUrl: original.thumbUrl,
  });
  assert.deepEqual(
    savedItemVisualUrls(
      libraryItem({ url: "", previewUrl: "", thumbUrl: "" }),
      {},
    ),
    { previewUrl: "", thumbUrl: "" },
  );
  const savedItem = source("../src/shell/advanced-session.ts");
  assert.match(savedItem, /const visual = savedItemVisualUrls\(item, input\)/);
  assert.match(savedItem, /\.\.\.input\.meta/);
  assert.doesNotMatch(savedItem, /previewUrl: input\.previewUrl \|\| input\.url/);
});

test("autosave blocks never invoke delivery renderers", () => {
  const cases = [
    {
      path: "../src/shell/image-editor/use-fabric-image-editor.ts",
      start: "const save = useCallback",
      end: "const runAiEdit = useCallback",
      forbidden: /makeExportBlob|toDataURL|toBlob/,
    },
    {
      path: "../src/shell/doc-editors/use-deck-editor.ts",
      start: "const save = useCallback",
      end: "const restoreRecovery = useCallback",
      forbidden: /buildDeckPptxBlob|pptxgenjs/,
    },
    {
      path: "../src/shell/doc-editors/use-grid-editor.ts",
      start: "const save = useCallback",
      end: "const restoreRecovery = useCallback",
      forbidden: /buildGridWorkbookBlob|writeFile|XLSX/,
    },
    {
      path: "../src/shell/doc-editors/use-rich-doc-editor.ts",
      start: "const save = useCallback",
      end: "const uploadImage = useCallback",
      forbidden: /tiptapJsonToDocxBlob|docx|new File/,
    },
    {
      path: "../src/shell/media-editors/use-audio-persistence.ts",
      start: "const save = useCallback",
      end: "const captureRecovery = useCallback",
      forbidden: /encodeWav|audio\/wav|new File/,
    },
    {
      path: "../src/shell/video-editor/use-video-timeline.ts",
      start: "const saveDraft = useCallback",
      end: "const exportVideo = useCallback",
      forbidden: /renderTimeline|uploadCoverPng|toBlob/,
    },
    {
      path: "../src/shell/chart-editor/use-chart-workbench.ts",
      start: "const save = useCallback",
      end: "const table = useMemo",
      forbidden: /canvas|toDataURL|toBlob|new File/,
    },
  ];
  for (const entry of cases) {
    const autosave = section(entry.path, entry.start, entry.end);
    assert.doesNotMatch(autosave, entry.forbidden, entry.path);
    assert.match(
      autosave,
      /saveProjectWorkingHead|persistImageProject|uploadDraft/,
      entry.path,
    );
  }

  const modelSave = source(
    "../src/shell/media-editors/use-model3d-save.ts",
  );
  const modelProject = source(
    "../src/shell/media-editors/model3d-project.ts",
  );
  const modelRuntime = source(
    "../src/shell/media-editors/model3d-runtime.mjs",
  );
  const modelWorkbench = source(
    "../src/shell/media-editors/use-model3d-workbench.ts",
  );
  const modelRoute = source(
    "../src/shell/advanced-routes/Model3DRoute.tsx",
  );
  assert.doesNotMatch(
    modelSave,
    /captureBlob|uploadFile|fetchMediaBlob|dataURL|readAsDataURL/,
  );
  // Small scene edits and viewer-only state persist as a replay journal +
  // sidecar. The full GLB exporter is gated by a bounded checkpoint reason.
  assert.match(modelSave, /createModel3DSavePlan/);
  assert.match(modelSave, /if \(plan\.shouldExportGlb\) glb = await runtime\.exportGlb\(\)/);
  assert.match(modelSave, /operations: plan\.persistedOperations/);
  assert.match(modelSave, /runtime\.commitCheckpoint\(plan\.coveredOperationIds\)/);
  assert.match(modelRuntime, /exportGlb\(\)/);
  assert.match(modelRuntime, /applyOperationJournal/);
  assert.match(modelWorkbench, /normalizeModel3DProjectRecovery/);
  assert.match(modelWorkbench, /runtime\.applyOperationJournal\(pendingOperationsRef\.current\)/);
  assert.match(modelRoute, /operations: editor\.operationJournal/);
  assert.match(modelProject, /saveFileToLibrary/);
  assert.match(modelProject, /new File\(\[binary\]/);
  assert.doesNotMatch(modelProject, /dataURL|readAsDataURL/);

  // PDF edits already mutate the canonical PDF bytes. Autosave uploads those
  // bytes without invoking the preview canvas or another PDF render pass.
  const pdfSave = section(
    "../src/shell/media-editors/use-pdf-workbench.ts",
    "const saveCopy = useCallback",
    "const captureRecovery = useCallback",
  );
  assert.doesNotMatch(pdfSave, /render|canvas|toDataURL|toBlob/);
});

test("delivery renderers remain attached to explicit export and download actions", () => {
  assert.match(
    section(
      "../src/shell/media-editors/use-model3d-media-actions.ts",
      "const downloadModel = useCallback",
      "return {",
    ),
    /await exportModel\(\)/,
  );
  assert.match(
    source("../src/shell/media-editors/use-model3d-save.ts"),
    /checkpointForExport[\s\S]*?persist\(true\)/,
  );
  assert.match(
    section(
      "../src/shell/image-editor/use-fabric-image-editor.ts",
      "const downloadDefaultPng = useCallback",
      "const save = useCallback",
    ),
    /makeExportBlob\("png"/,
  );
  assert.match(
    section(
      "../src/shell/doc-editors/use-deck-editor.ts",
      "const exportPptx = useCallback",
      "const save = useCallback",
    ),
    /buildDeckPptxBlob/,
  );
  assert.match(
    section(
      "../src/shell/doc-editors/use-grid-editor.ts",
      "const exportXlsx = useCallback",
      "const save = useCallback",
    ),
    /buildGridWorkbookBlob/,
  );
  assert.match(
    section(
      "../src/shell/doc-editors/use-rich-doc-editor.ts",
      "const exportDoc = useCallback",
      "const exportText = useCallback",
    ),
    /tiptapJsonToDocxBlob/,
  );
  assert.match(
    section(
      "../src/shell/media-editors/AudioWorkbench.tsx",
      "const download = useCallback",
      "const { save, captureRecovery, restoreRecovery } = useAudioPersistence",
    ),
    /encodeWav/,
  );
});
