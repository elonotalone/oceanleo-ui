/**
 * 工作流只剩 React Flow 画布（W08）。不再引用已拿掉的专业托管编辑。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { DEFAULT_EDITOR_CORE } from "../src/shell/editor-core-flags.ts";
import { validAgentChips, validReviewProposal } from "../src/shell/hosted-editor/index.ts";
import { chipsForEditor } from "../src/shell/quick-actions/catalog.ts";
import {
  rememberEditorChips,
  resetAgentReviewInbox,
} from "../src/shell/agent-review/inbox.ts";
import { hostReviewSession } from "../src/shell/agent-review/session.ts";
import {
  WORKFLOW_AGENT_CHIPS,
  workflowAgentChipsAreValid,
  workflowToolsManifestChips,
} from "../src/shell/workflow-carrier/l4-chips.ts";
import {
  dispatchWorkflowAgentChip,
  isWorkflowHumanStamp,
  routeWorkflowChip,
} from "../src/shell/workflow-carrier/agent-route.ts";

const read = (relative) =>
  readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

const stage = read("src/shell/workflow-carrier/VideoCanvasStage.tsx");
const routeFn = read("src/shell/workflow-carrier/agent-route.ts");
const canvasRoute = read("src/shell/advanced-routes/VideoCanvasRoute.tsx");
const workbench = read("src/shell/AdvancedContentWorkbench.tsx");
const embeddedRoute = read("src/shell/advanced-routes/EmbeddedRoute.tsx");
const strip = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

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

test("removed hosted-pro files are gone; src no longer names them", () => {
  const gone = [
    "src/shell/workflow-carrier/langflow-embed.ts",
    "src/shell/workflow-carrier/langflow-flow-json.ts",
    "src/shell/workflow-carrier/langflow-hosted-frame.tsx",
    "src/shell/workflow-carrier/langflow-mode.ts",
    "src/shell/workflow-carrier/langflow-pro-stage.tsx",
  ];
  for (const rel of gone) {
    assert.equal(
      existsSync(new URL(`../${rel}`, import.meta.url)),
      false,
      `${rel} 还在，专业托管编辑没拿掉`,
    );
  }
  const srcText = `${stage}\n${canvasRoute}`;
  assert.doesNotMatch(srcText, /langflow/i);
  assert.match(canvasRoute, /<VideoCanvasStage \{\.\.\.props\} \/>/);
  assert.doesNotMatch(strip(canvasRoute), /\blazy\(/);
  assert.doesNotMatch(strip(canvasRoute), /\bdynamic\(/);
});

test("default core stays legacy; pro mode is a no-op", () => {
  assert.equal(DEFAULT_EDITOR_CORE, "legacy");
  assert.match(stage, /unavailableReason: WORKFLOW_PRO_UNAVAILABLE/);
  assert.match(stage, /setMode: \(\) => \{\}/);
  assert.match(stage, /proUnavailableReason: WORKFLOW_PRO_UNAVAILABLE/);
  assert.match(stage, /专业编辑即将到来/);
});

test("chip routing is a pure function that defaults to review", () => {
  assert.match(routeFn, /export function routeWorkflowChip/);
  assert.match(routeFn, /kind: "review"/);
  assert.match(stage, /dispatchWorkflowAgentChip/);
  assert.equal(workflowToolsManifestChips().chips.length, 8);
});

test("A-65 辅闸：工作台/EmbeddedRoute 源码仍挂 VideoCanvasRoute", () => {
  assert.match(canvasRoute, /export function VideoCanvasRoute/);
  assert.match(workbench, /lazyRoute\("video-canvas"/);
  assert.match(
    workbench,
    /if \(capability\.adapter === "video-canvas"\) \{\s*editor = <VideoCanvasRoute \{\.\.\.activeProps\} \/>;/,
  );
  assert.match(embeddedRoute, /embeddedAdapterId === "video-canvas"/);
  assert.match(embeddedRoute, /<VideoCanvasRoute/);
});

test("eight tools-manifest v2 chips pass the host validator; a ninth does not", () => {
  assert.equal(workflowAgentChipsAreValid(), true);
  const manifest = workflowToolsManifestChips();
  assert.equal(manifest.manifestVersion, 2);
  assert.equal(manifest.chips.length, 8);
  assert.equal(validAgentChips(manifest.chips), true);
  const ninth = { ...manifest.chips[0], id: "workflow.chip.ninth", label: "第九条" };
  assert.equal(validAgentChips([...manifest.chips, ninth]), false);
});

test("unstamped mutating chip routes to review; graph is not written", () => {
  resetAgentReviewInbox();
  const graph = sampleGraph();
  const extra = {
    ...graph,
    nodes: [
      ...graph.nodes,
      { id: "extra", kind: "filter", x: 10, y: 10, ports: { inputs: [], outputs: [] } },
    ],
  };
  const routed = routeWorkflowChip({
    chipId: "workflow.chip.gen",
    graph,
    revision: 0,
    proposedGraph: extra,
  });
  assert.equal(routed.kind, "review");
  const dispatched = dispatchWorkflowAgentChip({
    chipId: "workflow.chip.gen",
    graph,
    revision: 0,
    proposedGraph: extra,
  });
  assert.equal(dispatched.parked, true);
  assert.equal(dispatched.graph.nodes.length, graph.nodes.length);
  assert.equal(hostReviewSession.snapshot().parked?.proposal.commandId, "workflow.chip.gen");
  assert.equal(validReviewProposal(routed.proposal), true);
  resetAgentReviewInbox();
});

test("only an explicit human stamp executes; typos still review", () => {
  const graph = sampleGraph();
  const extra = {
    ...graph,
    nodes: [...graph.nodes, { id: "n2", kind: "text", x: 1, y: 1, ports: { inputs: [], outputs: [] } }],
  };
  assert.equal(isWorkflowHumanStamp("user"), true);
  assert.equal(isWorkflowHumanStamp("USER"), false);
  const human = dispatchWorkflowAgentChip({
    chipId: "workflow.chip.gen",
    origin: "l1",
    graph,
    revision: 0,
    proposedGraph: extra,
  });
  assert.equal(human.route.kind, "execute");
  assert.equal(human.graph.nodes.length, extra.nodes.length);
  const typo = routeWorkflowChip({
    chipId: "workflow.chip.gen",
    origin: "Human",
    graph,
    revision: 0,
  });
  assert.equal(typo.kind, "review");
  resetAgentReviewInbox();
});

test("remembered workflow chips surface eight entries for the host catalog", () => {
  resetAgentReviewInbox();
  rememberEditorChips("workflow", workflowToolsManifestChips().chips);
  assert.equal(chipsForEditor("workflow", null).length, 8);
  assert.equal(
    chipsForEditor("workflow", null)
      .map((chip) => chip.id)
      .join(","),
    WORKFLOW_AGENT_CHIPS.map((chip) => chip.id).join(","),
  );
  resetAgentReviewInbox();
});

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
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

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
      "data-role": "workflow-stage-shell",
      children: [
        adapter && adapter.mode
          ? jsx("button", {
              type: "button",
              "data-testid": "workflow-set-pro",
              title: adapter.mode.unavailableReason || "",
              onClick: () => adapter.mode.setMode && adapter.mode.setMode("pro"),
              children: "专业编辑",
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

test("普通模式真画节点和连线；点专业编辑不换舞台", async () => {
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
    const canvas = mounted.container.querySelector(
      "[data-testid=workflow-react-flow-canvas]",
    );
    assert.ok(canvas, "没有画布槽，用户看不到流程图");
    const nodes = mounted.container.querySelectorAll("[data-testid=workflow-node]");
    const edges = mounted.container.querySelectorAll("[data-testid=workflow-edge]");
    assert.equal(nodes.length, 2, "画布上的节点没画出来");
    assert.equal(edges.length, 1, "画布上的连线没画出来");
    const button = mounted.container.querySelector("[data-testid=workflow-set-pro]");
    assert.ok(button, "壳桩没有把 adapter.mode 画成可点按钮");
    assert.equal(button.getAttribute("title"), "专业编辑即将到来");
    await act(async () => {
      button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    assert.ok(
      mounted.container.querySelector("[data-testid=workflow-react-flow-canvas]"),
      "点了专业编辑之后画布消失了",
    );
    assert.equal(mounted.container.querySelector("iframe"), null);
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
      "没传流程图时舞台既不报错也不提示",
    );
  } finally {
    await mounted.unmount();
  }
});
