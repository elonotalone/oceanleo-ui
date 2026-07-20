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

const browserStubUrl = dataModule(`
  export async function cloudBrowserScreenshot() {
    return { ok: false, error: "not loaded in rendered test" };
  }
`);
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

async function compileComponent(relativePath) {
  const sourcePath = resolve(relativePath);
  let source = await readFile(sourcePath, "utf8");
  for (const [specifier, replacement] of Object.entries({
    react: reactUrl,
    "../lib/browser": browserStubUrl,
    "../i18n/ui/useUI": uiStubUrl,
    "./cloud-browser-live": liveStubUrl,
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

const { CloudBrowserChrome } = await import(
  await compileComponent("src/shell/cloud-browser-chrome.tsx")
);
const { CloudBrowserTimeline } = await import(
  await compileComponent("src/shell/cloud-browser-history-view.tsx")
);

test("rendered chrome keeps sessions, tabs, control, and temporary URL UI distinct", async () => {
  const calls = {
    createTab: 0,
    fullscreen: 0,
    submit: 0,
  };
  const session = {
    id: "session-1",
    status: "active",
    last_title: "Saved browsing session",
    created_at: "2026-07-20T00:00:00.000Z",
  };
  const tabs = [
    {
      id: "tab-a",
      title: "Google",
      displayUrl: "https://www.google.com/",
      status: "ready",
    },
    {
      id: "tab-b",
      title: "OceanLeo",
      displayUrl: "https://oceanleo.com/",
      status: "ready",
    },
  ];

  function Harness() {
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState("");
    return React.createElement(CloudBrowserChrome, {
      accent: "#4f46e5",
      sessions: [session],
      selected: session,
      selectedId: session.id,
      tabs,
      activeTabId: "tab-a",
      transportState: "streaming",
      statusText: "实时",
      liveRequested: true,
      driving: true,
      controlPending: false,
      busy: false,
      deleteArmed: false,
      omniboxOpen: open,
      omniboxValue: value,
      omniboxInputRef: { current: null },
      fullscreen: false,
      onChooseSession() {},
      onOpenOrResume() {},
      onHibernate() {},
      onDelete() {},
      onNavigate() {},
      onCreateTab() {
        calls.createTab += 1;
      },
      onActivateTab() {},
      onCloseTab() {},
      onToggleControl() {},
      onOpenOmnibox() {
        setOpen(true);
      },
      onCloseOmnibox() {
        setOpen(false);
      },
      onOmniboxValue: setValue,
      onSubmitOmnibox() {
        calls.submit += 1;
      },
      onCaptureHistory() {},
      onToggleFullscreen() {
        calls.fullscreen += 1;
      },
    });
  }

  const container = document.querySelector("main");
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(Harness)));

  assert.equal(
    container.querySelectorAll("[data-cloud-browser-history] option").length,
    1,
  );
  assert.equal(container.querySelectorAll('[role="tab"]').length, 2);
  assert.match(container.textContent, /已开机/);
  assert.match(container.textContent, /保存并关机/);
  assert.match(container.textContent, /删除记录/);
  assert.match(container.textContent, /交还 Agent/);
  assert.equal(
    container.querySelector("[data-cloud-browser-omnibox]"),
    null,
    "URL input must not occupy persistent chrome",
  );
  assert.equal(container.querySelector("input"), null);

  await act(async () => {
    container
      .querySelector("[data-cloud-browser-open-omnibox]")
      .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  assert.ok(container.querySelector("[data-cloud-browser-omnibox] input"));
  assert.equal(container.querySelectorAll("input").length, 1);

  await act(async () => {
    container
      .querySelector("[data-cloud-browser-new-tab]")
      .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    container
      .querySelector("[data-cloud-browser-fullscreen]")
      .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  assert.equal(calls.createTab, 1);
  assert.equal(calls.fullscreen, 1);

  await act(async () => root.unmount());
});

test("rendered key-history card includes page, tab, redacted URL, time, and reason", async () => {
  const container = document.querySelector("main");
  const root = createRoot(container);
  const event = {
    id: 41,
    title: "Checkout",
    tab_id: "tab-secret",
    display_url: "https://shop.example/checkout",
    reason: "navigation committed",
    captured_at: "2026-07-20T03:00:00.000Z",
    has_screenshot: true,
  };

  await act(async () => {
    root.render(
      React.createElement(CloudBrowserTimeline, {
        events: [event],
        selectedId: 41,
        onSelect() {},
      }),
    );
  });
  const card = container.querySelector("[data-history-event-id='41']");
  assert.ok(card);
  assert.match(card.textContent, /Checkout/);
  assert.match(card.textContent, /tab-secr/);
  assert.match(card.textContent, /https:\/\/shop\.example\/checkout/);
  assert.match(card.textContent, /navigation committed/);
  assert.ok(card.querySelector("time")?.dateTime);

  await act(async () => root.unmount());
});
