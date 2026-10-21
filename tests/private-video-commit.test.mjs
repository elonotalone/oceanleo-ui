import test from "node:test";
import assert from "node:assert/strict";
import { privateVideoBlobCommit } from "../src/shell/editor-private-video-commit.ts";
import { asEditorToHostMessage, EDITOR_PROTOCOL } from "../src/shell/editor-protocol.ts";
import { persistEmbeddedTypedCommit } from "../src/shell/design-composite-commit.ts";
import { planArtifactSaveRenditions } from "../src/shell/doc-editors/artifact-save-contract.ts";

const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const root = "11111111-1111-4111-8111-111111111111";
const revision = "22222222-2222-4222-8222-222222222222";
const nextRevision = "33333333-3333-4333-8333-333333333333";
const source = { blobId: `project-assets:u/${owner}/video/source.json`, digest: "a".repeat(64), mediaType: "application/json", byteSize: 100 };
const preview = { blobId: `project-assets:u/${owner}/video/preview.png`, digest: "b".repeat(64), mediaType: "image/png", byteSize: 200 };
const meta = () => ({ requires_typed_artifact_commit: true, artifact_type: "workflow", source_format: "oceanleo.video.project.v2", artifact_id: root, expected_artifact_revision_id: revision, preview_static_frame: "final", private_blob_commit: { source: { ...source }, preview: { ...preview } } });
const envelope = (overrides = {}) => ({ protocol: EDITOR_PROTOCOL, instanceId: "private-video", type: "artifact-updated", saveId: "save-1", revision: 1, url: "https://api.oceanleo.com/v1/artifact-renditions/access/opened-compatibility-only", meta: meta(), ...overrides });

function item(revisionId = revision) {
  return { id: root, key: `${root}:${revisionId}`, title: "Video workflow", kind: "workflow", url: "https://api.oceanleo.com/opened", artifactId: root, revisionId, artifactType: "workflow", artifact: { artifactId: root, revisionId, artifactType: "workflow", sourceFormat: "oceanleo.video.project.v2", editorCapability: "video-canvas", owner: { principalId: owner, visibility: "private" }, access: { canEdit: true, canFork: true }, integrity: { ok: true } } };
}

test("private video staging descriptors are bounded, bucket-bound and exact", () => {
  assert.deepEqual(privateVideoBlobCommit(meta()), { source, preview });
  for (const replacement of [
    { ...source, blobId: source.blobId.replace("project-assets:", "media-uploads:") },
    { ...source, blobId: source.blobId.replace("/video/", "/../") },
    { ...source, digest: "invalid" },
    { ...source, byteSize: 0 },
    { ...source, byteSize: 20 * 1024 * 1024 + 1 },
    { ...source, byteSize: "100" },
    { ...source, mediaType: "text/html" },
    { ...source, url: "https://attacker.test/a" },
  ]) {
    const value = meta(); value.private_blob_commit.source = replacement;
    assert.equal(privateVideoBlobCommit(value), null);
  }
  for (const overrides of [{ artifact_type: "website" }, { source_format: "json" }]) {
    assert.equal(privateVideoBlobCommit({ ...meta(), ...overrides }), null);
  }
  const mismatchedOwner = meta();
  mismatchedOwner.private_blob_commit.preview.blobId = preview.blobId.replace(owner, root);
  assert.equal(privateVideoBlobCommit(mismatchedOwner), null);
});

test("strict video private commit crosses the existing envelope without preview URL; malformed private data never falls back to URL", () => {
  assert.ok(asEditorToHostMessage(envelope(), "private-video"));
  assert.equal(asEditorToHostMessage(envelope(), "wrong-instance"), null);
  const invalid = meta(); invalid.private_blob_commit.preview.blobId = "u/not-bucket-bound/preview.png";
  invalid.editor_project_url = "https://api.oceanleo.com/source.json";
  assert.equal(asEditorToHostMessage(envelope({ previewUrl: "https://api.oceanleo.com/preview.png", meta: invalid }), "private-video"), null);
});

test("the sole rendition planner preserves private blob references without inventing a public URL", () => {
  const plan = planArtifactSaveRenditions("workflow", { delivery: { url: "", blobId: source.blobId, digest: source.digest }, previewBitmap: { url: "", blobId: preview.blobId, digest: preview.digest } });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.renditions.map(({ purpose, blobId, url }) => ({ purpose, blobId, url })), [
    { purpose: "preview", blobId: preview.blobId, url: "" },
    { purpose: "full", blobId: source.blobId, url: "" },
  ]);
  assert.equal(planArtifactSaveRenditions("workflow", { delivery: { url: "https://public.test/source", blobId: source.blobId, digest: source.digest } }).ok, false);
});

test("actual embedded commit publishes only owner-private blob IDs and exact CAS; no old URL fetch/rehost", async () => {
  let published;
  const result = await persistEmbeddedTypedCommit(item(), envelope(), {
    fetchBlob: async () => { throw new Error("private staged bytes must not fetch/rehost the compatibility URL"); },
    fork: async () => { throw new Error("private owner edit must keep root"); },
    publish: async (artifactId, request) => { published = { artifactId, request }; return { ok: true, data: item(nextRevision) }; },
  });
  assert.equal(result.revisionId, nextRevision);
  assert.equal(published.artifactId, root);
  assert.equal(published.request.expectedRevisionId, revision);
  assert.deepEqual(published.request.source, { format: "oceanleo.video.project.v2", blobId: source.blobId, digest: source.digest });
  assert.equal(published.request.renditions.every((ref) => ref.blobId?.startsWith("project-assets:") && !ref.url), true);
  assert.equal(JSON.stringify(published).includes("opened-compatibility-only"), false);
  await assert.rejects(persistEmbeddedTypedCommit(item(), envelope({ meta: { ...meta(), expected_artifact_revision_id: nextRevision } })), /identity|身份|base/i);
});
