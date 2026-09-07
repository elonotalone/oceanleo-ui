// PDF 换核的接线闸（W06 · editor-core-swap · 批 J）。
//
// `pdf-next-core-swap.test.mjs` 判的是三份纯模块的**内容**（加载地址、命令映射、chips）。
// 这一份判的是**接线**：用户把 flag 翻到 `pdf:next` 之后，舞台上是不是真的挂了
// EmbedPDF 那一支；再翻到专业模式，即用查看器是不是带着同一份字节出现。
//
// V6 实跑：把 `stage` 改成 `{false && core === "next" ? <PdfNextStage/> : <PdfStage/>}`，
// 上一版只扫源码子串的闸 5/5 仍绿。A-48：源码正则只能当辅闸。
// 行为闸照 W07 `deck-core-swap`：`compileModule` + jsdom 挂真 `PdfRoute` /
// 真 `PdfNextStage`，看节点。jsdom 没有 layout，不假装验可见像素。
// 「真的渲染出一页光栅」仍归 V 浏览器验收（上一棒缩小承诺，本棒不改）。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  DEFAULT_EDITOR_CORE,
  resolveEditorCore,
  setEditorCoreOverride,
} from "../src/shell/editor-core-flags.ts";
import {
  isVendorCdnUrl,
  PDFIUM_UPSTREAM_DEFAULT_WASM_URL,
  PDFIUM_WASM_ENV_KEY,
  resolvePdfiumWasmUrl,
} from "../src/shell/media-editors/pdf-next-runtime.ts";
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
const state = read("src/shell/media-editors/pdf-workbench-state.ts");

// `_COMMON.md` §10 第 3 条（双核 flag，默认 legacy）+ `editor-core-flags.ts` 纪律 1
// 违反后果：flag 判定写在组件深处 ⇒ 两套核的模块图进同一个 chunk，
// 31 个租户站每次打开任何编辑器都拖上 4.6 MB 的 PDFium。
test("the dual-core flag is resolved once, at the top of the route", () => {
  assert.match(route, /const core = resolveEditorCore\("pdf"\);/);
  // 重内核只许出现在懒加载叶子里（`W01-deps.md` §4）：路由自己不许 import 它。
  assert.doesNotMatch(route, /from "@embedpdf\//);
  assert.match(
    route,
    /dynamic\(\s*\(\) =>\s*import\("\.\.\/media-editors\/PdfNextStage"\)/,
  );
  // `ssr: false` 是硬要求：PDFium 是 WASM + blob worker，服务端两者都不存在。
  assert.match(route, /\{ ssr: false, loading: \(\) => null \}/);
  // 舞台按 flag 或专业模式分流，但两面之间经 ModeSwitchGate（plugin-ui U4）：
  // 切模式时旧面留到新面 ready，不再是三元式立即换树。旧核那一支仍在。
  assert.match(route, /const effectiveCore = core === "next" \|\| mode === "pro" \? "next" : "legacy";/);
  assert.match(route, /<ModeSwitchGate\s+pro=\{effectiveCore === "next"\}/);
  assert.match(route, /renderPro=\{\(\) => \(\s*<PdfNextStage/);
  assert.doesNotMatch(route, /core === "next" \|\| mode === "pro" \? \(\s*<PdfNextStage/);
  assert.match(route, /<PdfStage editor=\{editor\} accent=\{accent\} \/>/);
});

// 判据 1（自托管 WASM / 不向第三方要字体）
// 违反后果：不显式传 wasmUrl，上游用它写死的 jsDelivr 地址（dist/react/index.js:7），
// 于是每个租户站每次打开 PDF 都向第三方发一次 4.6 MB 请求。
test("the kernel is never handed a config that lets it fall back to a CDN", () => {
  // 地址算不出来时**不许**把 `{wasmUrl: undefined}` 递进去——那正好触发上游兜底。
  assert.match(
    leaf,
    /usePdfiumEngine\(\s*plan\.wasm\.ok\s*\?\s*\{ wasmUrl: plan\.wasm\.wasmUrl, fontFallback: plan\.fontFallback \}\s*:\s*undefined,\s*\)/,
  );
  // 字体：`null` 是上游唯一走得掉 CDN 的取值（`fontFallback ?? cdnFontConfig`）。
  assert.match(leaf, /fontFallback: fontFallback \?\? null/);
  // 专业模式的查看器同样不许向 Google Fonts 取字。
  assert.match(leaf, /fonts: PDF_VIEWER_NO_EXTERNAL_FONTS/);
  // 叶子里不许出现任何写死的 CDN 地址。
  assert.doesNotMatch(leaf, /cdn\.jsdelivr\.net/);

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
  // Native 件走 adapter 的 mode 面，**不发 postMessage**（契约 v2 §4）。
  assert.doesNotMatch(routeCode, /postMessage|buildSetModeMessage/);
  assert.match(route, /mode: \{\s*\n\s*current: mode,/);
  // 13 件都必须交出 setMode；旧核点专业编辑页切到同一份字节的新核查看器。
  assert.match(route, /setMode,/);
  assert.doesNotMatch(route, /setMode: core === "next"/);
  assert.match(route, /pages:\s*\{\s*\}/);
  assert.doesNotMatch(route, /aux:\s*\[/);

  // 同一文档实例：两个模式吃的是同一个取值器（facade 后的那一个，见下一条用例）。
  assert.match(route, /bytes=\{nextCoreEditor\.currentBytes\(\)\}/);
  assert.match(state, /currentBytes: \(\) => Uint8Array \| null;/);
  // 叶子里两支都用同一份 `bytes`，专业模式不去网络再拉一遍。
  assert.match(leaf, /initialDocuments: \[\{ buffer: pdfArrayBuffer\(bytes\), name \}\]/);
  assert.doesNotMatch(leaf, /src:\s*(?:url|sourceUrl)/);
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
    /usePluginCommandSurface\(\s*buildPdfCommandSurface\(nextCoreEditor,/,
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

const pdfiumStubUrl = dataModule(`
  export function usePdfiumEngine(opts) {
    globalThis.__pdfiumEngineCalls = globalThis.__pdfiumEngineCalls || [];
    globalThis.__pdfiumEngineCalls.push(opts);
    return {
      engine: {
        openDocumentBuffer() {
          return {
            toPromise() {
              return Promise.resolve({ pageCount: 3 });
            },
          };
        },
      },
      isLoading: false,
      error: null,
    };
  }
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
    return jsx("div", {
      "data-embedpdf-viewer": "",
      "data-wasm-url": String(cfg.wasmUrl || ""),
      "data-has-buffer": hasBuffer ? "1" : "0",
      "data-doc-name": String(first.name || ""),
    });
  }
`);

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
  "@embedpdf/engines/react": pdfiumStubUrl,
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

async function withPdfFlag(choice, run) {
  const previousWasm = process.env[PDFIUM_WASM_ENV_KEY];
  process.env[PDFIUM_WASM_ENV_KEY] = SELF_HOSTED_WASM;
  globalThis.__pdfiumEngineCalls = [];
  setEditorCoreOverride("pdf", choice);
  try {
    const mounted = await mountPdfRoute();
    try {
      await run(mounted);
    } finally {
      await mounted.unmount();
    }
  } finally {
    setEditorCoreOverride("pdf", null);
    if (previousWasm === undefined) delete process.env[PDFIUM_WASM_ENV_KEY];
    else process.env[PDFIUM_WASM_ENV_KEY] = previousWasm;
    globalThis.__pdfiumEngineCalls = [];
  }
}

test("默认档仍是 legacy：用户打开 PDF 看到的是旧舞台，不是 EmbedPDF", async () => {
  assert.equal(DEFAULT_EDITOR_CORE, "legacy");
  assert.equal(resolveEditorCore("pdf"), "legacy");
  const previousWasm = process.env[PDFIUM_WASM_ENV_KEY];
  process.env[PDFIUM_WASM_ENV_KEY] = SELF_HOSTED_WASM;
  globalThis.__pdfiumEngineCalls = [];
  try {
    const { container, unmount } = await mountPdfRoute();
    try {
      assert.ok(
        container.querySelector("[data-pdf-legacy-stage]"),
        "默认档没有旧舞台。把默认核改成 next，或把三元式写反，用户今天就会被推上未验收的新核。",
      );
      assert.equal(
        container.querySelector("[data-pdf-next-stage]"),
        null,
        "默认档挂上了新核舞台。十三件默认档必须保持 legacy。",
      );
      assert.equal(container.querySelector("[data-embedpdf-viewer]"), null);
      assert.ok(
        container.querySelector("[data-role='pdf-set-pro']"),
        "默认档也必须把专业编辑页的 setMode 交给壳",
      );
      assert.equal(
        container.querySelector("[data-role='pdf-mode-unavailable']"),
        null,
        "默认档把专业编辑页又藏成不可用了",
      );
    } finally {
      await unmount();
    }
  } finally {
    if (previousWasm === undefined) delete process.env[PDFIUM_WASM_ENV_KEY];
    else process.env[PDFIUM_WASM_ENV_KEY] = previousWasm;
    globalThis.__pdfiumEngineCalls = [];
  }
});

test("flag=next：舞台上是 PdfNextStage，不是旧核", async () => {
  await withPdfFlag("next", async ({ container }) => {
    const stage = await waitFor(
      container,
      "[data-pdf-next-stage]",
      "翻到 next 之后 DOM 里没有 data-pdf-next-stage。V6 那刀 `{false && core === \"next\"}`、PdfNextStage `return null`、dynamic loader `return null`、bytes={null}，都是这个样子：用户还在旧舞台，闸却绿。",
    );
    assert.equal(stage.tagName, "DIV");
    assert.equal(
      container.querySelector("[data-pdf-legacy-stage]"),
      null,
      "flag=next 仍挂着旧舞台",
    );
    const hidden = findHiddenAncestor(stage);
    assert.equal(
      hidden,
      null,
      `新核舞台还在 DOM 里，但祖先带了藏起标记 ${hidden}。jsdom 没有 layout，这条钉的是 hidden / aria-hidden / display:none / class:hidden，不是在假装量了可见像素。`,
    );
    const calls = engineCalls();
    assert.ok(calls.length >= 1, "usePdfiumEngine 一次都没被叫到，内核没挂上");
    const handed = calls.filter((opts) => opts && typeof opts === "object");
    assert.ok(
      handed.length >= 1,
      "usePdfiumEngine 拿到的是 undefined——上游会回落到 jsDelivr",
    );
    for (const opts of handed) {
      assert.ok(
        typeof opts.wasmUrl === "string" && opts.wasmUrl.length > 8,
        `wasmUrl 是空的：${JSON.stringify(opts)}`,
      );
      assert.equal(isVendorCdnUrl(opts.wasmUrl), false, opts.wasmUrl);
    }
    const opened = await waitFor(
      container,
      "[data-pdf-next-stage][data-pdf-pages='3']",
      "舞台挂了，但文档没打开（页数还是 0）。加载函数提前 return / 不调 openDocumentBuffer 就是这样。",
    );
    assert.equal(opened, stage);
  });
});

test("flag=next 再切专业模式：即用查看器带着同一份字节挂上来", async () => {
  await withPdfFlag("next", async ({ container, clickPro }) => {
    await clickPro();
    const viewer = await waitFor(
      container,
      "[data-embedpdf-viewer]",
      "点了专业模式，EmbedPDF 即用查看器没挂上。mode={null}、{false && mode === \"pro\"}、ProViewer return null、Viewer 换成裸 div，用户看见的还是空壳。",
    );
    assert.equal(viewer.getAttribute("data-has-buffer"), "1");
    assert.equal(viewer.getAttribute("data-doc-name"), "闸.pdf");
    const wasmUrl = viewer.getAttribute("data-wasm-url") || "";
    assert.ok(wasmUrl.length > 8, "专业模式查看器的 wasmUrl 是空串");
    assert.equal(isVendorCdnUrl(wasmUrl), false, wasmUrl);
    assert.equal(
      container.querySelector("[data-pdf-legacy-stage]"),
      null,
      "专业模式退回了旧舞台",
    );
    const hidden = findHiddenAncestor(viewer);
    assert.equal(
      hidden,
      null,
      `查看器还在 DOM 里，但祖先带了藏起标记 ${hidden}。jsdom 没有 layout，只钉 hidden / aria-hidden / 内联 style / class token。`,
    );
  });
});

test("默认档点专业模式：旧舞台留到查看器 ready，中间是舞台内覆盖层；ready 后换成同一份字节上的即用查看器", async () => {
  assert.equal(resolveEditorCore("pdf"), "legacy");
  const previousWasm = process.env[PDFIUM_WASM_ENV_KEY];
  process.env[PDFIUM_WASM_ENV_KEY] = SELF_HOSTED_WASM;
  globalThis.__pdfiumEngineCalls = [];
  globalThis.__pdfViewerOnReady = null;
  try {
    const { container, clickPro, unmount } = await mountPdfRoute();
    try {
      assert.ok(
        container.querySelector("[data-pdf-legacy-stage]"),
        "默认档开场应仍是旧舞台",
      );
      assert.equal(container.querySelector("[data-mode-switch-pending]"), null);
      await clickPro();
      const viewer = await waitFor(
        container,
        "[data-embedpdf-viewer]",
        "默认档点了专业编辑页，查看器没挂上。setMode 没交出、或 stage 仍只看 flag。",
      );
      assert.equal(viewer.getAttribute("data-has-buffer"), "1");
      // plugin-ui U4 新语义：查看器 ready 之前旧舞台**还在**，舞台上有切换覆盖层，
      // 新面在覆盖层之下 visibility:hidden 预挂（不是 display:none / aria-hidden）。
      assert.ok(
        container.querySelector("[data-pdf-legacy-stage]"),
        "查看器还没 ready 就卸了旧舞台——这就是用户看到的留白",
      );
      const overlay = container.querySelector("[data-mode-switch-pending='pro']");
      assert.ok(overlay, "切专业模式时没有 data-mode-switch-pending 覆盖层");
      assert.equal(overlay.parentElement, container.querySelector("[data-mode-switch-gate]"));
      const pendingSlot = viewer.closest("[data-mode-switch-face='pro']");
      assert.equal(pendingSlot.getAttribute("data-mode-switch-face-state"), "pending");
      assert.match(pendingSlot.getAttribute("style") || "", /visibility:\s*hidden/i);
      assert.equal(findHiddenAncestor(viewer), null, "待命面只许 visibility:hidden");

      assert.equal(typeof globalThis.__pdfViewerOnReady, "function", "ProViewer 没把 onReady 交给查看器");
      await act(async () => {
        globalThis.__pdfViewerOnReady();
      });
      await settle();
      assert.equal(
        container.querySelector("[data-pdf-legacy-stage]"),
        null,
        "查看器 ready 之后旧舞台还在",
      );
      assert.equal(container.querySelector("[data-mode-switch-pending]"), null, "ready 之后覆盖层还在");
      const shownViewer = container.querySelector("[data-embedpdf-viewer]");
      assert.ok(shownViewer);
      assert.equal(
        shownViewer.closest("[data-mode-switch-face='pro']").getAttribute("data-mode-switch-face-state"),
        "shown",
      );
      assert.doesNotMatch(
        shownViewer.closest("[data-mode-switch-face='pro']").getAttribute("style") || "",
        /visibility/i,
      );
    } finally {
      await unmount();
    }
  } finally {
    globalThis.__pdfViewerOnReady = null;
    if (previousWasm === undefined) delete process.env[PDFIUM_WASM_ENV_KEY];
    else process.env[PDFIUM_WASM_ENV_KEY] = previousWasm;
    globalThis.__pdfiumEngineCalls = [];
  }
});
