// 插件页分版：COM 不拉、不渲染国内云市场；CN 卡片有图/商家/截断价；
// 官方技能中英分列；连接器卡用 SVG / 字母块，不再画 emoji。
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
      },
      {
        code: "plain-mcp",
        name: "无图服务",
        vendor: "测试商",
        price: "0.010000",
        currency: "CNY",
        unit: "次",
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

const skillsStub = dataModule(`
  export const OFFICIAL_SKILLS = [
    { name: "研究报告", content: "cn-report" },
    { name: "幻灯片演示", content: "cn-slides" },
    { name: "竞品分析", content: "cn-comp" },
    { name: "每周总结", content: "cn-week" },
    { name: "数据清洗", content: "cn-data" },
  ];
  export const OFFICIAL_SKILLS_COM = [
    { name: "Research report", content: "com-report" },
    { name: "Slide deck", content: "com-slides" },
    { name: "Competitor analysis", content: "com-comp" },
    { name: "Weekly recap", content: "com-week" },
    { name: "Data cleanup", content: "com-data" },
  ];
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

const domainStub = dataModule(`
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
  "../lib/org-api": orgApiStub,
  "../lib/database": databaseStub,
  "../lib/mcp-api": mcpApiStub,
  "./plugins/skills-api": skillsStub,
  "../i18n/ui/useUI": uiStub,
  "../contracts/domain-family": domainStub,
};

const { PluginsPage } = await import(
  await compileModule("src/pages/PluginsPage.tsx", OVERRIDES, { missingPackageStub: lazyStub })
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
  const url = family === "cn" ? "https://chat.oceanleo.cn/plugins" : "https://chat.oceanleo.com/plugins";
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
    await act(async () => root.render(React.createElement(PluginsPage, props)));
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
      click: (node) => {
        assert.ok(node, "点不到目标");
        return act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
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

test("COM：不 fetch 云市场、不出现书旗类货架名；技能与连接器仍在", async () => {
  await withDom(async ({ render, find, text, catalogCalls }) => {
    await render();
    assert.equal(catalogCalls(), 0, "COM 不许调用 getMcpCatalog");
    assert.equal(find("[data-mcp-catalog]"), null, "COM 不渲染市场网格");
    assert.ok(!text().includes("书旗"), "COM 不得出现国内货架名");
    assert.ok(!text().includes("17694.44444444"), "COM 更不该打出长尾价");
    assert.ok(find("[data-plugins-skills]"), "技能区仍在");
    assert.ok(find("[data-plugins-connectors]"), "连接器仍在");
    assert.ok(find('[data-mcp-connector="github"]'), "连接器卡仍渲染");
  }, "com");
});

test("CN：市场卡片有 image_url、vendor、截断到最多 4 位小数的价格；无图走字母块", async () => {
  await withDom(async ({ render, find, text, catalogCalls }) => {
    await render();
    assert.ok(catalogCalls() >= 1, "CN 要拉云市场目录");
    assert.ok(find("[data-mcp-catalog-grid]"), "CN 渲染市场网格");
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

test("COM 官方库英文名；CN 官方库中文名", async () => {
  await withDom(async ({ render, find, click, text }) => {
    await render();
    const add = [...find("[data-plugins-skills]").querySelectorAll("button")].find((b) =>
      (b.textContent || "").includes("从官方库添加"),
    );
    await click(add);
    assert.ok(find('[data-official-skill="Research report"]'));
    assert.ok(find('[data-official-skill="Slide deck"]'));
    assert.ok(find('[data-official-skill="Competitor analysis"]'));
    assert.ok(find('[data-official-skill="Weekly recap"]'));
    assert.ok(find('[data-official-skill="Data cleanup"]'));
    assert.ok(!text().includes("研究报告"));
  }, "com");

  await withDom(async ({ render, find, click, text }) => {
    await render();
    const add = [...find("[data-plugins-skills]").querySelectorAll("button")].find((b) =>
      (b.textContent || "").includes("从官方库添加"),
    );
    await click(add);
    assert.ok(find('[data-official-skill="研究报告"]'));
    assert.ok(find('[data-official-skill="幻灯片演示"]'));
    assert.ok(!text().includes("Research report"));
  }, "cn");
});

test("连接器卡不渲染 🐙 📄；github / notion 走品牌 SVG", async () => {
  await withDom(async ({ render, find }) => {
    await render();
    const github = find('[data-mcp-connector="github"]');
    const notion = find('[data-mcp-connector="notion"]');
    assert.ok(github);
    assert.ok(notion);
    assert.ok(!github.textContent.includes("🐙"), "不得把 emoji 当品牌标");
    assert.ok(!notion.textContent.includes("📄"));
    assert.equal(github.querySelector('[data-connector-icon-kind="brand"]')?.getAttribute("data-connector-icon"), "github");
    assert.equal(notion.querySelector('[data-connector-icon-kind="brand"]')?.getAttribute("data-connector-icon"), "notion");
    assert.ok(github.querySelector("svg"), "品牌标是内联 SVG");
    assert.ok(notion.querySelector("svg"));
  }, "com");
});
