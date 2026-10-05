// 插件页不再画组织共用连接器。那一块只在组织页。
// 这里钉死：无论有没有组织、是不是管理员，插件页都没有 `data-org-mcp-section`。
//
// 跑法（**必须带 loader**）：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/plugins-org-section.test.mjs

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);

// ————————————————————————————————————————————————————————————————
// 0. 夹具
// ————————————————————————————————————————————————————————————————

// W11 的 A3 五导出与本文件同波并行落地。这里按 `03-arbitration.md A3` 的签名打替身，
// 判的是**插件页怎么用这五个函数**，不是那五个函数自己。
const orgApiStub = dataModule(`
  const g = () => globalThis.__W15_ORG_API__;
  const count = (name) => { g().calls.push(name); };
  export class OrgApiError extends Error {
    constructor(code, status = 0) { super("org-api: " + code); this.code = code; this.status = status; }
  }
  export async function listMyOrgs() { count("listMyOrgs"); return g().listMyOrgs(); }
  export async function listInheritedMcp() { count("listInheritedMcp"); return g().listInheritedMcp(); }
  export async function listOrgMcpConnections(orgId) { count("listOrgMcpConnections:" + orgId); return g().listOrgMcpConnections(orgId); }
  export async function upsertOrgMcpConnection(orgId, body) { count("upsertOrgMcpConnection:" + orgId); g().lastUpsert = { orgId, body }; return g().upsertOrgMcpConnection(orgId, body); }
  export async function patchOrgMcpConnection(orgId, connectorId, patch) { count("patchOrgMcpConnection:" + orgId + ":" + connectorId + ":" + JSON.stringify(patch)); return g().patchOrgMcpConnection(orgId, connectorId, patch); }
  export async function deleteOrgMcpConnection(orgId, connectorId) { count("deleteOrgMcpConnection:" + orgId + ":" + connectorId); return g().deleteOrgMcpConnection(orgId, connectorId); }
  export async function setOrgMcpForwardIdentity(orgId, connectorId, forward) { count("setOrgMcpForwardIdentity:" + orgId + ":" + connectorId + ":" + JSON.stringify(forward)); return g().setOrgMcpForwardIdentity(orgId, connectorId, forward); }
`);

const databaseStub = dataModule(`
  export async function getMcpCatalog() {
    return { ok: true, data: { items: [
      { code: "amap", name: "高德地图", vendor: "阿里云", description: "地图与路径", free: true },
      { code: "tavily", name: "Tavily 搜索", vendor: "Tavily", description: "网页搜索", price: "0.01", currency: "CNY", unit: "次" },
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
      { id: "custom", name: "自建服务", desc: "贴凭证", icon: "🔌", category: "其他", transport: "sse", auth: "url+token", auth_header: "", needs_endpoint: true, endpoint: "", help_url: "", docs: "", supports_oauth: false },
      { id: "github", name: "GitHub", desc: "代码托管", icon: "🐙", category: "开发", transport: "sse", auth: "oauth", auth_header: "", needs_endpoint: false, endpoint: "", help_url: "", docs: "", supports_oauth: true },
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

/** 与真 `useUI` 同一插值规则（`{name}` 占位），这样才能判「由组织 X 提供」真的带了组织名。 */
const uiStub = dataModule(`
  export function useUI(){
    return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;
  }
`);

const domainStub = dataModule(`
  export function currentDomainFamily() { return "com"; }
  export function currentDomainProfile() { return { portalOrigin: "https://oceanleo.com" }; }
`);

const OVERRIDES = {
  "../lib/org-api": orgApiStub,
  "../lib/database": databaseStub,
  "../lib/mcp-api": mcpApiStub,
  "./plugins/skills-api": skillsStub,
  "../i18n/ui/useUI": uiStub,
  "../contracts/domain-family": domainStub,
};

const lazyStub = dataModule(
  "const noop = () => undefined;\n" +
    "export default new Proxy(noop, { get: () => noop });\n" +
    "export const __stub = true;\n",
);

const {
  PluginsPage,
  canManageOrgMcp,
  normalizeOrgMcpConnections,
  shouldRenderOrgSection,
} = await import(
  await compileModule("src/pages/PluginsPage.tsx", OVERRIDES, { missingPackageStub: lazyStub })
);

function org(id, name, role = "member") {
  return { id, name, role, canViewOrgPage: false, canViewAllTasks: false, currency: "CNY" };
}

/** W08 `GET /v1/orgs/mcp/available` 的一行（snake_case，带 org_id / org_name）。 */
function inheritedRow(orgId, orgName, connectorId, extra = {}) {
  return {
    org_id: orgId,
    org_name: orgName,
    connector_id: connectorId,
    label: connectorId.toUpperCase(),
    icon: "🧭",
    tools_count: 7,
    enabled: true,
    member_visible: true,
    ...extra,
  };
}

function notAvailable() {
  const err = new Error("org-api: not_available (HTTP 404)");
  err.name = "OrgApiError";
  err.code = "not_available";
  err.status = 404;
  throw err;
}

async function withDom(run, { orgApi = {}, payerOrgId = "" } = {}) {
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
    url: "https://chat.oceanleo.com/",
    virtualConsole,
  });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    localStorage: window.localStorage,
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
  if (payerOrgId) window.localStorage.setItem("oceanleo.payer.last", payerOrgId);
  else window.localStorage.removeItem("oceanleo.payer.last");

  // 判据⑥：插件页自己不许碰 fetch。真发了就是又自建了一份出口。
  let fetchCalls = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    fetchCalls += 1;
    throw new Error(`插件页不许自己 fetch：${String(args[0])}`);
  };

  globalThis.__W15_ORG_API__ = {
    calls: [],
    lastUpsert: null,
    listMyOrgs: async () => [],
    listInheritedMcp: async () => ({ connections: [] }),
    listOrgMcpConnections: async () => ({ connections: [] }),
    upsertOrgMcpConnection: async () => ({ ok: true }),
    patchOrgMcpConnection: async () => ({ ok: true }),
    deleteOrgMcpConnection: async () => ({ ok: true }),
    setOrgMcpForwardIdentity: async () => ({ ok: true }),
    ...orgApi,
  };

  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);

  const settle = async () => {
    // 组织区要等 listMyOrgs → listInheritedMcp → listOrgMcpConnections 三层 await 到齐。
    for (let i = 0; i < 4; i += 1) await act(async () => {});
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
      html: () => container.innerHTML,
      text: () => container.textContent,
      find: (selector) => window.document.querySelector(selector),
      findAll: (selector) => [...window.document.querySelectorAll(selector)],
      buttons: (root = container) => [...root.querySelectorAll("button")].map((b) => b.textContent.trim()),
      calls: () => globalThis.__W15_ORG_API__.calls,
      lastUpsert: () => globalThis.__W15_ORG_API__.lastUpsert,
      fetchCalls: () => fetchCalls,
      click: (node) => {
        assert.ok(node, "点不到目标");
        return act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
      },
    });
  } finally {
    await act(async () => root.unmount());
    window.close();
    globalThis.fetch = previousFetch;
    delete globalThis.__W15_ORG_API__;
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

// ————————————————————————————————————————————————————————————————
// 1. 纯函数判定（与主站自绘页共用的权限判定）
// ————————————————————————————————————————————————————————————————

test("canManageOrgMcp：只有 owner / admin 能管，member 与未知角色都不能", () => {
  assert.equal(canManageOrgMcp("owner"), true);
  assert.equal(canManageOrgMcp("admin"), true);
  assert.equal(canManageOrgMcp("member"), false);
  assert.equal(canManageOrgMcp(""), false);
  assert.equal(canManageOrgMcp("superuser"), false);
});

test("normalizeOrgMcpConnections：认 W08 的 {connections:[snake_case]}，也认 items / 裸数组，认不出的丢掉不抛", () => {
  const rows = normalizeOrgMcpConnections({ connections: [inheritedRow("o1", "海狮科技", "amap"), { label: "没有 id" }] });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    orgId: "o1",
    orgName: "海狮科技",
    connectorId: "amap",
    label: "AMAP",
    icon: "🧭",
    toolsCount: 7,
    enabled: true,
    memberVisible: true,
    forwardMemberIdentity: false,
  });
  assert.equal(normalizeOrgMcpConnections({ items: [{ connectorId: "x" }] })[0].connectorId, "x");
  assert.equal(normalizeOrgMcpConnections([{ id: "y" }], { orgId: "o2", orgName: "蓝鲸" })[0].orgName, "蓝鲸");
  assert.deepEqual(normalizeOrgMcpConnections(null), []);
  assert.deepEqual(normalizeOrgMcpConnections("garbage"), []);
});

test("shouldRenderOrgSection：插件页永远不画组织共用连接器", () => {
  const admin = org("o1", "A", "admin");
  const member = org("o1", "A", "member");
  const rows = normalizeOrgMcpConnections([inheritedRow("o1", "A", "amap")]);
  assert.equal(shouldRenderOrgSection({ orgs: [], connections: [] }), false);
  assert.equal(shouldRenderOrgSection({ orgs: [admin], connections: [] }), false);
  assert.equal(shouldRenderOrgSection({ orgs: [member], connections: rows }), false);
});

test("零组织：整页没有组织区，且不碰 fetch", async () => {
  await withDom(async ({ render, find, text, fetchCalls, calls }) => {
    await render();
    assert.equal(find("[data-org-mcp-section]"), null, "零组织不该出现组织区");
    assert.ok(!text().includes("组织提供"), "零组织不该出现「组织提供」字样");
    assert.equal(find("[data-mcp-catalog]"), null, "COM 不渲染阿里云市场网格");
    assert.ok(find("[data-plugins-skills]"), "技能区仍在");
    assert.ok(find("[data-plugins-connectors]"), "连接器仍在");
    assert.equal(fetchCalls(), 0, "插件页自己一次 fetch 都不许发（A3）");
    assert.deepEqual(calls(), ["listMyOrgs"], "零组织时只问一次 listMyOrgs，不再问连接");
  });
});

test("端点 404（org-api 抛 not_available）：不报错、不出现，innerHTML 与零组织逐字相同", async () => {
  const baseline = await withDom(async ({ render, html }) => {
    await render();
    return html();
  });
  const whenDown = await withDom(
    async ({ render, html, text }) => {
      await render();
      assert.ok(!text().includes("not_available"), "错误码不许漏到页面上");
      assert.ok(!text().includes("加载失败"), "组织端点没上线不是目录加载失败");
      return html();
    },
    { orgApi: { listMyOrgs: notAvailable } },
  );
  assert.ok(baseline.length > 0, "对照组自己得先渲染出东西来");
  assert.equal(whenDown, baseline, "组织 API 整条路没上线时，页面必须与没有组织的人逐字一致");
});

test("有组织的管理员 / 成员：插件页仍然没有组织区，没有「为组织连接」", async () => {
  await withDom(
    async ({ render, find, text }) => {
      await render();
      assert.equal(find("[data-org-mcp-section]"), null);
      assert.equal(find("[data-org-mcp-connect-entry]"), null);
      assert.ok(!text().includes("为组织连接"));
      assert.ok(!text().includes("组织提供"));
    },
    {
      orgApi: {
        listMyOrgs: async () => [org("o1", "海狮科技", "admin")],
        listInheritedMcp: async () => ({ connections: [inheritedRow("o1", "海狮科技", "amap")] }),
        listOrgMcpConnections: async () => ({ connections: [inheritedRow("o1", "海狮科技", "amap")] }),
      },
    },
  );
  await withDom(
    async ({ render, find, text }) => {
      await render();
      assert.equal(find("[data-org-mcp-section]"), null);
      assert.equal(find("[data-org-mcp-row]"), null);
      assert.ok(!text().includes("由组织 海狮科技 提供"));
    },
    {
      orgApi: {
        listMyOrgs: async () => [org("o1", "海狮科技", "member")],
        listInheritedMcp: async () => ({ connections: [inheritedRow("o1", "海狮科技", "amap")] }),
      },
    },
  );
});
