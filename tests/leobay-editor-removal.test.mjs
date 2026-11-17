import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { ARTIFACT_TYPES, ADVANCED_EDITOR_ADAPTER_IDS } from "../src/shell/artifact-contract.ts";
import { editorCapabilityFor, TRUSTED_EDITOR_REGISTRY } from "../src/shell/workbench-routes.ts";
import { libraryEditorCategory, libraryEditorLabel, LIBRARY_EDITOR_CATEGORIES } from "../src/shell/library-editor-category.ts";
import { videoMaterialKind } from "../src/shell/video-editor/video-material.ts";
import { CLIENT_EDITOR_ADAPTERS } from "../src/client-editor-adapters/registry.ts";

const item = (kind, overrides = {}) => ({ key: "sample", id: "sample", source: "creation", title: "Sample", kind, meta: {}, ...overrides });

test("only the six remaining file editors are registered in web and client catalogs", () => {
  const expected = ["deck", "grid", "image", "pdf", "richdoc", "video-timeline"];
  assert.deepEqual([...ADVANCED_EDITOR_ADAPTER_IDS].sort(), expected);
  assert.deepEqual(Object.keys(TRUSTED_EDITOR_REGISTRY).sort(), expected);
  assert.deepEqual(CLIENT_EDITOR_ADAPTERS.map(row => row.editorId).sort(), expected);
  assert.equal(ARTIFACT_TYPES.includes("workflow"), false);
  assert.equal(ARTIFACT_TYPES.includes("model_3d"), true);
  assert.equal(ARTIFACT_TYPES.includes("audio"), true);
});

test("audio and 3D remain browsable categories and never enter an editor from stale hints", () => {
  for (const [kind, type, url, label] of [["audio", "audio", "https://media.test/source.mp3", "音频"], ["threed", "model_3d", "https://media.test/source.glb", "3D 模型"]]) {
    for (const meta of [{}, { advanced_editor_route: "image" }, { advanced_editor_route: "richdoc" }]) {
      const content = item(kind, { artifactType: type, url, meta });
      assert.equal(editorCapabilityFor(content).available, false);
      assert.equal(libraryEditorCategory(content), kind);
      assert.equal(libraryEditorLabel(content), label);
    }
    assert.ok(LIBRARY_EDITOR_CATEGORIES.some(row => row.value === kind));
  }
});

test("the timeline classifier accepts image, video, audio independently of removed canvas modules", () => {
  for (const [type, expected] of [["vector_image", "image"], ["video", "video"], ["audio", "audio"]]) {
    assert.equal(videoMaterialKind(item("file", { artifactType: type })), expected);
  }
  assert.equal(videoMaterialKind(item("file", { url: "https://media.test/photo.jpg" })), "image");
  assert.equal(videoMaterialKind(item("file")), null);
});

test("cached edit rights cannot expose audio or 3D editing actions", async () => {
  const { assetToolbarItems } = await import("../src/shell/asset-detail/useAssetActions.ts");
  const context = { surface: "library", ref: { kind: "artifact", artifactId: "sample" }, owned: true, rights: { canEdit: true, canDownload: true, canUseInTask: true } };
  for (const kind of ["audio", "threed"]) {
    assert.deepEqual(assetToolbarItems(context, item(kind)).map(row => row.id), ["use", "download"]);
  }
});

test("timeline fingerprints ignore object key order and change with timeline content", async () => {
  const { deterministicDigest } = await import("../src/shell/video-editor/timeline-digest.ts");
  assert.equal(deterministicDigest({ fps: 30, tracks: [] }), deterministicDigest({ tracks: [], fps: 30 }));
  assert.notEqual(deterministicDigest({ fps: 30, tracks: [] }), deterministicDigest({ fps: 60, tracks: [] }));
});
