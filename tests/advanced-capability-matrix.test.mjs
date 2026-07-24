import assert from "node:assert/strict";
import test from "node:test";

import {
  editorCapabilityFor,
  editorRouteFor,
} from "../src/shell/workbench-routes.ts";
import {
  ARTIFACT_TYPES,
  normalizeArtifactProjection,
} from "../src/shell/artifact-contract.ts";
import { artifactProjectionToLibraryItem } from "../src/shell/library-data.ts";
import { isAdvancedEditableShelfItem } from "../src/shell/advanced-features.ts";

function item(patch = {}) {
  return {
    key: "asset:fixture",
    source: "artifact",
    id: "fixture",
    title: "Fixture",
    kind: "file",
    siteId: "asset",
    favorite: false,
    meta: {},
    ...patch,
  };
}

const chartManifest = {
  schema: "oceanleo.editor-manifest.v1",
  id: "chart-editor",
  version: 1,
  capabilities: ["load", "mutate", "save", "reopen"],
  source: {
    kind: "url",
    format: "echarts-option+json",
    url: "/v1/assets/library/chart-1/editor-source",
  },
};

test("typed editor capability matrix does not infer editing from viewer kind", () => {
  const matrix = [
    {
      name: "trusted chart source",
      value: item({
        kind: "image",
        meta: { asset_type: "chart", editor: chartManifest },
      }),
      available: true,
      route: "grid",
      adapter: "chart-editor@1",
    },
    {
      name: "legacy chart render only",
      value: item({
        kind: "image",
        url: "https://asset.test/cover.png",
        meta: { asset_type: "chart", format: "html" },
      }),
      available: false,
      route: "none",
      reason: /option/,
    },
    {
      name: "real image",
      value: item({ kind: "image", url: "https://cdn.test/image.png" }),
      available: true,
      route: "image",
      adapter: "image",
    },
    {
      name: "website preview without project",
      value: item({
        kind: "website",
        url: "https://api.oceanleo.com/v1/assets/library/demo/view",
      }),
      available: false,
      route: "none",
    },
    {
      name: "website starter",
      value: item({
        kind: "website",
        meta: { starter_id: "agency-landing" },
      }),
      available: true,
      route: "embed",
      adapter: "website",
    },
    {
      name: "model",
      value: item({
        kind: "threed",
        url: "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/assets/3d/model/chair/chair.gltf",
        meta: { subtype: "model", format: "gltf" },
      }),
      available: true,
      route: "threed",
      adapter: "threed",
    },
    {
      name: "HDRI",
      value: item({
        kind: "threed",
        url: "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/assets/3d/hdri/studio.hdr",
        meta: { subtype: "hdri", format: "hdr" },
      }),
      available: false,
      route: "none",
      reason: /HDRI/,
    },
    {
      name: "texture",
      value: item({
        kind: "threed",
        url: "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/assets/3d/texture/wood.jpg",
        meta: { subtype: "texture", format: "jpg" },
      }),
      available: false,
      route: "none",
      reason: /纹理/,
    },
  ];

  for (const fixture of matrix) {
    const capability = editorCapabilityFor(fixture.value);
    assert.equal(capability.available, fixture.available, fixture.name);
    assert.equal(capability.route.type, fixture.route, fixture.name);
    assert.equal(capability.adapter, fixture.adapter || "none", fixture.name);
    if (fixture.reason) {
      assert.match(capability.unavailableReason, fixture.reason, fixture.name);
    }
  }
});

test("all thirteen shelf taxonomies reach a trusted local editor", () => {
  const capabilityByType = {
    single_file_image: ["image-editor", "png"],
    composite_image: ["composite-image-editor", "fabric-json"],
    vector_image: ["vector-editor", "svg"],
    chart: ["chart-editor", "echarts-option+json"],
    document: ["richdoc-editor", "tiptap-json"],
    grid: ["grid-editor", "grid-json"],
    deck: ["deck-editor", "deck-json"],
    pdf: ["pdf-editor", "pdf"],
    website: ["website-editor", "website-source@1"],
    video: ["video-timeline", "timeline-json"],
    audio: ["audio-editor", "audio-project+json"],
    model_3d: ["model-3d-editor", "glb"],
    workflow: ["design-canvas", "workflow-json"],
  };
  assert.deepEqual(Object.keys(capabilityByType).sort(), [...ARTIFACT_TYPES].sort());

  for (const artifactType of ARTIFACT_TYPES) {
    const [editorCapability, sourceFormat] =
      capabilityByType[artifactType];
    const revisionId = `${artifactType}-r1`;
    const projection = normalizeArtifactProjection({
      schema: "oceanleo.artifact.v1",
      artifact_id: `shelf-${artifactType}`,
      revision_id: revisionId,
      artifact_type: artifactType,
      roles: ["template"],
      title: `Shelf ${artifactType}`,
      favorite: false,
      owner: {
        principal_id: "catalog-owner",
        visibility: "public",
        origin_site_key: "asset",
      },
      access: {
        can_read: true,
        can_preview: true,
        can_edit: false,
        can_fork: true,
        can_insert: true,
        can_replace: true,
        can_favorite: true,
        can_bind: true,
        can_export_source: true,
      },
      editability: "bounded",
      editor_capability: editorCapability,
      source_format: sourceFormat,
      renditions: {
        preview: {
          purpose: "preview",
          revision_id: revisionId,
          url: `https://signed.test/${artifactType}/preview`,
          format: "bin",
        },
        source: {
          purpose: "source",
          revision_id: revisionId,
          url: `https://signed.test/${artifactType}/source`,
          format: sourceFormat,
          digest: `sha256:${artifactType}`,
        },
      },
      ...(artifactType === "composite_image"
        ? {
            scene: {
              schema: "oceanleo-scene+json",
              scene_revision_id: revisionId,
              closure_status: "complete",
              closure_digest: "sha256:composite-closure",
              dependency_revision_ids: [],
            },
          }
        : {}),
      provenance: {
        id: `prov-${artifactType}`,
        source_kind: "owned",
        license_code: "owned",
      },
      context_bindings: [],
      integrity: {
        ok: true,
        code: "ok",
        reason: "",
      },
    });
    assert.ok(projection, artifactType);
    const libraryItem = artifactProjectionToLibraryItem(projection);
    assert.equal(
      isAdvancedEditableShelfItem(libraryItem),
      true,
      artifactType,
    );
    assert.equal(
      editorCapabilityFor(libraryItem).available,
      true,
      artifactType,
    );
  }
});

test("Design template and advanced-session route pinning survive capability routing", () => {
  const template = item({
    kind: "image",
    siteId: "design",
    url: "https://asset.oceanleo.com/design-templates/cover/demo.webp",
    meta: {
      advanced_editor_route: "embed",
      template_doc_url:
        "https://asset.oceanleo.com/design-templates/doc/demo.json",
    },
  });
  assert.deepEqual(editorRouteFor(template), {
    type: "embed",
    base: "https://design.oceanleo.com/embed/editor",
    mediaType: "canvas",
  });
});

test("editor routing follows material capability and never the hosting site", () => {
  for (const siteId of ["word", "image", "design", "website"]) {
    assert.equal(
      editorRouteFor(
        item({
          siteId,
          kind: "image",
          url: "https://asset.oceanleo.com/generated/example.png",
        }),
      ).type,
      "image",
      `${siteId} can edit an image`,
    );
    assert.deepEqual(
      editorRouteFor(
        item({
          siteId,
          kind: "canvas",
          meta: { draft: true, advanced_editor_route: "embed" },
        }),
      ),
      {
        type: "embed",
        base: "https://design.oceanleo.com/embed/editor",
        mediaType: "canvas",
      },
      `${siteId} can edit a Design canvas`,
    );
    assert.deepEqual(
      editorRouteFor(
        item({
          siteId,
          kind: "website",
          meta: { starter_id: "agency-landing" },
        }),
      ),
      {
        type: "embed",
        base: "https://website.oceanleo.com/embed/site-editor",
        mediaType: "website",
      },
      `${siteId} can edit a website`,
    );
  }
});

test("durable routing rejects capability/type mismatch on every host site", () => {
  const projection = normalizeArtifactProjection({
    schema: "oceanleo.artifact.v1",
    artifact_id: "typed-image",
    revision_id: "image-r7",
    artifact_type: "single_file_image",
    title: "Typed image",
    favorite: false,
    owner: {
      principal_id: "owner-a",
      visibility: "private",
      origin_site_key: "image",
    },
    access: {
      can_read: true,
      can_preview: true,
      can_edit: true,
      can_fork: false,
      can_insert: true,
      can_replace: true,
      can_favorite: true,
      can_bind: true,
      can_export_source: true,
    },
    editability: "native",
    editor_capability: "video-timeline",
    source_format: "png",
    renditions: {
      preview: {
        purpose: "preview",
        revision_id: "image-r7",
        url: "https://signed.test/image-r7.png",
      },
      source: {
        purpose: "source",
        revision_id: "image-r7",
        url: "https://signed.test/image-r7-source.png",
        digest: "sha256:image-r7",
      },
    },
    provenance: {
      id: "prov-image-r7",
      source_kind: "owned",
      license_code: "owned",
    },
  });
  assert.ok(projection);
  const durable = artifactProjectionToLibraryItem(projection, {
    forEdit: true,
  });
  for (const siteId of ["edu", "website", "video", "image"]) {
    const capability = editorCapabilityFor({ ...durable, siteId });
    assert.equal(capability.available, false, siteId);
    assert.match(capability.unavailableReason, /不匹配/, siteId);
  }
});

function durableWebsiteProjection(patch = {}) {
  return normalizeArtifactProjection({
    schema: "oceanleo.artifact.v1",
    artifact_id: "typed-website",
    revision_id: "site-r3",
    artifact_type: "website",
    title: "Typed website",
    favorite: false,
    owner: {
      principal_id: "owner-a",
      visibility: "private",
      origin_site_key: "word",
    },
    access: {
      can_read: true,
      can_preview: true,
      can_edit: true,
      can_fork: false,
      can_insert: true,
      can_replace: true,
      can_favorite: true,
      can_bind: true,
      can_export_source: true,
    },
    editability: "native",
    editor_capability: "website-editor",
    source_format: "website-source@1",
    renditions: {
      preview: {
        purpose: "preview",
        revision_id: "site-r3",
        url: "https://signed.test/site-r3-preview",
      },
      source: {
        purpose: "source",
        revision_id: "site-r3",
        url: "https://signed.test/site-r3-source.tar",
        digest: "sha256:site-r3",
      },
    },
    provenance: {
      id: "prov-site-r3",
      source_kind: "owned",
      license_code: "owned",
    },
    ...patch,
  });
}

test("durable website-editor opens the shared embed from every host without project_id", () => {
  const projection = durableWebsiteProjection();
  assert.ok(projection);
  const durable = artifactProjectionToLibraryItem(projection, {
    forEdit: true,
  });
  assert.equal(durable.meta.project_id, undefined);
  assert.equal(durable.meta.website_id, undefined);
  assert.equal(durable.meta.advanced_editor_route, "embed");
  assert.equal(durable.meta.artifact_id, "typed-website");
  assert.equal(durable.meta.revision_id, "site-r3");

  const expected = {
    type: "embed",
    base: "https://website.oceanleo.com/embed/site-editor",
    mediaType: "website",
  };
  for (const siteId of ["word", "image", "design", "chat"]) {
    const capability = editorCapabilityFor({ ...durable, siteId });
    assert.equal(capability.available, true, siteId);
    assert.equal(capability.adapter, "website", siteId);
    assert.deepEqual(capability.route, expected, siteId);
  }
});

test("blank website drafts reach the shared website embed like design/video blanks", () => {
  for (const siteId of ["word", "image", "design", "chat", "website"]) {
    assert.deepEqual(
      editorRouteFor(
        item({
          siteId,
          kind: "website",
          meta: { draft: true, blank: true },
        }),
      ),
      {
        type: "embed",
        base: "https://website.oceanleo.com/embed/site-editor",
        mediaType: "website",
      },
      `${siteId} blank website draft`,
    );
  }
});

test("website embed extras carry durable identity and never invent a host site project id", async () => {
  const { websiteEmbedExtraParams, buildOpenAssetPayload } = await import(
    "../src/shell/website-embed-params.ts"
  );

  assert.deepEqual(
    websiteEmbedExtraParams(
      item({
        kind: "website",
        url: "https://api.oceanleo.com/v1/assets/library/demo/view",
      }),
    ),
    undefined,
  );

  assert.deepEqual(
    websiteEmbedExtraParams(
      item({
        kind: "website",
        meta: { draft: true },
      }),
    ),
    { blank: "1" },
  );

  assert.deepEqual(
    websiteEmbedExtraParams(
      item({
        kind: "website",
        siteId: "word",
        artifactId: "typed-website",
        revisionId: "site-r3",
        artifactType: "website",
        meta: {
          artifact_id: "typed-website",
          revision_id: "site-r3",
        },
      }),
    ),
    {
      artifactId: "typed-website",
      revisionId: "site-r3",
    },
  );

  // Durable artifact identity must omit starter substitutes; blank/new drafts
  // still use the starter path when no artifactId/revisionId is present.
  assert.deepEqual(
    websiteEmbedExtraParams(
      item({
        kind: "website",
        artifactId: "typed-website",
        revisionId: "site-r3",
        meta: {
          project_id: "11111111-1111-4111-8111-111111111111",
          starter_id: "agency-landing",
        },
      }),
    ),
    {
      projectId: "11111111-1111-4111-8111-111111111111",
      siteId: "11111111-1111-4111-8111-111111111111",
      artifactId: "typed-website",
      revisionId: "site-r3",
    },
  );

  // Starter-backed new drafts keep starterId and are not blank embeds.
  assert.deepEqual(
    websiteEmbedExtraParams(
      item({
        kind: "website",
        meta: {
          draft: true,
          starter_id: "agency-landing",
        },
      }),
    ),
    {
      starterId: "agency-landing",
    },
  );

  const openAsset = buildOpenAssetPayload(
    item({
      id: "typed-website",
      kind: "website",
      artifactId: "typed-website",
      revisionId: "site-r3",
      artifactType: "website",
      meta: { starter_id: "agency-landing" },
    }),
  );
  assert.equal(openAsset.artifactId, "typed-website");
  assert.equal(openAsset.revisionId, "site-r3");
  assert.equal(openAsset.artifactType, "website");
  assert.equal(openAsset.meta.artifact_id, "typed-website");
  assert.equal(openAsset.meta.revision_id, "site-r3");
  assert.equal("starter_id" in openAsset.meta, false);
});

