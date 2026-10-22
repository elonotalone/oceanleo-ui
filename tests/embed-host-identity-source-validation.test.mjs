import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DesignCompositeCommitError,
  validateDesignCompositeSource,
} from "../src/shell/design-composite-commit.ts";

globalThis.window ||= {
  location: {
    href: "https://design.oceanleo.com/",
    origin: "https://design.oceanleo.com",
  },
};

const artifactId = "11111111-1111-4111-8111-111111111111";
const revisionId = "22222222-2222-4222-8222-222222222222";

function designItem({
  sourceDigest = "a".repeat(64),
  dependencyRevisionIds = [],
} = {}) {
  return {
    key: `artifact:${artifactId}:${revisionId}`,
    source: "artifact",
    id: artifactId,
    title: "Host validation fixture",
    kind: "image",
    siteId: "design",
    favorite: false,
    meta: {},
    artifactId,
    revisionId,
    artifactType: "composite_image",
    artifact: {
      schema: "oceanleo.artifact.v1",
      artifactId,
      revisionId,
      artifactType: "composite_image",
      sourceFormat: "oceanleo.design-document.v1",
      editorCapability: "design-canvas",
      integrity: { ok: true },
      renditions: {
        source: {
          purpose: "source",
          revisionId,
          url: "https://api.oceanleo.com/v1/media/file/design-project.json",
          digest: sourceDigest,
        },
      },
      scene: {
        schema: "oceanleo.design-document.v1",
        sceneRevisionId: revisionId,
        closureStatus: "complete",
        closureDigest: "c".repeat(64),
        dependencyRevisionIds,
      },
    },
  };
}

function imageElement(id, src, metadata) {
  return {
    id,
    type: "image",
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    rotation: 0,
    props: { src },
    ...(metadata ? { metadata } : {}),
  };
}

function designProject(elements, dependencies = []) {
  const document = {
    id: "document-1",
    sourceMode: "layered",
    background: {},
    elements,
  };
  return {
    schema: "oceanleo.design-document.v1",
    version: 1,
    updatedAt: "2026-07-23T00:00:00.000Z",
    revision: 3,
    artifactType: "composite_image",
    baseArtifact: { artifactId, revisionId },
    sceneGraph: {
      schema: "oceanleo.design-scene.v1",
      revision: 3,
      documentId: document.id,
      sourceMode: "layered",
    },
    dependencyManifest: {
      schema: "oceanleo.dependency-manifest.v1",
      revision: 3,
      sceneGraphFormat: "oceanleo.design-document.v1",
      dependencies,
    },
    history: {
      schema: "oceanleo.design-history.v1",
      entries: [structuredClone(document)],
      index: 0,
    },
    document,
  };
}

function sourceBlob(project) {
  return new Blob([JSON.stringify(project)], { type: "application/json" });
}

test("design open accepts renderable placeholders, alternate refs, long URLs and data URLs without weakening commit closure", async () => {
  const longUrl =
    `https://api.oceanleo.com/v1/media/file/${"a".repeat(3_100)}` +
    ".png";
  assert.ok(longUrl.length > 3_000 && longUrl.length < 4_096);
  const dataUrl = `data:image/png;base64,${Buffer.alloc(3_100).toString("base64")}`;
  assert.ok(dataUrl.length > 3_000);
  const alternateUrl =
    "https://api.oceanleo.com/v1/media/file/alternate-layer.png";
  const project = designProject([
    imageElement("empty-placeholder", ""),
    imageElement("inline-image", dataUrl),
    imageElement("long-url-image", longUrl),
    imageElement("alternate-ref", "", {
      source: alternateUrl,
      sourceArtifactId: "33333333-3333-4333-8333-333333333333",
      sourceRevisionId: "44444444-4444-4444-8444-444444444444",
    }),
  ]);
  const blob = sourceBlob(project);
  const sourceDigest = createHash("sha256")
    .update(JSON.stringify(project))
    .digest("hex");

  const opened = await validateDesignCompositeSource(
    blob,
    designItem({
      sourceDigest,
      dependencyRevisionIds: [
        "44444444-4444-4444-8444-444444444444",
      ],
    }),
    {
      requireBaseIdentity: false,
      requireBaseRevision: false,
      validation: "open",
    },
  );
  assert.equal(opened.sourceKind, "canonical");
  assert.equal(opened.sourceMode, "layered");
  assert.deepEqual(opened.dependencyRevisionIds, [
    "44444444-4444-4444-8444-444444444444",
  ]);

  await assert.rejects(
    validateDesignCompositeSource(blob, designItem()),
    (error) =>
      error instanceof DesignCompositeCommitError &&
      error.code === "incomplete-dependency-closure",
  );
});

test("design open still rejects corrupt image structure, identity and untrusted references", async () => {
  for (const corrupt of [
    imageElement("", ""),
    { ...imageElement("bad-props", ""), props: null },
    imageElement("bad-src", 42),
    imageElement("split-identity", "", {
      sourceArtifactId: "artifact-without-revision",
    }),
    imageElement("untrusted", "https://example.com/layer.png"),
  ]) {
    await assert.rejects(
      validateDesignCompositeSource(
        sourceBlob(designProject([corrupt])),
        designItem(),
        {
          requireBaseIdentity: false,
          requireBaseRevision: false,
          validation: "open",
        },
      ),
      (error) => error instanceof DesignCompositeCommitError,
    );
  }
});
