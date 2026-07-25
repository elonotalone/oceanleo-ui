import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  countUnlockedImageLayers,
  preferredUnlockedImageLayerId,
  preferUnlockedImageObject,
} from "../src/shell/image-editor/editor-runtime.ts";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("unlocked image layer inventory prefers topmost non-background image", () => {
  const layers = [
    {
      id: "img-top",
      kind: "image",
      locked: false,
      isBackground: false,
      visible: true,
    },
    {
      id: "img-locked",
      kind: "image",
      locked: true,
      isBackground: false,
      visible: true,
    },
    {
      id: "bg",
      kind: "image",
      locked: false,
      isBackground: true,
      visible: true,
    },
    {
      id: "text",
      kind: "text",
      locked: false,
      isBackground: false,
      visible: true,
    },
  ];
  assert.equal(countUnlockedImageLayers(layers), 1);
  assert.equal(preferredUnlockedImageLayerId(layers), "img-top");
  assert.equal(
    preferredUnlockedImageLayerId([
      {
        id: "hidden",
        kind: "image",
        locked: false,
        isBackground: false,
        visible: false,
      },
      {
        id: "ok",
        kind: "image",
        locked: false,
        isBackground: false,
        visible: true,
      },
    ]),
    "ok",
  );
});

test("preferUnlockedImageObject walks canvas top-down and skips locked/background", () => {
  const objects = [
    {
      oceanleoId: "docbg",
      oceanleoRole: "docbg",
      oceanleoLocked: true,
      visible: true,
    },
    {
      oceanleoId: "bg-image",
      oceanleoRole: "background",
      oceanleoKind: "image",
      oceanleoLocked: false,
      visible: true,
    },
    {
      oceanleoId: "locked-image",
      oceanleoRole: undefined,
      oceanleoKind: "image",
      oceanleoLocked: true,
      visible: true,
      __isImage: true,
    },
    {
      oceanleoId: "free-image",
      oceanleoRole: undefined,
      oceanleoKind: "image",
      oceanleoLocked: false,
      visible: true,
      __isImage: true,
    },
  ];
  const canvas = {
    getObjects: () => objects,
  };
  const preferred = preferUnlockedImageObject(
    /** @type {any} */ (canvas),
    (object) => object.__isImage === true,
  );
  assert.equal(preferred?.oceanleoId, "free-image");
});

test("Fabric stage and layer list expose unlocked image selection hooks for V3", () => {
  const stage = source("../src/shell/image-editor/FabricImageStage.tsx");
  const controls = source("../src/shell/image-editor/FabricImageControls.tsx");
  const core = source("../src/shell/image-editor/fabric-controller-core.ts");
  const policy = source("../src/shell/image-editor/image-mutation-policy.ts");
  const runtime = source("../src/shell/image-editor/editor-runtime.ts");

  assert.match(stage, /data-editor-unlocked-image-count=\{unlockedImageCount\}/);
  assert.match(stage, /data-layer-id=\{preferredUnlockedImageId\}/);
  assert.match(stage, /解锁图片图层/);
  assert.match(stage, /图片图层/);
  assert.match(stage, /data-editor-geometry-readback/);
  assert.match(stage, /\["position-x", editor\.selected\.x\]/);
  assert.match(stage, /\["position-y", editor\.selected\.y\]/);
  assert.match(stage, /\["object-width", editor\.selected\.width\]/);
  assert.match(stage, /\["object-height", editor\.selected\.height\]/);
  assert.match(controls, /data-layer-id=\{layer\.id\}/);
  assert.match(controls, /data-layer-locked=\{layer\.locked \? "true" : "false"\}/);
  assert.match(controls, /data-layer-background=\{layer\.isBackground \? "true" : "false"\}/);
  assert.match(core, /selectPreferredUnlockedImage\(\)/);
  assert.match(core, /perPixelTargetFind:\s*false/);
  assert.match(policy, /perPixelTargetFind:\s*false/);
  assert.match(runtime, /export function preferredUnlockedImageLayerId/);
  assert.match(runtime, /export function preferUnlockedImageObject/);
  const toolbar = source(
    "../src/shell/image-editor/FabricImageContextToolbar.tsx",
  );
  for (const id of [
    "position-x",
    "position-y",
    "object-width",
    "object-height",
  ]) {
    assert.match(toolbar, new RegExp(`id: "${id}"[\\s\\S]*?placement: "primary"`));
  }
});
