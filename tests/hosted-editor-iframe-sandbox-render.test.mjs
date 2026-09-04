/**
 * A-92 第二条闸：托管编辑器 iframe 渲染层的 sandbox。
 *
 * UC-3: docs/architecture/oceanleo-untrusted-content-isolation.md §8.3
 *
 * 既有那条（`hosted-editor-contract-v2`「A-24 的要害」）是单元层：
 * 调 `embedEditorFrameSandbox()` 看返回字符串。函数返回对，不等于
 * 画出来的 iframe 上挂的就是那个值——中间还有一段传递。
 *
 * 本文件锁的事实：音频 / 3D 专业模式真挂起来之后，DOM 上那个 iframe
 * 的 sandbox 属性里没有 allow-same-origin。
 * 不拿 `embedEditorFrameSandbox()` 的返回值当期望：函数和消费组件一起
 * 被改坏时，对返回值的相等断言会双双变绿，本闸必须仍红。
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule } from "./helpers/module-bench.mjs";

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

const HOST_PAGE = "https://oceanleo.com/workspace";
const AUDIO_ORIGIN = "https://audio.oceanleo.app";
const MODEL3D_ORIGIN = "https://3d.oceanleo.app";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: HOST_PAGE,
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
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

function sandboxTokens(sandbox) {
  return new Set(String(sandbox).toLowerCase().split(/\s+/).filter(Boolean));
}

function assertIframeDeniesSameOrigin(iframe, label) {
  assert.ok(iframe, `${label}：专业模式挂起来之后没有 iframe 节点`);
  assert.equal(
    iframe.tagName,
    "IFRAME",
    `${label}：画布节点不是 iframe`,
  );
  assert.equal(
    iframe.hasAttribute("sandbox"),
    true,
    `${label}：iframe 上没有 sandbox 属性，等于沙箱不存在`,
  );
  const sandbox = iframe.getAttribute("sandbox") || "";
  const tokens = sandboxTokens(sandbox);
  assert.equal(
    tokens.has("allow-same-origin"),
    false,
    `${label}专业模式的 iframe 上，实际挂的 sandbox 里没有 allow-same-origin`,
  );
  assert.equal(
    tokens.has("allow-scripts") && tokens.has("allow-same-origin"),
    false,
    `${label}专业模式的 iframe 上，实际挂的 sandbox 同时给了脚本和同源，沙箱等于没有`,
  );
}

async function mountCompiled(entry, element) {
  const url = await compileModule(entry, {});
  const mod = await import(url);
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element(mod));
  });
  await act(async () => {});
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test("音频专业模式的 iframe 上，实际挂的 sandbox 里没有 allow-same-origin", async () => {
  const mounted = await mountCompiled(
    "src/shell/media-editors/AudioHostedFrame.tsx",
    (mod) =>
      React.createElement(mod.AudioHostedFrame, {
        instanceId: "w27-audio",
        hostOrigin: "https://oceanleo.com",
        src: `${AUDIO_ORIGIN}/?embed=1`,
        title: "AudioMass",
        onReady() {},
        onSnapshot() {},
        onError() {},
      }),
  );
  try {
    assertIframeDeniesSameOrigin(
      mounted.container.querySelector("[data-testid=audio-hosted-frame]"),
      "音频",
    );
  } finally {
    await mounted.unmount();
  }
});

test("3D 专业模式的 iframe 上，实际挂的 sandbox 里没有 allow-same-origin", async () => {
  const mounted = await mountCompiled(
    "src/shell/media-editors/Model3DHostedFrame.tsx",
    (mod) =>
      React.createElement(mod.Model3DHostedFrame, {
        instanceId: "w27-model3d",
        hostOrigin: "https://oceanleo.com",
        src: `${MODEL3D_ORIGIN}/?embed=1`,
        title: "three.js editor",
        onReady() {},
        onSnapshot() {},
        onError() {},
      }),
  );
  try {
    assertIframeDeniesSameOrigin(
      mounted.container.querySelector("[data-testid=model3d-hosted-frame]"),
      "3D",
    );
  } finally {
    await mounted.unmount();
  }
});
