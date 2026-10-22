import "./helpers/w1-jsdom-window.mjs";
import assert from "node:assert/strict";
import test from "node:test";

import {
  detectRichDocFormat,
  itemLooksLikeExistingRichDoc,
  loadRichDocFile,
  loadRichDocHtml,
  loadRichDocSource,
  parseRichDocNativeJson,
  richDocHasContent,
  sanitizeRichDocHtml,
  selectRichDocSourceUrl,
  shouldMarkRichDocSourceReadyFromCollab,
} from "../src/shell/doc-editors/rich-doc-model.ts";
import { sourceHintForItem } from "../src/shell/office-editor/office-source-cache.ts";

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

test("W1 screenshot item: preview URL is selected, source-tree is not", () => {
  const item = screenshotItem();
  assert.equal(selectRichDocSourceUrl(item), PREVIEW_ACCESS);
  assert.equal(detectRichDocFormat(item, selectRichDocSourceUrl(item)), "markdown");
  assert.equal(itemLooksLikeExistingRichDoc(item), true);
  assert.equal(sourceHintForItem(item).url, "");
});

test("W1 screenshot item: markdown import fills the editor, empty load is a failure", async () => {
  const item = screenshotItem();
  const fetched = [];
  const loaded = await loadRichDocHtml(item, undefined, {
    fetchText: async (url) => {
      fetched.push(url);
      return MARKDOWN_BODY;
    },
  });
  assert.deepEqual(fetched, [PREVIEW_ACCESS]);
  assert.equal(loaded.error, "");
  assert.equal(loaded.source, "url-markdown");
  assert.match(loaded.html, /需签字盖章页清单/);
  assert.match(loaded.html, /只打印第 3 页|只打第3页/);

  const empty = await loadRichDocHtml(item, undefined, {
    fetchText: async () => "",
  });
  assert.equal(empty.source, "empty");
  assert.match(empty.error, /缺少可验证的 source\/full 内容|没有可直接显示的正文/);
});

test("W1 empty project JSON does not hide the original markdown", async () => {
  const item = screenshotItem({
    meta: {
      ...screenshotItem().meta,
      editor_project_url: "https://cdn.example/empty.tiptap.json",
    },
  });
  const loaded = await loadRichDocSource(item, undefined, {
    loadProject: async () => ({
      type: "doc",
      content: [{ type: "paragraph" }],
    }),
    fetchText: async () => MARKDOWN_BODY,
  });
  assert.equal(loaded.error, "");
  assert.equal(loaded.source, "url-markdown");
  assert.match(loaded.html, /李一隆/);
});

test("W1 HTML / text / native JSON / docx-shaped import keep their bodies", async () => {
  const html = await loadRichDocFile(
    new File(["<h1>合同正文</h1><p>第二条</p>"], "合同.html", {
      type: "text/html",
    }),
  );
  assert.equal(html.error, "");
  assert.equal(html.source, "import-html");
  assert.match(html.html, /合同正文/);

  const text = await loadRichDocFile(
    new File(["第一段\n\n第二段"], "说明.txt", { type: "text/plain" }),
  );
  assert.equal(text.error, "");
  assert.equal(text.source, "import-text");
  assert.match(text.html, /第一段/);

  const native = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "原生 Tiptap 还在" }],
      },
    ],
  };
  const jsonFile = await loadRichDocFile(
    new File([JSON.stringify(native)], "稿.richdoc.json", {
      type: "application/json",
    }),
  );
  assert.equal(jsonFile.error, "");
  assert.equal(jsonFile.source, "import-json");
  assert.equal(richDocHasContent(jsonFile.json), true);

  const parsed = parseRichDocNativeJson(
    JSON.stringify({ schema: "tiptap-json@1", version: 1, data: native }),
  );
  assert.equal(parsed.ok, true);
  assert.equal(richDocHasContent(parsed.json), true);

  const emptyJson = await loadRichDocFile(
    new File(
      [JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] })],
      "空.json",
      { type: "application/json" },
    ),
  );
  assert.equal(emptyJson.error, "");
  assert.equal(emptyJson.source, "import-json");
  assert.equal(richDocHasContent(emptyJson.json), false);
});

test("W1 empty collab room cannot mark a failed document ready", () => {
  assert.equal(
    shouldMarkRichDocSourceReadyFromCollab({
      sourceReady: false,
      sourceFailed: true,
      roomHasContent: false,
    }),
    false,
  );
  assert.equal(
    shouldMarkRichDocSourceReadyFromCollab({
      sourceReady: false,
      sourceFailed: true,
      roomHasContent: true,
    }),
    true,
  );
  assert.equal(
    shouldMarkRichDocSourceReadyFromCollab({
      sourceReady: true,
      sourceFailed: false,
      roomHasContent: false,
    }),
    false,
  );
});

test("W1 sanitizer strips script XSS and never returns raw HTML when unavailable", async () => {
  const dirty = '<p>正文</p><script>alert(1)</script><img src=x onerror="alert(1)">';
  const cleaned = await sanitizeRichDocHtml(dirty);
  assert.match(cleaned, /正文/);
  assert.doesNotMatch(cleaned, /<script/i);
  assert.doesNotMatch(cleaned, /onerror/i);

  await assert.rejects(
    () => sanitizeRichDocHtml(dirty, { isSupported: false, sanitize: (html) => html }),
    /安全过滤器暂时不可用/,
  );
  await assert.rejects(
    () => sanitizeRichDocHtml(dirty, { sanitize: () => ({ not: "string" }) }),
    /安全过滤器暂时不可用/,
  );
  await assert.rejects(
    () => sanitizeRichDocHtml(dirty, {}),
    /安全过滤器暂时不可用/,
  );

  const item = screenshotItem({
    previewUrl: "https://cdn.example/dirty.html",
    meta: { ...screenshotItem().meta, source_format: "html", filename: "dirty.html" },
    artifact: {
      ...screenshotItem().artifact,
      sourceFormat: "html",
      renditions: {
        preview: {
          url: "https://cdn.example/dirty.html",
          mediaType: "text/html",
          purpose: "preview",
        },
      },
    },
  });
  const failed = await loadRichDocHtml(item, undefined, {
    fetchText: async () => dirty,
    sanitizer: { isSupported: false, sanitize: (html) => html },
  });
  assert.equal(failed.source, "empty");
  assert.match(failed.error, /安全过滤器暂时不可用/);
  assert.doesNotMatch(failed.html, /alert\(1\)/);
});
