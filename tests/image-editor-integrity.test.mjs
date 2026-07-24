import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  IMAGE_LOCK_SERIALIZED_PROPS,
  IMAGE_LOCKED_ALLOWED_CONTROLS,
  IMAGE_OBJECT_MUTATION_CONTROLS,
  imageLockInteractionProps,
  imageObjectMutationAllowed,
  imageToolbarCommandAllowed,
} from "../src/shell/image-editor/image-mutation-policy.ts";
import {
  exportFrozenImageDocument,
  normalizeImageEditorSnapshot,
} from "../src/shell/image-editor/image-document-contract.ts";
import {
  IMAGE_SCENE_ENTRYPOINT,
  IMAGE_SCENE_SOURCE_SCHEMA,
  ImageSceneSourceError,
  assertImageDependencyAccess,
  createImageSceneSource,
  createImageSceneRevisionBundle,
  imageSceneDependencyRevisionIds,
  imageSceneWithResolvedDependencies,
  parseImageSceneSource,
  rebaseImageSceneSourceToCurrent,
  serializeImageSceneSource,
} from "../src/shell/image-editor/image-scene-source.ts";
import {
  CompositeImagePersistenceError,
  persistCompositeImageProject,
} from "../src/shell/image-editor/editor-persistence.ts";

globalThis.window ||= {
  location: {
    href: "https://image.oceanleo.com/workspace",
    origin: "https://image.oceanleo.com",
  },
};

test("locked image objects remain inspectable while every object mutation is rejected", () => {
  assert.deepEqual(imageLockInteractionProps(true), {
    selectable: true,
    evented: true,
    lockMovementX: true,
    lockMovementY: true,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
    lockSkewingX: true,
    lockSkewingY: true,
    hasControls: false,
    hoverCursor: "not-allowed",
  });
  for (const intent of [
    "style",
    "geometry",
    "content",
    "replace",
    "layer",
    "visibility",
    "duplicate",
    "delete",
  ]) {
    assert.equal(imageObjectMutationAllowed(true, intent), false, intent);
  }
  assert.equal(imageObjectMutationAllowed(true, "unlock"), true);
  assert.equal(imageObjectMutationAllowed(true, "metadata"), true);
});

test("locked image toolbar policy has no mutation bypass", () => {
  for (const controlId of IMAGE_OBJECT_MUTATION_CONTROLS) {
    assert.equal(
      imageToolbarCommandAllowed(true, controlId),
      false,
      controlId,
    );
  }
  for (const controlId of IMAGE_LOCKED_ALLOWED_CONTROLS) {
    assert.equal(imageToolbarCommandAllowed(true, controlId), true, controlId);
  }
  assert.equal(imageToolbarCommandAllowed(true, "future-mutation"), false);
});

test("image lock flags and continuous controls participate in snapshot/history contracts", () => {
  const required = new Set([
    "oceanleoLocked",
    "selectable",
    "evented",
    "lockMovementX",
    "lockMovementY",
    "lockScalingX",
    "lockScalingY",
    "lockRotation",
    "lockSkewingX",
    "lockSkewingY",
    "hasControls",
  ]);
  for (const property of required) {
    assert.ok(IMAGE_LOCK_SERIALIZED_PROPS.includes(property), property);
  }

  const core = readFileSync(
    new URL(
      "../src/shell/image-editor/fabric-controller-core.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const controls = readFileSync(
    new URL(
      "../src/shell/image-editor/FabricImageControls.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const controller = readFileSync(
    new URL(
      "../src/shell/image-editor/fabric-controller.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(core, /if \(this\.gestureBase\)[\s\S]*this\.currentSnapshot = next/);
  assert.match(core, /endGesture\(\)[\s\S]*this\.undoStack\.push\(base\)/);
  assert.match(core, /text:editing:entered[\s\S]*canMutateObject/);
  assert.match(core, /tool === "erase" && this\.hasLockedEditableObjects/);
  assert.match(controller, /resizeDoc[\s\S]*hasLockedEditableObjects/);
  assert.match(controls, /onPointerDown=\{onBegin\}/);
  assert.match(controls, /onBegin=\{editor\.beginGesture\}/);
  assert.match(controls, /onChange=\{\(value\) => editor\.setFilter/);
  assert.match(controls, /onPointerUp=\{onCommit\}/);
  assert.match(controls, /onCommit=\{editor\.endGesture\}/);
});

test("image recovery rejects malformed payloads and retains serialized lock state", () => {
  const snapshot = {
    json: {
      version: "6.0.0",
      objects: [
        {
          type: "rect",
          oceanleoId: "locked-object",
          oceanleoLocked: true,
          lockMovementX: true,
          lockMovementY: true,
          lockScalingX: true,
          lockScalingY: true,
          lockRotation: true,
        },
      ],
    },
    doc: { width: 1440, height: 1080 },
    canvasBackground: "#fefefe",
  };
  assert.deepEqual(normalizeImageEditorSnapshot(snapshot), snapshot);
  assert.equal(
    normalizeImageEditorSnapshot({
      ...snapshot,
      json: { version: "6.0.0", objects: "not-an-array" },
    }),
    null,
  );
  assert.equal(
    normalizeImageEditorSnapshot({
      ...snapshot,
      doc: { width: Number.NaN, height: 1080 },
    }),
    null,
  );
});

test("image export freezes a document raster before restoring the live viewport", async () => {
  const transforms = [];
  const originalViewport = [2, 0, 0, 2, 40, 50];
  let rasterViewport;
  let rasterOptions;
  let encoded;
  const canvas = {
    viewportTransform: [...originalViewport],
    setViewportTransform(next) {
      this.viewportTransform = [...next];
      transforms.push([...next]);
    },
    requestRenderAll() {},
    toCanvasElement(multiplier, options) {
      rasterViewport = [...this.viewportTransform];
      rasterOptions = { multiplier, ...options };
      return {
        toBlob(resolve, mime, quality) {
          encoded = { mime, quality };
          queueMicrotask(() =>
            resolve(new Blob(["frozen-raster"], { type: mime })),
          );
        },
      };
    },
  };

  const blob = await exportFrozenImageDocument(
    canvas,
    { width: 640, height: 480 },
    { format: "webp", quality: 0.82, multiplier: 2 },
  );

  assert.deepEqual(rasterViewport, [1, 0, 0, 1, 0, 0]);
  assert.deepEqual(rasterOptions, {
    multiplier: 2,
    left: 0,
    top: 0,
    width: 640,
    height: 480,
  });
  assert.deepEqual(canvas.viewportTransform, originalViewport);
  assert.deepEqual(transforms, [
    [1, 0, 0, 1, 0, 0],
    originalViewport,
  ]);
  assert.deepEqual(encoded, { mime: "image/webp", quality: 0.82 });
  assert.equal(blob?.type, "image/webp");
  assert.equal(await blob?.text(), "frozen-raster");
});

test("composite autosave commits scene source with a revision-matched static preview", () => {
  const hook = readFileSync(
    new URL(
      "../src/shell/image-editor/use-fabric-image-editor.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const saveBlock = hook.slice(
    hook.indexOf("const save = useCallback"),
    hook.indexOf("const runAiEdit = useCallback"),
  );
  assert.match(saveBlock, /persistCompositeImageProject/);
  assert.match(saveBlock, /const head = artifactHeadRef\.current/);
  assert.match(saveBlock, /artifactHeadRef\.current = saved\.item/);
  assert.match(saveBlock, /makeStaticPreviewBlob/);
  assert.doesNotMatch(saveBlock, /makeExportBlob|toBlob|toDataURL/);

  const persistence = readFileSync(
    new URL(
      "../src/shell/image-editor/editor-persistence.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const composite = persistence.slice(
    persistence.indexOf("async function persistCompositeImageProjectInternal"),
  );
  assert.match(composite, /createImageSceneRevisionBundle/);
  assert.match(composite, /assertPngPreview\(previewBlob\)/);
  assert.match(composite, /previewFile/);
  assert.match(composite, /preview_source_digest: sourceDigest/);
  assert.match(composite, /dependencies\.createArtifactRevision/);
  assert.match(composite, /dependencies\.getCurrent/);
  assert.match(composite, /reload-current-revision/);
  assert.match(composite, /format: IMAGE_SCENE_SOURCE_FORMAT/);

  const route = readFileSync(
    new URL(
      "../src/shell/advanced-routes/ImageRoute.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(route, /saved\.item[\s\S]*advancedCommittedRevisionItem/);
  assert.match(route, /画布仍保持未保存状态/);
});

function compositeItem(headId) {
  const artifactId = "artifact-composite";
  return {
    id: headId,
    key: `${artifactId}:${headId}`,
    title: "Composite image",
    kind: "image",
    source: "artifact",
    siteId: "image",
    favorite: false,
    meta: {},
    artifactId,
    revisionId: headId,
    artifactType: "composite_image",
    artifact: {
      schema: "oceanleo.artifact.v1",
      artifactId,
      revisionId: headId,
      artifactType: "composite_image",
      sourceFormat: "oceanleo-scene+json",
      editorCapability: "composite-image-editor",
      owner: { visibility: "private" },
      access: { canEdit: true },
      integrity: { ok: true },
      renditions: {},
      scene: {
        schema: IMAGE_SCENE_SOURCE_SCHEMA,
        sceneRevisionId: headId,
        closureStatus: "complete",
        closureDigest: "c".repeat(64),
        dependencyRevisionIds: [],
      },
    },
  };
}

function plainSnapshot() {
  return {
    json: {
      version: "6.0.0",
      objects: [
        {
          type: "rect",
          oceanleoId: "shape-1",
          left: 20,
          top: 30,
        },
      ],
    },
    doc: { width: 640, height: 360 },
    canvasBackground: "#ffffff",
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

test("composite persistence surfaces a recoverable authoritative CAS conflict", async () => {
  const stale = compositeItem("revision-stale");
  const current = compositeItem("revision-current");
  const uploaded = new Map();
  let publishedCommit;
  let uploadIndex = 0;
  await assert.rejects(
    persistCompositeImageProject(
      plainSnapshot(),
      stale,
      "image",
      "test-conflict",
      4,
      pngBlob(),
      {
        upload: async (file) => {
          uploadIndex += 1;
          const url = `https://api.oceanleo.com/v1/media/file/upload-${uploadIndex}`;
          const blob = new Blob([await file.arrayBuffer()], {
            type: file.type,
          });
          uploaded.set(url, blob);
          return {
            ok: true,
            data: {
              file: {
                url,
                meta: {
                  content_digest: createHash("sha256")
                    .update(Buffer.from(await blob.arrayBuffer()))
                    .digest("hex"),
                },
              },
            },
          };
        },
        fetchBlob: async (url) => {
          const blob = uploaded.get(url);
          if (!blob) throw new Error(`missing upload ${url}`);
          return blob;
        },
        createArtifactRevision: async (_artifactId, commit) => {
          publishedCommit = commit;
          return {
            ok: false,
            code: "revision-conflict",
            error: "head changed",
          };
        },
        getCurrent: async () => ({ ok: true, data: current }),
      },
    ),
    (error) =>
      error instanceof CompositeImagePersistenceError &&
      error.code === "revision-conflict" &&
      error.currentRevisionId === current.revisionId &&
      error.recovery === "reload-current-revision" &&
      error.recoverable === true &&
      error.uploadsPersisted === true &&
      /未成为新 head/.test(error.message),
  );
  assert.equal(publishedCommit.expectedRevisionId, stale.revisionId);
  assert.equal(uploaded.size, 2);
});

function layeredSnapshot() {
  const dependency = {
    id: "photo-layer",
    kind: "image",
    required: true,
    url: "https://api.oceanleo.com/v1/assets/photo.png",
    digest: "a".repeat(64),
    artifactId: "artifact-photo",
    revisionId: "revision-photo-7",
    renditionPurpose: "full",
    expiresAt: null,
  };
  return {
    json: {
      version: "6.0.0",
      objects: [
        {
          type: "rect",
          oceanleoId: "document-background",
          oceanleoRole: "docbg",
        },
        {
          type: "FabricImage",
          oceanleoId: "photo-layer",
          oceanleoKind: "image",
          src: "https://api.oceanleo.com/v1/media/proxy?url=runtime-only",
          left: 120,
          top: 180,
          oceanleoDependency: dependency,
        },
        {
          type: "textbox",
          oceanleoId: "caption-layer",
          text: "可编辑标题",
          left: 200,
          top: 240,
        },
      ],
    },
    doc: { width: 1080, height: 1080 },
    canvasBackground: "#ffffff",
  };
}

test("composite scene performs a real load-layer-change-save-reopen round trip", async () => {
  const first = await createImageSceneSource({
    snapshot: layeredSnapshot(),
    revision: 7,
    artifactId: "artifact-composite",
    baseRevisionId: "revision-composite-7",
    updatedAt: "2026-07-23T00:00:00.000Z",
  });
  const loaded = await parseImageSceneSource(serializeImageSceneSource(first));
  assert.equal(loaded.schema, IMAGE_SCENE_SOURCE_SCHEMA);
  assert.deepEqual(imageSceneDependencyRevisionIds(loaded), [
    "revision-photo-7",
  ]);
  assert.equal(
    loaded.sceneGraph.snapshot.json.objects[1].src,
    "https://api.oceanleo.com/v1/assets/photo.png",
    "runtime proxy URL is never the durable layered source",
  );

  const changedSnapshot = imageSceneWithResolvedDependencies(
    loaded,
    loaded.dependencyClosure.dependencies,
    new Map([["photo-layer", "blob:runtime-photo"]]),
  );
  assert.equal(changedSnapshot.json.objects[1].src, "blob:runtime-photo");
  assert.equal(
    changedSnapshot.json.objects[1].oceanleoDependency.url,
    "https://api.oceanleo.com/v1/assets/photo.png",
  );
  changedSnapshot.json.objects[1].left = 512;
  const bundle = await createImageSceneRevisionBundle({
    snapshot: changedSnapshot,
    revision: 8,
    artifactId: "artifact-composite",
    baseRevisionId: "revision-composite-8",
    updatedAt: "2026-07-23T00:01:00.000Z",
  });
  const saved = bundle.source;
  const sourceBytes = bundle.sourceText;
  const sourceDigest = bundle.sourceDigest;
  const revisionClosureDigest = bundle.artifactClosureDigest;
  const reopened = await parseImageSceneSource(sourceBytes);

  assert.equal(reopened.revision, 8);
  assert.equal(reopened.sceneGraph.snapshot.json.objects[1].left, 512);
  assert.equal(reopened.revisionDigest, saved.revisionDigest);
  assert.equal(reopened.dependencyClosure.digest, saved.dependencyClosure.digest);
  assert.equal(
    sourceDigest,
    createHash("sha256").update(sourceBytes).digest("hex"),
    "browser SHA-256 source evidence matches an independent Node implementation",
  );
  assert.equal(
    revisionClosureDigest,
    createHash("sha256")
      .update(
        `{"dependencies":[{"mediaType":"application/json","path":"${IMAGE_SCENE_ENTRYPOINT}","sha256":"${sourceDigest}"}],"entrypoint":"${IMAGE_SCENE_ENTRYPOINT}"}\n`,
      )
      .digest("hex"),
    "artifact closure evidence is reproducible from committed source bytes",
  );
});

test("composite scene rebase is explicit, same-root, and digest preserving", async () => {
  const staleRevisionId = "revision-composite-stale";
  const currentRevisionId = "revision-composite-current";
  const source = await createImageSceneSource({
    snapshot: layeredSnapshot(),
    revision: 9,
    artifactId: "artifact-composite",
    baseRevisionId: staleRevisionId,
  });
  const rebased = await rebaseImageSceneSourceToCurrent(
    source,
    {
      artifactId: "artifact-composite",
      revisionId: staleRevisionId,
    },
    {
      artifactId: "artifact-composite",
      revisionId: currentRevisionId,
    },
  );
  assert.equal(rebased.baseArtifact.revisionId, currentRevisionId);
  assert.equal(
    rebased.dependencyClosure.digest,
    source.dependencyClosure.digest,
  );
  assert.notEqual(rebased.revisionDigest, source.revisionDigest);
  await assert.doesNotReject(parseImageSceneSource(rebased));

  await assert.rejects(
    rebaseImageSceneSourceToCurrent(
      source,
      {
        artifactId: "artifact-composite",
        revisionId: "wrong-stale-revision",
      },
      {
        artifactId: "artifact-composite",
        revisionId: currentRevisionId,
      },
    ),
    (error) =>
      error instanceof ImageSceneSourceError &&
      error.code === "revision-mismatch",
  );
});

test("composite scene fails closed on missing dependencies and digest drift", async () => {
  const missing = layeredSnapshot();
  delete missing.json.objects[1].oceanleoDependency;
  await assert.rejects(
    createImageSceneSource({
      snapshot: missing,
      revision: 1,
      artifactId: "artifact-composite",
      baseRevisionId: "revision-composite-1",
    }),
    (error) =>
      error instanceof ImageSceneSourceError &&
      error.code === "missing-dependency" &&
      error.dependencyId === "photo-layer",
  );

  const source = await createImageSceneSource({
    snapshot: layeredSnapshot(),
    revision: 2,
    artifactId: "artifact-composite",
    baseRevisionId: "revision-composite-2",
  });
  const tampered = structuredClone(source);
  tampered.sceneGraph.snapshot.json.objects[1].left = 999;
  await assert.rejects(
    parseImageSceneSource(tampered),
    (error) =>
      error instanceof ImageSceneSourceError &&
      error.code === "revision-digest-mismatch",
  );
});

test("expired and cross-origin scene dependencies report actionable codes", () => {
  const base = {
    id: "external-photo",
    kind: "image",
    required: true,
    url: "https://evil.example/photo.png",
    digest: "b".repeat(64),
  };
  assert.throws(
    () => assertImageDependencyAccess(base, () => false),
    (error) =>
      error instanceof ImageSceneSourceError &&
      error.code === "cross-origin-dependency",
  );
  assert.throws(
    () =>
      assertImageDependencyAccess(
        {
          ...base,
          url: "https://api.oceanleo.com/photo.png?X-Amz-Signature=old",
        },
        () => true,
      ),
    (error) =>
      error instanceof ImageSceneSourceError &&
      error.code === "expired-dependency",
  );
  assert.doesNotThrow(() =>
    assertImageDependencyAccess(
      {
        ...base,
        url: "https://api.oceanleo.com/photo.png?X-Amz-Signature=refreshable",
        artifactId: "artifact-photo",
        revisionId: "revision-photo-7",
        renditionPurpose: "full",
      },
      () => true,
    ),
  );
});
