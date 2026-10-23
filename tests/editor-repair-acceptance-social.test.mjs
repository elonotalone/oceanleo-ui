/**
 * V1 acceptance: share feedback, favorite identity races, and /library mine
 * item activation through the live chrome helpers — not unused buses.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  requestOpenLibraryItemInEditor,
  useStandaloneMineEditReceipt,
} from "../src/shell/inline-editor-mine-activate.ts";
import { dispatchWorkspaceAction } from "../src/shell/workspace-actions.ts";
import { resetLibraryCurrentIdentityForTests } from "../src/shell/library-current-identity.ts";

const require = createRequire(import.meta.url);
const jsxUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

function durableItem(patch = {}) {
  const artifactId = patch.artifactId || "art-accept";
  const revisionId = patch.revisionId || "rev-accept";
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
      renditions: {},
      scene: null,
      provenance: { id: "prov-1" },
    },
    ...patch,
  };
}

// D1（2026-10-23）：分享 / 收藏不再是第一行的独立按钮，状态与动作收进 useEditorItemSocial，
// 由 `···` 菜单画。两条身份保护（链接带当前条目、迟到的收藏结果不改新条目）照旧，测在 hook 上。
function socialProbe(useEditorItemSocial) {
  return function SocialProbe({ item }) {
    const social = useEditorItemSocial(item);
    return React.createElement(
      "div",
      { "data-editor-item-social": true, "data-artifact-id": social.artifactId || undefined },
      React.createElement("button", { "data-editor-chrome-action": "share", onClick: () => void social.share() }),
      React.createElement("button", {
        "data-editor-chrome-action": "favorite",
        "aria-pressed": String(social.favorite),
        onClick: () => void social.toggleFavorite(),
      }),
    );
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
    url: "https://word.oceanleo.com/library?item=stale",
  });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    CustomEvent: window.CustomEvent,
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
    });
  } finally {
    await act(async () => root.unmount());
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    window.close();
  }
}

test("share copies item identity and toasts 已复制; delayed favorite cannot flip a new item", async () => {
  const toasts = [];
  let favoriteDelay = 40;
  const favorites = [];
  const { useEditorItemSocial } = await import(
    await compileModule("src/shell/editor-item-social-chrome.tsx", {
      "../i18n/ui/useUI": dataModule(
        "export function useUI(){ return (value) => value; }",
      ),
      "../ui/Toast": dataModule(`
        export function useToast() {
          return {
            success(message) { globalThis.__acceptToasts.push(message); },
            error() {},
            info() {},
          };
        }
      `),
      "./artifact-client": dataModule(`
        export async function setArtifactFavorite(item, favorite) {
          const delay = Number(globalThis.__acceptFavoriteDelay || 0);
          if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
          globalThis.__acceptFavorites.push({
            artifactId: item.artifactId,
            revisionId: item.revisionId,
            favorite,
          });
          return { ok: true, data: { ...item, favorite } };
        }
      `),
      "./AdvancedEditorIcon": dataModule(`
        import { jsx } from ${JSON.stringify(jsxUrl)};
        export function AdvancedEditorIcon({ name }) {
          return jsx("span", { "data-icon": name });
        }
      `),
    })
  );
  const EditorItemSocialChrome = socialProbe(useEditorItemSocial);
  globalThis.__acceptToasts = toasts;
  globalThis.__acceptFavorites = favorites;
  globalThis.__acceptFavoriteDelay = favoriteDelay;
  try {
    await withDom(async ({ window, render, find }) => {
      Object.defineProperty(window.navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.__copied = text;
          },
        },
      });
      const first = durableItem();
      const second = durableItem({
        artifactId: "art-next",
        id: "art-next",
        revisionId: "rev-next",
        favorite: false,
      });
      await render(React.createElement(EditorItemSocialChrome, { item: first }));
      const share = find('[data-editor-chrome-action="share"]');
      assert.ok(share);
      await act(async () => share.click());
      assert.match(String(window.__copied || ""), /item=art-accept/);
      assert.doesNotMatch(String(window.__copied || ""), /item=stale/);
      assert.deepEqual(toasts, ["已复制"]);

      await act(async () => find('[data-editor-chrome-action="favorite"]').click());
      await render(React.createElement(EditorItemSocialChrome, { item: second }));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, favoriteDelay + 30));
      });
      const star = find('[data-editor-chrome-action="favorite"]');
      assert.equal(star.getAttribute("aria-pressed"), "false");
      assert.equal(
        find("[data-editor-item-social]").getAttribute("data-artifact-id"),
        second.artifactId,
      );
    });
  } finally {
    globalThis.__acceptFavoriteDelay = 0;
  }
});

test("standalone /library receiver opens a different mine item and ignores invalid envelopes", async () => {
  resetLibraryCurrentIdentityForTests();
  function Probe() {
    const envelope = useStandaloneMineEditReceipt();
    return React.createElement("div", {
      "data-received-item": envelope?.action?.itemId || "",
      "data-received-intent": envelope?.action?.intent || "",
    });
  }
  await withDom(async ({ window, render, find }) => {
    await render(React.createElement(Probe));
    await act(async () => {
      dispatchWorkspaceAction({
        nonce: "n-open",
        action: { version: 1, tab: "preview", itemId: "art-b", intent: "open" },
      });
    });
    assert.equal(find("[data-received-item]").getAttribute("data-received-item"), "");
    await act(async () => {
      dispatchWorkspaceAction({
        nonce: "",
        action: { version: 1, tab: "mine", itemId: "art-b", intent: "edit" },
      });
    });
    assert.equal(find("[data-received-item]").getAttribute("data-received-item"), "");

    const first = durableItem();
    const second = durableItem({
      artifactId: "art-b",
      id: "art-b",
      revisionId: "rev-b",
      title: "文稿乙",
    });
    await act(async () => {
      requestOpenLibraryItemInEditor(second);
    });
    assert.equal(find("[data-received-item]").getAttribute("data-received-item"), "art-b");
    assert.equal(
      find("[data-received-intent]").getAttribute("data-received-intent"),
      "edit",
    );
    assert.notEqual(first.artifactId, second.artifactId);
  });
});
