// 组织库（W23，2026-09-20）：工作台/历史「发布到组织」+ 组织页库节。
//
// 判四件事：
//   ① 零组织：PublishToOrgButton 不渲染，且不碰 fetch、不调 publishOrgAsset。
//   ② 一组织：点按钮 → publishOrgAsset(orgId, { kind, title, url, sourceRef })。
//   ③ 组织页 `data-org-section="library"` 按 listOrgAssets 的 N 行渲染。
//   ④ 撤回走 revokeOrgAsset。四类操作都不自己 fetch。
//
// 跑法（必须带 loader）：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test tests/org-library.test.mjs

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);

const uiStub = dataModule(`
  export function useUI(){
    return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;
  }
`);

const orgApiStub = dataModule(`
  const g = () => globalThis.__W23_ORG_API__;
  const count = (name, ...args) => { g().calls.push([name, ...args]); };
  export class OrgApiError extends Error {
    constructor(code, status = 0) { super("org-api: " + code); this.code = code; this.status = status; }
  }
  export function orgApiCode(e) { return e instanceof OrgApiError ? e.code : "offline"; }
  export function orgErrorCopy(code) { return "ERR:" + code; }
  export function normalizeOrgUsage(v) { return v; }
  export async function listMyOrgs() { count("listMyOrgs"); return g().listMyOrgs(); }
  export async function getOrg(id) { count("getOrg", id); return g().getOrg(id); }
  export async function listMembers(id) { count("listMembers", id); return g().listMembers(id); }
  export async function listJoinRequests(id) { count("listJoinRequests", id); return g().listJoinRequests(id); }
  export async function getOrgUsage(id, days) { count("getOrgUsage", id, days); return g().getOrgUsage(id, days); }
  export async function setMemberPermission(...a) { count("setMemberPermission", ...a); }
  export async function setMemberCap(...a) { count("setMemberCap", ...a); }
  export async function decideJoinRequest(...a) { count("decideJoinRequest", ...a); }
  export async function createInvite(id) { count("createInvite", id); return { url: "https://x.test/join?code=abc", code: "abc", expiresAt: "" }; }
  export async function updateOrg(...a) { count("updateOrg", ...a); return {}; }
  export async function listOrgAssets(id) { count("listOrgAssets", id); return g().listOrgAssets(id); }
  export async function publishOrgAsset(orgId, body) { count("publishOrgAsset", orgId, body); return g().publishOrgAsset(orgId, body); }
  export async function revokeOrgAsset(orgId, assetId) { count("revokeOrgAsset", orgId, assetId); return g().revokeOrgAsset(orgId, assetId); }
  export async function grantOrgAsset(orgId, assetId, userId) { count("grantOrgAsset", orgId, assetId, userId); return g().grantOrgAsset?.(orgId, assetId, userId); }
  export async function listOrgAssetGrants(orgId, assetId) { count("listOrgAssetGrants", orgId, assetId); return g().listOrgAssetGrants?.(orgId, assetId) || []; }
  export async function revokeOrgAssetGrant(orgId, assetId, userId) { count("revokeOrgAssetGrant", orgId, assetId, userId); return g().revokeOrgAssetGrant?.(orgId, assetId, userId); }
`);

const { PublishToOrgButton, assetRowMatchesPublish } = await import(
  await compileModule("src/shell/PublishToOrgButton.tsx", {
    "../lib/org-api": orgApiStub,
    "../i18n/ui/useUI": uiStub,
  })
);

const { OrgPage } = await import(
  await compileModule("src/pages/OrgPage.tsx", {
    "../lib/org-api": orgApiStub,
    "../i18n/ui/useUI": uiStub,
  })
);

function org(id, name, role = "member", extra = {}) {
  return { id, name, role, canViewOrgPage: false, canViewAllTasks: false, currency: "CNY", ...extra };
}

function detailOf(summary, extra = {}) {
  return {
    ...summary,
    balanceMinor: 123400,
    minTopupMinor: 10000,
    legalName: "海狮科技有限公司",
    taxId: "91310000MA1K35",
    status: "active",
    requireApproval: true,
    monthMinor: 5600,
    memberCount: 2,
    pendingCount: 1,
    overviewAvailable: true,
    ...extra,
  };
}

const USAGE = {
  days: 30,
  totalMinor: 0,
  trend: [],
  byModel: [],
  trendAvailable: true,
  byModelAvailable: true,
};

async function withDom(run, { orgApi = {}, url = "https://oceanleo.com/org" } = {}) {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM, VirtualConsole } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];

  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", () => {});
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url, virtualConsole });
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

  let fetchCalls = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    fetchCalls += 1;
    throw new Error(`不许自己 fetch：${String(args[0])}`);
  };

  globalThis.__W23_ORG_API__ = {
    calls: [],
    listMyOrgs: async () => [],
    getOrg: async (id) => detailOf(org(id, "?", "owner")),
    listMembers: async () => [],
    listJoinRequests: async () => [],
    getOrgUsage: async () => USAGE,
    listOrgAssets: async () => [],
    publishOrgAsset: async () => ({ id: "asset-new" }),
    revokeOrgAsset: async () => {},
    grantOrgAsset: async () => {},
    listOrgAssetGrants: async () => [],
    revokeOrgAssetGrant: async () => {},
    ...orgApi,
  };

  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);

  const settle = async () => {
    for (let i = 0; i < 8; i += 1) await act(async () => {});
  };
  const render = async (node) => {
    await act(async () => root.render(node));
    await settle();
  };

  try {
    return await run({
      window,
      render,
      settle,
      container,
      html: () => container.innerHTML,
      find: (selector) => container.querySelector(selector),
      findAll: (selector) => [...container.querySelectorAll(selector)],
      calls: () => globalThis.__W23_ORG_API__.calls,
      names: () => globalThis.__W23_ORG_API__.calls.map((c) => c[0]),
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
    delete globalThis.__W23_ORG_API__;
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

test("assetRowMatchesPublish：url / sourceRef / assetRef 任一命中", () => {
  assert.deepEqual(
    assetRowMatchesPublish({ id: "a1", url: "https://x/site" }, { url: "https://x/site" }),
    { id: "a1" },
  );
  assert.deepEqual(
    assetRowMatchesPublish({ id: "a2", assetRef: "art-9" }, { url: "", sourceRef: "art-9" }),
    { id: "a2" },
  );
  assert.equal(assetRowMatchesPublish({ id: "a3", url: "other" }, { url: "https://x/site" }), null);
});

test("零组织：不渲染按钮，fetch 次数为 0，不调 publishOrgAsset", async () => {
  await withDom(async ({ render, find, names, fetchCalls }) => {
    await render(
      React.createElement(PublishToOrgButton, {
        kind: "website",
        title: "公司官网",
        url: "https://x.test/site",
        sourceRef: "art-1",
      }),
    );
    assert.equal(find("[data-publish-to-org]"), null);
    assert.equal(find("[data-publish-to-org-main]"), null);
    assert.deepEqual(names(), ["listMyOrgs"]);
    assert.equal(fetchCalls(), 0);
    assert.ok(!names().includes("publishOrgAsset"));
    assert.ok(!names().includes("listOrgAssets"));
  });
});

test("一组织：点击 → publishOrgAsset 被调且参数正确", async () => {
  const body = {
    kind: "website",
    title: "公司官网",
    url: "https://x.test/site",
    sourceRef: "art-1",
  };
  await withDom(
    async ({ render, find, click, calls, fetchCalls, settle }) => {
      await render(React.createElement(PublishToOrgButton, body));
      const button = find("[data-publish-to-org-main]");
      assert.ok(button, "有组织时应渲染发布按钮");
      assert.match(button.textContent, /发布到组织/);
      await click(button);
      await settle();
      const published = calls().find((c) => c[0] === "publishOrgAsset");
      assert.deepEqual(published, ["publishOrgAsset", "org-1", body]);
      assert.equal(fetchCalls(), 0);
    },
    {
      orgApi: {
        listMyOrgs: async () => [org("org-1", "海狮科技")],
        listOrgAssets: async () => [],
        publishOrgAsset: async () => ({ id: "asset-new" }),
      },
    },
  );
});

test("组织页库节渲染 N 行；撤回调用 revokeOrgAsset", async () => {
  const assets = [
    { id: "a1", kind: "website", title: "官网", url: "https://x.test/a", userId: "u1", email: "a@x.test", createdAt: "2026-09-20T00:00:00Z" },
    { id: "a2", kind: "ppt", title: "路演", url: "https://x.test/b", userId: "u2", email: "b@x.test", createdAt: "2026-09-19T00:00:00Z" },
    { id: "a3", kind: "document", title: "说明", url: "https://x.test/c", userId: "u1", email: "a@x.test", createdAt: "" },
  ];
  await withDom(
    async ({ render, find, findAll, click, calls, fetchCalls, settle }) => {
      await render(React.createElement(OrgPage));
      await settle();
      assert.ok(find('[data-org-section="library"]'), "应有组织库节");
      const rows = findAll("[data-org-library-row]");
      assert.equal(rows.length, 3, "库节应按 N 行渲染");
      assert.ok(find('[data-org-library-row="a1"]').textContent.includes("官网"));
      await click(find('[data-org-library-revoke="a2"]'));
      await settle();
      const revoked = calls().find((c) => c[0] === "revokeOrgAsset");
      assert.deepEqual(revoked, ["revokeOrgAsset", "org-1", "a2"]);
      assert.equal(fetchCalls(), 0);
    },
    {
      orgApi: {
        listMyOrgs: async () => [org("org-1", "海狮科技", "owner")],
        getOrg: async () => detailOf(org("org-1", "海狮科技", "owner")),
        listOrgAssets: async () => assets,
      },
    },
  );
});
