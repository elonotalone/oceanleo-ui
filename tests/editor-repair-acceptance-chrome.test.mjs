/**
 * V1 acceptance: editor global row matches preview actions — icon-only, My
 * library actually opens mine, share/favorite reuse ArtifactActions identity.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const jsxUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
const reactUrl = pathToFileURL(require.resolve("react")).href;

function durableItem() {
  const revisionId = "rev-accept";
  const artifactId = "art-accept";
  const rendition = (purpose) => ({
    purpose,
    revisionId,
    url: `https://files.test/${purpose}`,
    mediaType: purpose === "editor_manifest" ? "application/json" : "text/markdown",
    format: purpose === "editor_manifest" ? "tiptap-json@1" : "markdown",
    expiresAt: null,
    rendererVersion: null,
    width: null,
    height: null,
    durationMs: null,
    digest: `${purpose}-digest`,
  });
  return {
    key: `artifact:${artifactId}`,
    source: "artifact",
    id: artifactId,
    title: "需签字盖章页清单（只打第3页）",
    kind: "document",
    siteId: "word",
    favorite: false,
    artifactId,
    revisionId,
    artifactType: "document",
    meta: { filename: "list.md", mime: "text/markdown" },
    artifact: {
      schema: "oceanleo.artifact.v1",
      artifactId,
      revisionId,
      artifactType: "document",
      roles: ["library"],
      owner: {
        principalId: "owner-1",
        visibility: "private",
        originSiteKey: "word",
        originAppId: "word",
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
      integrity: { ok: true, reason: "" },
      editability: "native",
      editorCapability: "richdoc-editor",
      sourceFormat: "markdown",
      title: "需签字盖章页清单（只打第3页）",
      favorite: false,
      renditions: {
        source: rendition("source"),
        full: rendition("full"),
        editor_manifest: rendition("editor_manifest"),
      },
      scene: null,
      provenance: { id: "prov-1" },
    },
  };
}

async function withDom(run) {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvas = require.cache[canvasEntry];
  require.cache[canvasEntry] = {
    id: canvasEntry,
    filename: canvasEntry,
    loaded: true,
    exports: {},
  };
  const { JSDOM } = await import(
    pathToFileURL(fabricRequire.resolve("jsdom")).href
  );
  if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
  else delete require.cache[canvasEntry];
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://word.oceanleo.com/library?item=21c1e4d9-0818-4bbe-ae33-b4d01a5beafd",
  });
  const { window } = dom;
  Object.defineProperty(window.document, "fullscreenEnabled", {
    configurable: true,
    value: true,
  });
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
    KeyboardEvent: window.KeyboardEvent,
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
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  try {
    await run({
      window,
      container,
      render: (element) => act(async () => root.render(element)),
      find: (selector) => container.querySelector(selector),
      findAll: (selector) => [...container.querySelectorAll(selector)],
    });
  } finally {
    await act(async () => root.unmount());
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    window.close();
  }
}

function visibleText(node) {
  if (!node) return "";
  const clone = node.cloneNode(true);
  clone.querySelectorAll(".sr-only, [hidden]").forEach((hidden) => hidden.remove());
  return String(clone.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
}

function findLabeledButton(root, patterns) {
  return [...root.querySelectorAll("button, a, [role=button]")].find((node) => {
    const blob = [
      node.getAttribute("data-artifact-action"),
      node.getAttribute("data-editor-chrome-action"),
      node.getAttribute("aria-label"),
      node.getAttribute("title"),
      visibleText(node),
    ]
      .filter(Boolean)
      .join(" ");
    return patterns.some((pattern) => pattern.test(blob));
  });
}

test("global row is icon-only, opens mine, and hosts share/favorite with LibraryItem identity", async () => {
  const libraryOpens = [];
  const { PluginGlobalRow } = await import(
    await compileModule("src/shell/plugin-chrome/PluginGlobalRow.tsx", {
      "../../i18n/ui/useUI": dataModule(
        "export function useUI(){ return (value) => value; }",
      ),
      "../AdvancedEditorIcon": dataModule(`
        import { jsx } from ${JSON.stringify(jsxUrl)};
        export function AdvancedEditorIcon({ name, className }) {
          return jsx("span", { "data-icon": name, className, "aria-hidden": "true" });
        }
      `),
      "../collab/CollabActionSlot": dataModule(
        "export function CollabActionSlot(){ return null; }",
      ),
      "../SplitWorkspace": dataModule(`
        export function useRightPaneSlot() { return null; }
      `),
      "../../ui/Toast": dataModule(`
        export function useToast() {
          return {
            success() {},
            error() {},
            info() {},
            loading() {},
            show() { return { id: "t", dismiss() {} }; },
            dismiss() {},
            dismissAll() {},
          };
        }
      `),
      "../artifact-client": dataModule(`
        export async function setArtifactFavorite(item, favorite) {
          return { ok: true, data: { ...item, favorite } };
        }
      `),
    })
  );

  await withDom(async ({ render, find }) => {
    const item = durableItem();
    await render(
      React.createElement(PluginGlobalRow, {
        adapter: {
          id: "richdoc",
          label: "文档",
          stage: null,
          actions: [],
          item,
        },
        autoSaveState: "saved",
        pluginThemeId: "richdoc",
        showBack: true,
        showLibrary: true,
        item,
        libraryItem: item,
        activeLibraryPanelId: null,
        onBack() {},
        onOpenLibrary(id) {
          libraryOpens.push(id);
        },
        onRetrySave() {},
      }),
    );
    const row =
      find("[data-plugin-global-row]") ||
      find("[data-advanced-workspace-actions]");
    assert.ok(row, "global row must render");

    const librarySlot = row.querySelector('[data-global-row-slot="library"]');
    assert.ok(librarySlot, "library slot missing");
    const libraryButtons = [
      ...librarySlot.querySelectorAll(
        '[data-workspace-library-panel], button[aria-label], button[title]',
      ),
    ].filter((node) => node.matches("button, [role=button]"));
    assert.ok(libraryButtons.length >= 2, "素材库 and 我的库 must both exist");
    for (const button of libraryButtons) {
      const name =
        button.getAttribute("aria-label") ||
        button.getAttribute("title") ||
        visibleText(button);
      assert.ok(name, "icon-only buttons still need an accessible name");
      assert.equal(
        visibleText(button),
        "",
        `preview actions are icon-only; "${visibleText(button)}" must not appear on the global row`,
      );
    }
    const mine =
      librarySlot.querySelector('[data-workspace-library-panel="mine"]') ||
      libraryButtons[1];
    await act(async () => mine.click());
    assert.deepEqual(libraryOpens, ["mine"]);

    const share = findLabeledButton(row, [/share/i, /分享/]);
    const favorite = findLabeledButton(row, [/favorite/i, /收藏/, /星标/]);
    assert.ok(
      share,
      "editor chrome must host the existing share action with LibraryItem identity",
    );
    assert.ok(
      favorite,
      "editor chrome must host the existing favorite action with LibraryItem identity",
    );
    const shareAction =
      share.getAttribute("data-editor-chrome-action") ||
      share.getAttribute("data-artifact-action") ||
      "";
    assert.equal(shareAction, "share");
    const social = row.querySelector("[data-editor-item-social]");
    assert.ok(social, "share/favorite must bind to the LibraryItem identity");
    assert.equal(social.getAttribute("data-artifact-id"), item.artifactId);
    assert.equal(social.getAttribute("data-revision-id"), item.revisionId);
    assert.equal(
      share.closest("[data-global-row-slot]")?.getAttribute("data-global-row-slot"),
      "share",
    );
    assert.equal(
      favorite.closest("[data-global-row-slot]")?.getAttribute("data-global-row-slot"),
      "favorite",
    );
  });
});

test("standalone workbench 我的库 still opens the mine panel when SplitWorkspace is absent", async () => {
  const drawerOpens = [];
  const paneOpens = [];
  const { InlineAdvancedWorkbenchShell } = await import(
    await compileModule("src/shell/InlineAdvancedWorkbenchShell.tsx", {
      "../i18n/ui/useUI": dataModule(
        "export function useUI(){ return (value) => value; }",
      ),
      "../ui": dataModule("export function ConfirmDialog(){ return null; }"),
      "../ui/Toast": dataModule(`
        export function useToast() {
          return {
            success() {},
            error() {},
            info() {},
            loading() {},
            show() { return { id: "t", dismiss() {} }; },
            dismiss() {},
            dismissAll() {},
          };
        }
      `),
      "./advanced-layout-context": dataModule(`
        import { createContext } from ${JSON.stringify(reactUrl)};
        export const AdvancedLayoutContext = createContext(null);
        export const ADVANCED_TOOLS_PANEL_ID = "advanced-workbench-tools-panel";
        export function focusAdvancedToolsTrigger() {}
        export function useAdvancedToolsLauncherRegistration() {}
      `),
      "./AdvancedStageControls": dataModule(`
        import { jsx } from ${JSON.stringify(jsxUrl)};
        export function AdvancedStageControls() { return null; }
        export function AdvancedWorkbenchStage() {
          return jsx("div", { "data-probe-stage": true });
        }
        export function EditBarDockHost() { return null; }
      `),
      "./AdvancedWorkbenchStage": dataModule(`
        import { jsx } from ${JSON.stringify(jsxUrl)};
        export function AdvancedWorkbenchStage() {
          return jsx("div", { "data-probe-stage": true });
        }
      `),
      "./FloatingContextToolbar": dataModule(`
        import { jsx } from ${JSON.stringify(jsxUrl)};
        export function FloatingContextToolbar() {
          return jsx("div", { "data-workspace-edit-bar": true });
        }
        export function useFloatingContextToolbar() {
          return { mode: "docked", dropActive: false, leading: null, trailing: null };
        }
      `),
      "./EditBarDockHost": dataModule(
        "export function EditBarDockHost() { return null; }",
      ),
      "./advanced-leave-flush": dataModule(
        "export async function flushAdvancedWorkBeforeLeave() { return { ok: true }; }",
      ),
      "./inline-advanced-workbench-drop": dataModule(`
        export function useInlineAdvancedWorkbenchDrop() {
          return { dropMessage: "", performUpload() {}, handleDrop() {} };
        }
      `),
      "./use-inline-advanced-panels": dataModule(`
        export function useInlineAdvancedPanels() {
          return {
            drawers: [],
            activeDrawerId: "",
            activeMaterialAction: null,
            transientPanel: null,
            fallbackDetail: null,
            openDrawer(id) { globalThis.__acceptDrawerOpens.push(id); },
            openTransientPanel(id) { globalThis.__acceptDrawerOpens.push(id); },
            updateTransientPanel() {},
            closeDetail() {},
          };
        }
      `),
      "./advanced-session-context": dataModule(
        "export function useAdvancedSession() { return null; }",
      ),
      "./workbench-material-provider": dataModule(
        "export function useWorkbenchMaterials() { return null; }",
      ),
      "./SplitWorkspace": dataModule(`
        export function useRightPaneSlot() { return null; }
        export function useWorkspacePane() { return null; }
      `),
      "./use-advanced-autosave": dataModule(`
        export function useAdvancedAutoSave() {
          return { state: "saved", flushLatest: async () => ({ ok: true }), retry: async () => {} };
        }
      `),
      "./use-advanced-recovery": dataModule(
        "export function useAdvancedRecovery() {}",
      ),
      "./workbench-routes": dataModule(
        'export function editBarOwnershipForItem() { return "host"; }',
      ),
      "./artifact-client": dataModule(`
        export async function listMyArtifacts() {
          return { ok: true, data: { items: [] } };
        }
        export async function setArtifactFavorite(item, favorite) {
          return { ok: true, data: { ...item, favorite } };
        }
      `),
    })
  );

  globalThis.__acceptDrawerOpens = drawerOpens;
  await withDom(async ({ render, find }) => {
    await render(
      React.createElement(InlineAdvancedWorkbenchShell, {
        item: durableItem(),
        adapter: {
          id: "richdoc",
          label: "文档",
          stage: React.createElement("div"),
          actions: [],
          mode: { current: "normal", setMode() {} },
        },
        onClose() {},
      }),
    );
    const librarySlot = find('[data-global-row-slot="library"]');
    assert.ok(librarySlot, "library slot missing on standalone shell");
    const mine =
      librarySlot.querySelector('[data-workspace-library-panel="mine"]') ||
      [...librarySlot.querySelectorAll("button")][1];
    assert.ok(mine, "我的库 button missing");
    await act(async () => mine.click());
    assert.ok(
      drawerOpens.includes("mine") || paneOpens.includes("mine"),
      `standalone 我的库 must open the mine panel; opens=${JSON.stringify(drawerOpens)}`,
    );
  });
});
