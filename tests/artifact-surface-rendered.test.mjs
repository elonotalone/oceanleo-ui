import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import ts from "typescript";

import {
  ARTIFACT_TYPES,
  normalizeArtifactProjection,
} from "../src/shell/artifact-contract.ts";
import {
  artifactProjectionToLibraryItem,
} from "../src/shell/library-data.ts";

const authoritativeLibraryPages = JSON.parse(
  await readFile(
    new URL(
      "./fixtures/oceanleo-artifact-library-pages.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(
  pathToFileURL(fabricRequire.resolve("jsdom")).href
);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://image.oceanleo.com/workspace",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
const contractUrl = pathToFileURL(
  resolve("src/shell/artifact-contract.ts"),
).href;
const libraryDataUrl = pathToFileURL(
  resolve("src/shell/library-data.ts"),
).href;
const materialRegistryUrl = pathToFileURL(
  resolve("src/shell/workbench-material-registry.ts"),
).href;

function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function compileModule(relativePath, replacements) {
  const sourcePath = resolve(relativePath);
  let source = await readFile(sourcePath, "utf8");
  for (const [specifier, replacement] of Object.entries({
    react: reactUrl,
    ...replacements,
  })) {
    source = source.replaceAll(
      JSON.stringify(specifier),
      JSON.stringify(replacement),
    );
  }
  const compiled = ts
    .transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: sourcePath,
    })
    .outputText.replaceAll(
      'from "react/jsx-runtime";',
      `from ${JSON.stringify(jsxRuntimeUrl)};`,
    );
  return `${dataModule(compiled)}#${encodeURIComponent(relativePath)}`;
}

const authStubUrl = dataModule(`
  export async function accessToken() {
    return "artifact-render-test-token";
  }
`);
const configStubUrl = dataModule(`
  export const GATEWAY_BASE = "https://api.test";
`);
const artifactClientUrl = await compileModule(
  "src/shell/artifact-client.ts",
  {
    "../lib/auth/client": authStubUrl,
    "../lib/auth/config": configStubUrl,
    "./artifact-contract": contractUrl,
    "./library-data": libraryDataUrl,
  },
);
const {
  ARTIFACT_LIBRARY_CHANGE_EVENT,
  createArtifactRevision,
  ensureArtifact,
  getArtifactEditDecision,
  getArtifactDownload,
  getArtifactItem,
  listEditableShelfArtifacts,
  listFavoriteArtifacts,
  listMyArtifacts,
  listPrimaryArtifacts,
  retireArtifact,
  searchArtifactLibrary,
  setArtifactFavorite,
} = await import(artifactClientUrl);
const uiStubUrl = dataModule(`
  export function useUI() {
    return (value) => value;
  }
`);
const sessionStubUrl = dataModule(`
  export function useOptionalWorkspaceSession() {
    return null;
  }
`);
const registryStubUrl = dataModule(`
  export function materialScopeKey(siteId, appId) {
    return siteId + "::" + appId;
  }
  export function registerWorkbenchMaterialSource() {
    return () => {};
  }
`);
const workspaceLibraryStubUrl = dataModule(`
  import { createElement } from ${JSON.stringify(reactUrl)};

  export function workspaceEntryFromLibraryItem(item, options = {}) {
    return {
      id: item.key || item.id,
      title: item.title,
      category: options.category || "",
      description: options.description || "",
      libraryItem: item,
    };
  }

  export function WorkspaceLibrary(props) {
    return createElement(
      "section",
      { "data-workspace-library": "true" },
      props.toolbarActions,
      createElement(
        "div",
        { "data-entry-list": "true" },
        ...props.entries.map((entry) =>
          createElement(
            "article",
            {
              key: entry.id,
              "data-entry-title": entry.title,
              "data-entry-category": entry.category,
              "data-entry-durable": String(
                Boolean(
                  entry.libraryItem?.artifactId &&
                    entry.libraryItem?.revisionId,
                ),
              ),
              "data-entry-visible": String(
                Boolean(
                  entry.libraryItem?.artifact?.access?.canRead &&
                    entry.libraryItem?.artifact?.access?.canPreview &&
                    entry.libraryItem?.artifact?.integrity?.ok,
                ),
              ),
              "data-entry-editor-capability":
                entry.libraryItem?.artifact?.editorCapability || "",
            },
            entry.title,
            createElement(
              "a",
              {
                href: entry.linkUrl || "",
                "data-entry-link": entry.title,
              },
              "link",
            ),
          ),
        ),
      ),
      props.entries.length === 0
        ? createElement(
            "p",
            { "data-empty-description": "true" },
            props.emptyDescription,
          )
        : null,
    );
  }
`);
const advancedFeaturesUrl = pathToFileURL(
  resolve("src/shell/advanced-features.ts"),
).href;
const advancedWorkbenchStubUrl = dataModule(`
  export function AdvancedContentWorkbench() {
    return null;
  }
`);
const materialControllerUrl = await compileModule(
  "src/shell/material-library-controller.ts",
  {
    "./advanced-features": advancedFeaturesUrl,
    "./library-data": libraryDataUrl,
    "./artifact-contract": contractUrl,
    "./artifact-client": artifactClientUrl,
    "./workspace-library-model": workspaceLibraryStubUrl,
  },
);
const { artifactEntry } = await import(materialControllerUrl);
const MaterialLibrary = (
  await import(
    await compileModule("src/shell/material-library-view.tsx", {
      "../i18n/ui/useUI": uiStubUrl,
      "./artifact-client": artifactClientUrl,
      "./library-data": libraryDataUrl,
      "./artifact-contract": contractUrl,
      "./advanced-features": advancedFeaturesUrl,
      "./AdvancedContentWorkbench": advancedWorkbenchStubUrl,
      "./material-library-controller": materialControllerUrl,
      "./WorkspaceLibrary": workspaceLibraryStubUrl,
      "./WorkspaceSession": sessionStubUrl,
      "./workbench-material-registry": registryStubUrl,
    })
  )
).MaterialLibrary;
const libraryViewerStubUrl = dataModule(`
  export function LibraryItemViewer() {
    return null;
  }
`);
const thumbnailStubUrl = dataModule(`
  export function WorkspaceThumbnail() {
    return null;
  }
`);
const workspaceLibraryModelStubUrl = dataModule(`
  export const WORKSPACE_KIND_LABELS = {
    image: "图片",
    file: "文件",
  };
`);
const {
  WorkspaceCard,
  WorkspaceListRow,
} = await import(
  await compileModule("src/shell/workspace-library-view.tsx", {
    "../i18n/ui/useUI": uiStubUrl,
    "./library-viewers": libraryViewerStubUrl,
    "./workspace-library-model": workspaceLibraryModelStubUrl,
    "./workspace-library-thumbnail": thumbnailStubUrl,
  })
);
const databaseStubUrl = dataModule(`
  export async function uploadFile() {
    return { ok: false, error: "upload not used in this test" };
  }
`);
const myLibraryModule = (
  await import(
    await compileModule("src/shell/MyLibrary.tsx", {
      "../i18n/ui/useUI": uiStubUrl,
      "../lib/database": databaseStubUrl,
      "./AdvancedContentWorkbench": advancedWorkbenchStubUrl,
      "./artifact-client": artifactClientUrl,
      "./artifact-contract": contractUrl,
      "./library-data": libraryDataUrl,
      "./WorkspaceLibrary": workspaceLibraryStubUrl,
    })
  )
);
const {
  MyLibrary,
  canonicalUploadLibraryItem,
  legacyUploadTransient,
} = myLibraryModule;

const actionClientStubUrl = dataModule(`
  export async function prepareArtifactForAction(action, item) {
    globalThis.__artifactPreparedActions.push(action);
    return { ok: true, data: { ...item, preparedAction: action } };
  }
  export async function getArtifactDownload(item) {
    return {
      ok: true,
      data: {
        artifactId: item.artifactId,
        revisionId: item.revisionId,
        url: "https://signed.test/download",
        filename: "download.bin",
      },
    };
  }
  export async function setArtifactFavorite(item, favorite) {
    return { ok: true, data: { ...item, favorite } };
  }
`);
const routesStubUrl = dataModule(`
  export function editorCapabilityFor() {
    return { available: true, unavailableReason: "", route: { type: "image" } };
  }
`);
const materialProviderModule = await import(
  await compileModule("src/shell/workbench-material-provider.tsx", {
    "./artifact-client": actionClientStubUrl,
    "./workbench-material-registry": materialRegistryUrl,
  }),
);
const actionModuleUrl = await compileModule(
  "src/shell/ArtifactActions.tsx",
  {
    "../i18n/ui/useUI": uiStubUrl,
    "./artifact-contract": contractUrl,
    "./artifact-client": actionClientStubUrl,
    "./library-data": libraryDataUrl,
    "./workbench-routes": routesStubUrl,
  },
);
const actionModule = await import(actionModuleUrl);
const libraryLayoutStubUrl = dataModule(`
  import { createElement } from ${JSON.stringify(reactUrl)};
  export function LibraryToolbar(props) {
    return createElement("div", null, props.actions);
  }
  export function LibraryChips() {
    return null;
  }
`);
const workspaceViewStubUrl = dataModule(`
  import { createElement } from ${JSON.stringify(reactUrl)};
  export function WorkspaceCard(props) {
    return createElement(
      "button",
      {
        type: "button",
        "data-open-entry": props.entry.title,
        onClick: props.onOpen,
      },
      props.entry.title,
    );
  }
  export const WorkspaceListRow = WorkspaceCard;
  export function WorkspaceLibraryEmpty() {
    return null;
  }
  export function WorkspaceLibraryEntryViewer() {
    return createElement("div", { "data-entry-viewer": "true" });
  }
`);
const workspaceLibraryModelUrl = pathToFileURL(
  resolve("src/shell/workspace-library-model.ts"),
).href;
const RenderedWorkspaceLibrary = (
  await import(
    await compileModule("src/shell/WorkspaceLibrary.tsx", {
      "../i18n/ui/useUI": uiStubUrl,
      "./library-data": libraryDataUrl,
      "./LibraryLayout": libraryLayoutStubUrl,
      "./ArtifactActions": actionModuleUrl,
      "./workspace-library-model": workspaceLibraryModelUrl,
      "./workspace-library-view": workspaceViewStubUrl,
    })
  )
).WorkspaceLibrary;

async function createMounted(Component, props) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(Component, props));
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function settle(ms = 20) {
  await act(async () => {
    await new Promise((resolvePromise) => window.setTimeout(resolvePromise, ms));
  });
}

async function click(target) {
  assert.ok(target);
  await act(async () => {
    target.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
}

function assertEveryRenderedMaterialIsEditable(container) {
  const entries = [
    ...container.querySelectorAll("[data-entry-title]"),
  ];
  assert.ok(entries.length > 0);
  for (const entry of entries) {
    assert.equal(entry.getAttribute("data-entry-durable"), "true");
    assert.equal(entry.getAttribute("data-entry-visible"), "true");
    assert.ok(entry.getAttribute("data-entry-editor-capability"));
  }
}

const TEST_EDITOR_CAPABILITY = {
  single_file_image: "image-editor",
  composite_image: "composite-image-editor",
  vector_image: "vector-editor",
  chart: "chart-editor",
  document: "richdoc-editor",
  grid: "grid-editor",
  deck: "deck-editor",
  pdf: "pdf-editor",
  website: "website-editor",
  video: "video-timeline",
  audio: "audio-editor",
  model_3d: "model-3d-editor",
  workflow: "design-canvas",
};

const TEST_SOURCE_FORMAT = {
  single_file_image: "png",
  composite_image: "oceanleo-scene+json",
  vector_image: "svg",
  chart: "echarts-option+json",
  document: "tiptap-json",
  grid: "grid-json",
  deck: "deck-json",
  pdf: "pdf",
  website: "website-source@1",
  video: "timeline-json",
  audio: "audio-project+json",
  model_3d: "glb",
  workflow: "workflow-json",
};

function projection({
  id,
  title,
  contextId = "ctx:image:poster",
  revisionId = "r1",
  pinnedRevisionId = revisionId,
  canRead = true,
  canPreview = true,
  editable = false,
  favorite = false,
  ownerPrincipalId = "user-1",
  visibility = "private",
  artifactType = "single_file_image",
} = {}) {
  const isComposite = artifactType === "composite_image";
  return {
    schema: "oceanleo.artifact.v1",
    artifact_id: id || "artifact-1",
    revision_id: revisionId,
    artifact_type: artifactType,
    roles: ["template"],
    title: title || "Artifact",
    favorite,
    owner: {
      principal_id: ownerPrincipalId,
      visibility,
      origin_site_key: "image",
      origin_app_id: "poster",
    },
    access: {
      can_read: canRead,
      can_preview: canPreview,
      can_edit: editable,
      can_fork: false,
      can_insert: editable,
      can_replace: editable,
      can_favorite: editable,
      can_bind: editable,
      can_export_source: editable,
    },
    editability: editable
      ? isComposite
        ? "native"
        : "bounded"
      : "view_only",
    editor_capability: editable
      ? TEST_EDITOR_CAPABILITY[artifactType]
      : null,
    source_format: TEST_SOURCE_FORMAT[artifactType],
    ...(isComposite
      ? {
          scene: {
            schema: "oceanleo-scene+json",
            scene_revision_id: revisionId,
            closure_status: "complete",
            closure_digest: `sha256:scene-${id || "artifact-1"}`,
            dependency_revision_ids: [],
          },
        }
      : {}),
    renditions: {
      preview: {
        purpose: "preview",
        revision_id: revisionId,
        url: `https://signed.test/${id || "artifact-1"}.png`,
        format: "png",
      },
      ...(editable
        ? {
            source: {
              purpose: "source",
              revision_id: revisionId,
              url: `https://signed.test/${id || "artifact-1"}-source.${
                isComposite ? "json" : "png"
              }`,
              format: TEST_SOURCE_FORMAT[artifactType],
              digest: `sha256:${id || "artifact-1"}`,
            },
          }
        : {}),
    },
    provenance: {
      id: `prov-${id || "artifact-1"}`,
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
        context_id: contextId,
        role: "primary",
        rank: 1,
        pinned_revision_id: pinnedRevisionId,
      },
    ],
  };
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

test("gateway-relative rendition access paths are qualified before normalization", async () => {
  const rawProjection = projection({
    id: "relative-access",
    editable: true,
    visibility: "public",
  });
  rawProjection.renditions.preview.url =
    "/v1/artifact-renditions/access/preview-token";
  rawProjection.renditions.source.url =
    "/v1/artifact-renditions/access/source-token";
  globalThis.fetch = async () => jsonResponse(rawProjection);

  const result = await getArtifactItem("relative-access", "r1");

  assert.equal(result.ok, true);
  assert.equal(
    result.data?.artifact?.renditions.preview?.url,
    "https://api.test/v1/artifact-renditions/access/preview-token",
  );
  assert.equal(
    result.data?.artifact?.renditions.source?.url,
    "https://api.test/v1/artifact-renditions/access/source-token",
  );
});

test("artifact library requests match FastAPI aliases, bounds, empty-value, and offset contracts", async () => {
  const contextId = "00000000-0000-0000-0000-000000000001";
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.pathname === "/v1/library/primary") {
      return jsonResponse({ contextId, items: [], total: 0 });
    }
    return jsonResponse({
      items: [],
      scope: "public",
      nextOffset: calls.length === 2 ? 100 : null,
      offset: Number(url.searchParams.get("offset") || 0),
      limit: Number(url.searchParams.get("limit") || 0),
      total: calls.length === 2 ? 160 : 0,
    });
  };

  const primary = await listPrimaryArtifacts(
    {
      contextId,
      siteKey: "image",
      appId: " poster ",
      functionId: " ",
    },
    { artifactType: "single_file_image", limit: 200 },
  );
  assert.equal(primary.ok, true);
  assert.deepEqual(
    Object.fromEntries(calls[0].searchParams),
    {
      contextId,
      siteKey: "image",
      limit: "100",
      appId: "poster",
    },
  );
  for (const rejected of [
    "context",
    "context_id",
    "site_key",
    "app_id",
    "function_id",
    "artifact_type",
    "artifactType",
  ]) {
    assert.equal(calls[0].searchParams.has(rejected), false);
  }

  const filtered = await searchArtifactLibrary({
    query: " poster ",
    artifactType: "single_file_image",
    role: " primary ",
    sourceFormat: " png ",
    limit: 200,
  });
  assert.equal(filtered.ok, true);
  assert.equal(filtered.data?.nextCursor, "100");
  assert.deepEqual(
    Object.fromEntries(calls[1].searchParams),
    {
      limit: "100",
      q: "poster",
      artifactType: "single_file_image",
      role: "primary",
      sourceFormat: "png",
    },
  );
  for (const rejected of ["artifact_type", "source_format", "cursor"]) {
    assert.equal(calls[1].searchParams.has(rejected), false);
  }

  const paginated = await searchArtifactLibrary({
    cursor: filtered.data?.nextCursor || "",
    limit: 60,
  });
  assert.equal(paginated.ok, true);
  assert.deepEqual(
    Object.fromEntries(calls[2].searchParams),
    { limit: "60", offset: "100" },
  );

  const myLibrary = await searchArtifactLibrary({ limit: 200 });
  assert.equal(myLibrary.ok, true);
  assert.deepEqual(
    Object.fromEntries(calls[3].searchParams),
    { limit: "100" },
  );
});

test("Primary validates exact full and contextId-only response contexts fail-closed", async () => {
  const requested = {
    contextId: "00000000-0000-0000-0000-000000000001",
    siteKey: "image",
    appId: "poster",
    functionId: "hero",
  };
  const responses = [
    {
      context: { ...requested },
      contextId: requested.contextId,
      items: [],
    },
    {
      context: { ...requested },
      items: [],
    },
    {
      contextId: requested.contextId,
      items: [],
    },
    {
      context: { ...requested, appId: "other-app" },
      contextId: requested.contextId,
      items: [],
    },
    {
      context: { ...requested },
      contextId: "00000000-0000-0000-0000-000000000002",
      items: [],
    },
    {
      context: { contextId: requested.contextId },
      contextId: requested.contextId,
      items: [],
    },
    {
      contextId: "00000000-0000-0000-0000-000000000002",
      items: [],
    },
    {
      items: [],
    },
  ];
  globalThis.fetch = async () =>
    jsonResponse({ total: 0, ...responses.shift() });

  const exactFullWithId = await listPrimaryArtifacts(requested);
  const exactFullOnly = await listPrimaryArtifacts(requested);
  const exactIdOnly = await listPrimaryArtifacts(requested);
  const mismatchedFull = await listPrimaryArtifacts(requested);
  const conflictingFullAndId = await listPrimaryArtifacts(requested);
  const malformedFull = await listPrimaryArtifacts(requested);
  const mismatchedIdOnly = await listPrimaryArtifacts(requested);
  const missingContext = await listPrimaryArtifacts(requested);

  assert.equal(exactFullWithId.ok, true);
  assert.equal(exactFullOnly.ok, true);
  assert.equal(exactIdOnly.ok, true);
  for (const rejected of [
    mismatchedFull,
    conflictingFullAndId,
    malformedFull,
    mismatchedIdOnly,
    missingContext,
  ]) {
    assert.equal(rejected.ok, false);
    assert.equal(rejected.code, "invalid-binding");
    assert.match(rejected.error || "", /context/);
  }
});

test("public search and owner-scoped mine reject mixed authority rows", async () => {
  const calls = [];
  const responses = [
    authoritativeLibraryPages.publicPage,
    authoritativeLibraryPages.mineOwnerAPage,
    authoritativeLibraryPages.mineMixedOwnerPage,
  ];
  globalThis.fetch = async (input) => {
    calls.push(new URL(String(input)));
    return jsonResponse(responses.shift());
  };

  const publicResult = await searchArtifactLibrary({ limit: 60 });
  const ownerA = await listMyArtifacts({ limit: 100 });
  const mixedOwner = await listMyArtifacts({ limit: 100 });

  assert.equal(publicResult.ok, true);
  assert.equal(ownerA.ok, true);
  assert.equal(ownerA.data?.ownerPrincipalId, "owner-a");
  assert.equal(mixedOwner.ok, false);
  assert.equal(mixedOwner.code, "invalid-response");
  assert.match(mixedOwner.error || "", /其他 owner/);
  assert.deepEqual(
    calls.map((url) => url.pathname),
    ["/v1/library/search", "/v1/library/mine", "/v1/library/mine"],
  );
});

test("editable shelf and favorites use one strict owner-scoped envelope each", async () => {
  const shelfItems = ARTIFACT_TYPES.map((artifactType) =>
    projection({
      id: `shelf-${artifactType}`,
      artifactType,
      visibility: "public",
      editable: true,
    }),
  );
  const favoritePublic = projection({
    id: "favorite-public",
    visibility: "public",
    favorite: true,
    editable: true,
  });
  const favoritePrivate = projection({
    id: "favorite-private",
    ownerPrincipalId: "owner-a",
    favorite: true,
    editable: true,
  });
  const responses = [
    {
      scope: "public",
      total: shelfItems.length,
      invalidCount: 0,
      items: shelfItems,
    },
    {
      scope: "public",
      total: shelfItems.length - 1,
      invalidCount: 0,
      items: shelfItems.slice(1),
    },
    {
      scope: "public",
      total: shelfItems.length * 2,
      invalidCount: 0,
      nextOffset: shelfItems.length,
      items: shelfItems,
    },
    {
      scope: "favorites",
      ownerPrincipalId: "owner-a",
      total: 3,
      invalidCount: 0,
      nextOffset: 2,
      items: [favoritePublic, favoritePrivate],
    },
    {
      scope: "favorites",
      ownerPrincipalId: "owner-a",
      total: 3,
      invalidCount: 0,
      items: [
        projection({
          id: "favorite-page-2",
          visibility: "public",
          favorite: true,
          editable: true,
        }),
      ],
    },
    {
      scope: "favorites",
      ownerPrincipalId: "owner-a",
      total: 1,
      invalidCount: 0,
      items: [{ ...favoritePublic, favorite: false }],
    },
  ];
  const calls = [];
  globalThis.fetch = async (input) => {
    calls.push(new URL(String(input)));
    return jsonResponse(responses.shift());
  };

  const shelf = await listEditableShelfArtifacts();
  const incompleteShelf = await listEditableShelfArtifacts();
  const paginatedShelf = await listEditableShelfArtifacts();
  const favorites = await listFavoriteArtifacts({ limit: 2 });
  const favoritePage2 = await listFavoriteArtifacts({
    cursor: favorites.data?.nextCursor || undefined,
    limit: 2,
  });
  const invalidFavorites = await listFavoriteArtifacts();

  assert.equal(shelf.ok, true);
  assert.equal(shelf.data?.items.length, 13);
  assert.equal(incompleteShelf.ok, false);
  assert.match(incompleteShelf.error || "", /13 taxonomy/);
  assert.equal(paginatedShelf.ok, false);
  assert.equal(favorites.ok, true);
  assert.equal(favorites.data?.ownerPrincipalId, "owner-a");
  assert.equal(favorites.data?.nextCursor, "2");
  assert.equal(favoritePage2.ok, true);
  assert.equal(favoritePage2.data?.items[0]?.artifactId, "favorite-page-2");
  assert.equal(invalidFavorites.ok, false);
  assert.match(invalidFavorites.error || "", /未收藏/);
  assert.deepEqual(
    calls.map((url) => [url.pathname, Object.fromEntries(url.searchParams)]),
    [
      ["/v1/library/editable-shelf", { perType: "5" }],
      ["/v1/library/editable-shelf", { perType: "5" }],
      ["/v1/library/editable-shelf", { perType: "5" }],
      ["/v1/library/favorites", { limit: "2", offset: "0" }],
      ["/v1/library/favorites", { limit: "2", offset: "2" }],
      ["/v1/library/favorites", { limit: "100", offset: "0" }],
    ],
  );
});

test("local production-shape 20-item pages accept either third-party evidence field", async () => {
  const context = {
    contextId: "olctx:v1:image:app:poster",
    siteKey: "image",
    appId: "poster",
  };
  const items = Array.from({ length: 20 }, (_, index) => {
    const item = projection({
      id: `production-provider-${String(index + 1).padStart(2, "0")}`,
      title: `Production provider ${index + 1}`,
      contextId: context.contextId,
      visibility: "public",
    });
    item.roles = ["acceptance_fixture"];
    item.provenance = {
      id: `prov-production-provider-${index + 1}`,
      source_kind: "approved_provider",
      license_code: index === 18 ? "CC-BY-4.0" : "CC0",
      license_url:
        index === 18
          ? ""
          : "https://creativecommons.org/publicdomain/zero/1.0/",
      attribution:
        index === 18
          ? "Photo by Example Author"
          : index === 19
            ? "Example catalog"
            : "",
    };
    return item;
  });
  assert.equal(
    items.filter(
      (item) =>
        item.provenance.license_url && !item.provenance.attribution,
    ).length,
    18,
  );
  assert.equal(
    items.filter(
      (item) =>
        !item.provenance.license_url && item.provenance.attribution,
    ).length,
    1,
  );

  const page = {
    scope: "public",
    total: 20,
    invalidCount: 0,
    context,
    contextId: context.contextId,
    items,
  };
  const invalidPage = {
    ...page,
    items: items.map((item, index) =>
      index === 19
        ? {
            ...item,
            provenance: {
              ...item.provenance,
              license_url: "",
              attribution: "",
            },
          }
        : item,
    ),
  };
  const responses = [page, page, invalidPage];
  const calls = [];
  globalThis.fetch = async (input) => {
    calls.push(new URL(String(input)).pathname);
    return jsonResponse(responses.shift());
  };

  const search = await searchArtifactLibrary({ limit: 20 });
  const primary = await listPrimaryArtifacts(context, {
    artifactType: "single_file_image",
    limit: 20,
  });
  const rejected = await searchArtifactLibrary({ limit: 20 });

  assert.equal(search.ok, true);
  assert.equal(search.data?.items.length, 20);
  assert.equal(primary.ok, true);
  assert.equal(primary.data?.items.length, 20);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "invalid-response");
  assert.match(rejected.error || "", /同时缺少 license URL 与 attribution/);
  assert.deepEqual(calls, [
    "/v1/library/search",
    "/v1/library/primary",
    "/v1/library/search",
  ]);
});

test("material cards and rows hide machine copy without changing generic rows", async () => {
  const normalized = normalizeArtifactProjection(
    projection({
      id: "quiet-material",
      title: "Quiet material",
      visibility: "public",
    }),
  );
  assert.ok(normalized);
  normalized.roles = ["acceptance_fixture"];
  const sourceItem = artifactProjectionToLibraryItem(normalized);
  const entry = artifactEntry(sourceItem);
  entry.description =
    "图片 OceanLeo owned acceptance_fixture 预览 编辑 下载 收藏";

  assert.equal(
    entry.libraryItem?.meta.workspace_library_surface,
    "materials",
  );
  assert.equal(sourceItem.meta.workspace_library_surface, undefined);

  const materialRow = await createMounted(WorkspaceListRow, {
    entry,
    onOpen() {},
  });
  try {
    assert.match(materialRow.container.textContent || "", /Quiet material/);
    assert.doesNotMatch(
      materialRow.container.textContent || "",
      /图片|OceanLeo owned|acceptance_fixture|预览|编辑|下载|收藏/,
    );
  } finally {
    await materialRow.unmount();
  }

  const materialCard = await createMounted(WorkspaceCard, {
    entry,
    onOpen() {},
    accent: "#4f46e5",
  });
  try {
    assert.match(materialCard.container.textContent || "", /Quiet material/);
    assert.doesNotMatch(
      materialCard.container.textContent || "",
      /图片|OceanLeo owned|acceptance_fixture|预览|编辑|下载|收藏/,
    );
  } finally {
    await materialCard.unmount();
  }

  const genericMeta = { ...entry.libraryItem.meta };
  delete genericMeta.workspace_library_surface;
  const genericRow = await createMounted(WorkspaceListRow, {
    entry: {
      ...entry,
      id: "generic-entry",
      title: "Generic entry",
      description: "用户自定义说明",
      libraryItem: {
        ...entry.libraryItem,
        key: "generic-entry",
        meta: genericMeta,
      },
    },
    onOpen() {},
  });
  try {
    assert.match(genericRow.container.textContent || "", /用户自定义说明/);
  } finally {
    await genericRow.unmount();
  }
});

test("unknown schema, declared invalidCount and unauthoritative empty pages are service errors", async () => {
  const responses = [
    {
      scope: "public",
      total: 1,
      items: [{ ...projection({ visibility: "public" }), schema: "unknown" }],
    },
    {
      scope: "public",
      total: 0,
      invalidCount: 1,
      items: [],
    },
    {
      scope: "public",
      items: [],
    },
    {
      scope: "public",
      total: 1,
      items: [projection({ id: "private-leak" })],
    },
  ];
  globalThis.fetch = async () => jsonResponse(responses.shift());

  for (const expected of [
    /schema/,
    /无效 projection/,
    /权威 total/,
    /非 public/,
  ]) {
    const result = await searchArtifactLibrary();
    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid-response");
    assert.match(result.error || "", expected);
  }
});

test("ensure receipt and pinned download preserve durable identity", async () => {
  const ensuredProjection = projection({
    id: "ensured-upload",
    title: "Upload",
    editable: true,
  });
  ensuredProjection.source_format = "docx";
  ensuredProjection.renditions.source = {
    ...ensuredProjection.renditions.source,
    url: "https://signed.test/ensured-upload-source.docx",
    format: "docx",
  };
  const transient = {
    schema: "oceanleo.transient-generation.v1",
    operation: "upload",
    resultId: "upload-result-1",
    idempotencyKey: "upload-key-1",
    payloadDigest: "sha256:upload-1",
    artifactType: "single_file_image",
    title: "Upload",
    renditionUrl: "https://signed.test/upload-preview.png",
  };
  let ensureMismatch = false;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/v1/artifacts/ensure") {
      return jsonResponse({
        ...ensuredProjection,
        receipt: {
          result_id: transient.resultId,
          payload_digest: ensureMismatch
            ? "sha256:wrong"
            : transient.payloadDigest,
          idempotency_key: transient.idempotencyKey,
        },
      });
    }
    if (
      url.pathname ===
        "/v1/artifacts/ensured-upload/revisions/r1/renditions/source" &&
      url.searchParams.get("mode") === "export"
    ) {
      return jsonResponse({
        artifact_id: "ensured-upload",
        revision_id: "r1",
        purpose: "source",
        mode: "export",
        access_url: "/v1/artifact-renditions/access/export-token",
        expires_at: new Date(Date.now() + 300_000).toISOString(),
      });
    }
    return jsonResponse(ensuredProjection);
  };

  const ensured = await ensureArtifact(transient);
  assert.equal(ensured.ok, true);
  assert.equal(ensured.data?.artifactId, "ensured-upload");
  const download = await getArtifactDownload(ensured.data);
  assert.equal(download.ok, true);
  assert.equal(download.data?.artifactId, "ensured-upload");
  assert.equal(download.data?.revisionId, "r1");
  assert.equal(download.data?.filename, "Upload.docx");
  assert.equal(
    download.data?.url,
    "https://api.test/v1/artifact-renditions/access/export-token",
  );

  ensureMismatch = true;
  const rejected = await ensureArtifact({
    ...transient,
    idempotencyKey: "upload-key-2",
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "transient-persistence-failed");
  assert.match(rejected.error || "", /receipt/);
});

test("download export falls back from unavailable source to full then preview", async () => {
  const fullProjection = projection({
    id: "download-full",
    title: "Full export",
  });
  fullProjection.renditions.full = {
    purpose: "full",
    revision_id: "r1",
    url: "https://signed.test/download-full.pdf",
    format: "pdf",
  };
  const previewProjection = projection({
    id: "download-preview",
    title: "Preview export",
  });
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.pathname.includes("/renditions/")) {
      const purpose = url.pathname.endsWith("/full") ? "full" : "preview";
      return jsonResponse({
        artifact_id: url.pathname.includes("download-full")
          ? "download-full"
          : "download-preview",
        revision_id: "r1",
        purpose,
        mode: "export",
        access_url: `/v1/artifact-renditions/access/${purpose}-token`,
        expires_at: new Date(Date.now() + 300_000).toISOString(),
      });
    }
    return jsonResponse(
      url.pathname.endsWith("/download-full")
        ? fullProjection
        : previewProjection,
    );
  };
  const fullItem = normalizeArtifactProjection(fullProjection);
  const previewItem = normalizeArtifactProjection(previewProjection);
  assert.ok(fullItem);
  assert.ok(previewItem);

  const fullDownload = await getArtifactDownload(
    artifactProjectionToLibraryItem(fullItem),
  );
  const previewDownload = await getArtifactDownload(
    artifactProjectionToLibraryItem(previewItem),
  );

  assert.equal(fullDownload.ok, true);
  assert.equal(fullDownload.data?.filename, "Full export.pdf");
  assert.equal(previewDownload.ok, true);
  assert.equal(previewDownload.data?.filename, "Preview export.png");
  assert.deepEqual(
    calls
      .filter((url) => url.pathname.includes("/renditions/"))
      .map((url) => `${url.pathname}?${url.searchParams}`),
    [
      "/v1/artifacts/download-full/revisions/r1/renditions/full?mode=export",
      "/v1/artifacts/download-preview/revisions/r1/renditions/preview?mode=export",
    ],
  );
});

test("upload consumes canonical file.artifact and legacy fallback fails loud", () => {
  const rawProjection = projection({
    id: "upload-artifact",
    ownerPrincipalId: "owner-a",
    editable: true,
  });
  const canonical = canonicalUploadLibraryItem({
    id: "file-row",
    url: "https://signed.test/upload.png",
    artifact_id: "upload-artifact",
    revision_id: "r1",
    artifact: rawProjection,
  });
  assert.equal(canonical.ok, true);
  assert.equal(canonical.item?.artifactId, "upload-artifact");

  const mismatched = canonicalUploadLibraryItem({
    id: "file-row",
    url: "https://signed.test/upload.png",
    artifact_id: "other-artifact",
    revision_id: "r1",
    artifact: rawProjection,
  });
  assert.equal(mismatched.ok, false);
  assert.match(mismatched.error || "", /不一致/);

  const file = {
    name: "legacy.png",
    type: "image/png",
  };
  const missing = legacyUploadTransient(
    {
      id: undefined,
      url: "https://signed.test/legacy.png",
      meta: {},
    },
    file,
    "image",
  );
  assert.equal(missing.ok, false);
  assert.doesNotMatch(missing.error || "", /undefined resultId/);

  const compatible = legacyUploadTransient(
    {
      id: "legacy-file",
      url: "https://signed.test/legacy.png",
      meta: { content_digest: "sha256:legacy-file" },
    },
    file,
    "image",
  );
  assert.equal(compatible.ok, true);
  assert.equal(compatible.transient?.resultId, "legacy-file");
});

test("retire requires pinned revision confirmation before removing state", async () => {
  const rawProjection = projection({
    id: "retire-me",
    ownerPrincipalId: "owner-a",
  });
  const normalized = normalizeArtifactProjection(rawProjection);
  assert.ok(normalized);
  const item = artifactProjectionToLibraryItem(normalized);
  const calls = [];
  let mismatch = false;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (init.method === "DELETE") {
      return jsonResponse({
        retired: true,
        artifact_id: "retire-me",
        revision_id: mismatch ? "r0" : "r1",
      });
    }
    return jsonResponse(rawProjection);
  };

  const retired = await retireArtifact(item);
  assert.equal(retired.ok, true);
  assert.equal(retired.data?.retired, true);
  assert.equal(calls[1].url.searchParams.get("revisionId"), "r1");
  assert.equal(calls[1].init.headers["If-Match"], "r1");

  mismatch = true;
  const rejected = await retireArtifact(item);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "invalid-response");
});

test("favorite mutation is revision-pinned and requires confirmed state", async () => {
  const rawProjection = projection({
    id: "favorite-me",
    editable: true,
    favorite: false,
  });
  const normalized = normalizeArtifactProjection(rawProjection);
  assert.ok(normalized);
  const item = artifactProjectionToLibraryItem(normalized);
  const calls = [];
  let confirmed = true;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    return init.method === "PUT"
      ? jsonResponse({
          ...rawProjection,
          favorite: confirmed,
        })
      : jsonResponse(rawProjection);
  };

  const updated = await setArtifactFavorite(item, true);
  assert.equal(updated.ok, true);
  assert.equal(updated.data?.favorite, true);
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    revision_id: "r1",
    favorite: true,
  });

  confirmed = false;
  const rejected = await setArtifactFavorite(item, true);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "invalid-response");
});

test("revision publish records the exact previous pin for ResultCanvas handoff", async () => {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ url: new URL(String(input)), init });
    return jsonResponse(
      projection({
        id: "revision-root",
        revisionId: "r2",
        editable: true,
      }),
    );
  };
  const result = await createArtifactRevision("revision-root", {
    expectedRevisionId: "r1",
    artifactType: "single_file_image",
    source: {
      format: "png",
      url: "https://signed.test/revision-root-r2-source.png",
      digest: "sha256:revision-root-r2",
    },
    renditions: [
      {
        purpose: "preview",
        url: "https://signed.test/revision-root-r2-preview.png",
        digest: "sha256:revision-root-r2-preview",
      },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.data?.revisionId, "r2");
  assert.equal(result.data?.meta.previous_revision_id, "r1");
  assert.equal(calls[0].init.headers["If-Match"], "r1");
});

test("library clients preserve 401, 403 and 503 service states", async () => {
  const statuses = [401, 403, 503];
  globalThis.fetch = async () => {
    const status = statuses.shift();
    return jsonResponse({ detail: `status-${status}` }, status);
  };
  for (const status of [401, 403, 503]) {
    const result = await searchArtifactLibrary();
    assert.equal(result.ok, false);
    assert.equal(result.status, status);
    assert.equal(result.error, `status-${status}`);
  }
});

test("artifact detail and edit capability use canonical revisionId query aliases", async () => {
  const rawProjection = projection({
    id: "revision-contract",
    editable: true,
    visibility: "public",
  });
  const normalized = normalizeArtifactProjection(rawProjection);
  assert.ok(normalized);
  const item = artifactProjectionToLibraryItem(normalized);
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    return url.pathname.endsWith("/edit-capability")
      ? jsonResponse({
          available: true,
          editor_capability: "image-editor",
          item: rawProjection,
        })
      : jsonResponse(rawProjection);
  };

  const detail = await getArtifactItem("revision-contract", "r1");
  const editDecision = await getArtifactEditDecision(item);

  assert.equal(detail.ok, true);
  assert.equal(editDecision.ok, true);
  const detailHref = new URL(detail.data.meta.asset_page_url);
  assert.equal(detailHref.searchParams.get("artifactId"), "revision-contract");
  assert.equal(detailHref.searchParams.get("revisionId"), "r1");
  assert.deepEqual(
    calls.map((url) => url.pathname),
    [
      "/v1/library/items/revision-contract",
      "/v1/library/items/revision-contract",
      "/v1/artifacts/revision-contract/edit-capability",
    ],
  );
  for (const url of calls) {
    assert.deepEqual(
      Object.fromEntries(url.searchParams),
      { revisionId: "r1" },
    );
    assert.equal(url.searchParams.has("revision_id"), false);
  }
});

test("public editable material forks before opening the private editor", async () => {
  const publicProjection = projection({
    id: "public-template",
    title: "Public template",
    visibility: "public",
  });
  publicProjection.access.can_fork = true;
  publicProjection.editability = "bounded";
  publicProjection.editor_capability = "image-editor";
  publicProjection.source_format = "png";
  publicProjection.renditions.source = {
    purpose: "source",
    revision_id: "r1",
    url: "https://signed.test/public-template-source.png",
    format: "png",
    digest: "sha256:public-template",
  };
  const forkedProjection = projection({
    id: "private-fork",
    title: "Public template copy",
    editable: true,
  });
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (url.pathname.endsWith(":fork")) {
      return jsonResponse({
        ...forkedProjection,
        forkedFrom: {
          artifactId: "public-template",
          revisionId: "r1",
        },
      });
    }
    if (url.pathname.endsWith("/edit-capability")) {
      return jsonResponse({
        available: true,
        editor_capability: "image-editor",
        item: forkedProjection,
      });
    }
    return jsonResponse(publicProjection);
  };
  const normalized = normalizeArtifactProjection(publicProjection);
  assert.ok(normalized);

  const decision = await getArtifactEditDecision(
    artifactProjectionToLibraryItem(normalized),
  );

  assert.equal(decision.ok, true);
  assert.equal(decision.data?.item.artifactId, "private-fork");
  assert.equal(decision.data?.item.artifact.owner.visibility, "private");
  assert.deepEqual(
    calls.map(({ url }) => url.pathname),
    [
      "/v1/library/items/public-template",
      "/v1/library/items/public-template",
      "/v1/artifacts/public-template:fork",
      "/v1/artifacts/private-fork/edit-capability",
    ],
  );
  assert.deepEqual(JSON.parse(calls[2].init.body), {
    source_revision_id: "r1",
  });
});

test("rendered Primary is exact, ACL-safe, and rejects mismatched response context", async () => {
  const calls = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return jsonResponse({
      contextId: "ctx:image:poster",
      items: [
        projection({
          id: "exact",
          title: "Exact primary",
          editable: true,
        }),
      ],
      next_cursor: null,
      total: 1,
    });
  };
  const localDeniedArtifact = normalizeArtifactProjection(
    projection({
      id: "local-unauthorized",
      title: "Local unauthorized",
      canRead: false,
      canPreview: false,
      editable: true,
    }),
  );
  assert.ok(localDeniedArtifact);
  const localEditableArtifact = normalizeArtifactProjection(
    projection({
      id: "local-editable",
      title: "Local editable",
      editable: true,
    }),
  );
  assert.ok(localEditableArtifact);
  const featuredEditableArtifact = normalizeArtifactProjection(
    projection({
      id: "featured-editable",
      title: "Featured editable",
      editable: true,
    }),
  );
  assert.ok(featuredEditableArtifact);
  const mounted = await createMounted(MaterialLibrary, {
    materials: [
      {
        id: "local-unauthorized",
        title: "Local unauthorized",
        thumb: "https://signed.test/local-unauthorized.png",
        libraryItem: artifactProjectionToLibraryItem(localDeniedArtifact),
      },
      {
        id: "local-editable",
        title: "Local editable",
        thumb: "https://signed.test/local-editable.png",
        libraryItem: artifactProjectionToLibraryItem(
          localEditableArtifact,
        ),
      },
    ],
    featuredEntries: [
      artifactEntry(
        artifactProjectionToLibraryItem(featuredEditableArtifact),
      ),
      {
        id: "featured-nondurable",
        title: "Featured non-durable",
        libraryItem: {
          key: "featured-nondurable",
          source: "artifact",
          id: "featured-nondurable",
          kind: "image",
          title: "Featured non-durable",
          favorite: false,
          meta: {},
        },
      },
    ],
    siteId: "image",
    appId: "poster",
    contextId: "ctx:image:poster",
  });
  try {
    await settle();
    assert.equal(calls.length, 1);
    assert.match(calls[0], /\/v1\/library\/primary\?/);
    assert.ok(
      mounted.container.querySelector('[data-entry-title="Exact primary"]'),
    );
    assert.ok(
      mounted.container.querySelector('[data-entry-title="Local editable"]'),
    );
    assert.ok(
      mounted.container.querySelector(
        '[data-entry-title="Featured editable"]',
      ),
    );
    assert.equal(
      mounted.container.querySelector(
        '[data-entry-title="Featured non-durable"]',
      ),
      null,
    );
    assertEveryRenderedMaterialIsEditable(mounted.container);
    assert.equal(
      mounted.container.querySelector(
        '[data-entry-title="Local unauthorized"]',
      ),
      null,
    );
  } finally {
    await mounted.unmount();
  }

  globalThis.fetch = async () =>
    jsonResponse({
      contextId: "ctx:image:poster",
      total: 2,
      items: [
        projection({
          id: "trusted-primary",
          title: "Trusted primary",
          editable: true,
        }),
        projection({
          id: "view-only-primary",
          title: "View-only primary",
        }),
      ],
    });
  const untrustedPrimary = await createMounted(MaterialLibrary, {
    materials: [],
    siteId: "image",
    appId: "poster",
    contextId: "ctx:image:poster",
  });
  try {
    await settle();
    assert.equal(
      untrustedPrimary.container.querySelectorAll("[data-entry-title]")
        .length,
      0,
    );
    assert.match(
      untrustedPrimary.container.querySelector("[data-empty-description]")
        ?.textContent || "",
      /trusted editor capability/,
    );
  } finally {
    await untrustedPrimary.unmount();
  }

  globalThis.fetch = async () =>
    jsonResponse({
      contextId: "ctx:image:poster",
      total: 2,
      items: [
        projection({
          id: "exact",
          title: "Exact primary",
          editable: true,
        }),
        projection({
          id: "wrong-context",
          title: "Wrong context",
          contextId: "ctx:image:other",
          editable: true,
        }),
      ],
    });
  const contaminated = await createMounted(MaterialLibrary, {
    materials: [],
    siteId: "image",
    appId: "poster",
    contextId: "ctx:image:poster",
  });
  try {
    await settle();
    assert.equal(
      contaminated.container.querySelectorAll("[data-entry-title]").length,
      0,
    );
    assert.match(
      contaminated.container.querySelector("[data-empty-description]")
        ?.textContent || "",
      /非精确 context/,
    );
  } finally {
    await contaminated.unmount();
  }

  globalThis.fetch = async () =>
    jsonResponse({
      contextId: "ctx:image:other",
      items: [
        projection({
          id: "leaked",
          title: "Mismatched response",
          editable: true,
        }),
      ],
      nextOffset: null,
      total: 1,
    });
  const mismatched = await createMounted(MaterialLibrary, {
    materials: [],
    siteId: "image",
    appId: "poster",
    contextId: "ctx:image:poster",
  });
  try {
    await settle();
    assert.equal(
      mismatched.container.querySelector(
        '[data-entry-title="Mismatched response"]',
      ),
      null,
    );
    assert.match(
      mismatched.container.querySelector("[data-empty-description]")
        ?.textContent || "",
      /不匹配的 context/,
    );
  } finally {
    await mismatched.unmount();
  }
});

test("rendered missing context stays empty without issuing a Primary request", async () => {
  let fetches = 0;
  globalThis.fetch = async () => {
    fetches += 1;
    return jsonResponse({ items: [] });
  };
  const mounted = await createMounted(MaterialLibrary, {
    materials: [],
    siteId: "image",
    appId: "poster",
  });
  try {
    await settle();
    assert.equal(fetches, 0);
    assert.equal(
      mounted.container.querySelectorAll("[data-entry-title]").length,
      0,
    );
    // Friendly empty state, never the old frightening error banner.
    const description =
      mounted.container.querySelector("[data-empty-description]")
        ?.textContent || "";
    assert.match(description, /素材面板缺少上下文标识/);
    assert.doesNotMatch(description, /缺少精确 contextId|响应无效/);
  } finally {
    await mounted.unmount();
  }
});

test("rendered no-binding backend responses render as empty state, not errors", async () => {
  globalThis.fetch = async () =>
    jsonResponse({ detail: "context 不存在", code: "invalid_binding" }, 404);
  const mounted = await createMounted(MaterialLibrary, {
    materials: [],
    siteId: "image",
    appId: "poster",
    contextId: "olctx:v1:image:app:poster",
  });
  try {
    await settle();
    const description =
      mounted.container.querySelector("[data-empty-description]")
        ?.textContent || "";
    assert.doesNotMatch(description, /响应无效|context 不存在/);
  } finally {
    await mounted.unmount();
  }

  // 401/403/503 keep their explicit copy.
  globalThis.fetch = async () => jsonResponse({ detail: "denied" }, 403);
  const denied = await createMounted(MaterialLibrary, {
    materials: [],
    siteId: "image",
    appId: "poster",
    contextId: "olctx:v1:image:app:poster",
  });
  try {
    await settle();
    assert.match(
      denied.container.querySelector("[data-empty-description]")
        ?.textContent || "",
      /拒绝了此素材范围/,
    );
  } finally {
    await denied.unmount();
  }
});

test("rendered material library hides every non-durable site pick", async () => {
  globalThis.fetch = async () =>
    jsonResponse({
      contextId: "olctx:v1:image:app:poster",
      items: [
        projection({
          id: "exact",
          title: "Exact primary",
          contextId: "olctx:v1:image:app:poster",
          editable: true,
        }),
      ],
      total: 1,
    });
  const mounted = await createMounted(MaterialLibrary, {
    materials: [
      {
        id: "site-pick",
        title: "Site pick poster",
        thumb: "https://signed.test/site-pick.png",
        kind: "image",
      },
    ],
    siteId: "image",
    appId: "poster",
    contextId: "olctx:v1:image:app:poster",
  });
  try {
    await settle();
    assert.ok(
      mounted.container.querySelector('[data-entry-title="Exact primary"]'),
    );
    assert.equal(
      mounted.container.querySelector(
        '[data-entry-title="Site pick poster"]',
      ),
      null,
    );
  } finally {
    await mounted.unmount();
  }

  // Contextless curated rows belong on an inspiration surface, not Materials.
  const noContext = await createMounted(MaterialLibrary, {
    materials: [
      {
        id: "site-pick-2",
        title: "Contextless site pick",
        thumb: "https://signed.test/site-pick-2.png",
        kind: "image",
      },
    ],
    siteId: "image",
    appId: "poster",
  });
  try {
    await settle();
    assert.equal(
      noContext.container.querySelector(
        '[data-entry-title="Contextless site pick"]',
      ),
      null,
    );
  } finally {
    await noContext.unmount();
  }
});

test("rendered My Library is owner-scoped and dedupes cross-site durable identity", async () => {
  const calls = [];
  let libraryMode = "ok";
  let favoriteIncluded = true;
  const owned = projection({
    id: "shared-owned",
    title: "Owned across sites",
    ownerPrincipalId: "owner-a",
  });
  const publicFavorite = projection({
    id: "public-favorite",
    title: "Favorite template",
    visibility: "public",
    favorite: true,
    editable: true,
  });
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (
      libraryMode === "favorites-unavailable" &&
      url.pathname === "/v1/library/favorites"
    ) {
      return jsonResponse({ detail: "maintenance" }, 503);
    }
    if (url.pathname === "/v1/library/favorites") {
      return jsonResponse({
        scope: "favorites",
        ownerPrincipalId:
          libraryMode === "owner-mismatch" ? "owner-b" : "owner-a",
        total: favoriteIncluded ? 1 : 0,
        invalidCount: 0,
        items: favoriteIncluded ? [publicFavorite] : [],
      });
    }
    return jsonResponse({
      scope: "mine",
      ownerPrincipalId: "owner-a",
      total: 2,
      invalidCount: 0,
      items: [
        owned,
        {
          ...owned,
          owner: {
            ...owned.owner,
            origin_site_key: "word",
          },
        },
      ],
    });
  };
  const mounted = await createMounted(MyLibrary, {
    siteId: "image",
  });
  try {
    await settle();
    assert.equal(calls.length, 2);
    assert.equal(calls[0].pathname, "/v1/library/mine");
    assert.equal(calls[1].pathname, "/v1/library/favorites");
    assert.equal(
      mounted.container.querySelectorAll(
        '[data-entry-title="Owned across sites"]',
      ).length,
      1,
    );
    assert.equal(
      mounted.container
        .querySelector('[data-entry-title="Favorite template"]')
        ?.getAttribute("data-entry-category"),
      "收藏素材",
    );
    favoriteIncluded = false;
    await act(async () => {
      window.dispatchEvent(
        new window.CustomEvent(ARTIFACT_LIBRARY_CHANGE_EVENT, {
          detail: {
            action: "favorite",
            artifactId: "public-favorite",
            revisionId: "r1",
            favorite: false,
          },
        }),
      );
    });
    await settle();
    assert.equal(
      mounted.container.querySelector(
        '[data-entry-title="Favorite template"]',
      ),
      null,
    );
    const favoriteProjection = normalizeArtifactProjection(publicFavorite);
    assert.ok(favoriteProjection);
    favoriteIncluded = true;
    await act(async () => {
      window.dispatchEvent(
        new window.CustomEvent(ARTIFACT_LIBRARY_CHANGE_EVENT, {
          detail: {
            action: "favorite",
            artifactId: "public-favorite",
            revisionId: "r1",
            favorite: true,
            item: artifactProjectionToLibraryItem(favoriteProjection),
          },
        }),
      );
    });
    await settle();
    assert.ok(
      mounted.container.querySelector(
        '[data-entry-title="Favorite template"]',
      ),
    );
    libraryMode = "favorites-unavailable";
    const refresh = [...mounted.container.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === "刷新",
    );
    await click(refresh);
    await settle();
    assert.ok(
      mounted.container.querySelector(
        '[data-entry-title="Owned across sites"]',
      ),
    );
    assert.match(
      mounted.container.querySelector('[role="alert"]')?.textContent || "",
      /收藏素材服务暂时不可用/,
    );
    assert.equal(
      mounted.container.querySelector('input[type="file"]')?.disabled,
      false,
    );
    libraryMode = "owner-mismatch";
    await click(refresh);
    await settle();
    assert.equal(
      mounted.container.querySelector(
        '[data-entry-title="Owned across sites"]',
      ),
      null,
    );
    assert.match(
      mounted.container.querySelector("[data-empty-description]")
        ?.textContent || "",
      /ownerPrincipalId 不一致/,
    );
  } finally {
    await mounted.unmount();
  }
});

test("initial favorites outage preserves healthy mine authority and recovers", async () => {
  let favoritesUnavailable = true;
  const owned = projection({
    id: "partial-owned",
    title: "Healthy owned item",
    ownerPrincipalId: "owner-a",
  });
  const favorite = projection({
    id: "recovered-favorite",
    title: "Recovered favorite",
    visibility: "public",
    favorite: true,
    editable: true,
  });
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/v1/library/favorites") {
      return favoritesUnavailable
        ? jsonResponse({ detail: "favorites maintenance" }, 503)
        : jsonResponse({
            scope: "favorites",
            ownerPrincipalId: "owner-a",
            total: 1,
            invalidCount: 0,
            items: [favorite],
          });
    }
    return jsonResponse({
      scope: "mine",
      ownerPrincipalId: "owner-a",
      total: 1,
      invalidCount: 0,
      items: [owned],
    });
  };
  const mounted = await createMounted(MyLibrary, {});
  try {
    await settle();
    assert.ok(
      mounted.container.querySelector(
        '[data-entry-title="Healthy owned item"]',
      ),
    );
    assert.match(
      mounted.container.querySelector('[role="alert"]')?.textContent || "",
      /收藏素材服务暂时不可用/,
    );
    assert.equal(
      mounted.container.querySelector('input[type="file"]')?.disabled,
      false,
    );

    favoritesUnavailable = false;
    const refresh = [...mounted.container.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === "刷新",
    );
    await click(refresh);
    await settle();
    assert.ok(
      mounted.container.querySelector(
        '[data-entry-title="Recovered favorite"]',
      ),
    );
    assert.equal(mounted.container.querySelector('[role="alert"]'), null);
  } finally {
    await mounted.unmount();
  }
});

test("My Library deterministically paginates favorites beyond one hundred", async () => {
  const favorites = Array.from({ length: 101 }, (_, index) =>
    projection({
      id: `favorite-${index + 1}`,
      title: `Favorite ${index + 1}`,
      visibility: "public",
      favorite: true,
      editable: true,
    }),
  );
  const favoriteOffsets = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/v1/library/favorites") {
      const offset = Number(url.searchParams.get("offset") || 0);
      favoriteOffsets.push(offset);
      return jsonResponse({
        scope: "favorites",
        ownerPrincipalId: "owner-a",
        total: favorites.length,
        invalidCount: 0,
        ...(offset === 0 ? { nextOffset: 100 } : {}),
        items:
          offset === 0
            ? favorites.slice(0, 100)
            : favorites.slice(100),
      });
    }
    return jsonResponse({
      scope: "mine",
      ownerPrincipalId: "owner-a",
      total: 0,
      invalidCount: 0,
      items: [],
    });
  };
  const mounted = await createMounted(MyLibrary, {});
  try {
    await settle();
    assert.ok(
      mounted.container.querySelector('[data-entry-title="Favorite 100"]'),
    );
    assert.equal(
      mounted.container.querySelector('[data-entry-title="Favorite 101"]'),
      null,
    );
    const loadMore = [...mounted.container.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === "继续加载",
    );
    await click(loadMore);
    await settle();
    assert.ok(
      mounted.container.querySelector('[data-entry-title="Favorite 101"]'),
    );
    assert.deepEqual(favoriteOffsets, [0, 100]);
  } finally {
    await mounted.unmount();
  }
});

test("favorites pagination fails closed when a later page changes owner", async () => {
  const first = projection({
    id: "favorite-owner-a",
    title: "Favorite owner A",
    visibility: "public",
    favorite: true,
    editable: true,
  });
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/v1/library/favorites") {
      const offset = Number(url.searchParams.get("offset") || 0);
      return jsonResponse({
        scope: "favorites",
        ownerPrincipalId: offset === 0 ? "owner-a" : "owner-b",
        total: 2,
        invalidCount: 0,
        ...(offset === 0 ? { nextOffset: 1 } : {}),
        items:
          offset === 0
            ? [first]
            : [
                projection({
                  id: "favorite-owner-b",
                  visibility: "public",
                  favorite: true,
                  editable: true,
                }),
              ],
      });
    }
    return jsonResponse({
      scope: "mine",
      ownerPrincipalId: "owner-a",
      total: 0,
      invalidCount: 0,
      items: [],
    });
  };
  const mounted = await createMounted(MyLibrary, {});
  try {
    await settle();
    const loadMore = [...mounted.container.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === "继续加载",
    );
    await click(loadMore);
    await settle();
    assert.equal(
      mounted.container.querySelector(
        '[data-entry-title="Favorite owner A"]',
      ),
      null,
    );
    assert.match(
      mounted.container.querySelector("[data-empty-description]")
        ?.textContent || "",
      /owner\/scope/,
    );
  } finally {
    await mounted.unmount();
  }
});

test("rendered My Library distinguishes authoritative empty, 401, 403 and 503", async () => {
  const cases = [
    [
      200,
      {
        scope: "mine",
        ownerPrincipalId: "owner-a",
        total: 0,
        invalidCount: 0,
        items: [],
      },
      /生成作品/,
    ],
    [401, { detail: "login" }, /登录任意 OceanLeo/],
    [403, { detail: "denied" }, /拒绝了 owner-scoped/],
    [503, { detail: "offline" }, /维护或过载/],
  ];
  for (const [status, payload, expected] of cases) {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (
        (status === 200 || status === 503) &&
        url.pathname === "/v1/library/favorites"
      ) {
        return jsonResponse({
          scope: "favorites",
          ownerPrincipalId: "owner-a",
          total: 0,
          invalidCount: 0,
          items: [],
        });
      }
      return jsonResponse(payload, status);
    };
    const mounted = await createMounted(MyLibrary, {});
    try {
      await settle();
      assert.match(
        mounted.container.querySelector("[data-empty-description]")
          ?.textContent || "",
        expected,
      );
    } finally {
      await mounted.unmount();
    }
  }
});

test("rendered More uses one balanced endpoint with Primary disabled", async () => {
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    return jsonResponse({
      scope: "public",
      items: ARTIFACT_TYPES.map((artifactType) =>
        projection({
          id: `global-${artifactType}`,
          title:
            artifactType === "single_file_image"
              ? "Global More"
              : `Global ${artifactType}`,
          visibility: "public",
          artifactType,
          editable: true,
        }),
      ),
      invalidCount: 0,
      nextOffset: null,
      total: ARTIFACT_TYPES.length,
    });
  };
  const mounted = await createMounted(MaterialLibrary, {
    materials: [],
    siteId: "image",
    appId: "poster",
    contextId: "ctx:image:poster",
    fetchCurated: false,
  });
  try {
    await settle();
    assert.equal(calls.length, 0);
    await click(
      mounted.container.querySelector('a[aria-label="打开完整素材库"]'),
    );
    await settle();
    assert.equal(calls.length, 1);
    assert.match(calls[0], /\/v1\/library\/editable-shelf\?perType=5/);
    assert.ok(
      mounted.container.querySelector('[data-entry-title="Global website"]') ||
        mounted.container.querySelector('[data-entry-title="Global More"]'),
    );
    assertEveryRenderedMaterialIsEditable(mounted.container);
  } finally {
    await mounted.unmount();
  }

  let fallbackCalls = 0;
  const fallback = await createMounted(MaterialLibrary, {
    materials: [],
    siteId: "image",
    appId: "poster",
    contextId: "ctx:image:poster",
    fetchPrimary: false,
    fetchMore: false,
    onSeeAll: () => {
      fallbackCalls += 1;
    },
    seeAllLabel: "全部素材",
  });
  try {
    await click(
      fallback.container.querySelector(
        'a[aria-label="打开完整素材库"]',
      ),
    );
    assert.equal(fallbackCalls, 1);
    assert.match(fallback.container.textContent, /全部素材/);
  } finally {
    await fallback.unmount();
  }

  const hrefFallback = await createMounted(MaterialLibrary, {
    materials: [],
    siteId: "image",
    appId: "poster",
    contextId: "ctx:image:poster",
    fetchPrimary: false,
    fetchMore: false,
    seeAllHref: "https://asset.oceanleo.com/materials",
  });
  try {
    assert.equal(
      hrefFallback.container
        .querySelector('a[aria-label="打开完整素材库"]')
        ?.getAttribute("href"),
      "https://asset.oceanleo.com/materials",
    );
  } finally {
    await hrefFallback.unmount();
  }

  const noMore = await createMounted(MaterialLibrary, {
    materials: [],
    siteId: "image",
    appId: "poster",
    contextId: "ctx:image:poster",
    fetchPrimary: false,
    fetchMore: false,
  });
  try {
    assert.equal(
      noMore.container.querySelector('[aria-label="打开完整素材库"]'),
      null,
    );
  } finally {
    await noMore.unmount();
  }
});

test("material refresh failure preserves the last authoritative shelf", async () => {
  let failing = false;
  globalThis.fetch = async () => {
    if (failing) {
      return jsonResponse({ detail: "maintenance" }, 503);
    }
    return jsonResponse({
      scope: "public",
      total: ARTIFACT_TYPES.length,
      invalidCount: 0,
      items: ARTIFACT_TYPES.map((artifactType) =>
        projection({
          id: `stable-${artifactType}`,
          title: `Stable ${artifactType}`,
          visibility: "public",
          artifactType,
          editable: true,
        }),
      ),
    });
  };
  const mounted = await createMounted(MaterialLibrary, {
    materials: [],
    initialLevel: "more",
    lockLevel: "more",
    fetchPrimary: false,
  });
  try {
    await settle();
    assert.ok(
      mounted.container.querySelector(
        '[data-entry-title="Stable single_file_image"]',
      ),
    );
    failing = true;
    await act(async () => {
      window.dispatchEvent(
        new window.CustomEvent(ARTIFACT_LIBRARY_CHANGE_EVENT, {
          detail: { action: "revision" },
        }),
      );
    });
    await settle();
    assert.ok(
      mounted.container.querySelector(
        '[data-entry-title="Stable single_file_image"]',
      ),
    );
    assert.match(
      mounted.container.querySelector('[role="alert"]')?.textContent || "",
      /素材库服务暂时不可用/,
    );
  } finally {
    await mounted.unmount();
  }
});

test("rendered public material search exposes explicit service-unavailable state", async () => {
  globalThis.fetch = async () =>
    jsonResponse({ detail: "maintenance" }, 503);
  const mounted = await createMounted(MaterialLibrary, {
    materials: [],
    initialLevel: "more",
    lockLevel: "more",
    fetchPrimary: false,
  });
  try {
    await settle();
    assert.match(
      mounted.container.querySelector("[data-empty-description]")
        ?.textContent || "",
      /维护或过载/,
    );
  } finally {
    await mounted.unmount();
  }
});

test("full material deep link hydrates the exact public artifact revision", async () => {
  const deep = projection({
    id: "deep-public",
    title: "Deep public",
    visibility: "public",
    editable: true,
  });
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    return url.pathname.startsWith("/v1/library/items/")
      ? jsonResponse(deep)
      : jsonResponse({
          scope: "public",
          total: 0,
          invalidCount: 0,
          items: [],
        });
  };
  const mounted = await createMounted(MaterialLibrary, {
    materials: [],
    initialLevel: "more",
    lockLevel: "more",
    fetchPrimary: false,
    curatedType: "single_file_image",
    action: {
      nonce: "deep-public:r1",
      action: {
        version: 1,
        tab: "materials",
        itemId: "artifact:deep-public:r1",
      },
    },
  });
  try {
    await settle();
    assert.ok(
      mounted.container.querySelector('[data-entry-title="Deep public"]'),
    );
    const href = new URL(
      mounted.container
        .querySelector('[data-entry-link="Deep public"]')
        ?.getAttribute("href"),
    );
    assert.equal(href.searchParams.get("artifactId"), "deep-public");
    assert.equal(href.searchParams.get("revisionId"), "r1");
    assertEveryRenderedMaterialIsEditable(mounted.container);
  } finally {
    await mounted.unmount();
  }
});

test("rendered artifact actions keep Edit primary and dispatch Edit/Insert/Replace", async () => {
  const artifact = normalizeArtifactProjection(
    projection({ id: "actions", title: "Action source", editable: true }),
  );
  assert.ok(artifact);
  const item = artifactProjectionToLibraryItem(artifact);
  const matrix = actionModule.artifactActionMatrix(item, {
    hidePreview: true,
    insert: { visible: true, available: true, reason: "" },
    replace: { visible: true, available: true, reason: "" },
  });
  assert.equal(matrix.preview.visible, false);
  const dispatched = [];
  globalThis.__artifactPreparedActions = [];
  const mounted = await createMounted(actionModule.ArtifactActionButtons, {
    item,
    matrix,
    onEdit: (prepared) => dispatched.push(["edit", prepared]),
    onInsert: (prepared) => dispatched.push(["insert", prepared]),
    onReplace: (prepared) => dispatched.push(["replace", prepared]),
    onFullscreen: () => dispatched.push(["fullscreen"]),
    linkUrl: "https://example.com/action-source",
  });
  try {
    const button = (label) =>
      [...mounted.container.querySelectorAll("button, a")].find(
        (entry) => entry.textContent.trim() === label,
      );
    assert.equal(button("预览"), undefined);
    assert.equal(button("下载")?.getAttribute("type"), "button");
    assert.equal(button("收藏")?.getAttribute("aria-pressed"), "false");
    assert.equal(button("全屏")?.getAttribute("type"), "button");
    assert.equal(button("链接")?.getAttribute("href"), "https://example.com/action-source");
    const labels = [...mounted.container.querySelectorAll("button, a")]
      .map((entry) => entry.textContent.trim())
      .filter((label) =>
        ["编辑", "下载", "收藏", "全屏", "链接", "插入", "替换"].includes(label),
      );
    assert.deepEqual(labels, [
      "编辑",
      "下载",
      "收藏",
      "全屏",
      "链接",
      "插入",
      "替换",
    ]);

    for (const [label, action] of [
      ["编辑", "edit"],
      ["插入", "insert"],
      ["替换", "replace"],
    ]) {
      await click(button(label));
      await settle();
      assert.equal(dispatched.at(-1)[0], action);
      assert.equal(dispatched.at(-1)[1].preparedAction, action);
    }
    assert.deepEqual(globalThis.__artifactPreparedActions, [
      "edit",
      "insert",
      "replace",
    ]);
    await click(button("全屏"));
    await settle();
    assert.equal(dispatched.at(-1)[0], "fullscreen");
    await click(button("收藏"));
    await settle();
    assert.equal(button("已收藏")?.getAttribute("aria-pressed"), "true");
  } finally {
    await mounted.unmount();
  }

  const deniedArtifact = normalizeArtifactProjection(
    projection({
      id: "denied-actions",
      title: "Denied actions",
      editable: true,
      canRead: false,
      canPreview: false,
    }),
  );
  assert.ok(deniedArtifact);
  const deniedItem = artifactProjectionToLibraryItem(deniedArtifact);
  const deniedMatrix = actionModule.artifactActionMatrix(deniedItem, {
    hidePreview: true,
    insert: { visible: true, available: true, reason: "" },
    replace: { visible: true, available: true, reason: "" },
  });
  const denied = await createMounted(actionModule.ArtifactActionButtons, {
    item: deniedItem,
    matrix: deniedMatrix,
    onEdit: () => undefined,
    onInsert: () => undefined,
    onReplace: () => undefined,
  });
  try {
    assert.equal(denied.container.querySelectorAll("button").length, 0);
  } finally {
    await denied.unmount();
  }
});

test("Workspace card preview cannot bypass prepared Edit handoff", async () => {
  const artifact = normalizeArtifactProjection(
    projection({
      id: "workspace-edit",
      title: "Workspace edit",
      editable: true,
    }),
  );
  assert.ok(artifact);
  const item = artifactProjectionToLibraryItem(artifact);
  const opened = [];
  globalThis.__artifactPreparedActions = [];
  const mounted = await createMounted(RenderedWorkspaceLibrary, {
    entries: [artifactEntry(item)],
    onOpenItem: (prepared) => opened.push(prepared),
  });
  try {
    await click(
      mounted.container.querySelector(
        '[data-open-entry="Workspace edit"]',
      ),
    );
    await settle();
    assert.equal(opened.length, 0, "card click only opens preview detail");
    const edit = [...mounted.container.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === "编辑",
    );
    await click(edit);
    await settle();
    assert.deepEqual(globalThis.__artifactPreparedActions, ["edit"]);
    assert.equal(opened.length, 1);
    assert.equal(opened[0].preparedAction, "edit");
  } finally {
    await mounted.unmount();
  }
});

test("rendered shared editor host forwards typed source, target, strategy and CAS unchanged", async () => {
  const artifact = normalizeArtifactProjection(
    projection({ id: "host-source", title: "Host source", editable: true }),
  );
  assert.ok(artifact);
  const item = artifactProjectionToLibraryItem(artifact);
  const expectedCommand = {
    schema: "oceanleo.editor-command.v1",
    commandId: "host-insert-1",
    historyGroupId: "host-history-1",
    action: "insert",
    source: {
      artifactId: item.artifactId,
      revisionId: item.revisionId,
      artifactType: item.artifactType,
      sourceFormat: item.artifact.sourceFormat,
    },
    target: { documentId: "poster-document" },
    strategy: { mode: "insert-new-object" },
    expectedRevision: { targetRevisionId: "poster-r12" },
    cas: { expectedRevisionId: "poster-r12" },
  };
  let received = null;
  const adapter = {
    id: "rendered-host-adapter",
    actions: ["insert"],
    command: {
      version: 1,
      history: "editor-command",
      createCommand: () => expectedCommand,
      execute: (command, detachedItem, placement) => {
        received = { command, detachedItem, placement };
      },
    },
    accepts: () => true,
    mutate: () => {
      throw new Error("typed command was stripped into the legacy bridge");
    },
  };

  function RegisterAdapter() {
    materialProviderModule.useWorkbenchMaterialAdapter(adapter);
    return null;
  }
  function Trigger() {
    const context = materialProviderModule.useWorkbenchMaterials();
    return React.createElement(
      "button",
      {
        type: "button",
        "aria-label": "host-insert",
        onClick: () => {
          void context?.perform("insert", item, { source: "click" });
        },
      },
      "Insert",
    );
  }
  function Harness() {
    return React.createElement(
      materialProviderModule.WorkbenchMaterialProvider,
      { siteId: "image", appId: "poster" },
      React.createElement(RegisterAdapter),
      React.createElement(Trigger),
    );
  }

  globalThis.__artifactPreparedActions = [];
  const mounted = await createMounted(Harness, {});
  try {
    await settle();
    await click(
      mounted.container.querySelector('button[aria-label="host-insert"]'),
    );
    await settle();
    assert.ok(received);
    assert.deepEqual(received.command, expectedCommand);
    assert.notEqual(received.detachedItem, item);
    assert.deepEqual(received.placement, { source: "click" });
  } finally {
    await mounted.unmount();
  }
});

test("material shelf type filter is 货架 dropdown only on primary and more", async () => {
  const assertShelfOnly = (container) => {
    const shelf = container.querySelector('select[aria-label="货架"]');
    assert.ok(shelf);
    assert.ok(
      [...shelf.querySelectorAll("option")].some(
        (option) => option.textContent === "全部类型",
      ),
    );
    assert.equal(
      container.querySelector('[aria-label="素材分类"]'),
      null,
      "LibraryChips type pills must not appear on material library",
    );
  };

  globalThis.fetch = async () =>
    jsonResponse({
      contextId: "ctx:image:poster",
      items: [
        projection({
          id: "primary-image",
          title: "Primary image",
          artifactType: "single_file_image",
          editable: true,
        }),
        projection({
          id: "primary-doc",
          title: "Primary document",
          artifactType: "document",
          editable: true,
        }),
      ],
      next_cursor: null,
      total: 2,
    });
  const primary = await createMounted(MaterialLibrary, {
    materials: [],
    siteId: "image",
    appId: "poster",
    contextId: "ctx:image:poster",
  });
  try {
    await settle();
    assertShelfOnly(primary.container);
    assert.ok(
      primary.container.querySelector('[data-entry-title="Primary image"]'),
    );
    assert.ok(
      primary.container.querySelector('[data-entry-title="Primary document"]'),
    );
  } finally {
    await primary.unmount();
  }

  globalThis.fetch = async () =>
    jsonResponse({
      scope: "public",
      items: ARTIFACT_TYPES.map((artifactType) =>
        projection({
          id: `more-${artifactType}`,
          title: `More ${artifactType}`,
          visibility: "public",
          artifactType,
          editable: true,
        }),
      ),
      invalidCount: 0,
      nextOffset: null,
      total: ARTIFACT_TYPES.length,
    });
  const more = await createMounted(MaterialLibrary, {
    materials: [],
    siteId: "image",
    appId: "poster",
    contextId: "ctx:image:poster",
    initialLevel: "more",
    lockLevel: "more",
    fetchPrimary: false,
  });
  try {
    await settle();
    assertShelfOnly(more.container);
    assert.ok(
      more.container.querySelector(
        '[data-entry-title="More single_file_image"]',
      ),
    );
  } finally {
    await more.unmount();
  }
});
