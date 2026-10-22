// W19 → native-editors W06 —— PDF 不再有免沙箱 frame。
//
// 规范来源：docs/architecture/oceanleo-untrusted-content-isolation.md §4.1、§7.5、§8.1 UC-1、§8.3 UC-3。
// 历史：Chromium 内建 PDF 查看器加任何 sandbox 都不渲染（crbug 413851），所以 PDF 封面 / Library
// 详情只能免沙箱，靠主机白名单兜底。现在两处都改成自家 EmbedPDF(PDFium) 渲染的位图 / 阅读器，
// 不再创建任何 PDF frame，免沙箱豁免与主机白名单随之删除。
// 本文件锁住「不会再回来」：任何人把 PDF 地址重新交给 iframe，都必须先过 UC-1/UC-3 评审。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { inferLibraryKind, normalizeWork } from "../src/shell/library-data.ts";

import { compileModule } from "./helpers/module-bench.mjs";

function source(relativePath) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

const code = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

async function loadCoverModule() {
  return import(await compileModule("src/shell/workspace-library-cover.tsx"));
}

const PDF_URLS = [
  "https://api.oceanleo.com/v1/artifact-renditions/access/abc123",
  "https://p8080-aaa.website.oceanleo.com/x.pdf",
  "https://ws.oceanleo.app/x.pdf",
];

// UC-3：封面的 PDF 不得再进 frame —— 无论地址落在哪个域。
test("W19/1 PDF 封面 plan 走 pdf 位图渲染器，不再按主机白名单降级", async () => {
  const { workspaceCoverPlan } = await loadCoverModule();
  for (const url of PDF_URLS) {
    const plan = workspaceCoverPlan({
      kind: "document",
      url,
      rendition: { purpose: "full", mediaType: "application/pdf", url },
    });
    assert.equal(plan.renderer, "pdf", url);
    assert.equal(plan.failureReason, "");
  }
});

test("W19/1 手工构造的 pdf plan 也渲染不出 iframe / embed / object", async () => {
  const { WorkspaceCoverResource } = await loadCoverModule();
  for (const url of PDF_URLS) {
    const html = renderToStaticMarkup(
      React.createElement(WorkspaceCoverResource, {
        plan: {
          renderer: "pdf",
          url,
          mediaType: "application/pdf",
          format: "pdf",
          fit: "contain",
          sourceAspectRatio: null,
          failureReason: "",
        },
        alt: "cover",
        className: "",
        resourceKey: "k",
        onReady: () => undefined,
        onError: () => undefined,
      }),
    );
    assert.equal(/<iframe|<embed|<object/i.test(html), false, html);
  }
});

test("W19/2 源码里不再有免沙箱 PDF frame 的豁免、白名单与判定函数", () => {
  for (const file of [
    "../src/shell/workspace-library-cover.tsx",
    "../src/shell/library-viewers.tsx",
    "../src/shell/WorkspacePdfCover.tsx",
    "../src/shell/LibraryPdfReader.tsx",
  ]) {
    const text = source(file);
    assert.equal(text.includes("sandbox-exempt"), false, file);
    assert.equal(text.includes("PDF_FRAME_TRUSTED_GATEWAY_HOSTS"), false, file);
    assert.equal(text.includes("isSandboxExemptPdfFrameUrl"), false, file);
  }
  const cover = code(source("../src/shell/workspace-library-cover.tsx"));
  // 封面唯一剩下的 frame 是网站封面，且带 sandbox。
  assert.equal((cover.match(/<iframe/g) || []).length, 1);
  assert.match(cover, /sandbox="allow-scripts"/);
  assert.equal(/pdfFirstPageUrl|#page=1/.test(cover), false);
  const viewers = source("../src/shell/library-viewers.tsx");
  assert.equal((viewers.match(/<iframe/g) || []).length, 1, "只剩 SandboxedWebViewer 那一个 frame");
  assert.match(viewers, /<LibraryPdfReader/);
  for (const file of ["WorkspacePdfCover.tsx", "LibraryPdfReader.tsx"]) {
    assert.equal(/<iframe|<embed|<object/.test(code(source(`../src/shell/${file}`))), false, file);
  }
});

// UC-1 §8.1：这条记录的是事实 —— url 零校验且仅凭 .pdf 后缀路由。封面 / 阅读器因此只经媒体代理取字节、
// 在 wasm 里渲染，绝不把这个地址交给浏览器当文档加载。
test("W19/3 前提：item.url 由调用方给定，本包不做来源校验；PDF 只经 fetchMediaBlob 取字节", () => {
  const hostile = "https://p8080-aaa.website.oceanleo.com/steal.pdf";
  const item = normalizeWork({ id: "w1", url: hostile, site_id: "asset" });
  assert.equal(item.url, hostile);
  assert.equal(item.kind, "document");
  assert.equal(inferLibraryKind({ url: hostile }), "document");
  assert.match(source("../src/shell/WorkspacePdfCover.tsx"), /fetchMediaBlob\(url,/);
  assert.match(source("../src/shell/library-viewers.tsx"), /fetchMediaBlobRefreshing\(url,/);
});
