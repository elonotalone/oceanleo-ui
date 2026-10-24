// 「插件与连接器」嵌进设置窗（editors-and-shell-0924 W09）的判据：pane 形态。
//
// skills-overhaul W10（2026-10-24）：设置中心拆成「技能」「连接器」两栏（各自的面板组件，
// 判据见 sko-w10-settings / eas-w09-mcp-connectors）。PluginsPage 保留给各站 /plugins：
//   - page（缺省）= 统一页头 + 技能、连接器两个面板上下排列；
//   - pane = 只为兼容旧调用，渲染技能面板。
// 过期断言改动：原「COM pane 不渲染阿里云市场网格 / 不出现高德地图」改为「pane 只有技能面板、
// 没有连接器面板」（阿里云市场已并进连接器目录弹窗，CN/COM 判据在 plugins-edition-catalog）；
// 两个面板在这里用替身——它们各自的内容由各自的测试管，这一份只管 PluginsPage 的外形。
//
// 设置窗的「插件与连接器」面板（W07 注册）直接渲染共享 `PluginsPage variant="pane"`。
// 面板区自己有标题、自己滚动，所以 pane 形态：
//   ① 不渲染统一页头（没有「返回」键、没有 h1）——否则设置窗里多出一个返回键，
//      点了 history.back() 会把背后的页面退回上一页；
//   ② 不占整页：根节点不带独立页的 `px-8 py-6` 外边距，也不带 `min-h-screen`；
//   ③ 独立页（缺省 / `variant="page"`）页头照旧在。
//
// 跑法（必须带 loader）：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/eas-w09-plugins-pane.test.mjs

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);

const orgApiStub = dataModule(`
  export class OrgApiError extends Error {}
  export async function listMyOrgs() { return []; }
  export async function listInheritedMcp() { return { connections: [] }; }
  export async function listOrgMcpConnections() { return { connections: [] }; }
  export async function upsertOrgMcpConnection() { return { ok: true }; }
  export async function patchOrgMcpConnection() { return { ok: true }; }
  export async function deleteOrgMcpConnection() { return { ok: true }; }
  export async function setOrgMcpForwardIdentity() { return { ok: true }; }
`);

const databaseStub = dataModule(`
  export async function getMcpCatalog() {
    return { ok: true, data: { items: [{ code: "amap", name: "高德地图", vendor: "阿里云", free: true }] } };
  }
`);

const mcpApiStub = dataModule(`
  export function mcpGatewayDetail() { return ""; }
  export function mcpOauthReturnOrigin() { return "https://chat.oceanleo.com"; }
  export function mcpOauthMessageOrigin() { return "https://api.oceanleo.com"; }
  export function mcpOauthOpensPortalPage() { return false; }
  export function mcpOauthPortalPageHref() { return "https://oceanleo.com/plugins"; }
  export async function getMcpRegistry() { return { items: [] }; }
  export async function getMcpConnections() { return []; }
  export async function connectMcp() { return { ok: true }; }
  export async function startMcpOauth() { return { ok: false }; }
  export async function disconnectMcp() { return { ok: true }; }
  export async function toggleMcp() { return { ok: true }; }
  export async function probeMcp() { return { ok: true }; }
`);

const reactUrl = pathToFileURL(require.resolve("react")).href;
const paneMarker = (exportName, attr) => dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function ${exportName}(props) {
    return React.createElement("section", { "${attr}": "", "data-heading": props.heading ? "1" : "0" });
  }
`);

const uiStub = dataModule(`
  export function useUI(){
    return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;
  }
`);

const lazyStub = dataModule(
  "const noop = () => undefined;\n" +
    "export default new Proxy(noop, { get: () => noop });\n" +
    "export const __stub = true;\n",
);

const domainStub = dataModule(`
  export function currentDomainFamily() { return "com"; }
  export function currentDomainProfile() { return { portalOrigin: "https://oceanleo.com" }; }
`);

const OVERRIDES = {
  "../lib/org-api": orgApiStub,
  "../lib/database": databaseStub,
  "../lib/mcp-api": mcpApiStub,
  "./settings/SkillsSettingsPane": paneMarker("SkillsSettingsPane", "data-plugins-skills"),
  "./settings/ConnectorsSettingsPane": paneMarker("ConnectorsSettingsPane", "data-plugins-connectors"),
  "../i18n/ui/useUI": uiStub,
  "../contracts/domain-family": domainStub,
};

const { PluginsPage } = await import(
  await compileModule("src/pages/PluginsPage.tsx", OVERRIDES, { missingPackageStub: lazyStub })
);

async function withDom(run) {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM, VirtualConsole } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];

  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", () => {});
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://ppt.oceanleo.com/plugins",
    virtualConsole,
  });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
  })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    restore.push(() => {
      if (had) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: previous });
      else delete globalThis[name];
    });
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  const render = async (props = {}) => {
    await act(async () => root.render(React.createElement(PluginsPage, props)));
    for (let i = 0; i < 4; i += 1) await act(async () => {});
  };

  try {
    return await run({
      render,
      container,
      find: (selector) => container.querySelector(selector),
      findAll: (selector) => [...container.querySelectorAll(selector)],
    });
  } finally {
    await act(async () => root.unmount());
    window.close();
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

function backButtons(findAll) {
  return findAll("button").filter((b) => b.getAttribute("aria-label") === "返回");
}

test("pane 形态：没有统一页头（没有「返回」键、没有 h1）", async () => {
  await withDom(async ({ render, find, findAll, container }) => {
    await render({ variant: "pane" });
    assert.equal(backButtons(findAll).length, 0, "设置窗面板里不该有页头的「返回」键");
    assert.equal(find("h1"), null, "面板自己有标题，pane 形态不该再渲染页头 h1");
    assert.ok(find("[data-plugins-pane]"), "pane 形态的根节点要带 data-plugins-pane，宿主据此认面板");
    assert.ok(find("[data-plugins-skills]"), "pane 形态（旧调用）渲染技能面板");
    assert.equal(find("[data-plugins-connectors]"), null, "pane 形态不再混排连接器（连接器是设置中心单独一栏）");
    assert.equal(find("[data-mcp-catalog]"), null, "页面上没有阿里云市场网格（已并进连接器目录弹窗）");
    assert.ok(!container.textContent.includes("高德地图"), "页面上不平铺货架");
  });
});

test("pane 形态：不占整页——根节点没有独立页的外边距，也没有 min-h-screen", async () => {
  await withDom(async ({ render, container }) => {
    await render({ variant: "pane" });
    const rootClass = container.firstElementChild?.getAttribute("class") || "";
    assert.ok(!/\bpx-8\b/.test(rootClass) && !/\bpy-6\b/.test(rootClass), `pane 根节点不该带独立页外边距，实际：${rootClass}`);
    assert.ok(!/min-h-screen|h-screen/.test(rootClass), `pane 根节点不该占整屏，实际：${rootClass}`);
    assert.ok(/\bmin-h-0\b/.test(rootClass), `pane 根节点要能在宿主里收缩并滚动（min-h-0），实际：${rootClass}`);
  });
});

test("独立页（缺省与 variant=page）：统一页头照旧在", async () => {
  for (const props of [{}, { variant: "page" }]) {
    await withDom(async ({ render, find, findAll }) => {
      await render(props);
      assert.equal(backButtons(findAll).length, 1, `独立页要有页头「返回」键（props=${JSON.stringify(props)}）`);
      assert.ok(find("h1"), "独立页要有页头标题");
      assert.equal(find("[data-plugins-pane]"), null, "独立页不带 pane 标记");
      const skills = find("[data-plugins-skills]");
      const connectors = find("[data-plugins-connectors]");
      assert.ok(skills && connectors, "独立页上下排列技能与连接器两个面板");
      assert.ok(skills.compareDocumentPosition(connectors) & 4, "技能在上、连接器在下");
      assert.equal(skills.getAttribute("data-heading"), "1", "独立页里两个面板各带自己的标题");
      assert.equal(connectors.getAttribute("data-heading"), "1");
    });
  }
});
