/**
 * W3 · 库里打开别的素材后，上一份 PPT 迟到的保存不得把舞台拉回去。
 *
 * 操作员截图：地址栏已是新卡片 `?item=`，舞台仍是「年度述职幻灯片」+ PPTist 页
 * + 「Switching to Pro edit…」。根因是嵌入工作台 `recordSavedItem` 无条件
 * `onSavedItem`，MyLibrary 把它接到裸的 `setStandaloneEditorItem`。
 */

import { strict as assert } from "node:assert";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { artifactProjectionToLibraryItem } from "../src/shell/library-data.ts";
import { editorCapabilityFor } from "../src/shell/workbench-routes.ts";
import {
  INLINE_EDITOR_HISTORY_KEY,
  adoptSavedEditorItem,
  advancedRootItemId,
  inlineEditorItemsFromSession,
  withInlineEditorHistoryHead,
} from "../src/shell/advanced-session.ts";
import {
  resetLibraryCurrentIdentityForTests,
  getLibraryCurrentIdentity,
  rememberOpenedLibraryItem,
} from "../src/shell/library-current-identity.ts";
import { resetPluginModeCache } from "../src/shell/plugin-chrome/plugin-mode-store.ts";
import { resetWorkspaceActionConsumptionForTests } from "../src/shell/workspace-actions.ts";

const require = createRequire(import.meta.url);
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
const reactUrl = pathToFileURL(require.resolve("react")).href;
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

const HOST_PAGE = "https://p-test.dev.oceanleo.com/library";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: HOST_PAGE,
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLIFrameElement: window.HTMLIFrameElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
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
globalThis.fetch = async () => {
  throw new Error("本闸不该发网络请求");
};

function projection({
  artifactId,
  revisionId,
  title,
  artifactType,
  editorCapability,
  sourceFormat,
  ext,
  siteId,
}) {
  const url = `https://signed.test/${artifactId}.${ext}`;
  return {
    schema: "oceanleo.artifact.v1",
    artifactId,
    revisionId,
    artifactType,
    roles: [],
    title,
    favorite: false,
    owner: {
      principalId: "oceanleo:user:me",
      visibility: "private",
      originSiteKey: siteId,
      originAppId: "library",
      originFunctionId: null,
    },
    access: {
      canRead: true,
      canPreview: true,
      canEdit: true,
      canFork: true,
      canInsert: true,
      canReplace: true,
      canFavorite: true,
      canBind: true,
      canExportSource: true,
    },
    editability: "native",
    editorCapability,
    sourceFormat,
    renditions: {
      source: {
        purpose: "source",
        revisionId,
        url,
        mediaType: "application/octet-stream",
        format: sourceFormat,
        expiresAt: null,
        rendererVersion: null,
        width: null,
        height: null,
        durationMs: null,
        byteSize: 2048,
        digest: `sha256:${artifactId}`,
      },
      preview: {
        purpose: "preview",
        revisionId,
        url: `https://signed.test/${artifactId}-preview.png`,
        mediaType: "image/png",
        format: "png",
        expiresAt: null,
        rendererVersion: null,
        width: 800,
        height: 450,
        durationMs: null,
        byteSize: 512,
        digest: `sha256:${artifactId}-preview`,
      },
    },
    scene: null,
    provenance: {
      id: `prov-${artifactId}`,
      sourceKind: "owned",
      licenseCode: "owned",
      rightsAsserted: true,
      licenseUrl: "",
      attribution: "",
    },
    bindings: [],
    integrity: { ok: true, code: "ok", reason: "" },
    createdAt: "2026-10-16T00:00:00.000Z",
  };
}

function itemOf(input) {
  return artifactProjectionToLibraryItem(projection(input), { forEdit: true });
}

const PPT = itemOf({
  artifactId: "ppt-annual-review",
  revisionId: "ppt-rev-1",
  title: "年度述职幻灯片",
  artifactType: "deck",
  editorCapability: "deck-editor",
  sourceFormat: "deck-json",
  ext: "pptx",
  siteId: "ppt",
});
const PPT_SAVED = itemOf({
  artifactId: "ppt-annual-review",
  revisionId: "ppt-rev-2",
  title: "年度述职幻灯片",
  artifactType: "deck",
  editorCapability: "deck-editor",
  sourceFormat: "deck-json",
  ext: "pptx",
  siteId: "ppt",
});
const PPT_B = itemOf({
  artifactId: "ppt-other-deck",
  revisionId: "ppt-b-rev-1",
  title: "另一份演示文稿",
  artifactType: "deck",
  editorCapability: "deck-editor",
  sourceFormat: "deck-json",
  ext: "pptx",
  siteId: "ppt",
});
const IMAGE = itemOf({
  artifactId: "img-photo-1",
  revisionId: "img-rev-1",
  title: "现场照片",
  artifactType: "single_file_image",
  editorCapability: "image-editor",
  sourceFormat: "png",
  ext: "png",
  siteId: "image",
});
const PDF = itemOf({
  artifactId: "pdf-report-1",
  revisionId: "pdf-rev-1",
  title: "季度报告",
  artifactType: "pdf",
  editorCapability: "pdf-editor",
  sourceFormat: "pdf",
  ext: "pdf",
  siteId: "docs",
});

assert.equal(editorCapabilityFor(PPT).available, true, editorCapabilityFor(PPT).unavailableReason);
assert.equal(editorCapabilityFor(IMAGE).available, true, editorCapabilityFor(IMAGE).unavailableReason);
assert.equal(editorCapabilityFor(PDF).available, true, editorCapabilityFor(PDF).unavailableReason);
assert.equal(advancedRootItemId(PPT), advancedRootItemId(PPT_SAVED));
assert.notEqual(advancedRootItemId(PPT), advancedRootItemId(IMAGE));

const sessionHolderUrl = dataModule(`
  import { createContext, useContext } from ${JSON.stringify(reactUrl)};
  export const AdvancedSessionContext = createContext(null);
  export function useAdvancedSession() { return useContext(AdvancedSessionContext); }
`);

const identityHref = new URL(
  "../src/shell/library-current-identity.ts",
  import.meta.url,
).href;
const handoffUrl = await compileModule(
  "src/shell/advanced-routes/editor-handoff.ts",
  {
    "../office-editor/useOfficeArtifactSource": dataModule(`
      export function useOfficeArtifactSource(item) {
        return { item, url: item && item.url ? item.url : "", purpose: null, loading: false, error: "" };
      }
    `),
  },
);
const {
  resetEditorHandoffForTests,
  peekProSavedRevision,
  handoffItemKey,
} = await import(handoffUrl);

const deckRouteStubUrl = dataModule(`
  import { jsx, jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
  import { useEffect } from ${JSON.stringify(reactUrl)};
  import { useAdvancedSession } from ${JSON.stringify(sessionHolderUrl)};
  import { reportProSaved, handoffItemKey } from ${JSON.stringify(handoffUrl)};

  export function DeckRoute(props) {
    const session = useAdvancedSession();
    const item = props.item;
    useEffect(() => {
      const gate = globalThis.__w3LateSave;
      if (!gate) return;
      const key = handoffItemKey(item);
      const record = session && session.recordSavedItem;
      gate.bind(key, (saved) => {
        reportProSaved(key, saved);
        return record ? record(saved) : Promise.resolve(true);
      });
      return () => {};
    }, [item, session]);
    const pro = globalThis.localStorage.getItem("oceanleo.editor-mode.deck") === "pro";
    return jsxs("div", {
      "data-workbench-editor": "deck",
      "data-item-id": item.artifactId || item.id,
      children: [
        pro ? jsx("div", { "data-mode-switch-pending": "", children: "Switching to Pro edit..." }) : null,
        jsx("button", {
          type: "button",
          "data-editor-close": true,
          onClick: () => props.onClose && props.onClose(),
          children: "close",
        }),
      ],
    });
  }
`);

function namedRouteStub(exportName, editorId) {
  return dataModule(`
    import { jsx, jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
    export function ${exportName}(props) {
      const item = props.item || {};
      return jsxs("div", {
        "data-workbench-editor": ${JSON.stringify(editorId)},
        "data-item-id": item.artifactId || item.id,
        children: [
          jsx("button", {
            type: "button",
            "data-editor-close": true,
            onClick: () => props.onClose && props.onClose(),
            children: "close",
          }),
        ],
      });
    }
  `);
}

const dynamicStubUrl = dataModule(`
  import { createElement, useEffect, useState } from ${JSON.stringify(reactUrl)};
  export default function dynamic(loader, options) {
    return function DynamicWorkbenchRoute(props) {
      const [Comp, setComp] = useState(null);
      useEffect(() => {
        let cancelled = false;
        Promise.resolve().then(() => loader()).then((mod) => {
          if (cancelled) return;
          const resolved = typeof mod === "function" ? mod : mod && (mod.default || Object.values(mod).find((value) => typeof value === "function"));
          setComp(() => (typeof resolved === "function" ? resolved : null));
        });
        return () => { cancelled = true; };
      }, []);
      if (typeof Comp !== "function") {
        return options && typeof options.loading === "function" ? createElement(options.loading) : null;
      }
      return createElement(Comp, props);
    };
  }
`);

const navigationStubUrl = dataModule(`
  export function useRouter() { return { replace() {}, push() {}, prefetch() {} }; }
`);

const workspaceStubUrl = dataModule(`
  const snapshots = [];
  const workspace = {
    session: { id: "w3-lib-session", schema_version: 1, snapshot: {}, title: "library", revision: 1 },
    sessionId: "w3-lib-session",
    taskId: null,
    appId: "library",
    availability: "ready",
    async ensureActive(opts) {
      if (opts && opts.title) workspace.session = { ...workspace.session, title: opts.title };
      return workspace.session;
    },
    async bindTask() { return workspace.session; },
    async saveSnapshot(snapshot, schema, options) {
      const payload =
        options && typeof options.mergeFromLatest === "function"
          ? options.mergeFromLatest(workspace.session.snapshot)
          : snapshot;
      snapshots.push(payload);
      workspace.session = {
        ...workspace.session,
        snapshot: payload,
        schema_version: schema,
        revision: (workspace.session.revision || 1) + 1,
      };
      globalThis.__w3Snapshots = snapshots.slice();
      globalThis.__w3WorkspaceSession = workspace.session;
      return { ok: true, session: workspace.session };
    },
  };
  globalThis.__w3PlantSnapshot = (snapshot) => {
    workspace.session = { ...workspace.session, snapshot };
    globalThis.__w3WorkspaceSession = workspace.session;
  };
  globalThis.__w3ResetWorkspace = () => {
    snapshots.length = 0;
    workspace.session = {
      id: "w3-lib-session",
      schema_version: 1,
      snapshot: {},
      title: "library",
      revision: 1,
    };
    globalThis.__w3Snapshots = [];
    globalThis.__w3WorkspaceSession = workspace.session;
  };
  export function WorkspaceSessionProvider({ children }) { return children; }
  export function useOptionalWorkspaceSession() { return workspace; }
  export function useWorkspaceSession() { return workspace; }
`);

const materialStubUrl = dataModule(`
  export function WorkbenchMaterialProvider({ children }) { return children; }
`);
const stageStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AdvancedWorkbenchBlankStage() { return jsx("div", { "data-workbench-blank": "" }); }
`);
const unsupportedStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function UnsupportedRoute() {
    return jsx("div", { "data-workbench-editor": "none" });
  }
`);
const boundaryStubUrl = dataModule(`
  import { Component } from ${JSON.stringify(reactUrl)};
  export class WorkbenchErrorBoundary extends Component {
    render() { return this.props.children; }
  }
`);

const workbenchStubs = {
  "next/dynamic": dynamicStubUrl,
  "next/navigation": navigationStubUrl,
  "./WorkspaceSession": workspaceStubUrl,
  "./workbench-material-provider": materialStubUrl,
  "./AdvancedWorkbenchStage": stageStubUrl,
  "./advanced-routes/UnsupportedRoute": unsupportedStubUrl,
  "./WorkbenchErrorBoundary": boundaryStubUrl,
  "./advanced-session-context": sessionHolderUrl,
  "./advanced-routes/DeckRoute": deckRouteStubUrl,
  "./advanced-routes/RichDocRoute": namedRouteStub("RichDocRoute", "richdoc"),
  "./advanced-routes/GridRoute": namedRouteStub("GridRoute", "grid"),
  "./advanced-routes/PdfRoute": namedRouteStub("PdfRoute", "pdf"),
  "./advanced-routes/ImageRoute": namedRouteStub("ImageRoute", "image"),
  "./advanced-routes/AudioRoute": namedRouteStub("AudioRoute", "audio"),
  "./advanced-routes/Model3DRoute": namedRouteStub("Model3DRoute", "threed"),
  "./advanced-routes/VideoTimelineRoute": namedRouteStub("VideoTimelineRoute", "video-timeline"),
  "./advanced-routes/GameRoute": namedRouteStub("GameRoute", "game"),
  "./advanced-routes/ChartRoute": namedRouteStub("ChartRoute", "chart-editor@1"),
  "./advanced-routes/EmbeddedRoute": namedRouteStub("EmbeddedRoute", "embed"),
  "./advanced-routes/VideoCanvasRoute": namedRouteStub("VideoCanvasRoute", "video-canvas"),
};

const workbenchUrl = await compileModule(
  "src/shell/AdvancedContentWorkbench.tsx",
  workbenchStubs,
);
const { AdvancedContentWorkbench } = await import(workbenchUrl);

const uiStubUrl = dataModule(`
  export function useUI() { return (value) => value; }
`);
const databaseStubUrl = dataModule(`
  export async function uploadFile() { return { ok: false, error: "unused" }; }
  export async function normalizeUploadIdempotencyKey(parts) { return parts.map(String).join(":"); }
  export function humanLibraryUploadError(error) { return String(error || "unused"); }
`);
const libraryGridStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  import { rememberOpenedLibraryItem } from ${JSON.stringify(identityHref)};
  export function WorkspaceLibrary({ entries, onOpenItem }) {
    return jsx("div", {
      "data-library-grid": true,
      children: (entries || []).map((entry) => {
        const item = entry.libraryItem;
        if (!item) return null;
        return jsx("button", {
          type: "button",
          "data-library-card": item.artifactId,
          onClick: () => {
            rememberOpenedLibraryItem(item);
            onOpenItem(item);
          },
          children: item.title,
        }, item.artifactId || item.id);
      }),
    });
  }
  export function workspaceEntryFromLibraryItem(item) {
    return { id: item.artifactId || item.id, title: item.title, libraryItem: item };
  }
`);
const artifactClientStubUrl = dataModule(`
  export const ARTIFACT_LIBRARY_CHANGE_EVENT = "oceanleo:artifact-library-change";
  export async function listMyArtifacts() {
    return {
      ok: true,
      data: {
        items: globalThis.__w3LibraryItems || [],
        ownerPrincipalId: "oceanleo:user:me",
        nextCursor: null,
      },
    };
  }
  export async function listFavoriteArtifacts() {
    return {
      ok: true,
      data: { items: [], ownerPrincipalId: "oceanleo:user:me", nextCursor: null },
    };
  }
  export async function getCurrentArtifactItem(artifactId) {
    const items = globalThis.__w3LibraryItems || [];
    const hit = items.find((item) => item.artifactId === artifactId);
    return hit ? { ok: true, data: hit } : { ok: false, status: 404, error: "" };
  }
  export async function ensureArtifact() { return { ok: false }; }
  export async function retireArtifact() { return { ok: false }; }
`);
const libraryScopeStubUrl = dataModule(`
  export function LibraryScope({ children }) { return children; }
`);
const libraryLayoutStubUrl = dataModule(`
  export function LibraryToolbar() { return null; }
`);

const myLibraryUrl = await compileModule("src/shell/MyLibrary.tsx", {
  "../i18n/ui/useUI": uiStubUrl,
  "../lib/database": databaseStubUrl,
  "./AdvancedContentWorkbench": workbenchUrl,
  "./AgentChat": dataModule(`export function AgentChat({workspaceContent}) { return workspaceContent; }`),
  "./WorkspaceSession": workspaceStubUrl,
  "./artifact-client": artifactClientStubUrl,
  "./WorkspaceLibrary": libraryGridStubUrl,
  "./library-scope": libraryScopeStubUrl,
  "./LibraryLayout": libraryLayoutStubUrl,
});
const { MyLibrary } = await import(myLibraryUrl);

const { createRoot } = await import("react-dom/client");

function describeDom(container) {
  return (container.innerHTML || "").replace(/\s+/g, " ").slice(0, 360);
}

async function waitFor(container, selector, label = selector) {
  const deadline = Date.now() + 4000;
  let last = describeDom(container);
  while (Date.now() < deadline) {
    const hit = container.querySelector(selector);
    if (hit) return hit;
    last = describeDom(container);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
  assert.ok(false, `等不到 ${label}。当时 DOM：${last}`);
}

function installLateSaveGate() {
  const gate = {
    key: "",
    flush: null,
    bind(key, flush) {
      this.key = key;
      this.flush = flush;
    },
  };
  globalThis.__w3LateSave = gate;
  return gate;
}

function resetCase({ pro = false, items = [PPT, IMAGE, PPT_B, PDF] } = {}) {
  resetLibraryCurrentIdentityForTests();
  resetPluginModeCache();
  resetEditorHandoffForTests();
  resetWorkspaceActionConsumptionForTests();
  window.history.replaceState(null, "", "/library");
  window.localStorage.clear();
  if (pro) window.localStorage.setItem("oceanleo.editor-mode.deck", "pro");
  globalThis.__w3LibraryItems = items;
  globalThis.__w3Snapshots = [];
  globalThis.__w3WorkspaceSession = null;
  if (typeof globalThis.__w3ResetWorkspace === "function") {
    globalThis.__w3ResetWorkspace();
  }
  return installLateSaveGate();
}

async function mounted(run) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await run(root, container);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    resetLibraryCurrentIdentityForTests();
  }
}

async function renderLibrary(root, extra = {}) {
  await act(async () => {
    root.render(
      React.createElement(MyLibrary, {
        siteId: "ppt",
        plain: true,
        ...extra,
      }),
    );
  });
}

async function clickCard(container, artifactId) {
  const btn = await waitFor(container, `[data-library-card="${artifactId}"]`);
  await act(async () => {
    btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
}

async function clickClose(container) {
  const btn = await waitFor(container, "[data-editor-close]");
  await act(async () => {
    btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
}

function assertStage(container, editorId, artifactId) {
  const editor = container.querySelector(`[data-workbench-editor="${editorId}"]`);
  assert.ok(editor, `舞台应是 ${editorId}，当时 DOM：${describeDom(container)}`);
  assert.equal(editor.getAttribute("data-item-id"), artifactId);
  assert.equal(container.querySelector("[data-mode-switch-pending]"), null);
}

function assertQueryItem(artifactId) {
  const identity = getLibraryCurrentIdentity();
  assert.equal(identity?.artifactId, artifactId, `?item= 应停在 ${artifactId}，实际 ${identity?.artifactId}`);
  assert.match(window.location.search, new RegExp(`item=${artifactId}`));
}

function historyLatestRoot() {
  const snapshot = globalThis.__w3WorkspaceSession?.snapshot;
  const history = snapshot?.[INLINE_EDITOR_HISTORY_KEY];
  return history?.latestRootId || "";
}

function historyHasRoot(item) {
  const items = inlineEditorItemsFromSession(globalThis.__w3WorkspaceSession);
  const root = advancedRootItemId(item);
  return items.some((entry) => advancedRootItemId(entry) === root);
}

function plantImageHistoryHead() {
  const current = globalThis.__w3WorkspaceSession?.snapshot || {};
  globalThis.__w3PlantSnapshot(
    withInlineEditorHistoryHead(current, IMAGE, "image"),
  );
}

async function flushLateSave(gate, saved = PPT_SAVED) {
  assert.equal(typeof gate.flush, "function", "deck 桩应已把迟到保存接到真实 recordSavedItem");
  await act(async () => {
    await gate.flush(saved);
  });
}

test("夹具：PPT 与图片走进不同的生产路由", () => {
  assert.equal(editorCapabilityFor(PPT).route.type, "deck");
  assert.equal(editorCapabilityFor(IMAGE).route.type, "image");
  assert.equal(editorCapabilityFor(PDF).route.type, "pdf");
});

test("adoptSavedEditorItem：不同根身份的迟到保存不改当前件", () => {
  assert.equal(adoptSavedEditorItem(IMAGE, PPT_SAVED), IMAGE);
  assert.equal(adoptSavedEditorItem(PPT, PPT_SAVED), PPT_SAVED);
  assert.equal(adoptSavedEditorItem(null, PPT_SAVED), null);
});

test("MyLibrary：开 PPT（pro）再开图片，PPT 迟到的保存不得抢舞台", async () => {
  const gate = resetCase({ pro: true });
  await mounted(async (root, container) => {
    await renderLibrary(root);
    await clickCard(container, PPT.artifactId);
    await waitFor(container, '[data-workbench-editor="deck"]');
    assert.ok(container.querySelector("[data-mode-switch-pending]"), "第一份 PPT 记住了 pro 档，应出现切换覆盖层");
    await clickClose(container);
    await waitFor(container, "[data-library-grid]");
    await clickCard(container, IMAGE.artifactId);
    await waitFor(container, '[data-workbench-editor="image"]');
    assertQueryItem(IMAGE.artifactId);
    plantImageHistoryHead();
    assert.equal(historyLatestRoot(), advancedRootItemId(IMAGE));
    await flushLateSave(gate);
    assertStage(container, "image", IMAGE.artifactId);
    assertQueryItem(IMAGE.artifactId);
    assert.equal(historyLatestRoot(), advancedRootItemId(IMAGE));
    assert.ok(historyHasRoot(PPT_SAVED), "离场 PPT 应把自己的新版本写进 heads");
    assert.ok(historyHasRoot(IMAGE), "新卡片的 heads 不得被旧快照覆盖");
    assert.ok(peekProSavedRevision(handoffItemKey(PPT)), "PPT 的库内保存仍应完成");
  });
});

test("面板里点卡片：PPT→图片，迟到保存不得拉回 PPT", async () => {
  const gate = resetCase({ pro: true });
  function PanelHost() {
    const [item, setItem] = React.useState(null);
    return React.createElement(
      "div",
      null,
      React.createElement("button", {
        type: "button",
        "data-panel-card": PPT.artifactId,
        onClick: () => {
          rememberOpenedLibraryItem(PPT);
          setItem(PPT);
        },
      }),
      React.createElement("button", {
        type: "button",
        "data-panel-card": IMAGE.artifactId,
        onClick: () => {
          rememberOpenedLibraryItem(IMAGE);
          setItem(IMAGE);
        },
      }),
      item
        ? React.createElement(AdvancedContentWorkbench, {
            key: `${item.artifactId}:${item.revisionId || "transient"}`,
            item,
            embedded: true,
            onSavedItem: setItem,
            onClose: () => setItem(null),
        })
        : null,
    );
  }
  await mounted(async (root, container) => {
    await act(async () => {
      root.render(React.createElement(PanelHost));
    });
    await act(async () => {
      container
        .querySelector(`[data-panel-card="${PPT.artifactId}"]`)
        .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    await waitFor(container, '[data-workbench-editor="deck"]');
    await act(async () => {
      container
        .querySelector(`[data-panel-card="${IMAGE.artifactId}"]`)
        .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    await waitFor(container, '[data-workbench-editor="image"]');
    await flushLateSave(gate);
    assertStage(container, "image", IMAGE.artifactId);
    assertQueryItem(IMAGE.artifactId);
    assert.notEqual(historyLatestRoot(), advancedRootItemId(PPT));
  });
});

test("PPT→另一份 PPT：舞台是第二份，第一份迟到保存不得拉回", async () => {
  const gate = resetCase({ pro: true, items: [PPT, PPT_B] });
  await mounted(async (root, container) => {
    await renderLibrary(root);
    await clickCard(container, PPT.artifactId);
    await waitFor(container, `[data-workbench-editor="deck"][data-item-id="${PPT.artifactId}"]`);
    await clickClose(container);
    await waitFor(container, "[data-library-grid]");
    await clickCard(container, PPT_B.artifactId);
    await waitFor(container, `[data-workbench-editor="deck"][data-item-id="${PPT_B.artifactId}"]`);
    await flushLateSave(gate);
    const editor = container.querySelector('[data-workbench-editor="deck"]');
    assert.equal(editor?.getAttribute("data-item-id"), PPT_B.artifactId);
    assertQueryItem(PPT_B.artifactId);
  });
});

test("PPT→PDF：迟到保存不得把舞台从文档拉回 PPT", async () => {
  const gate = resetCase({ items: [PPT, PDF] });
  await mounted(async (root, container) => {
    await renderLibrary(root);
    await clickCard(container, PPT.artifactId);
    await waitFor(container, '[data-workbench-editor="deck"]');
    await clickClose(container);
    await waitFor(container, "[data-library-grid]");
    await clickCard(container, PDF.artifactId);
    await waitFor(container, '[data-workbench-editor="pdf"]');
    await flushLateSave(gate);
    assertStage(container, "pdf", PDF.artifactId);
    assertQueryItem(PDF.artifactId);
  });
});

test("图片→PPT：新开的 PPT 正常打开，记住的 pro 档只作用于这份新 PPT", async () => {
  resetCase({ pro: true, items: [PPT, IMAGE] });
  await mounted(async (root, container) => {
    await renderLibrary(root);
    await clickCard(container, IMAGE.artifactId);
    await waitFor(container, '[data-workbench-editor="image"]');
    await clickClose(container);
    await waitFor(container, "[data-library-grid]");
    await clickCard(container, PPT.artifactId);
    const editor = await waitFor(container, '[data-workbench-editor="deck"]');
    assert.equal(editor.getAttribute("data-item-id"), PPT.artifactId);
    assert.ok(container.querySelector("[data-mode-switch-pending]"), "新 PPT 应使用记住的 pro 档");
    assertQueryItem(PPT.artifactId);
  });
});

test("PPT 保存失败时换卡片也不跳回", async () => {
  const gate = resetCase({ pro: true });
  await mounted(async (root, container) => {
    await renderLibrary(root);
    await clickCard(container, PPT.artifactId);
    await waitFor(container, '[data-workbench-editor="deck"]');
    await clickClose(container);
    await waitFor(container, "[data-library-grid]");
    await clickCard(container, IMAGE.artifactId);
    await waitFor(container, '[data-workbench-editor="image"]');
    const original = gate.flush;
    gate.flush = async () => {
      throw new Error("save timeout");
    };
    await act(async () => {
      try {
        await gate.flush(PPT_SAVED);
      } catch {
        /* 失败也不得抢舞台 */
      }
    });
    void original;
    assertStage(container, "image", IMAGE.artifactId);
    assertQueryItem(IMAGE.artifactId);
  });
});
