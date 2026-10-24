// 连接器分版：COM 不拉、不渲染国内云市场；CN 卡片有图/商家/截断价；
// 连接器卡用官方品牌文件，不再画 emoji / 手画 path。
//
// skills-overhaul W10（2026-10-24，合同 D3）改动说明（过期断言）：
//   - 被测对象从 PluginsPage 换成设置中心「连接器」栏 ConnectorsSettingsPane；目录（含国内版
//     阿里云市场）在「+ 添加连接器 ▾ → 从连接器目录添加」打开的大弹窗里，阿里云市场是其中一个
//     页签；卡片点开显示说明与「去阿里云开通 ↗」外链，不再是页面上另一大块。原「CN 页面上有市场
//     网格」改为「页面上没有、目录弹窗里有」。
//   - 删掉「COM 官方库英文名；CN 官方库中文名」：那是旧 agent_knowledge 提示模板的内置清单
//     （SkillsSection / skills-api 已删）。新官方技能库来自网关 /v1/skills/official，中英名由
//     W09B 的 OfficialSkillLibraryDialog 显示，判据在 sko-w09b-*。
//
// 跑法（必须带 loader）：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/plugins-edition-catalog.test.mjs

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
    globalThis.__W4_CATALOG_CALLS__ = (globalThis.__W4_CATALOG_CALLS__ || 0) + 1;
    return { ok: true, data: { items: [
      {
        code: "shuqi",
        name: "书旗",
        vendor: "阿里云",
        description: "阅读",
        price: 17694.44444444,
        currency: "CNY",
        unit: "次",
        image_url: "https://cdn.example/shuqi.png",
        detail_url: "https://market.aliyun.com/products/shuqi",
      },
      {
        code: "plain-mcp",
        name: "无图服务",
        vendor: "测试商",
        price: "0.010000",
        currency: "CNY",
        unit: "次",
        detail_url: "java" + "script:alert(1)",
      },
    ] } };
  }
`);

const mcpApiStub = dataModule(`
  export function mcpGatewayDetail() { return ""; }
  export function mcpOauthReturnOrigin() { return "https://oceanleo.com"; }
  export function mcpOauthMessageOrigin() { return "https://api.oceanleo.com"; }
  export function mcpOauthOpensPortalPage() { return false; }
  export function mcpOauthPortalPageHref() { return "https://oceanleo.com/plugins"; }
  export async function getMcpRegistry() {
    return { items: [
      { id: "github", name: "GitHub", desc: "代码托管", icon: "🐙", category: "开发", transport: "sse", auth: "oauth", auth_header: "", needs_endpoint: false, endpoint: "", help_url: "", docs: "", supports_oauth: true },
      { id: "notion", name: "Notion", desc: "文档", icon: "📄", category: "效率", transport: "sse", auth: "oauth", auth_header: "", needs_endpoint: false, endpoint: "", help_url: "", docs: "", supports_oauth: true },
    ] };
  }
  export async function getMcpConnections() { return []; }
  export async function connectMcp() { return { ok: true }; }
  export async function startMcpOauth() { return { ok: false }; }
  export async function disconnectMcp() { return { ok: true }; }
  export async function toggleMcp() { return { ok: true }; }
  export async function probeMcp() { return { ok: true }; }
`);

const uiStub = dataModule(`
  export function useUI(){
    return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;
  }
`);

// 其余导出（CONFIGURED_DOMAIN_FAMILY、domainProfileForHost…）照真模块转出：连接器栏的依赖图里
// 有模块要它们；本地同名导出优先于 export *，所以只有这两个函数被替换。
const domainFamilyUrl = pathToFileURL(new URL("../src/contracts/domain-family.ts", import.meta.url).pathname).href;
const domainStub = dataModule(`
  export * from ${JSON.stringify(domainFamilyUrl)};
  export function currentDomainFamily() { return globalThis.__W4_FAMILY__ || "com"; }
  export function currentDomainProfile() {
    const cn = currentDomainFamily() === "cn";
    return { portalOrigin: cn ? "https://oceanleo.cn" : "https://oceanleo.com" };
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
  "../../contracts/domain-family": domainStub,
};

const { ConnectorsSettingsPane } = await import(
  await compileModule("src/pages/settings/ConnectorsSettingsPane.tsx", OVERRIDES, { missingPackageStub: lazyStub })
);

async function withDom(run, family = "com") {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM, VirtualConsole } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];

  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", () => {});
  const url = family === "cn" ? "https://chat.oceanleo.cn/settings/connectors" : "https://chat.oceanleo.com/settings/connectors";
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
  globalThis.__W4_FAMILY__ = family;
  globalThis.__W4_CATALOG_CALLS__ = 0;

  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  const settle = async () => {
    for (let i = 0; i < 6; i += 1) await act(async () => {});
  };
  const render = async (props = {}) => {
    await act(async () => root.render(React.createElement(ConnectorsSettingsPane, props)));
    await settle();
  };

  try {
    return await run({
      render,
      settle,
      container,
      text: () => `${container.textContent || ""}${window.document.body.textContent || ""}`,
      find: (selector) => window.document.querySelector(selector),
      findAll: (selector) => [...window.document.querySelectorAll(selector)],
      click: async (node) => {
        assert.ok(node, "点不到目标");
        await act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
        await settle();
      },
      catalogCalls: () => globalThis.__W4_CATALOG_CALLS__ || 0,
    });
  } finally {
    await act(async () => root.unmount());
    window.close();
    delete globalThis.__W4_FAMILY__;
    delete globalThis.__W4_CATALOG_CALLS__;
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

async function openCatalog({ find, click }) {
  await click(find("[data-plugins-connectors] [data-add-menu-trigger]"));
  await click(find('[data-add-menu-item="catalog"]'));
  const catalog = find('[data-testid="connector-catalog"]');
  assert.ok(catalog, "「从连接器目录添加」打开目录大弹窗");
  return catalog;
}

test("COM：不 fetch 云市场、目录里没有阿里云市场页签与货架名；注册表连接器在目录里", async () => {
  await withDom(async (ctx) => {
    const { render, find, text, catalogCalls } = ctx;
    await render();
    assert.equal(catalogCalls(), 0, "COM 不许调用 getMcpCatalog");
    const catalog = await openCatalog(ctx);
    assert.equal(catalogCalls(), 0, "打开目录也不许调用 getMcpCatalog");
    assert.equal(catalog.querySelector('[data-connector-catalog-tab="aliyun-marketplace"]'), null);
    assert.equal(find("[data-mcp-catalog]"), null, "COM 不渲染市场网格");
    assert.ok(!text().includes("书旗"), "COM 不得出现国内货架名");
    assert.ok(!text().includes("17694.44444444"), "COM 更不该打出长尾价");
    assert.ok(catalog.querySelector('[data-mcp-connector="github"]'), "连接器卡在目录里");
  }, "com");
});

test("CN：设置页上不再平铺阿里云市场；目录弹窗里「阿里云市场」是一个页签", async () => {
  await withDom(async (ctx) => {
    const { render, find, findAll, click, text, catalogCalls } = ctx;
    await render();
    assert.ok(catalogCalls() >= 1, "CN 要拉云市场目录");
    assert.equal(find("[data-mcp-catalog]"), null, "页面上不再有市场网格（不再是另一大块）");
    assert.ok(!text().includes("书旗"));
    const catalog = await openCatalog(ctx);
    const filter = catalog.querySelector('[data-collection-filter="connector-category"]');
    await click(filter);
    const tab = find('[role="option"][data-value="aliyun-marketplace"]');
    assert.ok(tab, "国内版目录分类下拉有「阿里云市场」");
    assert.match(tab.textContent || "", /阿里云市场/);
    assert.ok(catalog.querySelector("[data-connector-catalog-marketplace] [data-mcp-catalog-grid]"), "「全部」页签里也列出市场条目");
    await click(tab);
    assert.equal(filter.getAttribute("data-value"), "aliyun-marketplace");
    assert.equal(catalog.querySelector('[data-mcp-connector="github"]'), null, "「阿里云市场」页签只列市场条目");
    assert.ok(findAll("[data-mcp-catalog-card]").length === 2);
  }, "cn");
});

test("CN：市场卡片有 image_url、vendor、截断到最多 4 位小数的价格；无图走字母块", async () => {
  await withDom(async (ctx) => {
    const { render, find, text } = ctx;
    await render();
    await openCatalog(ctx);
    assert.ok(find("[data-mcp-catalog-grid]"), "CN 目录里渲染市场网格");
    assert.ok(text().includes("书旗"));
    assert.ok(text().includes("阿里云"));
    const img = find("[data-mcp-catalog-image]");
    assert.ok(img, "有图的卡要渲染 <img>");
    assert.equal(img.getAttribute("src"), "https://cdn.example/shuqi.png");
    assert.ok(!text().includes("17694.44444444"), "不许打出原始 float 长尾");
    const price = find("[data-mcp-catalog-price]");
    assert.ok(price, "付费卡要有价格");
    assert.match(price.textContent || "", /17694\.4444/);
    const plain = find('[data-mcp-catalog-card="plain-mcp"]');
    assert.ok(plain, "无图卡也要在");
    assert.ok(text().includes("测试商"));
    assert.ok(plain.querySelector('[data-connector-icon-kind="letter"]'), "无图走字母块");
    assert.equal(plain.querySelector("[data-mcp-catalog-image]"), null);
  }, "cn");
});

test("CN：市场卡点开 = 说明 + 「去阿里云开通 ↗」外链（新窗口、noopener）；非 http(s) 地址不出链接", async () => {
  await withDom(async (ctx) => {
    const { render, find, click } = ctx;
    await render();
    await openCatalog(ctx);
    await click(find('[data-mcp-catalog-card="shuqi"]'));
    const detail = find('[data-in-tree-dialog="mcp-marketplace-detail"]');
    assert.ok(detail, "点市场卡打开说明");
    assert.match(detail.textContent || "", /阅读/);
    const link = detail.querySelector("[data-mcp-marketplace-open]");
    assert.ok(link, "有「去阿里云开通」按钮");
    assert.match(link.textContent || "", /去阿里云开通/);
    assert.equal(link.getAttribute("href"), "https://market.aliyun.com/products/shuqi");
    assert.equal(link.getAttribute("target"), "_blank");
    assert.match(link.getAttribute("rel") || "", /noopener/);
    await click(detail.querySelector('[aria-label="关闭"]'));
    await click(find('[data-mcp-catalog-card="plain-mcp"]'));
    const unsafe = find('[data-in-tree-dialog="mcp-marketplace-detail"]');
    assert.ok(unsafe);
    assert.equal(unsafe.querySelector("[data-mcp-marketplace-open]"), null, "脚本伪协议地址不渲染成链接");
  }, "cn");
});

test("连接器卡不渲染 🐙 📄；github / notion 走官方品牌文件", async () => {
  await withDom(async (ctx) => {
    const { render, find } = ctx;
    await render();
    await openCatalog(ctx);
    const github = find('[data-mcp-connector="github"]');
    const notion = find('[data-mcp-connector="notion"]');
    assert.ok(github);
    assert.ok(notion);
    assert.ok(!github.textContent.includes("🐙"), "不得把 emoji 当品牌标");
    assert.ok(!notion.textContent.includes("📄"));
    assert.equal(github.querySelector('[data-connector-icon-kind="brand"]')?.getAttribute("data-connector-icon"), "github");
    assert.equal(notion.querySelector('[data-connector-icon-kind="brand"]')?.getAttribute("data-connector-icon"), "notion");
    assert.ok(github.querySelector("img"), "品牌标是官方文件");
    assert.ok(notion.querySelector("img"));
  }, "com");
});
