import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ADVANCED_CAPABILITY_CONTRACT,
  ADVANCED_CAPABILITY_MATRIX,
  ARTIFACT_TYPES,
  advancedCapabilityForAdapter,
  advancedCapabilityForArtifactFields,
  advancedCapabilityForFeatureId,
  resolveAdvancedCapabilityDispatch,
} from "../src/shell/artifact-contract.ts";
import {
  ADVANCED_FEATURES,
  advancedFeatureById,
} from "../src/shell/advanced-features.ts";
import {
  TRUSTED_EDITOR_REGISTRY,
  editorAdapterForArtifactCapability,
  editorCapabilityFor,
  registryEntryForAdvancedFeature,
} from "../src/shell/workbench-routes.ts";

const WORKBENCH_SOURCE = readFileSync(
  new URL("../src/shell/AdvancedContentWorkbench.tsx", import.meta.url),
  "utf8",
);

const CONSUMER_CONTEXTS = Object.freeze([
  "oceanleo",
  "agent",
  "website",
  "ecommerce",
  "ppt",
  "excel",
  "word",
  "converter",
  "aihuman",
  "image",
  "video",
  "resume",
  "bizdev",
  "logo",
  "interior",
  "chat",
  "threed",
  "music",
  "meeting",
  "paper",
  "law",
  "study",
  "edu",
  "novel",
  "script",
  "design",
  "make",
  "search",
  "money",
  "aitools",
  "asset",
  "game",
]);

const EXPECTED_ADAPTER = Object.freeze({
  video_editing: "video-timeline",
  website_finetuning: "website",
  design_canvas: "design-canvas",
  presentation_editing: "deck",
  document_editing: "richdoc",
  spreadsheet_editing: "grid",
  image_editing: "image",
  pdf_editing: "pdf",
  audio_editing: "audio",
  chart_editing: "chart-editor@1",
  video_canvas: "video-canvas",
  model_3d: "threed",
});

const EXPECTED_ROUTE = Object.freeze({
  "video-timeline": "video-timeline",
  website: "embed",
  "design-canvas": "embed",
  deck: "deck",
  richdoc: "richdoc",
  grid: "grid",
  image: "image",
  pdf: "pdf",
  audio: "audio",
  "chart-editor@1": "grid",
  "video-canvas": "embed",
  threed: "threed",
});

const KIND_BY_ARTIFACT = Object.freeze({
  single_file_image: "image",
  composite_image: "image",
  vector_image: "image",
  chart: "image",
  document: "document",
  grid: "sheet",
  deck: "ppt",
  pdf: "document",
  website: "website",
  video: "video",
  audio: "audio",
  model_3d: "threed",
  workflow: "canvas",
});

const SOURCE_FORMAT_BY_ARTIFACT = Object.freeze({
  single_file_image: "png",
  composite_image: "oceanleo.design-document.v1",
  vector_image: "svg",
  chart: "oceanleo.chart.v1",
  document: "docx",
  grid: "xlsx",
  deck: "pptx",
  pdf: "pdf",
  website: "website-source@1",
  video: "mp4",
  audio: "mp3",
  model_3d: "gltf",
  workflow: "oceanleo.workflow.v1",
});

function contextId(siteKey) {
  return `olctx:v1:${siteKey}:app:capability-plane-proof`;
}

function artifactFor(entry, bindings = CONSUMER_CONTEXTS) {
  const revisionId = `${entry.featureId}-r7`;
  return {
    schema: "oceanleo.artifact.v1",
    artifactId: `${entry.featureId}-artifact`,
    revisionId,
    artifactType: entry.artifactType,
    roles: ["template"],
    owner: {
      principalId: "capability-plane-owner",
      visibility: "public",
      originSiteKey: "asset",
      originAppId: null,
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
    editability: entry.editability,
    editorCapability: entry.editorCapability,
    sourceFormat: entry.sourceFormat,
    title: entry.featureId,
    favorite: false,
    renditions: {
      preview: {
        purpose: "preview",
        revisionId,
        url: `https://signed.test/${entry.featureId}/preview`,
        mediaType: "application/octet-stream",
        format: "preview",
        expiresAt: null,
        rendererVersion: null,
        width: null,
        height: null,
        durationMs: null,
        digest: null,
      },
      source: {
        purpose: "source",
        revisionId,
        url: `https://signed.test/${entry.featureId}/source`,
        mediaType: entry.sourceMediaType,
        format: entry.sourceFormat,
        expiresAt: null,
        rendererVersion: null,
        width: null,
        height: null,
        durationMs: null,
        digest: `sha256:${entry.featureId}`,
      },
    },
    scene:
      entry.artifactType === "composite_image"
        ? {
            schema: entry.projectSchema,
            sceneRevisionId: revisionId,
            closureStatus: "complete",
            closureDigest: `sha256:${entry.featureId}:closure`,
            dependencyRevisionIds: [],
          }
        : null,
    provenance: {
      id: `provenance-${entry.featureId}`,
      sourceKind: "owned",
      licenseCode: "owned",
      licenseUrl: "",
      attribution: "",
    },
    bindings: bindings.map((siteKey, rank) => ({
      contextId: contextId(siteKey),
      role: "primary",
      rank,
      pinnedRevisionId: revisionId,
    })),
    integrity: { ok: true, code: "ok", reason: "" },
    createdAt: null,
  };
}

function libraryItemFor(artifact, siteId) {
  return {
    key: `artifact:${artifact.artifactId}:${artifact.revisionId}`,
    source: "artifact",
    id: artifact.artifactId,
    title: artifact.title,
    kind: KIND_BY_ARTIFACT[artifact.artifactType],
    siteId,
    url: artifact.renditions.source.url,
    previewUrl: artifact.renditions.preview.url,
    favorite: false,
    meta: {},
    artifactId: artifact.artifactId,
    revisionId: artifact.revisionId,
    artifactType: artifact.artifactType,
    artifact,
  };
}

test("one immutable 12-row matrix drives every feature and public projection", () => {
  assert.strictEqual(ADVANCED_CAPABILITY_CONTRACT, ADVANCED_CAPABILITY_MATRIX);
  assert.equal(ADVANCED_CAPABILITY_MATRIX.length, 12);
  assert.equal(new Set(ADVANCED_CAPABILITY_MATRIX).size, 12);
  assert.equal(TRUSTED_EDITOR_REGISTRY.office.routable, false);
  assert.equal(TRUSTED_EDITOR_REGISTRY.office.routeType, "none");
  assert.deepEqual(TRUSTED_EDITOR_REGISTRY.office.artifactCapabilities, []);
  assert.deepEqual(TRUSTED_EDITOR_REGISTRY.office.roundTrip, []);
  assert.equal(
    TRUSTED_EDITOR_REGISTRY.office.projectSchema,
    "office-file@1",
  );
  assert.equal(
    ADVANCED_CAPABILITY_MATRIX.some((entry) => entry.adapter === "office"),
    false,
  );
  assert.deepEqual(
    ADVANCED_CAPABILITY_MATRIX.map((entry) => entry.featureId).sort(),
    Object.keys(EXPECTED_ADAPTER).sort(),
  );
  assert.equal(CONSUMER_CONTEXTS.length, 32);

  for (const [index, entry] of ADVANCED_CAPABILITY_MATRIX.entries()) {
    assert.equal(entry.adapter, EXPECTED_ADAPTER[entry.featureId]);
    assert.strictEqual(advancedCapabilityForFeatureId(entry.featureId), entry);
    assert.strictEqual(advancedCapabilityForAdapter(entry.adapter), entry);
    assert.strictEqual(
      advancedCapabilityForArtifactFields({
        artifactType: entry.artifactType,
        sourceFormat: entry.sourceFormat,
        editorCapability: entry.editorCapability,
      }),
      entry,
    );
    assert.strictEqual(ADVANCED_FEATURES[index].capability, entry);
    assert.strictEqual(advancedFeatureById(entry.featureId), ADVANCED_FEATURES[index]);
    const registry = registryEntryForAdvancedFeature(entry.featureId);
    assert.equal(registry.featureId, entry.featureId);
    assert.equal(registry.routable, true);
    assert.equal(registry.projectSchema, entry.projectSchema);
  }
});

test("all 12 features keep shared identity and adapter across all 32 contexts", () => {
  let dispatches = 0;
  for (const entry of ADVANCED_CAPABILITY_MATRIX) {
    const artifact = artifactFor(entry);
    for (const siteKey of CONSUMER_CONTEXTS) {
      const result = resolveAdvancedCapabilityDispatch(artifact, {
        scope: "exact-context",
        context: {
          contextId: contextId(siteKey),
          siteKey,
          appId: "capability-plane-proof",
        },
      });
      assert.equal(result.ok, true, `${entry.featureId}@${siteKey}`);
      assert.strictEqual(result.capability, entry, `${entry.featureId}@${siteKey}`);
      assert.equal(result.receipt.featureId, entry.featureId);
      assert.equal(result.receipt.adapter, EXPECTED_ADAPTER[entry.featureId]);
      assert.equal(result.receipt.context.siteKey, siteKey);
      assert.equal(result.receipt.context.exact, true);
      assert.equal(result.receipt.artifactId, artifact.artifactId);
      assert.equal(result.receipt.revisionId, artifact.revisionId);
      assert.equal(result.receipt.sourceRevisionId, artifact.revisionId);

      const editor = editorCapabilityFor(libraryItemFor(artifact, siteKey));
      assert.equal(editor.available, true, `${entry.featureId}@${siteKey}`);
      assert.equal(editor.adapter, EXPECTED_ADAPTER[entry.featureId]);
      assert.equal(editor.route.type, EXPECTED_ROUTE[entry.adapter]);
      dispatches += 1;
    }
  }
  assert.equal(dispatches, 12 * 32);
});

test("global More routes every typed artifact binding through the same matrix", () => {
  const coveredTypes = new Set();
  let bindings = 0;
  for (const entry of ADVANCED_CAPABILITY_MATRIX) {
    for (const binding of entry.artifactBindings) {
      coveredTypes.add(binding.artifactType);
      for (const editorCapability of binding.editorCapabilities) {
        const artifact = {
          ...artifactFor(entry, []),
          artifactType: binding.artifactType,
          sourceFormat: SOURCE_FORMAT_BY_ARTIFACT[binding.artifactType],
          editorCapability,
        };
        const result = resolveAdvancedCapabilityDispatch(artifact, {
          scope: "global",
        });
        assert.equal(
          result.ok,
          true,
          `${binding.artifactType}/${editorCapability}`,
        );
        assert.strictEqual(result.capability, entry);
        assert.equal(result.receipt.adapter, entry.adapter);
        bindings += 1;
      }
    }
  }
  assert.deepEqual([...coveredTypes].sort(), [...ARTIFACT_TYPES].sort());
  assert.ok(bindings > ARTIFACT_TYPES.length);
});

test("exact App context and global More routeability are separate policies", () => {
  const entry = advancedCapabilityForFeatureId("image_editing");
  assert.ok(entry);
  const unbound = artifactFor(entry, []);

  const global = resolveAdvancedCapabilityDispatch(unbound, {
    scope: "global",
  });
  assert.equal(global.ok, true);
  assert.strictEqual(global.capability, entry);
  assert.equal(global.receipt.context.exact, false);
  assert.equal(global.receipt.context.contextId, null);

  const contextual = resolveAdvancedCapabilityDispatch(unbound, {
    scope: "exact-context",
    context: { contextId: contextId("word"), siteKey: "word" },
  });
  assert.equal(contextual.ok, false);
  assert.equal(contextual.code, "context-mismatch");
});

test("dispatch fails closed on incompatible source and stale revision receipts", () => {
  const entry = advancedCapabilityForFeatureId("document_editing");
  assert.ok(entry);
  const valid = artifactFor(entry, []);

  const incompatible = resolveAdvancedCapabilityDispatch(
    { ...valid, sourceFormat: "png" },
    { scope: "global" },
  );
  assert.equal(incompatible.ok, false);
  assert.equal(incompatible.code, "incompatible-source");

  const staleSource = resolveAdvancedCapabilityDispatch(
    {
      ...valid,
      renditions: {
        ...valid.renditions,
        source: {
          ...valid.renditions.source,
          revisionId: "stale-revision",
        },
      },
    },
    { scope: "global" },
  );
  assert.equal(staleSource.ok, false);
  assert.equal(staleSource.code, "missing-source");
});

test("legacy office capability can only remap by typed artifact to lightweight routes", () => {
  assert.equal(editorAdapterForArtifactCapability("office-editor"), null);
  assert.doesNotMatch(WORKBENCH_SOURCE, /\bOfficeRoute\b|case "office"/);
  for (const [featureId, adapter, route] of [
    ["document_editing", "richdoc", "richdoc"],
    ["spreadsheet_editing", "grid", "grid"],
    ["presentation_editing", "deck", "deck"],
  ]) {
    const entry = advancedCapabilityForFeatureId(featureId);
    assert.ok(entry);
    const artifact = {
      ...artifactFor(entry, []),
      editorCapability: "office-editor",
    };
    const dispatch = resolveAdvancedCapabilityDispatch(artifact, {
      scope: "global",
    });
    assert.equal(dispatch.ok, true, featureId);
    assert.equal(dispatch.receipt.adapter, adapter, featureId);
    const editor = editorCapabilityFor(libraryItemFor(artifact, "image"));
    assert.equal(editor.adapter, adapter, featureId);
    assert.equal(editor.route.type, route, featureId);
    assert.notEqual(editor.route.type, "office", featureId);
  }
});

test("design, image, video canvas and video timeline remain distinct typed rows", () => {
  const adapters = [
    "design_canvas",
    "image_editing",
    "video_canvas",
    "video_editing",
  ].map((featureId) => advancedCapabilityForFeatureId(featureId)?.adapter);
  assert.deepEqual(adapters, [
    "design-canvas",
    "image",
    "video-canvas",
    "video-timeline",
  ]);
  assert.equal(new Set(adapters).size, 4);
  assert.deepEqual([...ARTIFACT_TYPES].sort(), [
    ...new Set(
      ADVANCED_CAPABILITY_MATRIX.flatMap((entry) =>
        entry.artifactBindings.map((binding) => binding.artifactType),
      ),
    ),
  ].sort());
});
