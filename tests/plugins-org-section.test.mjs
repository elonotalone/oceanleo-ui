// 插件页「组织提供」分区（W15，2026-09-20）的判据。
//
// 企业版之后插件页多一块「组织给我的」：管理员在组织里连一次，成员这里自动出现，
// 成员不填 key、也删不掉。这份测试判六件事，前两件是**反方向**的：
//
//   ① **零组织的人一个字节都不该多渲染。** 今天全部用户都在这一支上；把整页渲染两遍
//      （org-api 给空表 / org-api 整条路 404 抛错），逐字比 innerHTML，还要与「压根没有
//      组织区」的形状一致（页面里没有 `data-org-mcp-section`）。
//   ② **端点 404 / 抛错时不报错、不出现。** `org-api` 的纪律是失败抛 `OrgApiError`；
//      插件页必须把它吞成「没有」，不能把一句错误甩到目录网格上面。
//   ③ 成员视角：只读——没有「断开」按钮、没有管理控件，有「由组织 X 提供」。
//   ④ 管理员视角：有启用/停用、成员可见、断开，以及「为组织连接」入口。
//   ⑤ 文案「由组织 {name} 提供」按组织名插值。
//   ⑥ **A3：组织侧请求只走 `org-api` 五个函数。** 用替身计数：成员一次 `listInheritedMcp`、
//      管理员再按组织补 `listOrgMcpConnections`；点「断开」走 `deleteOrgMcpConnection`；
//      点「停用」走 `patchOrgMcpConnection`；且 `globalThis.fetch` 一次都没被碰——
//      判据 5「全波 /v1/orgs 只有一个出口」的落点就是这一条。
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
  export async function upsertOrgMcpConnection(orgId, body) { count("upsertOrgMcpConnection:" + orgId); return g().upsertOrgMcpConnection(orgId, body); }
  export async function patchOrgMcpConnection(orgId, connectorId, patch) { count("patchOrgMcpConnection:" + orgId + ":" + connectorId + ":" + JSON.stringify(patch)); return g().patchOrgMcpConnection(orgId, connectorId, patch); }
  export async function deleteOrgMcpConnection(orgId, connectorId) { count("deleteOrgMcpConnection:" + orgId + ":" + connectorId); return g().deleteOrgMcpConnection(orgId, connectorId); }
`);

const databaseStub = dataModule(`
  export async function getMcpCatalog() {
    return { ok: true, data: { items: [
      { code: "amap", name: "高德地图", vendor: "阿里云", description: "地图与路径", free: true },
      { code: "tavily", name: "Tavily 搜索", vendor: "Tavily", description: "网页搜索", price: "0.01", currency: "CNY", unit: "次" },
    ] } };
  }
`);

/** 与真 `useUI` 同一插值规则（`{name}` 占位），这样才能判「由组织 X 提供」真的带了组织名。 */
const uiStub = dataModule(`
  export function useUI(){
    return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;
  }
`);

const OVERRIDES = {
  "../lib/org-api": orgApiStub,
  "../lib/database": databaseStub,
  "../i18n/ui/useUI": uiStub,
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

async function withDom(run, { orgApi = {} } = {}) {
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

  // 判据⑥：插件页自己不许碰 fetch。真发了就是又自建了一份出口。
  let fetchCalls = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    fetchCalls += 1;
    throw new Error(`插件页不许自己 fetch：${String(args[0])}`);
  };

  globalThis.__W15_ORG_API__ = {
    calls: [],
    listMyOrgs: async () => [],
    listInheritedMcp: async () => ({ connections: [] }),
    listOrgMcpConnections: async () => ({ connections: [] }),
    upsertOrgMcpConnection: async () => ({ ok: true }),
    patchOrgMcpConnection: async () => ({ ok: true }),
    deleteOrgMcpConnection: async () => ({ ok: true }),
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
      find: (selector) => container.querySelector(selector),
      findAll: (selector) => [...container.querySelectorAll(selector)],
      buttons: (root = container) => [...root.querySelectorAll("button")].map((b) => b.textContent.trim()),
      calls: () => globalThis.__W15_ORG_API__.calls,
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
  });
  assert.equal(normalizeOrgMcpConnections({ items: [{ connectorId: "x" }] })[0].connectorId, "x");
  assert.equal(normalizeOrgMcpConnections([{ id: "y" }], { orgId: "o2", orgName: "蓝鲸" })[0].orgName, "蓝鲸");
  assert.deepEqual(normalizeOrgMcpConnections(null), []);
  assert.deepEqual(normalizeOrgMcpConnections("garbage"), []);
});

test("shouldRenderOrgSection：零组织不渲染；有连接渲染；没连接时只给管理员留入口", () => {
  assert.equal(shouldRenderOrgSection({ orgs: [], connections: [] }), false);
  assert.equal(shouldRenderOrgSection({ orgs: [org("o1", "A", "member")], connections: [] }), false);
  assert.equal(shouldRenderOrgSection({ orgs: [org("o1", "A", "admin")], connections: [] }), true);
  assert.equal(
    shouldRenderOrgSection({ orgs: [org("o1", "A", "member")], connections: normalizeOrgMcpConnections([inheritedRow("o1", "A", "amap")]) }),
    true,
  );
});

// ————————————————————————————————————————————————————————————————
// 2. 判据①②：零组织 / 端点没上线 → 与今天逐字一致
// ————————————————————————————————————————————————————————————————

test("零组织：整页没有组织区，且不碰 fetch", async () => {
  await withDom(async ({ render, find, text, fetchCalls, calls }) => {
    await render();
    assert.equal(find("[data-org-mcp-section]"), null, "零组织不该出现组织区");
    assert.ok(!text().includes("组织提供"), "零组织不该出现「组织提供」字样");
    assert.ok(text().includes("高德地图"), "目录网格本身要正常渲染");
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

test("有组织但 mcp 端点 404：成员视角不渲染组织区；管理员视角只留「为组织连接」入口", async () => {
  await withDom(
    async ({ render, find }) => {
      await render();
      assert.equal(find("[data-org-mcp-section]"), null, "成员一条连接都拿不到就不该看到组织区");
    },
    { orgApi: { listMyOrgs: async () => [org("o1", "海狮科技", "member")], listInheritedMcp: notAvailable } },
  );
  await withDom(
    async ({ render, find, text }) => {
      await render();
      assert.ok(find("[data-org-mcp-section]"), "管理员要看到组织区，否则「为组织连接」永远点不到");
      assert.ok(find("[data-org-mcp-connect-entry]"), "管理员要有「为组织连接」入口");
      assert.ok(text().includes("这个组织还没有连接任何 MCP 服务器。"));
      assert.equal(find("[data-org-mcp-row]"), null);
    },
    {
      orgApi: {
        listMyOrgs: async () => [org("o1", "海狮科技", "admin")],
        listInheritedMcp: notAvailable,
        listOrgMcpConnections: notAvailable,
      },
    },
  );
});

// ————————————————————————————————————————————————————————————————
// 3. 判据③⑤：成员视角只读 + 「由组织 X 提供」
// ————————————————————————————————————————————————————————————————

test("成员视角：有「由组织 海狮科技 提供」，没有断开 / 管理控件 / 为组织连接", async () => {
  await withDom(
    async ({ render, find, findAll, text, buttons, calls, fetchCalls }) => {
      await render();
      const section = find("[data-org-mcp-section]");
      assert.ok(section, "成员继承到了连接，组织区必须出现");
      assert.equal(findAll("[data-org-mcp-row]").length, 1);
      assert.ok(text().includes("由组织 海狮科技 提供"), "文案必须带组织名");
      assert.ok(text().includes("7 个工具"));
      assert.ok(text().includes("组织提供的连接由管理员统一管理，你可以直接使用，不需要填凭证。"));
      assert.equal(find("[data-org-mcp-manage]"), null, "成员不能有管理控件");
      assert.equal(find("[data-org-mcp-connect-entry]"), null, "成员不能有「为组织连接」");
      const labels = buttons(section);
      for (const forbidden of ["断开", "停用", "启用", "成员可见", "为组织连接"]) {
        assert.ok(!labels.includes(forbidden), `成员视角不该有「${forbidden}」按钮，实际：${labels.join(" | ")}`);
      }
      assert.deepEqual(calls(), ["listMyOrgs", "listInheritedMcp"], "成员只走 listInheritedMcp，不去问组织连接表");
      assert.equal(fetchCalls(), 0);
    },
    {
      orgApi: {
        listMyOrgs: async () => [org("o1", "海狮科技", "member")],
        listInheritedMcp: async () => ({ connections: [inheritedRow("o1", "海狮科技", "amap")] }),
      },
    },
  );
});

// ————————————————————————————————————————————————————————————————
// 4. 判据④⑥：管理员视角有控件；控件只走 org-api
// ————————————————————————————————————————————————————————————————

test("管理员视角：启用/停用、成员可见、断开、为组织连接都在；点击只走 org-api", async () => {
  await withDom(
    async ({ render, find, findAll, buttons, click, settle, calls, fetchCalls }) => {
      await render();
      const section = find("[data-org-mcp-section]");
      assert.ok(section);
      assert.ok(find("[data-org-mcp-connect-entry]"), "管理员要有「为组织连接」");
      const rows = findAll("[data-org-mcp-row]");
      assert.equal(rows.length, 2, "available 与 connections 同一条按 org:connector 合并，隐藏的那条只有管理员看得到");
      const manage = find("[data-org-mcp-manage]");
      assert.ok(manage, "管理员要有管理控件");
      const labels = buttons(section);
      for (const required of ["停用", "成员可见", "断开", "为组织连接"]) {
        assert.ok(labels.includes(required), `管理员视角缺「${required}」，实际：${labels.join(" | ")}`);
      }
      assert.deepEqual(
        calls(),
        ["listMyOrgs", "listInheritedMcp", "listOrgMcpConnections:o1"],
        "管理员先走 listInheritedMcp，再按组织补 listOrgMcpConnections",
      );

      // 点「停用」→ patchOrgMcpConnection(orgId, connectorId, {enabled:false})，随后刷新列表。
      const stop = [...manage.querySelectorAll("button")].find((b) => b.textContent.trim() === "停用");
      await click(stop);
      await settle();
      assert.ok(
        calls().includes('patchOrgMcpConnection:o1:amap:{"enabled":false}'),
        `停用要走 patchOrgMcpConnection，实际：${calls().join(" | ")}`,
      );

      // 点「断开」→ deleteOrgMcpConnection(orgId, connectorId)。
      const disconnect = [...find("[data-org-mcp-manage]").querySelectorAll("button")].find(
        (b) => b.textContent.trim() === "断开",
      );
      await click(disconnect);
      await settle();
      assert.ok(calls().includes("deleteOrgMcpConnection:o1:amap"), `断开要走 deleteOrgMcpConnection，实际：${calls().join(" | ")}`);

      // 点「为组织连接」→ 对话框出现，且只有一个组织时不出下拉。
      await click(find("[data-org-mcp-connect-entry]"));
      assert.ok(find("[data-org-mcp-dialog]"), "对话框必须出现");
      assert.equal(find("[data-org-mcp-dialog] select"), null, "单组织不出「连给哪个组织」下拉");

      assert.equal(fetchCalls(), 0, "整个过程插件页自己一次 fetch 都没发（A3）");
    },
    {
      orgApi: {
        listMyOrgs: async () => [org("o1", "海狮科技", "admin")],
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

test("多组织管理员：「为组织连接」对话框出「连给哪个组织」下拉，选项 = 可管理的组织", async () => {
  await withDom(
    async ({ render, find, findAll, click }) => {
      await render();
      await click(find("[data-org-mcp-connect-entry]"));
      const options = findAll("[data-org-mcp-dialog] select option");
      assert.deepEqual(
        options.map((o) => [o.value, o.textContent]),
        [
          ["o1", "海狮科技"],
          ["o2", "蓝鲸传媒"],
        ],
        "只列 owner/admin 的组织；member 的那家不该出现",
      );
    },
    {
      orgApi: {
        listMyOrgs: async () => [org("o1", "海狮科技", "owner"), org("o2", "蓝鲸传媒", "admin"), org("o3", "小虾", "member")],
      },
    },
  );
});
