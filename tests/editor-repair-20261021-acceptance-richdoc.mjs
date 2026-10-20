/**
 * V1 independent acceptance: markdown library items open with their body,
 * a 410/empty load is not a ready blank, and persist of an md item writes
 * text/markdown (not Word).
 */
import "./helpers/w1-jsdom-window.mjs";
import assert from "node:assert/strict";
import { File as NodeFile } from "node:buffer";
import test from "node:test";

import {
  admitRichDocEditorSource,
  loadRichDocHtml,
  richDocHasContent,
} from "../src/shell/doc-editors/rich-doc-model.ts";
import {
  collectRichDocText,
  deriveEditorHandoffFromItem,
  isEmptyRichDoc,
  loadRichDocHostedState,
  persistUmoPayload,
} from "../src/shell/advanced-routes/richdoc-pro-source.ts";

if (!globalThis.File) globalThis.File = NodeFile;

const ARTIFACT_ID = "21c1e4d9-0818-4bbe-ae33-b4d01a5beafd";
const REVISION_ID = "568afa53-b506-4492-9b07-bb2ac3729883";
const SOURCE_TREE = `/v1/artifacts/${ARTIFACT_ID}/revisions/${REVISION_ID}/source-tree/@source`;
const PREVIEW_ACCESS =
  "https://api.dev.oceanleo.com/v1/artifact-renditions/access/preview-token";
const MARKDOWN_BODY = [
  "# 需签字盖章页清单（只打第3页）",
  "",
  "按 2026 年 9 月已受理做法：备案系统上传 1 只需已签字盖章的自评报告。只打印第 3 页。",
  "",
  "| 文件 | 页码 | 要做什么 |",
  "| --- | --- | --- |",
  "| 打印签章页-第3页.pdf | 3 | 打印这一页。李一隆在算法安全负责人行签名旁手签。 |",
].join("\n");

const WORD_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function screenshotItem(overrides = {}) {
  return {
    id: ARTIFACT_ID,
    key: `artifact:${ARTIFACT_ID}:${REVISION_ID}`,
    source: "artifact",
    artifactId: ARTIFACT_ID,
    revisionId: REVISION_ID,
    artifactType: "document",
    title: "需签字盖章页清单（只打第3页）",
    kind: "document",
    siteId: "home",
    favorite: false,
    url: undefined,
    previewUrl: PREVIEW_ACCESS,
    meta: {
      filename: "需签字盖章页清单.md",
      source_format: "md",
      source_url: SOURCE_TREE,
    },
    artifact: {
      schema: "oceanleo.artifact.v1",
      artifactId: ARTIFACT_ID,
      revisionId: REVISION_ID,
      artifactType: "document",
      sourceFormat: "md",
      renditions: {
        source: {
          url: SOURCE_TREE,
          mediaType: "text/markdown",
          purpose: "source",
          revisionId: REVISION_ID,
        },
        full: {
          url: SOURCE_TREE,
          mediaType: "text/markdown",
          purpose: "full",
          revisionId: REVISION_ID,
        },
        preview: {
          url: PREVIEW_ACCESS,
          mediaType: "text/markdown",
          purpose: "preview",
          revisionId: REVISION_ID,
        },
      },
    },
    ...overrides,
  };
}

function markdownJson(text) {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

const htmlToJson = async (html) =>
  markdownJson(String(html).replace(/<[^>]+>/g, "").trim() || html);

test("screenshot-shaped markdown load fills hosted state with the body", async () => {
  const item = screenshotItem();
  const htmlLoad = await loadRichDocHtml(item, undefined, {
    fetchText: async (url) => {
      assert.equal(url, PREVIEW_ACCESS);
      return MARKDOWN_BODY;
    },
  });
  assert.equal(htmlLoad.error, "");
  assert.match(htmlLoad.html, /需签字盖章页清单/);
  assert.match(htmlLoad.html, /李一隆/);
  assert.equal(admitRichDocEditorSource(htmlLoad, item).ok, true);

  const hosted = await loadRichDocHostedState(
    item,
    deriveEditorHandoffFromItem(item),
    {
      loadHtml: async () => htmlLoad,
      htmlToJson,
    },
  );
  assert.equal(hosted.ok, true, hosted.ok ? "" : hosted.error);
  assert.equal(isEmptyRichDoc(hosted.source), false);
  assert.equal(richDocHasContent(hosted.source), true);
  assert.match(collectRichDocText(hosted.source), /需签字盖章页清单|李一隆/);
});

test("empty markdown load of an existing item is not ok ready-empty", async () => {
  const item = screenshotItem();
  const emptyHtml = await loadRichDocHtml(item, undefined, {
    fetchText: async () => "",
  });
  assert.notEqual(emptyHtml.error, "");
  assert.equal(admitRichDocEditorSource(emptyHtml, item).ok, false);

  const hosted = await loadRichDocHostedState(
    item,
    deriveEditorHandoffFromItem(item),
    {
      loadHtml: async () => emptyHtml,
      htmlToJson,
    },
  );
  assert.equal(hosted.ok, false, "empty bytes must not open as a ready blank");
});

test("HTTP 410 without a successful refresh is not ok ready-empty", async () => {
  const item = screenshotItem();
  const gone = await loadRichDocHtml(item, undefined, {
    fetchText: async () => {
      throw new Error("媒体加载失败 HTTP 410");
    },
  });
  assert.match(gone.error, /410|媒体加载失败/);
  assert.equal(admitRichDocEditorSource(gone, item).ok, false);

  const hosted = await loadRichDocHostedState(
    item,
    deriveEditorHandoffFromItem(item),
    {
      loadHtml: async () => gone,
      htmlToJson,
    },
  );
  assert.equal(hosted.ok, false);
});

test("410 then refresh that returns markdown fills the body", async () => {
  const item = screenshotItem();
  let calls = 0;
  const loaded = await loadRichDocHtml(item, undefined, {
    fetchText: async () => {
      calls += 1;
      if (calls === 1) throw new Error("媒体加载失败 HTTP 410");
      return MARKDOWN_BODY;
    },
  });
  assert.equal(loaded.error, "", loaded.error);
  assert.ok(calls >= 2, "loader must refresh after HTTP 410, not stay blank");
  assert.match(loaded.html, /需签字盖章页清单/);
  const hosted = await loadRichDocHostedState(
    item,
    deriveEditorHandoffFromItem(item),
    { loadHtml: async () => loaded, htmlToJson },
  );
  assert.equal(hosted.ok, true, hosted.ok ? "" : hosted.error);
  assert.equal(isEmptyRichDoc(hosted.source), false);
});

test("persistUmoPayload of an md item writes a text/markdown File, not Word", async () => {
  const item = screenshotItem();
  const captured = [];
  const saved = await persistUmoPayload({
    item,
    siteId: "word",
    payload: markdownJson("需签字盖章页清单（只打第3页）"),
    save: async (args) => {
      let file = args.file instanceof File ? args.file : null;
      if (!file && typeof args.createFile === "function") {
        file = await args.createFile();
      }
      captured.push({ args, file });
      return {
        ok: true,
        url: "https://cdn.example/docs/v2.md",
        versionId: "ver-2",
        projectUrl: "https://cdn.example/docs/v2.json",
        projectSchema: "tiptap-json@1",
        sourceFormat: args.sourceFormat,
        sourceMediaType: args.sourceMediaType,
        title: "需签字盖章页清单-编辑版",
        fileName: file?.name || "需签字盖章页清单-编辑版.md",
        savedAt: "2026-10-21T00:00:00.000Z",
        artifactId: ARTIFACT_ID,
        revisionId: "rev-2",
        previousRevisionId: REVISION_ID,
        error: "",
      };
    },
  });
  assert.equal(saved.ok, true, saved.ok ? "" : saved.error);
  assert.equal(captured.length, 1);
  const { args, file } = captured[0];
  assert.ok(file instanceof File, "save contract must produce a File");
  assert.equal(file.type, "text/markdown");
  assert.doesNotMatch(file.name, /\.docx$/i);
  assert.match(file.name, /\.md$/i);
  assert.equal(args.sourceMediaType, "text/markdown");
  assert.notEqual(args.sourceMediaType, WORD_TYPE);
  assert.ok(
    args.sourceFormat === "md" || args.sourceFormat === "markdown",
    `sourceFormat=${args.sourceFormat}`,
  );
});
