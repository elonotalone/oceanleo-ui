import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  materializeModel3DGltfDependencies,
  model3DDependencyGrantPath,
  model3DDependencyPath,
  model3DSourceGrantPath,
  qualifyModel3DGrantUrl,
  validateModel3DGrant,
} from "../src/shell/media-editors/model3d-dependency-runtime.mjs";
import {
  model3DPosterForItem,
} from "../src/shell/media-editors/model3d-workbench-defaults.ts";

const GATEWAY = "https://api.oceanleo.com";
const IDENTITY = {
  artifactId: "84c56188-2106-4271-ae72-848d32db1335",
  revisionId: "43bb4ef9-966a-49cf-a07c-b7171ea52bee",
  sourceDigest: "6b908c48f0f5300ba561cbcfe38e938863e8d1d33569e9a1fab6c7e9c16f8e95",
};
const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("typed glTF dependencies use revision/path grants, not the source token as a directory", () => {
  const sourceGrant =
    `${GATEWAY}/v1/artifact-renditions/access/source-token`;
  assert.equal(
    new URL("textures/base color.jpg", sourceGrant).pathname,
    "/v1/artifact-renditions/access/textures/base%20color.jpg",
  );
  assert.equal(
    model3DSourceGrantPath(IDENTITY),
    `/v1/artifacts/${IDENTITY.artifactId}/source` +
      `?revisionId=${IDENTITY.revisionId}`,
  );
  assert.equal(
    model3DDependencyGrantPath(IDENTITY, "textures/base%20color.jpg"),
    `/v1/artifacts/${IDENTITY.artifactId}/revisions/${IDENTITY.revisionId}` +
      "/source-dependencies/textures/base%20color.jpg",
  );
  assert.equal(
    model3DDependencyPath("textures/base%20color.jpg"),
    "textures/base color.jpg",
  );
  for (const unsafe of [
    "../secret.bin",
    "/absolute.bin",
    "https://cdn.example/foreign.bin",
    "textures/../../secret.bin",
    "blob:old-session",
  ]) {
    assert.throws(() => model3DDependencyPath(unsafe), /dependency/);
  }
});

test("source and dependency grants remain pinned to exact identity and expiry", () => {
  const expiresAt = "2030-01-01T00:00:00.000Z";
  const source = validateModel3DGrant(
    {
      artifactId: IDENTITY.artifactId,
      revisionId: IDENTITY.revisionId,
      purpose: "source",
      mode: "source",
      accessUrl: "/v1/artifact-renditions/access/source-token",
      expiresAt,
      format: "gltf",
      mediaType: "model/gltf+json",
    },
    IDENTITY,
    GATEWAY,
    "",
    Date.UTC(2029, 0, 1),
  );
  assert.equal(source.url, `${GATEWAY}/v1/artifact-renditions/access/source-token`);
  assert.equal(source.format, "gltf");

  const dependency = validateModel3DGrant(
    {
      artifact_id: IDENTITY.artifactId,
      revision_id: IDENTITY.revisionId,
      purpose: "source",
      mode: "source",
      dependency_path: "textures/base color.jpg",
      access_url: "/v1/artifact-renditions/access/dependency-token",
      expires_at: expiresAt,
    },
    IDENTITY,
    GATEWAY,
    "textures/base%20color.jpg",
    Date.UTC(2029, 0, 1),
  );
  assert.equal(dependency.dependencyPath, "textures/base color.jpg");
  assert.equal(
    qualifyModel3DGrantUrl(
      "https://evil.example/v1/artifact-renditions/access/token",
      GATEWAY,
    ),
    "",
  );
  assert.throws(
    () =>
      validateModel3DGrant(
        {
          artifactId: IDENTITY.artifactId,
          revisionId: IDENTITY.revisionId,
          purpose: "source",
          mode: "source",
          dependencyPath: "textures/other.jpg",
          accessUrl: "/v1/artifact-renditions/access/token",
          expiresAt,
        },
        IDENTITY,
        GATEWAY,
        "textures/base%20color.jpg",
        Date.UTC(2029, 0, 1),
      ),
    /not pinned/,
  );
});

test("glTF closure materialization deduplicates object URLs and revokes exactly once", async () => {
  const calls = [];
  const created = [];
  const revoked = [];
  const objectUrlApi = {
    createObjectURL(blob) {
      const url = `blob:test-${created.length + 1}`;
      created.push({ url, size: blob.size });
      return url;
    },
    revokeObjectURL(url) {
      revoked.push(url);
    },
  };
  const source = {
    asset: { version: "2.0" },
    buffers: [{ uri: "scene.bin", byteLength: 8 }],
    images: [
      { uri: "textures/base.png" },
      { uri: "textures/normal.png" },
      { uri: "textures/base.png" },
    ],
  };
  const prepared = await materializeModel3DGltfDependencies(
    source,
    async (uri) => {
      calls.push(uri);
      return new Blob([uri], {
        type: uri.endsWith(".png") ? "image/png" : "application/octet-stream",
      });
    },
    objectUrlApi,
  );
  assert.deepEqual(calls, [
    "scene.bin",
    "textures/base.png",
    "textures/normal.png",
  ]);
  assert.equal(prepared.document.buffers[0].uri, "blob:test-1");
  assert.equal(prepared.document.images[0].uri, "blob:test-2");
  assert.equal(prepared.document.images[2].uri, "blob:test-2");
  assert.equal(source.buffers[0].uri, "scene.bin", "source document stays immutable");
  prepared.release();
  prepared.release();
  assert.deepEqual(revoked, ["blob:test-1", "blob:test-2", "blob:test-3"]);
});

test("partial closure failures revoke every object URL already created", async () => {
  const revoked = [];
  await assert.rejects(
    materializeModel3DGltfDependencies(
      {
        asset: { version: "2.0" },
        buffers: [{ uri: "scene.bin" }],
        images: [{ uri: "textures/missing.png" }],
      },
      async (uri) => {
        if (uri.includes("missing")) throw new Error("dependency unavailable");
        return new Blob(["scene"]);
      },
      {
        createObjectURL: () => "blob:scene",
        revokeObjectURL: (url) => revoked.push(url),
      },
    ),
    /dependency unavailable/,
  );
  assert.deepEqual(revoked, ["blob:scene"]);
});

test("model poster handoff prefers rendered images and rejects model entrypoints", () => {
  const item = {
    key: "artifact:model",
    source: "artifact",
    id: "model",
    title: "Model",
    kind: "threed",
    siteId: "threed",
    url: "https://api.oceanleo.com/source.gltf",
    thumbUrl: "https://api.oceanleo.com/source.gltf",
    previewUrl: "https://api.oceanleo.com/model-preview",
    favorite: false,
    meta: {
      thumbnail_media_type: "model/gltf+json",
      preview_media_type: "image/png",
    },
  };
  assert.equal(
    model3DPosterForItem(item),
    "https://api.oceanleo.com/model-preview",
  );
  item.meta.model_poster_url = "https://cdn.example/generated-poster.png";
  assert.equal(
    model3DPosterForItem(item),
    "https://cdn.example/generated-poster.png",
  );
  delete item.meta.model_poster_url;
  item.meta.preview_media_type = "model/gltf+json";
  item.previewUrl = "https://api.oceanleo.com/preview.gltf";
  assert.equal(model3DPosterForItem(item), "");
});

test("route and hooks wire authenticated closure loading, deferred cleanup and poster handoff", () => {
  const files = source("../src/shell/media-editors/model3d-files.ts");
  const loader = source("../src/shell/media-editors/use-model3d-source-loader.ts");
  const workbench = source("../src/shell/media-editors/use-model3d-workbench.ts");
  const save = source("../src/shell/media-editors/use-model3d-save.ts");
  const stage = source("../src/shell/media-editors/Model3DStage.tsx");
  const route = source("../src/shell/advanced-routes/Model3DRoute.tsx");
  assert.match(files, /token = await accessToken\(\)/);
  assert.match(files, /Authorization: `Bearer \$\{token\}`/);
  assert.match(files, /model3DDependencyGrantPath\(identity, dependencyPath\)/);
  assert.match(files, /materializeModel3DGltfDependencies/);
  assert.match(loader, /artifactIdentity,/);
  assert.doesNotMatch(
    loader.slice(loader.indexOf("return () => {")),
    /releasePreparedSource\?\.\(\)/,
  );
  assert.match(workbench, /item\.artifact\?\.renditions\.source\?\.digest/);
  assert.match(workbench, /model3DPosterForItem\(item\)/);
  assert.match(save, /uploadModel3DPoster/);
  assert.match(stage, /data-testid="model3d-poster"/);
  assert.match(route, /previewUrl: saved\.posterUrl/);
  assert.match(route, /thumbUrl: saved\.posterUrl/);
  assert.match(route, /thumbnail_media_type: "image\/png"/);
});
