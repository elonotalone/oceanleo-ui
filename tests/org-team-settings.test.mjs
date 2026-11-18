import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const auth = dataModule('export async function accessToken(){return "test-only";}');
const config = dataModule('export const GATEWAY_BASE="https://gateway.test";');
const ui = dataModule('const tt=(text,vars={})=>text.replace(/\\{(\\w+)\\}/g,(m,k)=>vars[k]??m); export function useUI(){return tt;}');
const overrides = { "./auth/client": auth, "./auth/config": config, "../i18n/ui/useUI": ui };
const api = await import(await compileModule("src/lib/org-api.ts", overrides));
const { OrgLifecycle } = await import(await compileModule("src/pages/org/OrgLifecycle.tsx", overrides));
const { OrgLimits, limitInput } = await import(await compileModule("src/pages/org/OrgLimits.tsx", overrides));
const { OrgWallet, transferAmount } = await import(await compileModule("src/pages/org/OrgWallet.tsx", overrides));
const { OrgMembership } = await import(await compileModule("src/pages/OrgMembership.tsx", overrides));
const { OrgPage } = await import(await compileModule("src/pages/OrgPage.tsx", {
  ...overrides, "./org/OrgMcpSection": dataModule('export function OrgMcpSection(){return null;}'),
}));
const { ENTERPRISE_COPY_MESSAGES } = await import("../src/i18n/ui/messages/enterprise-copy.ts");
const { TEAM_COPY_SOURCE } = await import("../src/i18n/ui/messages/enterprise-copy-team.ts");

const limits = { total_minor: null, day_minor: 0, five_day_minor: 1000, month_minor: 3000 };
const spent = { total_minor: 2200, day_minor: 0, five_day_minor: 600, month_minor: 2200 };
const capRow = { user_id: "member", limits, spent };
const member = { userId: "member", email: "member@example.test", role: "member", status: "active" };
const org = { id: "team", name: "Our team", role: "owner", currency: "USD", balanceMinor: 9000, minTopupMinor: 100, legalName: "Company", taxId: "Tax", overviewAvailable: true };
const orgs = [org, { id: "owned", name: "Other owned team", role: "owner", currency: "USD" }, { id: "member-team", name: "Not owned", role: "member", currency: "USD" }];
const json = (body = {}, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const error = (code, status = 503) => json({ detail: { code, message: `server ${code}` } }, status);

function defaultReply(path, init) {
  if (init.method && init.method !== "GET") return json();
  if (path === "/v1/orgs") return json({ orgs });
  if (path.endsWith("/caps/me")) return json(capRow);
  if (path.endsWith("/caps")) return json({ members: [capRow] });
  if (path.endsWith("/members")) return json({ members: [{ user_id: "member", email: member.email, role: "member", status: "active" }] });
  if (path.endsWith("/members/usage")) return json({ members: [{ user_id: "member", monthly_minor: 2200 }] });
  if (path.includes("/wallet/transfers")) return json({ transfers: [] });
  if (path.endsWith("/overview")) return json({ balance_minor: 9000, min_topup_minor: 100 });
  if (path === "/v1/orgs/team") return json({ ...org, legal_name: "Company" });
  return json({});
}

async function withFetch(handler, run) {
  const previous = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname + new URL(url).search;
    const call = { path, init, body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    return (await handler?.(call)) ?? defaultReply(path, init);
  };
  try { return await run(calls); } finally { globalThis.fetch = previous; }
}

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvas = fabricRequire.resolve("canvas"), prevCanvas = require.cache[canvas];
require.cache[canvas] = { id: canvas, filename: canvas, loaded: true, exports: {} };
const { JSDOM, VirtualConsole } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (prevCanvas) require.cache[canvas] = prevCanvas; else delete require.cache[canvas];

async function render(element, run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "https://app.test/org?org=team", pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const previous = new Map();
  for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "Event", "MouseEvent", "IS_REACT_ACT_ENVIRONMENT"]) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[key] });
  }
  const { createRoot } = await import("react-dom/client");
  const host = document.querySelector("#root"), root = createRoot(host);
  const settle = async () => { for (let i = 0; i < 6; i++) await act(async () => {}); };
  const v = {
    q: (selector) => host.querySelector(selector), qa: (selector) => [...host.querySelectorAll(selector)],
    text: () => host.textContent,
    async click(node) { assert.ok(node, "click target exists"); await act(async () => node.click()); await settle(); },
    async change(node, value) {
      assert.ok(node, "input exists");
      const proto = node.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
      await act(async () => { Object.getOwnPropertyDescriptor(proto, "value").set.call(node, value); node.dispatchEvent(new window.Event("input", { bubbles: true })); node.dispatchEvent(new window.Event("change", { bubbles: true })); });
      await settle();
    },
    async submit(node) { await act(async () => node.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))); await settle(); },
  };
  try { await act(async () => root.render(element)); await settle(); return await run(v); }
  finally { await act(async () => root.unmount()); dom.window.close(); for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } }
}

test("privacy: retired disclosure, audit and task client removed; new copy exists in all 17 locales", () => {
  for (const file of ["OrgMembership.tsx", "OrgPage.tsx"]) {
    const source = readFileSync(new URL(`../src/pages/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /ORG_JOIN_DISCLOSURE|data-org-disclosure|canViewAllTasks|listViewsOfMe/);
  }
  const client = readFileSync(new URL("../src/lib/org-api.ts", import.meta.url), "utf8");
  assert.doesNotMatch(client, /listOrgTasks|normalizeOrgTaskRows|listViewsOfMe|canViewAllTasks/);
  const replay = readFileSync(new URL("../src/shell/replay/work/replay-work-api.ts", import.meta.url), "utf8");
  assert.doesNotMatch(replay, /createOrgMemberReplay/);
  assert.equal(Object.keys(ENTERPRISE_COPY_MESSAGES).length, 17);
  for (const [locale, dictionary] of Object.entries(ENTERPRISE_COPY_MESSAGES)) {
    assert.equal(dictionary["加入后这个团队能看到什么"], undefined, locale);
    assert.equal(dictionary["每次查看都会留下记录，你可以在下面看到谁看过。"], undefined, locale);
    assert.equal(dictionary["用团队钱包付费的任务，团队管理员可以查看全部内容；用你个人钱包付费的任务，团队永远看不到。"], undefined, locale);
    for (const key of Object.values(TEAM_COPY_SOURCE)) {
      assert.ok(dictionary[key], `${locale}: ${key}`);
      const vars = (text) => [...text.matchAll(/\{\w+\}/g)].map(m => m[0]).sort();
      assert.deepEqual(vars(dictionary[key]), vars(key));
    }
  }
});

test("lifecycle client sends the exact route, method and body", async () => {
  await withFetch(null, async (calls) => {
    await api.removeOrgMember("a/b", "u/v"); await api.leaveOrg("a/b");
    await api.transferOrgOwnership("a/b", "target"); await api.dissolveOrg("a/b", "Exact name");
    assert.deepEqual(calls.map(c => [c.path, c.init.method, c.body]), [
      ["/v1/orgs/a%2Fb/members/u%2Fv", "DELETE", undefined], ["/v1/orgs/a%2Fb:leave", "POST", undefined],
      ["/v1/orgs/a%2Fb:transfer-ownership", "POST", { toUserId: "target" }], ["/v1/orgs/a%2Fb:dissolve", "POST", { confirm_name: "Exact name" }],
    ]);
  });
});

test("limits client round-trips null and zero; caps/me supplies all windows", async () => {
  await withFetch((c) => c.init.method === "PUT" ? json({ ...capRow, limits: { ...limits, ...c.body } }) : undefined, async (calls) => {
    const row = await api.setMemberLimits("team", "member", limits);
    assert.deepEqual(row.limits, limits); assert.deepEqual(calls[0].body, limits);
    const mine = await api.getMyOrgUsage("team");
    assert.deepEqual(mine.limits, limits); assert.deepEqual(mine.spent, spent);
    assert.equal(mine.monthlyMinor, 2200); assert.equal(mine.capMinor, 3000);
    await api.setMemberLimits("team", "member", { day_minor: null });
    assert.deepEqual(calls.at(-1).body, { day_minor: null });
  });
});

test("structured missing-migration and wallet refusals preserve their code and reason", async () => {
  for (const [code, status] of [["not_available", 503], ["currency_mismatch", 409], ["insufficient_funds", 409], ["name_mismatch", 409], ["invalid_amount", 422]]) {
    await withFetch(() => error(code, status), async () => {
      await assert.rejects(api.dissolveOrg("team", "Our team"), e => e.code === code && e.status === status && e.detail === `server ${code}`);
    });
  }
  await withFetch(null, async calls => {
    await assert.rejects(api.setMemberPermission("team", "member", "view_all_tasks", true), e => e.code === "forbidden");
    assert.equal(calls.length, 0);
    await api.setMemberPermission("team", "member", "view_org_page", true);
    assert.deepEqual(calls[0].body, { canViewOrgPage: true });
  });
});

test("dissolve: exact name, explanation, currency refusal and no false completion", async () => {
  let changed = 0;
  await withFetch(c => c.path.endsWith(":dissolve") ? error("currency_mismatch", 409) : undefined, async calls => {
    await render(React.createElement(OrgLifecycle, { orgId: "team", name: org.name, role: "owner", members: [member], onChanged: () => changed++ }), async v => {
      await v.click(v.q("[data-org-dissolve]"));
      assert.match(v.text(), /全部余额退回你的个人钱包/); assert.match(v.text(), /所有成员会被移除/);
      assert.equal(v.q("[data-org-action-confirm]").disabled, true);
      await v.change(v.q("[data-org-confirm-name]"), "wrong"); assert.equal(v.q("[data-org-action-confirm]").disabled, true);
      await v.change(v.q("[data-org-confirm-name]"), org.name); await v.click(v.q("[data-org-action-confirm]"));
      assert.deepEqual(calls.at(-1).body, { confirm_name: org.name }); assert.equal(changed, 0);
      assert.match(v.text(), /币种不同/); assert.ok(v.q('[role="dialog"]'));
    });
  });
});

test("remove, ownership and leave require confirmation; non-owner has no owner controls", async () => {
  for (const [role, selector, path, body] of [
    ["admin", "[data-org-remove]", "/v1/orgs/team/members/member", undefined],
    ["owner", "[data-org-transfer-owner]", "/v1/orgs/team:transfer-ownership", { toUserId: "member" }],
    ["member", "[data-org-leave]", "/v1/orgs/team:leave", undefined],
  ]) await withFetch(null, async calls => {
    let changed = 0;
    await render(React.createElement(OrgLifecycle, { orgId: "team", name: org.name, role, members: [member], onChanged: () => changed++ }), async v => {
      if (role !== "owner") { assert.equal(v.q("[data-org-dissolve]"), null); assert.equal(v.q("[data-org-transfer-owner]"), null); }
      if (role === "member") assert.equal(v.q("[data-org-remove]"), null);
      await v.click(v.q(selector)); assert.equal(calls.length, 0);
      await v.click(v.q("[data-org-action-confirm]"));
      assert.equal(calls[0].path, path); assert.deepEqual(calls[0].body, body); assert.equal(changed, 1);
    });
  });
});

test("limit form shows four spent windows, saves blank/zero and rejects invalid input", async () => {
  await withFetch(c => c.init.method === "PUT" ? json({ ...capRow, limits: { ...limits, ...c.body } }) : undefined, async calls => {
    await render(React.createElement(OrgLimits, { orgId: "team", members: [member], editable: true, currency: "USD" }), async v => {
      assert.equal(v.qa("[data-org-limit-input]").length, 4);
      assert.equal(v.q('[data-org-limit-input="day_minor"]').value, "0");
      await v.change(v.q('[data-org-limit-input="total_minor"]'), "0");
      await v.change(v.q('[data-org-limit-input="month_minor"]'), "");
      await v.submit(v.q("[data-org-limit-member]"));
      assert.deepEqual(calls.at(-1).body, { total_minor: 0, day_minor: 0, five_day_minor: 1000, month_minor: null });
      const before = calls.length;
      await v.change(v.q('[data-org-limit-input="day_minor"]'), "-1"); await v.submit(v.q("[data-org-limit-member]"));
      assert.equal(calls.length, before); assert.match(v.text(), /请输入零或正数/);
      assert.match(v.text(), /已花/);
    });
  });
  for (const invalid of ["-1", "a", "1.001", "Infinity", "1e3"]) assert.equal(limitInput(invalid), undefined);
  assert.equal(limitInput(""), null); assert.equal(limitInput("0"), 0);
});

test("read-only limits and membership display all four windows without editing controls", async () => {
  await withFetch(null, async () => {
    await render(React.createElement(OrgLimits, { orgId: "team", members: [member], editable: false, currency: "USD" }), async v => {
      assert.equal(v.qa("[data-org-limit-input]").length, 0); assert.equal(v.qa("[data-org-limits-readonly] dt").length, 4);
    });
  });
  await withFetch(c => c.path === "/v1/orgs" ? json({ orgs: [{ ...org, role: "member" }] }) : undefined, async calls => {
    await render(React.createElement(OrgMembership, { only: "orgs" }), async v => {
      assert.equal(v.qa("[data-org-limits-readonly] dt").length, 4); assert.ok(v.q("[data-org-leave]"));
      assert.equal(calls.some(c => c.path.includes("/views")), false);
    });
  });
});

test("limits unavailable leaves the page and spend table usable; non-owner has no owner wallet", async () => {
  await withFetch(c => c.path.endsWith("/caps") || c.path.includes("/wallet/transfers") ? error("not_available") : undefined, async () => {
    await render(React.createElement(OrgPage), async v => {
      assert.ok(v.q("[data-org-members-table]")); assert.match(v.q('[data-org-section="limits"]').textContent, /还没上线/);
      assert.match(v.q('[data-org-section="wallet"]').textContent, /还没上线/);
      assert.equal(v.q('[data-org-perm="view_all_tasks"]'), null);
    });
  });
  await withFetch(c => c.path === "/v1/orgs" ? json({ orgs: [{ ...org, role: "admin", can_view_org_page: true }] }) : undefined, async () => {
    await render(React.createElement(OrgPage), async v => {
      assert.equal(v.q('[data-org-section="wallet"]'), null); assert.equal(v.q("[data-org-topup]"), null);
      assert.equal(v.q("[data-org-dissolve]"), null); assert.equal(v.q("[data-org-transfer-owner]"), null);
      assert.equal(v.q("[data-org-limit-input]"), null);
    });
  });
});

test("transfer validation blocks empty, zero, negative, excess decimals, excessive team debit and unowned targets", async () => {
  for (const value of ["", "0", "-1", "1.001", "abc"]) assert.equal(transferAmount(value), undefined);
  assert.equal(transferAmount("1.05"), 105);
  await withFetch(null, async calls => {
    await render(React.createElement(OrgWallet, { org, orgs, onChanged() {} }), async v => {
      await v.submit(v.q("[data-org-transfer-form]")); assert.match(v.text(), /请输入大于零/);
      await v.change(v.q("[data-org-transfer-direction]"), "team_to_personal");
      await v.change(v.q("[data-org-transfer-amount]"), "100"); await v.submit(v.q("[data-org-transfer-form]")); assert.match(v.text(), /余额不足/);
      await v.change(v.q("[data-org-transfer-direction]"), "team_to_team"); await v.change(v.q("[data-org-transfer-amount]"), "1");
      assert.deepEqual(v.qa("[data-org-transfer-target] option").map(n => n.value), ["", "owned"]);
      await v.submit(v.q("[data-org-transfer-form]")); assert.match(v.text(), /请选择你负责/);
      assert.equal(calls.filter(c => c.init.method === "POST").length, 0);
    });
  });
});

test("all three transfer directions send minor amounts and a UUID; successful move reloads history", async () => {
  for (const direction of ["personal_to_team", "team_to_personal", "team_to_team"]) await withFetch(null, async calls => {
    let changed = 0;
    await render(React.createElement(OrgWallet, { org, orgs, onChanged: () => changed++ }), async v => {
      await v.change(v.q("[data-org-transfer-direction]"), direction);
      if (direction === "team_to_team") await v.change(v.q("[data-org-transfer-target]"), "owned");
      await v.change(v.q("[data-org-transfer-amount]"), "1.25"); await v.submit(v.q("[data-org-transfer-form]"));
      const sent = calls.find(c => c.init.method === "POST"); assert.equal(sent.path, "/v1/orgs/team/wallet/transfers");
      assert.equal(sent.body.amount_minor, 125); assert.equal(sent.body.direction, direction);
      assert.match(sent.body.request_id, /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/);
      assert.equal(sent.body.to_org_id, direction === "team_to_team" ? "owned" : undefined);
      assert.equal(changed, 1); assert.equal(calls.filter(c => c.path.includes("?limit=50")).length, 2);
    });
  });
});

test("transfer retry preserves request_id and exact body after network failure; later transfer gets a new ID", async () => {
  let posts = 0;
  await withFetch(c => { if (c.init.method === "POST" && ++posts === 1) throw new TypeError("network failed after send"); }, async calls => {
    await render(React.createElement(OrgWallet, { org, orgs, onChanged() {} }), async v => {
      await v.change(v.q("[data-org-transfer-amount]"), "5"); await v.submit(v.q("[data-org-transfer-form]"));
      assert.equal(v.q("[data-org-transfer-amount]").disabled, true);
      await v.submit(v.q("[data-org-transfer-form]"));
      const sent = () => calls.filter(c => c.init.method === "POST");
      assert.deepEqual(sent()[0].body, sent()[1].body);
      await v.change(v.q("[data-org-transfer-amount]"), "5"); await v.submit(v.q("[data-org-transfer-form]"));
      assert.notEqual(sent()[2].body.request_id, sent()[0].body.request_id);
    });
  });
});

test("top-up uses Stripe and bank routes, enforces minimum and never claims a pending bank deposit credited", async () => {
  for (const currency of ["USD", "CNY"]) await withFetch(c => c.path.endsWith("/topups/stripe") ? json({ topup: { id: "topup" }, payment: { url: "https://checkout.stripe.com/c/pay/test" } }) : c.path.endsWith("/topups/bank-transfer") ? json({ topup: { id: "bank-order" } }) : undefined, async calls => {
    await render(React.createElement(OrgWallet, { org: { ...org, currency }, orgs, onChanged() {}, topupOpen: true }), async v => {
      await v.change(v.q("[data-org-topup-amount]"), "0.5"); await v.submit(v.q("[data-org-topup-form]"));
      assert.equal(calls.filter(c => c.init.method === "POST").length, 0);
      await v.change(v.q("[data-org-topup-amount]"), "10"); await v.submit(v.q("[data-org-topup-form]"));
      const sent = calls.find(c => c.init.method === "POST");
      assert.equal(sent.path, `/v1/orgs/team/topups/${currency === "CNY" ? "bank-transfer" : "stripe"}`);
      assert.equal(sent.body.amountMinor, 1000); assert.equal(sent.body.legalName, "Company"); assert.equal(sent.body.taxId, "Tax");
      if (currency === "USD") {
        assert.equal(v.q('a').href, "https://checkout.stripe.com/c/pay/test");
        assert.equal(sent.body.returnOrigin, "https://app.test");
      }
      else { assert.match(v.text(), /bank-order/); assert.match(v.text(), /余额不变/); }
    });
  });
});

test("not_available appears on failed dissolve, transfer and top-up without success", async () => {
  await withFetch(c => c.init.method === "POST" ? error("not_available") : undefined, async () => {
    await render(React.createElement(OrgWallet, { org, orgs, onChanged() {}, topupOpen: true }), async v => {
      await v.change(v.q("[data-org-transfer-amount]"), "2"); await v.submit(v.q("[data-org-transfer-form]"));
      assert.match(v.text(), /还没上线/); assert.doesNotMatch(v.text(), /余额已转移/);
      await v.change(v.q("[data-org-topup-amount]"), "2"); await v.submit(v.q("[data-org-topup-form]"));
      assert.equal(v.q("a"), null); assert.equal(v.qa('[role="status"]').filter(n => /还没上线/.test(n.textContent)).length, 2);
    });
  });
});

test("legacy caps answers are unavailable rather than showing invented unlimited windows", async () => {
  await withFetch(c => c.path.endsWith("/caps/me") ? json({ monthlyMinor: 1200, capMinor: null }) : c.path.endsWith("/caps") ? json({ caps: [{ user_id: "member", monthly_cap_minor: 100 }] }) : undefined, async () => {
    await assert.rejects(api.getMyOrgLimits("team"), e => e.code === "not_available");
    await render(React.createElement(OrgLimits, { orgId: "team", members: [member], editable: true, currency: "USD" }), async v => {
      assert.match(v.text(), /还没上线/); assert.equal(v.q("[data-org-limit-input]"), null);
    });
  });
});

test("a definite wallet refusal permits correction; a failed balance refresh cannot turn success into retry", async () => {
  let posts = 0;
  await withFetch(c => c.init.method === "POST" && ++posts === 1 ? error("insufficient_funds", 409) : undefined, async calls => {
    await render(React.createElement(OrgWallet, { org, orgs, onChanged() { throw new Error("refresh failed"); } }), async v => {
      await v.change(v.q("[data-org-transfer-amount]"), "5"); await v.submit(v.q("[data-org-transfer-form]"));
      assert.match(v.text(), /余额不足/); assert.equal(v.q("[data-org-transfer-amount]").disabled, false);
      await v.change(v.q("[data-org-transfer-amount]"), "2"); await v.submit(v.q("[data-org-transfer-form]"));
      assert.match(v.text(), /余额已转移/); assert.equal(v.q("[data-org-transfer-submit]").textContent, "转移余额");
      const sent = calls.filter(c => c.init.method === "POST");
      assert.equal(sent[1].body.amount_minor, 200); assert.notEqual(sent[1].body.request_id, sent[0].body.request_id);
    });
  });
});

test("dissolve unavailable and wrong-role refusals stay in the confirmation with no completion", async () => {
  for (const [code, status] of [["not_available", 503], ["owner_only", 403]]) await withFetch(c => c.init.method === "POST" ? error(code, status) : undefined, async () => {
    let completed = false;
    await render(React.createElement(OrgLifecycle, { orgId: "team", name: org.name, role: "owner", onChanged() { completed = true; } }), async v => {
      await v.click(v.q("[data-org-dissolve]")); await v.change(v.q("[data-org-confirm-name]"), org.name);
      await v.click(v.q("[data-org-action-confirm]"));
      assert.equal(completed, false); assert.ok(v.q('[role="dialog"]'));
      assert.match(v.text(), code === "not_available" ? /还没上线/ : /没有查看这个团队的权限/);
    });
  });
});

test("transfer history shows counterpart, direction, amount and time", async () => {
  await withFetch(c => c.path.includes("/wallet/transfers?") ? json({ transfers: [{ transfer_id: "move", direction: "team_to_team", amount_minor: 1234, currency: "USD", counterparty: { kind: "team", name: "Design team" }, created_at: "2026-11-18T10:00:00Z" }] }) : undefined, async () => {
    await render(React.createElement(OrgWallet, { org, orgs, onChanged() {} }), async v => {
      const history = v.q("[data-org-transfer-history]"); assert.match(history.textContent, /Design team/); assert.match(history.textContent, /12\.34/);
      assert.match(history.textContent, /转移余额/); assert.match(history.textContent, /−/); assert.ok(history.querySelector("time"));
    });
  });
});

test("owner top-up button opens the built-in form in team settings", async () => {
  await withFetch(null, async () => {
    await render(React.createElement(OrgPage), async v => {
      assert.equal(v.q("[data-org-topup-form]"), null);
      await v.click(v.q("[data-org-topup]"));
      assert.ok(v.q("[data-org-topup-form]")); assert.ok(v.q("[data-org-topup-amount]"));
    });
  });
});

test("team settings refresh both management and membership after dissolve, leave and ownership transfer", async () => {
  const { OrgSection } = await import(await compileModule("src/pages/settings/sections/OrgSection.tsx", {
    ...overrides, "./org/OrgMcpSection": dataModule('export function OrgMcpSection(){return null;}'),
  }));
  for (const kind of ["dissolve", "leave", "transfer"]) {
    let currentOrgs = [{ ...org, role: kind === "leave" ? "member" : "owner" }];
    await withFetch(c => {
      if (c.path === "/v1/orgs") return json({ orgs: currentOrgs });
      if (c.init.method === "POST") {
        currentOrgs = kind === "transfer" ? [{ ...org, role: "admin", can_view_org_page: true }] : [];
        return json({});
      }
    }, async () => {
      await render(React.createElement(OrgSection), async v => {
        const selector = kind === "dissolve" ? "[data-org-dissolve]" : kind === "leave" ? "[data-org-leave]" : "[data-org-transfer-owner]";
        await v.click(v.q(selector));
        if (kind === "dissolve") await v.change(v.q("[data-org-confirm-name]"), org.name);
        await v.click(v.q("[data-org-action-confirm]"));
        assert.equal(v.q("[data-org-dissolve]"), null); assert.equal(v.q('[data-org-section="wallet"]'), null);
        if (kind !== "transfer") assert.equal(v.q('[data-org-row="team"]'), null);
        else assert.ok(v.q('[data-org-row="team"]'));
      });
    });
  }
});


test("top-up minimum comes from its route when overview omits it; incoming transfers retain their sign", async () => {
  await withFetch(c => c.path.endsWith("/overview") ? json({ balanceMinor: 9000 }) : c.path.endsWith("/topups?limit=1") ? json({ minTopupMinor: 50000, topups: [] }) : c.path.includes("/wallet/transfers?") ? json({ transfers: [{ transfer_id: "incoming", direction: "team_to_team", amount_minor: 100, currency: "USD", counterparty: { kind: "team", name: "Source team" }, created_at: "2026-11-18T10:00:00Z", incoming: true }] }) : undefined, async () => {
    assert.equal((await api.getOrg("team")).minTopupMinor, 50000);
    await render(React.createElement(OrgWallet, { org, orgs, onChanged() {} }), async v => {
      assert.match(v.q("[data-org-transfer-history]").textContent, /Source team/);
      assert.match(v.q("[data-org-transfer-history]").textContent, /\+/);
    });
  });
});
