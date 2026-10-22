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

test("design elements the scene cannot show are reported, never dropped silently", () => {
  const project = JSON.parse(JSON.stringify(blankDesignDocument("本地设计稿 W10")));
  project.document.elements.push({
    id: "img-x", type: "image", x: 0, y: 0, width: 10, height: 10, z: 999, assetId: "a1",
  });
  const result = designDocumentToSnapshot(project);
  assert.deepEqual(result.unsupported, [{ id: "img-x", type: "image" }]);
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
