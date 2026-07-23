import assert from "node:assert/strict";
import test from "node:test";

import {
  libraryItemHasExactPrimaryContext,
  materialLibraryRequestKey,
  mergeMaterialEntries,
} from "../src/shell/material-library-controller.ts";
import {
  artifactProjectionToLibraryItem,
  threeDSubtypeFor,
} from "../src/shell/library-data.ts";

const contexts = [
  {
    contextId: "olctx:v1:image:app:poster",
    siteKey: "image",
    appId: "poster",
  },
  {
    contextId: "olctx:v1:word:app:document",
    siteKey: "word",
    appId: "document",
  },
  {
    contextId: "olctx:v1:website:app:site-builder",
    siteKey: "website",
    appId: "site-builder",
  },
];

function request(level, context) {
  return {
    level,
    context,
    query: "",
    taxonomy: "",
  };
}

function durableItem({
  contextId = contexts[0].contextId,
  role = "primary",
  pinnedRevisionId = "revision-1",
  revisionId = "revision-1",
} = {}) {
  return {
    key: `artifact:artifact-1:${revisionId}`,
    id: "artifact-1",
    artifactId: "artifact-1",
    revisionId,
    artifactType: "website",
    artifact: {
      artifactId: "artifact-1",
      revisionId,
      bindings: [
        {
          contextId,
          role,
          rank: 0,
          pinnedRevisionId,
        },
      ],
    },
  };
}

test("Current App keeps context identity while More is globally keyed", () => {
  const primaryKeys = contexts.map((context) =>
    materialLibraryRequestKey(request("primary", context)),
  );
  const moreKeys = contexts.map((context) =>
    materialLibraryRequestKey(request("more", context)),
  );

  assert.equal(new Set(primaryKeys).size, contexts.length);
  assert.equal(new Set(moreKeys).size, 1);
  assert.match(moreKeys[0], /"context":"global"/);
});

test("Current App accepts only an exact primary binding pinned to this revision", () => {
  assert.equal(
    libraryItemHasExactPrimaryContext(durableItem(), contexts[0]),
    true,
  );
  assert.equal(
    libraryItemHasExactPrimaryContext(durableItem(), contexts[1]),
    false,
  );
  assert.equal(
    libraryItemHasExactPrimaryContext(
      durableItem({ role: "secondary" }),
      contexts[0],
    ),
    false,
  );
  assert.equal(
    libraryItemHasExactPrimaryContext(
      durableItem({ pinnedRevisionId: "revision-0" }),
      contexts[0],
    ),
    false,
  );
  const mixedRoles = durableItem({ pinnedRevisionId: null });
  mixedRoles.artifact.bindings.push({
    contextId: contexts[0].contextId,
    role: "secondary",
    rank: 1,
    pinnedRevisionId: "revision-1",
  });
  assert.equal(
    libraryItemHasExactPrimaryContext(mixedRoles, contexts[0]),
    false,
  );
});

test("material merging deduplicates only durable artifact plus revision identity", () => {
  const revisionOne = durableItem();
  const duplicate = {
    ...durableItem(),
    key: "a-different-card-key",
  };
  const revisionTwo = durableItem({
    pinnedRevisionId: "revision-2",
    revisionId: "revision-2",
  });
  const merged = mergeMaterialEntries([
    [{ id: "first", libraryItem: revisionOne }],
    [
      { id: "duplicate", libraryItem: duplicate },
      { id: "new-revision", libraryItem: revisionTwo },
    ],
  ]);

  assert.deepEqual(
    merged.map((entry) => entry.id),
    ["first", "new-revision"],
  );
});

test("catalog projections preserve preview Content-Type and 3D dispatch metadata", () => {
  const artifact = {
    artifactId: "artifact-model",
    revisionId: "revision-model",
    artifactType: "model_3d",
    roles: ["template", "catalog_more"],
    owner: { originSiteKey: "asset" },
    access: { canExportSource: true },
    editability: "bounded",
    editorCapability: "model-3d-editor",
    sourceFormat: "gltf",
    title: "Reviewed glTF model",
    favorite: false,
    renditions: {
      thumbnail: {
        url: "https://api.oceanleo.com/thumbnail",
        mediaType: "image/png",
      },
      preview: {
        url: "https://api.oceanleo.com/preview",
        mediaType: "image/png",
      },
      full: {
        url: "https://api.oceanleo.com/full",
        mediaType: "image/png",
      },
      source: {
        url: "https://api.oceanleo.com/source",
        revisionId: "revision-model",
        mediaType: "model/gltf+json",
      },
    },
    integrity: { ok: true, reason: "" },
    provenance: {},
    bindings: [],
    scene: null,
    createdAt: null,
  };
  const item = artifactProjectionToLibraryItem(artifact);
  const editing = artifactProjectionToLibraryItem(artifact, {
    forEdit: true,
  });

  assert.equal(item.url, "https://api.oceanleo.com/full");
  assert.equal(item.meta.viewer_media_type, "image/png");
  assert.equal(item.meta.source_media_type, "model/gltf+json");
  assert.equal(item.meta.advanced_editor_route, "threed");
  assert.equal(threeDSubtypeFor(item), "model");
  assert.equal(editing.url, "https://api.oceanleo.com/source");
  assert.equal(editing.meta.viewer_media_type, "model/gltf+json");
});
