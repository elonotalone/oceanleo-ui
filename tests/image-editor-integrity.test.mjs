import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  IMAGE_LOCK_SERIALIZED_PROPS,
  IMAGE_LOCKED_ALLOWED_CONTROLS,
  IMAGE_OBJECT_MUTATION_CONTROLS,
  imageLockInteractionProps,
  imageObjectMutationAllowed,
  imageToolbarCommandAllowed,
} from "../src/shell/image-editor/image-mutation-policy.ts";
import {
  exportFrozenImageDocument,
  normalizeImageEditorSnapshot,
} from "../src/shell/image-editor/image-document-contract.ts";

test("locked image objects remain inspectable while every object mutation is rejected", () => {
  assert.deepEqual(imageLockInteractionProps(true), {
    selectable: true,
    evented: true,
    lockMovementX: true,
    lockMovementY: true,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
    lockSkewingX: true,
    lockSkewingY: true,
    hasControls: false,
    hoverCursor: "not-allowed",
  });
  for (const intent of [
    "style",
    "geometry",
    "content",
    "replace",
    "layer",
    "visibility",
    "duplicate",
    "delete",
  ]) {
    assert.equal(imageObjectMutationAllowed(true, intent), false, intent);
  }
  assert.equal(imageObjectMutationAllowed(true, "unlock"), true);
  assert.equal(imageObjectMutationAllowed(true, "metadata"), true);
});

test("locked image toolbar policy has no mutation bypass", () => {
  for (const controlId of IMAGE_OBJECT_MUTATION_CONTROLS) {
    assert.equal(
      imageToolbarCommandAllowed(true, controlId),
      false,
      controlId,
    );
  }
  for (const controlId of IMAGE_LOCKED_ALLOWED_CONTROLS) {
    assert.equal(imageToolbarCommandAllowed(true, controlId), true, controlId);
  }
  assert.equal(imageToolbarCommandAllowed(true, "future-mutation"), false);
});

test("image lock flags and continuous controls participate in snapshot/history contracts", () => {
  const required = new Set([
    "oceanleoLocked",
    "selectable",
    "evented",
    "lockMovementX",
    "lockMovementY",
    "lockScalingX",
    "lockScalingY",
    "lockRotation",
    "lockSkewingX",
    "lockSkewingY",
    "hasControls",
  ]);
  for (const property of required) {
    assert.ok(IMAGE_LOCK_SERIALIZED_PROPS.includes(property), property);
  }

  const core = readFileSync(
    new URL(
      "../src/shell/image-editor/fabric-controller-core.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const controls = readFileSync(
    new URL(
      "../src/shell/image-editor/FabricImageControls.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const controller = readFileSync(
    new URL(
      "../src/shell/image-editor/fabric-controller.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(core, /if \(this\.gestureBase\)[\s\S]*this\.currentSnapshot = next/);
  assert.match(core, /endGesture\(\)[\s\S]*this\.undoStack\.push\(base\)/);
  assert.match(core, /text:editing:entered[\s\S]*canMutateObject/);
  assert.match(core, /tool === "erase" && this\.hasLockedEditableObjects/);
  assert.match(controller, /resizeDoc[\s\S]*hasLockedEditableObjects/);
  assert.match(controls, /onPointerDown=\{onBegin\}/);
  assert.match(controls, /onBegin=\{editor\.beginGesture\}/);
  assert.match(controls, /onChange=\{\(value\) => editor\.setFilter/);
  assert.match(controls, /onPointerUp=\{onCommit\}/);
  assert.match(controls, /onCommit=\{editor\.endGesture\}/);
});

test("image recovery rejects malformed payloads and retains serialized lock state", () => {
  const snapshot = {
    json: {
      version: "6.0.0",
      objects: [
        {
          type: "rect",
          oceanleoId: "locked-object",
          oceanleoLocked: true,
          lockMovementX: true,
          lockMovementY: true,
          lockScalingX: true,
          lockScalingY: true,
          lockRotation: true,
        },
      ],
    },
    doc: { width: 1440, height: 1080 },
    canvasBackground: "#fefefe",
  };
  assert.deepEqual(normalizeImageEditorSnapshot(snapshot), snapshot);
  assert.equal(
    normalizeImageEditorSnapshot({
      ...snapshot,
      json: { version: "6.0.0", objects: "not-an-array" },
    }),
    null,
  );
  assert.equal(
    normalizeImageEditorSnapshot({
      ...snapshot,
      doc: { width: Number.NaN, height: 1080 },
    }),
    null,
  );
});

test("image export freezes a document raster before restoring the live viewport", async () => {
  const transforms = [];
  const originalViewport = [2, 0, 0, 2, 40, 50];
  let rasterViewport;
  let rasterOptions;
  let encoded;
  const canvas = {
    viewportTransform: [...originalViewport],
    setViewportTransform(next) {
      this.viewportTransform = [...next];
      transforms.push([...next]);
    },
    requestRenderAll() {},
    toCanvasElement(multiplier, options) {
      rasterViewport = [...this.viewportTransform];
      rasterOptions = { multiplier, ...options };
      return {
        toBlob(resolve, mime, quality) {
          encoded = { mime, quality };
          queueMicrotask(() =>
            resolve(new Blob(["frozen-raster"], { type: mime })),
          );
        },
      };
    },
  };

  const blob = await exportFrozenImageDocument(
    canvas,
    { width: 640, height: 480 },
    { format: "webp", quality: 0.82, multiplier: 2 },
  );

  assert.deepEqual(rasterViewport, [1, 0, 0, 1, 0, 0]);
  assert.deepEqual(rasterOptions, {
    multiplier: 2,
    left: 0,
    top: 0,
    width: 640,
    height: 480,
  });
  assert.deepEqual(canvas.viewportTransform, originalViewport);
  assert.deepEqual(transforms, [
    [1, 0, 0, 1, 0, 0],
    originalViewport,
  ]);
  assert.deepEqual(encoded, { mime: "image/webp", quality: 0.82 });
  assert.equal(blob?.type, "image/webp");
  assert.equal(await blob?.text(), "frozen-raster");
});
