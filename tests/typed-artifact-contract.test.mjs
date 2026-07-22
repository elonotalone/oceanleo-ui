import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ARTIFACT_TYPES,
  artifactContextKey,
  artifactHasExactContext,
  canonicalArtifactContextId,
  isEnsureableTransient,
  normalizeArtifactProjection,
  normalizeArtifactProjectionResult,
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
    favorite: false,
    owner: {
      principal_id: "user-1",
      visibility: "private",
      origin_site_key: "ecommerce",
      origin_app_id: "food-shot",
    },
    access: {
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
    integrity: {
      ok: true,
      code: "ok",
      reason: "",
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

test("rich artifact taxonomy exposes exactly thirteen canonical types", () => {
  assert.equal(ARTIFACT_TYPES.length, 13);
  assert.equal(new Set(ARTIFACT_TYPES).size, 13);
});

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

test("strict rich-v1 normalization explains unknown schema and missing authority fields", () => {
  const unknown = normalizeArtifactProjectionResult({
    ...projection(),
    schema: "oceanleo.artifact.v2",
  });
  assert.equal(unknown.ok, false);
  assert.match(unknown.error || "", /未知 artifact schema/);

  for (const [name, patch, expected] of [
    ["access", { access: undefined }, /access ACL/],
    ["provenance", { provenance: undefined }, /provenance/],
    ["rendition", { renditions: {} }, /preview|rendition/],
  ]) {
    const result = normalizeArtifactProjectionResult({
      ...projection(),
      ...patch,
    });
    assert.equal(result.ok, false, name);
    assert.match(result.error || "", expected, name);
  }
});

test("third-party provenance accepts either evidence field and still fails closed otherwise", () => {
  const thirdPartyProjection = (provenance) =>
    normalizeArtifactProjectionResult(
      projection({
        provenance: {
          id: "prov-provider",
          source_kind: "approved_provider",
          license_code: "CC-BY-4.0",
          license_url: "",
          attribution: "",
          ...provenance,
        },
      }),
    );

  assert.equal(
    thirdPartyProjection({
      license_url: "https://creativecommons.org/licenses/by/4.0/",
    }).ok,
    true,
  );
  assert.equal(
    thirdPartyProjection({
      attribution: "Photo by Example Author",
    }).ok,
    true,
  );

  const missingEvidence = thirdPartyProjection({});
  assert.equal(missingEvidence.ok, false);
  assert.match(missingEvidence.error || "", /同时缺少 license URL 与 attribution/);

  const restrictedLicense = thirdPartyProjection({
    license_code: "restricted",
    license_url: "https://provider.test/terms",
  });
  assert.equal(restrictedLicense.ok, false);
  assert.match(restrictedLicense.error || "", /license/);

  const missingSourceKind = thirdPartyProjection({
    source_kind: "",
    attribution: "Photo by Example Author",
  });
  assert.equal(missingSourceKind.ok, false);
  assert.match(missingSourceKind.error || "", /provenance/);
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
  const material = [
    "../src/shell/MaterialLibrary.tsx",
    "../src/shell/material-library-controller.ts",
    "../src/shell/material-library-view.tsx",
  ]
    .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
    .join("\n");
  assert.match(client, /\/v1\/library\/primary/);
  assert.match(client, /\/v1\/library\/search/);
  assert.match(client, /"Idempotency-Key"/);
  assert.match(client, /ENSURE_PENDING/);
  assert.match(client, /current\.digest !== transient\.payloadDigest/);
  assert.match(client, /"If-Match": commit\.expectedRevisionId/);
  assert.match(client, /refreshArtifactRendition/);
  assert.match(material, /artifactHasExactContext/);
  // The missing-context copy lives in one shared constant, and the old
  // frightening "缺少精确 contextId" wording never reappears in the shelf.
  assert.match(client, /ARTIFACT_CONTEXT_MISSING_MESSAGE/);
  assert.doesNotMatch(material, /ARTIFACT_CONTEXT_MISSING_MESSAGE/);
  assert.match(material, /当前 App 暂未提供可用素材/);
  assert.doesNotMatch(material, /缺少精确 contextId/);
  assert.doesNotMatch(client, /缺少精确 contextId\/siteKey/);
  assert.doesNotMatch(
    material.slice(material.indexOf("export function MaterialLibrary")),
    /series_id|\/v1\/assets\/library\/search/,
  );
});

test("material panels derive the canonical context id when hosts omit it", () => {
  const inlinePanel = readFileSync(
    new URL("../src/shell/InlineEditorMaterialPanel.tsx", import.meta.url),
    "utf8",
  );
  const resultCanvas = readFileSync(
    new URL("../src/shell/ResultCanvas.tsx", import.meta.url),
    "utf8",
  );
  assert.match(inlinePanel, /canonicalArtifactContextId\(/);
  assert.match(
    inlinePanel,
    /contextId=\{canonicalArtifactContextId\(\s*siteId \|\| "",\s*materials\?\.appId \|\| "",?\s*\)\}/,
  );
  assert.match(resultCanvas, /canonicalArtifactContextId\(/);
  // Explicit server-issued context still wins over the derived fallback.
  assert.match(
    resultCanvas,
    /materialContext\?\.contextId \|\|\s*canonicalArtifactContextId\(materialSiteId, materialAppId\)/,
  );
  assert.match(resultCanvas, /contextId=\{materialContextId\}/);
});

test("canonical context id derivation trims, encodes and fails closed", () => {
  assert.equal(
    canonicalArtifactContextId("image", "poster"),
    "olctx:v1:image:app:poster",
  );
  assert.equal(
    canonicalArtifactContextId(" image ", " social / banner "),
    "olctx:v1:image:app:social%20%2F%20banner",
  );
  assert.equal(canonicalArtifactContextId("", "poster"), "");
  assert.equal(canonicalArtifactContextId("image", "  "), "");
  assert.equal(
    canonicalArtifactContextId(undefined, null),
    "",
  );
});

test("boundary helpers survive undefined fields from plain-JS callers", () => {
  assert.equal(
    artifactContextKey({ contextId: undefined, siteKey: undefined }),
    "::::::",
  );
  assert.equal(
    artifactContextKey({ contextId: " ctx ", siteKey: "image" }),
    "ctx::image::::",
  );
  const artifact = normalizeArtifactProjection(projection());
  assert.ok(artifact);
  assert.equal(
    artifactHasExactContext(artifact, { contextId: undefined, siteKey: "x" }),
    false,
  );
  assert.equal(isEnsureableTransient(undefined), false);
  assert.equal(
    isEnsureableTransient({
      schema: "oceanleo.transient-generation.v1",
      resultId: undefined,
      idempotencyKey: "k",
      payloadDigest: "d",
      renditionUrl: "https://signed.test/x.png",
      artifactType: "single_file_image",
    }),
    false,
  );
});

test("catalog and Explore share public rich-v1 search, deep links and accessible controls", () => {
  const materialView = readFileSync(
    new URL("../src/shell/material-library-view.tsx", import.meta.url),
    "utf8",
  );
  const catalog = readFileSync(
    new URL("../src/shell/material-catalog.tsx", import.meta.url),
    "utf8",
  );
  const explore = readFileSync(
    new URL("../src/shell/ExplorePage.tsx", import.meta.url),
    "utf8",
  );
  const layout = readFileSync(
    new URL("../src/shell/LibraryLayout.tsx", import.meta.url),
    "utf8",
  );
  const mine = readFileSync(
    new URL("../src/shell/MyLibrary.tsx", import.meta.url),
    "utf8",
  );
  const workspace = readFileSync(
    new URL("../src/shell/WorkspaceLibrary.tsx", import.meta.url),
    "utf8",
  );
  assert.match(materialView, /artifactId/);
  assert.match(materialView, /revisionId/);
  assert.match(materialView, /AdvancedContentWorkbench/);
  assert.match(
    materialView,
    /onOpenItem=\{prepareAndOpenItem\}/,
  );
  assert.match(materialView, /onOpenEntry=/);
  assert.match(materialView, /prepareArtifactForAction\("edit"/);
  assert.match(materialView, /loadMoreAbortRef/);
  assert.match(materialView, /epoch !== requestEpochRef\.current/);
  assert.match(materialView, /isTrustedEditableMaterialEntry/);
  assert.doesNotMatch(materialView, /siteFeaturedEntries/);
  // Material shelf type filter is the taxonomy 「货架」dropdown on both
  // primary (当前 App) and more (更多) pages — never overlapping LibraryChips.
  assert.match(materialView, /hideCategoryChips/);
  assert.match(materialView, /tt\("货架"\)/);
  assert.match(materialView, /tt\("全部类型"\)/);
  assert.match(materialView, /ARTIFACT_TYPES\.map/);
  assert.doesNotMatch(materialView, /primaryCategoryIds/);
  assert.match(workspace, /hideCategoryChips/);
  assert.match(workspace, /!hideCategoryChips && categories\.length > 1/);
  // Other libraries keep chips when they omit hideCategoryChips.
  const mineSource = mine;
  assert.doesNotMatch(mineSource, /hideCategoryChips/);
  assert.match(
    readFileSync(
      new URL("../src/shell/material-library-controller.ts", import.meta.url),
      "utf8",
    ),
    /interface MaterialLibraryQueryInput[\s\S]*taxonomy: ArtifactType \| ""/,
  );
  assert.match(catalog, /initialLevel="more"/);
  assert.match(catalog, /lockLevel="more"/);
  assert.match(catalog, /taxonomy/);
  assert.match(explore, /<MaterialLibrary/);
  assert.doesNotMatch(explore, /\/v1\/assets\/library\/search/);
  assert.match(layout, /aria-pressed=\{view === "grid"\}/);
  assert.match(layout, /aria-label=\{tt\("清除搜索"\)\}/);
  assert.match(layout, /type="search"/);
  assert.match(mine, /listMyArtifacts/);
  assert.match(mine, /listFavoriteArtifacts/);
  assert.match(mine, /AdvancedContentWorkbench/);
  assert.match(
    mine,
    /onOpenItem=\{onOpenItem \|\| setStandaloneEditorItem\}/,
  );
  assert.match(mine, /ARTIFACT_LIBRARY_CHANGE_EVENT/);
  assert.match(mine, /dedupeDurableItems/);
  assert.match(mine, /owner\.visibility !== "public"/);
  assert.match(mine, /Promise\.allSettled/);
  assert.match(mine, /favoriteNextCursor/);
  const controller = readFileSync(
    new URL(
      "../src/shell/material-library-controller.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(controller, /listEditableShelfArtifacts/);
  assert.doesNotMatch(controller, /Promise\.all/);
  assert.match(controller, /isAdvancedEditableShelfItem/);
  assert.doesNotMatch(
    controller,
    /Primary 返回了未通过本地 trusted editor capability/,
  );
  assert.match(controller, /omitUneditableMaterials/);
});

test("shared cards keep explicit mutations and pinned download/favorite controls", () => {
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
    /\["edit", "preview"\]/,
  );
  assert.match(
    actions,
    /\["insert", "replace"\]/,
  );
  assert.doesNotMatch(actions, /"apply"|"merge"/);
  assert.match(actions, /getArtifactDownload/);
  assert.match(actions, /setArtifactFavorite/);
  assert.match(
    actions,
    /result\.data\.revisionId !== durableItem\.revisionId/,
  );
  const client = readFileSync(
    new URL("../src/shell/artifact-client.ts", import.meta.url),
    "utf8",
  );
  assert.match(client, /renditions\/\$\{rendition\.purpose\}\?mode=export/);
  const downloadClient = client.slice(
    client.indexOf("export async function getArtifactDownload"),
    client.indexOf("export async function setArtifactFavorite"),
  );
  assert.ok(
    downloadClient.indexOf("sourceRendition") <
      downloadClient.indexOf("renderedRendition"),
  );
  assert.match(downloadClient, /sourceRendition \|\| renderedRendition/);
  assert.match(client, /trustedGatewayArtifactAccessUrl/);
  assert.match(client, /素材请求已取消/);
  assert.match(client, /素材请求超时，请重试/);
  assert.doesNotMatch(client, /素材请求超时或已取消/);
  assert.doesNotMatch(
    downloadClient,
    /fetch\([^)]*\)\.then\([^)]*arrayBuffer|window\.open/,
  );
  assert.match(actions, /prepareArtifactForAction\(action, item\)/);
  assert.match(library, /Primary card activation is quiet preview/);
  assert.match(library, /application\/x-oceanleo-material\+json/);
  assert.match(library, /id: item\?\.key \|\| entry\.id/);
  assert.doesNotMatch(
    library.slice(
      library.indexOf("const openEntry"),
      library.indexOf("const targetEvidence"),
    ),
    /editorCapabilityFor/,
  );
});

test("library shelf cards stay quiet; detail header keeps Edit/Download/Favorite/Fullscreen/Link", () => {
  const cardView = readFileSync(
    new URL("../src/shell/workspace-library-view.tsx", import.meta.url),
    "utf8",
  );
  const library = readFileSync(
    new URL("../src/shell/WorkspaceLibrary.tsx", import.meta.url),
    "utf8",
  );
  const actions = readFileSync(
    new URL("../src/shell/ArtifactActions.tsx", import.meta.url),
    "utf8",
  );
  const controller = readFileSync(
    new URL("../src/shell/material-library-controller.ts", import.meta.url),
    "utf8",
  );
  const card = cardView.slice(
    cardView.indexOf("export function WorkspaceCard"),
    cardView.indexOf("export function WorkspaceListRow"),
  );
  // No cover badge and a single-line title without a description paragraph.
  assert.doesNotMatch(card, /absolute bottom-2 left-2/);
  assert.match(card, /line-clamp-1/);
  assert.doesNotMatch(card, /entry\.description &&/);
  assert.match(card, /预览「\{title\}」/);
  // Shelf grid/list must not mount the five text actions under every card.
  const gridAndList = library.slice(library.indexOf("view === \"list\""));
  assert.doesNotMatch(gridAndList, /actionButtonsFor/);
  assert.doesNotMatch(gridAndList, /actions=\{/);
  // Detail/preview header keeps the shared action bar exactly once.
  assert.match(
    library.slice(0, library.indexOf("view === \"list\"")),
    /actionButtonsFor\(/,
  );
  assert.equal(library.split("actionButtonsFor(").length - 1, 1);
  assert.match(actions, /hidePreview/);
  assert.match(actions, /onFullscreen/);
  assert.match(actions, /linkUrl/);
  assert.match(actions, /tt\("全屏"\)/);
  assert.match(actions, /tt\("链接"\)/);
  assert.match(
    actions,
    /Library material order: 编辑 → 下载 → 收藏 → 全屏 → 链接/,
  );
  // Card activation opens quiet preview detail, never Edit-only open.
  const activate = library.slice(
    library.indexOf("const activateEntry"),
    library.indexOf("const dragPropsFor"),
  );
  assert.match(activate, /openEntry\(entry\)/);
  assert.doesNotMatch(activate, /onOpenItem/);
  assert.doesNotMatch(activate, /prepareArtifactForAction/);
  // Machine role names never become card descriptions.
  assert.doesNotMatch(controller, /roles\.join/);
  // Drag-to-canvas and one-click primary actions survive the cleanup.
  assert.match(library, /dragPropsFor\(entry\)/);
  assert.match(library, /primaryMaterialAction/);
});

test("video timeline and workflow canvas keep distinct typed editor routes", () => {
  const base = {
    schema: "oceanleo.artifact.v1",
    title: "Typed route",
    owner: { principal_id: "user-1", visibility: "private" },
    access: {
      can_read: true,
      can_preview: true,
      can_edit: true,
      can_fork: false,
      can_insert: true,
      can_replace: true,
      can_favorite: false,
      can_bind: false,
      can_export_source: true,
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
  assert.match(canvas, /previousRevisionId !== source\.revisionId/);
  assert.doesNotMatch(canvas, /savedEditorItems\[advancedRootItemId\(item\)\]/);
  assert.match(canvas, /old head|旧 head/);
});
