// 「插件与连接器」共享页要有个人 MCP 目录：连接 / 断开 / 探活（editors-and-shell-0924 W09）。
//
// 今天主站那页是门户本地 1474 行副本，共享 PluginsPage 只有组织区 + 阿里云市场卡片。
// 子站用户看不到连接器目录，也不能在这一页连上、断开、探活。本文件钉住共享页
// 必须渲染出那三个入口（假 fetch），以及 OAuth 回跳 origin 按当前来源生成且不含通配。
//
// 跑法（必须带 loader）：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/eas-w09-mcp-connectors.test.mjs

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
  export function mcpOauthReturnOrigin(raw) {
    const value = raw || (typeof location !== "undefined" ? location.origin : "");
    try {
      const url = new URL(value);
      if (url.hostname.includes("*") || String(value).includes("*")) return "";
      return url.origin;
    } catch { return ""; }
  }
  export function mcpOauthMessageOrigin() { return "https://api.oceanleo.com"; }
  export function mcpOauthOpensPortalPage(site, portal) {
    return mcpOauthReturnOrigin(site) !== mcpOauthReturnOrigin(portal);
  }
  export function mcpOauthPortalPageHref(portal, id) {
    const origin = mcpOauthReturnOrigin(portal);
    return origin ? origin + "/plugins#connect=" + encodeURIComponent(id || "") : "";
  }
  export async function getMcpRegistry() {
    return { items: [
      { id: "github", name: "GitHub", desc: "代码托管", icon: "🐙", category: "开发", transport: "sse", auth: "oauth", auth_header: "", needs_endpoint: false, endpoint: "", help_url: "", docs: "GitHub MCP", supports_oauth: true },
      { id: "custom", name: "自建服务", desc: "贴凭证", icon: "🔌", category: "其他", transport: "sse", auth: "token", auth_header: "", needs_endpoint: true, endpoint: "", help_url: "https://example.com/help", docs: "自建", supports_oauth: false },
    ] };
  }
  export async function getMcpConnections() {
    return [{ id: "c1", connector_id: "custom", label: "自建服务", endpoint: "https://mcp.example.com", auth_header: "", fingerprint: "ab12", tools_count: 3, enabled: true }];
  }
  export async function connectMcp() { return { ok: true, tools_count: 1 }; }
  export async function startMcpOauth() { return { ok: false, error: "stub" }; }
  export async function disconnectMcp() { return { ok: true }; }
  export async function toggleMcp() { return { ok: true }; }
  export async function probeMcp() { return { ok: true, tools_count: 3 }; }
`);

const skillsStub = dataModule(`
  export const OFFICIAL_SKILLS = [];
  export const SKILLS_NOT_CONFIGURED = "未配置 Supabase";
  export const SKILLS_SIGNED_OUT = "请先登录";
  export async function listSkills() { return []; }
  export async function addSkill() { return null; }
  export async function setSkillEnabled() { return null; }
  export async function deleteSkill() { return null; }
  export async function listRecentTasks() { return []; }
  export async function firstUserPrompt() { return ""; }
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

const OVERRIDES = {
  "../lib/org-api": orgApiStub,
  "../lib/database": databaseStub,
  "../lib/mcp-api": mcpApiStub,
  "./plugins/skills-api": skillsStub,
  "../i18n/ui/useUI": uiStub,
};

const { PluginsPage } = await import(
  await compileModule("src/pages/PluginsPage.tsx", OVERRIDES, { missingPackageStub: lazyStub })
);

async function withDom(run, url = "https://ppt.oceanleo.com/plugins") {
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
    url,
    virtualConsole,
  });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    location: window.location,
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
    for (let i = 0; i < 6; i += 1) await act(async () => {});
  };

  try {
    return await run({
      render,
      container,
      window,
      find: (selector) => container.querySelector(selector),
      findAll: (selector) => [...container.querySelectorAll(selector)],
      click: (node) => {
        assert.ok(node, "点不到目标");
        return act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
      },
    });
  } finally {
    await act(async () => root.unmount());
    window.close();
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

test("共享页渲染个人 MCP 目录，已连接的卡上有断开 / 探活入口", async () => {
  await withDom(async ({ render, find, click }) => {
    await render();
    assert.ok(find("[data-plugins-connectors]"), "共享页必须有个人 MCP 连接器区");
    assert.ok(find('[data-mcp-connector="github"]'), "目录里要有未连接的 GitHub");
    assert.ok(find('[data-mcp-connector="custom"]'), "目录里要有已连接的自建服务");
    await click(find('[data-mcp-connector="custom"]'));
    assert.ok(find("[data-mcp-probe]"), "已连接的连接器对话框要有探活");
    assert.ok(find("[data-mcp-disconnect]"), "已连接的连接器对话框要有断开");
    assert.ok(find("[data-mcp-connect]"), "已连接的连接器对话框要有重新连接入口");
  });
});

test("未连接的一键授权卡打开后有连接入口；pane 形态仍无页头", async () => {
  await withDom(async ({ render, find, findAll, click }) => {
    await render({ variant: "pane" });
    assert.equal(find("h1"), null, "pane 形态不该再渲染页头 h1");
    assert.equal(
      findAll("button").filter((b) => b.getAttribute("aria-label") === "返回").length,
      0,
      "设置窗面板里不该有页头的「返回」键",
    );
    await click(find('[data-mcp-connector="github"]'));
    assert.ok(find("[data-mcp-oauth]") || find("[data-mcp-connect]"), "未连接的卡要有连接 / 一键授权入口");
  });
});

test("页面上的 OAuth 回跳 origin 等于当前来源，且不含通配", async () => {
  await withDom(async ({ render, find }) => {
    await render();
    const node = find("[data-mcp-oauth-return-origin]");
    assert.ok(node, "页面要写出当前站点的回跳 origin，测试才能核对");
    const origin = node.getAttribute("data-mcp-oauth-return-origin") || "";
    assert.equal(origin, "https://ppt.oceanleo.com");
    assert.ok(!origin.includes("*"), `回跳 origin 含通配：${origin}`);
  });
});
