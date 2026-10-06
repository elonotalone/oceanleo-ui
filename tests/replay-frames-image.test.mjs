// W13：图片回放画法。fromRevision 与 fromY 同内容得到等价快照；describeChange；toArtifactJson 往返；
// Frame 只画 <img>/文字/外框（静态检查 + 真渲染）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as Y from "yjs";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { compileModule } from "./helpers/module-bench.mjs";
import {
  IMAGE_COLLAB_ROOT,
  imageDescribeChange,
  imageFromRevision,
  imageFromY,
  imageSafeSrc,
  imageToArtifactJson,
  imageToEntities,
} from "../src/shell/collab/adapters/image.ts";

const canon = (value) =>
  JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([x], [y]) => (x < y ? -1 : 1)))
      : v);
const clone = (v) => JSON.parse(JSON.stringify(v));

function makeSnapshot() {
  return {
    json: {
      version: "6.0.0",
      objects: [
        { type: "Rect", oceanleoId: "bg", oceanleoRole: "background", left: 0, top: 0, width: 1080, height: 1080, fill: "#ffffff" },
        { type: "Image", oceanleoId: "photo", left: 100, top: 120, width: 400, height: 300, scaleX: 1, scaleY: 1, angle: 0, src: "https://example.com/a.png" },
        { type: "Textbox", oceanleoId: "title", left: 80, top: 40, width: 600, height: 60, text: "夏日海报", fill: "#111111", fontSize: 48 },
        { type: "Circle", oceanleoId: "dot", left: 700, top: 700, width: 100, height: 100, fill: "#ff0000", scaleX: 1, scaleY: 1 },
      ],
    },
    doc: { width: 1080, height: 1080 },
    canvasBackground: "#ffffff",
  };
}

function yDocOf(snapshot) {
  const doc = new Y.Doc();
  const state = imageToEntities(snapshot);
  const root = doc.getMap(IMAGE_COLLAB_ROOT);
  doc.transact(() => {
    const order = new Y.Array();
    order.push(state.order);
    const entities = new Y.Map();
    for (const [key, fields] of Object.entries(state.entities)) {
      const ent = new Y.Map();
      for (const [name, value] of Object.entries(fields)) ent.set(name, value);
      entities.set(key, ent);
    }
    const meta = new Y.Map();
    for (const [name, value] of Object.entries(state.meta)) meta.set(name, value);
    root.set("order", order);
    root.set("entities", entities);
    root.set("meta", meta);
  });
  return doc;
}

test("fromRevision（版本 JSON）与 fromY（协同文档）对同一内容得到等价快照", () => {
  const snap = makeSnapshot();
  const project = { schema: "oceanleo.fabric-image.v1", version: 1, updatedAt: "2026-10-06T00:00:00Z", snapshot: snap };
  assert.equal(canon(imageFromRevision(project)), canon(imageFromY(yDocOf(snap))));
  assert.equal(canon(imageFromRevision({ data: snap })), canon(snap));
  assert.equal(imageFromRevision({ nope: 1 }), null);
  assert.equal(imageFromRevision(null), null);
  assert.equal(imageFromY(new Y.Doc()), null);
});

test("describeChange：新增、删除、移动、改文字、换图、改样式、改画布", () => {
  const base = makeSnapshot();
  const next = (fn) => {
    const s = clone(base);
    fn(s);
    return s;
  };
  assert.equal(imageDescribeChange(null, base), "创建了画布");
  assert.equal(imageDescribeChange(base, base), null);
  assert.equal(
    imageDescribeChange(base, next((s) => s.json.objects.push({ type: "Textbox", oceanleoId: "n", text: "x" }))),
    "新增了一个文字图层",
  );
  assert.equal(
    imageDescribeChange(base, next((s) => s.json.objects.push({ type: "Image", oceanleoId: "n" }))),
    "新增了一个图片图层",
  );
  assert.equal(
    imageDescribeChange(base, next((s) => s.json.objects.push({ type: "Rect", oceanleoId: "n" }, { type: "Rect", oceanleoId: "m" }))),
    "新增了 2 个图层",
  );
  assert.equal(imageDescribeChange(base, next((s) => (s.json.objects = s.json.objects.slice(0, 3)))), "删除了 1 个图层");
  assert.equal(imageDescribeChange(base, next((s) => (s.json.objects[1].left = 300))), "移动了一个图层");
  assert.equal(imageDescribeChange(base, next((s) => (s.json.objects[1].scaleX = 2))), "调整了一个图层的大小或角度");
  assert.equal(imageDescribeChange(base, next((s) => (s.json.objects[2].text = "秋"))), "改了文字内容");
  assert.equal(imageDescribeChange(base, next((s) => (s.json.objects[1].src = "https://example.com/b.png"))), "换了一张图片");
  assert.equal(imageDescribeChange(base, next((s) => (s.json.objects[3].fill = "#00ff00"))), "改了一个图层的样式");
  assert.equal(imageDescribeChange(base, next((s) => s.json.objects.reverse())), "调整了图层顺序");
  assert.equal(imageDescribeChange(base, next((s) => (s.doc.width = 1200))), "改了画布大小");
  assert.equal(imageDescribeChange(base, next((s) => (s.canvasBackground = "#000000"))), "改了画布底色");
});

test("toArtifactJson 往返：还原成编辑器能打开的工程 JSON，再读回等价", () => {
  const snap = makeSnapshot();
  const artifact = imageToArtifactJson(snap);
  assert.equal(artifact.schema, "oceanleo.fabric-image.v1");
  assert.equal(canon(imageFromRevision(artifact)), canon(snap));
  assert.equal(imageToArtifactJson(null), null);
});

test("imageSafeSrc 只放行 http(s) 与位图 data URL", () => {
  assert.equal(imageSafeSrc("https://example.com/a.png"), "https://example.com/a.png");
  assert.ok(imageSafeSrc("data:image/png;base64,AAAA"));
  assert.equal(imageSafeSrc("data:image/svg+xml;base64,AAAA"), null);
  assert.equal(imageSafeSrc("javascript:alert(1)"), null);
  assert.equal(imageSafeSrc("blob:https://x/1"), null);
  assert.equal(imageSafeSrc(42), null);
});

test("Frame 源码不用 iframe / dangerouslySetInnerHTML / innerHTML", () => {
  const source = readFileSync(new URL("../src/shell/replay/work/frames/image.tsx", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  assert.doesNotMatch(source, /<iframe|dangerouslySetInnerHTML|innerHTML|postMessage/);
});

test("Frame 真渲染：对象外框、<img>、文字；变化的对象带作者颜色描边；恶意地址不进 src", async () => {
  const renderer = (await import(await compileModule("src/shell/replay/work/frames/image.tsx"))).default;
  assert.equal(renderer.kind, "image");
  const prev = makeSnapshot();
  const snap = clone(prev);
  snap.json.objects[2].text = "秋日海报";
  snap.json.objects.push({ type: "Image", oceanleoId: "evil", left: 0, top: 0, width: 10, height: 10, src: "javascript:alert(1)" });
  snap.json.objects.push({ type: "Textbox", oceanleoId: "html", left: 0, top: 0, width: 100, height: 20, text: "<img src=x onerror=alert(1)>", fill: "url(https://evil/x)" });
  const html = renderToStaticMarkup(
    React.createElement(renderer.Frame, { snapshot: snap, prev, width: 400, height: 300, authorColor: "#ff00aa" }),
  );
  assert.match(html, /data-replay-object="photo"/);
  assert.match(html, /src="https:\/\/example.com\/a.png"/);
  assert.match(html, /秋日海报/);
  assert.match(html, /outline:2px solid #ff00aa/);
  assert.doesNotMatch(html, /javascript:/);
  assert.doesNotMatch(html, /url\(https:\/\/evil/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/); // 文字当纯文本
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /data-replay-object="bg"/); // 背景层不当对象画
});
