/**
 * W01 · 工作台 → 路由 共享可达性闸（A-73 / A-65 / A-48）
 *
 * 锁的是「用户从 App 工作台走进去，看不看得见这件编辑器」。
 * 十三件共用 `AdvancedContentWorkbench.tsx` 一处分发，所以是一条闸，
 * 不是十三条。各件自己的 `*-core-swap` / wiring 闸挂的是 Route，
 * 父 agent 在 `/tmp/pk5` 把 `editor = <DeckRoute />` 改成
 * `editor = false && <DeckRoute />` 之后那些闸逐位仍绿。
 *
 * 本闸 jsdom 真挂 `AdvancedContentWorkbench`（冲过 `:168-171` 的
 * `useEffect` 前 `return null`，以及 `lazyRoute` + `next/dynamic`）。
 * Route 叶子打成带用户可见画布的桩：顺着 lazy 把 Univer / PPTist /
 * Fabric 整棵编进来会把测试卡在编译台，而本环要锁的是分发赋值，
 * 不是各件内核。摘掉工作台那一行，桩不会出现，断言红在
 * 「用户看不见这件编辑器」。
 *
 * slides / docs 不适用：工作台不直达 hosted 叶子。
 * 干净树 `advanced-workbench` 第 10 例孤儿红与本环无关，本文件不跑它。
 *
 * 跑法（`package.json` test 脚本那串 flag，`_COMMON.md` §7b⑫）：
 *   node --test --import ./tests/helpers/assert-dom-guard.mjs \
 *     --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs \
 *     tests/advanced-workbench-reachability.test.mjs
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  editorCapabilityFor,
  editorToolLabel,
} from "../src/shell/workbench-routes.ts";

const workbenchSource = readFileSync(
  "src/shell/AdvancedContentWorkbench.tsx",
  "utf8",
);

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

const HOST_PAGE = "https://oceanleo.com/workspace";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: HOST_PAGE,
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
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
  throw new Error("AdvancedContentWorkbench 首屏不该发网络请求");
};

const dynamicStubUrl = dataModule(`
  import { createElement, useEffect, useState } from ${JSON.stringify(reactUrl)};
  export default function dynamic(loader, options) {
    return function DynamicWorkbenchRoute(props) {
      const [Comp, setComp] = useState(null);
      useEffect(() => {
        let cancelled = false;
        Promise.resolve()
          .then(() => loader())
          .then((mod) => {
            if (cancelled) return;
            const resolved =
              typeof mod === "function"
                ? mod
                : mod && (mod.default || Object.values(mod).find((value) => typeof value === "function"));
            setComp(() => (typeof resolved === "function" ? resolved : null));
          });
        return () => {
          cancelled = true;
        };
      }, []);
      if (typeof Comp !== "function") {
        return options && typeof options.loading === "function"
          ? createElement(options.loading)
          : null;
      }
      return createElement(Comp, props);
    };
  }
`);

const navigationStubUrl = dataModule(`
  export function useRouter() {
    return { replace() {}, push() {}, prefetch() {} };
  }
`);

const workspaceStubUrl = dataModule(`
  const workspace = {
    session: null,
    sessionId: "workbench-reach-session",
    taskId: null,
    availability: "ready",
    ensureActive: async () => null,
    bindTask: async () => null,
    saveSnapshot: async () => ({ ok: true }),
  };
  export function WorkspaceSessionProvider({ children }) { return children; }
  export function useOptionalWorkspaceSession() { return workspace; }
  export function useWorkspaceSession() { return workspace; }
`);

const materialStubUrl = dataModule(`
  export function WorkbenchMaterialProvider({ children }) { return children; }
`);

const stageStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AdvancedWorkbenchBlankStage() {
    return jsx("div", { "data-workbench-blank": "" });
  }
`);

const unsupportedStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function UnsupportedRoute() {
    return jsx("div", {
      "data-workbench-editor": "none",
      role: "status",
      children: "此内容没有可编辑的工作台",
    });
  }
`);

const boundaryStubUrl = dataModule(`
  import { Component } from ${JSON.stringify(reactUrl)};
  export class WorkbenchErrorBoundary extends Component {
    render() { return this.props.children; }
  }
`);

function namedRouteStub(exportName, editorId, title, src) {
  return dataModule(`
    import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
    export function ${exportName}() {
      return jsx("iframe", {
        title: ${JSON.stringify(title)},
        src: ${JSON.stringify(src)},
        "data-workbench-editor": ${JSON.stringify(editorId)},
      });
    }
  `);
}

const embeddedRouteStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function EmbeddedRoute(props) {
    const kind = props && props.item && props.item.kind;
    const editorId =
      kind === "website" ? "website" : kind === "canvas" ? "design-canvas" : "embed";
    const title =
      editorId === "website" ? "网站编辑" : editorId === "design-canvas" ? "画布编辑" : "嵌入式编辑器";
    return jsx("iframe", {
      title,
      src: "https://website.oceanleo.com/embed/site-editor",
      "data-workbench-editor": editorId,
    });
  }
`);

const workbenchStubs = {
  "next/dynamic": dynamicStubUrl,
  "next/navigation": navigationStubUrl,
  "./WorkspaceSession": workspaceStubUrl,
  "./workbench-material-provider": materialStubUrl,
  "./AdvancedWorkbenchStage": stageStubUrl,
  "./advanced-routes/UnsupportedRoute": unsupportedStubUrl,
  "./WorkbenchErrorBoundary": boundaryStubUrl,
  "./advanced-routes/DeckRoute": namedRouteStub(
    "DeckRoute",
    "deck",
    "幻灯片编辑",
    "https://slides.oceanleo.app/",
  ),
  "./advanced-routes/RichDocRoute": namedRouteStub(
    "RichDocRoute",
    "richdoc",
    "文档编辑",
    "https://docs.oceanleo.app/",
  ),
  "./advanced-routes/GridRoute": namedRouteStub(
    "GridRoute",
    "grid",
    "表格编辑",
    "about:blank",
  ),
  "./advanced-routes/PdfRoute": namedRouteStub(
    "PdfRoute",
    "pdf",
    "PDF 工作台",
    "about:blank",
  ),
  "./advanced-routes/ImageRoute": namedRouteStub(
    "ImageRoute",
    "image",
    "图片编辑",
    "about:blank",
  ),
  "./advanced-routes/AudioRoute": namedRouteStub(
    "AudioRoute",
    "audio",
    "音频处理",
    "about:blank",
  ),
  "./advanced-routes/Model3DRoute": namedRouteStub(
    "Model3DRoute",
    "threed",
    "3D 场景与视图",
    "about:blank",
  ),
  "./advanced-routes/VideoTimelineRoute": namedRouteStub(
    "VideoTimelineRoute",
    "video-timeline",
    "时间线剪辑",
    "about:blank",
  ),
  "./advanced-routes/GameRoute": namedRouteStub(
    "GameRoute",
    "game",
    "游戏编辑",
    "about:blank",
  ),
  "./advanced-routes/ChartRoute": namedRouteStub(
    "ChartRoute",
    "chart-editor@1",
    "图表编辑",
    "about:blank",
  ),
  "./advanced-routes/EmbeddedRoute": embeddedRouteStubUrl,
  "./advanced-routes/VideoCanvasRoute": namedRouteStub(
    "VideoCanvasRoute",
    "video-canvas",
    "节点画布",
    "https://flow.oceanleo.app/",
  ),
};

let workbenchModule;
async function loadWorkbench() {
  if (!workbenchModule) {
    const url = await compileModule(
      "src/shell/AdvancedContentWorkbench.tsx",
      workbenchStubs,
    );
    workbenchModule = await import(url);
  }
  return workbenchModule;
}

function libraryItem(patch) {
  return {
    key: "wb-reach",
    source: "artifact",
    id: "wb-reach",
    title: "闸",
    siteId: "website",
    favorite: false,
    meta: {},
    ...patch,
    meta: { ...(patch.meta || {}) },
  };
}

const CASES = [
  {
    id: "deck",
    userName: "幻灯片",
    adapter: "deck",
    editorId: "deck",
    item: libraryItem({
      id: "wb-deck",
      kind: "ppt",
      url: "https://asset.oceanleo.com/deck/gate.pptx",
      meta: { advanced_editor_route: "deck" },
    }),
  },
  {
    id: "richdoc",
    userName: "文档",
    adapter: "richdoc",
    editorId: "richdoc",
    item: libraryItem({
      id: "wb-richdoc",
      kind: "document",
      url: "https://asset.oceanleo.com/doc/gate.md",
      meta: { advanced_editor_route: "richdoc" },
    }),
  },
  {
    id: "grid",
    userName: "表格",
    adapter: "grid",
    editorId: "grid",
    item: libraryItem({
      id: "wb-grid",
      kind: "sheet",
      url: "https://asset.oceanleo.com/grid/gate.xlsx",
      meta: { advanced_editor_route: "grid" },
    }),
  },
  {
    id: "pdf",
    userName: "PDF",
    adapter: "pdf",
    editorId: "pdf",
    item: libraryItem({
      id: "wb-pdf",
      kind: "document",
      url: "https://asset.oceanleo.com/pdf/gate.pdf",
      meta: { advanced_editor_route: "pdf", mime: "application/pdf" },
    }),
  },
  {
    id: "image",
    userName: "图片",
    adapter: "image",
    editorId: "image",
    item: libraryItem({
      id: "wb-image",
      kind: "image",
      url: "https://asset.oceanleo.com/image/gate.png",
      meta: { advanced_editor_route: "image", mime: "image/png" },
    }),
  },
  {
    id: "audio",
    userName: "音频",
    adapter: "audio",
    editorId: "audio",
    item: libraryItem({
      id: "wb-audio",
      kind: "audio",
      url: "https://asset.oceanleo.com/audio/gate.mp3",
      meta: { advanced_editor_route: "audio", mime: "audio/mpeg" },
    }),
  },
  {
    id: "threed",
    userName: "3D",
    adapter: "threed",
    editorId: "threed",
    item: libraryItem({
      id: "wb-threed",
      kind: "threed",
      url: "https://asset.oceanleo.com/model/gate.glb",
      meta: { advanced_editor_route: "threed", subtype: "model" },
    }),
  },
  {
    id: "video",
    userName: "视频",
    adapter: "video-timeline",
    editorId: "video-timeline",
    item: libraryItem({
      id: "wb-video",
      kind: "video",
      url: "https://asset.oceanleo.com/video/gate.mp4",
      meta: { advanced_editor_route: "video-timeline", mime: "video/mp4" },
    }),
  },
  {
    id: "game",
    userName: "游戏",
    adapter: "game",
    editorId: "game",
    item: libraryItem({
      id: "wb-game",
      kind: "game",
      meta: { advanced_editor_route: "game" },
    }),
  },
  {
    id: "chart",
    userName: "图表",
    adapter: "chart-editor@1",
    editorId: "chart-editor@1",
    item: libraryItem({
      id: "wb-chart",
      kind: "image",
      meta: {
        content_type: "chart",
        chart_option: { series: [] },
        editor: {
          schema: "oceanleo.editor-manifest.v1",
          id: "chart-editor",
          version: 1,
          capabilities: ["load", "mutate", "save", "reopen"],
          source: { kind: "inline", format: "oceanleo.chart.v1" },
        },
      },
    }),
  },
  {
    id: "website",
    userName: "网站",
    adapter: "website",
    editorId: "website",
    item: libraryItem({
      id: "wb-website",
      kind: "website",
      meta: { website_id: "gate-site" },
    }),
  },
  {
    id: "design",
    userName: "设计稿",
    adapter: "design-canvas",
    editorId: "design-canvas",
    item: libraryItem({
      id: "wb-design",
      kind: "canvas",
    }),
  },
  {
    id: "workflow",
    userName: "流程图",
    adapter: "video-canvas",
    editorId: "video-canvas",
    item: libraryItem({
      id: "wb-flow",
      kind: "video_canvas",
    }),
  },
];

test("清单自检：CASES 覆盖 13 件插件——表变空或漏件时下面那批表驱动用例会静默不注册", () => {
  // `table-driven-registration-guard` 判据 2：按命名表 for-of 注册的用例必须配长度正对照。
  // 13 = ADVANCED_PLUGIN_FEATURE_IDS 的件数（advanced-plugin-open.test.mjs 钉的同一个数）。
  assert.equal(CASES.length, 13, `CASES 夹具应覆盖 13 件插件，实测 ${CASES.length} 件`);
  const editorIds = CASES.map((spec) => spec.editorId);
  assert.equal(new Set(editorIds).size, editorIds.length, `CASES 里有重复的 editorId：${editorIds}`);
});

function concealmentReason(node) {
  let current = node;
  while (current && current.nodeType === 1) {
    if (current.hidden === true || current.hasAttribute("hidden")) return "hidden";
    if (current.getAttribute("aria-hidden") === "true") return "aria-hidden";
    const style = String(current.getAttribute("style") || "");
    if (/display\s*:\s*none/i.test(style)) return "display:none";
    const cls = String(current.getAttribute("class") || "");
    if (/(?:^|\s)(?:hidden|invisible|sr-only)(?:\s|$)/.test(cls)) {
      return `class ${cls}`;
    }
    current = current.parentElement;
  }
  return null;
}

function describeDom(container) {
  return (container.innerHTML || "").replace(/\s+/g, " ").slice(0, 280);
}

async function waitForEditor(container, editorId) {
  const selector = `[data-workbench-editor="${editorId}"]`;
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {});
    const hit = container.querySelector(selector);
    if (hit) return hit;
  }
  const deadline = Date.now() + 4000;
  let last = describeDom(container);
  while (Date.now() < deadline) {
    const hit = container.querySelector(selector);
    if (hit) return hit;
    last = describeDom(container);
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    });
  }
  assert.ok(
    false,
    `工作台冲刷 lazy 后用户仍看不见这件编辑器（${editorId}）。当时 DOM：${last}`,
  );
}

async function mountWorkbench(item) {
  const { AdvancedContentWorkbench } = await loadWorkbench();
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(AdvancedContentWorkbench, {
        item,
        embedded: true,
        onClose() {},
      }),
    );
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test("夹具全部走进生产 editorCapabilityFor 的对应 adapter（夹具本身不许走错件）", () => {
  for (const spec of CASES) {
    const capability = editorCapabilityFor(spec.item);
    assert.equal(
      capability.adapter,
      spec.adapter,
      `${spec.userName} 夹具走进了 ${capability.adapter}（${capability.unavailableReason}），不是 ${spec.adapter}`,
    );
    assert.equal(capability.available, true, `${spec.userName} 夹具被判不可用：${capability.unavailableReason}`);
  }
});

test("jsdom 挂上的是真 AdvancedContentWorkbench：冲过 return null，先出现路由加载态", async () => {
  const spec = CASES[0];
  const { container, unmount } = await mountWorkbench(spec.item);
  try {
    const loading = container.querySelector("[data-workbench-route-loading]");
    const editor = container.querySelector("[data-workbench-editor]");
    assert.ok(
      loading || editor,
      `工作台挂上之后既没有加载态也没有编辑器，还停在 useEffect 前的 return null。DOM：${describeDom(container)}`,
    );
    if (loading && !editor) {
      assert.equal(
        loading.getAttribute("aria-label"),
        "正在加载编辑器",
        "加载态不是生产 WorkbenchRouteLoading，工作台可能没走到 lazyRoute",
      );
    }
  } finally {
    await unmount();
  }
});

for (const spec of CASES) {
  test(`工作台打开${spec.userName}后用户看见这件编辑器`, async () => {
    const capability = editorCapabilityFor(spec.item);
    assert.equal(capability.adapter, spec.adapter);
    const { container, unmount } = await mountWorkbench(spec.item);
    try {
      const node = await waitForEditor(container, spec.editorId);
      assert.equal(
        node.getAttribute("data-workbench-editor"),
        spec.editorId,
        `工作台打开${spec.userName}后用户看见的不是这件编辑器`,
      );
      assert.equal(
        concealmentReason(node),
        null,
        `工作台打开${spec.userName}后编辑器被藏起来了（${concealmentReason(node)}）。jsdom 没有 layout，这条钉的是 class / hidden / aria-hidden / 内联 style。`,
      );
      const unsupported = container.querySelector('[data-workbench-editor="none"]');
      assert.equal(
        unsupported,
        null,
        `工作台打开${spec.userName}后落到了「没有可编辑的工作台」，用户看不见这件编辑器`,
      );
      const label = editorToolLabel(capability.route);
      if (node.tagName === "IFRAME" && node.getAttribute("title")) {
        assert.equal(
          node.getAttribute("title"),
          label,
          `工作台打开${spec.userName}后画布 title 不是生产 editorToolLabel（${label}）`,
        );
      }
    } finally {
      await unmount();
    }
  });
}

test("slides / docs 不是工作台直达件：本闸不适用 hosted 叶子", () => {
  assert.doesNotMatch(
    workbenchSource,
    /DeckHostedRoute|RichDocHostedRoute/,
    "工作台开始直达 hosted 叶子了，slides/docs 的不适用声明要收回",
  );
});
