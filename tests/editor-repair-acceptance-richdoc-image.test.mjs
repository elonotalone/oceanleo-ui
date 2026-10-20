/**
 * V1-r2: image-only and intentionally empty verified documents must open.
 * This is the parent W1-r3 repro, with the real sanitizer (not an identity stub).
 * Missing URL / unreadable bytes stay blocked.
 */
import "./helpers/w1-jsdom-window.mjs";
import assert from "node:assert/strict";
import test from "node:test";

import {
  admitRichDocEditorSource,
  loadRichDocHtml,
  richDocHtmlHasBody,
} from "../src/shell/doc-editors/rich-doc-model.ts";

const SCAN_HTML =
  '<p><img src="https://files.example.test/page.png" alt="扫描页"></p>';

function scanItem(overrides = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    key: "artifact:00000000-0000-4000-8000-000000000001",
    source: "artifact",
    artifactId: "00000000-0000-4000-8000-000000000001",
    revisionId: "rev-scan",
    title: "扫描页",
    kind: "document",
    siteId: "word",
    favorite: false,
    url: "https://files.example.test/scan.html",
    previewUrl: "https://files.example.test/scan.html",
    content: "",
    meta: {
      filename: "scan.html",
      mime: "text/html",
    },
    ...overrides,
  };
}

test("image-only HTML loads as a verified document, not source:empty", async () => {
  const item = scanItem();
  const loaded = await loadRichDocHtml(item, undefined, {
    fetchText: async () => `${SCAN_HTML}<script>alert(1)</script>`,
  });
  assert.equal(loaded.error, "");
  assert.notEqual(loaded.source, "empty");
  assert.equal(richDocHtmlHasBody(loaded.html), true);
  assert.match(loaded.html, /img/i);
  assert.match(loaded.html, /扫描页|page\.png/);
  assert.doesNotMatch(loaded.html, /<script/i);
  assert.equal(admitRichDocEditorSource(loaded, item).ok, true);
});

test("durable richdoc without a URL still refuses a blank substitute", async () => {
  const item = scanItem({
    url: "",
    previewUrl: "",
    content: "",
    meta: {},
  });
  const loaded = await loadRichDocHtml(item);
  assert.equal(loaded.source, "empty");
  assert.match(loaded.error, /缺少可验证的 source\/full 内容/);
  assert.equal(admitRichDocEditorSource(loaded, item).ok, false);
});
