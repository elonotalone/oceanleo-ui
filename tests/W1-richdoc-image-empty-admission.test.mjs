/**
 * W1-r3: a verified image-only or intentionally empty document must open.
 * Failures that still stay blocked: missing URL, unreadable bytes, sanitizer
 * down, source-tree-only, empty project hiding a richer original.
 *
 * These cases fail on c73a7b08, which treated tag-stripped length as admission.
 */
import "./helpers/w1-jsdom-window.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { Document, ImageRun, Packer, Paragraph } from "docx";

import {
  admitRichDocEditorSource,
  loadRichDocFile,
  loadRichDocHtml,
  loadRichDocSource,
  richDocHasContent,
  richDocHtmlHasBody,
  richDocLoadVerified,
  sanitizeRichDocHtml,
} from "../src/shell/doc-editors/rich-doc-model.ts";
import { tiptapJsonToDocxBlob } from "../src/shell/doc-editors/docx-export.ts";

const SCAN_HTML =
  '<p><img src="https://files.example.test/page.png" alt="扫描页"></p>';
const SCAN_MARKDOWN = "![扫描页](https://files.example.test/page.png)";
const TINY_PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const EMPTY_DOC = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

function hookAdmission(result, item) {
  const admitted = admitRichDocEditorSource(result, item);
  if (!admitted.ok) {
    return {
      sourceReady: false,
      sourceFailed: true,
      dirty: false,
      error: admitted.error,
    };
  }
  return { sourceReady: true, sourceFailed: false, dirty: false, error: "" };
}

function scanItem(overrides = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    key: "artifact:00000000-0000-4000-8000-000000000001",
    source: "artifact",
    artifactId: "00000000-0000-4000-8000-000000000001",
    revisionId: "rev-scan",
    title: "扫描页",
    kind: "document",
    siteId: "home",
    favorite: false,
    url: "https://files.example.test/scan.html",
    previewUrl: "https://files.example.test/scan.html",
    meta: {
      filename: "scan.html",
      mime: "text/html",
      source_format: "html",
    },
    ...overrides,
  };
}

async function imageOnlyDocxBuffer() {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [
              new ImageRun({
                type: "png",
                data: TINY_PNG_BYTES,
                transformation: { width: 120, height: 120 },
                altText: {
                  title: "扫描页",
                  description: "扫描页",
                  name: "扫描页",
                },
              }),
            ],
          }),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

test("W1-r3 parent repro: image-only HTML is a verified load, not a blank substitute", async () => {
  const item = scanItem();
  const loaded = await loadRichDocHtml(item, undefined, {
    fetchText: async () => SCAN_HTML,
    sanitizeHtml: async (html) => html,
  });
  assert.equal(loaded.error, "");
  assert.equal(loaded.source, "url-html");
  assert.equal(richDocLoadVerified(loaded), true);
  assert.equal(richDocHtmlHasBody(loaded.html), true);
  assert.match(loaded.html, /扫描页|page\.png/);
  assert.deepEqual(hookAdmission(loaded, item), {
    sourceReady: true,
    sourceFailed: false,
    dirty: false,
    error: "",
  });
});

test("W1-r3 real DOMPurify keeps the scan image and strips XSS", async () => {
  const dirty = `${SCAN_HTML}<script>alert(1)</script>`;
  const cleaned = await sanitizeRichDocHtml(dirty);
  assert.match(cleaned, /img/i);
  assert.match(cleaned, /扫描页|page\.png/);
  assert.doesNotMatch(cleaned, /<script/i);

  const item = scanItem();
  const loaded = await loadRichDocHtml(item, undefined, {
    fetchText: async () => dirty,
  });
  assert.equal(loaded.error, "");
  assert.equal(loaded.source, "url-html");
  assert.match(loaded.html, /img/i);
  assert.doesNotMatch(loaded.html, /<script/i);
});

test("W1-r3 image-only markdown and empty native JSON admit through the editor hook", async () => {
  const mdItem = scanItem({
    url: "https://files.example.test/scan.md",
    previewUrl: "https://files.example.test/scan.md",
    meta: {
      filename: "scan.md",
      mime: "text/markdown",
      source_format: "md",
    },
  });
  const mdLoad = await loadRichDocHtml(mdItem, undefined, {
    fetchText: async () => SCAN_MARKDOWN,
  });
  assert.equal(mdLoad.error, "");
  assert.equal(mdLoad.source, "url-markdown");
  assert.match(mdLoad.html, /img/i);
  assert.equal(hookAdmission(mdLoad, mdItem).sourceReady, true);

  const item = scanItem();
  const htmlLoad = await loadRichDocHtml(item, undefined, {
    fetchText: async () => SCAN_HTML,
  });
  const emptyItem = scanItem({
    url: "https://files.example.test/empty.json",
    previewUrl: "https://files.example.test/empty.json",
    meta: {
      filename: "empty.json",
      mime: "application/json",
      source_format: "json",
    },
  });
  const emptyLoad = await loadRichDocHtml(emptyItem, undefined, {
    fetchText: async () => JSON.stringify(EMPTY_DOC),
  });
  assert.equal(emptyLoad.error, "");
  assert.equal(emptyLoad.source, "url-json");
  assert.equal(richDocLoadVerified(emptyLoad), true);
  assert.equal(richDocHasContent(emptyLoad.json), false);
  assert.deepEqual(hookAdmission(emptyLoad, emptyItem), {
    sourceReady: true,
    sourceFailed: false,
    dirty: false,
    error: "",
  });

});

test("W1-r3 mammoth DOCX image-only and empty Word reopen clean", async () => {
  const imageDocx = await imageOnlyDocxBuffer();
  const emptyDocx = await tiptapJsonToDocxBlob("空白", EMPTY_DOC);
  const item = scanItem({
    url: "https://files.example.test/scan.docx",
    previewUrl: "https://files.example.test/scan.docx",
    meta: {
      filename: "scan.docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      source_format: "docx",
    },
  });

  const imageLoad = await loadRichDocHtml(item, undefined, {
    fetchDocx: async () =>
      imageDocx.buffer.slice(
        imageDocx.byteOffset,
        imageDocx.byteOffset + imageDocx.byteLength,
      ),
  });
  assert.equal(imageLoad.error, "");
  assert.equal(imageLoad.source, "url-docx");
  assert.equal(richDocHtmlHasBody(imageLoad.html), true);
  assert.match(imageLoad.html, /img/i);
  assert.equal(hookAdmission(imageLoad, item).sourceReady, true);

  const emptyItem = {
    ...item,
    url: "https://files.example.test/empty.docx",
    previewUrl: "https://files.example.test/empty.docx",
    meta: { ...item.meta, filename: "empty.docx" },
  };
  const emptyLoad = await loadRichDocHtml(emptyItem, undefined, {
    fetchDocx: async () => emptyDocx.arrayBuffer(),
  });
  assert.equal(emptyLoad.error, "");
  assert.equal(emptyLoad.source, "url-docx");
  assert.equal(hookAdmission(emptyLoad, emptyItem).sourceReady, true);
  assert.equal(hookAdmission(emptyLoad, emptyItem).dirty, false);

  const imported = await loadRichDocFile(
    new File([emptyDocx], "empty.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
  );
  assert.equal(imported.error, "");
  assert.equal(imported.source, "import-docx");
});

test("W1-r3 empty project does not hide a richer original; failures stay blocked", async () => {
  const item = scanItem({
    meta: {
      filename: "scan.html",
      mime: "text/html",
      source_format: "html",
      editor_project_url: "https://cdn.example/empty.tiptap.json",
    },
  });
  const loaded = await loadRichDocSource(item, undefined, {
    loadProject: async () => EMPTY_DOC,
    fetchText: async () => SCAN_HTML,
  });
  assert.equal(loaded.error, "");
  assert.equal(loaded.source, "url-html");
  assert.match(loaded.html, /扫描页|page\.png/);

  const projectOnly = scanItem({
    url: "",
    previewUrl: "",
    meta: {
      filename: "empty.json",
      mime: "application/json",
      source_format: "json",
      editor_project_url: "https://cdn.example/empty.tiptap.json",
    },
  });
  const emptyProject = await loadRichDocSource(projectOnly, undefined, {
    loadProject: async () => EMPTY_DOC,
  });
  assert.equal(emptyProject.error, "");
  assert.equal(emptyProject.source, "project");
  assert.equal(hookAdmission(emptyProject, projectOnly).sourceReady, true);

  const unknownProject = await loadRichDocSource(projectOnly, undefined, {
    loadProject: async () => ({}),
  });
  assert.equal(unknownProject.source, "empty");
  assert.equal(hookAdmission(unknownProject, projectOnly).sourceFailed, true);

  const hiddenFail = await loadRichDocSource(item, undefined, {
    loadProject: async () => EMPTY_DOC,
    fetchText: async () => {
      throw new Error("原件读不出");
    },
  });
  assert.equal(hiddenFail.source, "empty");
  assert.match(hiddenFail.error, /原件读不出|缺少可验证的 source\/full/);

  const missing = await loadRichDocHtml(
    scanItem({
      url: "",
      previewUrl: "",
      meta: { filename: "scan.html", mime: "text/html" },
    }),
  );
  assert.equal(missing.source, "empty");
  assert.match(missing.error, /缺少可验证的 source\/full 内容/);
  assert.equal(
    hookAdmission(missing, scanItem({ url: "", previewUrl: "" })).sourceFailed,
    true,
  );

  const sourceTreeOnly = await loadRichDocHtml(
    scanItem({
      url: "/v1/artifacts/00000000-0000-4000-8000-000000000001/revisions/00000000-0000-4000-8000-000000000002/source-tree/@source",
      previewUrl: "",
      meta: { filename: "scan.html", mime: "text/html" },
    }),
  );
  assert.equal(sourceTreeOnly.source, "empty");
  assert.match(sourceTreeOnly.error, /缺少可验证的 source\/full 内容/);

  const unreadable = await loadRichDocHtml(scanItem(), undefined, {
    fetchText: async () => "",
  });
  assert.equal(unreadable.source, "empty");

  const sanitizerDown = await loadRichDocHtml(scanItem(), undefined, {
    fetchText: async () => SCAN_HTML,
    sanitizer: { isSupported: false, sanitize: (html) => html },
  });
  assert.equal(sanitizerDown.source, "empty");
  assert.match(sanitizerDown.error, /安全过滤器暂时不可用/);
  assert.doesNotMatch(sanitizerDown.html, /page\.png/);
});
