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

const DECK_EDITOR = "../src/shell/doc-editors/use-deck-editor.ts";

/** PPTX is the only deck carrier; save and download share its real renderer. */
function assertDeckDeliveryReachesRenderers() {
  const buildDelivery = section(
    DECK_EDITOR,
    "const buildDelivery = useCallback",
    "const exportPptx = useCallback",
  );
  assert.match(buildDelivery, /await buildDeckPptxBlob\(snapshot\)/);
  assert.doesNotMatch(source(DECK_EDITOR), /buildDeckDraftPptxBlob|deck-draft/);
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
  assert.match(io, /uploadIdempotencyKey/);
  assert.match(io, /:project:\$\{|role: "project"/);
  assert.match(
    io,
    /reuseEditorWorkingHead[\s\S]*safePreparedUrl\(projectUrl\)/,
  );
  assert.match(
    io,
    /Shelf\/public binary sources are not creation keys|HTTP 409/,
  );
  assert.match(
    io,
    /Bind upload CAS keys to content digest|different digest/,
  );
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

test("Office saves persist real delivery packages and sidecars only for structured editors", () => {
  assertDeckDeliveryReachesRenderers();
  // Rich documents preserve their original format through the shared delivery
  // builder. Follow the builder to the actual DOCX renderer and packaged file.
  const richDocDelivery = section(
    "../src/shell/doc-editors/rich-doc-model.ts",
    "export async function createRichDocDeliveryFile",
    "async function defaultRefreshGoneUrl",
  );
  // The DOCX renderer now receives the generated-document formatting option.
  assert.match(richDocDelivery, /await tiptapJsonToDocxBlob\(input\.title, json, \{ generated \}\)/);
  assert.match(richDocDelivery, /new File\(\[blob\], `\$\{stem\}\.docx`/);
  for (const [path, end, exporter, extension, start] of [
    [
      DECK_EDITOR,
      "const restoreRecovery = useCallback",
      "buildDelivery",
      "pptx",
    ],
    [
      // 表格只剩 Univer 舞台（core-swap:delete grid）。
      "../src/shell/doc-editors/GridUniverStage.tsx",
      "const saveBeforeNewConversation = useCallback",
      "buildGridXlsxFromUniverSnapshot",
      "xlsx",
    ],
    [
      "../src/shell/doc-editors/use-rich-doc-editor.ts",
      "const uploadImage = useCallback",
      "createRichDocDeliveryFile",
      "docx",
      // 10-23 W08：真正的保存体是 `saveOnce`；`save` 只是共享在途保存的薄包装。
      "const saveOnce = useCallback",
    ],
  ]) {
    const save = section(path, start || (extension === "pptx" ? "const publish = useCallback" : "const save = useCallback"), end);
    assert.match(save, new RegExp(exporter), path);
    assert.match(save, /saveFileToLibrary/, path);
    if (extension === "docx") {
      assert.match(save, /createFile: \(\) =>\s*createRichDocDeliveryFile\(/, path);
    } else {
      // Deck wraps `delivery`; Grid wraps the blob built straight from the Univer snapshot.
      const wrapped = extension === "xlsx" ? "built\\.blob" : "delivery";
      assert.match(
        save,
        new RegExp(`new File\\(\\[${wrapped}\\].*\\.${extension}`, "s"),
        path,
      );
    }
    if (extension === "pptx") {
      assert.match(save, /sourceFormat: DECK_SOURCE_FORMAT/);
      assert.match(save, /createPreview: \(\) => renderDeckPreviewPng\(snapshot\)/);
      assert.doesNotMatch(save, /\bproject: \{/);
    } else {
      assert.match(save, /project: \{/, path);
    }
  }
});
