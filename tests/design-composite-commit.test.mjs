import assert from "node:assert/strict";
import test from "node:test";

import {
  DesignCompositeCommitError,
  persistDesignCompositeCommit,
  validateDesignCompositeCommit,
  validateDesignCompositeSource,
  verifyDesignCompositeSourceDigest,
} from "../src/shell/design-composite-commit.ts";

globalThis.window ||= {
  location: { href: "https://design.oceanleo.com/", origin: "https://design.oceanleo.com" },
};

const artifactId = "11111111-1111-4111-8111-111111111111";
const revisionId = "22222222-2222-4222-8222-222222222222";
const dependencyRevisionId = "33333333-3333-4333-8333-333333333333";
const dependencyArtifactId = "44444444-4444-4444-8444-444444444444";
const imageUrl = "https://api.oceanleo.com/v1/media/file/layer.png";

function item({
  rootId = artifactId,
  headId = revisionId,
  visibility = "private",
  canEdit = true,
  sourceDigest = "a".repeat(64),
  previewDigest = "b".repeat(64),
  closureDigest = "c".repeat(64),
} = {}) {
  return {
    id: rootId,
    key: `${rootId}:${headId}`,
    title: "Layered design",
    kind: "image",
    url: imageUrl,
    previewUrl: imageUrl,
    artifactId: rootId,
    revisionId: headId,
    artifactType: "composite_image",
    artifact: {
      schema: "oceanleo.artifact.v1",
      artifactId: rootId,
      revisionId: headId,
      artifactType: "composite_image",
      sourceFormat: "oceanleo.design-document.v1",
      editorCapability: "design-canvas",
      owner: { visibility },
      access: { canFork: true, canEdit },
      integrity: { ok: true },
      renditions: {
        source: {
          purpose: "source",
          revisionId: headId,
          url: imageUrl,
          digest: sourceDigest,
        },
        preview: {
          purpose: "preview",
          revisionId: headId,
          url: imageUrl,
          digest: previewDigest,
        },
        full: {
          purpose: "full",
          revisionId: headId,
          url: imageUrl,
          digest: previewDigest,
        },
      },
      scene: {
        schema: "oceanleo.design-document.v1",
        sceneRevisionId: headId,
        closureStatus: "complete",
        closureDigest,
        dependencyRevisionIds: [dependencyRevisionId],
      },
    },
  };
}

function project(overrides = {}) {
  const document = {
    id: "document-1",
    sourceMode: "layered",
    background: {},
    elements: [
      {
        id: "layer-image",
        type: "image",
        props: { src: imageUrl },
      },
    ],
  };
  const dependency = (id) => ({
    id,
    kind: "image",
    required: true,
    url: imageUrl,
    sourceArtifactId: dependencyArtifactId,
    sourceRevisionId: dependencyRevisionId,
  });
  return {
    schema: "oceanleo.design-document.v1",
    version: 1,
    updatedAt: "2026-07-23T00:00:00.000Z",
    revision: 8,
    artifactType: "composite_image",
    baseArtifact: { artifactId, revisionId },
    sceneGraph: {
      schema: "oceanleo.design-scene.v1",
      revision: 8,
      documentId: document.id,
      sourceMode: "layered",
    },
    dependencyManifest: {
      schema: "oceanleo.dependency-manifest.v1",
      revision: 8,
      sceneGraphFormat: "oceanleo.design-document.v1",
      dependencies: [
        dependency("scene:element:layer-image"),
        dependency("history:0:element:layer-image"),
      ],
    },
    history: {
      schema: "oceanleo.design-history.v1",
      entries: [structuredClone(document)],
      index: 0,
    },
    document,
    ...overrides,
  };
}

function pngBlob() {
  return new Blob(
    [
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    ],
    { type: "image/png" },
  );
}

test("design typed commit validates canonical source and dependency closure", async () => {
  const source = new Blob([JSON.stringify(project())], {
    type: "application/json",
  });
  const evidence = await validateDesignCompositeCommit(source, pngBlob(), item());
  assert.match(evidence.sourceDigest, /^[0-9a-f]{64}$/);
  assert.match(evidence.previewDigest, /^[0-9a-f]{64}$/);
  assert.match(evidence.closureDigest, /^[0-9a-f]{64}$/);
  assert.deepEqual(evidence.dependencyRevisionIds, [dependencyRevisionId]);
});

test("published flat Design template normalizes structurally without weakening digest pin", async () => {
  const flatTemplate = {
    templateId: "promo-poster-1",
    id: "tpl-promo-poster-1",
    title: "促销海报 夏日焕新",
    width: 800,
    height: 1200,
    background: {
      gradient: "linear-gradient(180deg,#dbeafe,#bfdbfe)",
    },
    elements: [
      {
        id: "r1",
        type: "shape",
        x: 45,
        y: 55,
        w: 710,
        h: 1090,
        rotation: 0,
        locked: false,
        props: {
          kind: "rect",
          fill: "#ffffff",
          stroke: "transparent",
          strokeWidth: 0,
          radius: 24,
        },
      },
      {
        id: "t1",
        type: "text",
        x: 90,
        y: 130,
        w: 620,
        h: 120,
        rotation: 0,
        locked: false,
        props: {
          text: "{{title}}",
          fontSize: 72,
          color: "#2563eb",
          fontFamily: "system-ui",
        },
      },
    ],
    updatedAt: "2026-06-12T00:00:00.000Z",
  };
  const source = new Blob([`${JSON.stringify(flatTemplate)}\n`], {
    type: "application/json",
  });
  const evidence = await validateDesignCompositeSource(source, item({
    closureDigest: "d".repeat(64),
  }), {
    requireBaseIdentity: false,
    requireBaseRevision: false,
  });

  assert.equal(evidence.sourceKind, "flat-template");
  assert.equal(evidence.sourceMode, "layered");
  assert.equal(evidence.revision, 0);
  assert.deepEqual(evidence.dependencyRevisionIds, []);
  await assert.doesNotReject(
    verifyDesignCompositeSourceDigest(source, evidence.sourceDigest),
  );
  await assert.rejects(
    verifyDesignCompositeSourceDigest(source, "f".repeat(64)),
    (error) =>
      error instanceof DesignCompositeCommitError &&
      error.code === "design-source-digest-mismatch",
  );
});

test("canonical flattened projects are valid but stale or split revisions fail precisely", async () => {
  const flattened = project();
  flattened.sceneGraph.sourceMode = "flattened";
  flattened.document.sourceMode = "flattened";
  const valid = await validateDesignCompositeSource(
    new Blob([JSON.stringify(flattened)], { type: "application/json" }),
    item(),
  );
  assert.equal(valid.sourceMode, "flattened");

  const stale = project({
    baseArtifact: { artifactId, revisionId: "stale-revision" },
  });
  await assert.rejects(
    validateDesignCompositeSource(
      new Blob([JSON.stringify(stale)], { type: "application/json" }),
      item(),
    ),
    (error) =>
      error instanceof DesignCompositeCommitError &&
      error.code === "design-source-stale-revision" &&
      error.currentRevisionId === revisionId,
  );

  const splitRevision = project();
  splitRevision.sceneGraph.revision = splitRevision.revision + 1;
  await assert.rejects(
    validateDesignCompositeSource(
      new Blob([JSON.stringify(splitRevision)], {
        type: "application/json",
      }),
      item(),
    ),
    (error) =>
      error instanceof DesignCompositeCommitError &&
      error.code === "design-source-revision-mismatch",
  );
});

test("design typed commit rejects preview impostors and incomplete closure", async () => {
  const missingClosure = new Blob(
    [
      JSON.stringify(
        project({
          dependencyManifest: {
            schema: "oceanleo.dependency-manifest.v1",
            revision: 8,
            sceneGraphFormat: "oceanleo.design-document.v1",
            dependencies: [],
          },
        }),
      ),
    ],
    { type: "application/json" },
  );
  await assert.rejects(
    validateDesignCompositeCommit(missingClosure, pngBlob(), item()),
    (error) =>
      error instanceof DesignCompositeCommitError &&
      error.code === "incomplete-dependency-closure",
  );

  const source = new Blob([JSON.stringify(project())], {
    type: "application/json",
  });
  await assert.rejects(
    validateDesignCompositeCommit(
      source,
      new Blob(["<html>not an image</html>"], { type: "text/html" }),
      item(),
    ),
    (error) =>
      error instanceof DesignCompositeCommitError &&
      error.code === "invalid-preview",
  );
});

function projectFor(rootId, headId, revision) {
  const value = project({
    revision,
    baseArtifact: { artifactId: rootId, revisionId: headId },
  });
  value.sceneGraph.revision = revision;
  value.dependencyManifest.revision = revision;
  return value;
}

function commitMessage(rootId, headId, revision, sourceUrl, previewUrl) {
  return {
    url: previewUrl,
    previewUrl,
    revision,
    saveId: `save-${revision}`,
    meta: {
      artifact_id: rootId,
      expected_artifact_revision_id: headId,
      artifact_type: "composite_image",
      editor_project_url: sourceUrl,
      design_document_url: sourceUrl,
      editor_project_schema: "oceanleo.design-document.v1",
      source_format: "oceanleo.design-document.v1",
      design_document_revision: revision,
      preview_revision: revision,
      preview_static_frame: "final",
      requires_typed_artifact_commit: true,
    },
  };
}

function committedItem(rootId, previousHeadId, nextHeadId, commit) {
  const result = item({
    rootId,
    headId: nextHeadId,
    sourceDigest: commit.source.digest,
    previewDigest: commit.renditions.find(
      (rendition) => rendition.purpose === "preview",
    ).digest,
    closureDigest: commit.scene.closureDigest,
  });
  result.artifact.renditions.source.url = commit.source.url;
  result.artifact.renditions.preview.url = commit.renditions.find(
    (rendition) => rendition.purpose === "preview",
  ).url;
  result.artifact.renditions.full.url = commit.renditions.find(
    (rendition) => rendition.purpose === "full",
  ).url;
  result.artifact.scene.dependencyRevisionIds =
    commit.scene.dependencyRevisionIds;
  result.meta = { previous_revision_id: previousHeadId };
  return result;
}

test("design typed commits return identity and the next save CASes the new head", async () => {
  const rootId = artifactId;
  const firstHead = revisionId;
  const sourceUrls = [
    "https://api.oceanleo.com/v1/media/file/design-8.json",
    "https://api.oceanleo.com/v1/media/file/design-9.json",
  ];
  const previewUrls = [
    "https://api.oceanleo.com/v1/media/file/design-8.png",
    "https://api.oceanleo.com/v1/media/file/design-9.png",
  ];
  const blobs = new Map([
    [
      sourceUrls[0],
      new Blob([JSON.stringify(projectFor(rootId, firstHead, 8))], {
        type: "application/json",
      }),
    ],
    [previewUrls[0], pngBlob()],
  ]);
  const expectedHeads = [];
  let publishCount = 0;
  const dependencies = {
    fetchBlob: async (url) => {
      const blob = blobs.get(url);
      if (!blob) throw new Error(`missing fixture ${url}`);
      return blob;
    },
    publish: async (publishedRootId, commit) => {
      assert.equal(publishedRootId, rootId);
      expectedHeads.push(commit.expectedRevisionId);
      publishCount += 1;
      return {
        ok: true,
        data: committedItem(
          rootId,
          commit.expectedRevisionId,
          `revision-next-${publishCount}`,
          commit,
        ),
      };
    },
  };
  const first = await persistDesignCompositeCommit(
    item(),
    commitMessage(rootId, firstHead, 8, sourceUrls[0], previewUrls[0]),
    dependencies,
  );
  assert.equal(first.artifactId, rootId);
  assert.equal(first.revisionId, "revision-next-1");

  blobs.set(
    sourceUrls[1],
    new Blob(
      [JSON.stringify(projectFor(rootId, first.revisionId, 9))],
      { type: "application/json" },
    ),
  );
  blobs.set(previewUrls[1], pngBlob());
  const second = await persistDesignCompositeCommit(
    first,
    commitMessage(
      rootId,
      first.revisionId,
      9,
      sourceUrls[1],
      previewUrls[1],
    ),
    dependencies,
  );
  assert.equal(second.revisionId, "revision-next-2");
  assert.deepEqual(expectedHeads, [firstHead, "revision-next-1"]);
});

test("public design templates fork and rebase source before atomic publish", async () => {
  const publicRoot = "55555555-5555-4555-8555-555555555555";
  const publicHead = "66666666-6666-4666-8666-666666666666";
  const forkRoot = "77777777-7777-4777-8777-777777777777";
  const forkHead = "88888888-8888-4888-8888-888888888888";
  const sourceUrl = "https://api.oceanleo.com/v1/media/file/public-design.json";
  const previewUrl = "https://api.oceanleo.com/v1/media/file/public-design.png";
  const rebasedUrl = "https://api.oceanleo.com/v1/media/file/fork-design.json";
  const sourceBlob = new Blob(
    [JSON.stringify(projectFor(publicRoot, publicHead, 3))],
    { type: "application/json" },
  );
  let rebasedBlob;
  const forked = item({ rootId: forkRoot, headId: forkHead });
  const saved = await persistDesignCompositeCommit(
    item({
      rootId: publicRoot,
      headId: publicHead,
      visibility: "public",
      canEdit: true,
    }),
    commitMessage(publicRoot, publicHead, 3, sourceUrl, previewUrl),
    {
      fetchBlob: async (url) => {
        if (url === sourceUrl) return sourceBlob;
        if (url === previewUrl) return pngBlob();
        if (url === rebasedUrl && rebasedBlob) return rebasedBlob;
        throw new Error(`missing fixture ${url}`);
      },
      fork: async () => ({ ok: true, data: forked }),
      uploadSource: async (blob, target) => {
        assert.equal(target.artifactId, forkRoot);
        rebasedBlob = blob;
        return rebasedUrl;
      },
      publish: async (publishedRootId, commit) => {
        assert.equal(publishedRootId, forkRoot);
        assert.equal(commit.expectedRevisionId, forkHead);
        assert.equal(commit.source.url, rebasedUrl);
        return {
          ok: true,
          data: committedItem(
            forkRoot,
            forkHead,
            "99999999-9999-4999-8999-999999999999",
            commit,
          ),
        };
      },
    },
  );
  assert.equal(saved.artifactId, forkRoot);
  assert.deepEqual(JSON.parse(await rebasedBlob.text()).baseArtifact, {
    artifactId: forkRoot,
    revisionId: forkHead,
  });
});

test("design CAS conflicts report the current cloud revision without overwriting", async () => {
  const sourceUrl = "https://api.oceanleo.com/v1/media/file/conflict-design.json";
  const previewUrl = "https://api.oceanleo.com/v1/media/file/conflict-design.png";
  const currentRevisionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  await assert.rejects(
    persistDesignCompositeCommit(
      item(),
      commitMessage(artifactId, revisionId, 8, sourceUrl, previewUrl),
      {
        fetchBlob: async (url) =>
          url === sourceUrl
            ? new Blob(
                [JSON.stringify(projectFor(artifactId, revisionId, 8))],
                { type: "application/json" },
              )
            : pngBlob(),
        publish: async () => ({
          ok: false,
          code: "revision-conflict",
          error: "head changed",
        }),
        resolveCurrentRevisionId: async () => currentRevisionId,
      },
    ),
    (error) =>
      error instanceof DesignCompositeCommitError &&
      error.code === "revision-conflict" &&
      error.currentRevisionId === currentRevisionId,
  );
});
