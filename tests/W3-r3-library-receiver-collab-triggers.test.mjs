import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { resetLibraryCurrentIdentityForTests } from "../src/shell/library-current-identity.ts";
import {
  dispatchWorkspaceAction,
  resetWorkspaceActionConsumptionForTests,
  WORKSPACE_ACTION_EVENT,
} from "../src/shell/workspace-actions.ts";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
const activateHref = new URL(
  "../src/shell/inline-editor-mine-activate.ts",
  import.meta.url,
).href;
const leaveHref = new URL(
  "../src/shell/advanced-background-saver.ts",
  import.meta.url,
).href;

const ttStubUrl = dataModule(`
  const tt = (value, vars) =>
    String(value).replace(/\\{(\\w+)\\}/g, (match, key) =>
      vars && key in vars ? String(vars[key]) : match,
    );
  export function useUI() {
    return tt;
  }
`);

const OWNER = "oceanleo:user:me";

function durableItem(overrides = {}) {
  const artifactId =
    overrides.artifactId || "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const revisionId = overrides.revisionId || "rev-a";
  const title = overrides.title || "文稿甲";
  return {
    key: `artifact:${artifactId}:${revisionId}`,
    source: "artifact",
    id: artifactId,
    title,
    kind: "document",
    siteId: "docs",
    favorite: false,
    artifactId,
    revisionId,
    artifactType: "document",
    artifact: {
      schema: "oceanleo.artifact.v1",
      artifactId,
      revisionId,
      artifactType: "document",
      owner: {
        principalId: OWNER,
        visibility: "private",
        originSiteKey: "docs",
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
      integrity: { ok: true, code: "ok", reason: "" },
      renditions: {},
      provenance: {
        id: `prov-${artifactId}`,
        sourceKind: "owned",
        licenseCode: "owned",
        rightsAsserted: true,
        licenseUrl: "",
        attribution: "",
      },
    },
    meta: {},
    ...overrides,
  };
}

const ITEM_A = durableItem();
const ITEM_B = durableItem({
  artifactId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  revisionId: "rev-b",
  title: "文稿乙",
});

const artifactClientStubUrl = dataModule(`
  export const ARTIFACT_LIBRARY_CHANGE_EVENT = "oceanleo:artifact-library-change";
  export async function listMyArtifacts() {
    return {
      ok: true,
      data: {
        items: globalThis.__w3LibraryItems || [],
        ownerPrincipalId: ${JSON.stringify(OWNER)},
        nextCursor: null,
      },
    };
  }
  export async function listFavoriteArtifacts() {
    return {
      ok: true,
      data: {
        items: [],
        ownerPrincipalId: ${JSON.stringify(OWNER)},
        nextCursor: null,
      },
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

const panelUrl = await compileModule("src/shell/inline-editor-mine-panel.tsx", {
  "../i18n/ui/useUI": ttStubUrl,
  "./artifact-client": artifactClientStubUrl,
});

const workbenchUrl = dataModule(`
  import { jsx, jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
  import { useCallback, useEffect, useState } from ${JSON.stringify(reactUrl)};
  import { InlineEditorMinePanel } from ${JSON.stringify(panelUrl)};
  import { leaveAdvancedWorkbench } from ${JSON.stringify(leaveHref)};
  import {
    libraryItemIdentityKey,
    requestOpenLibraryItemInEditor,
  } from ${JSON.stringify(activateHref)};

  export function AdvancedContentWorkbench({ item, onClose }) {
    const [panelOpen, setPanelOpen] = useState(false);
    useEffect(() => {
      globalThis.__w3EditorMounts = (globalThis.__w3EditorMounts || 0) + 1;
    }, [item]);
    const activateMineItem = useCallback(
      (next) => {
        const currentId = libraryItemIdentityKey(item);
        const nextId = libraryItemIdentityKey(next);
        if (currentId && nextId && currentId === nextId) {
          setPanelOpen(false);
          return;
        }
        leaveAdvancedWorkbench({
          autoSaveEnabled: true,
          handOff() {
            globalThis.__w3HandOff = (globalThis.__w3HandOff || 0) + 1;
          },
          closeDetail() {
            setPanelOpen(false);
          },
          onClose() {
            requestOpenLibraryItemInEditor(next);
          },
        });
      },
      [item],
    );
    return jsxs("div", {
      "data-standalone-editor-item": item.artifactId || item.id,
      children: [
        jsx("button", {
          type: "button",
          "data-open-mine": true,
          onClick: () => setPanelOpen(true),
          children: "我的库",
        }),
        jsx("button", {
          type: "button",
          "data-editor-close": true,
          onClick: () => onClose && onClose(),
          children: "关闭",
        }),
        panelOpen
          ? jsx(InlineEditorMinePanel, {
              currentItem: item,
              onActivateItem: activateMineItem,
            })
          : null,
      ],
    });
  }
`);

const { ArtifactLibrary } = await import(
  await compileModule("src/shell/ArtifactLibrary.tsx", {
    "../i18n/ui/useUI": ttStubUrl,
    "../lib/database": dataModule(`
      export async function uploadFile() { return { ok: false, error: "unused" }; }
      export const humanLibraryUploadError = result => result?.error || "unused";
      export const normalizeUploadIdempotencyKey = value => value;
    `),
    "../lib/auth/client": dataModule(`
      export const AUTH_STATE_EVENT = "test:auth-state";
      export async function accessToken() { return "test-token"; }
      export async function getUserIdSnapshot() { return { available: true, userId: "oceanleo:user:me" }; }
      export function browserClient() {
        return { from() { throw new Error("legacy unused"); } };
      }
    `),
    "../lib/virtual": dataModule(`
      export function pixelsPerRem() { return 16; }
      export function useVirtualGrid() { return { windowed: false, items: [] }; }
    `),
    "../ui": dataModule(`
      export function Modal({ children }) { return children; }
      export function SkeletonCard() { return null; }
      export function EmptyState() { return null; }
      export function timeAgo() { return ""; }
    `),
    "./Markdown": dataModule(`export function Markdown() { return null; }`),
    "./LibraryLayout": dataModule(`export function LibraryToolbar() { return null; }`),
    "./collection-chrome": dataModule(`
      export const COLLECTION_ACTION_BTN_PRIMARY = "";
      export const COLLECTION_CARD_GRID_CLASS = "";
      export const COLLECTION_CARD_GRID_STYLE = {};
      export function CollectionCardGrid({ children }) { return children; }
      export function CollectionFilterRow() { return null; }
      export function CollectionFilterSelect() { return null; }
      export function CollectionInfiniteSentinel() { return null; }
    `),
    "./StorageCapacityStrip": dataModule(`
      export function StorageCapacityStrip() { return null; }
    `),
    "./AppPageHeader": dataModule(`
      export const APP_PAGE_FRAME_CLASS = "frame";
      export const APP_PAGE_TITLE_CLASS = "title";
      export function AppPageHeader() { return null; }
    `),
    "./library-scope": dataModule(`
      import { jsx, jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
      export function LibraryScope({ children, header }) {
        return jsxs("div", { children: [header || null, children] });
      }
    `),
    "./WorkspaceLibrary": dataModule(`
      import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
      export function WorkspaceLibrary({ entries, category }) {
        globalThis.__w3LibraryCategory = category || "all";
        return jsx("div", {
          "data-library-grid": true,
          children: (entries || []).map((entry) => {
            const item = entry.libraryItem;
            if (!item) return null;
            return jsx("button", {
              type: "button",
              "data-library-card": item.artifactId,
              children: item.title,
            }, item.artifactId || item.id);
          }),
        });
      }
      export function workspaceEntryFromLibraryItem(item) {
        return { id: item.artifactId || item.id, title: item.title, libraryItem: item };
      }
    `),
    "./AdvancedContentWorkbench": workbenchUrl,
    // This receiver test exercises the actual Library host/switch context, not
    // chat/session loading. Keep that composition boundary out of data: cycles.
    "./AgentChat": dataModule(`export function AgentChat({ workspaceContent }) { return workspaceContent; }`),
    "./WorkspaceSession": dataModule(`export function WorkspaceSessionProvider({ children }) { return children; }`),
    "./artifact-client": artifactClientStubUrl,
    "./advanced-session": dataModule(`
      export function adoptSavedEditorItem(current, saved) {
        return saved || current;
      }
    `),
  })
);

const { CollabActionSlotInner } = await import(
  await compileModule("src/shell/collab/CollabActionSlotInner.tsx", {
    "../../i18n/ui/useUI": ttStubUrl,
    "../../ui/Toast": dataModule(`
      export function useToast() {
        return { success() {}, error() {}, info() {}, loading() {}, show() {}, dismiss() {}, dismissAll() {} };
      }
    `),
    "../../ui": dataModule(`
      import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
      export function Modal({ children, labelledBy }) {
        return jsx("div", { role: "dialog", "aria-labelledby": labelledBy, children });
      }
    `),
    "../../lib/im/client": dataModule(`
      export function useImEnabled() { return true; }
      export async function imFetch(path) {
        globalThis.__w3ImFetch = (globalThis.__w3ImFetch || []).concat(path);
        return { items: [{ id: "conv-1", title: "测试会话", kind: "direct" }] };
      }
    `),
    "../../lib/im/messages-api": dataModule(`
      export const messagesApi = {
        async sendMessage() {
          globalThis.__w3MessagesSent = (globalThis.__w3MessagesSent || 0) + 1;
          throw new Error("tests must not send messages");
        },
      };
    `),
    "./grants-api": dataModule(`
      export class CollabApiError extends Error {
        constructor(status, code, message) {
          super(message);
          this.status = status;
          this.code = code;
        }
      }
      export async function grantCoeditToConversation() {
        globalThis.__w3GrantsSent = (globalThis.__w3GrantsSent || 0) + 1;
        throw new Error("tests must not grant");
      }
    `),
    "../replay/work/replay-work-api": dataModule(`
      export async function createWorkReplay() {
        globalThis.__w3ReplayCreated = (globalThis.__w3ReplayCreated || 0) + 1;
        throw new Error("tests must not create replay");
      }
    `),
    "../replay/work/open-work-replay": dataModule(`
      export function openWorkReplay() {
        globalThis.__w3ReplayOpened = (globalThis.__w3ReplayOpened || 0) + 1;
      }
    `),
    "../AdvancedEditorIcon": dataModule(`
      import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
      export function AdvancedEditorIcon({ name, className }) {
        return jsx("span", { "data-icon": name, className, "aria-hidden": "true" });
      }
    `),
    "./CollabLockBanner": dataModule(`export function CollabLockBanner() { return null; }`),
    "./CollabPresenceBar": dataModule(`export function CollabPresenceBar() { return null; }`),
    "./pro-mode-lock": dataModule(`export function attachProModeLock() { return () => {}; }`),
    "./index": dataModule(`export {}`),
  })
);

async function withDom(run) {
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
    url: "https://p.dev.oceanleo.com/library",
  });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    SVGElement: window.SVGElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    CustomEvent: window.CustomEvent,
    history: window.history,
    location: window.location,
  })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    restore.push(() => {
      if (had) {
        Object.defineProperty(globalThis, name, {
          configurable: true,
          writable: true,
          value: previous,
        });
      } else delete globalThis[name];
    });
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
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  const render = (element) => act(async () => root.render(element));
  const unmount = () => act(async () => root.unmount());
  // Anchored popovers portal into this test document, outside the root div.
  const find = (selector) => window.document.querySelector(selector);
  const click = (node) =>
    act(async () =>
      node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })),
    );
  try {
    await run({ window, render, unmount, find, click, container });
  } finally {
    await act(async () => root.unmount());
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    window.close();
  }
}

async function waitUntil(predicate, tries = 50) {
  for (let i = 0; i < tries; i += 1) {
    if (predicate()) return true;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
  return Boolean(predicate());
}

async function waitFor(find, selector, tries = 50) {
  await waitUntil(() => find(selector), tries);
  const node = find(selector);
  assert.ok(node, `等不到 ${selector}`);
  return node;
}

function resetCase() {
  resetLibraryCurrentIdentityForTests();
  resetWorkspaceActionConsumptionForTests();
  globalThis.__w3LibraryItems = [ITEM_A, ITEM_B];
  globalThis.__w3HandOff = 0;
  globalThis.__w3EditorMounts = 0;
  globalThis.__w3LibraryCategory = "";
  globalThis.__w3ImFetch = [];
  globalThis.__w3MessagesSent = 0;
  globalThis.__w3GrantsSent = 0;
  globalThis.__w3ReplayCreated = 0;
  globalThis.__w3ReplayOpened = 0;
}

function editEnvelope(itemId, nonce) {
  return {
    nonce,
    action: { version: 1, tab: "mine", itemId, intent: "edit" },
  };
}

test("W3-r3: /library 点乙份时舞台切到乙，脏稿先 handOff，同条只关面板", async () => {
  resetCase();
  await withDom(async ({ window, render, find, click }) => {
    let filterSeen = "";
    await render(
      React.createElement(ArtifactLibrary, {
        filter: "documents",
        onFilterChange: (next) => {
          filterSeen = next;
        },
      }),
    );
    await waitFor(find, `[data-library-card="${ITEM_A.artifactId}"]`);
    assert.equal(globalThis.__w3LibraryCategory, "document_editing");
    assert.ok(find(`[data-library-card="${ITEM_B.artifactId}"]`));

    act(() => {
      dispatchWorkspaceAction(editEnvelope(ITEM_A.artifactId, "open-a"));
    });
    await waitFor(find, `[data-library-standalone-editor="${ITEM_A.artifactId}"]`);
    assert.equal(
      find("[data-standalone-editor-item]").getAttribute(
        "data-standalone-editor-item",
      ),
      ITEM_A.artifactId,
    );

    await click(find("[data-open-mine]"));
    await waitFor(find, `[data-inline-editor-mine-item="${ITEM_B.artifactId}"]`);
    await click(find(`[data-inline-editor-mine-item="${ITEM_B.artifactId}"]`));
    await waitFor(find, `[data-library-standalone-editor="${ITEM_B.artifactId}"]`);
    assert.equal(
      find("[data-standalone-editor-item]").getAttribute(
        "data-standalone-editor-item",
      ),
      ITEM_B.artifactId,
    );
    assert.equal(find(`[data-standalone-editor-item="${ITEM_A.artifactId}"]`), null);
    assert.equal(globalThis.__w3HandOff, 1, "换条目没有走 leave/save handOff");
    assert.equal(filterSeen, "", "切条目不该改类型筛选");

    await click(find("[data-open-mine]"));
    await waitFor(find, `[data-inline-editor-mine-item="${ITEM_B.artifactId}"]`);
    await click(find(`[data-inline-editor-mine-item="${ITEM_B.artifactId}"]`));
    assert.equal(find("[data-inline-editor-mine-panel]"), null, "同条没有关面板");
    assert.equal(
      find("[data-standalone-editor-item]").getAttribute(
        "data-standalone-editor-item",
      ),
      ITEM_B.artifactId,
    );
    assert.equal(globalThis.__w3HandOff, 1, "同条误触发了 handOff");

    act(() => {
      window.dispatchEvent(
        new window.CustomEvent(WORKSPACE_ACTION_EVENT, {
          detail: {
            nonce: "bad-open",
            action: { version: 1, tab: "mine", itemId: ITEM_A.artifactId, intent: "open" },
          },
        }),
      );
      window.dispatchEvent(
        new window.CustomEvent(WORKSPACE_ACTION_EVENT, {
          detail: {
            nonce: "bad-tab",
            action: {
              version: 1,
              tab: "materials",
              itemId: ITEM_A.artifactId,
              intent: "edit",
            },
          },
        }),
      );
      window.dispatchEvent(
        new window.CustomEvent(WORKSPACE_ACTION_EVENT, {
          detail: {
            action: { version: 1, tab: "mine", itemId: ITEM_A.artifactId, intent: "edit" },
          },
        }),
      );
      window.dispatchEvent(
        new window.CustomEvent(WORKSPACE_ACTION_EVENT, {
          detail: {
            nonce: "bad-id",
            action: { version: 1, tab: "mine", intent: "edit" },
          },
        }),
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    assert.equal(
      find("[data-standalone-editor-item]").getAttribute(
        "data-standalone-editor-item",
      ),
      ITEM_B.artifactId,
      "非法 envelope 改了当前条目",
    );

    await click(find("[data-editor-close]"));
    await waitFor(find, `[data-library-card="${ITEM_B.artifactId}"]`);
    assert.equal(globalThis.__w3LibraryCategory, "document_editing");
  });
});

test("W3-r3: 独立库页卸载后不再接收 typed edit", async () => {
  resetCase();
  await withDom(async ({ render, unmount, find, window }) => {
    await render(React.createElement(ArtifactLibrary, {}));
    await waitFor(find, `[data-library-card="${ITEM_A.artifactId}"]`);
    await unmount();
    assert.equal(find("[data-library-standalone-editor]"), null);
    act(() => {
      dispatchWorkspaceAction(editEnvelope(ITEM_A.artifactId, "after-unmount"));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    assert.equal(find("[data-library-standalone-editor]"), null);
    assert.equal(window.document.querySelector("[data-standalone-editor-item]"), null);
  });
});

test("W3-r3: 邀请/回放真实触发器打开对话框和范围面板，再点关闭", async () => {
  resetCase();
  await withDom(async ({ render, find, click, container }) => {
    await render(
      React.createElement(CollabActionSlotInner, {
        pluginThemeId: "grid",
        collab: {
          room: { roomKey: "artifact:art-1", id: "room-1" },
          artifact: {
            id: "art-1",
            title: "文稿",
            editorKind: "richdoc",
          },
        },
      }),
    );
    const invite = find("[data-collab-invite]");
    const replay = find("[data-generate-replay]");
    assert.equal(container.querySelectorAll("[data-collab-invite]").length, 1);
    assert.equal(container.querySelectorAll("[data-generate-replay]").length, 1);
    assert.equal(container.querySelectorAll("button[aria-label='邀请一起改']").length, 1);
    assert.equal(container.querySelectorAll("button[aria-label='生成回放']").length, 1);
    assert.equal(invite.getAttribute("aria-label"), "邀请一起改");
    assert.equal(replay.getAttribute("aria-label"), "生成回放");
    assert.ok(invite.querySelector('[data-icon="add"]'));
    assert.ok(replay.querySelector('[data-icon="history"]'));
    assert.equal(invite.getAttribute("aria-haspopup"), "dialog");
    assert.equal(replay.getAttribute("aria-haspopup"), "dialog");

    await click(invite);
    await waitFor(find, "[data-collab-invite-dialog]");
    assert.equal(globalThis.__w3MessagesSent, 0);
    assert.equal(globalThis.__w3GrantsSent, 0);

    await click(replay);
    await waitFor(find, "[data-generate-replay-panel]");
    assert.ok(find('[data-replay-range="today"]'));
    assert.equal(globalThis.__w3ReplayCreated, 0);
    await click(replay);
    const closedPanel = find("[data-generate-replay-panel]");
    assert.ok(closedPanel?.hidden, "再点回放应隐藏并保留范围选择，不是销毁表单");
    assert.equal(closedPanel.getAttribute("aria-hidden"), "true");
    assert.ok(closedPanel.hasAttribute("inert"), "关闭后的面板不可交互");
    assert.equal(replay.getAttribute("aria-expanded"), "false");
  });
});
