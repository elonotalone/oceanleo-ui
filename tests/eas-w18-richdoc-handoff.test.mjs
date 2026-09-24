import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  collectRichDocText,
  createUmoSaveRoundtrip,
  deriveEditorHandoffFromItem,
  hostedStateFromResolvedJson,
  isDocxOnlyItem,
  isEmptyRichDoc,
  persistUmoPayload,
  umoSourceFromDocxItem,
} from "../src/shell/advanced-routes/richdoc-pro-source.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const route = readFileSync("src/shell/advanced-routes/RichDocRoute.tsx", "utf8");
const hosted = readFileSync(
  "src/shell/advanced-routes/RichDocHostedRoute.tsx",
  "utf8",
);

function item(overrides = {}) {
  return {
    key: "rd-w18",
    source: "artifact",
    id: "rd-w18",
    title: "交接文档",
    kind: "document",
    siteId: "word",
    favorite: false,
    meta: {},
    ...overrides,
  };
}

const QUICK_EDIT = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "快速面刚改的一句" }],
    },
  ],
};

test("快速面改一处：inline 交接把这一处交给 Umo", () => {
  const resolved = hostedStateFromResolvedJson(QUICK_EDIT);
  assert.equal(collectRichDocText(resolved.source).includes("快速面刚改的一句"), true);
  assert.equal(isEmptyRichDoc(resolved.source), false);
});

test("只有 .docx 的文档不是 emptyDoc", async () => {
  const docxItem = item({
    url: "https://cdn.example/docs/only.docx",
    meta: { source_format: "docx", format: "docx" },
  });
  assert.equal(isDocxOnlyItem(docxItem), true);
  assert.equal(deriveEditorHandoffFromItem(docxItem).kind, "url");
  assert.equal(deriveEditorHandoffFromItem(docxItem).format, "docx");

  const loaded = await umoSourceFromDocxItem(docxItem, {
    loadHtml: async () => ({
      html: "<p>docx 正文还在</p>",
      error: "",
    }),
    htmlToJson: async () => ({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "docx 正文还在" }],
        },
      ],
    }),
  });
  assert.equal(loaded.ok, true);
  assert.equal(isEmptyRichDoc(loaded.source), false);
  assert.equal(collectRichDocText(loaded.source).includes("docx 正文还在"), true);
  assert.equal(loaded.inspect.kind === "empty", false);
});

test("Umo 保存确认后回快速面能读到新 revision", async () => {
  const opened = item({ revisionId: "rev-1", artifactId: "art-1" });
  const saved = await persistUmoPayload({
    item: opened,
    siteId: "word",
    payload: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Umo 里改的一句" }],
        },
      ],
    },
    save: async () => ({
      ok: true,
      url: "https://cdn.example/docs/v2.docx",
      versionId: "ver-2",
      projectUrl: "https://cdn.example/docs/v2.json",
      projectSchema: "tiptap-json@1",
      sourceFormat: "docx",
      sourceMediaType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      title: "交接文档-编辑版",
      fileName: "交接文档-编辑版.docx",
      savedAt: "2026-09-24T08:00:00.000Z",
      artifactId: "art-1",
      revisionId: "rev-2",
      previousRevisionId: "rev-1",
      error: "",
    }),
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.item.revisionId, "rev-2");
  assert.equal(saved.item.meta.editor_project_url, "https://cdn.example/docs/v2.json");
  const handoffUrl = await compileModule("src/shell/advanced-routes/editor-handoff.ts", {
    "../office-editor/useOfficeArtifactSource": dataModule(`
      export function useOfficeArtifactSource(item) {
        return { item, url: item && item.url ? item.url : "", purpose: null, loading: false, error: "", version: 0, retry() {}, resourceFailed() {} };
      }
    `),
  });
  const { handoffItemKey, peekProSavedRevision, reportProSaved, resetEditorHandoffForTests } =
    await import(handoffUrl);
  resetEditorHandoffForTests();
  reportProSaved(handoffItemKey(opened), saved.item);
  const back = peekProSavedRevision(handoffItemKey(opened));
  assert.ok(back);
  assert.equal(back.revisionId, "rev-2");
});

test("flush 没有 confirmation 时超时失败", async () => {
  const roundtrip = createUmoSaveRoundtrip(20);
  await assert.rejects(roundtrip.expect("save-timeout"), /专业编辑还没确认保存/);
});

test("flush 等到 recovery-snapshot 才算保存成功", async () => {
  const roundtrip = createUmoSaveRoundtrip(200);
  const waiting = roundtrip.expect("save-1");
  assert.equal(
    roundtrip.settle("save-1", { payload: QUICK_EDIT, revision: 3 }, true),
    true,
  );
  const settled = await waiting;
  assert.equal(collectRichDocText(settled.payload).includes("快速面刚改的一句"), true);
});

test("RichDocRoute 进专业面前带走快速面文档", () => {
  assert.match(route, /beforeEnterPro/);
  assert.match(route, /bindNormalFaceHandoff|captureBeforeEnterPro/);
  assert.match(route, /editor\.editor\?\.getJSON/);
});

test("RichDocHostedRoute 用交接源，docx 不再 emptyDoc", () => {
  assert.match(hosted, /useEditorHandoffSource/);
  assert.match(hosted, /umoSourceFromDocxItem|fromDocx/);
  assert.match(hosted, /reportProSaved/);
  assert.match(hosted, /save-result/);
  assert.match(hosted, /openHostedSaveGate/);
  assert.doesNotMatch(
    hosted,
    /if \(!projectUrl\) \{\s*setSource\(emptyDoc\(\)\)/,
    "只有 .docx、没有 JSON 时不得再落到 emptyDoc",
  );
});
