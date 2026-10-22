/**
 * V1 acceptance: an existing document with bytes must hydrate; a missing
 * source must fail closed. Never treat a blank canvas as a successful load
 * that could be saved over the original.
 */
import assert from "node:assert/strict";
import { File as NodeFile } from "node:buffer";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";

if (!globalThis.File) globalThis.File = NodeFile;

const require = createRequire(import.meta.url);

async function installDom() {
  if (globalThis.window?.document) return;
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvas = require.cache[canvasEntry];
  require.cache[canvasEntry] = {
    id: canvasEntry,
    filename: canvasEntry,
    loaded: true,
    exports: {},
  };
  const { JSDOM } = await import(
    pathToFileURL(fabricRequire.resolve("jsdom")).href
  );
  if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
  else delete require.cache[canvasEntry];
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://word.oceanleo.com/library",
  });
  for (const [name, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    Event: dom.window.Event,
    Blob: dom.window.Blob,
  })) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
}

function artifactItem(patch) {
  return {
    key: "artifact:accept",
    source: "artifact",
    id: "accept-1",
    title: "需签字盖章页清单（只打第3页）",
    kind: "document",
    siteId: "word",
    favorite: false,
    artifactId: "art-accept",
    revisionId: "rev-accept",
    meta: {},
    ...patch,
  };
}

function isBlankGrid(sheets) {
  return (sheets || []).every((sheet) =>
    (sheet.rows || []).every((row) =>
      (row || []).every((cell) => !String(cell ?? "").trim()),
    ),
  );
}

test("richdoc hydrates markdown/html/text and refuses a blank artifact substitute", async () => {
  await installDom();
  const { loadRichDocHtml, loadRichDocFile } = await import(
    "../src/shell/doc-editors/rich-doc-model.ts"
  );

  const markdown = await loadRichDocHtml(
    artifactItem({
      content:
        "# 需签字盖章页清单\n\n按 2026 年 9 月已受理做法：备案系统上传 1 只需一份已签字盖章的自评报告。",
      meta: { filename: "list.md", mime: "text/markdown" },
    }),
  );
  assert.equal(markdown.error, "");
  assert.equal(markdown.source, "inline");
  assert.match(markdown.html, /需签字盖章页清单/);
  assert.doesNotMatch(markdown.html, /^<p><\/p>$/);

  const fromFile = await loadRichDocFile(
    new File(
      ["正文必须出现在编辑器里，不能变成空白页。"],
      "notes.md",
      { type: "text/markdown" },
    ),
  );
  assert.equal(fromFile.error, "");
  assert.match(fromFile.html, /正文必须出现在编辑器里/);

  const htmlFile = await loadRichDocFile(
    new File(["<h1>合同封面</h1><p>只打第 3 页</p>"], "cover.html", {
      type: "text/html",
    }),
  );
  assert.equal(htmlFile.error, "");
  assert.match(htmlFile.html, /合同封面/);

  const textFile = await loadRichDocFile(
    new File(["plain body"], "notes.txt", { type: "text/plain" }),
  );
  assert.equal(textFile.error, "");
  assert.match(textFile.html, /plain body/);

  const missing = await loadRichDocHtml(
    artifactItem({
      url: "",
      previewUrl: "",
      content: "",
      meta: {},
    }),
  );
  assert.equal(missing.source, "empty");
  assert.match(missing.error, /缺少可验证的 source\/full 内容/);
  assert.equal(missing.html, "<p></p>");
});

test("richdoc sanitizer strips XSS and never returns raw HTML when unavailable", async () => {
  const { sanitizeRichDocHtml } = await import(
    "../src/shell/doc-editors/rich-doc-model.ts"
  );
  const dirty =
    '<p>需签字盖章页清单</p><script>alert(1)</script><img src=x onerror="alert(1)">';
  const cleaned = await sanitizeRichDocHtml(dirty);
  assert.match(cleaned, /需签字盖章页清单/);
  assert.doesNotMatch(cleaned, /<script/i);
  assert.doesNotMatch(cleaned, /onerror/i);
  await assert.rejects(
    () =>
      sanitizeRichDocHtml(dirty, {
        isSupported: false,
        sanitize: (html) => html,
      }),
    /安全过滤器暂时不可用/,
  );
  await assert.rejects(
    () => sanitizeRichDocHtml(dirty, { sanitize: () => ({ not: "string" }) }),
    /安全过滤器暂时不可用/,
  );
  await assert.rejects(() => sanitizeRichDocHtml(dirty, {}), /安全过滤器暂时不可用/);
});

test("grid csv hydrates cells from existing content", async () => {
  const { loadGridSheets, loadGridFile } = await import(
    "../src/shell/doc-editors/grid-model.ts"
  );

  const fromContent = await loadGridSheets(
    artifactItem({
      kind: "sheet",
      content: "城市,销量\n上海,12\n北京,9",
      meta: { filename: "sales.csv", mime: "text/csv" },
    }),
  );
  const joined = fromContent
    .flatMap((sheet) => sheet.rows)
    .flat()
    .join(" ");
  assert.match(joined, /上海/);
  assert.match(joined, /12/);

  const fromFile = await loadGridFile(
    new File(["a,b\n1,2"], "small.csv", { type: "text/csv" }),
  );
  assert.equal(isBlankGrid(fromFile), false);
});

test("existing grid artifact without source must not become a blank workbook", async () => {
  const { loadGridSheets } = await import(
    "../src/shell/doc-editors/grid-model.ts"
  );
  const missing = artifactItem({
    kind: "sheet",
    url: "",
    content: "",
    meta: {},
  });
  let threw = false;
  let sheets = [];
  try {
    sheets = await loadGridSheets(missing);
  } catch (error) {
    threw = true;
    assert.match(String(error.message || error), /缺少可验证|源/);
  }
  if (!threw) {
    assert.equal(
      isBlankGrid(sheets),
      true,
      "unexpected non-blank sheets from a sourceless artifact",
    );
    assert.fail(
      "loadGridSheets returned a blank workbook for an existing artifact with no source; that is the open-blank defect",
    );
  }
});

test("pdf loader refuses a missing source instead of opening blank", async () => {
  const { loadInitialPdfSource } = await import(
    "../src/shell/media-editors/pdf-source.ts"
  );
  await assert.rejects(
    () =>
      loadInitialPdfSource({
        source: "",
        siteId: "pdf",
        title: "missing",
        signal: new AbortController().signal,
        allowBlank: false,
      }),
    /缺少可验证的源文件/,
  );
});

test("vector empty SVG stays empty; a real SVG hydrates", async () => {
  const { loadVectorSource } = await import(
    "../src/shell/vector-editor/vector-source.ts"
  );
  const emptyVector = loadVectorSource({ svg: "" });
  assert.equal(emptyVector.state, "empty");
  assert.equal(emptyVector.project, null);

  const validVector = loadVectorSource({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect width="8" height="8" fill="#111"/><circle cx="15" cy="5" r="4" fill="#c00"/></svg>',
  });
  assert.notEqual(validVector.state, "empty");
  assert.notEqual(validVector.state, "invalid");
  assert.ok(
    validVector.project ||
      ["parsed", "sanitized", "tokenized", "ready", "flattened-only"].includes(
        validVector.state,
      ),
    `valid SVG must hydrate, got state=${validVector.state}`,
  );
});

test("deck and image loaders fail closed on empty source bytes", async () => {
  const { deckProjectUrlFor } = await import(
    await compileModule("src/shell/doc-editors/use-deck-editor.ts", {
      "../i18n/ui/useUI": dataModule(
        "export function useUI(){ return (value) => value; }",
      ),
    })
  );
  const deckUrl = deckProjectUrlFor(
    artifactItem({
      kind: "ppt",
      url: "",
      meta: {},
      artifact: undefined,
    }),
  );
  assert.equal(deckUrl, "");

  const { loadImageProject } = await import(
    await compileModule("src/shell/image-editor/editor-persistence.ts")
  );
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      text: async () => "",
    });
    await assert.rejects(
      () => loadImageProject("https://files.test/image.json"),
      /为空|无效|失败/,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});
