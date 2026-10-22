// 2026-10-22 U4：Code → 编辑 → Code 之后，未保存草稿的 three.js 运行时不能丢。
// 平台内联的 three 运行时被代码页剥掉、藏在 hiddenRuntimeRef 里；组件重挂后 ref 为空，
// 试玩未保存草稿（运行 / 重载）就接不回 THREE。运行时随进程内存暂存一起走；暂存里没有
// （恢复草稿跨刷新，恢复草稿里故意不放 ~700KB 运行时）时，从已保存信封重新取。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

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
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/library",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
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

const RUNTIME =
  '<script data-leoplay-runtime="three@0.160.0">window.THREE={};</script>\n';
const BODY = "<body><script>new THREE.Scene();window.GAME=1</script></body></html>";
const SAVED_WITH_RUNTIME = "<!doctype html><html><head>" + RUNTIME + "</head>" + BODY;
const VISIBLE = "<!doctype html><html><head></head>" + BODY;

function gameItem(artifactId, inline) {
  const artifact = {
    schema: "oceanleo.artifact.v1",
    artifactId,
    revisionId: "rev-1",
    artifactType: "game",
    owner: { originSiteKey: "game" },
    access: { canRead: true, canPreview: true, canExportSource: true, canEdit: true, canFork: true },
    integrity: { ok: true },
    provenance: { id: "p1", sourceKind: "platform", licenseCode: "official" },
    renditions: {
      full: { url: `https://cdn.test/${artifactId}/full.json`, digest: "d-full", mediaType: "application/json" },
      preview: { url: `https://cdn.test/${artifactId}/cover.png`, digest: "d-cover", mediaType: "image/png" },
    },
  };
  return {
    key: `artifact:${artifactId}:rev-1`,
    source: "artifact",
    id: artifactId,
    title: "三维",
    kind: "game",
    siteId: "game",
    favorite: false,
    meta: { game_source: inline, engine_api_version: "1" },
    artifactId,
    revisionId: "rev-1",
    artifactType: "game",
    artifact,
    previewUrl: "https://cdn.test/cover.png",
    thumbUrl: "https://cdn.test/cover.png",
    url: artifact.renditions.full.url,
  };
}

async function mount(element) {
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
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
const click = async (node) => {
  await act(async () => {
    node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
};
const settle = async (ms = 30) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};
const q = (container, selector) => container.querySelector(selector);
async function type(node, value) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(node, value);
    node.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

const previewHostStub = dataModule(`
  export function registerGamePreviewHost() {}
  export function useGamePreviewHost() { return globalThis.__host || null; }
`);
function FakeHost(props) {
  (globalThis.__hostRenders ||= []).push({ source: props.source });
  return React.createElement("div", { "data-testid": "fake-host" });
}
const lastRender = () => globalThis.__hostRenders.at(-1);

// 与真实暂存同形的进程内小仓：测试能直接播一份「不带运行时」的暂存。
const routeStub = dataModule(`
  const heads = new Map();
  const key = (i) => String(i.artifactId || i.key || i.id || "");
  export const GAME_WORKING_DOCUMENT_SCHEMA = "oceanleo.game.edit.v1";
  export function stashGameWorkingDocument(item, doc) {
    if (!doc) heads.delete(key(item)); else heads.set(key(item), doc);
  }
  export function peekGameWorkingDocument(item) { return heads.get(key(item)) ?? null; }
  export function asGameWorkingDocument(payload) { return payload && typeof payload === "object" ? payload : null; }
`);
const routeApi = await import(routeStub);

const stage = await import(
  await compileModule("src/shell/game-editor/GameCodeStage.tsx", {
    "../AdvancedWorkbenchShell": dataModule(`
      import { jsx, jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
      export function AdvancedWorkbenchShell({ adapter }) {
        return jsxs("div", { children: [
          adapter.toolbox && adapter.toolbox.content ? adapter.toolbox.content : null,
          adapter.stage || null,
        ] });
      }
    `),
    "../advanced-session": dataModule(`export function advancedSavedItem(i){return i;} export async function commitAdvancedSavedRevision(b){return b;}`),
    "../artifact-client": dataModule(`export async function createArtifactRevision(){throw new Error("unused");} export async function forkArtifact(){return {ok:false,error:"no"};}`),
    "../../lib/database": dataModule(`export async function uploadFile(){return {ok:false};}`),
    "../plugin-command": dataModule(`export function usePluginCommandSurface() {}`),
    "../agent-review": dataModule(`export function rememberEditorChips(){return true;} export function publishAgentSelection(){return null;}`),
    "../../i18n/ui/useUI": dataModule(`export function useUI() { return (v) => v; }`),
    "./preview-host": previewHostStub,
    "../advanced-routes/GameRoute": routeStub,
  })
);

function reset() {
  globalThis.__host = FakeHost;
  globalThis.__hostRenders = [];
  globalThis.__fetches = [];
  globalThis.fetch = async (url) => {
    globalThis.__fetches.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => ({ source: SAVED_WITH_RUNTIME, origin: "ai" }),
    };
  };
}
const mountStage = (item) =>
  mount(React.createElement(stage.GameCodeStage, { item, onClose() {} }));

test("Code -> 编辑 -> Code：暂存带着运行时，试玩草稿仍接回 THREE", async () => {
  reset();
  const item = gameItem("art-rt-a", SAVED_WITH_RUNTIME);
  let mounted = await mountStage(item);
  await settle();
  const editor = q(mounted.container, "[data-testid=game-code-editor]");
  assert.equal(editor.value, VISIBLE, "代码页不显示运行时");
  const edited = VISIBLE.replace("GAME=1", "GAME=2");
  await type(editor, edited);
  await mounted.unmount(); // 切到「编辑」页：代码舞台卸载
  assert.ok(routeApi.peekGameWorkingDocument(item)?.hiddenRuntime, "暂存里带着运行时");
  mounted = await mountStage(item); // 再切回 Code
  try {
    await settle();
    await click(q(mounted.container, "[data-testid=game-run]"));
    const played = lastRender().source;
    assert.ok(played.includes("data-leoplay-runtime"), "草稿快照接回了 three 运行时");
    assert.ok(played.includes("GAME=2"), "快照是未保存的草稿");
    assert.equal(
      q(mounted.container, "[data-testid=game-code-editor]").value.includes("data-leoplay-runtime"),
      false,
    );
  } finally {
    await mounted.unmount();
  }
});

test("暂存里没有运行时（跨刷新恢复）：从已保存信封重新取出", async () => {
  reset();
  const item = gameItem("art-rt-b", "");
  const edited = VISIBLE.replace("GAME=1", "GAME=3");
  routeApi.stashGameWorkingDocument(item, {
    envelopeUrl: item.url,
    envelopeDigest: "d-full",
    bundleFormat: "html",
    coverUrl: "",
    coverDigest: "",
    manifestUrl: "",
    manifestDigest: "",
    engineApiVersion: "1",
    skeletonVersion: "",
    prompt: "",
    origin: "ai",
    source: edited,
    sourceDirty: true,
  });
  const mounted = await mountStage(item);
  try {
    await settle(60);
    assert.deepEqual(globalThis.__fetches, [item.url], "只为取运行时读一次信封");
    await click(q(mounted.container, "[data-testid=game-run]"));
    const played = lastRender().source;
    assert.ok(played.includes("data-leoplay-runtime"));
    assert.ok(played.includes("GAME=3"));
    assert.ok(
      routeApi.peekGameWorkingDocument(item).hiddenRuntime,
      "取到之后写回暂存，下次不再取",
    );
  } finally {
    await mounted.unmount();
  }
});

test("没用 THREE 的草稿：不为运行时多发请求", async () => {
  reset();
  const item = gameItem("art-rt-c", "");
  routeApi.stashGameWorkingDocument(item, {
    envelopeUrl: item.url, envelopeDigest: "d-full", bundleFormat: "html",
    coverUrl: "", coverDigest: "", manifestUrl: "", manifestDigest: "",
    engineApiVersion: "1", skeletonVersion: "", prompt: "", origin: "ai",
    source: "<!doctype html><html><body><script>1</script></body></html>",
    sourceDirty: true,
  });
  const mounted = await mountStage(item);
  try {
    await settle(60);
    assert.deepEqual(globalThis.__fetches, []);
  } finally {
    await mounted.unmount();
  }
});
