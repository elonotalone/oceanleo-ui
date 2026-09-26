// 组织页（W11，2026-09-20）的判据：负责人看板 + 全波唯一的组织 API 客户端。
//
// 判五件事：
//   ① **源契约**：`src/lib/org-api.ts` 的导出一个不少（`_COMMON §3.8` 15 个 + A2 `getMyOrgUsage`
//      + A3 五个组织 MCP + A13 `getInvitePreview`），`src/pages/index.ts` 导出 `OrgPage` 与 `OrgMembership`。
//   ② **A13 透传**：`requestJoin()` 把后端的 `rejected` 原样交出去（不折成 pending）；
//      `getInvitePreview()` 回 `{orgName, requireApproval}`，失效链接按 HTTP 状态抛 `OrgApiError`、status 保真。
//   ③ **无权限不渲染空表**：`view_org_page` 没给的成员看到一句话，成员表的请求一条都不发。
//   ④ **切换器读写 `?org=`**：URL 点名的组织优先；换一家写回 URL（刷新后保持）。
//   ⑤ **角色决定控件**：owner 有权限勾 / 上限输入 / 审批区；被授权的普通成员只有只读表；
//      审批与切窗口走 `decideJoinRequest` / `getOrgUsage(id, 7)`；组件自己**不碰 `fetch`**。
//
// 不需要浏览器（红线 10）：jsdom 渲染，取数全是替身。
//
// 跑法（**必须带 loader**）：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test tests/org-page.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(REPO, rel), "utf8");

// ————————————————————————————————————————————————————————————————
// ① 源契约
// ————————————————————————————————————————————————————————————————

const CONTRACT_EXPORTS = [
  // _COMMON §3.8
  "listMyOrgs",
  "getOrg",
  "listMembers",
  "setMemberPermission",
  "setMemberCap",
  "listJoinRequests",
  "decideJoinRequest",
  "createInvite",
  "requestJoin",
  "listOrgTasks",
  "listViewsOfMe",
  "listOrgAssets",
  "getOrgUsage",
  // A2
  "getMyOrgUsage",
  // A3
  "listInheritedMcp",
  "listOrgMcpConnections",
  "upsertOrgMcpConnection",
  "patchOrgMcpConnection",
  "deleteOrgMcpConnection",
  // A13
  "getInvitePreview",
];

test("org-api.ts：契约 + A2 + A3 + A13 的导出函数一个不少，类型 OrgRole / OrgSummary / OrgMemberRow 在", () => {
  const src = read("src/lib/org-api.ts");
  for (const name of CONTRACT_EXPORTS) {
    assert.match(src, new RegExp(`export (?:async )?function ${name}\\(`), `缺导出 ${name}`);
  }
  assert.match(src, /export type OrgRole = "owner" \| "admin" \| "member";/);
  assert.match(src, /export interface OrgSummary \{/);
  assert.match(src, /export interface OrgMemberRow \{/);
  assert.match(src, /export class OrgApiError extends Error/);
  // A13：requestJoin 的返回三档
  assert.match(src, /export type OrgJoinStatus = "pending" \| "joined" \| "rejected";/);
  // A9：抢救提交带入的行号前缀必须为 0
  assert.equal((src.match(/^ {0,5}\d+\|/gm) || []).length, 0, "org-api.ts 里还有行号前缀");
});

test("pages/index.ts：导出 OrgPage 与 OrgMembership；OrgPage.tsx 无行号前缀", () => {
  const index = read("src/pages/index.ts");
  assert.match(index, /export \{ OrgPage \} from "\.\/OrgPage";/);
  assert.match(index, /OrgMembership,?[\s\S]*?\} from "\.\/OrgMembership";/);
  const page = read("src/pages/OrgPage.tsx");
  assert.equal((page.match(/^ {0,5}\d+\|/gm) || []).length, 0, "OrgPage.tsx 里还有行号前缀");
  // 组件不许自己 fetch —— /v1/orgs 只有 org-api 一个出口（判据 5）。
  assert.doesNotMatch(page, /\bfetch\(/, "OrgPage.tsx 不许自己 fetch");
  assert.doesNotMatch(page, /\/v1\/orgs/, "OrgPage.tsx 不许写 /v1/orgs 路径");
});

// ————————————————————————————————————————————————————————————————
// ② A13：真 org-api + 假 fetch
// ————————————————————————————————————————————————————————————————

const authClientStub = dataModule(`export async function accessToken(){ return "test-token"; }`);
const authConfigStub = dataModule(`export const GATEWAY_BASE = "https://gw.test";`);

const orgApiReal = await import(
  await compileModule("src/lib/org-api.ts", {
    "./auth/client": authClientStub,
    "./auth/config": authConfigStub,
  })
);

async function withFetch(handler, run) {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = previous;
  }
}

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test("A13 requestJoin：后端 rejected 透传为 rejected；joined / pending 照旧", async () => {
  for (const [given, expected] of [
    ["rejected", "rejected"],
    ["denied", "rejected"],
    ["joined", "joined"],
    ["pending", "pending"],
    ["", "pending"],
  ]) {
    await withFetch(
      () => jsonResponse(200, { status: given, orgName: "海狮科技" }),
      async (calls) => {
        const out = await orgApiReal.requestJoin("abcdefghijklmnopqrstuvwxyz");
        assert.equal(out.status, expected, `status=${given}`);
        assert.equal(out.orgName, "海狮科技");
        assert.equal(calls.length, 1);
        assert.match(calls[0].url, /\/v1\/orgs\/invites\/abcdefghijklmnopqrstuvwxyz:request$/);
        assert.equal(calls[0].init.method, "POST");
      },
    );
  }
});

test("A13 getInvitePreview：回 {orgName, requireApproval}；404 / 410 / 409 抛 OrgApiError 且 status 保真", async () => {
  await withFetch(
    () => jsonResponse(200, { orgName: "蓝鲸", requireApproval: false }),
    async (calls) => {
      const out = await orgApiReal.getInvitePreview("  code-1234567890abcdefghij ");
      assert.deepEqual(out, { orgName: "蓝鲸", requireApproval: false });
      assert.match(calls[0].url, /\/v1\/orgs\/invites\/code-1234567890abcdefghij$/);
      assert.equal(calls[0].init.method, undefined, "预览是 GET");
    },
  );
  // 网关没给 requireApproval → 按需审批算
  await withFetch(
    () => jsonResponse(200, { org_name: "蓝鲸" }),
    async () => {
      const out = await orgApiReal.getInvitePreview("code-1234567890abcdefghij");
      assert.deepEqual(out, { orgName: "蓝鲸", requireApproval: true });
    },
  );
  for (const [status, code] of [
    [404, "not_found"],
    [410, "unknown"],
    [409, "unknown"],
    [401, "signed_out"],
  ]) {
    await withFetch(
      () => jsonResponse(status, { detail: { code: "invite_expired" } }),
      async () => {
        await assert.rejects(
          orgApiReal.getInvitePreview("code-1234567890abcdefghij"),
          (error) => {
            assert.ok(error instanceof orgApiReal.OrgApiError);
            assert.equal(error.status, status);
            assert.equal(error.code, code);
            return true;
          },
        );
      },
    );
  }
  await assert.rejects(orgApiReal.getInvitePreview(""), (e) => e instanceof orgApiReal.OrgApiError);
});

// ————————————————————————————————————————————————————————————————
// ③④⑤ 组件：替身 org-api + jsdom
// ————————————————————————————————————————————————————————————————

const orgApiStub = dataModule(`
  const g = () => globalThis.__W11_ORG_API__;
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
`);

const uiStub = dataModule(`
  export function useUI(){
    return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;
  }
`);

const OVERRIDES = {
  "../lib/org-api": orgApiStub,
  "../i18n/ui/useUI": uiStub,
};

const {
  OrgPage,
  ORG_QUERY_KEY,
  USAGE_WINDOWS,
  orgIdFromHref,
  withOrgParam,
  canViewOrgPage,
  canManageMembers,
  canManageWallet,
  pickOrg,
  parseCapInput,
  trendHeights,
} = await import(await compileModule("src/pages/OrgPage.tsx", OVERRIDES));

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

const MEMBERS = [
  {
    userId: "u-owner",
    email: "boss@x.test",
    role: "owner",
    status: "active",
    monthlyMinor: 3000,
    taskCount: 12,
    assetCount: 4,
    lastActiveAt: "2026-09-19T10:00:00Z",
    capMinor: null,
    canViewOrgPage: true,
    canViewAllTasks: true,
  },
  {
    userId: "u-staff",
    email: "staff@x.test",
    role: "member",
    status: "active",
    monthlyMinor: 2600,
    taskCount: 5,
    assetCount: 1,
    lastActiveAt: null,
    capMinor: 2600,
    canViewOrgPage: false,
    canViewAllTasks: false,
  },
];

const USAGE = {
  days: 30,
  totalMinor: 5600,
  trend: [
    { date: "2026-09-18", minor: 1000 },
    { date: "2026-09-19", minor: 4600 },
  ],
  byModel: [{ model: "gpt-x", minor: 5600, calls: 17 }],
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
    throw new Error(`组织页不许自己 fetch：${String(args[0])}`);
  };

  globalThis.__W11_ORG_API__ = {
    calls: [],
    listMyOrgs: async () => [],
    getOrg: async (id) => detailOf(org(id, "?", "owner")),
    listMembers: async () => MEMBERS,
    listJoinRequests: async () => [],
    getOrgUsage: async () => USAGE,
    ...orgApi,
  };

  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);

  const settle = async () => {
    for (let i = 0; i < 5; i += 1) await act(async () => {});
  };
  const render = async (props = {}) => {
    await act(async () => root.render(React.createElement(OrgPage, props)));
    await settle();
  };

  try {
    return await run({
      window,
      render,
      settle,
      container,
      html: () => container.innerHTML,
      text: () => container.textContent,
      find: (selector) => container.querySelector(selector),
      findAll: (selector) => [...container.querySelectorAll(selector)],
      calls: () => globalThis.__W11_ORG_API__.calls,
      names: () => globalThis.__W11_ORG_API__.calls.map((c) => c[0]),
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
    delete globalThis.__W11_ORG_API__;
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

// —— 纯函数 ——

test("纯函数：?org= 读写、权限判定、pickOrg、上限输入、趋势高度", () => {
  assert.equal(ORG_QUERY_KEY, "org");
  assert.deepEqual([...USAGE_WINDOWS], [1, 7, 30]);

  assert.equal(orgIdFromHref("https://oceanleo.com/org?org=o1&x=1"), "o1");
  assert.equal(orgIdFromHref("/org"), "");
  assert.equal(orgIdFromHref("not a url ::"), "");
  assert.equal(withOrgParam("/org?x=1#h", "o2"), "/org?x=1&org=o2#h");
  assert.equal(withOrgParam("/org?org=o1", ""), "/org");

  assert.equal(canViewOrgPage(org("o", "A", "owner")), true, "owner 恒真");
  assert.equal(canViewOrgPage(org("o", "A", "admin")), false, "admin 也看列");
  assert.equal(canViewOrgPage(org("o", "A", "member", { canViewOrgPage: true })), true);
  assert.equal(canViewOrgPage(null), false);
  assert.equal(canManageMembers("owner"), true);
  assert.equal(canManageMembers("admin"), true);
  assert.equal(canManageMembers("member"), false);
  assert.equal(canManageWallet("owner"), true);
  assert.equal(canManageWallet("admin"), false);

  const a = org("a", "A", "member");
  const b = org("b", "B", "member", { canViewOrgPage: true });
  const c = org("c", "C", "owner");
  assert.equal(pickOrg([], "x"), null);
  assert.equal(pickOrg([a, b, c], "c").id, "c", "URL 点名优先");
  assert.equal(pickOrg([a, b, c], "a").id, "a", "点名的没权限也不悄悄换一家");
  assert.equal(pickOrg([a, b, c], "").id, "b", "没点名选第一家能进的");
  assert.equal(pickOrg([a], "zzz").id, "a", "点名不存在 → 退回列表");

  assert.equal(parseCapInput(""), null);
  assert.equal(parseCapInput("  "), null);
  assert.equal(parseCapInput("-5"), null);
  assert.equal(parseCapInput("abc"), null);
  assert.equal(parseCapInput("12.34"), 1234);
  assert.equal(parseCapInput("1,000"), 100000);

  assert.deepEqual(trendHeights([]), []);
  assert.deepEqual(trendHeights([{ minor: 0 }, { minor: 0 }]), [0, 0]);
  assert.deepEqual(trendHeights([{ minor: 50 }, { minor: 100 }]), [50, 100]);
});

// —— ③ 无权限 ——

test("无权限：只显示一句话，不渲染成员表，成员表 / 详情 / 用量的请求一条都不发，也不碰 fetch", async () => {
  await withDom(
    async ({ render, find, names, fetchCalls }) => {
      await render();
      const state = find('[data-org-page-state="forbidden"]');
      assert.ok(state, "应有无权限状态");
      assert.equal(state.textContent, "你没有查看这个组织的权限。");
      assert.equal(find("[data-org-members-table]"), null, "不渲染成员表");
      assert.equal(find('[data-org-section="members"]'), null, "连成员区都不渲染");
      assert.equal(find('[data-org-section="usage"]'), null);
      assert.deepEqual(names(), ["listMyOrgs"], "只发了 listMyOrgs");
      assert.equal(fetchCalls(), 0);
    },
    { orgApi: { listMyOrgs: async () => [org("o1", "海狮科技", "member")] } },
  );
});

test("零组织：一句提示，不渲染任何区块", async () => {
  await withDom(async ({ render, find, names }) => {
    await render();
    assert.ok(find('[data-org-page-state="none"]'));
    assert.equal(find("[data-org-section]"), null);
    assert.deepEqual(names(), ["listMyOrgs"]);
  });
});

// —— ⑤ owner ——

test("owner：四块齐；权限勾 / 上限输入 / 审批区都在；通过申请走 decideJoinRequest；切 7 天走 getOrgUsage(id, 7)；不碰 fetch", async () => {
  const requests = [{ userId: "u-new", email: "new@x.test", requestedAt: "2026-09-20T01:00:00Z" }];
  await withDom(
    async ({ render, find, findAll, calls, names, click, fetchCalls }) => {
      await render();
      assert.equal(find('[data-org-page-state="forbidden"]'), null);
      for (const section of ["header", "members", "requests", "usage"]) {
        assert.ok(find(`[data-org-section="${section}"]`), `缺 ${section} 区`);
      }
      assert.equal(find("[data-org-name]").textContent, "海狮科技");
      assert.match(find("[data-org-legal]").textContent, /海狮科技有限公司/);
      assert.ok(find("[data-org-balance]").textContent.length > 0);
      assert.equal(find("[data-org-topup]").dataset.orgTopup, "unavailable", "没接 onTopup → 充值还没上线");
      assert.ok(find("[data-org-topup]").disabled);

      // 成员表：两行、七列 + 权限列
      const rows = findAll("[data-org-member]");
      assert.equal(rows.length, 2);
      assert.equal(findAll("thead th").length >= 8, true);
      assert.equal(findAll('[data-org-perm="view_org_page"]').length, 2);
      assert.equal(findAll('[data-org-perm="view_all_tasks"]').length, 2);
      assert.equal(findAll("[data-org-cap-input]").length, 2, "owner 有上限输入");
      assert.ok(find('[data-org-member="u-owner"] [data-org-perm="view_org_page"]').disabled, "owner 的勾不可改");
      assert.ok(find('[data-org-member="u-staff"]').textContent.includes("已达上限"));

      // 审批区
      assert.equal(findAll("[data-org-request]").length, 1);
      await click(find('[data-org-request="u-new"] [data-org-decide="approve"]'));
      const decide = calls().find((c) => c[0] === "decideJoinRequest");
      assert.deepEqual(decide, ["decideJoinRequest", "o1", "u-new", true]);

      // 邀请链接
      await click(find("[data-org-invite-create]"));
      assert.ok(calls().some((c) => c[0] === "createInvite" && c[1] === "o1"));
      assert.match(find("[data-org-invite]").textContent, /join\?code=abc/);

      // 用量：默认 30 天，切到 7
      assert.deepEqual(
        calls().filter((c) => c[0] === "getOrgUsage").map((c) => c[2]),
        [30],
      );
      assert.ok(find("[data-org-usage-trend]"));
      assert.ok(find("[data-org-usage-models]"));
      await click(find('[data-org-usage-window="7"]'));
      assert.deepEqual(
        calls().filter((c) => c[0] === "getOrgUsage").map((c) => c[2]),
        [30, 7],
      );

      assert.ok(names().includes("listMembers"));
      assert.ok(names().includes("listJoinRequests"));
      assert.equal(fetchCalls(), 0, "组织页自己一次 fetch 都不许发");
    },
    {
      orgApi: {
        listMyOrgs: async () => [org("o1", "海狮科技", "owner")],
        getOrg: async () => detailOf(org("o1", "海狮科技", "owner")),
        listJoinRequests: async () => requests,
      },
    },
  );
});

// —— ⑤ 被授权的普通成员 ——

test("被授予 view_org_page 的普通成员：只读成员表；没有权限勾、上限输入、审批区、编辑抬头、充值", async () => {
  await withDom(
    async ({ render, find, findAll, names, text }) => {
      await render();
      assert.equal(find('[data-org-page-state="forbidden"]'), null);
      assert.ok(find("[data-org-members-table]"));
      assert.equal(findAll("[data-org-member]").length, 2);
      assert.equal(findAll("[data-org-perm]").length, 0);
      assert.equal(findAll("[data-org-cap-input]").length, 0);
      assert.equal(find('[data-org-section="requests"]'), null);
      assert.equal(find("[data-org-topup]"), null);
      assert.doesNotMatch(text(), /编辑抬头/);
      assert.ok(!names().includes("listJoinRequests"), "成员不发审批列表请求");
    },
    {
      orgApi: {
        listMyOrgs: async () => [org("o1", "海狮科技", "member", { canViewOrgPage: true })],
        getOrg: async () => detailOf(org("o1", "海狮科技", "member", { canViewOrgPage: true })),
      },
    },
  );
});

// —— ④ 切换器 ——

test("多组织：URL ?org= 点名的优先；切换器换一家写回 ?org=；单组织不出切换器", async () => {
  const two = [org("o1", "海狮科技", "owner"), org("o2", "蓝鲸", "member", { canViewOrgPage: true })];
  await withDom(
    async ({ window, render, find, findAll, calls }) => {
      await render();
      const select = find("[data-org-switcher] select");
      assert.ok(select, "两家以上有切换器");
      assert.equal(select.value, "o2", "URL 点名的 o2 优先于第一家");
      assert.equal(findAll("option").length, 2);
      assert.equal(find("[data-org-name]").textContent, "蓝鲸");
      assert.equal(new URL(window.location.href).searchParams.get("org"), "o2");

      await act(async () => {
        select.value = "o1";
        select.dispatchEvent(new window.Event("change", { bubbles: true }));
      });
      for (let i = 0; i < 5; i += 1) await act(async () => {});
      assert.equal(new URL(window.location.href).searchParams.get("org"), "o1", "切换后写回 URL");
      assert.equal(find("[data-org-name]").textContent, "海狮科技");
      assert.deepEqual(
        calls().filter((c) => c[0] === "getOrg").map((c) => c[1]),
        ["o2", "o1"],
      );
    },
    {
      url: "https://oceanleo.com/org?org=o2",
      orgApi: {
        listMyOrgs: async () => two,
        getOrg: async (id) => detailOf(two.find((o) => o.id === id)),
      },
    },
  );

  await withDom(
    async ({ window, render, find }) => {
      await render();
      assert.equal(find("[data-org-switcher]"), null, "一家没有切换器");
      assert.equal(new URL(window.location.href).searchParams.get("org"), "o1", "仍写 ?org= 让刷新后保持");
    },
    {
      orgApi: {
        listMyOrgs: async () => [org("o1", "海狮科技", "owner")],
        getOrg: async () => detailOf(org("o1", "海狮科技", "owner")),
      },
    },
  );
});
