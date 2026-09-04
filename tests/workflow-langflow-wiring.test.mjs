/**
 * 工作流换核接线闸（W15）。
 *
 * 源码正则是辅闸（A-48）。V7-red-2：包住 EmbeddedRoute 里那次
 * <VideoCanvasRoute> 调用，正则仍绿——行为锁在本文件挂 EmbeddedRoute、
 * 点专业模式后必须出现 Langflow iframe 的那一例。
 * 普通模式必须真挂画布槽且节点/连线在 DOM 里；专业模式必须真挂 <iframe>，
 * src origin 是 https://flow.oceanleo.app，sandbox 走 embedEditorFrameSandbox()。
 * jsdom 没有 layout：可见性只钉 hidden / aria-hidden / 内联 style / 藏起 class。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { DEFAULT_EDITOR_CORE } from "../src/shell/editor-core-flags.ts";
import { DEFAULT_EDITOR_MODE } from "../src/shell/hosted-editor/index.ts";
import {
  UNTRUSTED_FRAME_SANDBOX,
  embedEditorFrameSandbox,
} from "../src/shell/editor-sandbox-origin.ts";
import {
  WORKFLOW_LANGFLOW_DEFAULT_MODE,
  applyWorkflowEditorMode,
} from "../src/shell/workflow-carrier/langflow-mode.ts";
import {
  WORKFLOW_LANGFLOW_EMBED_ORIGIN,
  buildWorkflowFlowInitEnvelope,
  buildWorkflowLangflowEmbedUrl,
  canBuildWorkflowLangflowEmbedUrl,
  workflowLangflowEmbedBase,
  workflowLangflowFrameSandbox,
} from "../src/shell/workflow-carrier/langflow-embed.ts";
import { workflowToolsManifestChips } from "../src/shell/workflow-carrier/l4-chips.ts";
import { resetAgentReviewInbox } from "../src/shell/agent-review/inbox.ts";

const read = (relative) =>
  readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

const leaf = read("src/shell/workflow-carrier/langflow-pro-stage.tsx");
const frame = read("src/shell/workflow-carrier/langflow-hosted-frame.tsx");
const routeFn = read("src/shell/workflow-carrier/agent-route.ts");
const modeFn = read("src/shell/workflow-carrier/langflow-mode.ts");
const canvasRoute = read("src/shell/advanced-routes/VideoCanvasRoute.tsx");
const workbench = read("src/shell/AdvancedContentWorkbench.tsx");
const embeddedRoute = read("src/shell/advanced-routes/EmbeddedRoute.tsx");
const strip = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const leafCode = strip(leaf);
const frameCode = strip(frame);
const routeCode = strip(routeFn);

test("default core stays legacy; pro iframe is planned by a pure function", () => {
  assert.equal(DEFAULT_EDITOR_CORE, "legacy");
  assert.equal(WORKFLOW_LANGFLOW_DEFAULT_MODE, DEFAULT_EDITOR_MODE);
  assert.match(leaf, /applyWorkflowEditorMode/);
  assert.match(leaf, /useState<EditorMode>\(WORKFLOW_LANGFLOW_DEFAULT_MODE\)/);
  assert.match(leaf, /mode: \{ current: mode, setMode: applyMode \}/);
  assert.match(leaf, /showHosted/);
  assert.match(leaf, /LangflowHostedFrame/);
  assert.match(modeFn, /showHostedEditor: pro/);
  assert.match(modeFn, /showCanvas: !pro/);
  assert.doesNotMatch(leafCode, /postMessage\(/);
});

test("Langflow iframe is untrusted: no allow-same-origin, exact targetOrigin", () => {
  assert.equal(
    embedEditorFrameSandbox("https://flow.oceanleo.app"),
    UNTRUSTED_FRAME_SANDBOX,
  );
  assert.equal(UNTRUSTED_FRAME_SANDBOX.includes("allow-same-origin"), false);
  assert.equal(
    workflowLangflowFrameSandbox(),
    embedEditorFrameSandbox("https://flow.oceanleo.app"),
  );
  assert.match(frame, /workflowLangflowFrameSandbox/);
  assert.match(frame, /referrerPolicy="no-referrer"/);
  assert.match(frame, /postMessage\(checked, WORKFLOW_LANGFLOW_EMBED_ORIGIN\)/);
  assert.doesNotMatch(frameCode, /postMessage\([^,]+,\s*["']\*["']/);
  assert.doesNotMatch(frameCode, /allow-same-origin/);
  assert.equal(WORKFLOW_LANGFLOW_EMBED_ORIGIN, "https://flow.oceanleo.app");
  assert.equal(canBuildWorkflowLangflowEmbedUrl(workflowLangflowEmbedBase()), true);
  assert.throws(
    () =>
      buildWorkflowLangflowEmbedUrl({
        instanceId: "wf-1",
        hostOrigin: "https://oceanleo.com",
        extra: { token: "nope" },
      }),
    /凭据/,
  );
});

test("chip routing is a pure function that defaults to review", () => {
  assert.match(routeFn, /export function routeWorkflowChip/);
  assert.match(routeFn, /kind: "review"/);
  assert.match(routeFn, /isWorkflowHumanStamp/);
  assert.match(routeCode, /return \{ kind: "execute", chipId \}/);
  assert.match(leaf, /dispatchWorkflowAgentChip/);
  assert.match(leaf, /rememberEditorChips\("workflow"/);
  assert.equal(workflowToolsManifestChips().chips.length, 8);
});

test("A-65 辅闸：工作台/EmbeddedRoute 源码仍挂 VideoCanvasRoute（行为锁在挂 EmbeddedRoute 那例）", () => {
  const canvasRouteCode = canvasRoute
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const workbenchCode = workbench
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const embeddedCode = embeddedRoute
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  assert.match(canvasRoute, /export function VideoCanvasRoute/);
  assert.match(canvasRoute, /<LangflowProStage \{\.\.\.props\} \/>/);
  assert.doesNotMatch(canvasRouteCode, /false && <LangflowProStage/);
  assert.doesNotMatch(canvasRouteCode, /\blazy\(/);
  assert.doesNotMatch(canvasRouteCode, /\bdynamic\(/);
  assert.match(workbench, /lazyRoute\("video-canvas"/);
  assert.match(
    workbench,
    /if \(capability\.adapter === "video-canvas"\) \{\s*editor = <VideoCanvasRoute \{\.\.\.activeProps\} \/>;/,
  );
  assert.doesNotMatch(
    workbenchCode,
    /false && capability\.adapter === "video-canvas"/,
  );
  assert.match(embeddedRoute, /embeddedAdapterId === "video-canvas"/);
  assert.match(embeddedRoute, /<VideoCanvasRoute/);
  assert.doesNotMatch(
    embeddedCode,
    /false && embeddedAdapterId === "video-canvas"/,
  );
});

const require = createRequire(import.meta.url);
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
const reactUrl = pathToFileURL(require.resolve("react")).href;

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

const FLOW_ORIGIN = "https://flow.oceanleo.app";
const HOST_PAGE = "https://oceanleo.com/workspace";
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
globalThis.fetch = async () => {
  throw new Error("工作流接线闸首屏不该发网络请求");
};

const shellStubUrl = dataModule(`
  import { jsx, jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AdvancedWorkbenchShell({ adapter }) {
    return jsxs("div", {
      "data-role": "workflow-next-shell",
      children: [
        adapter && adapter.mode
          ? jsx("button", {
              type: "button",
              "data-testid": "workflow-set-pro",
              onClick: () => adapter.mode.setMode("pro"),
              children: "专业模式",
            })
          : null,
        adapter && adapter.stage ? adapter.stage : null,
      ],
    });
  }
`);
const pluginStubUrl = dataModule(`
  export function usePluginCommandSurface() {}
`);
const embedStubUrl = dataModule(`
  export function embedEditorBase() { return ""; }
  export function EmbedEditorPane() { return null; }
`);

const leafStubs = {
  "../AdvancedWorkbenchShell": shellStubUrl,
  "../plugin-command": pluginStubUrl,
  "../workbench-embed": embedStubUrl,
};

/**
 * 可达性闸的桩表。**故意不桩 `./VideoCanvasRoute`**：EmbeddedRoute 必须
 * 解析到真叶子，否则又回到「只锁舞台、包住调用仍绿」（V7-red-2）。
 */

function sampleGraph() {
  return {
    nodes: [
      {
        id: "src-a",
        kind: "source",
        x: 0,
        y: 0,
        ports: { inputs: [], outputs: [{ name: "out", dataType: "video" }] },
      },
      {
        id: "out-a",
        kind: "output",
        x: 200,
        y: 0,
        ports: { inputs: [{ name: "final", dataType: "video" }], outputs: [] },
      },
    ],
    edges: [
      {
        id: "e1",
        fromNodeId: "src-a",
        fromPort: "out",
        toNodeId: "out-a",
        toPort: "final",
      },
    ],
  };
}

function workflowItem() {
  return {
    key: "wf-gate",
    source: "artifact",
    id: "wf-gate",
    title: "闸",
    kind: "canvas",
    siteId: "video",
    favorite: false,
    meta: { graph: sampleGraph() },
  };
}

/**
 * EmbeddedRoute 走 editorRouteFor(item)。kind: "canvas" 且没有
 * meta.editor === "video-canvas" 会落到 design-canvas，进不了
 * VideoCanvasRoute。这条用户入口必须是 video_canvas。
 */
function embeddedWorkflowItem() {
  const item = workflowItem();
  return {
    ...item,
    key: "wf-embed-gate",
    id: "wf-embed-gate",
    kind: "video_canvas",
    meta: {
      ...item.meta,
      editor: "video-canvas",
    },
  };
}

function concealmentReason(node) {
  let current = node;
  while (current && current.nodeType === 1) {
    if (current.hasAttribute("hidden")) return "hidden";
    if (current.getAttribute("aria-hidden") === "true") return "aria-hidden";
    const style = String(current.getAttribute("style") || "");
    if (/display\s*:\s*none/i.test(style)) return "display:none";
    const cls = String(current.getAttribute("class") || "");
    if (/(?:^|\s)(?:hidden|invisible|sr-only)(?:\s|$)/.test(cls)) {
      return `class ${cls}`;
    }
    if (/(?:^|\s)h-0(?:\s|$)/.test(cls) && /(?:^|\s)w-0(?:\s|$)/.test(cls)) {
      return "h-0 w-0";
    }
    current = current.parentElement;
  }
  return null;
}

function assertLiveLangflowIframe(iframe) {
  assert.ok(iframe, "专业模式挂起来之后没有 iframe 节点，用户看不到 Langflow");
  assert.equal(iframe.tagName, "IFRAME", "画布节点不是 iframe（标签被换成别的了）");
  const src = iframe.getAttribute("src") || "";
  assert.ok(src, "iframe 的 src 是空的，用户看见的是无法构造嵌入地址");
  assert.equal(
    new URL(src).origin,
    FLOW_ORIGIN,
    `iframe src origin 不是 flow 托管域：${src}`,
  );
  const expectedSandbox = embedEditorFrameSandbox(FLOW_ORIGIN);
  assert.equal(
    iframe.getAttribute("sandbox"),
    expectedSandbox,
    "sandbox 没有走 embedEditorFrameSandbox()",
  );
  assert.equal(expectedSandbox.includes("allow-same-origin"), false);
  const hidden = concealmentReason(iframe);
  assert.equal(
    hidden,
    null,
    `iframe 还在 DOM 里，但祖先带了藏起标记 ${hidden}。jsdom 没有 layout，这条钉的是 class / hidden / aria-hidden / 内联 style，不是在假装量了可见像素。`,
  );
}

async function flushLazy(container, selector) {
  // A-69：account-page.test.mjs:219-231 的空 act 冲刷。
  // 样板：deck-core-swap 第 39 例、rich-doc-core-swap 第 16 例。
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {});
    if (selector && container && container.querySelector(selector)) return;
  }
  if (!selector || !container) return;
  for (let i = 0; i < 40; i += 1) {
    if (container.querySelector(selector)) return;
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    });
  }
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
    mod,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function assertUserSeesWorkflowEditor(container) {
  const iframe =
    container.querySelector("[data-testid=workflow-langflow-frame]") ||
    container.querySelector("iframe");
  assert.ok(
    iframe,
    "从 EmbeddedRoute 走进去之后没有工作流编辑器（Langflow iframe），用户看不到工作流编辑器",
  );
  const src = iframe.getAttribute("src") || "";
  let origin = "";
  try {
    origin = src ? new URL(src).origin : "";
  } catch {
    origin = "";
  }
  assert.equal(
    origin,
    FLOW_ORIGIN,
    `从 EmbeddedRoute 走进去之后用户看到的不是工作流编辑器（iframe 在 ${origin || "空 src"}，不是 Langflow）`,
  );
  assertLiveLangflowIframe(iframe);
}

test("jsdom 挂上 LangflowHostedFrame 后，画布是真 iframe 而不是 fallback", async () => {
  const src = buildWorkflowLangflowEmbedUrl({
    instanceId: "wf-gate",
    hostOrigin: "https://oceanleo.com",
    assetTitle: "闸",
  });
  const mounted = await mountCompiled(
    "src/shell/workflow-carrier/langflow-hosted-frame.tsx",
    {},
    (mod) =>
      React.createElement(mod.LangflowHostedFrame, {
        instanceId: "wf-gate",
        hostOrigin: "https://oceanleo.com",
        src,
        title: "Langflow",
        onReady() {},
        onSnapshot() {},
        onError() {},
      }),
  );
  try {
    assertLiveLangflowIframe(mounted.container.querySelector("iframe"));
  } finally {
    await mounted.unmount();
  }
});

test("host 往 Langflow 发消息必须钉死 flow origin，不许 *", async () => {
  const url = await compileModule(
    "src/shell/workflow-carrier/langflow-hosted-frame.tsx",
    {},
  );
  const mod = await import(url);
  const calls = [];
  const frame = {
    postMessage(data, origin) {
      calls.push({ data, origin });
    },
  };
  const envelope = buildWorkflowFlowInitEnvelope("wf-pm", {
    flow: {
      id: "wf-pm",
      name: "闸",
      data: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
    },
    readOnly: false,
  });
  assert.equal(mod.postWorkflowInit(frame, "wf-pm", envelope), true);
  assert.equal(mod.postWorkflowSetMode(frame, "wf-pm", "pro"), true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].origin, WORKFLOW_LANGFLOW_EMBED_ORIGIN);
  assert.equal(calls[1].origin, WORKFLOW_LANGFLOW_EMBED_ORIGIN);
  assert.notEqual(calls[0].origin, "*");
  assert.notEqual(calls[1].origin, "*");
});

test("专业模式必须出现 Langflow iframe", async () => {
  resetAgentReviewInbox();
  const mounted = await mountCompiled(
    "src/shell/advanced-routes/VideoCanvasRoute.tsx",
    leafStubs,
    (mod) =>
      React.createElement(mod.VideoCanvasRoute, {
        item: workflowItem(),
        onClose() {},
      }),
  );
  try {
    const button = mounted.container.querySelector("[data-testid=workflow-set-pro]");
    assert.ok(button, "壳桩没有把 adapter.mode.setMode 画成可点的专业模式按钮");
    await act(async () => {
      button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {});
    assertLiveLangflowIframe(
      mounted.container.querySelector("[data-testid=workflow-langflow-frame]"),
    );
  } finally {
    await mounted.unmount();
    resetAgentReviewInbox();
  }
});

test("普通模式真画节点和连线；专业模式才挂 Langflow iframe", async () => {
  resetAgentReviewInbox();
  const mounted = await mountCompiled(
    "src/shell/advanced-routes/VideoCanvasRoute.tsx",
    leafStubs,
    (mod) =>
      React.createElement(mod.VideoCanvasRoute, {
        item: workflowItem(),
        onClose() {},
      }),
  );
  try {
    assert.equal(
      mounted.container.querySelector("[data-testid=workflow-langflow-frame]"),
      null,
      "普通模式不该挂 Langflow iframe",
    );
    const canvas = mounted.container.querySelector(
      "[data-testid=workflow-react-flow-canvas]",
    );
    assert.ok(canvas, "普通模式没有画布槽，用户看不到流程图");
    assert.equal(concealmentReason(canvas), null);
    const nodes = mounted.container.querySelectorAll("[data-testid=workflow-node]");
    const edges = mounted.container.querySelectorAll("[data-testid=workflow-edge]");
    assert.equal(nodes.length, 2, "画布上的节点没画出来");
    assert.equal(edges.length, 1, "画布上的连线没画出来，节点等于连不上");
    const edge = edges[0];
    assert.equal(edge.getAttribute("data-from"), "src-a");
    assert.equal(edge.getAttribute("data-to"), "out-a");
    assert.equal(edge.getAttribute("data-from-port"), "out");
    assert.equal(edge.getAttribute("data-to-port"), "final");

    const button = mounted.container.querySelector("[data-testid=workflow-set-pro]");
    assert.ok(button, "壳桩没有把 adapter.mode.setMode 画成可点的专业模式按钮");
    await act(async () => {
      button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {});
    assertLiveLangflowIframe(mounted.container.querySelector("iframe"));
    assert.equal(
      mounted.container.querySelector("[data-testid=workflow-react-flow-canvas]"),
      null,
      "专业模式还叠着普通画布，用户会看到两张图",
    );
  } finally {
    await mounted.unmount();
    resetAgentReviewInbox();
  }
});

test("少传 item 时舞台说出原因，而不是空白当成功", async () => {
  const mounted = await mountCompiled(
    "src/shell/advanced-routes/VideoCanvasRoute.tsx",
    leafStubs,
    (mod) =>
      React.createElement(mod.VideoCanvasRoute, {
        item: null,
        onClose() {},
      }),
  );
  try {
    assert.ok(
      mounted.container.querySelector("[data-testid=workflow-missing-item]"),
      "没传流程图时舞台既不报错也不提示，用户会以为图丢了",
    );
    assert.equal(mounted.container.querySelector("iframe"), null);
  } finally {
    await mounted.unmount();
  }
});

test("pro 计划在 src 算不出时不能假装挂了 iframe", () => {
  const planned = applyWorkflowEditorMode("wf-1", "pro");
  assert.equal(planned.showHostedEditor, true);
  assert.match(leaf, /workflow-pro-unavailable/);
  assert.match(leaf, /applied\.showHostedEditor && !hostedSrc/);
});

test("jsdom 挂上 EmbeddedRoute 点专业模式后，用户看见工作流编辑器", async () => {
  resetAgentReviewInbox();
  const mounted = await mountCompiled(
    "src/shell/advanced-routes/EmbeddedRoute.tsx",
    leafStubs,
    (mod) =>
      React.createElement(mod.EmbeddedRoute, {
        item: embeddedWorkflowItem(),
        onClose() {},
      }),
  );
  try {
    await flushLazy(mounted.container, "[data-testid=workflow-set-pro]");
    const button = mounted.container.querySelector(
      "[data-testid=workflow-set-pro]",
    );
    if (button) {
      await act(async () => {
        button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      });
      await flushLazy(
        mounted.container,
        "[data-testid=workflow-langflow-frame]",
      );
    } else {
      await flushLazy(mounted.container, "iframe");
    }
    assertUserSeesWorkflowEditor(mounted.container);
  } finally {
    await mounted.unmount();
    resetAgentReviewInbox();
  }
});
