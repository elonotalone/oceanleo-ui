/**
 * W08: stored vector_image (SVG) artifacts open in the merged image editor as
 * editable Fabric layers, are saved as a new vector revision (svg delivery +
 * Fabric project + png preview), and route to ImageRoute.
 */
import "./helpers/w1-jsdom-window.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";

// Fabric measures text on a canvas 2D context; jsdom has none, so give it a
// deterministic fake. Everything else (SVG parse, JSON, toSVG) is real Fabric.
window.HTMLCanvasElement.prototype.getContext = function getContext() {
  const metrics = (txt) => ({
    width: String(txt).length * 8,
    actualBoundingBoxLeft: 0,
    actualBoundingBoxRight: String(txt).length * 8,
    actualBoundingBoxAscent: 12,
    actualBoundingBoxDescent: 3,
    fontBoundingBoxAscent: 12,
    fontBoundingBoxDescent: 3,
  });
  return new Proxy({ canvas: this }, {
    get: (target, key) =>
      key in target ? target[key] : key === "measureText" ? metrics : () => undefined,
    set: (target, key, value) => {
      target[key] = value;
      return true;
    },
  });
};
for (const name of ["XMLSerializer", "SVGElement", "getComputedStyle", "HTMLCanvasElement", "Image", "CSSStyleDeclaration"]) {
  if (!(name in globalThis)) globalThis[name] = window[name];
}

const fabric = await import("../node_modules/fabric/dist/index.mjs");
const {
  exportVectorSvg,
  isVectorImageItem,
  sanitizeVectorSource,
  vectorSvgToSnapshot,
} = await import("../src/shell/image-editor/vector-svg-scene.ts");
const { createFabricImageProject, parseFabricImageProject } = await import(
  "../src/shell/image-editor/editor-persistence.ts"
);
const { SNAPSHOT_PROPS } = await import("../src/shell/image-editor/editor-objects.ts");
const { editorCapabilityFor } = await import("../src/shell/workbench-routes.ts");
const { READ_ONLY_ARTIFACT_TYPES } = await import("../src/shell/workbench-capability-registry.ts");

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(join(ROOT, relative), "utf8");

const HOSTILE_SVG = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 200 100" width="200" height="100">
  <script>alert(1)</script>
  <foreignObject x="0" y="0" width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>
  <image href="https://evil.test/track.png" x="0" y="0" width="5" height="5"/>
  <g id="logo" transform="translate(10,10)" onclick="alert(2)">
    <rect id="r1" x="0" y="0" width="50" height="30" fill="#ff0000"/>
    <path id="p1" d="M0 0 L40 40 L0 40 z" fill="#0000ff"/>
  </g>
  <a xlink:href="javascript:alert(3)"><circle cx="150" cy="30" r="10" fill="green"/></a>
  <text x="20" y="80" font-size="16" fill="#111111">Hello</text>
</svg>`;

function canvasFor(snapshot) {
  const canvas = new fabric.StaticCanvas(undefined, {
    width: snapshot.doc.width,
    height: snapshot.doc.height,
  });
  return canvas;
}

test("the sanitizer strips script, event attributes, foreignObject and external refs", () => {
  const { svg, removed } = sanitizeVectorSource(HOSTILE_SVG);
  assert.ok(removed >= 4, `removed ${removed}`);
  for (const bad of [/<script/i, /foreignObject/i, /onclick/i, /evil\.test/i, /javascript:/i]) {
    assert.equal(bad.test(svg), false, String(bad));
  }
  assert.match(svg, /<rect/);
  // Inline CSS is not an external reference: fills/strokes in style="" survive.
  const styled = sanitizeVectorSource(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect style="fill: red; stroke: #000" width="5" height="5"/><rect style="fill:url(http://evil.test/x.svg#a)" width="2" height="2"/></svg>',
  ).svg;
  assert.match(styled, /style="fill: red; stroke: #000"/);
  assert.equal(styled.includes("evil.test"), false);
  assert.throws(() => sanitizeVectorSource(""), /为空/);
  assert.throws(() => sanitizeVectorSource("not svg at all"), /无法解析|没有/);
});

test("path, rect, circle, text and group open as editable layers (groups flattened, text is IText)", async () => {
  const { snapshot, removed, layerCount } = await vectorSvgToSnapshot(fabric, HOSTILE_SVG);
  assert.ok(removed > 0);
  assert.deepEqual(snapshot.doc, { width: 200, height: 100 });
  const [docbg, ...layers] = snapshot.json.objects;
  assert.equal(docbg.oceanleoRole, "docbg");
  assert.equal(layers.length, layerCount);
  const types = layers.map((layer) => layer.type).sort();
  assert.deepEqual(types, ["Circle", "IText", "Path", "Rect"].sort());
  assert.equal(new Set(layers.map((layer) => layer.oceanleoId)).size, layers.length);
  // The group transform (translate 10,10) is baked into the child, not lost.
  const rect = layers.find((layer) => layer.type === "Rect");
  assert.ok(rect.left > 5 && rect.left < 15, `rect.left ${rect.left}`);
  assert.equal(layers.find((layer) => layer.type === "IText").text, "Hello");
  assert.equal(JSON.stringify(snapshot).includes("evil.test"), false);
});

test("edit + save: svg delivery from the canvas, fabric project round-trips, reopen is identical", async () => {
  const { snapshot } = await vectorSvgToSnapshot(fabric, HOSTILE_SVG);
  const canvas = canvasFor(snapshot);
  await canvas.loadFromJSON(snapshot.json);
  const objects = canvas.getObjects();
  const rect = objects.find((o) => o.type === "rect" && o.oceanleoRole !== "docbg");
  const path = objects.find((o) => o.type === "path");
  const text = objects.find((o) => o.type === "i-text" || o.type === "IText" || o.text);
  // fill / stroke / position / scale / rotate / delete / text edit
  rect.set({ fill: "#00ff00", stroke: "#000000", strokeWidth: 2, left: 70, scaleX: 2, angle: 15 });
  text.set({ text: "改过的文字" });
  canvas.remove(path);

  const svg = exportVectorSvg(canvas, snapshot.doc);
  assert.match(svg, /^<svg/);
  assert.match(svg, /viewBox="0 0 200 100"/);
  assert.match(svg, /改过的文字/);
  assert.match(svg, /rgb\(0,255,0\)|#00ff00/i);
  assert.equal(svg.includes("<path"), false, "deleted path is gone");
  // page background is editor chrome, not part of the artwork
  assert.equal(/fill: rgb\(255,255,255\)/.test(svg), false);
  for (const bad of [/<script/i, /foreignObject/i, /http:\/\/evil/i]) assert.equal(bad.test(svg), false);

  // Fabric project (editor project) round trip
  const saved = canvas.toObject([...SNAPSHOT_PROPS]);
  const project = createFabricImageProject(
    { json: saved, doc: snapshot.doc, canvasBackground: snapshot.canvasBackground },
    "2026-10-22T00:00:00.000Z",
  );
  const reopened = parseFabricImageProject(JSON.parse(JSON.stringify(project)));
  assert.ok(reopened);
  const canvas2 = canvasFor(snapshot);
  await canvas2.loadFromJSON(reopened.snapshot.json);
  assert.equal(exportVectorSvg(canvas2, snapshot.doc), svg, "reopen produces identical svg");
  assert.deepEqual(canvas2.toObject([...SNAPSHOT_PROPS]), saved);
});

test("the stored original is never rewritten: load does not mutate the input text", async () => {
  const before = HOSTILE_SVG;
  await vectorSvgToSnapshot(fabric, before);
  assert.equal(before, HOSTILE_SVG);
});

test("vector revision save commits svg delivery + fabric project + png preview on vector_image", () => {
  const persistence = read("src/shell/image-editor/editor-persistence.ts");
  assert.match(persistence, /commitsVectorRevision/);
  assert.match(persistence, /sourceFormat: "svg"/);
  assert.match(persistence, /sourceMediaType: "image\/svg\+xml"/);
  assert.match(persistence, /artifactType: "vector_image"/);
  assert.match(persistence, /createPreview: async \(\) => vector!\.createPreview\(\)/);
  assert.match(persistence, /project: \{ schema: IMAGE_PROJECT_SCHEMA, data: snapshot \}/);
  const hook = read("src/shell/image-editor/use-fabric-image-editor.ts");
  assert.match(hook, /vectorSvgToSnapshot\(fabric, svgText\)/);
  assert.match(hook, /exportVectorSvg\(canvas, doc\)/);
  assert.equal(isVectorImageItem({ artifactType: "vector_image" }), true);
  assert.equal(isVectorImageItem({ artifactType: "single_file_image" }), false);
});

test("routing: vector_image is no longer read-only and goes to the image editor", () => {
  assert.equal(READ_ONLY_ARTIFACT_TYPES.has("vector_image"), false);
  assert.equal(READ_ONLY_ARTIFACT_TYPES.has("chart"), true);
  const routes = read("src/shell/workbench-routes.ts");
  assert.equal(routes.includes("矢量图（SVG）暂不支持在线编辑"), false);
  assert.equal(routes.includes("VECTOR_IMAGE_READ_ONLY_REASON"), false);
  const revisionId = "vec-r1";
  const rendition = (purpose, url, mediaType, format) => ({
    purpose, revisionId, url, mediaType, format, expiresAt: null, rendererVersion: null,
    width: 200, height: 100, durationMs: null, byteSize: 900, digest: "sha256:abc",
  });
  const artifact = {
    schema: "oceanleo.artifact.v1",
    artifactId: "vec-a",
    revisionId,
    artifactType: "vector_image",
    roles: ["template"],
    owner: { principalId: "platform", visibility: "public", originSiteKey: "logo", originAppId: "x", originFunctionId: null },
    access: { canRead: true, canPreview: true, canEdit: false, canFork: true, canInsert: true, canReplace: true, canFavorite: true, canBind: true, canExportSource: true },
    editability: "bounded",
    editorCapability: "vector-editor",
    sourceFormat: "svg",
    title: "品牌主标",
    favorite: false,
    renditions: {
      preview: rendition("preview", "https://signed.test/p.webp", "image/webp", "webp"),
      source: rendition("source", "https://signed.test/s.svg", "image/svg+xml", "svg"),
    },
    scene: null,
    provenance: { id: "p", sourceKind: "owned", licenseCode: "OCEANLEO-AIGEN", licenseUrl: "", attribution: "", rightsAsserted: true },
    bindings: [],
    integrity: { ok: true, code: "ok", reason: "" },
    createdAt: null,
  };
  const item = {
    key: "artifact:vec-a", source: "artifact", id: "vec-a", title: "品牌主标", kind: "image",
    siteId: "logo", url: "https://signed.test/s.svg", previewUrl: "https://signed.test/p.webp",
    favorite: false, meta: {}, artifactId: "vec-a", revisionId, artifactType: "vector_image", artifact,
  };
  const capability = editorCapabilityFor(item);
  assert.equal(capability.available, true, capability.reason || "");
  assert.equal(capability.route.type, "image");
});
