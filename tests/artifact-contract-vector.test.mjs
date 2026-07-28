import assert from "node:assert/strict";
import test from "node:test";

import {
  ADVANCED_CAPABILITY_MATRIX,
  ARTIFACT_EDITOR_CAPABILITIES,
  ARTIFACT_TYPES,
  advancedCapabilityForArtifactFields,
  advancedCapabilityForFeatureId,
  artifactUserFacingDownloadHint,
  resolveAdvancedCapabilityDispatch,
} from "../src/shell/artifact-contract.ts";
import {
  TRUSTED_EDITOR_REGISTRY,
  editorAdapterForArtifactCapability,
  editorRouteHintForArtifactCapability,
} from "../src/shell/workbench-routes.ts";

/** 一份最小可派发的 svg 素材投影。 */
function vectorArtifact() {
  const revisionId = "vector-r1";
  return {
    schema: "oceanleo.artifact.v1",
    artifactId: "vector-artifact",
    revisionId,
    artifactType: "vector_image",
    roles: ["template"],
    owner: {
      principalId: "platform",
      visibility: "public",
      originSiteKey: "logo",
      originAppId: "brand-logo",
      originFunctionId: null,
    },
    access: {
      canRead: true,
      canPreview: true,
      canEdit: true,
      canFork: false,
      canInsert: true,
      canReplace: true,
      canFavorite: true,
      canBind: true,
      canExportSource: true,
    },
    editability: "native",
    editorCapability: "vector-editor",
    sourceFormat: "svg",
    title: "品牌主标",
    favorite: false,
    renditions: {
      preview: {
        purpose: "preview",
        revisionId,
        url: "https://signed.test/vector/preview",
        mediaType: "image/webp",
        format: "webp",
        expiresAt: null,
        rendererVersion: null,
        width: 1200,
        height: 1200,
        durationMs: null,
        byteSize: 40_000,
        digest: null,
      },
      source: {
        purpose: "source",
        revisionId,
        url: "https://signed.test/vector/source",
        mediaType: "image/svg+xml",
        format: "svg",
        expiresAt: null,
        rendererVersion: null,
        width: 1200,
        height: 1200,
        durationMs: null,
        byteSize: 3_384,
        digest: "sha256:vector",
      },
    },
    scene: null,
    provenance: {
      id: "provenance-vector",
      sourceKind: "owned",
      licenseCode: "OCEANLEO-AIGEN",
      licenseUrl: "",
      attribution: "",
      rightsAsserted: true,
    },
    bindings: [],
    integrity: { ok: true, code: "ok", reason: "" },
    createdAt: null,
  };
}

test("矢量素材不再走位图适配器", () => {
  const capability = advancedCapabilityForArtifactFields({
    artifactType: "vector_image",
    sourceFormat: "svg",
    editorCapability: "vector-editor",
  });
  assert.ok(capability, "svg + vector-editor 必须能在共享 matrix 里解析出能力");
  assert.notEqual(capability.adapter, "image");
  assert.notEqual(capability.projectSchema, "oceanleo.fabric-image.v1");
  assert.equal(capability.adapter, "design-canvas");
  assert.equal(capability.projectSchema, "oceanleo.design-document.v1");
  // 矢量编辑是工程级往返，不是位图那套有界编辑。
  assert.equal(capability.editability, "native");
  assert.equal(capability.openMode, "structured-project");
});

test("vector-editor 的运行时路由落在图层工程适配器上", () => {
  assert.equal(editorAdapterForArtifactCapability("vector-editor"), "design-canvas");
  assert.equal(editorRouteHintForArtifactCapability("vector-editor"), "embed");
  assert.equal(
    TRUSTED_EDITOR_REGISTRY["design-canvas"].artifactCapabilities.includes(
      "vector-editor",
    ),
    true,
  );
  assert.equal(
    TRUSTED_EDITOR_REGISTRY.image.artifactCapabilities.includes("vector-editor"),
    false,
  );
});

test("svg 素材派发出的收据带矢量该有的工程 schema", () => {
  const result = resolveAdvancedCapabilityDispatch(vectorArtifact(), {
    scope: "global",
  });
  assert.equal(result.ok, true, result.ok ? "" : result.reason);
  assert.equal(result.receipt.adapter, "design-canvas");
  assert.equal(result.receipt.projectSchema, "oceanleo.design-document.v1");
  assert.equal(result.receipt.editorCapability, "vector-editor");
  assert.equal(result.receipt.artifactType, "vector_image");
});

test("矢量下载仍交付 svg 源文件，不退化成 png", () => {
  const artifact = vectorArtifact();
  const hint = artifactUserFacingDownloadHint({
    artifactType: "vector_image",
    sourceFormat: "svg",
    editorCapability: "vector-editor",
    title: "品牌主标",
    renditions: artifact.renditions,
  });
  assert.ok(hint);
  assert.equal(hint.extension, "svg");
  assert.equal(hint.mediaType, "image/svg+xml");
});

test("deck / website / image / composite 四行未被这次修正碰到", () => {
  assert.equal(ADVANCED_CAPABILITY_MATRIX.length, 13);
  for (const [featureId, adapter, sourceFormat, projectSchema] of [
    ["presentation_editing", "deck", "pptx", "oceanleo.deck.v1"],
    ["website_finetuning", "website", "website-source@1", "website-source@1"],
    ["image_editing", "image", "webp", "oceanleo.fabric-image.v1"],
    [
      "design_canvas",
      "design-canvas",
      "oceanleo.design-document.v1",
      "oceanleo.design-document.v1",
    ],
  ]) {
    const entry = advancedCapabilityForFeatureId(featureId);
    assert.ok(entry, featureId);
    assert.equal(entry.adapter, adapter, featureId);
    assert.equal(entry.sourceFormat, sourceFormat, featureId);
    assert.equal(entry.projectSchema, projectSchema, featureId);
  }
  // 位图仍旧由 image 适配器接管，A 类里纯图像处理的 app 不受影响。
  const raster = advancedCapabilityForArtifactFields({
    artifactType: "single_file_image",
    sourceFormat: "png",
    editorCapability: "image-editor",
  });
  assert.equal(raster?.adapter, "image");
  assert.equal(raster?.editability, "bounded");
});

test("每种 typed artifact 仍能在 matrix 里找到编辑能力", () => {
  for (const artifactType of ARTIFACT_TYPES) {
    assert.ok(
      ARTIFACT_EDITOR_CAPABILITIES[artifactType].size > 0,
      artifactType,
    );
  }
  assert.deepEqual([...ARTIFACT_EDITOR_CAPABILITIES.vector_image].sort(), [
    "vector-editor",
  ]);
});
