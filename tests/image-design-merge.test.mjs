/**
 * W08 (native editors 2026-10-22): the design canvas and the image editor are
 * one editor and one material type.
 *
 *  - DesignCanvasLocalRoute is gone; ImageRoute opens design-document projects.
 *  - canvas / design stored items alias to `image` at read time, no rewrite.
 *  - ImageRoute has a single mode (no Normal/Pro split, no iframe).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { blankDesignDocument } from "../src/shell/design-canvas/blank-design-document.ts";
import {
  createFabricImageProject,
  parseFabricImageProject,
} from "../src/shell/image-editor/editor-persistence.ts";
import {
  designAssetUrl,
  designDocumentToSnapshot,
  isDesignDocumentItem,
  looksLikeDesignDocument,
} from "../src/shell/image-editor/design-document-snapshot.ts";
import { normalizeImageEditorSnapshot } from "../src/shell/image-editor/image-document-contract.ts";
import {
  aliasLegacyKind,
  displayKindFor,
  isLegacyDesignItem,
} from "../src/shell/material-kind-alias.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(join(ROOT, relative), "utf8");

test("DesignCanvasLocalRoute and its second-editor plumbing are deleted", () => {
  for (const gone of [
    "src/shell/advanced-routes/DesignCanvasLocalRoute.tsx",
    "src/shell/design-canvas/use-local-design-canvas.ts",
    "src/shell/design-canvas/design-command-surface.ts",
    "src/shell/design-canvas/design-document-fabric.ts",
    "src/shell/image-editor/design-mode/image-plugin-mode.ts",
  ]) {
    assert.equal(existsSync(join(ROOT, gone)), false, `${gone} should be deleted`);
  }
});

test("ImageRoute is single mode: no iframe, no pro branch, no mode adapter", () => {
  const route = read("src/shell/advanced-routes/ImageRoute.tsx");
  assert.equal(/<iframe/i.test(route), false);
  assert.equal(/mode:\s*bindImageModeAdapter|usePluginMode|PluginModeSwitchGate/.test(route), false);
  assert.equal(/["']pro["']/.test(route), false);
  assert.equal(/DesignCanvasLocalRoute/.test(route), false);
});

test("the image editor hook opens design-document projects", () => {
  const hook = read("src/shell/image-editor/use-fabric-image-editor.ts");
  assert.match(hook, /isDesignDocumentItem\(item\)/);
  assert.match(hook, /designDocumentToSnapshot\(/);
  assert.match(hook, /hydrateDesignCanvasSource\(/);
  // A design project must never be saved through the image-scene composite path.
  assert.match(hook, /composite_image" && !isDesignDocumentItem\(head\)/);
});

test("alias maps legacy canvas/design to image and leaves real canvases alone", () => {
  const design = {
    kind: "canvas",
    meta: { editor: "design-canvas", designDocument: { schema: "oceanleo.design-document.v1" } },
  };
  assert.equal(displayKindFor(design), "image");
  assert.equal(displayKindFor({ kind: "canvas", meta: { editor_project_schema: "oceanleo.design-document.v1" } }), "image");
  assert.equal(displayKindFor({ kind: "canvas", artifactType: "composite_image", meta: {} }), "image");
  assert.equal(displayKindFor({ kind: "canvas", artifactType: "workflow", meta: {} }), "canvas");
  assert.equal(displayKindFor({ kind: "canvas", meta: {} }), "canvas");
  assert.equal(displayKindFor({ kind: "image", meta: {} }), "image");
  assert.equal(isLegacyDesignItem(null), false);
  assert.equal(aliasLegacyKind("design"), "image");
  assert.equal(aliasLegacyKind("design-canvas"), "image");
  assert.equal(aliasLegacyKind("website"), "website");
  // Read-time only: the item is not mutated.
  assert.equal(design.kind, "canvas");
});

test("a stored design-document converts to an image scene with its layers", () => {
  const project = blankDesignDocument("本地设计稿 W10");
  assert.equal(looksLikeDesignDocument(project), true);
  const result = designDocumentToSnapshot(project);
  const snapshot = normalizeImageEditorSnapshot(result.snapshot);
  assert.ok(snapshot, "converted scene must satisfy the image snapshot contract");
  assert.deepEqual(snapshot.doc, {
    width: project.document.width,
    height: project.document.height,
  });
  const objects = snapshot.json.objects;
  assert.equal(objects[0].oceanleoRole, "docbg");
  const stored = project.document.elements.filter(
    (element) => !["image", "icon", "chart-embed", "group"].includes(element.type),
  );
  assert.equal(objects.length, stored.length + 1);
  assert.deepEqual(
    objects.slice(1).map((object) => object.oceanleoId).sort(),
    stored.map((element) => element.id).sort(),
  );
});

function richProject() {
  const project = JSON.parse(JSON.stringify(blankDesignDocument("本地设计稿 W10")));
  const base = { x: 100, y: 200, width: 400, height: 200, rotationDeg: 15, opacity: 0.5 };
  project.document.elements.push(
    { id: "img-x", type: "image", z: 1001, assetId: "assets/image/a.webp", fit: "cover", alt: "产品", ...base },
    { id: "icon-x", type: "icon", z: 1002, assetId: "assets/icon/b.svg", ...base },
    { id: "chart-x", type: "chart-embed", z: 1003, assetId: "assets/chart/c.png", ...base },
    { id: "grp-x", type: "group", z: 1004, x: 0, y: 0, width: 10, height: 10, childIds: ["img-x", "icon-x"] },
  );
  return project;
}

const ASSETS = {
  "assets/image/a.webp": { url: "https://cdn.test/a.webp", width: 800, height: 400 },
  "assets/icon/b.svg": { url: "https://cdn.test/b.svg", width: 100, height: 100 },
  "assets/chart/c.png": { url: "https://cdn.test/c.png", width: 400, height: 200 },
};

test("image, icon and chart-embed become Fabric image layers with asset refs, crop, rotation, opacity", () => {
  const project = richProject();
  const result = designDocumentToSnapshot(project, ASSETS);
  assert.deepEqual(result.unsupported, []);
  const byId = Object.fromEntries(result.snapshot.json.objects.map((o) => [o.oceanleoId, o]));
  const img = byId["img-x"];
  assert.equal(img.type, "Image");
  assert.equal(img.src, "https://cdn.test/a.webp");
  assert.equal(img.oceanleoDesignAssetId, "assets/image/a.webp");
  assert.equal(img.angle, 15);
  assert.equal(img.opacity, 0.5);
  // cover: 800x400 into 400x200 -> scale 0.5, nothing to crop
  assert.equal(img.scaleX, 0.5);
  assert.equal(img.cropX, 0);
  assert.equal(img.oceanleoDesignGroup, "grp-x");
  assert.equal(byId["chart-x"].oceanleoName, "图表");
  assert.equal(byId["chart-x"].type, "Image");
  assert.equal(byId["icon-x"].oceanleoName, "图标");
});

test("cover crops and contain centres a non-matching aspect ratio", () => {
  const project = richProject();
  const cover = designDocumentToSnapshot(project, {
    ...ASSETS,
    "assets/image/a.webp": { url: "https://cdn.test/a.webp", width: 400, height: 400 },
  }).snapshot.json.objects.find((o) => o.oceanleoId === "img-x");
  assert.equal(cover.scaleX, 1);
  assert.equal(cover.height, 200);
  assert.equal(cover.cropY, 100);
  const contain = designDocumentToSnapshot(project, ASSETS).snapshot.json.objects.find((o) => o.oceanleoId === "icon-x");
  assert.equal(contain.scaleX, 2);
  assert.equal(contain.left, 100 + (400 - 200) / 2);
});

test("a missing asset or a genuinely unknown type fails closed, never dropped", () => {
  const project = richProject();
  const missing = designDocumentToSnapshot(project, {});
  assert.deepEqual(
    missing.unsupported.map((e) => e.id).sort(),
    ["chart-x", "icon-x", "img-x"],
  );
  const unknown = JSON.parse(JSON.stringify(blankDesignDocument("本地设计稿 W10")));
  unknown.document.elements[0].type = "hologram";
  // Unknown element types are refused by the carrier schema before conversion.
  assert.throws(() => designDocumentToSnapshot(unknown), /type expected one of/);
});

test("text + shape + image + icon + chart-embed open, edit, save and reopen identical", () => {
  const project = richProject();
  const opened = designDocumentToSnapshot(project, ASSETS).snapshot;
  const types = new Set(opened.json.objects.map((o) => o.oceanleoKind));
  for (const kind of ["text", "rect", "image", "icon", "chart-embed"]) {
    assert.ok(types.has(kind), `layer kind ${kind} present`);
  }
  // edit: move the image layer and retitle the text
  const edited = JSON.parse(JSON.stringify(opened));
  edited.json.objects.find((o) => o.oceanleoId === "img-x").left = 321;
  const text = edited.json.objects.find((o) => o.type === "Textbox");
  text.text = "改过的标题";
  // save = fabric project JSON; reopen = parse it back
  const saved = JSON.stringify(createFabricImageProject(edited, "2026-10-22T00:00:00.000Z"));
  const reopened = parseFabricImageProject(JSON.parse(saved));
  assert.ok(reopened);
  assert.deepEqual(reopened.snapshot, edited);
  assert.equal(reopened.snapshot.json.objects.length, opened.json.objects.length);
  const reImg = reopened.snapshot.json.objects.find((o) => o.oceanleoId === "img-x");
  assert.equal(reImg.left, 321);
  assert.equal(reImg.oceanleoDesignAssetId, "assets/image/a.webp");
  assert.equal(reImg.src, "https://cdn.test/a.webp");
});

test("asset keys resolve only to the first-party bucket", () => {
  assert.equal(
    designAssetUrl("assets/image/a b.webp"),
    "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/assets/image/a%20b.webp",
  );
  for (const bad of ["", "https://evil.test/x.png", "../x", "/abs", "a/../b", "javascript:1"]) {
    assert.equal(designAssetUrl(bad), "", bad);
  }
  const props = readFileSync(join(ROOT, "src/shell/image-editor/editor-objects.ts"), "utf8");
  for (const prop of ["oceanleoName", "oceanleoDesignAssetId", "oceanleoDesignGroup"]) {
    assert.match(props, new RegExp(`"${prop}"`), `${prop} must be a serialized snapshot prop`);
  }
});

test("design item detection: inline, schema meta, typed source format", () => {
  assert.equal(isDesignDocumentItem({ meta: { designDocument: {} } }), true);
  assert.equal(isDesignDocumentItem({ meta: { editor_project_schema: "oceanleo.design-document.v1" } }), true);
  assert.equal(
    isDesignDocumentItem({ meta: {}, artifactType: "composite_image", artifact: { sourceFormat: "oceanleo.design-document.v1" } }),
    true,
  );
  assert.equal(
    isDesignDocumentItem({ meta: {}, artifactType: "composite_image", artifact: { sourceFormat: "oceanleo-scene+json" } }),
    false,
  );
  assert.equal(isDesignDocumentItem({ meta: { editor_project_schema: "oceanleo.fabric-image.v1" } }), false);
});
