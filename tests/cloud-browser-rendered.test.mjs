import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";

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

const dom = new JSDOM("<!doctype html><html><body><main></main></body></html>", {
  pretendToBeVisual: true,
  url: "https://chat.oceanleo.com/workspace",
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

function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

const browserStubUrl = dataModule("export {};");
const uiStubUrl = dataModule(`
  export function useUI() {
    return (value, vars) => value.replace(
      /\\{(\\w+)\\}/g,
      (_, key) => String(vars?.[key] ?? "{" + key + "}"),
    );
  }
`);
const liveStubUrl = dataModule(`
  export function redactedDisplayUrl(value) {
    return String(value || "").replace(/[?#].*$/, "");
  }
`);

async function compileComponent(relativePath, additional = {}) {
  const sourcePath = resolve(relativePath);
  let source = await readFile(sourcePath, "utf8");
  for (const [specifier, replacement] of Object.entries({
    react: reactUrl,
    "../lib/browser": browserStubUrl,
    "../i18n/ui/useUI": uiStubUrl,
    "./cloud-browser-live": liveStubUrl,
    ...additional,
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
  return dataModule(compiled);
}

const historyModuleUrl = await compileComponent(
  "src/shell/cloud-browser-history-view.tsx",
);
const { CloudBrowserCheckpointPanel } = await import(historyModuleUrl);
const { CloudBrowserChrome } = await import(
  await compileComponent("src/shell/cloud-browser-chrome.tsx", {
    "./cloud-browser-history-view": historyModuleUrl,
  })
);

const session = {
  id: "session-1",
  session_version: 21,
  runtime_id: "runtime-1",
  incarnation: 4,
  protocol_version: 3,
  stream_generation: 8,
  status: "active",
  last_title: "Saved browsing session",
  created_at: "2026-07-20T00:00:00.000Z",
};
const checkpoint = {
  id: "checkpoint-9",
  session_id: session.id,
  generation: 9,
  created_at: "2026-07-20T03:00:00.000Z",
  page_title: "Checkout",
  page_url: "https://shop.example/checkout?token=hidden",
  state: "hibernated",
  session_version: 17,
  runtime_version: "chrome-window-r42",
};

test("rendered session row has no duplicate browser chrome", async () => {
  const calls = {
    bookmark: 0,
    fullscreen: 0,
    checkpoint: 0,
  };

  function Harness() {
    const [checkpointsOpen, setCheckpointsOpen] = useState(false);
    return React.createElement(CloudBrowserChrome, {
      accent: "#4f46e5",
      sessions: [session],
      selected: session,
      selectedId: session.id,
      transportState: "streaming",
      statusText: "原生 Chrome 窗口实时",
      liveRequested: true,
      driving: true,
      lease: {
        leaseId: "lease",
        epoch: 12,
        holderKind: "human",
        connectionId: "connection",
      },
      controlPending: false,
      busy: false,
      canBookmark: true,
      canCreateCheckpoint: true,
      canHibernate: true,
      deleteArmed: false,
      immersive: false,
      immersiveControlsVisible: true,
      checkpointsOpen,
      checkpoints: [checkpoint],
      checkpointsLoading: false,
      checkpointsError: "",
      onChooseSession() {},
      onOpenOrResume() {},
      onHibernate() {},
      onDelete() {},
      onToggleControl() {},
      onBookmarkCurrentPage() {
        calls.bookmark += 1;
      },
      onToggleCheckpoints() {
        setCheckpointsOpen((value) => !value);
      },
      onCreateCheckpoint() {
        calls.checkpoint += 1;
        return true;
      },
      async onRestoreCheckpoint() {
        return { ok: true };
      },
      onToggleFullscreen() {
        calls.fullscreen += 1;
      },
    });
  }

  const container = document.querySelector("main");
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(Harness)));

  assert.ok(container.querySelector("[data-cloud-browser-session-row]"));
  assert.match(container.textContent, /原生 Chrome 窗口实时/);
  assert.match(container.textContent, /你正在控制 · 租约代 12/);
  assert.match(container.textContent, /释放给 Agent/);
  assert.match(container.textContent, /收藏当前页面/);
  // Flattened bottom bar: 历史 + 新建 + 休眠 replace the old 更多 dropdown.
  assert.match(container.textContent, /历史/);
  assert.match(container.textContent, /新建/);
  assert.match(container.textContent, /休眠/);
  assert.equal(container.querySelector("[data-cloud-browser-more]"), null);
  assert.ok(container.querySelector("[data-cloud-browser-power]"));
  assert.ok(container.querySelector("[data-cloud-browser-hibernate]"));
  const liveStatus = container.querySelector('[role="status"]');
  assert.equal(liveStatus?.getAttribute("aria-live"), "polite");
  for (const button of container.querySelectorAll("button, summary")) {
    assert.ok(
      button.getAttribute("aria-label") || button.textContent.trim(),
      "every session control must have an accessible name",
    );
    assert.notEqual(
      button.getAttribute("tabindex"),
      "-1",
      "session controls must remain keyboard reachable",
    );
  }
  assert.equal(container.querySelector('[role="tablist"]'), null);
  assert.equal(container.querySelector('[role="tab"]'), null);
  assert.equal(container.querySelector("input"), null);
  assert.equal(container.querySelector("[data-cloud-browser-tabs]"), null);
  assert.equal(container.querySelector("[data-cloud-browser-omnibox]"), null);
  assert.equal(container.querySelector("[data-cloud-browser-new-tab]"), null);
  assert.doesNotMatch(container.textContent, /后退|前进|重新加载|新标签页/);

  await act(async () => {
    container
      .querySelector("[data-cloud-browser-bookmark-page]")
      .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    container
      .querySelector("[data-cloud-browser-fullscreen]")
      .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    container
      .querySelector("[data-cloud-browser-checkpoint-history]")
      .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  assert.equal(calls.bookmark, 1);
  assert.equal(calls.fullscreen, 1);
  assert.ok(container.querySelector("[data-cloud-browser-checkpoints]"));

  await act(async () => {
    container
      .querySelector("[data-cloud-browser-create-checkpoint]")
      .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  assert.equal(calls.checkpoint, 1);

  await act(async () => root.unmount());
});

test("checkpoint card exposes pins and restore confirmation/error", async () => {
  const container = document.querySelector("main");
  const root = createRoot(container);
  let restores = 0;

  await act(async () => {
    root.render(
      React.createElement(CloudBrowserCheckpointPanel, {
        sessions: [session],
        selectedId: session.id,
        busy: false,
        deleteArmed: false,
        onChooseSession() {},
        onDelete() {},
        checkpoints: [checkpoint],
        loading: false,
        loadError: "",
        canCreate: false,
        onCreate() {
          return false;
        },
        async onRestore() {
          restores += 1;
          return { ok: false, error: "Pinned runtime is unavailable" };
        },
        onClose() {},
      }),
    );
  });

  const card = container.querySelector(
    "[data-cloud-browser-checkpoint-id='checkpoint-9']",
  );
  assert.ok(card);
  assert.equal(card.dataset.checkpointGeneration, "9");
  assert.equal(card.dataset.checkpointState, "hibernated");
  assert.match(card.textContent, /会话快照第 9 代/);
  assert.match(card.textContent, /Checkout/);
  assert.match(card.textContent, /https:\/\/shop\.example\/checkout/);
  assert.doesNotMatch(card.textContent, /token=hidden/);
  assert.match(card.textContent, /会话 v17 · 运行时 chrome-window-r42/);
  assert.ok(card.querySelector("time")?.dateTime);

  const restore = card.querySelector(
    "[data-cloud-browser-restore-checkpoint]",
  );
  await act(async () => {
    restore.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  assert.equal(restores, 0);
  assert.match(restore.textContent, /确认恢复此会话快照/);

  await act(async () => {
    restore.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
  assert.equal(restores, 1);
  assert.match(
    card.querySelector("[data-cloud-browser-restore-error]").textContent,
    /Pinned runtime is unavailable/,
  );

  await act(async () => root.unmount());
});

test("immersive row advertises and restores auto-hide state", async () => {
  const container = document.querySelector("main");
  const root = createRoot(container);
  const props = {
    accent: "#4f46e5",
    sessions: [session],
    selected: session,
    selectedId: session.id,
    transportState: "streaming",
    statusText: "live",
    liveRequested: true,
    driving: false,
    lease: { leaseId: "lease", epoch: 13, holderKind: "agent" },
    controlPending: false,
    busy: false,
    canBookmark: false,
    canCreateCheckpoint: false,
    canHibernate: false,
    deleteArmed: false,
    checkpointsOpen: false,
    checkpoints: [],
    checkpointsLoading: false,
    checkpointsError: "",
    onChooseSession() {},
    onOpenOrResume() {},
    onHibernate() {},
    onDelete() {},
    onToggleControl() {},
    onBookmarkCurrentPage() {},
    onToggleCheckpoints() {},
    onCreateCheckpoint() {
      return false;
    },
    async onRestoreCheckpoint() {
      return { ok: true };
    },
    onToggleFullscreen() {},
  };

  await act(async () => {
    root.render(
      React.createElement(CloudBrowserChrome, {
        ...props,
        immersive: true,
        immersiveControlsVisible: false,
      }),
    );
  });
  assert.equal(
    container
      .querySelector("[data-cloud-browser-session-row]")
      .dataset.cloudBrowserAutoHidden,
    "true",
  );

  await act(async () => {
    root.render(
      React.createElement(CloudBrowserChrome, {
        ...props,
        immersive: false,
        immersiveControlsVisible: true,
      }),
    );
  });
  assert.equal(
    container
      .querySelector("[data-cloud-browser-session-row]")
      .dataset.cloudBrowserAutoHidden,
    "false",
  );
  await act(async () => root.unmount());
});
