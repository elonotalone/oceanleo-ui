/**
 * W3b · 身份还停在 Y 时，新的打开请求 X 必须打开 X，不能当旧动作丢掉。
 *
 * `32a91cee` 用「动作 itemId ≠ 当前身份」当闸。当前身份是模块级变量、除测试外
 * 从不清空，于是聊天气泡 / 预览&编辑深链指名 X 时会被吞掉，人被留在 Y。
 */

import { strict as assert } from "node:assert";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  getLibraryCurrentIdentity,
  resetLibraryCurrentIdentityForTests,
  setLibraryCurrentIdentity,
} from "../src/shell/library-current-identity.ts";
import { useLibraryEditIntent } from "../src/shell/library-edit-intent.ts";
import { resetWorkspaceActionConsumptionForTests } from "../src/shell/workspace-actions.ts";
import { workspaceEntryFromLibraryItem } from "../src/shell/workspace-library-model.ts";

const require = createRequire(import.meta.url);
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
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

const { createRoot } = await import("react-dom/client");

function durable(artifactId, title) {
  const revisionId = `${artifactId}-rev`;
  return {
    key: `artifact:${artifactId}:${revisionId}`,
    source: "artifact",
    id: artifactId,
    artifactId,
    revisionId,
    artifactType: "single_file_image",
    title,
    kind: "image",
    siteId: "image",
    url: `https://signed.test/${artifactId}.png`,
    previewUrl: `https://signed.test/${artifactId}.png`,
    favorite: false,
    meta: {},
    artifact: {
      artifactId,
      revisionId,
      artifactType: "single_file_image",
      title,
    },
  };
}

const ITEM_Y = durable("item-y", "先打开的 Y");
const ITEM_X = durable("item-x", "后来指名的 X");

function envelope(itemId, nonce, intent = "edit") {
  return {
    nonce,
    action: {
      version: 1,
      tab: "mine",
      itemId,
      intent,
    },
  };
}

function resetCase() {
  resetLibraryCurrentIdentityForTests();
  resetWorkspaceActionConsumptionForTests();
  setLibraryCurrentIdentity({ artifactId: ITEM_Y.artifactId, entryId: "" });
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
    resetWorkspaceActionConsumptionForTests();
  }
}

test("身份为 Y 时，编辑意图 X 必须打开 X，身份变成 X", async () => {
  resetCase();
  const opened = [];
  const previewed = [];
  function Host() {
    useLibraryEditIntent({
      action: envelope(ITEM_X.artifactId, "edit-x-while-y", "edit"),
      items: [ITEM_Y, ITEM_X],
      onOpenItem: (item) => opened.push(item.artifactId),
      onPreviewItem: (item) => previewed.push(item.artifactId),
      onFailure: () => {},
    });
    return null;
  }
  await mounted(async (root) => {
    await act(async () => {
      root.render(React.createElement(Host));
    });
    await act(async () => {});
    assert.deepEqual(opened, [ITEM_X.artifactId], "新编辑意图不得被 Y 身份吞掉");
    assert.deepEqual(previewed, []);
    assert.equal(getLibraryCurrentIdentity()?.artifactId, ITEM_X.artifactId);
  });
});

test("身份为 Y 时，预览意图 X 必须预览 X，身份变成 X", async () => {
  resetCase();
  const opened = [];
  const previewed = [];
  function Host() {
    useLibraryEditIntent({
      action: envelope(ITEM_X.artifactId, "preview-x-while-y", "open"),
      items: [ITEM_Y, ITEM_X],
      onOpenItem: (item) => opened.push(item.artifactId),
      onPreviewItem: (item) => previewed.push(item.artifactId),
      onFailure: () => {},
    });
    return null;
  }
  await mounted(async (root) => {
    await act(async () => {
      root.render(React.createElement(Host));
    });
    await act(async () => {});
    assert.deepEqual(previewed, [ITEM_X.artifactId]);
    assert.deepEqual(opened, []);
    assert.equal(getLibraryCurrentIdentity()?.artifactId, ITEM_X.artifactId);
  });
});

test("同一条编辑意图重渲染不得再打开一次", async () => {
  resetCase();
  const opened = [];
  const action = envelope(ITEM_X.artifactId, "edit-x-once", "edit");
  let restoreGeneration = 0;
  function Host() {
    useLibraryEditIntent({
      action,
      items: [ITEM_Y, ITEM_X],
      restoreGeneration,
      onOpenItem: (item) => opened.push(item.artifactId),
      onFailure: () => {},
    });
    return null;
  }
  await mounted(async (root) => {
    await act(async () => {
      root.render(React.createElement(Host));
    });
    restoreGeneration = 1;
    await act(async () => {
      root.render(React.createElement(Host));
    });
    await act(async () => {});
  });
  assert.deepEqual(opened, [ITEM_X.artifactId]);
});

test("bare ?item 在列表未载入该素材时独立读取并走只读预览", async () => {
  const requested = [];
  const identityWrites = [];
  const identityStub = dataModule(`
    export function libraryCurrentIdentityFromSearch(search) {
      const params = new URLSearchParams(String(search || "").replace(/^\\?/, ""));
      const artifactId = (params.get("item") || "").trim();
      return artifactId ? { artifactId, entryId: "" } : null;
    }
    export function setLibraryCurrentIdentity(identity) {
      globalThis.__libraryIdentityWrites.push(identity);
    }
  `);
  globalThis.__libraryIdentityWrites = identityWrites;
  const standaloneIntent = await import(
    await compileModule("src/shell/library-edit-intent.ts", {
      "./artifact-client": dataModule(`
        export async function getCurrentArtifactItem(artifactId) {
          globalThis.__libraryDetailRequests.push(artifactId);
          return { ok: true, data: globalThis.__libraryDetailItem };
        }
      `),
      "./library-current-identity": identityStub,
    })
  );
  globalThis.__libraryDetailRequests = requested;
  globalThis.__libraryDetailItem = ITEM_X;
  window.history.replaceState({}, "", `/library?item=${ITEM_X.artifactId}`);
  const previewed = [];
  function Host() {
    standaloneIntent.useLibraryEditIntent({
      action: null,
      items: [], // a failed list or a later page cannot satisfy this link
      onOpenItem: () => assert.fail("a bare item URL must remain read-only"),
      onPreviewItem: (item) => previewed.push(item.artifactId),
      onFailure: (failure) => assert.fail(failure.message),
    });
    return null;
  }
  await mounted(async (root) => {
    await act(async () => root.render(React.createElement(Host)));
    await act(async () => {});
  });
  assert.deepEqual(requested, [ITEM_X.artifactId]);
  assert.deepEqual(previewed, [ITEM_X.artifactId]);
  assert.deepEqual(identityWrites, [{ artifactId: ITEM_X.artifactId, entryId: "" }]);
  delete globalThis.__libraryIdentityWrites;
  delete globalThis.__libraryDetailRequests;
  delete globalThis.__libraryDetailItem;
});

const uiStubUrl = dataModule(`export function useUI() { return (value) => value; }`);
const viewStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function WorkspaceCard({ entry, onOpen }) {
    return jsx("button", {
      type: "button",
      "data-card": entry.libraryItem && entry.libraryItem.artifactId,
      onClick: onOpen,
      children: entry.title,
    });
  }
  export const WorkspaceListRow = WorkspaceCard;
  export function WorkspaceLibraryEmpty() { return null; }
  export function WorkspaceLibraryEntryViewer({ entry }) {
    const item = entry.libraryItem || {};
    return jsx("div", {
      "data-library-viewer": item.artifactId || entry.id,
      children: entry.title,
    });
  }
`);
const actionsStubUrl = dataModule(`
  export function ArtifactActionButtons() { return null; }
  export function artifactActionMatrix() {
    return {
      preview: { visible: false, available: false, reason: "" },
      edit: { visible: false, available: false, reason: "" },
      insert: { visible: false, available: false, reason: "" },
      replace: { visible: false, available: false, reason: "" },
      download: { visible: false, available: false, reason: "" },
      favorite: { visible: false, available: false, reason: "" },
    };
  }
`);
const detailStubUrl = dataModule(`
  export function MaterialOwningAppEdit() { return null; }
  export function MaterialOwningAppList() { return null; }
  export function useMaterialDetailAppPlan() {
    return { item: null, owningApps: [], hostAppId: "", materialEditRoute: "none" };
  }
`);
const layoutStubUrl = dataModule(`
  export function LibraryChips() { return null; }
  export function LibraryToolbar() { return null; }
`);

const { WorkspaceLibrary } = await import(
    await compileModule("src/shell/WorkspaceLibrary.tsx", {
    "../i18n/ui/useUI": uiStubUrl,
    "./artifact-client": dataModule(`
      export async function prepareArtifactForAction(action, item) {
        return { ok: true, data: item };
      }
    `),
    "./workspace-library-view": viewStubUrl,
    "./ArtifactActions": actionsStubUrl,
    "./library-detail-app-actions": detailStubUrl,
    "./LibraryLayout": layoutStubUrl,
  })
);

const ENTRIES = [
  workspaceEntryFromLibraryItem(ITEM_Y),
  workspaceEntryFromLibraryItem(ITEM_X),
];

test("closing a deep-linked preview clears its route and survives a fresh mount", async () => {
  resetCase();
  window.history.replaceState({ router: "preserved" }, "", "/library?item=item-x&entry=artifact%3Aitem-x&mode=preview&q=flowers&type=image#shelf");
  setLibraryCurrentIdentity(null);
  await mounted(async (root, container) => {
    const render = (key) => root.render(React.createElement(WorkspaceLibrary, { key, entries: ENTRIES, plain: true, hideToolbar: true }));
    await act(async () => render("first"));
    assert.equal(container.querySelector("[data-library-viewer]")?.dataset.libraryViewer, "item-x");
    await act(async () => container.querySelector('[aria-label="返回列表"]').click());
    assert.equal(container.querySelector("[data-library-viewer]"), null);
    assert.equal(window.location.search, "?q=flowers&type=image");
    assert.equal(window.location.hash, "#shelf");
    assert.deepEqual(window.history.state, { router: "preserved" });
    assert.equal(getLibraryCurrentIdentity(), null);
    await act(async () => render("refresh"));
    assert.equal(container.querySelector("[data-library-viewer]"), null);
    assert.ok(container.querySelector('[data-card="item-x"]'));
  });
});

test("身份为 Y 时，WorkspaceLibrary 收到 itemId=X 必须打开 X", async () => {
  resetCase();
  const action = envelope(ITEM_X.artifactId, "lib-open-x-while-y", "open");
  await mounted(async (root, container) => {
    await act(async () => {
      root.render(
        React.createElement(WorkspaceLibrary, {
          entries: ENTRIES,
          action,
          plain: true,
          hideToolbar: true,
        }),
      );
    });
    await act(async () => {});
    const viewer = container.querySelector("[data-library-viewer]");
    assert.equal(
      viewer?.getAttribute("data-library-viewer"),
      ITEM_X.artifactId,
      `应打开 X，当时 DOM：${(container.innerHTML || "").slice(0, 280)}`,
    );
    assert.equal(getLibraryCurrentIdentity()?.artifactId, ITEM_X.artifactId);
  });
});

test("同一条库动作在重渲染和条目列表刷新后不得再打开", async () => {
  resetCase();
  const action = envelope(ITEM_X.artifactId, "lib-open-x-once", "open");
  await mounted(async (root, container) => {
    await act(async () => {
      root.render(
        React.createElement(WorkspaceLibrary, {
          entries: ENTRIES,
          action,
          plain: true,
          hideToolbar: true,
        }),
      );
    });
    await act(async () => {});
    assert.equal(
      container.querySelector("[data-library-viewer]")?.getAttribute("data-library-viewer"),
      ITEM_X.artifactId,
    );
    await act(async () => {
      root.render(
        React.createElement(WorkspaceLibrary, {
          entries: [...ENTRIES],
          action,
          plain: true,
          hideToolbar: true,
        }),
      );
    });
    await act(async () => {});
    assert.equal(
      container.querySelector("[data-library-viewer]")?.getAttribute("data-library-viewer"),
      ITEM_X.artifactId,
      "刷新后仍应停在 X，不得回到 Y",
    );
    assert.equal(getLibraryCurrentIdentity()?.artifactId, ITEM_X.artifactId);
  });
});
