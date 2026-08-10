import assert from "node:assert/strict";
import test from "node:test";

import {
  ARTIFACT_TYPES,
  advancedCapabilityForArtifactFields,
  artifactEditorCapabilityIsCompatible,
  artifactSourceFormatIsCompatible,
  isEnsureableTransient,
  normalizeArtifactProjectionResult,
} from "../src/shell/artifact-contract.ts";

const UNKNOWN_ARTIFACT_TYPE = "luminous_forest_simulation";
const UNKNOWN_SOURCE_FORMAT = "agent/luminous-pack@2026-08";
const UNKNOWN_EDITOR_CAPABILITY = "agent.luminous-workbench";

function projection({
  artifactId = "artifact-open-type",
  revisionId = "r1",
  artifactType = UNKNOWN_ARTIFACT_TYPE,
  sourceFormat = UNKNOWN_SOURCE_FORMAT,
  editorCapability = UNKNOWN_EDITOR_CAPABILITY,
  principalId = "user-transport-owner",
} = {}) {
  return {
    schema: "oceanleo.artifact.v1",
    artifact_id: artifactId,
    revision_id: revisionId,
    artifact_type: artifactType,
    roles: ["mine"],
    title: "Self-reported artifact",
    favorite: false,
    owner: {
      principal_id: principalId,
      visibility: "private",
      origin_site_key: "agent-workspace",
      origin_app_id: "agent-created-module",
    },
    access: {
      read: true,
      preview: true,
      edit: true,
      fork: false,
      insert: true,
      replace: true,
      favorite: true,
      bind: true,
      export_source: true,
    },
    editability: "native",
    editor_capability: editorCapability,
    source_format: sourceFormat,
    renditions: {
      preview: {
        purpose: "preview",
        revision_id: revisionId,
        url: `https://signed.test/${artifactId}/${revisionId}/preview`,
        media_type: "application/octet-stream",
        format: "agent-preview",
      },
      source: {
        purpose: "source",
        revision_id: revisionId,
        url: `https://signed.test/${artifactId}/${revisionId}/source`,
        media_type: "application/octet-stream",
        format: sourceFormat,
        digest: `sha256:${artifactId}:${revisionId}`,
      },
    },
    provenance: {
      id: `provenance-${artifactId}`,
      source_kind: "owned",
      license_code: "owned",
    },
    context_bindings: [],
    integrity: { ok: true, code: "ok", reason: "" },
  };
}

class MemoryArtifactTransport {
  #rows = new Map();

  save(raw) {
    const normalized = normalizeArtifactProjectionResult(raw);
    assert.equal(normalized.ok, true, normalized.error);
    assert.ok(normalized.data);
    const key = `${normalized.data.artifactId}:${normalized.data.revisionId}`;
    this.#rows.set(key, structuredClone(raw));
    return normalized.data;
  }

  list() {
    return [...this.#rows.values()].map((raw) => {
      const normalized = normalizeArtifactProjectionResult(raw);
      assert.equal(normalized.ok, true, normalized.error);
      assert.ok(normalized.data);
      return normalized.data;
    });
  }

  get(artifactId, revisionId) {
    const raw = this.#rows.get(`${artifactId}:${revisionId}`);
    if (!raw) return null;
    const normalized = normalizeArtifactProjectionResult(raw);
    assert.equal(normalized.ok, true, normalized.error);
    return normalized.data || null;
  }
}

test("built-in shelf choices are presentation hints, not the ArtifactType boundary", () => {
  assert.equal(new Set(ARTIFACT_TYPES).size, ARTIFACT_TYPES.length);
  assert.equal(ARTIFACT_TYPES.includes(UNKNOWN_ARTIFACT_TYPE), false);
  assert.equal(
    artifactSourceFormatIsCompatible(
      UNKNOWN_ARTIFACT_TYPE,
      UNKNOWN_SOURCE_FORMAT,
    ),
    true,
  );
  assert.equal(
    artifactEditorCapabilityIsCompatible(
      UNKNOWN_ARTIFACT_TYPE,
      UNKNOWN_EDITOR_CAPABILITY,
    ),
    true,
  );
  assert.equal(
    advancedCapabilityForArtifactFields({
      artifactType: UNKNOWN_ARTIFACT_TYPE,
      sourceFormat: UNKNOWN_SOURCE_FORMAT,
      editorCapability: UNKNOWN_EDITOR_CAPABILITY,
    }),
    null,
    "an unknown editor need not be registered for its artifact to exist",
  );
});

test("a never-seen type and source format save, list and get without registration", () => {
  assert.equal(
    isEnsureableTransient({
      schema: "oceanleo.transient-generation.v1",
      operation: "generation",
      resultId: "unknown-result",
      idempotencyKey: "unknown-idempotency-key",
      payloadDigest: "unknown-payload-digest",
      artifactType: UNKNOWN_ARTIFACT_TYPE,
      title: "Luminous forest",
      renditionUrl: "https://signed.test/luminous/preview",
      sourceUrl: "https://signed.test/luminous/source",
      sourceFormat: UNKNOWN_SOURCE_FORMAT,
    }),
    true,
  );

  const transport = new MemoryArtifactTransport();
  const saved = transport.save(projection());
  assert.equal(saved.artifactType, UNKNOWN_ARTIFACT_TYPE);
  assert.equal(saved.sourceFormat, UNKNOWN_SOURCE_FORMAT);

  const listed = transport.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].artifactType, UNKNOWN_ARTIFACT_TYPE);
  assert.equal(listed[0].owner.principalId, "user-transport-owner");

  const fetched = transport.get(saved.artifactId, saved.revisionId);
  assert.ok(fetched);
  assert.equal(fetched.artifactType, UNKNOWN_ARTIFACT_TYPE);
  assert.equal(fetched.sourceFormat, UNKNOWN_SOURCE_FORMAT);
  assert.equal(fetched.renditions.source?.revisionId, saved.revisionId);
});

test("real editor artifacts still save, list and get through the same transport", () => {
  const transport = new MemoryArtifactTransport();
  const editorArtifacts = [
    ["deck", "pptx", "deck-editor"],
    ["grid", "xlsx", "grid-editor"],
    ["chart", "oceanleo.chart.v1", "chart-editor"],
    ["video", "mp4", "video-timeline"],
    ["audio", "mp3", "audio-editor"],
    ["pdf", "pdf", "pdf-editor"],
    ["model_3d", "gltf", "model-3d-editor"],
  ];

  for (const [artifactType, sourceFormat, editorCapability] of editorArtifacts) {
    transport.save(
      projection({
        artifactId: `artifact-${artifactType}`,
        artifactType,
        sourceFormat,
        editorCapability,
      }),
    );
  }

  assert.deepEqual(
    transport.list().map((artifact) => artifact.artifactType),
    editorArtifacts.map(([artifactType]) => artifactType),
  );
  for (const [artifactType, sourceFormat] of editorArtifacts) {
    const fetched = transport.get(`artifact-${artifactType}`, "r1");
    assert.ok(fetched, artifactType);
    assert.equal(fetched.sourceFormat, sourceFormat, artifactType);
    assert.equal(fetched.owner.principalId, "user-transport-owner", artifactType);
  }
});

test("transport still rejects an artifact that loses its owner", () => {
  const normalized = normalizeArtifactProjectionResult(
    projection({ principalId: "" }),
  );
  assert.equal(normalized.ok, false);
  assert.match(normalized.error || "", /owner/);
});
