/**
 * W07 · 双核 flag 在 `DeckRoute` 上的接线判据。
 *
 * 跑法（原样带上 package.json `test` 脚本那串 flag，`_COMMON.md` §7b⑫）：
 *   node --test --import ./tests/helpers/assert-dom-guard.mjs \
 *     --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs \
 *     tests/deck-core-swap.test.mjs
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  DEFAULT_EDITOR_CORE,
  EDITOR_CORE_SPECS,
  resolveEditorCore,
  setEditorCoreOverride,
} from "../src/shell/editor-core-flags.ts";
import { isHostedEditorOrigin } from "../src/shell/hosted-editor-origins.ts";
import {
  embedEditorFrameSandbox,
  isTrustedEmbedEditorBase,
} from "../src/shell/editor-sandbox-origin.ts";
import { buildEditorEmbedUrl } from "../src/shell/editor-protocol.ts";

const route = readFileSync("src/shell/advanced-routes/DeckRoute.tsx", "utf8");
const hosted = readFileSync(
  "src/shell/advanced-routes/DeckHostedRoute.tsx",
  "utf8",
);

/**
 * 托管分支实际指向的那个 origin，从源文件里读出来再交给**生产函数**判。
 * 不自写解析器复述白名单：白名单的事实源是 `hosted-editor-origins.ts`。
 */
function hostedOriginFromSource() {
  const match = hosted.match(
    /DECK_HOSTED_EMBED_ORIGIN\s*=\s*"(https:\/\/[a-z0-9.-]+)"/,
  );
  return match ? match[1] : "";
}

// ── V1-red-4 / A-48：闸必须挂上路由看节点，不能只扫源码 token ─────────────
// jsdom 取自 fabric 依赖树（仓内不许为测试加 jsdom）。canvas 原生绑定在本
// 容器里装不上，先拿空对象把 require 缓存顶掉，建完再还回去。
// 壳本身不在本判据的锁里：桩只负责把 adapter.stage 画出来，iframe 仍是
// DeckHostedRoute 的产品 JSX。

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
  throw new Error("DeckHostedRoute 首屏不该发网络请求");
};

const shellStubUrl = dataModule(`
  import { jsx, jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AdvancedWorkbenchShell({ adapter }) {
    return jsxs("div", {
      "data-role": "deck-hosted-shell",
      children: [
        adapter && adapter.stage ? adapter.stage : null,
        adapter && adapter.status
          ? jsx("div", { "data-role": "deck-hosted-status", children: adapter.status })
          : null,
      ],
    });
  }
`);
const routesStubUrl = dataModule(`
  export function editorToolLabel() { return "幻灯片"; }
`);
// DeckRoute 静态拉着整棵旧核。可达性例只走 next + lazy 叶子，旧核
// import 换成空绑定，模块才能加载；叶子 DeckHostedRoute 仍是真组件。
const deckLegacyStubUrl = dataModule(`
  export function DeckContextToolbar() { return null; }
  export function DeckDrawPanel() { return null; }
  export function DeckLinePanel() { return null; }
  export function DeckNotesPanel() { return null; }
  export function DeckSignaturePanel() { return null; }
  export function DeckTablePanel() { return null; }
  export function DeckDesignPanel() { return null; }
  export function DeckEffectsPanel() { return null; }
  export function DeckElementsPanel() { return null; }
  export function DeckLayersPanel() { return null; }
  export function DeckTextPanel() { return null; }
  export function DeckUploadPanel() { return null; }
  export function DeckFontPanel() { return null; }
  export function DeckPresenterView() { return null; }
  export function DeckStage() { return null; }
  export function openDeckPresenterWindow() {
    return { ok: false, reason: "blocked" };
  }
  export function deckRehearsalNoteLine() { return ""; }
  export const DECK_PREVIEW_FIT_ZOOM_PERCENT = 100;
  export function useDeckEditor() {
    return {
      deck: { title: "", slides: [] },
      activeSlide: { id: "" },
      save: async () => null,
      error: "",
      notice: "",
      loading: false,
      dirty: false,
      editRevision: 0,
      canUndo: false,
      canRedo: false,
      undo() {},
      redo() {},
      selectSlide() {},
      patchSlide() {},
      insertImageElement() {},
      importSource: async () => {},
      exportPptx: async () => {},
      downloadJson() {},
      restoreRecovery() {},
      exporting: false,
    };
  }
  export function buildDeckPptxBlob() { return new Blob(); }
  export function deckPresentationSource() { return {}; }
  export function deckSavedItemForHandoff(item) { return item; }
  export function useUI() { return (key) => key; }
  export function useOfficeArtifactSource(item) {
    return { item, resourceFailed: false, error: "", retry() {}, loading: false };
  }
  export function buildDeckCommandSurface() { return {}; }
  export async function downloadConvertedCopy() { return ""; }
  export function importDocFamilyFile() {
    return { ok: false, message: "no" };
  }
  export const DOC_FAMILY_DOWNLOAD_FORMATS = {
    deck: [{ extension: "pptx", label: "PPTX" }],
  };
  export function docFamilyAcceptAttribute() { return "*"; }
  export function usePluginCommandSurface() {}
  export function useWorkbenchMaterialAdapter() {}
  export function advancedSavedItem(item, extra) {
    return Object.assign({}, item, extra);
  }
`);
const deckRouteStubs = {
  "../AdvancedWorkbenchShell": shellStubUrl,
  "../workbench-routes": routesStubUrl,
  "../advanced-session": deckLegacyStubUrl,
  "../doc-editors/DeckContextToolbar": deckLegacyStubUrl,
  "../doc-editors/DeckCreationPanels": deckLegacyStubUrl,
  "../doc-editors/DeckControls": deckLegacyStubUrl,
  "../doc-editors/DeckFontPanel": deckLegacyStubUrl,
  "../doc-editors/DeckPresenterView": deckLegacyStubUrl,
  "../doc-editors/use-deck-presenter": deckLegacyStubUrl,
  "../doc-editors/deck-preview-geometry": deckLegacyStubUrl,
  "../doc-editors/DeckStage": deckLegacyStubUrl,
  "../doc-editors/use-deck-editor": deckLegacyStubUrl,
  "../doc-editors/doc-family-commands": deckLegacyStubUrl,
  "../doc-editors/doc-family-download": deckLegacyStubUrl,
  "../doc-editors/doc-family-formats": deckLegacyStubUrl,
  "../doc-editors/doc-family-import": deckLegacyStubUrl,
  "../../i18n/ui/useUI": deckLegacyStubUrl,
  "../office-editor": deckLegacyStubUrl,
  "../plugin-command": deckLegacyStubUrl,
  "../workbench-material-provider": deckLegacyStubUrl,
};

let hostedRouteModule;
async function loadHostedRoute() {
  if (!hostedRouteModule) {
    const url = await compileModule(
      "src/shell/advanced-routes/DeckHostedRoute.tsx",
      {
        "../AdvancedWorkbenchShell": shellStubUrl,
        "../workbench-routes": routesStubUrl,
      },
    );
    hostedRouteModule = await import(url);
  }
  return hostedRouteModule;
}

function deckItem() {
  return {
    key: "deck-gate",
    source: "artifact",
    id: "deck-gate",
    title: "闸",
    kind: "ppt",
    siteId: "website",
    favorite: false,
    meta: {},
  };
}

async function mountDeckHostedRoute() {
  const { DeckHostedRoute } = await loadHostedRoute();
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(DeckHostedRoute, {
        item: deckItem(),
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

let deckRouteModule;
async function loadDeckRoute() {
  if (!deckRouteModule) {
    const url = await compileModule(
      "src/shell/advanced-routes/DeckRoute.tsx",
      deckRouteStubs,
    );
    deckRouteModule = await import(url);
  }
  return deckRouteModule;
}

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

function assertLivePptistIframe(iframe, where) {
  assert.ok(iframe, `${where}没有 iframe 节点，用户看不到 PPTist 画布`);
  assert.equal(
    iframe.tagName,
    "IFRAME",
    `${where}画布节点不是 iframe（标签被换成别的了）`,
  );
  const src = iframe.getAttribute("src") || "";
  assert.ok(src, `${where}iframe 的 src 是空的，用户看见的是无法构造嵌入地址`);
  assert.equal(
    new URL(src).origin,
    "https://slides.oceanleo.app",
    `${where}iframe src origin 不是 slides 托管域：${src}`,
  );
  const expectedSandbox = embedEditorFrameSandbox("https://slides.oceanleo.app");
  assert.equal(
    iframe.getAttribute("sandbox"),
    expectedSandbox,
    `${where}sandbox 没有走 embedEditorFrameSandbox()`,
  );
  assert.ok(
    expectedSandbox.includes("allow-scripts"),
    "生产函数给出的沙箱连脚本都不给",
  );
  assert.ok(
    !expectedSandbox.includes("allow-same-origin"),
    "生产函数给出的沙箱带了同源",
  );
  assert.equal(
    String(iframe.getAttribute("sandbox") || "").includes("allow-same-origin"),
    false,
    `${where}iframe sandbox 含 allow-same-origin，不可信档被放开了`,
  );
  const hidden = concealmentReason(iframe);
  assert.equal(
    hidden,
    null,
    `${where}iframe 还在 DOM 里，但祖先带了藏起标记 ${hidden}。jsdom 没有 layout，这条钉的是 class / hidden / aria-hidden / 内联 style。`,
  );
}

async function flushLazyRoute() {
  // A-69：本仓 account-page.test.mjs:219-231 的手法。标准 React.lazy
  // + Suspense fallback={null} 靠空 act 冲刷异步解析，不是豁免理由。
  for (let i = 0; i < 6; i += 1) await act(async () => {});
}

async function waitForPptistIframe(container) {
  await flushLazyRoute();
  const deadline = Date.now() + 4000;
  let last = "";
  while (Date.now() < deadline) {
    const iframe =
      container.querySelector("iframe[title='OceanLeo Slides']") ||
      container.querySelector("iframe");
    if (iframe) return iframe;
    last = (container.innerHTML || "").replace(/\s+/g, " ").slice(0, 360);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  assert.ok(
    false,
    `挂 DeckRoute 冲刷 lazy 后仍没有 PPTist iframe。当时 DOM：${last}`,
  );
}

async function mountDeckRoute() {
  const { DeckRoute } = await loadDeckRoute();
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(DeckRoute, {
        item: deckItem(),
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

test("deck 在换核台账里登记的是 PPTist、owner 是 W07、iframe 托管", () => {
  assert.deepEqual(EDITOR_CORE_SPECS.deck, {
    nextCore: "PPTist",
    owner: "W07",
    hosting: "hosted",
  });
});

test("默认走旧核 —— 用户侧零影响（§10 第 3 条）", () => {
  // 没有 window、没有环境变量覆盖时必须是 legacy。
  assert.equal(resolveEditorCore("deck"), "legacy");
});

test("显式 override 才切到新核", () => {
  assert.equal(resolveEditorCore("deck", "next"), "next");
  assert.equal(resolveEditorCore("deck", "legacy"), "legacy");
});

test("flag 只在路由顶层判一次，不写进组件（flag 纪律 1）", () => {
  const hits = route.match(/resolveEditorCore\(/g) || [];
  assert.equal(hits.length, 1, `resolveEditorCore 出现 ${hits.length} 次，应恰好 1 次`);
  // 那一次必须在分发口里，不在 legacy 组件体内。
  const dispatchIndex = route.indexOf("export function DeckRoute(");
  const legacyIndex = route.indexOf("function DeckLegacyRoute(");
  const callIndex = route.indexOf("resolveEditorCore(");
  assert.ok(dispatchIndex > 0 && legacyIndex > dispatchIndex, "分发口应在 legacy 组件之前");
  assert.ok(
    callIndex > dispatchIndex && callIndex < legacyIndex,
    "resolveEditorCore 不在分发口内",
  );
});

test("新核单独 lazy —— 翻 flag 前它的模块图不进本 chunk（flag 纪律 1）", () => {
  assert.match(route, /lazy\(\(\) =>\s*import\("\.\/DeckHostedRoute"\)/);
  // 反面：不许静态 import 新核。
  assert.doesNotMatch(
    route,
    /^import .*DeckHostedRoute.*from/m,
    "新核被静态 import 了，两套核会进同一个 chunk",
  );
});

test("旧核代码保留，没被删（§10 第 3 条：换核期间旧核不删）", () => {
  assert.match(route, /function DeckLegacyRoute\(/);
  // 旧核那一堆自研引擎的 import 必须还在。
  for (const kept of ["useDeckEditor", "DeckStage", "DeckPresenterView"]) {
    assert.ok(route.includes(kept), `旧核的 ${kept} 不见了`);
  }
});

test("第二行申报 PPTist，不报 aux；放映在 adapter.actions 里（编辑栏文档段）", () => {
  assert.match(route, /pages:\s*\{\s*proLabel:\s*"PPTist"\s*\}/);
  assert.match(hosted, /pages:\s*\{\s*proLabel:\s*"PPTist"\s*\}/);
  assert.doesNotMatch(route, /aux:\s*\[/);
  assert.doesNotMatch(hosted, /aux:\s*\[/);
  assert.match(route, /id:\s*"deck-present"/);
  assert.match(route, /setMode:\s*setEditorMode/);
  assert.match(hosted, /setMode:\s*applyMode/);
});

// ── 以下五条是 V1-red-2 的修复闸 ─────────────────────────────────────────
// 这条闸原来钉的是「不许出现 iframe」，理由是宿主白名单没放行。
// 白名单在 W01 `b0056b9` / A-24 就放行了（下面第一条用生产函数复核），
// 于是那条断言从此在保护一块说明面 —— 一个错误的产品态。现在翻成正向：
// **翻 flag 的人必须看见幻灯片画布，不是一段解释。**

test("翻 flag 的人看见的是幻灯片画布：新核分支挂真 iframe", () => {
  // 辅闸：标签改成 div 仍须红（V1-red-2 已绿，不撤）。
  // 单靠这条锁不住 `return ""` / `{false && src ? (`，行为闸在下面那例。
  assert.match(hosted, /<iframe/, "新核分支没有 iframe，用户看不到画布");
  assert.match(
    hosted,
    /available:\s*true/,
    "适配器仍报 available: false，壳会按「这件不可用」渲染",
  );
  assert.doesNotMatch(
    hosted,
    /尚未放行/,
    "还在写「宿主尚未放行」，但生产函数说已经放行了",
  );
  assert.match(hosted, /<iframe[\s\S]{0,400}?src=\{src\}/);
  assert.match(
    hosted,
    /computeDeckHostedEmbedSrc\(/,
    "src 不再走可调用的计算函数，闸又只能扫标签",
  );
});

test("iframe 指向的 origin 过生产白名单（不自写解析器）", async () => {
  const origin = hostedOriginFromSource();
  assert.equal(origin, "https://slides.oceanleo.app");
  assert.equal(isHostedEditorOrigin(origin), true);
  assert.equal(isTrustedEmbedEditorBase(origin), true);
  assert.equal(isHostedEditorOrigin("https://evil.oceanleo.app"), false);
  assert.equal(isHostedEditorOrigin("https://slides.oceanleo.app.evil.com"), false);
  const url = new URL(
    buildEditorEmbedUrl(origin, {
      instanceId: "dk-gate",
      hostOrigin: "https://oceanleo.com",
      assetTitle: "闸",
      assetKind: "deck",
    }),
  );
  assert.equal(url.origin, origin);
  assert.equal(url.searchParams.get("editor"), "1");

  const {
    computeDeckHostedEmbedSrc,
    deckHostedEmbedBase,
    DECK_HOSTED_EMBED_ORIGIN,
  } = await loadHostedRoute();
  const computed = computeDeckHostedEmbedSrc({
    embedBase: deckHostedEmbedBase(),
    instanceId: "dk-gate",
    hostOrigin: "https://oceanleo.com",
    assetTitle: "闸",
  });
  assert.ok(computed, "src 计算函数给出空串，用户会看见无法构造嵌入地址");
  assert.equal(new URL(computed).origin, DECK_HOSTED_EMBED_ORIGIN);
  assert.equal(new URL(computed).origin, "https://slides.oceanleo.app");
});

test("沙箱档次由生产函数决定，且不带同源权限", () => {
  const origin = hostedOriginFromSource();
  const sandbox = embedEditorFrameSandbox(origin);
  assert.ok(sandbox.includes("allow-scripts"), "连脚本都不给，编辑器跑不起来");
  assert.ok(
    !sandbox.includes("allow-same-origin"),
    "六件 Hosted 拿到了同源权限，域隔离白做了",
  );
  assert.match(hosted, /embedEditorFrameSandbox\(/);
  assert.match(hosted, /<iframe[\s\S]{0,400}?sandbox=\{frameSandbox\}/);
  assert.doesNotMatch(
    hosted,
    /sandbox="[^"]*allow-same-origin/,
    "沙箱串被写死并放开了同源",
  );
});

test("jsdom 挂上 DeckHostedRoute 后，画布是真 iframe 而不是 fallback", async () => {
  // A-48：把产品改坏成用户受损（src 恒空、条件恒假、标签换成 div），本例必须红。
  const { container, unmount } = await mountDeckHostedRoute();
  try {
    const iframe = container.querySelector("iframe");
    assert.ok(iframe, "挂起来之后没有 iframe 节点，用户看不到画布");
    assert.equal(
      iframe.tagName,
      "IFRAME",
      "画布节点不是 iframe（标签被换成别的了）",
    );

    const src = iframe.getAttribute("src") || "";
    assert.ok(src, "iframe 的 src 是空的，用户看见的是无法构造嵌入地址");
    assert.equal(
      new URL(src).origin,
      "https://slides.oceanleo.app",
      `iframe src origin 不是 slides 托管域：${src}`,
    );

    const expectedSandbox = embedEditorFrameSandbox("https://slides.oceanleo.app");
    assert.equal(
      iframe.getAttribute("sandbox"),
      expectedSandbox,
      "sandbox 没有走 embedEditorFrameSandbox()",
    );
    assert.ok(
      expectedSandbox.includes("allow-scripts"),
      "生产函数给出的沙箱连脚本都不给",
    );
    assert.ok(
      !expectedSandbox.includes("allow-same-origin"),
      "生产函数给出的沙箱带了同源",
    );

    const text = container.textContent || "";
    assert.equal(
      text.includes("无法构造"),
      false,
      "用户看见的是「无法构造嵌入地址」fallback，iframe 没挂上",
    );
  } finally {
    await unmount();
  }
});

test("普通模式收起内核自带的工具栏与面板（R3：默认普通模式）", () => {
  assert.match(hosted, /DEFAULT_EDITOR_MODE/, "初始模式没有走契约默认档");
  assert.match(hosted, /buildHideChromeMessage\(/);
  // 普通模式两项都收；专业模式两项都放。写死 true / false 都是错的。
  const hits = hosted.match(/mode === "normal"/g) || [];
  assert.ok(hits.length >= 2, `hide-chrome 没有按模式取值（命中 ${hits.length} 处）`);
  assert.match(hosted, /next === "normal"/, "切模式时没有跟着重发 hide-chrome");
});

test("握手要发 init，否则编辑器一条能力都不报", () => {
  // 只发 open-asset：文档进得去，但 tools-manifest / selection / history 都不来，
  // agent 的接口面是空的。init 与 open-asset 两条缺一不可。
  assert.match(hosted, /type: "init"/, "从不发 init ⇒ 编辑器不报 tools-manifest");
  assert.match(hosted, /type: "open-asset"/, "从不发 open-asset ⇒ 打开的是空白演示");
});

test("agent 的改动要经过这一页点头才落地（契约 v2 §3.3）", () => {
  assert.match(
    hosted,
    /"review-proposal"/,
    "宿主侧不收提案，编辑器发了也没人接",
  );
  assert.match(hosted, /buildReviewDecisionMessage\(/, "收了提案却回不了裁决");
  assert.match(hosted, /"accept"/);
  assert.match(hosted, /"reject"/);
});

test("新核分支里没有 PPTist 的源码痕迹（AGPL 红线）", () => {
  assert.doesNotMatch(hosted, /from ['"]@\/(types|store|hooks|configs)\//);
  assert.doesNotMatch(hosted, /defineStore|storeToRefs/);
  // 正例：确认确实读到了内容（§6：零命中先验工具）。
  assert.ok(hosted.includes("DeckHostedRoute"));
});

// ── A-69 / A-65：闸必须挂路由，不许只挂舞台 ─────────────────────────────
// V7 摘掉 DeckRoute 后原 14 例仍全绿。本例挂的是分发口，lazy 叶子用
// account-page 那组空 act 冲刷。摘掉 / if(false) 包住 DeckHostedRoute、
// iframe→div、sandbox 加 allow-same-origin，都必须红（A-61 样板刀）。

test("挂 DeckRoute 翻到 next 后必须出现 PPTist iframe", async () => {
  assert.equal(DEFAULT_EDITOR_CORE, "legacy");
  setEditorCoreOverride("deck", "next");
  try {
    assert.equal(
      resolveEditorCore("deck"),
      "next",
      "override 没写进 localStorage，分发口仍会走旧核",
    );
    const { container, unmount } = await mountDeckRoute();
    try {
      const iframe = await waitForPptistIframe(container);
      assertLivePptistIframe(iframe, "从 DeckRoute 走进去之后");
      const text = container.textContent || "";
      assert.equal(
        text.includes("无法构造"),
        false,
        "用户看见的是「无法构造嵌入地址」fallback，iframe 没挂上",
      );
    } finally {
      await unmount();
    }
  } finally {
    setEditorCoreOverride("deck", null);
    assert.equal(resolveEditorCore("deck"), "legacy");
    assert.equal(DEFAULT_EDITOR_CORE, "legacy");
  }
});
