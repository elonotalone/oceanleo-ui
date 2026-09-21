// OrgMembership / AccountPage 组织区判据（W13，企业版成员侧）。
//
// 判的是员工这一侧看到什么、点了之后被说成什么：
//   ① 三段都在：我的组织 / 加入组织 / 谁看过我（`data-org-section`）；
//   ② 合规告知两句**逐字**在「加入组织」段里（任务书 P1 ②，不许省）；
//   ③ 五种入组状态各有明确文案：已通过 / 申请中 / 被驳回（后端 `rejected` 或 HTTP 403）/
//      链接过期或被撤销（HTTP 404 / 410）/ 你已经在这个组织里了（HTTP 409）；
//   ④ A2：`loadMyUsage` 不注入时走 `org-api` 的 `getMyOrgUsage`，行上显示本月花费 / 上限；
//   ⑤ A13：`loadInvitePreview` 不注入时走 `org-api` 的 `getInvitePreview`，申请前显示组织名；
//      替身里没有这个导出时静默不预览、申请照常能点（W11 落地前后都不炸）；
//   ⑥ 无组织无邀请码 + `hideWhenEmpty` → 渲染 null，`onVisibilityChange(false)`；
//   ⑦ `AccountPage` 无组织时不出现「我的组织」菜单项，也没有组织面板（无组织用户零差异）。
//
// `org-api` 全部打替身（形状照 `03-arbitration.md` A2/A13 与 `_COMMON §3.8`）：判的是面板怎么用它，
// 不是它自己。`globalThis.fetch` 一次都不许被碰——判据 5「/v1/orgs 只有一个出口」。
//
// 跑法（**必须带 loader**）：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test tests/org-membership.test.mjs

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body><main></main></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/join",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  InputEvent: window.InputEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

// react-dom 必须在 JSDOM 全局就位**之后**再加载：它在模块加载期判一次「浏览器支不支持
// input 事件」，没有 document 时判成不支持，之后受控 input 的 onChange 就只认 keyup /
// selectionchange，往输入框里 dispatch("input") 一律石沉大海（W13 r3 实测踩到）。
const { createRoot } = await import("react-dom/client");

// 判据 5：组织侧不许自建 fetch。整份测试里 fetch 被叫一次就红。
let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls += 1;
  throw new Error("OrgMembership must not call fetch directly");
};

const reactUrl = pathToFileURL(require.resolve("react")).href;

// 词典只读（§3.9），恒等 tt 让断言直接读中文原文；`{org}` 插值规则与真 useUI 一致。
const uiStubUrl = dataModule(`
  export function useUI() {
    return (value, vars) => value.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? "{" + key + "}"));
  }
`);

// org-api 替身：每个测试用 globalThis.__W13 换场景；调用计数进 calls。
// WITH_PREVIEW=false 时不导出 getInvitePreview，模拟 W11 A13 还没落地的盘面。
const orgApiStub = (withPreview) =>
  dataModule(`
  const g = () => globalThis.__W13;
  const count = (name) => { g().calls.push(name); };
  export class OrgApiError extends Error {
    constructor(code, status = 0) { super("org-api: " + code + " (HTTP " + status + ")"); this.name = "OrgApiError"; this.code = code; this.status = status; }
  }
  export function orgApiCode(error) { return error instanceof OrgApiError ? error.code : "offline"; }
  export function orgErrorCopy(code) {
    switch (code) {
      case "not_available": return "这一块还没上线，过些天再来看。";
      case "forbidden": return "你没有查看这个组织的权限。";
      case "offline": return "连不上服务器，检查一下网络再试。";
      case "agreement_required": return "请先阅读并勾选《OceanLeo 企业服务协议》。";
      default: return "这一步没有完成，请稍后重试。";
    }
  }
  export const ENTERPRISE_AGREEMENT_VERSION = "2026-09-20";
  export async function listMyOrgs() { count("listMyOrgs"); return g().listMyOrgs(); }
  export async function listViewsOfMe() { count("listViewsOfMe"); return g().listViewsOfMe(); }
  export async function requestJoin(code) { count("requestJoin:" + code); return g().requestJoin(code); }
  export async function getMyOrgUsage(orgId) { count("getMyOrgUsage:" + orgId); return g().getMyOrgUsage(orgId); }
  export async function createOrg(body) { count("createOrg:" + (body && body.name || "") + ":" + (body && body.agreementVersion || "")); return g().createOrg(body); }
  ${withPreview ? `export async function getInvitePreview(code) { count("getInvitePreview:" + code); return g().getInvitePreview(code); }` : ""}
`);

const orgApiWithPreview = orgApiStub(true);
const orgApiWithoutPreview = orgApiStub(false);

const membershipModule = await import(
  await compileModule("src/pages/OrgMembership.tsx", {
    "../lib/org-api": orgApiWithPreview,
    "../i18n/ui/useUI": uiStubUrl,
  })
);
const { OrgMembership, ORG_JOIN_DISCLOSURE, joinOutcomeOf } = membershipModule;

const { OrgMembership: OrgMembershipNoPreview } = await import(
  await compileModule("src/pages/OrgMembership.tsx", {
    "../lib/org-api": orgApiWithoutPreview,
    "../i18n/ui/useUI": uiStubUrl,
  })
);

const ORG_A = { id: "org-a", name: "海狮设计", role: "member", canViewOrgPage: false, canViewAllTasks: false, currency: "CNY" };
const ORG_B = { id: "org-b", name: "Leo Labs", role: "admin", canViewOrgPage: true, canViewAllTasks: true, currency: "USD" };

function scenario(overrides = {}) {
  return {
    calls: [],
    listMyOrgs: async () => [],
    listViewsOfMe: async () => [],
    requestJoin: async () => ({ status: "pending", orgName: "海狮设计" }),
    getMyOrgUsage: async () => ({ monthlyMinor: 0, capMinor: null }),
    getInvitePreview: async () => ({ orgName: "海狮设计", requireApproval: true }),
    createOrg: async () => ({ id: "org-new" }),
    ...overrides,
  };
}

async function render(element, s) {
  globalThis.__W13 = s;
  window.sessionStorage.clear();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  for (let i = 0; i < 6; i += 1) await act(async () => {});
  return {
    host,
    text: () => host.textContent || "",
    q: (sel) => host.querySelector(sel),
    qa: (sel) => [...host.querySelectorAll(sel)],
    async click(node) {
      await act(async () => {
        node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      });
      for (let i = 0; i < 4; i += 1) await act(async () => {});
    },
    async type(input, value) {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(input, value);
        input.dispatchEvent(new window.Event("input", { bubbles: true }));
      });
      for (let i = 0; i < 4; i += 1) await act(async () => {});
    },
    applyButton() {
      return [...host.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "申请加入");
    },
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

/* ---------- ① 三段都在 ---------- */

test("面板三段齐全：我的组织 / 加入组织 / 谁看过我；空列表说「还没有人看过」", async () => {
  const s = scenario({ listMyOrgs: async () => [ORG_A] });
  const view = await render(React.createElement(OrgMembership), s);
  assert.ok(view.q('[data-org-section="orgs"]'), "缺「我的组织」段");
  assert.ok(view.q('[data-org-section="join"]'), "缺「加入组织」段");
  assert.ok(view.q('[data-org-section="views"]'), "缺「谁看过我」段");
  assert.ok(view.q('[data-org-row="org-a"]'));
  assert.ok(view.text().includes("海狮设计"));
  assert.ok(view.text().includes("成员"), "角色要说成人话");
  assert.ok(view.q('[data-org-views-empty="1"]'));
  assert.ok(view.text().includes("还没有人看过"));
  assert.equal(fetchCalls, 0);
  view.cleanup();
});

test("「谁看过我」列出查看者邮箱与所属组织名", async () => {
  const s = scenario({
    listMyOrgs: async () => [ORG_A],
    listViewsOfMe: async () => [{ orgId: "org-a", viewerEmail: "boss@hailion.cn", viewedAt: "2026-09-19T08:00:00Z" }],
  });
  const view = await render(React.createElement(OrgMembership), s);
  const rows = view.qa('[data-org-view-row="1"]');
  assert.equal(rows.length, 1);
  assert.ok(rows[0].textContent.includes("boss@hailion.cn"));
  assert.ok(rows[0].textContent.includes("海狮设计"));
  assert.ok(!view.q('[data-org-views-empty="1"]'));
  view.cleanup();
});

/* ---------- ② 合规告知逐字 ---------- */

test("合规告知两句逐字出现在「加入组织」段里", async () => {
  const view = await render(React.createElement(OrgMembership), scenario());
  const note = view.q('[data-org-disclosure="1"]');
  assert.ok(note, "缺告知块");
  assert.equal(note.closest('[data-org-section="join"]') !== null, true, "告知必须在「加入组织」段里");
  const text = note.textContent || "";
  assert.ok(
    text.includes("用组织钱包付费的任务，组织管理员可以查看全部内容；用你个人钱包付费的任务，组织永远看不到。"),
  );
  assert.ok(text.includes("每次查看都会留下记录，你可以在下面看到谁看过。"));
  for (const sentence of ORG_JOIN_DISCLOSURE) assert.ok(text.includes(sentence));
  view.cleanup();
});

/* ---------- ③ 五种状态 ---------- */

test("joinOutcomeOf：结果与 HTTP 语义 → 五种状态", async () => {
  const { OrgApiError } = await import(orgApiWithPreview);
  assert.equal(joinOutcomeOf({ status: "joined" }).state, "joined");
  assert.equal(joinOutcomeOf({ status: "pending" }).state, "pending");
  assert.equal(joinOutcomeOf({ status: "rejected" }).state, "rejected");
  assert.equal(joinOutcomeOf(new OrgApiError("forbidden", 403)).state, "rejected");
  assert.equal(joinOutcomeOf(new OrgApiError("unknown", 409)).state, "already_member");
  assert.equal(joinOutcomeOf(new OrgApiError("not_found", 404)).state, "expired");
  assert.equal(joinOutcomeOf(new OrgApiError("unknown", 410)).state, "expired");
  const other = joinOutcomeOf(new OrgApiError("server_error", 500));
  assert.equal(other.state, "error");
  assert.equal(other.code, "server_error");
  assert.equal(joinOutcomeOf(new TypeError("net")).state, "error");
});

test("已通过：status=joined → 「已加入「海狮设计」」，重新拉组织列表，忘掉会话里的邀请码，onJoined 收到组织名", async () => {
  let joined = false;
  const s = scenario({
    listMyOrgs: async () => (joined ? [ORG_A] : []),
    requestJoin: async () => {
      joined = true;
      return { status: "joined", orgName: "海狮设计" };
    },
  });
  const seen = [];
  const view = await render(
    React.createElement(OrgMembership, { inviteCode: "INV-1", onJoined: (name) => seen.push(name) }),
    s,
  );
  assert.equal(window.sessionStorage.getItem("oceanleo:org-invite-code"), "INV-1", "链接带来的码要记进会话");
  await view.click(view.applyButton());
  const status = view.q('[data-org-join-state="joined"]');
  assert.ok(status, "缺已通过文案");
  assert.ok(status.textContent.includes("已加入「海狮设计」"));
  assert.ok(view.q('[data-org-row="org-a"]'), "通过后「我的组织」里要出现它");
  assert.deepEqual(seen, ["海狮设计"]);
  assert.equal(window.sessionStorage.getItem("oceanleo:org-invite-code"), null);
  assert.ok(s.calls.includes("requestJoin:INV-1"));
  view.cleanup();
});

test("申请中：status=pending → 「等负责人通过」", async () => {
  const view = await render(React.createElement(OrgMembership, { inviteCode: "INV-2" }), scenario());
  await view.click(view.applyButton());
  const status = view.q('[data-org-join-state="pending"]');
  assert.ok(status);
  assert.ok(status.textContent.includes("等负责人通过"));
  view.cleanup();
});

test("被驳回：后端透传 status=rejected（A13）→ 「申请没有通过」", async () => {
  const s = scenario({ requestJoin: async () => ({ status: "rejected", orgName: "海狮设计" }) });
  const view = await render(React.createElement(OrgMembership, { inviteCode: "INV-3" }), s);
  await view.click(view.applyButton());
  const status = view.q('[data-org-join-state="rejected"]');
  assert.ok(status);
  assert.ok(status.textContent.includes("申请没有通过"));
  view.cleanup();
});

test("被驳回：HTTP 403 → 同一句「申请没有通过」", async () => {
  const { OrgApiError } = await import(orgApiWithPreview);
  const s = scenario({
    requestJoin: async () => {
      throw new OrgApiError("forbidden", 403);
    },
  });
  const view = await render(React.createElement(OrgMembership, { inviteCode: "INV-4" }), s);
  await view.click(view.applyButton());
  assert.ok(view.q('[data-org-join-state="rejected"]'));
  assert.ok(view.text().includes("申请没有通过"));
  view.cleanup();
});

test("链接过期/被撤销：HTTP 404 与 410 → 「已经过期或被撤销」，并忘掉会话里的码", async () => {
  const { OrgApiError } = await import(orgApiWithPreview);
  for (const http of [404, 410]) {
    const s = scenario({
      requestJoin: async () => {
        throw new OrgApiError(http === 404 ? "not_found" : "unknown", http);
      },
    });
    const view = await render(React.createElement(OrgMembership, { inviteCode: `INV-${http}` }), s);
    await view.click(view.applyButton());
    const status = view.q('[data-org-join-state="expired"]');
    assert.ok(status, `HTTP ${http} 该判成过期`);
    assert.ok(status.textContent.includes("已经过期或被撤销"));
    assert.equal(window.sessionStorage.getItem("oceanleo:org-invite-code"), null);
    view.cleanup();
  }
});

test("你已经在这个组织里了：HTTP 409 → 明确文案", async () => {
  const { OrgApiError } = await import(orgApiWithPreview);
  const s = scenario({
    listMyOrgs: async () => [ORG_A],
    requestJoin: async () => {
      throw new OrgApiError("unknown", 409);
    },
  });
  const view = await render(React.createElement(OrgMembership, { inviteCode: "INV-5" }), s);
  await view.click(view.applyButton());
  const status = view.q('[data-org-join-state="already_member"]');
  assert.ok(status);
  assert.ok(status.textContent.includes("你已经在这个组织里了"));
  view.cleanup();
});

test("其他失败（500）→ 显示 orgErrorCopy 的人话，不是五种状态之一", async () => {
  const { OrgApiError } = await import(orgApiWithPreview);
  const s = scenario({
    requestJoin: async () => {
      throw new OrgApiError("server_error", 500);
    },
  });
  const view = await render(React.createElement(OrgMembership, { inviteCode: "INV-6" }), s);
  await view.click(view.applyButton());
  assert.ok(view.q('[data-org-join-state="error"]'));
  assert.ok(view.text().includes("这一步没有完成"));
  view.cleanup();
});

/* ---------- ④ A2：默认 loadMyUsage 走 getMyOrgUsage ---------- */

test("A2：不注入 loadMyUsage 时按组织逐个调 org-api.getMyOrgUsage，行上显示本月花费 / 上限，达上限标 capped", async () => {
  const s = scenario({
    listMyOrgs: async () => [ORG_A, ORG_B],
    getMyOrgUsage: async (orgId) =>
      orgId === "org-a" ? { monthlyMinor: 12_50, capMinor: 200_00 } : { monthlyMinor: 5_00, capMinor: 5_00 },
  });
  const view = await render(React.createElement(OrgMembership), s);
  assert.ok(s.calls.includes("getMyOrgUsage:org-a"));
  assert.ok(s.calls.includes("getMyOrgUsage:org-b"));
  const a = view.q('[data-org-usage="org-a"]').textContent;
  assert.ok(a.includes("¥12.50"), a);
  assert.ok(a.includes("¥200.00"), a);
  const b = view.q('[data-org-usage="org-b"]').textContent;
  assert.ok(b.includes("$5.00"), b);
  assert.equal(view.q('[data-org-row="org-a"] [data-org-status]').getAttribute("data-org-status"), "active");
  assert.equal(view.q('[data-org-row="org-b"] [data-org-status]').getAttribute("data-org-status"), "capped");
  assert.ok(view.text().includes("已达上限"));
  view.cleanup();
});

test("A2：capMinor=null 显示「不限」；某个组织取数失败只影响那一行", async () => {
  const { OrgApiError } = await import(orgApiWithPreview);
  const s = scenario({
    listMyOrgs: async () => [ORG_A, ORG_B],
    getMyOrgUsage: async (orgId) => {
      if (orgId === "org-b") throw new OrgApiError("not_available", 404);
      return { monthlyMinor: 0, capMinor: null };
    },
  });
  const view = await render(React.createElement(OrgMembership), s);
  assert.ok(view.q('[data-org-usage="org-a"]').textContent.includes("不限"));
  assert.ok(view.q('[data-org-usage="org-b"]').textContent.includes("—"));
  assert.ok(view.q('[data-org-row="org-b"]').textContent.includes("还没上线"));
  assert.ok(view.q('[data-org-row="org-a"]'), "另一行不受影响");
  view.cleanup();
});

/* ---------- ⑤ A13：默认 loadInvitePreview 走 getInvitePreview ---------- */

test("A13：链接带码时不注入 loadInvitePreview 也会调 org-api.getInvitePreview，申请前显示组织名与是否需审批", async () => {
  const s = scenario({ getInvitePreview: async () => ({ orgName: "海狮设计", requireApproval: true }) });
  const view = await render(React.createElement(OrgMembership, { inviteCode: "INV-P" }), s);
  assert.ok(s.calls.includes("getInvitePreview:INV-P"));
  const preview = view.q('[data-org-preview="1"]');
  assert.ok(preview, "缺预览");
  assert.ok(preview.textContent.includes("你将申请加入「海狮设计」"));
  assert.ok(preview.textContent.includes("需负责人通过"));
  view.cleanup();
});

test("A13：requireApproval=false 说「申请后立即加入」；手动输入邀请码也会预览", async () => {
  const s = scenario({ getInvitePreview: async () => ({ orgName: "Leo Labs", requireApproval: false }) });
  const view = await render(React.createElement(OrgMembership), s);
  assert.equal(view.q('[data-org-preview="1"]'), null, "没码时不预览");
  await view.type(view.q('input[aria-label="邀请码"]'), "TYPED");
  assert.ok(s.calls.includes("getInvitePreview:TYPED"));
  const preview = view.q('[data-org-preview="1"]');
  assert.ok(preview);
  assert.ok(preview.textContent.includes("Leo Labs"));
  assert.ok(preview.textContent.includes("申请后立即加入"));
  view.cleanup();
});

test("A13：org-api 还没有 getInvitePreview 导出时（W11 未落地）不预览、不报错，申请照常可点", async () => {
  const s = scenario();
  const view = await render(React.createElement(OrgMembershipNoPreview, { inviteCode: "INV-NP" }), s);
  assert.equal(view.q('[data-org-preview="1"]'), null);
  assert.ok(!s.calls.some((c) => c.startsWith("getInvitePreview")));
  const button = view.applyButton();
  assert.ok(button && !button.disabled, "申请按钮必须可点");
  await view.click(button);
  assert.ok(view.q('[data-org-join-state="pending"]'));
  assert.ok(!view.text().includes("还没上线"), "预览缺位不许在界面上报错");
  view.cleanup();
});

/* ---------- ⑥ hideWhenEmpty ---------- */

test("hideWhenEmpty：网关已上线但还没有组织 → 露出建组织表单；整条路由挂了仍渲染 null", async () => {
  const seen = [];
  const empty = await render(
    React.createElement(OrgMembership, { hideWhenEmpty: true, onVisibilityChange: (v) => seen.push(v) }),
    scenario(),
  );
  assert.ok(empty.q('[data-org-membership="1"]'), "已上线的空列表要能建组织");
  assert.ok(empty.q('[data-org-create="1"]'));
  assert.equal(seen.at(-1), true);
  empty.cleanup();

  const { OrgApiError } = await import(orgApiWithPreview);
  const seenDown = [];
  const down = await render(
    React.createElement(OrgMembership, { hideWhenEmpty: true, onVisibilityChange: (v) => seenDown.push(v) }),
    scenario({
      listMyOrgs: async () => {
        throw new OrgApiError("not_available", 404);
      },
      listViewsOfMe: async () => {
        throw new OrgApiError("not_available", 404);
      },
    }),
  );
  assert.equal(down.host.innerHTML, "", "路由未上线时账户页仍为零差异");
  assert.ok(seenDown.length > 0 && seenDown.every((v) => v === false));
  down.cleanup();
});

test("hideWhenEmpty：无组织但会话里有邀请码 → 面板出现（账户页据此给入口）", async () => {
  globalThis.__W13 = scenario();
  window.sessionStorage.setItem("oceanleo:org-invite-code", "FROM-LINK");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(OrgMembership, { hideWhenEmpty: true }));
  });
  for (let i = 0; i < 6; i += 1) await act(async () => {});
  assert.ok(host.querySelector('[data-org-membership="1"]'));
  assert.equal(host.querySelector('input[aria-label="邀请码"]').value, "FROM-LINK");
  act(() => root.unmount());
  host.remove();
  window.sessionStorage.clear();
});

/* ---------- 建组织：勾选协议 + 422 ---------- */

test("建组织：不勾协议时提交按钮灰；勾了并填了名字才能点；请求带 agreementVersion", async () => {
  const s = scenario();
  const view = await render(React.createElement(OrgMembership), s);
  const form = view.q('[data-org-create="1"]');
  assert.ok(form, "缺建组织表单");
  const link = form.querySelector('a[href="/org/agreement"]');
  assert.ok(link, "协议链接必须指向 /org/agreement");
  assert.ok((link.textContent || "").includes("OceanLeo 企业服务协议"));
  const name = form.querySelector('input[aria-label="组织名"]');
  const agree = form.querySelector('[data-org-create-agree="1"]');
  const submit = form.querySelector('[data-org-create-submit="1"]');
  assert.ok(name && agree && submit);
  assert.equal(submit.disabled, true, "空表单不能提交");
  await view.type(name, "海狮设计");
  assert.equal(submit.disabled, true, "没勾协议不能提交");
  await view.click(agree);
  assert.equal(submit.disabled, false);
  await view.click(submit);
  assert.ok(s.calls.some((c) => c === "createOrg:海狮设计:2026-09-20"), `实际 calls=${JSON.stringify(s.calls)}`);
  view.cleanup();
});

test("建组织：422 agreement_required 显示人话", async () => {
  const { OrgApiError } = await import(orgApiWithPreview);
  const s = scenario({
    createOrg: async () => {
      throw new OrgApiError("agreement_required", 422);
    },
  });
  const view = await render(React.createElement(OrgMembership), s);
  const form = view.q('[data-org-create="1"]');
  await view.type(form.querySelector('input[aria-label="组织名"]'), "Leo Labs");
  await view.click(form.querySelector('[data-org-create-agree="1"]'));
  await view.click(form.querySelector('[data-org-create-submit="1"]'));
  const err = view.q('[data-org-create-error="1"]');
  assert.ok(err, "缺 422 人话");
  assert.ok(err.textContent.includes("请先阅读并勾选《OceanLeo 企业服务协议》"));
  view.cleanup();
});

/* ---------- ⑦ AccountPage 无组织零差异 ---------- */

const authStubUrl = dataModule(`
  const s = () => globalThis.__authStub;
  export function oceanleoConfigured() { return true; }
  export function browserClient() { return s().client; }
  export async function getUserEmail() { return s().email; }
  export async function getCredits() { return { ok: true, data: { balance_yuan: 12.5 } }; }
  export async function getCreditHistory() { return { ok: true, data: { events: [] } }; }
  export async function getUsageBySite() { return { ok: true, data: { total: { requests: 0 } } }; }
  export async function signOutEverywhere() {}
  export function loginUnavailableNotice() { return { title: "", detail: "" }; }
  export function isPasswordResetLanding() { return false; }
`);
const stubComponent = (name, testid) =>
  dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function ${name}() { return React.createElement("div", { "data-testid": ${JSON.stringify(testid)} }); }
`);
const linkStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export default function Link({ href, children, ...rest }) {
    return React.createElement("a", { href, "data-next-link": "1", ...rest }, children);
  }
`);
const pageHeaderStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function PageHeader({ title }) { return React.createElement("h1", null, title); }
`);

const { AccountPage } = await import(
  await compileModule("src/pages/AccountPage.tsx", {
    "next/link": linkStubUrl,
    "./AccountSecurityPage": stubComponent("AccountSecurityPage", "security"),
    "./PasswordResetPage": stubComponent("PasswordResetPage", "reset"),
    "./AuthDialog": stubComponent("AuthDialog", "auth"),
    "../ui": stubComponent("ConfirmDialog", "confirm"),
    "./PageHeader": pageHeaderStubUrl,
    "../lib/auth": authStubUrl,
    "../i18n/ui/useUI": uiStubUrl,
    "../lib/org-api": orgApiWithPreview,
  })
);

function accountAuthStub() {
  return {
    email: "designer@oceanleo.com",
    client: { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } },
  };
}

// 2026-09-21 操作员定案：组织内容不许直接暴露在账户默认视图里；账户页变成设置中心，
// 组织只在「组织」栏出现。下面两条按新契约写：默认栏零组织内容，组织栏才有。
test("AccountPage：默认（账户）栏不暴露组织内容；切到组织栏才出现「我的组织」与建组织表单", async () => {
  globalThis.__authStub = accountAuthStub();
  const none = await render(React.createElement(AccountPage), scenario());
  assert.ok(none.q("[data-settings-hub]"), "账户页应是设置中心");
  assert.ok(none.q('[data-settings-item="account"][aria-current="page"]'), "默认落在账户栏");
  assert.equal(none.q('[data-org-membership="1"]'), null, "账户栏不许直接摆组织内容");
  assert.equal(none.q('[data-org-create="1"]'), null, "账户栏不许直接摆建组织表单");
  const orgTab = none.q('[data-settings-item="org"]');
  assert.ok(orgTab, "左栏要有「组织」项");
  await none.click(orgTab);
  assert.ok(none.q('[data-settings-pane="org"]'), "点组织栏后右侧是组织面板");
  assert.ok(none.q('[data-org-membership="1"]'), "网关已上线：组织栏里有我的组织");
  assert.ok(none.q('[data-org-create="1"]'), "网关已上线：组织栏里能建组织");
  none.cleanup();

  globalThis.__authStub = accountAuthStub();
  const some = await render(React.createElement(AccountPage), scenario({ listMyOrgs: async () => [ORG_A] }));
  await some.click(some.q('[data-settings-item="org"]'));
  assert.ok(some.q('[data-org-membership="1"]'));
  assert.ok(some.q('[data-org-create="1"]'), "已有组织也能再创建一家");
  some.cleanup();
});

test("AccountPage：org-api 整条路 404（路由未上线）时组织栏安静，不报错", async () => {
  const { OrgApiError } = await import(orgApiWithPreview);
  globalThis.__authStub = accountAuthStub();
  const down = scenario({
    listMyOrgs: async () => {
      throw new OrgApiError("not_available", 404);
    },
    listViewsOfMe: async () => {
      throw new OrgApiError("not_available", 404);
    },
  });
  const view = await render(React.createElement(AccountPage), down);
  assert.equal(view.q('[data-org-membership="1"]'), null);
  await view.click(view.q('[data-settings-item="org"]'));
  assert.equal(view.q('[data-org-membership="1"]'), null, "路由未上线：组织栏不摆半成品");
  assert.ok(!view.text().includes("还没上线"));
  view.cleanup();
});

test("整份测试没有一次直接 fetch（判据 5：/v1/orgs 只走 org-api）", () => {
  assert.equal(fetchCalls, 0);
});
