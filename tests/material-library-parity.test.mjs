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

// D1（2026-07-28）：曾经的第三档 `more`（全平台，globally keyed）整层下线。
// 剩下的两层都必须携带站点身份，不存在「一个 key 服务所有站」的桶了。
test("Current App keeps context identity and 本站素材 is keyed per site", () => {
  const primaryKeys = contexts.map((context) =>
    materialLibraryRequestKey(request("primary", context)),
  );
  const siteKeys = contexts.map((context) =>
    materialLibraryRequestKey(request("site", context)),
  );

  assert.equal(new Set(primaryKeys).size, contexts.length);
  assert.equal(new Set(siteKeys).size, contexts.length);
  for (const key of siteKeys) assert.doesNotMatch(key, /"context":"global"/);
  assert.match(siteKeys[0], /"context":"site:image"/);
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

// D3（2026-07-28）：去重键从 `artifactId:revisionId` 改成 artifact 身份——
// 一份素材在一个视图里只出现一张卡，同一 artifact 的两个 revision 不再各占一张。
test("material merging keeps one card per artifact identity", () => {
  const revisionOne = durableItem();
  const duplicate = {
    ...durableItem(),
    key: "a-different-card-key",
  };
  const revisionTwo = durableItem({
    pinnedRevisionId: "revision-2",
    revisionId: "revision-2",
  });
  const other = {
    ...durableItem(),
    id: "artifact-2",
    artifactId: "artifact-2",
    key: "artifact:artifact-2:revision-1",
  };
  const merged = mergeMaterialEntries([
    [{ id: "first", libraryItem: revisionOne }],
    [
      { id: "duplicate", libraryItem: duplicate },
      { id: "new-revision", libraryItem: revisionTwo },
      { id: "other-artifact", libraryItem: other },
    ],
  ]);

  assert.deepEqual(
    merged.map((entry) => entry.id),
    ["first", "other-artifact"],
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
