import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DesignCompositeCommitError,
  validateDesignCompositeSource,
} from "../src/shell/design-composite-commit.ts";
import {
  buildOpenAssetPayload,
  websiteEmbedExtraParams,
} from "../src/shell/website-embed-params.ts";

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

function videoProjectItem() {
  const sourceDigest = `sha256:${"a".repeat(64)}`;
  const sourceUrl =
    "https://api.oceanleo.com/v1/media/file/video-project-v2.json?revision=7";
  return {
    key: "artifact:video-project:video-revision-7",
    source: "artifact",
    id: "video-project",
    title: "Durable video project",
    kind: "video_canvas",
    siteId: "video",
    favorite: false,
    url: "https://api.oceanleo.com/v1/media/file/video-preview.webp",
    previewUrl: "https://api.oceanleo.com/v1/media/file/video-preview.webp",
    meta: {
      verified: true,
      content_digest: `sha256:${"b".repeat(64)}`,
      sha256: `sha256:${"c".repeat(64)}`,
      workflow_json: { stale: true },
      artifact_id: "spoofed-artifact",
      revision_id: "spoofed-revision",
    },
    artifactId: "video-project",
    revisionId: "video-revision-7",
    artifactType: "workflow",
    artifact: {
      schema: "oceanleo.artifact.v1",
      artifactId: "video-project",
      revisionId: "video-revision-7",
      artifactType: "workflow",
      sourceFormat: "oceanleo.video.project.v2",
      editorCapability: "video-canvas",
      editability: "native",
      integrity: { ok: true },
      access: { canRead: true, canEdit: true, canFork: false },
      renditions: {
        source: {
          purpose: "source",
          revisionId: "video-revision-7",
          url: sourceUrl,
          mediaType: "application/json",
          format: "oceanleo.video.project.v2",
          digest: sourceDigest,
        },
      },
    },
  };
}

test("video project open asserts verification only for the exact fixed source rendition", () => {
  const item = videoProjectItem();
  const payload = buildOpenAssetPayload(item);
  const source = item.artifact.renditions.source;

  assert.equal(payload.url, source.url);
  assert.equal(payload.meta.verified, true);
  assert.equal(payload.meta.content_digest, source.digest);
  assert.equal(payload.meta.artifact_id, item.artifactId);
  assert.equal(payload.meta.revision_id, item.revisionId);
  assert.equal(payload.artifactId, item.artifactId);
  assert.equal(payload.revisionId, item.revisionId);
  assert.equal("sha256" in payload.meta, false);
  assert.equal("workflow_json" in payload.meta, false);
});

test("video project open strips spoofed verification when integrity, ACL, pin, digest or URL is not verified", () => {
  const variants = [
    (item) => {
      item.artifact.integrity.ok = false;
    },
    (item) => {
      item.artifact.access.canRead = false;
    },
    (item) => {
      item.artifact.renditions.source.revisionId = "another-revision";
    },
    (item) => {
      item.artifact.renditions.source.digest = "not-a-sha256";
    },
    (item) => {
      item.artifact.renditions.source.url =
        "https://example.com/untrusted-project.json";
    },
  ];

  for (const mutate of variants) {
    const item = videoProjectItem();
    mutate(item);
    const payload = buildOpenAssetPayload(item);
    assert.equal("verified" in payload.meta, false);
    assert.equal("content_digest" in payload.meta, false);
    assert.equal("sha256" in payload.meta, false);
    assert.equal("workflow_json" in payload.meta, false);
  }
});

test("website embed keeps canonical artifact, revision and project identity and never blanks a durable material", () => {
  const projectId = "55555555-5555-4555-8555-555555555555";
  const item = {
    key: `artifact:${artifactId}:${revisionId}`,
    source: "artifact",
    id: artifactId,
    title: "Durable website",
    kind: "website",
    siteId: "word",
    favorite: false,
    meta: { draft: true, blank: true },
    artifact: {
      artifactId,
      revisionId,
      artifactType: "website",
      project_id: projectId,
    },
  };

  assert.deepEqual(websiteEmbedExtraParams(item), {
    projectId,
    siteId: projectId,
    artifactId,
    revisionId,
  });
  const payload = buildOpenAssetPayload(item);
  assert.equal(payload.artifactId, artifactId);
  assert.equal(payload.revisionId, revisionId);
  assert.equal(payload.meta.artifact_id, artifactId);
  assert.equal(payload.meta.revision_id, revisionId);

  assert.deepEqual(
    websiteEmbedExtraParams({
      ...item,
      key: "draft:website",
      source: "creation",
      id: "draft:website",
      meta: { draft: true },
      artifact: undefined,
    }),
    { blank: "1" },
  );
});

test("embedded design handshake explicitly uses read/open validation", async () => {
  const route = await readFile(
    new URL(
      "../src/shell/advanced-routes/EmbeddedRoute.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    route,
    /validateDesignCompositeSource\(blob, item, \{[\s\S]*?validation: "open"/,
  );
});
