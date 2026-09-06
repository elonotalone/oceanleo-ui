/**
 * 3D 换核接线闸（W11 · 批 J 由 W10 代管）。
 *
 * 源码正则是辅闸。A-48：专业模式必须真挂 <iframe>，src origin 是
 * https://3d.oceanleo.app，sandbox 走 embedEditorFrameSandbox()。
 * jsdom 没有 layout：可见性只钉 data-model3d-hosted-visible、hidden /
 * aria-hidden / 内联 style / invisible|hidden|h-0|w-0 class。不许假装量像素。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  DEFAULT_EDITOR_CORE,
  setEditorCoreOverride,
} from "../src/shell/editor-core-flags.ts";
import { DEFAULT_EDITOR_MODE } from "../src/shell/hosted-editor/index.ts";
import {
  COVER_FRAME_SANDBOX,
  HOSTED_EDITOR_SANDBOX,
  UNTRUSTED_FRAME_SANDBOX,
  embedEditorFrameSandbox,
} from "../src/shell/editor-sandbox-origin.ts";
import {
  MODEL3D_NEXT_DEFAULT_MODE,
  applyModel3DNextMode,
} from "../src/shell/media-editors/model3d-next-mode.ts";
import { model3dToolsManifestChips } from "../src/shell/media-editors/model3d-next-l4-chips.ts";

const read = (relative) =>
  readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

const route = read("src/shell/advanced-routes/Model3DRoute.tsx");
const leaf = read("src/shell/media-editors/Model3DNextStage.tsx");
const frame = read("src/shell/media-editors/Model3DHostedFrame.tsx");
const controls = read("src/shell/media-editors/Model3DControls.tsx");
const director = read("src/shell/media-editors/Model3DDirectorPanel.tsx");
const strip = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const routeCode = strip(route);
const leafCode = strip(leaf);
const frameCode = strip(frame);

test("the dual-core flag is resolved once, at the top of the route", () => {
  assert.match(route, /if \(resolveEditorCore\("threed"\) === "next"\)/);
  assert.doesNotMatch(route, /from "@google\/model-viewer"/);
  assert.doesNotMatch(route, /from "three"/);
  assert.doesNotMatch(routeCode, /@google\/model-viewer/);
  assert.match(
    route,
    /dynamic\(\s*\(\) =>\s*import\("\.\.\/media-editors\/Model3DNextStage"\)/,
  );
  assert.match(route, /\{ ssr: false, loading: \(\) => null \}/);
  assert.match(route, /<Model3DNextStage \{\.\.\.props\} \/>/);
  assert.match(route, /function Model3DLegacyRoute/);
  assert.match(route, /function Model3DModelRoute/);
  assert.match(route, /useModel3DWorkbench/);
  assert.equal(DEFAULT_EDITOR_CORE, "legacy");
});

test("第二行不报 aux；截图入库在 adapter.actions 里（编辑栏文档段）", () => {
  assert.match(route, /pages:\s*\{\s*\}/);
  assert.doesNotMatch(route, /aux:\s*\[/);
  assert.match(route, /setMode:\s*setEditorMode/);
  assert.match(route, /id:\s*"model3d-save-screenshot"/);
});

test("legacy kernel remains in the same route file", () => {
  assert.match(route, /adapter=\{\{/);
  assert.match(route, /flush:/);
  assert.match(route, /<Model3DControls[\s\S]*editor=\{editor\}/);
  assert.match(route, /<Model3DContextToolbar[\s\S]*editor=\{editor\}/);
  assert.match(route, /<Model3DStage[\s\S]*editor=\{editor\}/);
  assert.match(controls, /Model3DDirectorPanel/);
  assert.match(director, /export function Model3DDirectorPanel/);
});

test("default mode is normal; hosted iframe only appears in pro", () => {
  assert.equal(MODEL3D_NEXT_DEFAULT_MODE, "normal");
  assert.equal(MODEL3D_NEXT_DEFAULT_MODE, DEFAULT_EDITOR_MODE);
  const normal = applyModel3DNextMode("oceanleo-model3d-next", "normal");
  const pro = applyModel3DNextMode("oceanleo-model3d-next", "pro");
  assert.equal(normal.showHostedEditor, false);
  assert.equal(pro.showHostedEditor, true);
  assert.match(leaf, /useState<EditorMode>\(DEFAULT_EDITOR_MODE\)/);
  assert.match(leaf, /applyModel3DNextMode/);
  assert.match(leaf, /showHostedEditor/);
  assert.match(leaf, /frameMounted/);
  assert.match(leaf, /Model3DHostedFrame/);
  assert.match(leaf, /postModel3DSetMode/);
  assert.match(leaf, /postModel3DRecoveryCapture/);
  assert.match(leaf, /data-model3d-hosted-visible/);
  assert.doesNotMatch(routeCode, /postMessage/);
  assert.doesNotMatch(leafCode, /postMessage\(/);
});

test("hosted iframe sandbox is HOSTED_EDITOR_SANDBOX; UGC / cover stay locked", () => {
  assert.equal(
    embedEditorFrameSandbox("https://3d.oceanleo.app"),
    HOSTED_EDITOR_SANDBOX,
  );
  assert.doesNotMatch(UNTRUSTED_FRAME_SANDBOX, /allow-same-origin/);
  assert.equal(
    embedEditorFrameSandbox("https://p1--base.oceanleo.app/").includes(
      "allow-same-origin",
    ),
    false,
  );
  assert.equal(COVER_FRAME_SANDBOX.includes("allow-same-origin"), false);
  assert.match(frame, /embedEditorFrameSandbox/);
  assert.match(frame, /asHostToEditorMessage/);
  assert.match(frame, /isValidEditorTargetOrigin/);
  assert.doesNotMatch(frameCode, /allow-same-origin/);
  assert.doesNotMatch(frameCode, /postMessage\([^,]+,\s*["']\*["']/);
  assert.match(frame, /referrerPolicy="no-referrer"/);
});

test("L4 chips are wired into the next leaf", () => {
  assert.equal(model3dToolsManifestChips().chips.length, 8);
  assert.match(leaf, /model3dToolsManifestChips/);
  assert.match(leaf, /buildModel3DReviewProposal/);
  assert.match(leaf, /rememberEditorChips\("threed"/);
  assert.match(leaf, /rememberEditorChips\("model3d"/);
});

test("legacy conversion is an explicit button, not a load side effect", () => {
  assert.match(leaf, /planModel3DLegacyConversion/);
  assert.match(leaf, /转换为新 3D 工程/);
  assert.match(leaf, /MODEL3D_LEGACY_READONLY_NOTICE/);
  assert.match(leaf, /nextModel3DConversionState/);
});

// ── A-48 行为闸：jsdom 真挂叶子，看节点，不扫 <iframe> 字符串 ─────────────
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

const MODEL3D_ORIGIN = "https://3d.oceanleo.app";
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
  throw new Error("3D 接线闸首屏不该发网络请求");
};

const shellStubUrl = dataModule(`
  import { jsx, jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AdvancedWorkbenchShell({ adapter }) {
    return jsxs("div", {
      "data-role": "model3d-next-shell",
      children: [
        adapter && adapter.mode
          ? jsx("button", {
              type: "button",
              "data-testid": "model3d-set-pro",
              onClick: () => adapter.mode.setMode("pro"),
              children: "专业模式",
            })
          : null,
        adapter && adapter.stage ? adapter.stage : null,
      ],
    });
  }
`);
const mediaStubUrl = dataModule(`
  export async function fetchMediaBlob() {
    throw new Error("3D 叶子闸不该去拉媒体");
  }
`);
const ioStubUrl = dataModule(`
  export async function saveFileToLibrary() { return { ok: false }; }
`);
const pluginStubUrl = dataModule(`
  export function usePluginCommandSurface() {}
`);
const agentStubUrl = dataModule(`
  export function rememberEditorChips() {}
`);
const toolbarStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function Model3DNextToolbar() { return jsx("div", { "data-role": "toolbar-stub" }); }
`);
const directorStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function Model3DNextDirector() { return jsx("div", { "data-role": "director-stub" }); }
`);
const viewerStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function Model3DViewerStage() { return jsx("div", { "data-testid": "model3d-viewer-stub" }); }
`);
const nextStageMarkerUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function Model3DNextStage(props) {
    if (!props || !props.item) {
      return jsx("div", { "data-testid": "model3d-next-missing-item" });
    }
    return jsx("div", {
      "data-testid": "model3d-next-stage-loaded",
      "data-item-id": String(props.item.id || ""),
    });
  }
`);
const dynamicStubUrl = dataModule(`
  import { createElement, useEffect, useState } from ${JSON.stringify(reactUrl)};
  export default function dynamic(loader) {
    let resolved = null;
    let err = null;
    const pending = Promise.resolve(typeof loader === "function" ? loader() : loader)
      .then((mod) => {
        resolved = typeof mod === "function" ? mod : mod && (mod.default || mod);
        return resolved;
      })
      .catch((error) => {
        err = error;
      });
    return function DynamicLoaded(props) {
      const [, bump] = useState(0);
      useEffect(() => {
        pending.then(() => bump((n) => n + 1));
      }, []);
      if (err) throw err;
      return resolved ? createElement(resolved, props) : null;
    };
  }
`);
const mediaBarrelStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function Model3DControls() { return null; }
  export function Model3DStage() {
    return jsx("div", { "data-testid": "model3d-legacy-stage" });
  }
  export function useModel3DWorkbench() {
    return { download() {} };
  }
`);
const emptyFnUrl = dataModule(`
  export function Model3DContextToolbar() { return null; }
  export function captureModel3DRouteSnapshot() { return {}; }
  export function Model3DRouteHistory() { return null; }
  export function createModel3DCommandSurface() { return {}; }
  export function visualImportPlan() { return {}; }
  export function assertBlobSource() {}
  export function useWorkbenchMaterialAdapter() { return null; }
  export function advancedSavedItem(item) { return item; }
  export function advancedRecoveryKey() { return "k"; }
`);

const leafStubs = {
  "../AdvancedWorkbenchShell": shellStubUrl,
  "../../lib/media-proxy": mediaStubUrl,
  "../doc-editors/doc-io": ioStubUrl,
  "../plugin-command": pluginStubUrl,
  "../agent-review": agentStubUrl,
  "./Model3DNextToolbar": toolbarStubUrl,
  "./Model3DNextDirector": directorStubUrl,
  "./Model3DViewerStage": viewerStubUrl,
};

const routeStubs = {
  "next/dynamic": dynamicStubUrl,
  "../media-editors/Model3DNextStage": nextStageMarkerUrl,
  "../AdvancedWorkbenchShell": shellStubUrl,
  "../../lib/media-proxy": mediaStubUrl,
  "../plugin-command": pluginStubUrl,
  "../media-editors": mediaBarrelStubUrl,
  "../media-editors/Model3DContextToolbar": emptyFnUrl,
  "../media-editors/Model3DRouteHistory": emptyFnUrl,
  "../media-editors/model3d-command-surface": emptyFnUrl,
  "../media-editors/visual-formats": emptyFnUrl,
  "../media-editors/source-integrity.mjs": emptyFnUrl,
  "../workbench-material-provider": emptyFnUrl,
  "../advanced-session": emptyFnUrl,
  "../advanced-recovery-store": emptyFnUrl,
};

function model3dItem() {
  return {
    key: "m3d-gate",
    source: "artifact",
    id: "m3d-gate",
    title: "闸",
    kind: "threed",
    siteId: "website",
    favorite: false,
    artifactType: "model_3d",
    meta: { format: "glb" },
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

function assertLiveModel3DIframe(container) {
  const iframe = container.querySelector("iframe");
  assert.ok(iframe, "专业模式挂起来之后没有 iframe 节点，用户看不到 three.js editor");
  assert.equal(iframe.tagName, "IFRAME", "画布节点不是 iframe（标签被换成别的了）");
  const src = iframe.getAttribute("src") || "";
  assert.ok(src, "iframe 的 src 是空的，用户看见的是无法构造嵌入地址");
  assert.equal(
    new URL(src).origin,
    MODEL3D_ORIGIN,
    `iframe src origin 不是 3d 托管域：${src}`,
  );
  const expectedSandbox = embedEditorFrameSandbox(MODEL3D_ORIGIN);
  assert.equal(
    iframe.getAttribute("sandbox"),
    expectedSandbox,
    "sandbox 没有走 embedEditorFrameSandbox()",
  );
  assert.equal(expectedSandbox, HOSTED_EDITOR_SANDBOX);
  assert.equal(
    embedEditorFrameSandbox("https://p1--base.oceanleo.app/").includes(
      "allow-same-origin",
    ),
    false,
  );
  assert.equal(COVER_FRAME_SANDBOX.includes("allow-same-origin"), false);
  const slot = container.querySelector("[data-testid=model3d-hosted-slot]");
  assert.ok(slot, "专业模式槽位 data-testid=model3d-hosted-slot 不见了");
  assert.equal(
    slot.getAttribute("data-model3d-hosted-visible"),
    "true",
    "槽位 data-model3d-hosted-visible 不是 true。把 showHosted 改成恒假就是这样：iframe 可能还在 DOM 里，人看不见。",
  );
  assert.equal(slot.getAttribute("aria-hidden"), "false");
  const hidden = concealmentReason(iframe);
  assert.equal(
    hidden,
    null,
    `iframe 还在 DOM 里，但祖先带了藏起标记 ${hidden}。jsdom 没有 layout，这条钉的是 class / hidden / aria-hidden / 内联 style，不是在假装量了可见像素。`,
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
    mod,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test("jsdom 挂上 Model3DHostedFrame 后，画布是真 iframe 而不是 fallback", async () => {
  const { buildModel3DEmbedUrl } = await import(
    "../src/shell/media-editors/model3d-hosted-embed.ts"
  );
  const src = buildModel3DEmbedUrl({
    instanceId: "m3d-gate",
    hostOrigin: "https://oceanleo.com",
    assetTitle: "闸",
  });
  const mounted = await mountCompiled(
    "src/shell/media-editors/Model3DHostedFrame.tsx",
    {},
    (mod) =>
      React.createElement(mod.Model3DHostedFrame, {
        instanceId: "m3d-gate",
        hostOrigin: "https://oceanleo.com",
        src,
        title: "three.js editor",
        onReady() {},
        onSnapshot() {},
        onError() {},
      }),
  );
  try {
    const iframe = mounted.container.querySelector("iframe");
    assert.ok(iframe, "挂起来之后没有 iframe 节点");
    assert.equal(iframe.tagName, "IFRAME");
    assert.equal(new URL(iframe.getAttribute("src") || "").origin, MODEL3D_ORIGIN);
    assert.equal(
      iframe.getAttribute("sandbox"),
      embedEditorFrameSandbox(MODEL3D_ORIGIN),
    );
  } finally {
    await mounted.unmount();
  }
});

test("专业模式叶子真挂 three.js editor iframe，且槽位标记为可见", async () => {
  const mounted = await mountCompiled(
    "src/shell/media-editors/Model3DNextStage.tsx",
    leafStubs,
    (mod) =>
      React.createElement(mod.Model3DNextStage, {
        item: model3dItem(),
        onClose() {},
      }),
  );
  try {
    assert.equal(
      mounted.container.querySelector("[data-model3d-hosted-visible=true]"),
      null,
      "普通模式不该把托管槽标成可见",
    );
    const button = mounted.container.querySelector("[data-testid=model3d-set-pro]");
    assert.ok(button, "壳桩没有把 adapter.mode.setMode 交给可点入口，「专业编辑」页切不过去");
    await act(async () => {
      button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {});
    assertLiveModel3DIframe(mounted.container);
  } finally {
    await mounted.unmount();
  }
});

test("Model3DRoute 翻到 next 时，加载函数真的交出叶子并带上 item", async () => {
  setEditorCoreOverride("threed", "next");
  try {
    assert.equal(
      (await import("../src/shell/editor-core-flags.ts")).resolveEditorCore("threed"),
      "next",
    );
    const mounted = await mountCompiled(
      "src/shell/advanced-routes/Model3DRoute.tsx",
      routeStubs,
      (mod) =>
        React.createElement(mod.Model3DRoute, {
          item: model3dItem(),
          onClose() {},
        }),
    );
    try {
      for (let i = 0; i < 40; i += 1) {
        if (mounted.container.querySelector("[data-testid=model3d-next-stage-loaded]")) {
          break;
        }
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
        });
      }
      const marker = mounted.container.querySelector(
        "[data-testid=model3d-next-stage-loaded]",
      );
      assert.ok(
        marker,
        "next 舞台加载函数没有交出 Model3DNextStage。保留 if 行再 return null、或 {false && next}、或不传 item，用户翻不到新核。DOM=" +
          mounted.container.innerHTML.slice(0, 500),
      );
      assert.equal(marker.getAttribute("data-item-id"), "m3d-gate");
      assert.equal(
        mounted.container.querySelector("[data-testid=model3d-next-missing-item]"),
        null,
      );
      assert.equal(
        mounted.container.querySelector("[data-testid=model3d-legacy-stage]"),
        null,
      );
    } finally {
      await mounted.unmount();
    }
  } finally {
    setEditorCoreOverride("threed", null);
    assert.equal(
      (await import("../src/shell/editor-core-flags.ts")).resolveEditorCore("threed"),
      "legacy",
    );
    assert.equal(DEFAULT_EDITOR_CORE, "legacy");
  }
});
