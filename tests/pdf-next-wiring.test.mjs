// PDF 接线闸（native-editors W06）。
//
// 普通模式 = 我们自己的舞台（PdfStage）画在 EmbedPDF(PDFium) 引擎上；专业模式 =
// 上游官方即用查看器（PdfNextStage 叶子）。没有 flag、没有 pdf.js。
// 这一份判的是**接线**：默认挂的是普通舞台；点专业后即用查看器带着同一份字节、
// 关掉了自带的打开/下载/导出/打印，并把里面的编辑经 `saveAsCopy()` 取回我们的保存链路。
// 行为闸：`compileModule` + jsdom 挂真 `PdfRoute` / 真 `PdfNextStage`，看节点。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  isVendorCdnUrl,
  PDFIUM_UPSTREAM_DEFAULT_WASM_URL,
  PDFIUM_WASM_ENV_KEY,
  resolvePdfiumWasmUrl,
} from "../src/shell/media-editors/pdf-next-runtime.ts";
import {
  PDF_PRO_DISABLED_CATEGORIES,
  buildPdfProViewerConfig,
} from "../src/shell/media-editors/pdf-pro-config.ts";
import {
  pdfNextCommandAvailability,
  pdfNextCommandGaps,
} from "../src/shell/media-editors/pdf-next-commands.ts";
import {
  pdfAgentChipsAreValid,
  pdfToolsManifestV2Fields,
} from "../src/shell/media-editors/pdf-agent-chips.ts";
import {
  PDF_NEXT_BLOCKED_COMMANDS,
  pdfNextBlockReason,
  pdfNextEditorFacade,
} from "../src/shell/media-editors/pdf-next-facade.ts";

const read = (relative) =>
  readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

const route = read("src/shell/advanced-routes/PdfRoute.tsx");
const toolbar = read("src/shell/media-editors/PdfContextToolbar.tsx");
const controls = read("src/shell/media-editors/PdfControls.tsx");
/**
 * 去掉注释的路由源码。
 *
 * 「这里不许出现 X」这类断言必须只看代码：注释里本来就会提到 X
 * （例如「Native 件不发 postMessage」那句解释）。拿整份文件去 grep，
 * 会把一条正确的解释判成违规。
 */
const routeCode = route
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");
const leaf = read("src/shell/media-editors/PdfNextStage.tsx");
const proConfig = read("src/shell/media-editors/pdf-pro-config.ts");
const state = read("src/shell/media-editors/pdf-workbench-state.ts");

// 重内核（PDFium/查看器）只许出现在懒加载叶子里。
// 违反后果：路由直接 import 它 ⇒ 31 个租户站每次打开任何编辑器都拖上 4.6 MB 的 PDFium 与整个查看器。
test("the Pro viewer is a lazy leaf, and the route has no core flag", () => {
  assert.doesNotMatch(route, /resolveEditorCore|editor-core-flags/);
  assert.doesNotMatch(route, /from "@embedpdf\//);
  assert.match(
    route,
    /dynamic\(\s*\(\) =>\s*import\("\.\.\/media-editors\/PdfNextStage"\)/,
  );
  assert.match(route, /\{ ssr: false, loading: \(\) => null \}/);
  assert.match(route, /const effectiveCore = mode === "pro" \? "next" : "legacy";/);
  assert.match(route, /<ModeSwitchGate\s+pro=\{effectiveCore === "next"\}/);
  assert.match(route, /renderPro=\{\(\) => \(\s*<PdfNextStage/);
  assert.match(route, /<PdfNormalFace editor=\{collabEditor\} accent=\{accent\} \/>/);
  // 叶子里不再有普通模式的引擎 hook / `mode` 分支：普通模式不经过它。
  assert.doesNotMatch(leaf, /usePdfiumEngine|mode === "pro"|mode: EditorMode/);
});

// 判据 1（自托管 WASM / 不向第三方要字体）
// 违反后果：不显式传 wasmUrl，上游用它写死的 jsDelivr 地址（dist/react/index.js:7），
// 于是每个租户站每次打开 PDF 都向第三方发一次 4.6 MB 请求。
test("the kernel is never handed a config that lets it fall back to a CDN", () => {
  // 字体：`null` 是上游唯一走得掉 CDN 的取值（`fontFallback ?? cdnFontConfig`）。
  assert.match(proConfig, /fontFallback: input\.fontFallback \?\? null/);
  // 专业模式的查看器同样不许向 Google Fonts 取字。
  assert.match(proConfig, /fonts: PDF_VIEWER_NO_EXTERNAL_FONTS/);
  // 叶子里不许出现任何写死的 CDN 地址。
  assert.doesNotMatch(leaf, /cdn\.jsdelivr\.net/);
  assert.doesNotMatch(proConfig, /cdn\.jsdelivr\.net/);

  // 纯函数那一侧的行为（这条是真调用，不是 grep）。
  const refused = resolvePdfiumWasmUrl({
    envUrl: PDFIUM_UPSTREAM_DEFAULT_WASM_URL,
    bundledUrl: "/static/pdfium/pdfium.wasm",
  });
  assert.equal(refused.ok, false);
  assert.match(refused.reason, new RegExp(PDFIUM_WASM_ENV_KEY));

  // A-48 刀 3：配置函数开头 `return { ok: true, wasmUrl: "" }` 必须红。
  const accepted = resolvePdfiumWasmUrl({
    envUrl: "https://oceanleo.com/static/pdfium/pdfium.wasm",
  });
  assert.equal(accepted.ok, true);
  assert.ok(accepted.wasmUrl.length > 8, "wasmUrl 算出来是空串，内核会回落到 jsDelivr");
  assert.equal(isVendorCdnUrl(accepted.wasmUrl), false);
  const empty = resolvePdfiumWasmUrl({ envUrl: "", bundledUrl: "" });
  assert.equal(empty.ok, false, "两边都空必须拒绝，不许编一个空地址当成功");
});

// 判据 2（专业模式 = 即用查看器，同一文档实例）+ R3（默认普通）
// 违反后果：切模式时重新载入文档 ⇒ 用户刚打的批注消失，而且没有任何报错。
test("professional mode is the adapter's mode face, over the same bytes", () => {
  assert.match(route, /useState<EditorMode>\(DEFAULT_EDITOR_MODE\)/);
  assert.doesNotMatch(routeCode, /postMessage|buildSetModeMessage/);
  assert.match(route, /mode: \{\s*\n\s*current: mode,/);
  assert.match(route, /setMode,/);
  assert.match(route, /pages:\s*\{\s*\}/);
  assert.doesNotMatch(route, /aux:\s*\[/);
  assert.match(route, /bytes=\{nextCoreEditor\.currentBytes\(\)\}/);
  assert.match(state, /currentBytes: \(\) => Uint8Array \| null;/);
  // 同一份字节交给查看器；不让它再去网络拉一遍。
  assert.match(proConfig, /initialDocuments: \[\{ buffer: input\.bytes, name: input\.name \}\]/);
  assert.doesNotMatch(leaf, /src:\s*(?:url|sourceUrl)/);
});

// 专业模式不得变成「文档外面又套了一个 App」：自带的打开/下载/导出/打印/加密/截图
// 命令（按钮与快捷键）必须关掉，文件级动作只走 OceanLeo 顶栏。
// 违反后果：用户在 Pro 里点了查看器自己的下载或「打开文件」，绕开顶栏的保存链路。
test("the Pro viewer's own file commands are switched off, themed with the host accent", () => {
  for (const category of [
    "document-open",
    "document-export",
    "document-print",
    "document-close",
    "document-protect",
    "document-capture",
    "document-menu",
  ]) {
    assert.ok(PDF_PRO_DISABLED_CATEGORIES.includes(category), category);
  }
  const config = buildPdfProViewerConfig({
    wasmUrl: "https://oceanleo.com/static/pdfium/pdfium.wasm",
    fontFallback: undefined,
    bytes: new Uint8Array([1, 2, 3]).buffer,
    name: "x.pdf",
    palette: { accent: "#0f766e", dark: false },
  });
  assert.deepEqual(config.disabledCategories, [...PDF_PRO_DISABLED_CATEGORIES]);
  assert.equal(config.tabBar, "never");
  assert.equal(config.fontFallback, null);
  assert.equal(config.theme.light.accent.primary, "#0f766e");
  assert.equal(config.documentManager.initialDocuments.length, 1);
});

// 判据 5 后半（`tools-manifest` v2 声明 PDF chips）
// 违反后果：chips 写错 kind / 超过 8 条 ⇒ 宿主整条 manifest 丢掉，L4 一个都不显示。
test("the eight PDF chips satisfy the contract's own validator", () => {
  assert.equal(pdfAgentChipsAreValid(), true);
  const fields = pdfToolsManifestV2Fields();
  assert.equal(fields.manifestVersion, 2);
  assert.equal(fields.chips.length, 8);
  assert.equal(new Set(fields.chips.map((chip) => chip.id)).size, 8);
});

// 规范 §7 判据 2（任一入口触发同一动作）+ §2.1 第 6 条
// 违反后果：新核做不到的动作在 L1 上变成死键——按钮还在、点下去什么都不发生，
// 而这是换核最容易掉东西、也最难被发现的地方。
test("commands the new core cannot do are refused at the editor, for every entry", async () => {
  // 缺口逐条都要给得出原因，且原因不是空话。
  const gaps = pdfNextCommandGaps();
  assert.ok(gaps.length >= 1);
  for (const gap of gaps) {
    const gate = pdfNextCommandAvailability(gap.id);
    if (gap.readiness === "unavailable") {
      assert.equal(gate.enabled, false, gap.id);
      assert.ok(gate.reason.length > 20, `${gap.id} 的原因太短，等于没说`);
    }
  }
  // 未登记的 id 也要拒，而不是当成可用。
  assert.equal(pdfNextCommandAvailability("pdf.no-such-thing").enabled, false);

  // facade 的行为（真调用）：新核档拒绝 + 把原因回调出去；旧核档原样放行。
  const calls = [];
  const stub = {
    rotateCurrentPage: async () => calls.push("rotate"),
    addBlankPage: async () => calls.push("blank"),
  };
  const legacy = pdfNextEditorFacade(stub, "legacy", () => {});
  assert.equal(legacy, stub, "legacy 档必须原样返回同一个对象");

  const reasons = [];
  const next = pdfNextEditorFacade(stub, "next", (reason) => reasons.push(reason));
  await assert.rejects(() => next.rotateCurrentPage(-1));
  await assert.rejects(() => next.addBlankPage());
  // 抛是给指令面/agent 的（注册表把它转成 ok:false），回调是给 L1 的状态栏。
  assert.equal(reasons.length, 2);
  for (const reason of reasons) assert.ok(reason.length > 20, reason);
  // 被拦的动作一次都没真跑到旧核实现上。
  assert.deepEqual(calls, []);

  // 拒绝的原因取自命令表，不在 facade 里另写一份。
  for (const id of PDF_NEXT_BLOCKED_COMMANDS) {
    assert.equal(pdfNextBlockReason(id), pdfNextCommandAvailability(id).reason);
  }

  // 三个入口：路由把 facade 后的 editor 交给指令面、舞台、L1 浮条与 L2 操控台。
  // 只交给指令面的话，L1 上那个按钮仍然打到旧核实现上（死键或假成功）。
  // L1 的两处 `void` 调用必须接住（否则一次点击留下未处理的 promise 拒绝）。
  assert.match(
    route,
    /usePluginCommandSurface\(\s*useMemo\(\s*\(\) =>\s*guardPluginSurface\(\s*buildPdfCommandSurface\(nextCoreEditor,/,
  );
  assert.match(route, /<PdfControls editor=\{nextCoreEditor\} \/>/);
  assert.match(
    route,
    /<PdfContextToolbar editor=\{nextCoreEditor\} accent=\{accent\} \/>/,
  );
  assert.match(route, /bytes=\{nextCoreEditor\.currentBytes\(\)\}/);
  assert.doesNotMatch(toolbar, /void editor\.rotateCurrentPage/);
  assert.match(toolbar, /editor\.rotateCurrentPage\(-1\)\.catch\(\(\) => \{\}\)/);
  assert.doesNotMatch(controls, /void editor\.addBlankPage/);
  assert.match(controls, /editor\.addBlankPage\(\)\.catch\(\(\) => \{\}\)/);
});

// ── A-48 行为闸：挂真路由，看节点（辅闸是上面那些源码正则）──────────────
// jsdom 取自 fabric 依赖树（仓内不许为测试加 jsdom）。canvas 原生绑定在本
// 容器里装不上，先拿空对象把 require 缓存顶掉，建完再还回去。
// 壳 / 旧核舞台 / 工作台 hook 打桩，只为把 adapter.stage 画出来。
// `@embedpdf/*` 打桩：本闸锁的是「产品把它挂上来了」，不是 PDFium 真打开一页。
// `next/dynamic` 的桩必须真去调产品 loader——loader `return null` 必须红。

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
  throw new Error("PdfRoute 首屏不该发网络请求");
};

const SELF_HOSTED_WASM = "https://oceanleo.com/static/pdfium/pdfium.wasm";

const dynamicStubUrl = dataModule(`
  import { createElement, useEffect, useState } from ${JSON.stringify(reactUrl)};
  export default function dynamic(loader, options) {
    return function DynamicPdfNextStage(props) {
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
                : mod && (mod.PdfNextStage || mod.default);
            setComp(() => (typeof resolved === "function" ? resolved : null));
          });
        return () => {
          cancelled = true;
        };
      }, []);
      if (typeof Comp !== "function") {
        return options && typeof options.loading === "function"
          ? options.loading()
          : null;
      }
      return createElement(Comp, props);
    };
  }
`);

const shellStubUrl = dataModule(`
  import { jsx, jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AdvancedWorkbenchShell({ adapter }) {
    return jsxs("div", {
      "data-role": "pdf-shell",
      children: [
        adapter && adapter.stage ? adapter.stage : null,
        adapter && adapter.status
          ? jsx("div", { "data-role": "pdf-status", children: adapter.status })
          : null,
        adapter && adapter.mode && typeof adapter.mode.setMode === "function"
          ? jsx("button", {
              type: "button",
              "data-role": "pdf-set-pro",
              onClick: () => adapter.mode.setMode("pro"),
              children: "专业模式",
            })
          : jsx("span", { "data-role": "pdf-mode-unavailable" }),
      ],
    });
  }
`);

const workbenchStubUrl = dataModule(`
  const SAMPLE = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
  export function usePdfWorkbench() {
    return {
      currentBytes: () => SAMPLE,
      canUndo: false,
      canRedo: false,
      undo() {},
      redo() {},
      zoom: 100,
      setZoom() {},
      loading: false,
      processing: false,
      download() {},
      dirty: false,
      editRevision: 1,
      error: "",
      failure: null,
      notice: "",
      mergePdf: async () => {},
      replaceBytesSilently: async (transform, options) => {
        const next = await transform(SAMPLE);
        globalThis.__pdfReplaced = globalThis.__pdfReplaced || [];
        globalThis.__pdfReplaced.push({ next, options });
        return "applied";
      },
      saveCopy: async () => null,
      captureRecovery() { return {}; },
      restoreRecovery() {},
    };
  }
`);

const legacyStageStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function PdfStage() {
    return jsx("div", { "data-pdf-legacy-stage": "" });
  }
`);

const emptyComponent = (name) =>
  dataModule(`
    export function ${name}() { return null; }
  `);

const viewerStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function PDFViewer(props) {
    const cfg = props.config || {};
    const docs = (cfg.documentManager && cfg.documentManager.initialDocuments) || [];
    const first = docs[0] || {};
    const hasBuffer = Boolean(first.buffer && first.buffer.byteLength > 0);
    // 上游查看器的 onReady（插件就绪）由测试手动触发：ModeSwitchGate 例要先看到
    // 「旧面仍在 + 覆盖层」，再放 ready。
    globalThis.__pdfViewerOnReady = props.onReady;
    globalThis.__pdfViewerConfig = cfg;
    return jsx("div", {
      "data-embedpdf-viewer": "",
      "data-wasm-url": String(cfg.wasmUrl || ""),
      "data-has-buffer": hasBuffer ? "1" : "0",
      "data-doc-name": String(first.name || ""),
    });
  }
`);

/** 一个带 export / document-manager / history 三个插件的假 registry。 */
function fakeRegistry(pulledBytes) {
  const listeners = [];
  const plugins = {
    export: {
      provides: () => ({
        forDocument: () => ({
          saveAsCopy: () => ({
            toPromise: async () => pulledBytes.buffer.slice(0),
          }),
        }),
      }),
    },
    "document-manager": { provides: () => ({ getActiveDocumentId: () => "doc-1" }) },
    history: {
      provides: () => ({
        onHistoryChange: (listener) => {
          listeners.push(listener);
          return () => listeners.splice(listeners.indexOf(listener), 1);
        },
      }),
    },
  };
  return {
    registry: { getPlugin: (id) => plugins[id] ?? null },
    fireEdit: () => listeners.slice().forEach((listener) => listener()),
    listenerCount: () => listeners.length,
  };
}

const routeStubs = {
  "next/dynamic": dynamicStubUrl,
  "../AdvancedWorkbenchShell": shellStubUrl,
  "../media-editors/use-pdf-workbench": workbenchStubUrl,
  "../media-editors/PdfStage": legacyStageStubUrl,
  "../media-editors/PdfControls": emptyComponent("PdfControls"),
  "../media-editors/PdfContextToolbar": emptyComponent("PdfContextToolbar"),
  "../plugin-command": dataModule(`export function usePluginCommandSurface() {}`),
  "../workbench-material-provider": dataModule(
    `export function useWorkbenchMaterialAdapter() {}`,
  ),
  "../../lib/media-proxy": dataModule(
    `export async function fetchMediaBlob() { throw new Error("pdf wiring test must not fetch"); }`,
  ),
  "../doc-editors/doc-family-commands": dataModule(
    `export function buildPdfCommandSurface() { return {}; }`,
  ),
  "../doc-editors/doc-family-import": dataModule(
    `export async function importDocFamilyFile() { return { ok: false, message: "no" }; }`,
  ),
  "../workbench-routes": dataModule(
    `export function editorToolLabel() { return "PDF"; }`,
  ),
  "../advanced-session": dataModule(
    `export function advancedSavedItem(item, extra) { return { ...item, ...extra }; }`,
  ),
  "../advanced-recovery-store": dataModule(
    `export function advancedRecoveryKey(editorId, item) { return editorId + ":" + item.id; }`,
  ),
  "@embedpdf/react-pdf-viewer": viewerStubUrl,
  // ModeSwitchGate 的覆盖层文案走 tt()；这里没有 IntlProvider，key 原样回显。
  "../../i18n/ui/useUI": dataModule(
    `export function useUI() { return (key) => key; }`,
  ),
};

let routeModule;
async function loadPdfRoute() {
  if (!routeModule) {
    const url = await compileModule(
      "src/shell/advanced-routes/PdfRoute.tsx",
      routeStubs,
    );
    routeModule = await import(url);
  }
  return routeModule;
}

function pdfItem() {
  return {
    key: "pdf-gate",
    source: "artifact",
    id: "pdf-gate",
    title: "闸",
    kind: "pdf",
    siteId: "website",
    favorite: false,
    meta: {},
  };
}

function hiddenTokenOn(node) {
  if (!node || node.nodeType !== 1) return null;
  if (node.hidden || node.getAttribute("hidden") !== null) return "hidden";
  if (node.getAttribute("aria-hidden") === "true") return "aria-hidden";
  const style = node.getAttribute("style") || "";
  if (/display\s*:\s*none/i.test(style)) return "display:none";
  const cls = node.getAttribute("class") || "";
  if (/(?:^|\s)hidden(?:\s|$)/.test(cls)) return "class:hidden";
  return null;
}

function findHiddenAncestor(node) {
  for (let current = node; current; current = current.parentElement) {
    const token = hiddenTokenOn(current);
    if (token) return token;
  }
  return null;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

async function waitFor(container, selector, label) {
  const deadline = Date.now() + 4000;
  let last = "";
  while (Date.now() < deadline) {
    const node = container.querySelector(selector);
    if (node) return node;
    last = container.innerHTML.replace(/\s+/g, " ").slice(0, 360);
    await settle();
  }
  assert.ok(false, `${label} 等到 ${selector} 仍没有。当时 DOM：${last}`);
}

function engineCalls() {
  return Array.isArray(globalThis.__pdfiumEngineCalls)
    ? globalThis.__pdfiumEngineCalls
    : [];
}

async function mountPdfRoute() {
  const { PdfRoute } = await loadPdfRoute();
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(PdfRoute, {
        item: pdfItem(),
        onClose() {},
      }),
    );
  });
  await settle();
  return {
    container,
    async clickPro() {
      const button = await waitFor(
        container,
        "[data-role='pdf-set-pro']",
        "adapter.mode.setMode 没交给壳，「专业编辑」页切不过去",
      );
      await act(async () => {
        button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      });
      await settle();
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function withPdfRoute(run) {
  const previousWasm = process.env[PDFIUM_WASM_ENV_KEY];
  process.env[PDFIUM_WASM_ENV_KEY] = SELF_HOSTED_WASM;
  globalThis.__pdfViewerOnReady = null;
  globalThis.__pdfViewerConfig = null;
  globalThis.__pdfReplaced = [];
  try {
    const mounted = await mountPdfRoute();
    try {
      await run(mounted);
    } finally {
      await mounted.unmount();
    }
  } finally {
    globalThis.__pdfViewerOnReady = null;
    globalThis.__pdfViewerConfig = null;
    globalThis.__pdfReplaced = [];
    if (previousWasm === undefined) delete process.env[PDFIUM_WASM_ENV_KEY];
    else process.env[PDFIUM_WASM_ENV_KEY] = previousWasm;
  }
}

test("默认打开 PDF 看到的是我们自己的普通舞台，不是官方查看器", async () => {
  await withPdfRoute(async ({ container }) => {
    assert.ok(
      container.querySelector("[data-pdf-legacy-stage]"),
      "默认没有普通舞台",
    );
    assert.equal(container.querySelector("[data-pdf-next-stage]"), null);
    assert.equal(container.querySelector("[data-embedpdf-viewer]"), null);
    assert.ok(
      container.querySelector("[data-role='pdf-set-pro']"),
      "PDF 的专业页 setMode 必须交给壳",
    );
  });
});

test("点专业：旧舞台留到查看器 ready，中间是舞台内覆盖层；ready 后换成同一份字节上的即用查看器", async () => {
  await withPdfRoute(async ({ container, clickPro }) => {
    assert.equal(container.querySelector("[data-mode-switch-pending]"), null);
    await clickPro();
    const viewer = await waitFor(
      container,
      "[data-embedpdf-viewer]",
      "点了专业编辑页，查看器没挂上。setMode 没交出，或 ProViewer return null。",
    );
    assert.equal(viewer.getAttribute("data-has-buffer"), "1");
    assert.equal(viewer.getAttribute("data-doc-name"), "闸.pdf");
    const wasmUrl = viewer.getAttribute("data-wasm-url") || "";
    assert.ok(wasmUrl.length > 8, "专业模式查看器的 wasmUrl 是空串");
    assert.equal(isVendorCdnUrl(wasmUrl), false, wasmUrl);
    // 自带文件命令已关掉（行为：查看器真收到的 config）。
    const config = globalThis.__pdfViewerConfig;
    assert.ok(config.disabledCategories.includes("document-open"));
    assert.ok(config.disabledCategories.includes("document-export"));
    assert.ok(config.disabledCategories.includes("document-print"));
    assert.equal(config.tabBar, "never");
    assert.ok(
      container.querySelector("[data-pdf-legacy-stage]"),
      "查看器还没 ready 就卸了旧舞台——这就是用户看到的留白",
    );
    const overlay = container.querySelector("[data-mode-switch-pending='pro']");
    assert.ok(overlay, "切专业模式时没有 data-mode-switch-pending 覆盖层");
    const pendingSlot = viewer.closest("[data-mode-switch-face='pro']");
    assert.equal(pendingSlot.getAttribute("data-mode-switch-face-state"), "pending");
    assert.match(pendingSlot.getAttribute("style") || "", /visibility:\s*hidden/i);
    assert.equal(findHiddenAncestor(viewer), null, "待命面只许 visibility:hidden");

    assert.equal(typeof globalThis.__pdfViewerOnReady, "function", "ProViewer 没把 onReady 交给查看器");
    const fake = fakeRegistry(new Uint8Array([9, 9]));
    await act(async () => {
      globalThis.__pdfViewerOnReady(fake.registry);
    });
    await settle();
    assert.equal(container.querySelector("[data-pdf-legacy-stage]"), null, "查看器 ready 之后旧舞台还在");
    assert.equal(container.querySelector("[data-mode-switch-pending]"), null, "ready 之后覆盖层还在");
    const shown = container.querySelector("[data-embedpdf-viewer]").closest("[data-mode-switch-face='pro']");
    assert.equal(shown.getAttribute("data-mode-switch-face-state"), "shown");
    assert.equal(fake.listenerCount(), 1, "没有订阅查看器的编辑事件，Pro 里的修改永远回不来");
  });
});

// Pro 里的修改必须回到我们的保存链路，否则顶栏「保存」存的是改之前的字节。
// 违反后果：用户在官方查看器里批注后点保存，保存成功但批注没了。
test("Pro 里的编辑经 saveAsCopy 取回，并作为脏字节换进编辑器（保存/下载读的就是这份）", async () => {
  await withPdfRoute(async ({ container, clickPro }) => {
    await clickPro();
    await waitFor(container, "[data-embedpdf-viewer]", "查看器没挂上");
    const pulled = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 7]);
    const fake = fakeRegistry(pulled);
    await act(async () => {
      globalThis.__pdfViewerOnReady(fake.registry);
    });
    await settle();
    assert.deepEqual(globalThis.__pdfReplaced, [], "没编辑就不该替换字节");
    await act(async () => {
      fake.fireEdit();
    });
    // 去抖 600ms 后同步一次。
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 900));
    });
    assert.equal(globalThis.__pdfReplaced.length, 1, "编辑后字节没有同步回编辑器");
    assert.deepEqual([...globalThis.__pdfReplaced[0].next], [...pulled]);
    assert.equal(globalThis.__pdfReplaced[0].options.markDirty, true);
  });
});
