// W13：矢量图回放画法（只画版本前后；SVG 只经 <img data:image/svg+xml;base64>，绝不进 DOM）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compileModule } from "./helpers/module-bench.mjs";
import {
  vectorDescribeChange,
  vectorFromRevision,
  vectorImageSrc,
  vectorShapeCount,
  vectorToArtifactJson,
} from "../src/shell/collab/adapters/vector.ts";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="4" height="4"/><circle r="2"/></svg>';
const EVIL = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect onload="alert(2)" width="1" height="1"/></svg>';

test("fromRevision 认 SVG 文本、对象里的 svg 字段、已托管地址；认不出来返回 null", () => {
  assert.deepEqual(vectorFromRevision(SVG), { svg: SVG });
  assert.deepEqual(vectorFromRevision({ svg: SVG }), { svg: SVG });
  assert.deepEqual(vectorFromRevision({ content: SVG }), { svg: SVG });
  assert.deepEqual(vectorFromRevision({ url: "https://example.com/a.svg" }), { url: "https://example.com/a.svg" });
  assert.equal(vectorFromRevision({ url: "javascript:alert(1)" }), null);
  assert.equal(vectorFromRevision("not svg"), null);
  assert.equal(vectorFromRevision(null), null);
  assert.equal(vectorFromRevision({}), null);
});

test("describeChange：新增图形、删除图形、改了、创建", () => {
  const more = SVG.replace("</svg>", '<path d="M0 0"/></svg>');
  const a = vectorFromRevision(SVG);
  assert.equal(vectorShapeCount(a), 2);
  assert.equal(vectorDescribeChange(null, a), "创建了矢量图");
  assert.equal(vectorDescribeChange(a, a), null);
  assert.equal(vectorDescribeChange(a, vectorFromRevision(more)), "新增了 1 个图形");
  assert.equal(vectorDescribeChange(vectorFromRevision(more), a), "删除了 1 个图形");
  assert.equal(vectorDescribeChange(a, vectorFromRevision(SVG.replace('width="4"', 'width="5"'))), "改了矢量图");
});

test("imageSrc：SVG 只变成 base64 data URI，原文往返无损", () => {
  const src = vectorImageSrc(vectorFromRevision(SVG));
  assert.match(src, /^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/);
  assert.equal(Buffer.from(src.split(",")[1], "base64").toString("utf8"), SVG);
  const cjk = SVG.replace("</svg>", "<text>矢量图</text></svg>");
  assert.equal(Buffer.from(vectorImageSrc({ svg: cjk }).split(",")[1], "base64").toString("utf8"), cjk);
  assert.equal(vectorImageSrc({ url: "javascript:alert(1)" }), null);
  assert.equal(vectorImageSrc(null), null);
});

test("toArtifactJson 往返：交出 SVG 文本，再读回等价", () => {
  const snap = vectorFromRevision(SVG);
  const artifact = vectorToArtifactJson(snap);
  assert.deepEqual(vectorFromRevision(artifact), snap);
  assert.equal(vectorToArtifactJson(null), null);
});

test("Frame 源码不用 iframe / dangerouslySetInnerHTML / innerHTML", () => {
  const source = readFileSync(new URL("../src/shell/replay/work/frames/vector.tsx", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  assert.doesNotMatch(source, /<iframe|dangerouslySetInnerHTML|innerHTML|postMessage/);
});

test("Frame 真渲染：恶意 SVG 不进 DOM，页面里没有 <svg>/<script>，只有 <img src=data:…>", async () => {
  const renderer = (await import(await compileModule("src/shell/replay/work/frames/vector.tsx"))).default;
  assert.equal(renderer.kind, "vector");
  const evil = vectorFromRevision(EVIL);
  const before = vectorFromRevision(SVG);
  const html = renderToStaticMarkup(React.createElement(renderer.Frame, { snapshot: evil, prev: before, width: 400, height: 300, authorColor: "#ff00aa" }));
  assert.equal((html.match(/<img /g) || []).length, 2);
  assert.match(html, /src="data:image\/svg\+xml;base64,/);
  assert.doesNotMatch(html, /<svg|<script|alert\(/);
  assert.match(html, /outline:2px solid #ff00aa/);
  const single = renderToStaticMarkup(React.createElement(renderer.Frame, { snapshot: before, width: 400, height: 300 }));
  assert.equal((single.match(/<img /g) || []).length, 1);
});
