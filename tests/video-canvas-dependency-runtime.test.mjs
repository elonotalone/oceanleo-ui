import test from "node:test";
import assert from "node:assert/strict";
import {
  extractVideoCanvasSourceDependencies,
  normalizeVideoCanvasDependencyPath,
  validateVideoCanvasDependencyGrant,
  videoCanvasDependencyGrantPath,
} from "../src/shell/workflow-carrier/video-canvas-dependency-runtime.mjs";

const artifactId = "9c6ef0c3-34dc-4a80-ac80-ab269d31ba18";
const revisionId = "0b7be1b1-4f3b-43f5-93fc-1fb210c42fda";
const gateway = "https://api.oceanleo.com";
const source = {
  schemaVersion: "oceanleo.video-canvas.v1",
  headVersionId: "v1",
  assets: [
    { id: "image", sha256: "0b873e092f7f73e079709f7a25f8be591d96fee93fb9c899f787d29b2f6127c7", mediaType: "image/webp", byteSize: 34480 },
    { id: "video", sha256: "7dfab1379bf9093ebf05ca4bd63b198202233eb7920ebfb3f23835e732cacfc3", mediaType: "video/mp4", byteSize: 19966599 },
    { id: "audio", sha256: "46aaa7d8a70f44f7b2993a872f30a949bcfb86a1a73699d2184000aff18827c8", mediaType: "audio/mpeg", byteSize: 1991170 },
  ],
  versions: [{
    id: "v1",
    graph: { nodes: [
      { id: "image", params: { path: "assets/coffee.webp" } },
      { id: "video", params: { path: "assets/hearts.mp4" } },
      { id: "audio", params: { path: "assets/music.mp3" } },
    ] },
  }],
};

test("extracts the actual-shaped v1 dependency refs from active source paths", () => {
  const refs = extractVideoCanvasSourceDependencies(source, { artifactId, revisionId });
  assert.deepEqual(refs.map(({ assetId, path, sha256, mediaType, byteSize }) => ({
    assetId, path, sha256, mediaType, byteSize,
  })), [
    { assetId: "image", path: "assets/coffee.webp", sha256: source.assets[0].sha256, mediaType: "image/webp", byteSize: 34480 },
    { assetId: "video", path: "assets/hearts.mp4", sha256: source.assets[1].sha256, mediaType: "video/mp4", byteSize: 19966599 },
    { assetId: "audio", path: "assets/music.mp3", sha256: source.assets[2].sha256, mediaType: "audio/mpeg", byteSize: 1991170 },
  ]);
});

test("grant route and response remain pinned to same root, current revision, and exact path", () => {
  const ref = extractVideoCanvasSourceDependencies(source, { artifactId, revisionId })[0];
  assert.equal(
    videoCanvasDependencyGrantPath({ artifactId, revisionId }, ref.path),
    `/v1/artifacts/${artifactId}/revisions/${revisionId}/source-dependencies/assets/coffee.webp`,
  );
  const now = Date.now();
  const grant = validateVideoCanvasDependencyGrant({
    artifactId,
    revisionId,
    dependencyPath: ref.path,
    purpose: "source",
    accessUrl: `${gateway}/v1/artifact-renditions/access/opaque-grant`,
    expiresAt: new Date(now + 60_000).toISOString(),
  }, ref, gateway, now);
  assert.equal(grant.accessUrl, `${gateway}/v1/artifact-renditions/access/opaque-grant`);
  assert.equal(grant.sha256, ref.sha256);
  assert.equal(grant.byteSize, ref.byteSize);
});

test("rejects unsafe paths and grants with mismatched identity, path, URL, or expiry", () => {
  for (const path of ["/assets/a", "assets/../a", "assets/%2e%2e/a", "assets/a?x=1", "assets\\a", "https://evil.test/a"]) {
    assert.throws(() => normalizeVideoCanvasDependencyPath(path));
  }
  const ref = extractVideoCanvasSourceDependencies(source, { artifactId, revisionId })[0];
  const base = {
    artifactId,
    revisionId,
    dependencyPath: ref.path,
    purpose: "source",
    accessUrl: `${gateway}/v1/artifact-renditions/access/opaque-grant`,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  for (const invalid of [
    { ...base, artifactId: "00000000-0000-4000-8000-000000000000" },
    { ...base, dependencyPath: "assets/other.webp" },
    { ...base, accessUrl: "https://attacker.example/v1/artifact-renditions/access/x" },
    { ...base, accessUrl: `${gateway}/v1/artifact-renditions/access/x?token=bad` },
    { ...base, expiresAt: new Date(Date.now() - 1_000).toISOString() },
  ]) {
    assert.throws(() => validateVideoCanvasDependencyGrant(invalid, ref, gateway));
  }
});

test("v2 stable refs are accepted only without runtime locator fields", () => {
  const pinnedRevisionId = "33333333-3333-4333-8333-333333333333";
  const project = {
    schema: "oceanleo.video.project.v2",
    assets: {
      image: {
        contentDigest: source.assets[0].sha256,
        mime: "image/webp",
        sourceDependency: {
          artifactId,
          revisionId: pinnedRevisionId,
          path: "assets/coffee.webp",
          sha256: source.assets[0].sha256,
          mediaType: "image/webp",
          byteSize: 34480,
        },
      },
    },
  };
  const [currentRef] = extractVideoCanvasSourceDependencies(project, { artifactId, revisionId });
  assert.equal(currentRef.revisionId, revisionId);
  assert.equal(currentRef.path, "assets/coffee.webp");
  const currentGrant = {
    artifactId,
    revisionId,
    dependencyPath: currentRef.path,
    purpose: "source",
    accessUrl: `${gateway}/v1/artifact-renditions/access/current-revision-grant`,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  assert.doesNotThrow(() => validateVideoCanvasDependencyGrant(currentGrant, currentRef, gateway));
  assert.throws(() => validateVideoCanvasDependencyGrant({
    ...currentGrant,
    revisionId: pinnedRevisionId,
  }, currentRef, gateway));
  project.assets.image.url = "blob:https://video.oceanleo.com/runtime";
  assert.throws(() => extractVideoCanvasSourceDependencies(project, { artifactId, revisionId }));
});
