// D1（操作员 2026-10-23）：第一行只剩一个 `···`。
// 菜单里依次是：邀请一起改、生成回放、分享、收藏、下载 ▸（子菜单列各格式）。
// 每项都有图标和文字；点了做的事与原来的独立按钮一样；
// 邀请 / 回放弹出的是协同块自己的那两个窗口（登记进来，不是另做一份）；
// 一项都没有时连 `···` 都不出（不放死按钮）。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const jsxUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

const tt = dataModule(`
  const tt = (value, vars) => String(value).replace(/\\{(\\w+)\\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m));
  export function useUI() { return tt; }
`);
const toast = dataModule(`
  export function useToast() {
    const push = (kind) => (message) => { (globalThis.__moreToasts ||= []).push(kind + ":" + message); };
    return { success: push("success"), error: push("error"), info: push("info") };
  }
`);
const icon = dataModule(`
  import { jsx } from ${JSON.stringify(jsxUrl)};
  export function AdvancedEditorIcon({ name, filled }) {
    return jsx("span", { "data-icon": name, "data-filled": filled ? "true" : undefined, "aria-hidden": "true" });
  }
`);

const barUrl = await compileModule("src/shell/AdvancedWorkspaceActionBar.tsx", {
  "../i18n/ui/useUI": tt,
  "../ui/Toast": toast,
  "./AdvancedEditorIcon": icon,
  "./SplitWorkspace": dataModule(`export function useRightPaneSlot() { return null; }`),
  "./artifact-client": dataModule(`
    export async function setArtifactFavorite(item, favorite) {
      return { ok: true, data: { ...item, favorite } };
    }
  `),
  // 协同块：真实的 CollabActionSlotInner（登记逻辑），只把 IM / 弹窗本体换成探针。
  "./collab/CollabActionSlot": dataModule(`
    export { CollabActionSlotInner as CollabActionSlot } from ${JSON.stringify(
      await compileModule("src/shell/collab/CollabActionSlotInner.tsx", {
        "../../i18n/ui/useUI": tt,
        "../../ui/Toast": toast,
        "../../lib/im/client": dataModule(`export function useImEnabled() { return true; }`),
        "./CollabInviteButton": dataModule(`
          import { jsx } from ${JSON.stringify(jsxUrl)};
          export function CollabInviteDialog({ onClose }) {
            return jsx("div", { "data-collab-invite-dialog": true, children: jsx("button", { "data-close-invite": true, onClick: onClose }) });
          }
          export function CollabInviteButton() { return jsx("button", { "data-collab-invite": true }); }
        `),
        "../replay/work/GenerateReplayButton": dataModule(`
          import { jsx } from ${JSON.stringify(jsxUrl)};
          export function GenerateReplayPanel({ open, anchorRef }) {
            return open ? jsx("div", { "data-generate-replay-panel": true, "data-anchored-on-more": anchorRef?.current?.hasAttribute("data-workspace-more-launcher") ? "true" : "false" }) : null;
          }
          export function GenerateReplayButton() { return jsx("button", { "data-generate-replay": true }); }
        `),
        "./CollabLockBanner": dataModule(`export function CollabLockBanner() { return null; }`),
        "./CollabPresenceBar": dataModule(`export function CollabPresenceBar() { return null; }`),
        "./pro-mode-lock": dataModule(`export function attachProModeLock() { return () => {}; }`),
        "./index": dataModule(`export {}`),
      }),
    )};
  `),
});
const { AdvancedWorkspaceActionBar } = await import(barUrl);

function durableItem() {
  const artifactId = "art-more-1";
  return {
    key: `artifact:${artifactId}`,
    source: "artifact",
    id: artifactId,
    title: "文稿",
    kind: "document",
    favorite: false,
    artifactId,
    revisionId: "rev-more",
    artifactType: "document",
    meta: {},
    artifact: {
      schema: "oceanleo.artifact.v1",
      artifactId,
      revisionId: "rev-more",
      artifactType: "document",
      access: { canRead: true, canFavorite: true, canEdit: true },
      integrity: { ok: true, reason: "" },
      renditions: {},
    },
  };
}

async function withDom(run) {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvas = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
  else delete require.cache[canvasEntry];
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://p.dev.oceanleo.com/library" });
  const { window } = dom;
  const names = ["window", "document", "navigator", "HTMLElement", "SVGElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent", "CustomEvent"];
  const saved = names.map((n) => [n, Object.getOwnPropertyDescriptor(globalThis, n)]);
  for (const n of names) Object.defineProperty(globalThis, n, { configurable: true, writable: true, value: n === "window" ? window : window[n] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  const doc = window.document;
  const click = (node) => act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
  const key = (node, k) => act(async () => node.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true })));
  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  try {
    await run({ window, doc, container, click, key, settle, render: (el) => act(async () => root.render(el)) });
  } finally {
    await act(async () => root.unmount());
    for (const [n, d] of saved) d ? Object.defineProperty(globalThis, n, d) : delete globalThis[n];
    window.close();
  }
}

function props(overrides = {}) {
  const triggered = [];
  return {
    triggered,
    value: {
      adapter: {
        id: "deck",
        label: "PPT",
        stage: null,
        persistence: { dirty: false, editRevision: 0, flush() {} },
        directDownload: { id: "download-pptx", label: "PPTX", icon: "download", onTrigger: () => triggered.push("pptx") },
        actions: [{ id: "export-pdf", label: "PDF", group: "download", onTrigger: () => triggered.push("pdf") }],
        collab: { room: { roomKey: "artifact:art-more-1" }, artifact: { id: "art-more-1", title: "文稿", editorKind: "deck" } },
        ...overrides.adapter,
      },
      item: "item" in overrides ? overrides.item : durableItem(),
      autoSaveState: "saved",
      activeLibraryPanelId: null,
      onBack() {},
      onOpenLibrary() {},
      onRetrySave() {},
      onTriggerAction: (action) => action.onTrigger?.(),
    },
  };
}

test("··· 菜单：邀请、回放、分享、收藏、下载 ▸，每项图标 + 文字", async () => {
  await withDom(async ({ doc, container, click, settle, render }) => {
    const { value } = props();
    await render(React.createElement(AdvancedWorkspaceActionBar, value));
    await settle();
    const launcher = container.querySelector('[data-global-row-slot="more"] [data-workspace-more-launcher]');
    assert.ok(launcher, "第一行没有 ···");
    assert.equal(launcher.getAttribute("aria-haspopup"), "menu");
    await click(launcher);
    const menu = doc.querySelector("[data-workspace-more-menu]");
    assert.ok(menu, "··· 菜单没打开");
    assert.equal(menu.getAttribute("role"), "menu");
    const items = [...menu.querySelectorAll('[role="menuitem"]')];
    assert.deepEqual(
      items.map((node) => node.getAttribute("data-more-menu-entry")),
      ["invite", "replay", "share", "favorite", "download"],
    );
    for (const node of items) {
      assert.ok(node.querySelector("[data-icon]"), `${node.dataset.moreMenuEntry} 没有图标`);
      assert.ok((node.textContent || "").trim().length > 0, `${node.dataset.moreMenuEntry} 没有文字`);
    }
    const icons = items.map((node) => node.querySelector("[data-icon]").getAttribute("data-icon"));
    assert.equal(new Set(icons).size, icons.length, `菜单里有两个一样的图标：${icons}`);
  });
});

test("邀请 / 回放打开的是协同块自己的窗口；回放面板锚在 ··· 上", async () => {
  await withDom(async ({ doc, container, click, settle, render }) => {
    await render(React.createElement(AdvancedWorkspaceActionBar, props().value));
    await settle();
    const launcher = container.querySelector("[data-workspace-more-launcher]");
    await click(launcher);
    await click(doc.querySelector('[data-more-menu-entry="invite"]'));
    assert.ok(container.querySelector("[data-collab-invite-dialog]"), "邀请对话框没弹出来");
    assert.equal(doc.querySelector("[data-workspace-more-menu]").getAttribute("data-leo-overlay-state"), "closed", "点了菜单项菜单没收");
    await click(container.querySelector("[data-close-invite]"));
    assert.equal(container.querySelector("[data-collab-invite-dialog]"), null);
    await click(launcher);
    await click(doc.querySelector('[data-more-menu-entry="replay"]'));
    const panel = container.querySelector("[data-generate-replay-panel]");
    assert.ok(panel, "回放面板没弹出来");
    assert.equal(panel.getAttribute("data-anchored-on-more"), "true", "回放面板没锚在 ··· 上");
    // 有 ··· 宿主时，第一行不再另画邀请 / 回放图标。
    assert.equal(container.querySelector("[data-collab-invite]"), null);
    assert.equal(container.querySelector("[data-generate-replay]"), null);
  });
});

test("下载 ▸：子菜单 = directDownload + download 组，点了触发对应动作；键盘 → 打开、← 收回", async () => {
  await withDom(async ({ doc, container, click, key, render }) => {
    const { value, triggered } = props();
    await render(React.createElement(AdvancedWorkspaceActionBar, value));
    await click(container.querySelector("[data-workspace-more-launcher]"));
    const download = doc.querySelector('[data-more-menu-entry="download"]');
    assert.equal(download.getAttribute("aria-haspopup"), "menu");
    await key(download, "ArrowRight");
    const sub = doc.querySelector("[data-workspace-download-menu]");
    assert.ok(sub && sub.getAttribute("data-leo-overlay-state") === "open", "→ 没打开下载子菜单");
    assert.deepEqual(
      [...sub.querySelectorAll("[data-workspace-export-action-id]")].map((n) => [n.dataset.workspaceExportActionId, n.dataset.workspaceExportActionKind]),
      [["download-pptx", "default"], ["export-pdf", "secondary"]],
    );
    await key(sub.querySelector('[data-workspace-export-action-id="export-pdf"]'), "ArrowLeft");
    assert.equal(sub.getAttribute("data-leo-overlay-state"), "closed", "← 没收回子菜单");
    await click(download);
    await click(doc.querySelector('[data-workspace-export-action-id="export-pdf"]'));
    assert.deepEqual(triggered, ["pdf"]);
    assert.equal(doc.querySelector("[data-workspace-more-menu]").getAttribute("data-leo-overlay-state"), "closed");
  });
});

test("收藏：点了有看得见的反馈，菜单项跟着变「取消收藏」，星标实心", async () => {
  globalThis.__moreToasts = [];
  await withDom(async ({ doc, container, click, settle, render }) => {
    await render(React.createElement(AdvancedWorkspaceActionBar, props().value));
    const launcher = container.querySelector("[data-workspace-more-launcher]");
    await click(launcher);
    await click(doc.querySelector('[data-more-menu-entry="favorite"]'));
    await settle();
    assert.ok(globalThis.__moreToasts.includes("success:已加入收藏"), `收藏没反馈：${globalThis.__moreToasts}`);
    await click(launcher);
    const favorite = doc.querySelector('[data-more-menu-entry="favorite"]');
    assert.match(favorite.textContent || "", /取消收藏/);
    assert.equal(favorite.querySelector("[data-icon]").getAttribute("data-filled"), "true");
  });
});

test("什么都做不了时不出 ···（不放死按钮）；做不到的项不出、不置灰", async () => {
  await withDom(async ({ doc, container, click, render }) => {
    const bare = props({ item: null, adapter: { directDownload: undefined, actions: [], collab: undefined } });
    await render(React.createElement(AdvancedWorkspaceActionBar, bare.value));
    assert.equal(container.querySelector("[data-workspace-more-launcher]"), null);
    const plain = { ...durableItem(), artifact: undefined, source: "creation" };
    const onlyShare = props({ item: plain, adapter: { directDownload: undefined, actions: [], collab: undefined } });
    await render(React.createElement(AdvancedWorkspaceActionBar, onlyShare.value));
    await click(container.querySelector("[data-workspace-more-launcher]"));
    const menu = doc.querySelector("[data-workspace-more-menu]");
    assert.deepEqual([...menu.querySelectorAll('[role="menuitem"]')].map((n) => n.dataset.moreMenuEntry), ["share"]);
    assert.equal(menu.querySelector("[disabled]"), null, "菜单里有灰按钮");
  });
});
