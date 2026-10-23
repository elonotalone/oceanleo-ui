import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  documentExcerptSource,
  itemUsesTextDocumentCard,
  storedTextExcerpt,
  textExcerptFromSource,
} from "../src/shell/document-cover-excerpt.ts";

// 与 backend/tests/test_typed_upload_text_excerpt.py 同一组向量：上传时存下的摘要和
// 卡片现算的摘要必须一样，否则同一份文档换个来源就变样。
export const EXCERPT_VECTORS = [
  ["---\ntitle: x\n---\n# 备案表单修改与提交清单\n\n- [ ] 第一项 **加粗**\n2. 第二项 [链接](https://a.test)\n", "备案表单修改与提交清单\n第一项 加粗\n第二项 链接"],
  ["| 列一 | 列二 |\n| --- | --- |\n| a | b |\n***\n> 引用 `代码`\n", "列一 · 列二\na · b\n引用 代码"],
  ["my_file_name and *em* and _u_\n```js\nconst a = 1;\n```\n", "my_file_name and em and u\nconst a = 1;"],
  ["﻿line1\r\nline2\r\n\r\n<!-- hidden -->\nline3", "line1\nline2\nline3"],
];

test("text excerpts strip markdown marks and keep the first lines (shared vectors)", () => {
  for (const [source, expected] of EXCERPT_VECTORS) {
    assert.equal(textExcerptFromSource(source), expected);
  }
  const many = Array.from({ length: 20 }, (_, index) => `line ${index}`).join("\n");
  assert.equal(textExcerptFromSource(many).split("\n").length, 8);
  assert.equal(Array.from(textExcerptFromSource("字".repeat(2000))).length, 600);
});

const item = (overrides = {}) => ({
  key: "doc", id: "doc", artifactId: "doc", revisionId: "r1", source: "artifact",
  title: "需签字盖章页清单", kind: "document", artifactType: "document", siteId: "", favorite: false,
  meta: {}, ...overrides,
});

test("documents are text cards and never take their excerpt from a rendered PNG", () => {
  assert.equal(itemUsesTextDocumentCard(item(), "document"), true);
  assert.equal(itemUsesTextDocumentCard(item({ artifactType: "pdf" }), "document"), false, "PDF keeps its page cover");
  assert.equal(itemUsesTextDocumentCard(item({ artifactType: "deck" }), "ppt"), false);
  assert.equal(itemUsesTextDocumentCard({ key: "l", title: "notes.txt", kind: "file", meta: {} }, "file"), true);
  const edited = item({
    artifact: { artifactType: "document", renditions: {
      thumbnail: { url: "https://x.test/page.png", mediaType: "image/png" },
      preview: { url: "https://x.test/page.png", mediaType: "image/png" },
      source: { url: "https://x.test/notes.md", mediaType: "text/markdown" },
    } },
  });
  assert.deepEqual(documentExcerptSource(edited), { kind: "text", url: "https://x.test/notes.md" });
  const pngOnly = item({ artifact: { artifactType: "document", renditions: {
    thumbnail: { url: "https://x.test/page.png", mediaType: "image/png" },
  } } });
  assert.equal(documentExcerptSource(pngOnly), null);
  const docx = item({ artifact: { artifactType: "document", renditions: {
    source: { url: "https://x.test/a.docx", mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  } } });
  assert.deepEqual(documentExcerptSource(docx), { kind: "docx", url: "https://x.test/a.docx" });
  assert.equal(storedTextExcerpt(item({ meta: { text_excerpt: "  开头几行  " } })), "开头几行");
});

test("a stored meta.text_excerpt renders immediately without any network read", async () => {
  const require = createRequire(import.meta.url);
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvas = fabricRequire.resolve("canvas");
  const previous = require.cache[canvas];
  require.cache[canvas] = { id: canvas, filename: canvas, loaded: true, exports: {} };
  const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previous) require.cache[canvas] = previous; else delete require.cache[canvas];
  const dom = new JSDOM("<!doctype html><body></body>");
  for (const name of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event"]) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "window" ? dom.window : dom.window[name] });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let packageReads = 0;
  globalThis.__w05PackageRead = () => { packageReads += 1; };
  const { DocumentShelfCover } = await import(await compileModule("src/shell/document-shelf-cover.tsx", {
    "../i18n/ui/useUI": dataModule("export function useUI() { return (value) => value; }"),
    "../lib/media-proxy": dataModule("export function canvasSafeUrl(url) { return url; }"),
    "./doc-editors/office-file": dataModule("export function officePackageKindForItem(){ return 'docx'; } export async function fetchValidatedOfficePackage(){ globalThis.__w05PackageRead(); throw new Error('no'); }"),
  }));
  const { createRoot } = await import("react-dom/client");
  const node = dom.window.document.createElement("div");
  const root = createRoot(node);
  const realFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = async () => { fetches += 1; return new Response("network text"); };
  try {
    for (const source of [
      { url: "https://x.test/notes.txt", mediaType: "text/plain" },
      { url: "https://x.test/a.docx", mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    ]) {
      await act(async () => root.render(React.createElement(DocumentShelfCover, {
        item: item({
          key: source.url, artifactId: source.url, meta: { text_excerpt: "备案表单修改与提交清单\n第一项" },
          artifact: { artifactType: "document", renditions: { source } },
        }),
        kind: "document", alt: "doc",
      })));
      assert.equal(node.querySelector("[data-document-cover]")?.getAttribute("data-document-excerpt-source"), "meta");
      assert.match(node.textContent, /需签字盖章页清单[\s\S]*备案表单修改与提交清单\s*第一项/);
    }
    assert.equal(fetches, 0, "no text fetch when the excerpt is stored");
    assert.equal(packageReads, 0, "no Word package read when the excerpt is stored");
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = realFetch;
    delete globalThis.__w05PackageRead;
    dom.window.close();
  }
});

test("library cards, document covers and the empty state use site tokens, never light-only colours", () => {
  for (const path of [
    "src/shell/document-shelf-cover.tsx",
    "src/shell/workspace-library-thumbnail.tsx",
    "src/shell/workspace-library-view.tsx",
  ]) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\bbg-white\b|\btext-(?:stone|neutral|gray)-\d|\bbg-(?:stone|neutral|gray)-\d|\btext-black\b/, path);
  }
  const cover = readFileSync(new URL("../src/shell/document-shelf-cover.tsx", import.meta.url), "utf8");
  assert.match(cover, /bg-\[var\(--card,#fff\)\]/);
  assert.doesNotMatch(cover, /正在读取内容预览/);
});
