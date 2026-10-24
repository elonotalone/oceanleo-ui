// 设置中心「连接器」栏（skills-overhaul W10，2026-10-24；前身 editors-and-shell-0924 W09 的
// 「插件与连接器」共享页个人 MCP 目录）：连接 / 断开 / 探活 / 一键授权全部保留，但页面只列
// **我已连接的**，目录挪进「+ 添加连接器 ▾ → 从连接器目录添加」打开的大弹窗；自定义 MCP 是
// 添加菜单里的一项。本文件钉住这些入口（假 fetch），以及 OAuth 回跳 origin 按当前来源生成且不含通配。
//
// W10 改动说明（过期断言）：原断言「页面上平铺目录卡 data-mcp-connector=github/custom」与 D3
// 「页面只列已添加的」冲突，改为：页面上是「我的连接器」卡（data-my-connector），目录卡只在目录弹窗里；
// 原「pane 形态」那条改测独立页（pane 形态现在只渲染技能栏，见 eas-w09-plugins-pane）。
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
      { id: "custom", name: "自建服务", desc: "贴凭证", icon: "🔌", category: "其他", transport: "sse", auth: "url+token", auth_header: "", needs_endpoint: true, endpoint: "", help_url: "https://example.com/help", docs: "自建", supports_oauth: true },
    ] };
  }
  export async function getMcpConnections() {
    const rows = globalThis.__W10_MCP_CONNECTIONS__;
    if (Array.isArray(rows)) return rows;
    return [{ id: "c1", connector_id: "custom", label: "自建服务", endpoint: "https://mcp.example.com", auth_header: "", fingerprint: "ab12", tools_count: 3, enabled: true }];
  }
  export async function connectMcp(input) {
    const hook = globalThis.__W2_MCP_CONNECT__;
    if (typeof hook === "function") return hook(input);
    return { ok: true, tools_count: 1 };
  }
  export async function startMcpOauth() { return { ok: false, error: "stub" }; }
  export async function disconnectMcp() { return { ok: true }; }
  export async function toggleMcp() { return { ok: true }; }
  export async function probeMcp(id) {
    const hook = globalThis.__W10_MCP_PROBE__;
    if (typeof hook === "function") return hook(id);
    return { ok: true, tools_count: 3 };
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

const OVERRIDES = {
  "../../lib/org-api": orgApiStub,
  "../../lib/database": databaseStub,
  "../../lib/mcp-api": mcpApiStub,
  "../../i18n/ui/useUI": uiStub,
};

const { ConnectorsSettingsPane } = await import(
  await compileModule("src/pages/settings/ConnectorsSettingsPane.tsx", OVERRIDES, { missingPackageStub: lazyStub })
);

async function withDom(run, url = "https://ppt.oceanleo.com/settings/connectors") {
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
    await act(async () => root.render(React.createElement(ConnectorsSettingsPane, props)));
    for (let i = 0; i < 6; i += 1) await act(async () => {});
  };

  try {
    return await run({
      render,
      container,
      window,
      find: (selector) => window.document.querySelector(selector),
      findAll: (selector) => [...window.document.querySelectorAll(selector)],
      click: async (node) => {
        assert.ok(node, "点不到目标");
        await act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
        for (let i = 0; i < 4; i += 1) await act(async () => {});
      },
    });
  } finally {
    await act(async () => root.unmount());
    window.close();
    delete globalThis.__W2_MCP_CONNECT__;
    delete globalThis.__W10_MCP_CONNECTIONS__;
    delete globalThis.__W10_MCP_PROBE__;
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

async function openAddMenu(find, click) {
  await click(find("[data-plugins-connectors] [data-add-menu-trigger]"));
  assert.ok(find("[data-add-menu]"), "「+ 添加连接器 ▾」要展开菜单");
}

async function openCatalog(find, click) {
  await openAddMenu(find, click);
  await click(find('[data-add-menu-item="catalog"]'));
  const catalog = find('[data-testid="connector-catalog"]');
  assert.ok(catalog, "「从连接器目录添加」要打开目录大弹窗");
  return catalog;
}

test("页面只列我已连接的连接器：状态、开关、…菜单（重新连接 / 探活 / 断开）", async () => {
  await withDom(async ({ render, find, findAll, click }) => {
    await render();
    assert.ok(find("[data-plugins-connectors]"), "连接器栏根节点仍带 data-plugins-connectors");
    const mine = find('[data-my-connector="custom"]');
    assert.ok(mine, "已连接的自建服务在「我的连接器」里");
    assert.equal(mine.getAttribute("data-my-connector-status"), "connected");
    assert.match(mine.textContent || "", /已连接 · 3 工具/);
    assert.equal(find('[data-my-connector="github"]'), null, "未连接的 GitHub 不在页面上");
    assert.equal(find('[data-mcp-connector="github"]'), null, "目录卡不平铺在页面上");
    assert.ok(mine.querySelector("[data-config-toggle]"), "卡上有开关");
    assert.ok(!(find("[data-plugins-connectors]").textContent || "").includes("可一键授权"), "没有「可一键授权」筛选开关");
    assert.equal(findAll("[data-plugins-connectors] [data-add-menu-trigger]").length, 1, "只有一个「+ 添加」");

    await click(mine.querySelector('[data-connector-row-menu] button'));
    assert.ok(find('[data-connector-menu="reconnect"]'));
    assert.ok(find('[data-connector-menu="probe"]'));
    assert.ok(find('[data-connector-menu="disconnect"]'));
    await click(find('[data-connector-menu="reconnect"]'));
    assert.ok(find("[data-mcp-probe]"), "已连接的连接器对话框要有探活");
    assert.ok(find("[data-mcp-disconnect]"), "已连接的连接器对话框要有断开");
    assert.ok(find("[data-mcp-connect]"), "已连接的连接器对话框要有重新连接入口");
  });
});

test("明确的授权失败 → 卡片显示「已失效」", async () => {
  globalThis.__W10_MCP_PROBE__ = async () => ({ ok: false, error: "401", needs_reauth: true });
  await withDom(async ({ render, find, click }) => {
    await render();
    const mine = find('[data-my-connector="custom"]');
    await click(mine.querySelector('[data-connector-row-menu] button'));
    await click(find('[data-connector-menu="probe"]'));
    assert.equal(find('[data-my-connector="custom"]').getAttribute("data-my-connector-status"), "stale");
    assert.match(find('[data-my-connector="custom"]').textContent || "", /已失效/);
  });
});

test("临时连接失败不标记授权失效，打开连接器不会自动探活", async () => {
  let probes = 0;
  globalThis.__W10_MCP_PROBE__ = async () => { probes += 1; return { ok: false, error: "HTTP 503" }; };
  await withDom(async ({ render, find, click }) => {
    await render();
    await click(find('[data-my-connector="custom"] [data-connector-row-menu] button'));
    await click(find('[data-connector-menu="reconnect"]'));
    assert.equal(probes, 0);
    await click(find('[data-mcp-probe]'));
    assert.equal(probes, 1);
    assert.notEqual(find('[data-my-connector="custom"]').getAttribute("data-my-connector-status"), "stale");
    assert.match(find('[data-in-tree-dialog="mcp-connect"]').textContent, /HTTP 503/);
  });
});

test("没有连接器：空状态 + 唯一的「+ 添加连接器」", async () => {
  globalThis.__W10_MCP_CONNECTIONS__ = [];
  await withDom(async ({ render, find, findAll }) => {
    await render();
    assert.ok(find("[data-my-connectors-empty] [data-config-empty-state]"), "空状态");
    assert.match(find("[data-my-connectors-empty]").textContent || "", /还没有连接器/);
    assert.equal(findAll("[data-plugins-connectors] [data-add-menu-trigger]").length, 1, "空状态里只有一个添加按钮，工具条不再重复");
  });
});

test("目录弹窗：分类下拉与搜索并列；未连接的卡打开后有连接 / 一键授权入口", async () => {
  await withDom(async ({ render, find, click }) => {
    await render();
    const catalog = await openCatalog(find, click);
    const filter = catalog.querySelector('[data-collection-filter="connector-category"]');
    assert.ok(filter, "分类使用统一下拉");
    assert.equal(filter.getAttribute("data-value"), "all");
    await click(filter);
    assert.ok(find('[role="option"][data-value="开发"]'));
    assert.equal(find('[role="option"][data-value="aliyun-marketplace"]'), null);
    await click(find('[role="option"][data-value="all"]'));
    const github = catalog.querySelector('[data-mcp-connector="github"]');
    assert.ok(github, "目录里有未连接的 GitHub");
    assert.ok(github.querySelector("[data-mcp-oauth-tag]"), "支持一键授权的卡上只留小标签");
    assert.match(github.textContent || "", /一键授权/);
    assert.ok(catalog.querySelector('[data-mcp-connector="custom"] [data-mcp-connector-status="connected"]'), "已连接的卡标出状态");
    await click(github);
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

test("添加菜单「自定义 MCP 服务器」：主按钮是凭证连接，一键授权不在主路径", async () => {
  await withDom(async ({ render, find, click }) => {
    await render();
    await openAddMenu(find, click);
    await click(find('[data-add-menu-item="custom"]'));
    const dialog = find('[data-in-tree-dialog="mcp-connect"]');
    assert.ok(dialog, "连接对话框必须出现");
    const connectBtn = dialog.querySelector("button[data-mcp-connect]");
    assert.ok(connectBtn, "custom 的主路径必须是凭证按钮");
    assert.match(connectBtn.textContent || "", /保存/);
    assert.ok(dialog.querySelector("[data-mcp-oauth]"), "支持标准远程授权的 custom 保留一键授权");
  });
});

test("凭证连接失败时，网关原因写在对话框里，不依赖 toast", async () => {
  globalThis.__W2_MCP_CONNECT__ = async () => ({ ok: false, error: "连接失败：探针 502" });
  await withDom(async ({ render, find, click }) => {
    await render();
    await openAddMenu(find, click);
    await click(find('[data-add-menu-item="custom"]'));
    const dialog = find('[data-in-tree-dialog="mcp-connect"]');
    assert.ok(dialog);
    await click(dialog.querySelector("button[data-mcp-connect]"));
    const status = find("[data-mcp-connect-status]");
    assert.ok(status, "失败必须出现在对话框内的状态区");
    assert.equal(status.getAttribute("data-mcp-connect-status"), "error");
    assert.match(status.textContent || "", /连接失败：探针 502/);
    assert.match(dialog.textContent || "", /连接失败：探针 502/);
    assert.equal(find("[data-leo-toast-viewport]"), null, "失败不依赖 toast");
  });
});

test("旧授权弹窗入口 #connect=github（/plugins 重定向过来）：直接弹出 GitHub 连接框", async () => {
  await withDom(async ({ render, find }) => {
    await render();
    const dialog = find('[data-in-tree-dialog="mcp-connect"]');
    assert.ok(dialog, "#connect=github 应当直接打开连接框");
    assert.match(dialog.textContent || "", /GitHub/);
  }, "https://oceanleo.com/settings/connectors#connect=github");
});

test("initialConnectorId（设置中心转交，地址里的 hash 已被改写掉）同样直接弹出连接框", async () => {
  await withDom(async ({ render, find }) => {
    await render({ initialConnectorId: "github" });
    assert.ok(find('[data-in-tree-dialog="mcp-connect"]'));
  });
});
