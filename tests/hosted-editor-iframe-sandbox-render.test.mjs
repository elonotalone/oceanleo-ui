/**
 * A-92 / A-95 第二条闸：托管编辑器 iframe 渲染层的 sandbox。
 *
 * UC-3 修订（2026-09-06 操作员裁定）：
 * docs/architecture/oceanleo-untrusted-content-isolation.md 「UC-3 修订」
 *
 * 既有那条（`hosted-editor-contract-v2`「A-24 的要害」）是单元层：
 * 调 `embedEditorFrameSandbox()` 看返回字符串。函数返回对，不等于
 * 画出来的 iframe 上挂的就是那个值——中间还有一段传递。
 *
 * 本文件锁的事实：六件专业模式真挂起来之后，DOM 上那个 iframe
 * 的 sandbox 属性里**有** allow-same-origin（HOSTED_EDITOR_SANDBOX）。
 * 不拿 `embedEditorFrameSandbox()` 的返回值当期望：函数和消费组件一起
 * 被改坏时，对返回值的相等断言会双双变绿，本闸必须仍红。
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

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

const HOST_PAGE = "https://oceanleo.com/workspace";
const AUDIO_ORIGIN = "https://audio.oceanleo.app";
const MODEL3D_ORIGIN = "https://3d.oceanleo.app";
const GAME_ORIGIN = "https://game-ide.oceanleo.app";
const FLOW_ORIGIN = "https://flow.oceanleo.app";

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

const shellStubUrl = dataModule(`
  import { jsx, jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AdvancedWorkbenchShell({ adapter }) {
    return jsxs("div", {
      "data-role": "hosted-editor-shell",
      children: [
        adapter && adapter.stage ? adapter.stage : null,
        adapter && adapter.status
          ? jsx("div", { "data-role": "hosted-editor-status", children: adapter.status })
          : null,
      ],
    });
  }
`);
const routesStubUrl = dataModule(`
  export function editorToolLabel() { return "hosted"; }
`);
const agentReviewStubUrl = dataModule(`
  export function submitRawReviewProposal() { return "ok"; }
`);

function sandboxTokens(sandbox) {
  return new Set(String(sandbox).toLowerCase().split(/\s+/).filter(Boolean));
}

function assertIframeGrantsHostedSameOrigin(iframe, label) {
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
  // 字面量令牌，不拿 embedEditorFrameSandbox() 返回值当期望。
  assert.equal(
    tokens.has("allow-same-origin"),
    true,
    `${label}专业模式的 iframe 上，实际挂的 sandbox 必须有 allow-same-origin`,
  );
  assert.equal(
    tokens.has("allow-scripts"),
    true,
    `${label}专业模式的 iframe 上，实际挂的 sandbox 必须有 allow-scripts`,
  );
  assert.equal(
    sandbox,
    "allow-same-origin allow-scripts allow-forms allow-popups allow-downloads allow-modals",
    `${label}：DOM sandbox 必须是 HOSTED_EDITOR_SANDBOX 令牌串`,
  );
}

async function mountCompiled(entry, stubs, element) {
  const url = await compileModule(entry, stubs);
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

function workbenchItem(kind, id) {
  return {
    key: id,
    source: "artifact",
    id,
    title: "闸",
    kind,
    siteId: "website",
    favorite: false,
    meta: {},
  };
}

// UC-3 修订（2026-09-06）：我方部署的 AudioMass 拿隔离域同源沙箱。
test("音频专业模式的 iframe 上，实际挂的 sandbox 含 allow-same-origin", async () => {
  const mounted = await mountCompiled(
    "src/shell/media-editors/AudioHostedFrame.tsx",
    {},
    (mod) =>
      React.createElement(mod.AudioHostedFrame, {
        instanceId: "w30-audio",
        hostOrigin: "https://oceanleo.com",
        src: `${AUDIO_ORIGIN}/?embed=1`,
        title: "AudioMass",
        onReady() {},
        onSnapshot() {},
        onError() {},
      }),
  );
  try {
    assertIframeGrantsHostedSameOrigin(
      mounted.container.querySelector("[data-testid=audio-hosted-frame]"),
      "音频",
    );
  } finally {
    await mounted.unmount();
  }
});

// UC-3 修订（2026-09-06）：我方部署的 three.js editor 拿隔离域同源沙箱。
test("3D 专业模式的 iframe 上，实际挂的 sandbox 含 allow-same-origin", async () => {
  const mounted = await mountCompiled(
    "src/shell/media-editors/Model3DHostedFrame.tsx",
    {},
    (mod) =>
      React.createElement(mod.Model3DHostedFrame, {
        instanceId: "w30-model3d",
        hostOrigin: "https://oceanleo.com",
        src: `${MODEL3D_ORIGIN}/?embed=1`,
        title: "three.js editor",
        onReady() {},
        onSnapshot() {},
        onError() {},
      }),
  );
  try {
    assertIframeGrantsHostedSameOrigin(
      mounted.container.querySelector("[data-testid=model3d-hosted-frame]"),
      "3D",
    );
  } finally {
    await mounted.unmount();
  }
});

// UC-3 修订（2026-09-06）：我方部署的 PPTist 拿隔离域同源沙箱。
test("幻灯片专业模式的 iframe 上，实际挂的 sandbox 含 allow-same-origin", async () => {
  const mounted = await mountCompiled(
    "src/shell/advanced-routes/DeckHostedRoute.tsx",
    {
      "../AdvancedWorkbenchShell": shellStubUrl,
      "../workbench-routes": routesStubUrl,
    },
    (mod) =>
      React.createElement(mod.DeckHostedRoute, {
        item: workbenchItem("ppt", "w30-slides"),
        onClose() {},
      }),
  );
  try {
    assertIframeGrantsHostedSameOrigin(
      mounted.container.querySelector("iframe"),
      "幻灯片",
    );
  } finally {
    await mounted.unmount();
  }
});

// UC-3 修订（2026-09-06）：我方部署的 Umo 拿隔离域同源沙箱。
test("文档专业模式的 iframe 上，实际挂的 sandbox 含 allow-same-origin", async () => {
  const mounted = await mountCompiled(
    "src/shell/advanced-routes/RichDocHostedRoute.tsx",
    {
      "../AdvancedWorkbenchShell": shellStubUrl,
      "../workbench-routes": routesStubUrl,
      "../agent-review": agentReviewStubUrl,
    },
    (mod) =>
      React.createElement(mod.RichDocHostedRoute, {
        item: workbenchItem("document", "w30-docs"),
        onClose() {},
      }),
  );
  try {
    assertIframeGrantsHostedSameOrigin(
      mounted.container.querySelector("iframe"),
      "文档",
    );
  } finally {
    await mounted.unmount();
  }
});

// UC-3 修订（2026-09-06）：白名单仍含 game-ide；W08 后无消费者，沙箱档仍按 hosted。
test("游戏专业模式的 iframe 上，实际挂的 sandbox 含 allow-same-origin", async () => {
  const mounted = await mountCompiled(
    "src/shell/game-editor/GameHostedFrame.tsx",
    {},
    (mod) =>
      React.createElement(mod.GameHostedFrame, {
        instanceId: "w30-game",
        hostOrigin: "https://oceanleo.com",
        src: `${GAME_ORIGIN}/?embed=1`,
        title: "microStudio",
        onReady() {},
        onExport() {},
        onError() {},
      }),
  );
  try {
    assertIframeGrantsHostedSameOrigin(
      mounted.container.querySelector("[data-testid=game-hosted-frame]"),
      "游戏",
    );
  } finally {
    await mounted.unmount();
  }
});

// UC-3 修订（2026-09-06）：白名单仍含 flow；W08 后无消费者，沙箱档仍按 hosted。
test("工作流专业模式的 iframe 上，实际挂的 sandbox 含 allow-same-origin", async () => {
  const mounted = await mountCompiled(
    "src/shell/workflow-carrier/langflow-hosted-frame.tsx",
    {},
    (mod) =>
      React.createElement(mod.LangflowHostedFrame, {
        instanceId: "w30-flow",
        hostOrigin: "https://oceanleo.com",
        src: `${FLOW_ORIGIN}/?embed=1`,
        title: "Langflow",
        onReady() {},
        onSnapshot() {},
        onError() {},
      }),
  );
  try {
    assertIframeGrantsHostedSameOrigin(
      mounted.container.querySelector("[data-testid=workflow-langflow-frame]"),
      "工作流",
    );
  } finally {
    await mounted.unmount();
  }
});
