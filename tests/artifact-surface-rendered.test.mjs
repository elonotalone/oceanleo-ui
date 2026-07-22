import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import ts from "typescript";

import {
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
  createArtifactRevision,
  ensureArtifact,
  getArtifactEditDecision,
  getArtifactDownload,
  getArtifactItem,
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
            { key: entry.id, "data-entry-title": entry.title },
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
const materialControllerUrl = await compileModule(
  "src/shell/material-library-controller.ts",
  {
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
const MyLibrary = (
  await import(
    await compileModule("src/shell/MyLibrary.tsx", {
      "../i18n/ui/useUI": uiStubUrl,
      "../lib/database": databaseStubUrl,
      "./artifact-client": artifactClientUrl,
      "./library-data": libraryDataUrl,
      "./WorkspaceLibrary": workspaceLibraryStubUrl,
    })
  )
).MyLibrary;

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
const actionModule = await import(
  await compileModule("src/shell/ArtifactActions.tsx", {
    "../i18n/ui/useUI": uiStubUrl,
    "./artifact-contract": contractUrl,
    "./artifact-client": actionClientStubUrl,
    "./library-data": libraryDataUrl,
    "./workbench-routes": routesStubUrl,
  }),
);

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
} = {}) {
  return {
    schema: "oceanleo.artifact.v1",
    artifact_id: id || "artifact-1",
    revision_id: revisionId,
    artifact_type: "single_file_image",
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
    editability: editable ? "bounded" : "view_only",
    editor_capability: editable ? "image-editor" : null,
    source_format: "png",
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
              url: `https://signed.test/${id || "artifact-1"}-source.png`,
              format: "png",
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
    return jsonResponse(ensuredProjection);
  };

  const ensured = await ensureArtifact(transient);
  assert.equal(ensured.ok, true);
  assert.equal(ensured.data?.artifactId, "ensured-upload");
  const download = await getArtifactDownload(ensured.data);
  assert.equal(download.ok, true);
  assert.equal(download.data?.artifactId, "ensured-upload");
  assert.equal(download.data?.revisionId, "r1");

  ensureMismatch = true;
  const rejected = await ensureArtifact({
    ...transient,
    idempotencyKey: "upload-key-2",
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "transient-persistence-failed");
  assert.match(rejected.error || "", /receipt/);
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

test("rendered Primary is exact, ACL-safe, and rejects mismatched response context", async () => {
  const calls = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return jsonResponse({
      contextId: "ctx:image:poster",
      items: [projection({ id: "exact", title: "Exact primary" })],
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
    }),
  );
  assert.ok(localDeniedArtifact);
  const mounted = await createMounted(MaterialLibrary, {
    materials: [
      {
        id: "local-unauthorized",
        title: "Local unauthorized",
        thumb: "https://signed.test/local-unauthorized.png",
        libraryItem: artifactProjectionToLibraryItem(localDeniedArtifact),
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
        projection({ id: "exact", title: "Exact primary" }),
        projection({
          id: "wrong-context",
          title: "Wrong context",
          contextId: "ctx:image:other",
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
      items: [projection({ id: "leaked", title: "Mismatched response" })],
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

test("rendered primary keeps non-durable site picks visible as 本站精选", async () => {
  globalThis.fetch = async () =>
    jsonResponse({
      contextId: "olctx:v1:image:app:poster",
      items: [
        projection({
          id: "exact",
          title: "Exact primary",
          contextId: "olctx:v1:image:app:poster",
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
    assert.ok(
      mounted.container.querySelector(
        '[data-entry-title="Site pick poster"]',
      ),
    );
  } finally {
    await mounted.unmount();
  }

  // Even with no context at all, curated site materials stay visible.
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
    assert.ok(
      noContext.container.querySelector(
        '[data-entry-title="Contextless site pick"]',
      ),
    );
  } finally {
    await noContext.unmount();
  }
});

test("rendered My Library is owner-scoped and dedupes cross-site durable identity", async () => {
  const calls = [];
  const owned = projection({
    id: "shared-owned",
    title: "Owned across sites",
    ownerPrincipalId: "owner-a",
  });
  globalThis.fetch = async (input) => {
    calls.push(new URL(String(input)));
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
    assert.equal(calls.length, 1);
    assert.equal(calls[0].pathname, "/v1/library/mine");
    assert.equal(
      mounted.container.querySelectorAll(
        '[data-entry-title="Owned across sites"]',
      ).length,
      1,
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
    globalThis.fetch = async () => jsonResponse(payload, status);
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

test("rendered More remains remote with Primary disabled and keeps legacy fallbacks live", async () => {
  const calls = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return jsonResponse({
      scope: "public",
      items: [
        projection({
          id: "global",
          title: "Global More",
          visibility: "public",
        }),
      ],
      nextOffset: null,
      total: 1,
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
    assert.match(calls[0], /\/v1\/library\/search\?/);
    assert.ok(
      mounted.container.querySelector('[data-entry-title="Global More"]'),
    );
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
