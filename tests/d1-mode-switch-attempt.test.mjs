import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act, useState } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

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
  url: "https://test.dev.oceanleo.com/",
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
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// L0 模式 store 的可控替身：PluginModeSwitchGate 例用它翻 pro。同一 data: URL
// 只实例化一次，所以下面 `import(pluginModeStub)` 拿到的就是门里那一份。
const reactUrl = pathToFileURL(require.resolve("react")).href;
const pluginModeStub = dataModule(`
  import { useSyncExternalStore } from ${JSON.stringify(reactUrl)};
  let mode = "normal";
  const listeners = new Set();
  export function __setPluginMode(next) { mode = next; for (const l of listeners) l(); }
  export function usePluginMode(pluginId) {
    const current = useSyncExternalStore(
      (l) => { listeners.add(l); return () => listeners.delete(l); },
      () => mode,
      () => "normal",
    );
    return { mode: current, pro: current === "pro", pluginId, setMode: __setPluginMode, toggle() {} };
  }
`);
const gateUrl = await compileModule(
  "src/shell/advanced-routes/mode-switch-gate.tsx",
  {
    "../../i18n/ui/useUI": dataModule(
      `export function useUI() { return (key) => key; }`,
    ),
    "../plugin-chrome/plugin-mode": pluginModeStub,
  },
);
const { __setPluginMode } = await import(pluginModeStub);
const {
  ModeSwitchGate,
  PluginModeSwitchGate,
  useModeSwitchReady,
  MODE_SWITCH_FALLBACK_MS,
} = await import(gateUrl);
const { createRoot } = await import("react-dom/client");

const h = React.createElement;

// A parent may publish a fresh adapter while the source is being captured.
// That render must neither recapture the draft nor restart the deadline.
async function fixture({ capture, ready = false, fallbackMs = 80 } = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let controls;
  let proMounts = 0;
  function Face({ pro, ready }) {
    useModeSwitchReady(ready);
    React.useEffect(() => { if (pro) proMounts++; }, []);
    return h("div", { "data-face": pro ? "pro" : "normal" });
  }
  function Host() {
    const [pro, setPro] = useState(false);
    const [revision, bump] = useState(0);
    const [isReady, setReady] = useState(ready);
    controls = { setPro, bump: () => bump(revision + 1), setReady };
    return h(ModeSwitchGate, {
      pro, fallbackMs, beforeEnterPro: capture,
      onEnterProFailed: () => setPro(false),
      onRetryEnterPro: () => setPro(true),
      renderNormal: () => h(Face, { pro: false, ready: true }),
      renderPro: () => h(Face, { pro: true, ready: isReady }),
    });
  }
  await act(async () => root.render(h(Host)));
  return {
    get controls() { return controls; },
    get proMounts() { return proMounts; },
    q: selector => container.querySelector(selector),
    async close() { await act(async () => root.unmount()); container.remove(); },
  };
}

test("D1: rerendering a failure callback does not recapture the current draft", async () => {
  let calls = 0;
  let resolveCapture;
  const handoff = new Promise(resolve => { resolveCapture = resolve; });
  const m = await fixture({ capture: () => { calls++; return handoff; } });
  try {
    await act(async () => m.controls.setPro(true));
    await act(async () => m.controls.bump());
    await act(async () => m.controls.bump());
    assert.equal(calls, 1);
    await act(async () => resolveCapture({ ok: true, handoff: { kind: "inline", json: { title: "same draft" } } }));
    await act(async () => m.controls.setReady(true));
    assert.equal(m.q("[data-mode-switch-pending]"), null);
    assert.equal(m.q("[data-mode-switch-gate]").dataset.modeSwitchShown, "pro");
  } finally { await m.close(); }
});

test("D1: captured source without an editor ready signal still times out to normal", async () => {
  const m = await fixture({ capture: async () => ({ ok: true, handoff: { kind: "inline", json: {} } }) });
  try {
    await act(async () => m.controls.setPro(true));
    assert.ok(m.q('[data-face="pro"]'));
    await act(async () => new Promise(resolve => setTimeout(resolve, 110)));
    assert.equal(m.q("[data-mode-switch-pending]"), null);
    assert.ok(m.q('[data-face="normal"]'));
    assert.equal(m.q('[data-face="pro"]'), null);
    assert.ok(m.q("[data-mode-switch-handoff-error]"));
  } finally { await m.close(); }
});

test("D1: a late capture cannot reopen a timed-out entry; the page tab can retry", async () => {
  let finish;
  let calls = 0;
  const m = await fixture({ capture: () => ++calls === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ ok: true }) });
  try {
    await act(async () => m.controls.setPro(true));
    await act(async () => new Promise(resolve => setTimeout(resolve, 110)));
    await act(async () => finish({ ok: true, handoff: { kind: "inline", json: {} } }));
    assert.equal(m.q('[data-face="pro"]'), null);
    assert.equal(m.q("[data-mode-switch-pending]"), null);
    await act(async () => m.controls.setPro(true));
    await act(async () => m.controls.setReady(true));
    assert.equal(calls, 2);
    assert.equal(m.q("[data-mode-switch-handoff-error]"), null);
    assert.equal(m.q("[data-mode-switch-gate]").dataset.modeSwitchShown, "pro");
  } finally { await m.close(); }
});


test("D1: pro never mounts before the captured draft is available", async () => {
  let finish;
  const m = await fixture({ capture: () => new Promise(resolve => { finish = resolve; }) });
  try {
    await act(async () => m.controls.setPro(true));
    assert.equal(m.proMounts, 0);
    await act(async () => finish({ ok: true, handoff: { kind: "inline", json: { title: "captured" } } }));
    assert.equal(m.proMounts, 1);
    await act(async () => m.controls.setReady(true));
  } finally { await m.close(); }
});
