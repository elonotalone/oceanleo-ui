/**
 * W08 · 双核 flag 在 `RichDocRoute` 上的接线，以及托管 iframe 契约。
 *
 * 跑法（必须带 package.json `test` 那串 flag，`_COMMON.md` §7b⑫）：
 *   node --test --import ./tests/helpers/assert-dom-guard.mjs \
 *     --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs \
 *     tests/rich-doc-core-swap.test.mjs
 */

import { strict as assert } from "node:assert";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

import {
  EDITOR_CORE_SPECS,
  resolveEditorCore,
  setEditorCoreOverride,
} from "../src/shell/editor-core-flags.ts";
import {
  COVER_FRAME_SANDBOX,
  HOSTED_EDITOR_SANDBOX,
  embedEditorFrameSandbox,
  isTrustedEmbedEditorBase,
} from "../src/shell/editor-sandbox-origin.ts";
import { EDITOR_PROTOCOL } from "../src/shell/editor-protocol.ts";
import { DEFAULT_EDITOR_MODE } from "../src/shell/hosted-editor/index.ts";
import {
  RICHDOC_HOSTED_EMBED_ORIGIN,
  buildRichDocEmbedUrl,
  buildRichDocInitEnvelope,
  canBuildRichDocEmbedUrl,
  richDocHostedEmbedBase,
} from "../src/shell/doc-editors/rich-doc-hosted-embed.ts";

const route = readFileSync("src/shell/advanced-routes/RichDocRoute.tsx", "utf8");
const hosted = readFileSync(
  "src/shell/advanced-routes/RichDocHostedRoute.tsx",
  "utf8",
);

test("richdoc 在换核台账里登记的是 Umo Editor、owner 是 W08、iframe 托管", () => {
  assert.deepEqual(EDITOR_CORE_SPECS.richdoc, {
    nextCore: "Umo Editor",
    owner: "W08",
    hosting: "hosted",
  });
});

test("默认走旧核 —— 用户侧零影响（§10 第 3 条）", () => {
  assert.equal(resolveEditorCore("richdoc"), "legacy");
});

test("显式 override 才切到新核", () => {
  assert.equal(resolveEditorCore("richdoc", "next"), "next");
  assert.equal(resolveEditorCore("richdoc", "legacy"), "legacy");
});

test("flag 只在路由顶层判一次，不写进组件（flag 纪律 1）", () => {
  const hits = route.match(/resolveEditorCore\(/g) || [];
  assert.equal(hits.length, 1, `resolveEditorCore 出现 ${hits.length} 次，应恰好 1 次`);
  const dispatchIndex = route.indexOf("export function RichDocRoute(");
  const legacyIndex = route.indexOf("function RichDocLegacyRoute(");
  const callIndex = route.indexOf("resolveEditorCore(");
  assert.ok(dispatchIndex > 0 && legacyIndex > dispatchIndex);
  assert.ok(callIndex > dispatchIndex && callIndex < legacyIndex);
});

test("新核单独 lazy —— 翻 flag 前它的模块图不进本 chunk", () => {
  assert.match(route, /lazy\(\(\) =>\s*import\("\.\/RichDocHostedRoute"\)/);
  assert.doesNotMatch(
    route,
    /^import .*RichDocHostedRoute.*from/m,
    "新核被静态 import 了，两套核会进同一个 chunk",
  );
});

test("旧核代码保留，没被删（§10 第 3 条）", () => {
  assert.match(route, /function RichDocLegacyRoute\(/);
  for (const kept of ["useRichDocEditor", "RichDocStage", "RichDocContextToolbar"]) {
    assert.ok(route.includes(kept), `旧核的 ${kept} 不见了`);
  }
});

test("旧核下载菜单有转公众号排版，且不改 doc-family 格式表", () => {
  assert.match(route, /richdoc-wechat-layout/);
  assert.match(route, /转公众号排版/);
  assert.doesNotMatch(route, /DOC_FAMILY_DOWNLOAD_FORMATS\.richdoc\.push/);
});

test("新核分支嵌入 docs.oceanleo.app iframe，并走契约 v2", () => {
  assert.match(hosted, /<iframe/);
  assert.ok(hosted.includes("docs.oceanleo.app"));
  assert.match(hosted, /buildSetModeMessage/);
  assert.match(hosted, /buildHideChromeMessage/);
  assert.match(hosted, /buildRichDocInitEnvelope/);
  assert.match(hosted, /acceptEditorFrameMessage/);
  assert.match(hosted, /recovery-snapshot/);
  assert.match(
    hosted,
    /snapshot\?\.payload/,
    "recovery-snapshot 必须取出 payload，不能把 {revision,payload} 整包当正文",
  );
  assert.doesNotMatch(hosted, /postMessage\([^)]+,\s*['"]\*['"]/);
});

test("新核分支不静态拉旧核 Tiptap（flag 纪律 1）", () => {
  assert.doesNotMatch(hosted, /use-rich-doc-editor/);
  assert.doesNotMatch(hosted, /from ["']@tiptap\//);
  assert.doesNotMatch(hosted, /RichDocStage|RichDocContextToolbar|useRichDocEditor/);
  assert.ok(hosted.includes("RichDocHostedRoute"));
});

test("默认普通模式，set-mode 是唯一开关", () => {
  assert.equal(DEFAULT_EDITOR_MODE, "normal");
  assert.match(hosted, /DEFAULT_EDITOR_MODE/);
  assert.match(hosted, /buildSetModeMessage/);
});

test("第二行申报 Umo，不报 aux；mode.setMode 交给壳", () => {
  assert.match(route, /pages:\s*\{\s*proLabel:\s*"Umo"\s*\}/);
  assert.match(hosted, /pages:\s*\{\s*proLabel:\s*"Umo"\s*\}/);
  assert.doesNotMatch(route, /aux:\s*\[/);
  assert.doesNotMatch(hosted, /aux:\s*\[/);
  assert.match(route, /setMode:\s*setEditorMode/);
  assert.match(hosted, /setMode:\s*applyMode/);
});

test("docs.oceanleo.app 已在 embed 白名单，能拼出 URL", () => {
  assert.equal(RICHDOC_HOSTED_EMBED_ORIGIN, "https://docs.oceanleo.app");
  assert.equal(richDocHostedEmbedBase(), "https://docs.oceanleo.app");
  assert.equal(richDocHostedEmbedBase("https://evil.example"), "https://docs.oceanleo.app");
  assert.equal(canBuildRichDocEmbedUrl("https://docs.oceanleo.app"), true);
  assert.equal(isTrustedEmbedEditorBase("https://docs.oceanleo.app"), true);
  const url = buildRichDocEmbedUrl({
    instanceId: "rd-test-1",
    hostOrigin: "https://oceanleo.com",
    assetTitle: "备忘",
  });
  assert.match(url, /^https:\/\/docs\.oceanleo\.app\//);
  assert.match(url, /embed=1/);
  assert.match(url, /instance=rd-test-1/);
  assert.match(url, /host=https%3A%2F%2Foceanleo.com/);
});

test("init 信封是 oceanleo.editor.v1，带只读标记，没有第三种 mode", () => {
  const envelope = buildRichDocInitEnvelope("rd-test-1", {
    content: { type: "doc", content: [] },
    readOnly: true,
    title: "旧稿",
  });
  assert.equal(envelope.protocol, EDITOR_PROTOCOL);
  assert.equal(envelope.protocol, "oceanleo.editor.v1");
  assert.equal(envelope.type, "init");
  assert.equal(envelope.readOnly, true);
  assert.equal(envelope.mode, "normal");
  assert.equal(envelope.instanceId, "rd-test-1");
});

test("Hosted 文档走 HOSTED_EDITOR_SANDBOX；源码不写死同源令牌", () => {
  // 源码必须调用生产函数，不得手写 sandbox 令牌。UGC 锁在下面两条。
  assert.doesNotMatch(hosted, /allow-same-origin/);
  assert.match(hosted, /embedEditorFrameSandbox\(/);
  assert.equal(
    embedEditorFrameSandbox("https://docs.oceanleo.app"),
    HOSTED_EDITOR_SANDBOX,
  );
  assert.equal(
    embedEditorFrameSandbox("https://p1--base.oceanleo.app/").includes(
      "allow-same-origin",
    ),
    false,
  );
  assert.equal(COVER_FRAME_SANDBOX.includes("allow-same-origin"), false);
});

// ── A-48：闸必须挂上路由看节点，不能只扫源码 token ─────────────────────
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
  localStorage: window.localStorage,
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
  throw new Error("RichDocHostedRoute 首屏不该发网络请求");
};

const shellStubUrl = dataModule(`
  import { jsx, jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AdvancedWorkbenchShell({ adapter }) {
    return jsxs("div", {
      "data-role": "richdoc-hosted-shell",
      children: [
        adapter && adapter.stage ? adapter.stage : null,
        adapter && adapter.status
          ? jsx("div", { "data-role": "richdoc-hosted-status", children: adapter.status })
          : null,
      ],
    });
  }
`);
const routesStubUrl = dataModule(`
  export function editorToolLabel() { return "文档"; }
`);
const richdocEmptyUrl = dataModule(`
  export function AdvancedWorkbenchShell() { return null; }
  export function exportWechatFromTiptap() { return { html: "", warnings: [] }; }
  export function RichDocContextToolbar() { return null; }
  export function RichDocControls() { return null; }
  export function RichDocCommentRail() { return null; }
  export function EditorSourceFailurePanel() { return null; }
  export function RichDocStage() { return null; }
  export function downloadText() {}
  export function artifactSaveStepMessage() { return ""; }
  export function tiptapJsonToDocxBlob() { return new Blob(); }
  export function buildRichDocCommandSurface() { return {}; }
  export function downloadConvertedCopy() {}
  export const DOC_FAMILY_DOWNLOAD_FORMATS = { richdoc: [] };
  export function docFamilyAcceptAttribute() { return ""; }
  export function importDocFamilyFile() { return Promise.resolve(null); }
  export function usePluginCommandSurface() {}
  export function useRichDocEditor() {
    return {
      loading: false,
      sourceReady: false,
      editor: null,
      error: "",
      dirty: false,
      editRevision: 0,
      save: async () => null,
      insertImageUrl() {},
      uploadImage: async () => {},
      importSource: async () => {},
      exportDoc: async () => {},
      exportMarkdown: async () => {},
      exportHtml: async () => {},
      exportText() {},
      restoreRecovery() {},
      reload() {},
      review: {
        comments: [],
        changes: [],
        activeCommentId: null,
        trackChangesEnabled: false,
        focusComment() {},
        replyToComment() {},
        resolveComment() {},
        removeComment() {},
        acceptChange() {},
        rejectChange() {},
        acceptAllChanges() {},
        rejectAllChanges() {},
      },
    };
  }
  export function richDocSavedItemForHandoff(item) { return item; }
  export const RICHDOC_SOURCE_FORMAT = "richdoc";
  export const RICHDOC_SOURCE_MEDIA_TYPE = "application/json";
  export function isDurableLibraryItem() { return false; }
  export function useOfficeArtifactSource() { return { loading: false, item: {} }; }
  export function editorToolLabel() { return "文档"; }
  export function useWorkbenchMaterialAdapter() { return {}; }
  export function advancedSavedItem(item) { return item; }
  export function advancedRecoveryKey() { return "k"; }
`);
const agentReviewStubUrl = dataModule(`
  export function submitRawReviewProposal() { return "ok"; }
`);
/**
 * 可达性闸的桩表。**故意不桩 `./RichDocHostedRoute`**：lazy 必须解析到真托管核，
 * 否则又回到「只锁舞台、摘分发口仍绿」。同一份表先编托管核再编分发口，
 * 两个 compileModule 共用上下文，lazy 命中缓存后 A-69 的空 `act` 循环才冲得动。
 */
const reachStubs = {
  "../AdvancedWorkbenchShell": shellStubUrl,
  "../workbench-routes": routesStubUrl,
  "../agent-review": agentReviewStubUrl,
  "../advanced-session": richdocEmptyUrl,
  "../advanced-recovery-store": richdocEmptyUrl,
  "../doc-editors/rich-doc-wechat-export": richdocEmptyUrl,
  "../doc-editors/RichDocContextToolbar": richdocEmptyUrl,
  "../doc-editors/RichDocControls": richdocEmptyUrl,
  "../doc-editors/richdoc-review/RichDocCommentRail": richdocEmptyUrl,
  "../doc-editors/EditorSourceFailurePanel": richdocEmptyUrl,
  "../doc-editors/RichDocStage": richdocEmptyUrl,
  "../doc-editors/doc-io": richdocEmptyUrl,
  "../doc-editors/artifact-save-contract": richdocEmptyUrl,
  "../doc-editors/docx-export": richdocEmptyUrl,
  "../doc-editors/doc-family-commands": richdocEmptyUrl,
  "../doc-editors/doc-family-download": richdocEmptyUrl,
  "../doc-editors/doc-family-formats": richdocEmptyUrl,
  "../doc-editors/doc-family-import": richdocEmptyUrl,
  "../plugin-command": richdocEmptyUrl,
  "../doc-editors/use-rich-doc-editor": richdocEmptyUrl,
  "../library-data": richdocEmptyUrl,
  "../office-editor": richdocEmptyUrl,
  "../workbench-material-provider": richdocEmptyUrl,
};

function richDocItem() {
  return {
    key: "rd-gate",
    source: "artifact",
    id: "rd-gate",
    title: "闸",
    kind: "document",
    siteId: "website",
    favorite: false,
    meta: {},
  };
}

async function flushLazy(container, selector) {
  // A-69：先用 account-page 那 6 次空 act 冲刷微任务。
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {});
    if (selector && container && container.querySelector(selector)) return;
  }
  if (!selector || !container) return;
  // module-bench 的 lazy `import()` 走文件 I/O，空 act 冲不完（实测资源在断言后才 resolve）。
  // 同仓 `tests/audio-playlist-wiring.test.mjs` 对懒加载路由用的就是这套等待。
  for (let i = 0; i < 40; i += 1) {
    if (container.querySelector(selector)) return;
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    });
  }
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
    current = current.parentElement;
  }
  return null;
}

function assertLiveUmoIframe(iframe, label) {
  assert.ok(iframe, `${label}：没有 iframe 节点，用户看不到 Umo`);
  assert.equal(
    iframe.tagName,
    "IFRAME",
    `${label}：画布节点不是 iframe（标签被换成别的了）`,
  );
  const hidden = concealmentReason(iframe);
  assert.equal(
    hidden,
    null,
    `${label}：iframe 还在 DOM 里，但祖先带了藏起标记 ${hidden}`,
  );
  const src = iframe.getAttribute("src") || "";
  assert.ok(src, `${label}：iframe 的 src 是空的，用户看见的是无法构造嵌入地址`);
  assert.equal(
    new URL(src).origin,
    "https://docs.oceanleo.app",
    `${label}：iframe src origin 不是 docs 托管域：${src}`,
  );
  const expectedSandbox = embedEditorFrameSandbox("https://docs.oceanleo.app");
  assert.equal(
    iframe.getAttribute("sandbox"),
    expectedSandbox,
    `${label}：sandbox 没有走 embedEditorFrameSandbox()`,
  );
  assert.equal(
    expectedSandbox,
    HOSTED_EDITOR_SANDBOX,
    `${label}：生产 sandbox 函数必须给出 HOSTED_EDITOR_SANDBOX（§8.3.1）`,
  );
  assert.equal(
    String(iframe.getAttribute("sandbox") || ""),
    HOSTED_EDITOR_SANDBOX,
    `${label}：iframe sandbox 必须是 HOSTED_EDITOR_SANDBOX`,
  );
  assert.equal(
    embedEditorFrameSandbox("https://p1--base.oceanleo.app/").includes(
      "allow-same-origin",
    ),
    false,
    `${label}：UGC 预览主机不得同源`,
  );
  assert.equal(COVER_FRAME_SANDBOX.includes("allow-same-origin"), false);
  assert.equal(
    new URL(src).searchParams.get("assetTitle"),
    "闸",
    `${label}：iframe src 没带 item.title。上层把 item 传成 null，用户看到无名画布`,
  );
  assert.ok(expectedSandbox.includes("allow-scripts"));
}

let hostedRouteModule;
async function loadHostedRoute() {
  if (!hostedRouteModule) {
    const url = await compileModule(
      "src/shell/advanced-routes/RichDocHostedRoute.tsx",
      {
        "../AdvancedWorkbenchShell": shellStubUrl,
        "../workbench-routes": routesStubUrl,
        "../agent-review": agentReviewStubUrl,
      },
    );
    hostedRouteModule = await import(url);
  }
  return hostedRouteModule;
}

let reachRouteModule;
async function loadRichDocRoute() {
  if (!reachRouteModule) {
    // 同一桩表、先编叶子：analyzeGraph 会走托管核的静态图，lazy 再按到时走缓存。
    await compileModule(
      "src/shell/advanced-routes/RichDocHostedRoute.tsx",
      reachStubs,
    );
    const url = await compileModule(
      "src/shell/advanced-routes/RichDocRoute.tsx",
      reachStubs,
    );
    reachRouteModule = await import(url);
  }
  return reachRouteModule;
}

async function mountRichDocHostedRoute() {
  const { RichDocHostedRoute } = await loadHostedRoute();
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(RichDocHostedRoute, {
        item: richDocItem(),
        onClose() {},
      }),
    );
  });
  await flushLazy(container, "iframe");
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function mountRichDocRoute(choice) {
  setEditorCoreOverride("richdoc", choice);
  try {
    const { RichDocRoute } = await loadRichDocRoute();
    const { createRoot } = await import("react-dom/client");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(RichDocRoute, {
          item: richDocItem(),
          onClose() {},
        }),
      );
    });
    await flushLazy(container, choice === "next" ? "iframe" : null);
    return {
      container,
      async unmount() {
        await act(async () => root.unmount());
        container.remove();
        setEditorCoreOverride("richdoc", null);
      },
    };
  } catch (caught) {
    setEditorCoreOverride("richdoc", null);
    throw caught;
  }
}

test("src 计算函数给出 docs.oceanleo.app，空串就是用户看见无法构造", async () => {
  const { computeRichDocHostedEmbedSrc } = await loadHostedRoute();
  const computed = computeRichDocHostedEmbedSrc({
    embedBase: richDocHostedEmbedBase(),
    instanceId: "rd-gate",
    hostOrigin: "https://oceanleo.com",
    assetTitle: "闸",
  });
  assert.ok(computed, "src 计算函数给出空串，用户会看见无法构造嵌入地址");
  assert.equal(new URL(computed).origin, RICHDOC_HOSTED_EMBED_ORIGIN);
  assert.equal(new URL(computed).origin, "https://docs.oceanleo.app");
});

test("jsdom 挂上 RichDocHostedRoute 后，画布是真 iframe 而不是 fallback", async () => {
  const { container, unmount } = await mountRichDocHostedRoute();
  try {
    assertLiveUmoIframe(
      container.querySelector("iframe"),
      "专业模式必须出现 Umo iframe",
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

test("jsdom 挂上 RichDocRoute 翻 next 后，用户看见 Umo 托管 iframe", async () => {
  const { container, unmount } = await mountRichDocRoute("next");
  try {
    assertLiveUmoIframe(
      container.querySelector("iframe"),
      "翻 next 后必须出现 Umo 托管 iframe",
    );
    const text = container.textContent || "";
    assert.equal(
      text.includes("无法构造"),
      false,
      "分发口走到了托管核，但用户看见的是「无法构造嵌入地址」",
    );
  } finally {
    await unmount();
  }
});

test("RichDocRoute next 分支不许 return null / 恒假（辅闸；行为锁在上面 iframe 例）", () => {
  const dispatch = route.slice(
    route.indexOf("export function RichDocRoute("),
    route.indexOf("function RichDocLegacyRoute("),
  );
  assert.match(dispatch, /if \(resolveEditorCore\("richdoc"\) === "next"\)/);
  assert.doesNotMatch(
    dispatch,
    /if \(false && resolveEditorCore\("richdoc"\)/,
    "分发口被改成恒假，翻 flag 仍走旧核",
  );
  assert.doesNotMatch(
    dispatch,
    /if \(resolveEditorCore\("richdoc"\) === "next"\) \{\s*return null/,
    "if 行还在但函数体 return null，翻 flag 用户得到空白页",
  );
  assert.match(dispatch, /<RichDocHostedRoute \{\.\.\.props\} \/>/);
  assert.doesNotMatch(
    dispatch,
    /\{false &&\s*<RichDocHostedRoute/,
    "托管调用被 {false && …} 包死，翻 flag 用户仍停在旧核 / 空白页",
  );
});
