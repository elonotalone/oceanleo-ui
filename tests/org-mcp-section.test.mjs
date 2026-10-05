// 组织页上的共用连接器：只在这里看、只在这里设。
//
// 跑法：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/org-mcp-section.test.mjs

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;

const orgApiStub = dataModule(`
  const g = () => globalThis.__ORG_MCP_API__;
  const count = (name) => { g().calls.push(name); };
  export class OrgApiError extends Error {
    constructor(code, status = 0) { super("org-api: " + code); this.code = code; this.status = status; }
  }
  export async function listInheritedMcp() { count("listInheritedMcp"); return g().listInheritedMcp(); }
  export async function listOrgMcpConnections(orgId) { count("listOrgMcpConnections:" + orgId); return g().listOrgMcpConnections(orgId); }
  export async function upsertOrgMcpConnection(orgId, body) { count("upsertOrgMcpConnection:" + orgId); g().lastUpsert = { orgId, body }; return g().upsertOrgMcpConnection(orgId, body); }
  export async function patchOrgMcpConnection(orgId, connectorId, patch) { count("patchOrgMcpConnection:" + orgId + ":" + connectorId + ":" + JSON.stringify(patch)); return g().patchOrgMcpConnection(orgId, connectorId, patch); }
  export async function deleteOrgMcpConnection(orgId, connectorId) { count("deleteOrgMcpConnection:" + orgId + ":" + connectorId); return g().deleteOrgMcpConnection(orgId, connectorId); }
  export async function setOrgMcpForwardIdentity(orgId, connectorId, forward) { count("setOrgMcpForwardIdentity:" + orgId + ":" + connectorId + ":" + JSON.stringify(forward)); return g().setOrgMcpForwardIdentity(orgId, connectorId, forward); }
`);

const mcpApiStub = dataModule(`
  export async function getMcpRegistry() {
    return { items: [
      { id: "custom", name: "自建服务" },
      { id: "github", name: "GitHub" },
    ] };
  }
`);

const catalogStub = dataModule(`
  export function canManageOrgMcp(role) { return role === "owner" || role === "admin"; }
  export async function quietOrg(run) {
    try { return await run(); } catch { return null; }
  }
  export function normalizeOrgMcpConnections(payload, fallback = {}) {
    const root = payload && typeof payload === "object" ? payload : {};
    const raw = Array.isArray(root.connections) ? root.connections
      : Array.isArray(root.items) ? root.items
      : Array.isArray(payload) ? payload : [];
    const rows = [];
    for (const entry of raw) {
      const row = entry && typeof entry === "object" ? entry : {};
      const connectorId = row.connector_id || row.connectorId || row.id || "";
      if (!connectorId) continue;
      rows.push({
        orgId: row.org_id || row.orgId || fallback.orgId || "",
        orgName: row.org_name || row.orgName || fallback.orgName || "",
        connectorId,
        label: row.label || row.name || connectorId,
        icon: row.icon || "🔌",
        toolsCount: Number(row.tools_count ?? row.toolsCount ?? 0) || 0,
        enabled: row.enabled !== false,
        memberVisible: (row.member_visible ?? row.memberVisible) !== false,
        forwardMemberIdentity: (row.forward_member_identity ?? row.forwardMemberIdentity) === true,
      });
    }
    return rows;
  }
`);

const { OrgMcpSection } = await import(
  await compileModule("src/pages/org/OrgMcpSection.tsx", {
    "../../i18n/ui/useUI": dataModule(`
      export function useUI(){
        return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;
      }
    `),
    "../../lib/org-api": orgApiStub,
    "../../lib/mcp-api": mcpApiStub,
    "../../shell/usePluginsCatalog": catalogStub,
    "../plugins/connector-icons": dataModule("export function ConnectorIcon(){ return null; }"),
    "../plugins/connector-logic": dataModule(`
      export function workspaceMcpForwardsIdentityByDefault(endpoint) {
        return /workspace-mcp\\.oceandino\\.com/i.test(String(endpoint || ""));
      }
    `),
    "../plugins/parts": dataModule(`
      import React from ${JSON.stringify(reactUrl)};
      export function InTreeDialog({ children, testId }) {
        return React.createElement("div", { "data-in-tree-dialog": testId || "", "data-org-mcp-dialog": testId === "org-mcp-dialog" ? "" : undefined }, children);
      }
    `),
  })
);

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

async function withDom(run, { orgApi = {}, role = "admin", orgName = "海狮科技" } = {}) {
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
    url: "https://oceanleo.com/settings/team?org=o1",
    virtualConsole,
  });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
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

  let fetchCalls = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    fetchCalls += 1;
    throw new Error(`组织连接器不许自己 fetch：${String(args[0])}`);
  };

  globalThis.__ORG_MCP_API__ = {
    calls: [],
    lastUpsert: null,
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
    for (let i = 0; i < 4; i += 1) await act(async () => {});
  };
  const render = async (props = {}) => {
    await act(async () =>
      root.render(
        React.createElement(OrgMcpSection, {
          orgId: "o1",
          orgName,
          role,
          ...props,
        }),
      ),
    );
    await settle();
  };

  try {
    return await run({
      render,
      settle,
      find: (selector) => window.document.querySelector(selector),
      findAll: (selector) => [...window.document.querySelectorAll(selector)],
      text: () => container.textContent,
      buttons: (rootEl = container) => [...rootEl.querySelectorAll("button")].map((b) => b.textContent.trim()),
      calls: () => globalThis.__ORG_MCP_API__.calls,
      lastUpsert: () => globalThis.__ORG_MCP_API__.lastUpsert,
      fetchCalls: () => fetchCalls,
      click: (node) => {
        assert.ok(node, "点不到目标");
        return act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
      },
      fillInput: async (node, value) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(node, value);
        await act(async () => node.dispatchEvent(new window.Event("input", { bubbles: true })));
      },
    });
  } finally {
    await act(async () => root.unmount());
    window.close();
    globalThis.fetch = previousFetch;
    delete globalThis.__ORG_MCP_API__;
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

test("管理员：组织页有共用连接器区和「添加连接器」，空列表时仍留入口", async () => {
  await withDom(async ({ render, find, text, fetchCalls }) => {
    await render();
    assert.ok(find("[data-org-mcp-section]"));
    assert.ok(find("[data-org-mcp-connect-entry]"));
    assert.ok(text().includes("共用连接器"));
    assert.ok(text().includes("添加连接器"));
    assert.ok(text().includes("还没有共用连接器。"));
    assert.ok(text().includes("连一次，这个团队里的人都能用，不用各自再填密钥。"));
    assert.ok(!text().includes("组织提供"));
    assert.ok(!text().includes("为组织连接"));
    assert.ok(!text().includes("MCP"));
    assert.equal(find("[data-org-mcp-row]"), null);
    assert.equal(fetchCalls(), 0);
  });
});

test("mcp 端点 404：管理员仍留入口；成员只看到空状态，没有添加连接器", async () => {
  await withDom(
    async ({ render, find }) => {
      await render();
      assert.ok(find("[data-org-mcp-section]"));
      assert.ok(find("[data-org-mcp-connect-entry]"));
    },
    { orgApi: { listInheritedMcp: notAvailable, listOrgMcpConnections: notAvailable } },
  );
  await withDom(
    async ({ render, find }) => {
      await render();
      assert.ok(find("[data-org-mcp-section]"));
      assert.equal(find("[data-org-mcp-connect-entry]"), null);
      assert.equal(find("[data-org-mcp-row]"), null);
    },
    { role: "member", orgApi: { listInheritedMcp: notAvailable } },
  );
});

test("成员：只读，没有断开 / 添加连接器", async () => {
  await withDom(
    async ({ render, find, findAll, text, buttons, calls, fetchCalls }) => {
      await render();
      assert.ok(find("[data-org-mcp-section]"));
      assert.equal(findAll("[data-org-mcp-row]").length, 1);
      assert.ok(text().includes("7 个工具"));
      assert.ok(text().includes("管理员连好的工具，你可以直接用。"));
      assert.ok(!text().includes("由组织"));
      assert.equal(find("[data-org-mcp-manage]"), null);
      assert.equal(find("[data-org-mcp-connect-entry]"), null);
      const labels = buttons(find("[data-org-mcp-section]"));
      for (const forbidden of ["断开", "停用", "启用", "成员可见", "添加连接器", "为组织连接"]) {
        assert.ok(!labels.includes(forbidden), `成员不该有「${forbidden}」`);
      }
      assert.deepEqual(calls(), ["listInheritedMcp"]);
      assert.equal(fetchCalls(), 0);
    },
    {
      role: "member",
      orgApi: { listInheritedMcp: async () => ({ connections: [inheritedRow("o1", "海狮科技", "amap")] }) },
    },
  );
});

test("管理员：启用/停用、成员可见、断开、添加连接器都在；点击只走 org-api", async () => {
  await withDom(
    async ({ render, find, findAll, buttons, click, settle, calls, fetchCalls }) => {
      await render();
      assert.ok(find("[data-org-mcp-connect-entry]"));
      assert.equal(findAll("[data-org-mcp-row]").length, 2);
      const labels = buttons(find("[data-org-mcp-section]"));
      for (const required of ["停用", "成员可见", "断开", "添加连接器"]) {
        assert.ok(labels.includes(required), `缺「${required}」，实际：${labels.join(" | ")}`);
      }
      assert.deepEqual(calls(), ["listInheritedMcp", "listOrgMcpConnections:o1"]);

      const stop = [...find("[data-org-mcp-manage]").querySelectorAll("button")].find((b) => b.textContent.trim() === "停用");
      await click(stop);
      await settle();
      assert.ok(calls().includes('patchOrgMcpConnection:o1:amap:{"enabled":false}'));

      const disconnect = [...find("[data-org-mcp-manage]").querySelectorAll("button")].find((b) => b.textContent.trim() === "断开");
      await click(disconnect);
      await settle();
      assert.ok(calls().includes("deleteOrgMcpConnection:o1:amap"));

      await click(find("[data-org-mcp-connect-entry]"));
      assert.ok(find("[data-org-mcp-dialog]"));
      assert.equal(find("[data-org-mcp-org-select]"), null);
      assert.equal(fetchCalls(), 0);
    },
    {
      orgApi: {
        listInheritedMcp: async () => ({ connections: [inheritedRow("o1", "海狮科技", "amap")] }),
        listOrgMcpConnections: async () => ({
          connections: [
            inheritedRow("o1", "海狮科技", "amap"),
            inheritedRow("o1", "海狮科技", "tavily", { member_visible: false }),
          ],
        }),
      },
    },
  );
});

test("添加连接器：目录含 custom，提交送 connectorId=custom", async () => {
  await withDom(async ({ render, find, findAll, click, settle, lastUpsert, fetchCalls }) => {
    await render();
    await click(find("[data-org-mcp-connect-entry]"));
    await settle();
    const select = find("[data-org-mcp-connector-select]");
    assert.ok(select);
    assert.ok(findAll("[data-org-mcp-connector-select] option").some((o) => o.value === "custom"));
    assert.equal(select.value, "custom");
    await click(find("[data-org-mcp-submit]"));
    await settle();
    assert.equal(lastUpsert()?.orgId, "o1");
    assert.equal(lastUpsert()?.body?.connectorId, "custom");
    assert.equal(fetchCalls(), 0);
  });
});

test("添加连接器失败：原因写在对话框里", async () => {
  await withDom(
    async ({ render, find, click, settle }) => {
      await render();
      await click(find("[data-org-mcp-connect-entry]"));
      await settle();
      await click(find("[data-org-mcp-submit]"));
      await settle();
      const error = find("[data-org-mcp-error]");
      assert.ok(error);
      assert.match(error.textContent || "", /连接失败：is_valid 拒绝了 test1111/);
      assert.ok(find("[data-org-mcp-dialog]"));
    },
    {
      orgApi: {
        upsertOrgMcpConnection: async () => {
          const err = new Error("连接失败：is_valid 拒绝了 test1111");
          err.detail = "连接失败：is_valid 拒绝了 test1111";
          throw err;
        },
      },
    },
  );
});

test("转发身份开关：管理员有、成员没有；点开关走 setOrgMcpForwardIdentity", async () => {
  await withDom(
    async ({ render, find }) => {
      await render();
      assert.ok(find("[data-org-mcp-row]"));
      assert.equal(find("[data-org-mcp-forward-identity]"), null);
    },
    {
      role: "member",
      orgApi: { listInheritedMcp: async () => ({ connections: [inheritedRow("o1", "海狮科技", "amap")] }) },
    },
  );
  await withDom(
    async ({ render, find, click, settle, calls, fetchCalls }) => {
      await render();
      const sw = find("[data-org-mcp-forward-identity] input");
      assert.ok(sw);
      assert.equal(sw.checked, false);
      await click(sw);
      await settle();
      assert.ok(calls().includes("setOrgMcpForwardIdentity:o1:amap:true"));
      assert.equal(fetchCalls(), 0);
    },
    {
      orgApi: {
        listInheritedMcp: async () => ({ connections: [inheritedRow("o1", "海狮科技", "amap")] }),
        listOrgMcpConnections: async () => ({ connections: [inheritedRow("o1", "海狮科技", "amap")] }),
      },
    },
  );
});

test("端点是 workspace-mcp.oceandino.com 时，转发身份默认勾上", async () => {
  await withDom(async ({ render, find, click, settle, fillInput }) => {
    await render();
    await click(find("[data-org-mcp-connect-entry]"));
    await settle();
    const box = find("[data-org-mcp-dialog-forward-identity] input");
    assert.equal(box.checked, false);
    await fillInput(find("[data-org-mcp-endpoint]"), "https://workspace-mcp.oceandino.com/mcp");
    assert.equal(box.checked, true);
  });
});

test("只列出当前组织的连接，不混入别的团队", async () => {
  await withDom(
    async ({ render, find, findAll, text }) => {
      await render();
      assert.equal(findAll("[data-org-mcp-row]").length, 1);
      assert.ok(find("[data-org-mcp-row='amap']"));
      assert.equal(find("[data-org-mcp-row='tavily']"), null);
      assert.ok(text().includes("7 个工具"));
      assert.ok(!text().includes("蓝鲸"));
    },
    {
      orgApi: {
        listInheritedMcp: async () => ({
          connections: [
            inheritedRow("o1", "海狮科技", "amap"),
            inheritedRow("o2", "蓝鲸传媒", "tavily"),
          ],
        }),
        listOrgMcpConnections: async () => ({ connections: [inheritedRow("o1", "海狮科技", "amap")] }),
      },
    },
  );
});
