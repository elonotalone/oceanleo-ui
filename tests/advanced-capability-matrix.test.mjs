import assert from "node:assert/strict";
import test from "node:test";

import {
  editorCapabilityFor,
  editorRouteFor,
} from "../src/shell/workbench-routes.ts";
import { normalizeArtifactProjection } from "../src/shell/artifact-contract.ts";
import { artifactProjectionToLibraryItem } from "../src/shell/library-data.ts";

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

