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
  getArtifactEditDecision,
  getArtifactItem,
  listPrimaryArtifacts,
  searchArtifactLibrary,
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
const MaterialLibrary = (
  await import(
    await compileModule("src/shell/material-library-view.tsx", {
      "../i18n/ui/useUI": uiStubUrl,
      "./library-data": libraryDataUrl,
      "./artifact-contract": contractUrl,
      "./material-library-controller": materialControllerUrl,
      "./WorkspaceLibrary": workspaceLibraryStubUrl,
      "./WorkspaceSession": sessionStubUrl,
      "./workbench-material-registry": registryStubUrl,
    })
  )
).MaterialLibrary;

const actionClientStubUrl = dataModule(`
  export async function prepareArtifactForAction(action, item) {
    globalThis.__artifactPreparedActions.push(action);
    return { ok: true, data: { ...item, preparedAction: action } };
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
  pinnedRevisionId = "r1",
  canRead = true,
  canPreview = true,
  editable = false,
} = {}) {
  return {
    schema: "oceanleo.artifact.v1",
    artifact_id: id || "artifact-1",
    revision_id: "r1",
    artifact_type: "single_file_image",
    title: title || "Artifact",
    owner: {
      principal_id: "user-1",
      visibility: "private",
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
        revision_id: "r1",
        url: `https://signed.test/${id || "artifact-1"}.png`,
        format: "png",
      },
      ...(editable
        ? {
            source: {
              purpose: "source",
              revision_id: "r1",
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

test("artifact library requests match FastAPI aliases, bounds, empty-value, and offset contracts", async () => {
  const contextId = "00000000-0000-0000-0000-000000000001";
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.pathname === "/v1/library/primary") {
      return jsonResponse({ contextId, items: [] });
    }
    return jsonResponse({
      items: [],
      nextOffset: calls.length === 2 ? 100 : null,
      offset: Number(url.searchParams.get("offset") || 0),
      limit: Number(url.searchParams.get("limit") || 0),
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
  globalThis.fetch = async () => jsonResponse(responses.shift());

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

test("artifact detail and edit capability use canonical revisionId query aliases", async () => {
  const rawProjection = projection({
    id: "revision-contract",
    editable: true,
  });
  const normalized = normalizeArtifactProjection(rawProjection);
  assert.ok(normalized);
  const item = artifactProjectionToLibraryItem(normalized);
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    return url.pathname.endsWith("/edit-capability")
      ? jsonResponse({ available: true, item: rawProjection })
      : jsonResponse(rawProjection);
  };

  const detail = await getArtifactItem("revision-contract", "r1");
  const editDecision = await getArtifactEditDecision(item);

  assert.equal(detail.ok, true);
  assert.equal(editDecision.ok, true);
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
      items: [
        projection({ id: "exact", title: "Exact primary" }),
        projection({
          id: "wrong-context",
          title: "Wrong context",
          contextId: "ctx:image:other",
        }),
        projection({
          id: "unauthorized",
          title: "Unauthorized",
          canRead: false,
          canPreview: false,
        }),
      ],
      next_cursor: null,
      total: 3,
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
      mounted.container.querySelector('[data-entry-title="Wrong context"]'),
      null,
    );
    assert.equal(
      mounted.container.querySelector('[data-entry-title="Unauthorized"]'),
      null,
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
      contextId: "ctx:image:other",
      items: [projection({ id: "leaked", title: "Mismatched response" })],
      nextOffset: null,
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
    assert.match(
      mounted.container.querySelector("[data-empty-description]")
        ?.textContent || "",
      /缺少精确 contextId/,
    );
  } finally {
    await mounted.unmount();
  }
});

test("rendered More remains remote with Primary disabled and keeps legacy fallbacks live", async () => {
  const calls = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return jsonResponse({
      items: [projection({ id: "global", title: "Global More" })],
      nextOffset: null,
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
      mounted.container.querySelector('button[aria-label="打开完整素材库"]'),
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
        'button[aria-label="打开完整素材库"]',
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

test("rendered artifact actions keep Preview read-only and dispatch Edit/Insert/Replace", async () => {
  const artifact = normalizeArtifactProjection(
    projection({ id: "actions", title: "Action source", editable: true }),
  );
  assert.ok(artifact);
  const item = artifactProjectionToLibraryItem(artifact);
  const matrix = actionModule.artifactActionMatrix(item, {
    insert: { visible: true, available: true, reason: "" },
    replace: { visible: true, available: true, reason: "" },
  });
  const dispatched = [];
  globalThis.__artifactPreparedActions = [];
  const mounted = await createMounted(actionModule.ArtifactActionButtons, {
    item,
    matrix,
    onPreview: (prepared) => dispatched.push(["preview", prepared]),
    onEdit: (prepared) => dispatched.push(["edit", prepared]),
    onInsert: (prepared) => dispatched.push(["insert", prepared]),
    onReplace: (prepared) => dispatched.push(["replace", prepared]),
  });
  try {
    const button = (label) =>
      [...mounted.container.querySelectorAll("button")].find(
        (entry) => entry.textContent.trim() === label,
      );
    await click(button("预览"));
    await settle();
    assert.deepEqual(globalThis.__artifactPreparedActions, ["preview"]);
    assert.deepEqual(
      dispatched.map(([action]) => action),
      ["preview"],
    );

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
      "preview",
      "edit",
      "insert",
      "replace",
    ]);
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
    insert: { visible: true, available: true, reason: "" },
    replace: { visible: true, available: true, reason: "" },
  });
  const denied = await createMounted(actionModule.ArtifactActionButtons, {
    item: deniedItem,
    matrix: deniedMatrix,
    onPreview: () => undefined,
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
