import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  artifactHasExactContext,
  normalizeArtifactProjection,
  renditionNeedsRefresh,
  selectArtifactRendition,
  viewerRenditionOrder,
} from "../src/shell/artifact-contract.ts";
import {
  artifactProjectionToLibraryItem,
  buildLibraryItems,
  isDurableLibraryItem,
} from "../src/shell/library-data.ts";
import { editorCapabilityFor } from "../src/shell/workbench-routes.ts";

function projection(overrides = {}) {
  return {
    schema: "oceanleo.artifact.v1",
    artifact_id: "artifact-food-shot",
    revision_id: "r2",
    artifact_type: "composite_image",
    roles: ["template"],
    title: "Food shot",
    owner: {
      principal_id: "user-1",
      visibility: "private",
      origin_site_key: "ecommerce",
      origin_app_id: "food-shot",
    },
    permissions: {
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
    editor_capability: "composite-image-editor",
    source_format: "fabric-json",
    renditions: {
      thumbnail: {
        purpose: "thumbnail",
        revision_id: "r2",
        url: "https://signed.test/thumb",
      },
      preview: {
        purpose: "preview",
        revision_id: "r2",
        url: "https://signed.test/preview",
      },
      full: {
        purpose: "full",
        revision_id: "r2",
        url: "https://signed.test/full",
      },
      source: {
        purpose: "source",
        revision_id: "r2",
        url: "https://signed.test/scene",
        digest: "sha256:scene",
      },
    },
    source_manifest: {
      schema: "oceanleo.fabric.v1",
      scene_revision_id: "r2",
      closure_status: "complete",
      closure_digest: "sha256:closure",
      dependency_revision_ids: ["dep-r7"],
    },
    provenance: {
      id: "prov-1",
      source_kind: "owned",
      license_code: "owned",
    },
    context_bindings: [
      {
        context_id: "ctx:ecommerce:food-shot",
        role: "primary",
        rank: 1,
        pinned_revision_id: "r2",
      },
    ],
    ...overrides,
  };
}

test("one normalized item pins identity, scene and every rendition to one revision", () => {
  const artifact = normalizeArtifactProjection(projection());
  assert.ok(artifact);
  assert.equal(artifact.integrity.ok, true);
  assert.equal(
    artifactHasExactContext(artifact, "ctx:ecommerce:food-shot"),
    true,
  );
  assert.equal(
    artifactHasExactContext(artifact, "ctx:ecommerce:other-app"),
    false,
  );
  const unpinned = normalizeArtifactProjection(
    projection({
      context_bindings: [
        {
          context_id: "ctx:ecommerce:food-shot",
          role: "primary",
          rank: 1,
          pinned_revision_id: null,
        },
      ],
    }),
  );
  assert.ok(unpinned);
  assert.equal(
    artifactHasExactContext(unpinned, "ctx:ecommerce:food-shot"),
    false,
  );

  const item = artifactProjectionToLibraryItem(artifact);
  assert.equal(isDurableLibraryItem(item), true);
  assert.equal(item.artifactId, "artifact-food-shot");
  assert.equal(item.revisionId, "r2");
  assert.equal(item.previewUrl, "https://signed.test/preview");
  assert.equal(item.meta.scene_revision_id, "r2");
  assert.deepEqual(item.meta.dependency_revision_ids, ["dep-r7"]);

  const editing = artifactProjectionToLibraryItem(artifact, {
    forEdit: true,
  });
  assert.equal(editing.url, "https://signed.test/scene");
});

test("revision mixing and incomplete composite closures fail closed", () => {
  const mismatched = normalizeArtifactProjection(
    projection({
      renditions: {
        ...projection().renditions,
        source: {
          purpose: "source",
          revision_id: "r1",
          url: "https://signed.test/stale-scene",
          digest: "sha256:stale-scene",
        },
      },
    }),
  );
  assert.ok(mismatched);
  assert.equal(mismatched.integrity.code, "revision-mismatch");

  const incomplete = normalizeArtifactProjection(
    projection({
      source_manifest: {
        schema: "oceanleo.fabric.v1",
        scene_revision_id: "r2",
        closure_status: "missing",
        closure_digest: "",
      },
    }),
  );
  assert.ok(incomplete);
  assert.equal(incomplete.integrity.code, "incomplete-dependency-closure");
});

test("viewer uses preview/full before source and refreshes expiring signed URLs", () => {
  const artifact = normalizeArtifactProjection(projection());
  assert.ok(artifact);
  assert.deepEqual(viewerRenditionOrder("composite_image", true), [
    "preview",
    "full",
  ]);
  assert.equal(
    selectArtifactRendition(artifact)?.purpose,
    "preview",
  );
  assert.equal(
    renditionNeedsRefresh({
      ...artifact.renditions.preview,
      expiresAt: new Date(Date.now() + 10_000).toISOString(),
    }),
    true,
  );
});

test("compatibility stores never merge two rows solely because signed URLs match", () => {
  const items = buildLibraryItems(
    [
      {
        id: "work-1",
        url: "https://signed.test/file.png?token=one",
        media_type: "image",
        site_id: "image",
      },
    ],
    [
      {
        id: "delivery-1",
        url: "https://signed.test/file.png?token=two",
        kind: "image",
      },
    ],
  );
  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((item) => item.id).sort(),
    ["delivery-1", "work-1"],
  );
});

test("shared UI source contains exact primary/global More endpoints and no series fallback", () => {
  const client = readFileSync(
    new URL("../src/shell/artifact-client.ts", import.meta.url),
    "utf8",
  );
  const material = readFileSync(
    new URL("../src/shell/MaterialLibrary.tsx", import.meta.url),
    "utf8",
  );
  assert.match(client, /\/v1\/library\/primary/);
  assert.match(client, /\/v1\/library\/search/);
  assert.match(client, /"Idempotency-Key"/);
  assert.match(client, /ENSURE_PENDING/);
  assert.match(client, /current\.digest !== transient\.payloadDigest/);
  assert.match(client, /"If-Match": commit\.expectedRevisionId/);
  assert.match(client, /refreshArtifactRendition/);
  assert.match(material, /artifactHasExactContext/);
  assert.match(material, /缺少精确 contextId/);
  assert.doesNotMatch(
    material.slice(material.indexOf("export function MaterialLibrary")),
    /series_id|\/v1\/assets\/library\/search/,
  );
});

test("shared cards expose only explicit Preview/Edit/Insert/Replace actions", () => {
  const actions = readFileSync(
    new URL("../src/shell/ArtifactActions.tsx", import.meta.url),
    "utf8",
  );
  const library = readFileSync(
    new URL("../src/shell/WorkspaceLibrary.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    actions,
    /\["preview", "edit", "insert", "replace"\]/,
  );
  assert.doesNotMatch(actions, /"apply"|"merge"/);
  assert.match(library, /Card activation is always Preview/);
  assert.doesNotMatch(
    library.slice(
      library.indexOf("const openEntry"),
      library.indexOf("const targetEvidence"),
    ),
    /editorCapabilityFor/,
  );
});

test("video timeline and workflow canvas keep distinct typed editor routes", () => {
  const base = {
    schema: "oceanleo.artifact.v1",
    title: "Typed route",
    owner: { principal_id: "user-1", visibility: "private" },
    permissions: {
      read: true,
      preview: true,
      edit: true,
      fork: false,
      insert: true,
      replace: true,
      favorite: false,
      bind: false,
      export_source: true,
    },
    editability: "native",
    provenance: {
      id: "prov-route",
      source_kind: "owned",
      license_code: "owned",
    },
  };
  const video = normalizeArtifactProjection({
    ...base,
    artifact_id: "clip",
    revision_id: "clip-r3",
    artifact_type: "video",
    editor_capability: "video-timeline",
    source_format: "timeline-json",
    renditions: {
      preview: {
        revision_id: "clip-r3",
        url: "https://signed.test/clip-preview.mp4",
      },
      full: {
        revision_id: "clip-r3",
        url: "https://signed.test/clip.mp4",
      },
      source: {
        revision_id: "clip-r3",
        url: "https://signed.test/timeline.json",
        digest: "sha256:clip-source",
      },
    },
  });
  const workflow = normalizeArtifactProjection({
    ...base,
    artifact_id: "flow",
    revision_id: "flow-r9",
    artifact_type: "workflow",
    editor_capability: "design-canvas",
    source_format: "workflow-json",
    renditions: {
      preview: {
        revision_id: "flow-r9",
        url: "https://signed.test/flow-preview",
      },
      full: {
        revision_id: "flow-r9",
        url: "https://signed.test/flow.json",
      },
      source: {
        revision_id: "flow-r9",
        url: "https://signed.test/flow-source.json",
        digest: "sha256:flow-source",
      },
    },
  });
  assert.ok(video);
  assert.ok(workflow);
  assert.equal(
    editorCapabilityFor(
      artifactProjectionToLibraryItem(video, { forEdit: true }),
    ).route.type,
    "video-timeline",
  );
  const flowRoute = editorCapabilityFor(
    artifactProjectionToLibraryItem(workflow, { forEdit: true }),
  ).route;
  assert.equal(flowRoute.type, "embed");
  assert.equal(flowRoute.mediaType, "canvas");
});

test("save/reopen snapshots carry revision pins rather than rendition URLs", () => {
  const sessions = readFileSync(
    new URL("../src/lib/app-session.ts", import.meta.url),
    "utf8",
  );
  const canvas = readFileSync(
    new URL("../src/shell/ResultCanvas.tsx", import.meta.url),
    "utf8",
  );
  assert.match(sessions, /interface AppSessionArtifactPin/);
  assert.match(sessions, /artifact_refs/);
  assert.match(sessions, /normalizeAppSessionArtifactPins/);
  assert.match(canvas, /item\.revisionId === source\.revisionId/);
  assert.match(canvas, /old head|旧 head/);
});
