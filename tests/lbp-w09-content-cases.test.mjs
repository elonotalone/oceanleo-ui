// leobay-projects W09：「内容处置」搬进 LeoChat（src/shell/messages/cases/*、src/lib/moderation/*）。
// 覆盖：案件模型与「能做什么」规则、客户端请求形状与错误归类、列表 / 展开 / 深链指名展开、
// 反通知与申诉两张表单的必填校验和提交路径（提交后刷新、表单退场、已提交标记）、未登录、取不到、失败提示、
// 返回键，以及卖家界面指向新地址、译文表 16 语齐全。
// 组件源码经 tests/helpers/module-bench.mjs 编出来再导入；网关用 `authed` 的替身。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  appealBody,
  appealMissing,
  canAppeal,
  canCounterNotice,
  counterNoticeBody,
  counterNoticeMissing,
  daysUntil,
  formatCaseTime,
  needsAction,
  normalizeCase,
  normalizeCases,
  reasonCodeOf,
} from "../src/lib/moderation/case-model.ts";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://oceanleo.com/leochat?im=cases" });
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");

// ---- 替身 -------------------------------------------------------------------------------

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);
const intlStub = dataModule('export function useLocale(){ return "zh"; }');
const authStub = dataModule(`
  export const AUTH_STATE_EVENT = "oceanleo:auth-state";
  export async function accessToken(){ return "t"; }
`);
const agentStub = dataModule(`
  export async function authed(path, init) {
    const body = init && init.body ? JSON.parse(init.body) : undefined;
    (globalThis.__casesCalls ||= []).push({ method: (init && init.method) || "GET", path, body });
    return globalThis.__casesAuthed(path, init, body);
  }
`);
const settingsStub = dataModule(`
  export function openSettingsModal(tab){ (globalThis.__casesSettings ||= []).push(tab); }
`);

// 入口在 src/shell/messages/cases/，桩 key 按入口目录写；图里别处用另一条相对路径引到同一文件时也认。
const STUBS = {
  "../../../i18n/ui/useUI": uiStub,
  "next-intl": intlStub,
  "../../../lib/auth/client": authStub,
  "../../../lib/agent": agentStub,
  "../../../pages/settings/settings-tabs": settingsStub,
};

const { MessagesContentCases } = await import(await compileModule("src/shell/messages/cases/MessagesContentCases.tsx", STUBS));
const labels = await import(await compileModule("src/shell/messages/cases/case-labels.ts", STUBS));
const client = await import(await compileModule("src/lib/moderation/client.ts", STUBS));
const { CounterNoticeForm, AppealForm } = await import(await compileModule("src/shell/messages/cases/case-forms.tsx", STUBS));

const tt = (zh, vars) => (vars ? zh.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh);

// ---- 样本：形状同后端 store.public_view ------------------------------------------------------

const ID_COPYRIGHT = "11111111-1111-4111-8111-111111111111";
const ID_ILLEGAL = "22222222-2222-4222-8222-222222222222";
const ID_DISMISSED = "33333333-3333-4333-8333-333333333333";
const ID_PENDING = "44444444-4444-4444-8444-444444444444";

function serverCase(over) {
  return {
    id: ID_COPYRIGHT,
    family: "com",
    source: "rights_notice",
    tier: "infringement",
    status: "open",
    queue: "judge",
    target_kind: "bay_app",
    target_ref: "app-1",
    target_snapshot: { title: "海报生成器", text: "", image_urls: [], url: null },
    reason: "",
    detail: "",
    hidden: true,
    due_at: null,
    restore_at: null,
    decision: null,
    decision_note: "",
    notice: {
      claimant_name: "王权利",
      work_description: "我的原创海报系列",
      location_urls: ["https://oceanleo.com/bay?bay=app:app-1"],
    },
    actions: ["counter_notice"],
    counter_notice_at: null,
    appeal_at: null,
    created_at: "2026-10-20T08:30:00+00:00",
    ...over,
  };
}

function sampleCases() {
  return [
    serverCase({}),
    serverCase({
      id: ID_ILLEGAL,
      source: "machine",
      tier: "illegal",
      target_kind: "game",
      target_snapshot: { title: "炸弹格阵" },
      reason: "machine:sexual",
      notice: { claimant_name: null, work_description: null, location_urls: [] },
      // 服务端对已隐藏的案件一律给 counter_notice；按 tier，违法类只能申诉。
      actions: ["counter_notice"],
    }),
    serverCase({
      id: ID_DISMISSED,
      source: "user_report",
      tier: "policy",
      status: "dismissed",
      hidden: false,
      target_kind: "im_message",
      target_snapshot: { title: "消息" },
      reason: "harassment",
      notice: {},
      actions: ["appeal"],
    }),
    serverCase({
      id: ID_PENDING,
      source: "user_report",
      tier: "illegal",
      hidden: false,
      target_kind: "game",
      target_snapshot: { title: "待处理的游戏" },
      reason: "sexual",
      notice: {},
      actions: [],
    }),
  ];
}

function install(initial = sampleCases()) {
  const db = { cases: initial };
  globalThis.__casesCalls = [];
  globalThis.__casesSettings = [];
  globalThis.__casesAuthed = (path, init, body) => {
    const method = (init && init.method) || "GET";
    if (method === "GET" && path === "/v1/moderation/my-cases") return { ok: true, data: { cases: db.cases, family: "com" } };
    const counter = /^\/v1\/moderation\/cases\/([^/]+)\/counter-notice$/.exec(path);
    if (method === "POST" && counter) {
      const row = db.cases.find((item) => item.id === decodeURIComponent(counter[1]));
      if (!row) return { ok: false, status: 404, error: "案件不存在" };
      Object.assign(row, {
        status: "awaiting_counter",
        counter_notice_at: new Date().toISOString(),
        restore_at: new Date(Date.now() + 15 * 86_400_000).toISOString(),
      });
      return { ok: true, data: { ...row, family: "com" } };
    }
    const appeal = /^\/v1\/moderation\/cases\/([^/]+)\/appeal$/.exec(path);
    if (method === "POST" && appeal) {
      const row = db.cases.find((item) => item.id === decodeURIComponent(appeal[1]));
      if (!row) return { ok: false, status: 404, error: "案件不存在" };
      row.appeal_at = new Date().toISOString();
      return { ok: true, data: { ...row, family: "com" } };
    }
    return { ok: false, status: 404, error: `HTTP 404 ${path}` };
  };
  return db;
}

// ---- 挂载与操作 --------------------------------------------------------------------------

// 等异步状态落地：整段等待放在 act 作用域里，请求回来后的 setState 才不会溢出 act（否则 React 会警告）。
const tick = (ms = 25) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

async function mount(props = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(MessagesContentCases, props));
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
  return {
    host,
    q: (selector) => host.querySelector(selector),
    all: (selector) => [...host.querySelectorAll(selector)],
    card: (id) => host.querySelector(`[data-case-id="${id}"]`),
    async click(node) {
      assert.ok(node, "要点的节点不存在");
      await act(async () => {
        node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    },
    async toggle(id) {
      await this.click(this.card(id).querySelector("[data-case-toggle]"));
    },
    async type(node, value) {
      assert.ok(node, "要填的输入框不存在");
      const proto = node instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      await act(() => {
        Object.getOwnPropertyDescriptor(proto, "value").set.call(node, value);
        node.dispatchEvent(new window.Event("input", { bubbles: true }));
      });
    },
    async submit(form) {
      assert.ok(form, "要提交的表单不存在");
      await act(async () => {
        form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 40));
      });
    },
    /** 同一棵树换 props（深链指向另一件）。 */
    async update(nextProps) {
      await act(async () => {
        root.render(React.createElement(MessagesContentCases, nextProps));
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
    },
    async unmount() {
      await act(() => {
        root.unmount();
      });
      host.remove();
    },
  };
}

const posts = () => globalThis.__casesCalls.filter((call) => call.method === "POST");
const gets = () => globalThis.__casesCalls.filter((call) => call.method === "GET");

async function fillCounter(view, form, over = {}) {
  const values = {
    statement: "这是我原创的海报，附上原始工程文件。",
    contact_email: "owner@example.com",
    signature: "李作者",
    good_faith: true,
    consent_jurisdiction: true,
    ...over,
  };
  await view.type(form.querySelector('[name="statement"]'), values.statement);
  await view.type(form.querySelector('[name="contact_email"]'), values.contact_email);
  await view.type(form.querySelector('[name="signature"]'), values.signature);
  for (const name of ["good_faith", "consent_jurisdiction"]) {
    const box = form.querySelector(`[name="${name}"]`);
    if (values[name] !== box.checked) await view.click(box);
  }
}

// ---- 1 案件模型 -------------------------------------------------------------------------------

test("normalizeCase：宽进——缺字段补空，没有 id 的当作没有，通知人联系方式根本不收", () => {
  assert.equal(normalizeCase(null), null);
  assert.equal(normalizeCase({ source: "x" }), null);
  const row = normalizeCase({
    id: ID_COPYRIGHT,
    tier: "infringement",
    status: "open",
    target_snapshot: { title: "  标题  " },
    notice: {
      claimant_name: "王权利",
      claimant_email: "secret@example.com",
      claimant_phone: "13800000000",
      location_urls: ["https://a.example/x", "", 3],
    },
    actions: ["counter_notice", 7],
  });
  assert.equal(row.title, "标题");
  assert.deepEqual(row.notice.location_urls, ["https://a.example/x"]);
  assert.deepEqual(row.actions, ["counter_notice"]);
  assert.equal(row.hidden, false);
  assert.equal(row.counter_notice_at, null);
  assert.equal(JSON.stringify(row).includes("secret@example.com"), false);
  assert.equal(JSON.stringify(row).includes("13800000000"), false);

  const bare = normalizeCase({ id: "x" });
  assert.equal(bare.title, "");
  assert.equal(bare.tier, null);
  assert.deepEqual(bare.notice, { claimant_name: "", work_description: "", location_urls: [] });

  assert.deepEqual(normalizeCases({ cases: [{ id: "a" }, { nope: 1 }, "x", { id: "b" }] }).map((r) => r.id), ["a", "b"]);
  assert.deepEqual(normalizeCases({}), []);
  assert.deepEqual(normalizeCases(null), []);
});

test("能做什么：版权类给反通知、违法 / 平台规则类给申诉；提交过、已了结、没动过内容的都不再给表单", () => {
  const row = (over) => normalizeCase(serverCase(over));
  // 版权：待处理或已下架可反通知
  assert.equal(canCounterNotice(row({ status: "open" })), true);
  assert.equal(canCounterNotice(row({ status: "taken_down" })), true);
  assert.equal(canAppeal(row({ status: "open" })), false, "版权类不走申诉");
  // 已提交 / 反通知处理中 / 已恢复 / 已驳回 / 已执行：不再给
  assert.equal(canCounterNotice(row({ counter_notice_at: "2026-10-23T00:00:00Z" })), false);
  for (const status of ["awaiting_counter", "restored", "dismissed", "executed"]) {
    assert.equal(canCounterNotice(row({ status })), false, status);
  }
  // 违法 / 平台规则：被隐藏或已下架才给申诉；只是被举报、内容原封未动不给
  assert.equal(canAppeal(row({ tier: "illegal", hidden: true })), true);
  assert.equal(canAppeal(row({ tier: "policy", status: "taken_down", hidden: false })), true);
  assert.equal(canAppeal(row({ tier: "illegal", hidden: false })), false);
  assert.equal(canAppeal(row({ tier: "illegal", hidden: true, appeal_at: "2026-10-23T00:00:00Z" })), false);
  for (const status of ["awaiting_counter", "restored", "dismissed", "executed"]) {
    assert.equal(canAppeal(row({ tier: "policy", hidden: true, status })), false, status);
  }
  assert.equal(canCounterNotice(row({ tier: "illegal", hidden: true })), false, "违法类不给反通知，哪怕服务端 actions 写了");
  // 主管部门：只读
  assert.equal(needsAction(row({ tier: "authority", status: "open", actions: ["counter_notice", "appeal"] })), false);
  // tier 缺失（举报还没过分诊）：才采信服务端 actions
  assert.equal(canCounterNotice(row({ tier: null, actions: ["counter_notice"] })), true);
  assert.equal(canAppeal(row({ tier: null, actions: ["appeal"], status: "taken_down" })), true);
  assert.equal(needsAction(row({ tier: null, actions: [] })), false);
});

test("daysUntil 向上取整且不为负；formatCaseTime 解析不了给空串；原因代码只认已知的", () => {
  const now = Date.parse("2026-10-23T00:00:00Z");
  assert.equal(daysUntil("2026-11-07T00:00:00Z", now), 15);
  assert.equal(daysUntil("2026-10-23T00:00:01Z", now), 1);
  assert.equal(daysUntil("2026-10-01T00:00:00Z", now), 0);
  assert.equal(daysUntil(null, now), null);
  assert.equal(daysUntil("不是日期", now), null);
  assert.equal(formatCaseTime("不是日期", "zh"), "");
  assert.equal(formatCaseTime(null, "zh"), "");
  assert.match(formatCaseTime("2026-10-23T10:00:00Z", "en"), /2026/);

  for (const code of ["spam", "harassment", "fraud", "illegal", "other", "fake", "offsite", "plagiarism", "sexual", "violence", "hate", "ip_infringement", "malware", "staydown"]) {
    assert.equal(reasonCodeOf(code), code);
  }
  assert.equal(reasonCodeOf("SEXUAL"), "sexual");
  assert.equal(reasonCodeOf("machine:sexual,violence"), "machine");
  assert.equal(reasonCodeOf("抄袭、盗用他人作品"), "plagiarism", "talent 举报存的是中文原文");
  assert.equal(reasonCodeOf("联调"), null, "认不出的自由文本不当代码");
  assert.equal(reasonCodeOf(""), null);
});

test("表单数据：反通知五项都必填（邮箱要像邮箱，两条声明要勾），申诉只要陈述；发出去的是去空白后的", () => {
  const ok = { statement: " 陈述 ", contact_email: " a@b.co ", good_faith: true, consent_jurisdiction: true, signature: " 李作者 " };
  assert.deepEqual(counterNoticeMissing(ok), []);
  assert.deepEqual(counterNoticeBody(ok), {
    statement: "陈述",
    contact_email: "a@b.co",
    good_faith: true,
    consent_jurisdiction: true,
    signature: "李作者",
  });
  assert.deepEqual(
    counterNoticeMissing({ statement: "", contact_email: "不是邮箱", good_faith: false, consent_jurisdiction: false, signature: "  " }),
    ["statement", "contact_email", "good_faith", "consent_jurisdiction", "signature"],
  );
  assert.deepEqual(counterNoticeMissing({ ...ok, contact_email: "a@" }), ["contact_email"]);
  assert.deepEqual(counterNoticeMissing({ ...ok, consent_jurisdiction: false }), ["consent_jurisdiction"]);
  assert.deepEqual(appealMissing({ statement: "   " }), ["statement"]);
  assert.deepEqual(appealMissing({ statement: "x" }), []);
  assert.deepEqual(appealBody({ statement: " 判错了 " }), { statement: "判错了" });
});

// ---- 2 客户端 ---------------------------------------------------------------------------------

test("客户端：三条路径与请求体；失败按状态码归类，不亮网关原话", async () => {
  const db = install();
  const listed = await client.listMyCases();
  assert.equal(listed.length, 4);
  assert.deepEqual(globalThis.__casesCalls[0], { method: "GET", path: "/v1/moderation/my-cases", body: undefined });

  const counter = await client.submitCounterNotice(ID_COPYRIGHT, counterNoticeBody({ statement: "陈述", contact_email: "a@b.co", good_faith: true, consent_jurisdiction: true, signature: "签" }));
  assert.equal(counter.status, "awaiting_counter");
  assert.equal(globalThis.__casesCalls[1].path, `/v1/moderation/cases/${ID_COPYRIGHT}/counter-notice`);
  assert.equal(globalThis.__casesCalls[1].method, "POST");
  assert.deepEqual(globalThis.__casesCalls[1].body, { statement: "陈述", contact_email: "a@b.co", good_faith: true, consent_jurisdiction: true, signature: "签" });

  const appeal = await client.submitAppeal(ID_ILLEGAL, { statement: "判错了" });
  assert.ok(appeal.appeal_at);
  assert.equal(globalThis.__casesCalls[2].path, `/v1/moderation/cases/${ID_ILLEGAL}/appeal`);
  assert.deepEqual(globalThis.__casesCalls[2].body, { statement: "判错了" });
  assert.ok(db.cases.length === 4);

  // 案件 id 进路径前要编码
  await client.submitAppeal("a/b?c", { statement: "x" }).catch(() => {});
  assert.equal(globalThis.__casesCalls[3].path, "/v1/moderation/cases/a%2Fb%3Fc/appeal");

  for (const [status, expected] of [[401, "unauthorized"], [404, "not_found"], [400, "invalid"], [422, "invalid"], [0, "network"], [500, "other"], [503, "other"]]) {
    globalThis.__casesAuthed = () => ({ ok: false, status, error: "网关原话" });
    const error = await client.listMyCases().then(() => null, (err) => err);
    assert.ok(error instanceof client.ModerationApiError, String(status));
    assert.equal(error.status, status);
    assert.equal(client.classifyModerationError(error), expected, String(status));
  }
  assert.equal(client.classifyModerationError(new Error("boom")), "other");
});

// ---- 3 名字与说明 ---------------------------------------------------------------------------------

test("种类 / 来源 / 状态 / 原因：全覆盖，退役种类名不再指代种类", () => {
  const kinds = [
    "talent_profile", "talent_service", "talent_showcase", "talent_review", "talent_message", "talent_demand", "talent_contract",
    "im_message", "im_user", "im_conversation", "game", "url", "bay_app", "bay_app_thread", "bay_lesson", "bay_bundle",
  ];
  const seen = new Set();
  for (const kind of kinds) {
    const label = labels.kindLabel(tt, kind);
    assert.ok(label && label !== "内容", `${kind} 没有专名`);
    assert.ok(!/[a-z_]{4,}/.test(label), `${kind} 亮了内部代码：${label}`);
    seen.add(label);
  }
  assert.equal(labels.kindLabel(tt, "talent_service"), "人工服务");
  assert.equal(labels.kindLabel(tt, "bay_app"), "网站与软件服务");
  assert.equal(labels.kindLabel(tt, "bay_lesson"), "课程");
  for (const retired of ["服务", "素材", "作品", "成品文件"]) {
    assert.equal(seen.has(retired), false, `退役名字「${retired}」不能再当种类名`);
  }
  assert.equal(labels.kindLabel(tt, "未知种类"), "内容", "认不出的种类写「内容」，不亮代码");

  assert.deepEqual(
    ["user_report", "rights_notice", "machine", "staydown", "authority", "operator", "x"].map((s) => labels.sourceLabel(tt, s)),
    ["举报", "权利通知", "机器检测", "机器检测", "主管部门", "人工登记", ""],
  );

  const row = (over) => normalizeCase(serverCase(over));
  assert.equal(labels.statusLabel(tt, row({ status: "taken_down" })), "已下架");
  assert.equal(labels.statusLabel(tt, row({ status: "restored" })), "已恢复");
  assert.equal(labels.statusLabel(tt, row({ status: "dismissed" })), "已驳回");
  assert.equal(labels.statusLabel(tt, row({ status: "executed" })), "已执行");
  assert.equal(labels.statusLabel(tt, row({ status: "open", hidden: true })), "已隐藏");
  assert.equal(labels.statusLabel(tt, row({ status: "open", hidden: false })), "待处理");
  const now = Date.parse("2026-10-23T00:00:00Z");
  assert.equal(labels.statusLabel(tt, row({ status: "awaiting_counter", restore_at: "2026-11-07T00:00:00Z" }), now), "反通知中 15 日后恢复");
  assert.equal(labels.statusLabel(tt, row({ status: "awaiting_counter", restore_at: "2026-10-20T00:00:00Z" }), now), "反通知中，等待恢复");
  assert.equal(labels.statusLabel(tt, row({ status: "awaiting_counter", restore_at: null }), now), "反通知中，等待恢复");

  assert.equal(labels.reasonLabel(tt, "machine:sexual"), "未通过内容安全审核");
  assert.equal(labels.reasonLabel(tt, "sexual"), "色情或低俗内容");
  assert.equal(labels.reasonLabel(tt, "staydown"), "与已下架内容重复");
  assert.equal(labels.reasonLabel(tt, "抄袭、盗用他人作品"), "抄袭、盗用他人作品");
  assert.equal(labels.reasonLabel(tt, "other"), "", "「其他」没有信息量，不写");
  assert.equal(labels.reasonLabel(tt, "联调"), "", "举报人的自由文本不亮给被举报的人");

  assert.equal(labels.failureMessage(tt, "network", "counter"), "网络不通，请稍后再试。");
  assert.equal(labels.failureMessage(tt, "invalid", "counter"), "请填完整反通知：陈述、联系邮箱、两条声明、签名");
  assert.equal(labels.failureMessage(tt, "invalid", "appeal"), "请填写申诉陈述");
  assert.equal(labels.failureMessage(tt, "other", "list"), "加载失败");
  assert.equal(labels.failureMessage(tt, "other", "counter"), "提交失败，请稍后再试。");
  assert.equal(labels.failureMessage(tt, "not_found", "appeal"), "找不到这一件处置记录。它可能已被撤销，或不属于当前账号。");
});

// ---- 4 界面：列表与展开 ------------------------------------------------------------------------------

test("首帧（还没取到）是「加载中…」，不是空列表", () => {
  const html = renderToStaticMarkup(React.createElement(MessagesContentCases, {}));
  assert.match(html, /data-messages-content-cases/);
  assert.match(html, /data-phase="loading"/);
  assert.match(html, /加载中…/);
  assert.doesNotMatch(html, /没有针对你内容的处置记录/);
});

test("列表：每件一行（种类 · 来源、标题、状态），能处理的带「需要你处理」，默认全部收起、没有任何表单", async () => {
  install();
  const view = await mount();
  assert.equal(view.q("[data-messages-content-cases]").getAttribute("data-phase"), "ready");
  assert.equal(view.all("[data-case-id]").length, 4);
  assert.match(view.q("h2").textContent, /内容处置/);
  assert.match(view.host.textContent, /这里只列出针对你内容的案件/);

  const copyright = view.card(ID_COPYRIGHT);
  assert.match(copyright.textContent, /网站与软件服务 · 权利通知/);
  assert.match(copyright.querySelector("[data-case-meta]").textContent, /^网站与软件服务 · 权利通知 · .*2026.*$/, "第一行带提出日期");
  assert.match(copyright.textContent, /海报生成器/);
  assert.match(copyright.textContent, /已隐藏/);
  assert.match(view.card(ID_ILLEGAL).textContent, /游戏 · 机器检测/);
  assert.match(view.card(ID_DISMISSED).textContent, /聊天消息 · 举报/);
  // 老网关还没给 created_at：第一行照常，只是少一项
  const legacy = normalizeCase({ ...serverCase({ id: "55555555-5555-4555-8555-555555555555" }), created_at: undefined });
  assert.equal(legacy.created_at, null);
  assert.match(view.card(ID_DISMISSED).textContent, /已驳回/);

  assert.deepEqual(
    view.all("[data-case-needs-action]").map((node) => node.closest("[data-case-id]").getAttribute("data-case-id")),
    [ID_COPYRIGHT, ID_ILLEGAL],
  );
  for (const card of view.all("[data-case-id]")) assert.equal(card.getAttribute("data-case-open"), "false");
  assert.equal(view.all("form").length, 0);
  assert.equal(view.all("[data-case-panel]").length, 0);
  // 自适应：整列、贴满高度、滚动区单独
  assert.match(view.q("[data-messages-content-cases]").className, /\bh-full\b/);
  assert.match(view.q("[data-messages-content-cases]").className, /\bmin-h-0\b/);
  assert.ok(view.q(".overflow-y-auto"));
  await view.unmount();
});

test("展开 / 收起：详情只显示通知人、作品说明、涉及地址（没有联系方式）和对内容现状的一句话；版权类只给反通知", async () => {
  install();
  const view = await mount();
  await view.toggle(ID_COPYRIGHT);
  const card = view.card(ID_COPYRIGHT);
  assert.equal(card.getAttribute("data-case-open"), "true");
  assert.equal(card.querySelector("[data-case-toggle]").getAttribute("aria-expanded"), "true");
  const panel = card.querySelector("[data-case-panel]");
  assert.match(panel.textContent, /内容已被暂时隐藏，别人现在看不到。/);
  assert.match(panel.textContent, /通知人：王权利/);
  assert.match(panel.textContent, /作品说明：我的原创海报系列/);
  assert.match(panel.textContent, /涉及地址：/);
  assert.match(panel.textContent, /https:\/\/oceanleo\.com\/bay\?bay=app:app-1/);
  assert.equal(panel.querySelector("a"), null, "权利人给的地址只当文字，不做成可点链接");
  assert.doesNotMatch(panel.textContent, /@|电话|邮箱：/);
  assert.ok(panel.querySelector('[data-case-form="counter"]'));
  assert.equal(panel.querySelector('[data-case-form="appeal"]'), null);
  // 另一件没被牵连
  assert.equal(view.card(ID_ILLEGAL).getAttribute("data-case-open"), "false");

  await view.toggle(ID_COPYRIGHT);
  assert.equal(view.card(ID_COPYRIGHT).getAttribute("data-case-open"), "false");
  assert.equal(view.card(ID_COPYRIGHT).querySelector("[data-case-panel]"), null);
  await view.unmount();
});

test("违法类（机器检测）只给申诉，并把原因代码翻成人话；已驳回的举报与没动过内容的举报不给表单", async () => {
  install();
  const view = await mount();
  await view.toggle(ID_ILLEGAL);
  const panel = view.card(ID_ILLEGAL).querySelector("[data-case-panel]");
  assert.ok(panel.querySelector('[data-case-form="appeal"]'));
  assert.equal(panel.querySelector('[data-case-form="counter"]'), null, "违法类不给反通知，哪怕服务端 actions 写了 counter_notice");
  assert.match(panel.querySelector("[data-case-reason]").textContent, /原因：未通过内容安全审核/);
  assert.doesNotMatch(panel.textContent, /machine:/);

  await view.toggle(ID_DISMISSED);
  const dismissed = view.card(ID_DISMISSED).querySelector("[data-case-panel]");
  assert.match(dismissed.textContent, /经核查没有发现问题，内容保持可见。/);
  assert.match(dismissed.querySelector("[data-case-reason]").textContent, /原因：骚扰、辱骂或威胁/);
  assert.equal(dismissed.querySelector("form"), null);

  await view.toggle(ID_PENDING);
  const pending = view.card(ID_PENDING).querySelector("[data-case-panel]");
  assert.match(pending.textContent, /平台正在处理，内容目前没有被隐藏。/);
  assert.match(pending.querySelector("[data-case-reason]").textContent, /色情或低俗内容/);
  assert.equal(pending.querySelector("form"), null);
  await view.unmount();
});

test("caseId 指名：只展开那一件并滚到可见处；指名的找不到就写明，列表照常", async () => {
  install();
  const scrolled = [];
  const original = window.HTMLElement.prototype.scrollIntoView;
  window.HTMLElement.prototype.scrollIntoView = function scrollIntoView(arg) {
    scrolled.push({ id: this.getAttribute("data-case-id"), arg });
  };
  try {
    const view = await mount({ caseId: ID_ILLEGAL });
    assert.equal(view.card(ID_ILLEGAL).getAttribute("data-case-open"), "true");
    for (const id of [ID_COPYRIGHT, ID_DISMISSED, ID_PENDING]) assert.equal(view.card(id).getAttribute("data-case-open"), "false");
    assert.ok(view.card(ID_ILLEGAL).querySelector('[data-case-form="appeal"]'), "直接就能填申诉");
    assert.deepEqual(scrolled.map((s) => s.id), [ID_ILLEGAL], "只滚一次，且只滚指名那件");
    assert.equal(view.q("[data-cases-unknown]"), null);
    // 点收起之后重取不会再把它展开 / 抢滚动
    await view.toggle(ID_ILLEGAL);
    assert.equal(view.card(ID_ILLEGAL).getAttribute("data-case-open"), "false");
    await view.unmount();

    scrolled.length = 0;
    const missing = await mount({ caseId: "99999999-9999-4999-8999-999999999999" });
    assert.ok(missing.q("[data-cases-unknown]"));
    assert.match(missing.q("[data-cases-unknown]").textContent, /找不到这一件处置记录/);
    assert.equal(missing.all("[data-case-id]").length, 4);
    assert.equal(missing.all('[data-case-open="true"]').length, 0);
    assert.equal(scrolled.length, 0);
    await missing.unmount();
  } finally {
    if (original) window.HTMLElement.prototype.scrollIntoView = original;
    else delete window.HTMLElement.prototype.scrollIntoView;
  }
});

test("已经开着时又点了一条新通知：案件是列表取过之后才有的，静默再取一次并展开它，不误报找不到；真没有就只取一次", async () => {
  const db = install();
  const view = await mount({ caseId: ID_COPYRIGHT });
  const newId = "66666666-6666-4666-8666-666666666666";
  db.cases.unshift(serverCase({ id: newId, source: "machine", tier: "illegal", target_snapshot: { title: "新来的" } }));
  const before = gets().length;
  await view.update({ caseId: newId });
  assert.equal(gets().length, before + 1, "取了一次新列表");
  assert.equal(view.q("[data-cases-unknown]"), null);
  assert.equal(view.card(newId).getAttribute("data-case-open"), "true");
  assert.equal(view.card(ID_COPYRIGHT).getAttribute("data-case-open"), "true", "原来展开的不被收起");

  const ghost = "77777777-7777-4777-8777-777777777777";
  const before2 = gets().length;
  await view.update({ caseId: ghost });
  assert.equal(gets().length, before2 + 1, "真没有的 id 再取一次就停，不循环");
  assert.ok(view.q("[data-cases-unknown]"));
  await view.unmount();
});

test("空列表、返回键、刷新键", async () => {
  install([]);
  const backs = [];
  const view = await mount({ onBack: () => backs.push(1) });
  assert.ok(view.q("[data-cases-empty]"));
  assert.match(view.q("[data-cases-empty]").textContent, /没有针对你内容的处置记录/);
  assert.equal(view.all("[data-case-id]").length, 0);
  await view.click(view.q('[data-action="back"]'));
  assert.equal(backs.length, 1);
  const before = gets().length;
  await view.click(view.q('[data-action="refresh"]'));
  assert.equal(gets().length, before + 1);
  await view.unmount();

  install([]);
  const noBack = await mount();
  assert.equal(noBack.q('[data-action="back"]'), null, "整页里没有返回键");
  await noBack.unmount();
});

// ---- 5 界面：未登录与失败 ---------------------------------------------------------------------------

test("未登录（401）：提示登录，按「去登录」打开设置里的账户页，不再发别的请求", async () => {
  install();
  globalThis.__casesAuthed = () => ({ ok: false, status: 401, error: "未登录" });
  const view = await mount();
  assert.ok(view.q("[data-cases-signed-out]"));
  assert.match(view.q("[data-cases-signed-out]").textContent, /请先登录/);
  assert.equal(view.q("[data-cases-list]"), null);
  assert.equal(view.q('[data-action="refresh"]'), null);
  await view.click(view.q('[data-action="sign-in"]'));
  assert.deepEqual(globalThis.__casesSettings, ["account"]);
  assert.equal(globalThis.__casesCalls.length, 1);

  // 登录完成（登录状态事件）→ 重取，列表出来
  install();
  await act(async () => {
    window.dispatchEvent(new window.Event("oceanleo:auth-state"));
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
  assert.equal(view.q("[data-messages-content-cases]").getAttribute("data-phase"), "ready");
  assert.equal(view.all("[data-case-id]").length, 4);
  await view.unmount();
});

test("取不到（5xx / 断网）：写「加载失败」带重试；重试成功列表出来", async () => {
  install();
  globalThis.__casesAuthed = () => ({ ok: false, status: 503, error: "暂时无法读取" });
  const view = await mount();
  assert.ok(view.q("[data-cases-error]"));
  assert.match(view.q("[data-cases-error]").textContent, /加载失败/);
  assert.doesNotMatch(view.q("[data-cases-error]").textContent, /503|暂时无法读取/);
  install();
  await view.click(view.q('[data-action="retry"]'));
  assert.equal(view.all("[data-case-id]").length, 4);
  assert.equal(view.q("[data-cases-error]"), null);

  globalThis.__casesAuthed = () => ({ ok: false, status: 0, error: "网络错误" });
  await view.click(view.q('[data-action="refresh"]'));
  // 已经有列表时手动刷新失败：落到错误页，不是白屏
  assert.ok(view.q("[data-cases-error]") || view.all("[data-case-id]").length === 4);
  await view.unmount();
});

// ---- 6 界面：反通知表单 ------------------------------------------------------------------------------

test("反通知：什么都不填就提交 → 不发请求，逐项标红并写「请填完整反通知…」；填一项消一项", async () => {
  install();
  const view = await mount();
  await view.toggle(ID_COPYRIGHT);
  const form = view.card(ID_COPYRIGHT).querySelector('[data-case-form="counter"]');
  assert.ok(form.querySelector('[name="statement"]'));
  assert.ok(form.querySelector('[name="contact_email"]'));
  assert.ok(form.querySelector('[name="good_faith"][type="checkbox"]'));
  assert.ok(form.querySelector('[name="consent_jurisdiction"][type="checkbox"]'));
  assert.ok(form.querySelector('[name="signature"]'));
  assert.match(form.textContent, /15 个自然日内平台没有进一步维持下架，内容会自动恢复/);
  assert.equal(form.querySelector("[data-case-error]"), null, "没点提交之前不预先报错");

  const before = globalThis.__casesCalls.length;
  await view.submit(form);
  assert.equal(globalThis.__casesCalls.length, before, "必填没填完不许发请求");
  assert.match(form.querySelector("[data-case-error]").textContent, /请填完整反通知：陈述、联系邮箱、两条声明、签名/);
  for (const name of ["statement", "contact_email", "good_faith", "consent_jurisdiction", "signature"]) {
    assert.equal(form.querySelector(`[name="${name}"]`).getAttribute("aria-invalid"), "true", name);
  }

  await view.type(form.querySelector('[name="statement"]'), "陈述");
  assert.equal(form.querySelector('[name="statement"]').getAttribute("aria-invalid"), "false");
  assert.equal(form.querySelector('[name="contact_email"]').getAttribute("aria-invalid"), "true");
  await view.unmount();
});

test("反通知：邮箱不像邮箱、少勾一条声明、签名只有空格，都不发请求", async () => {
  install();
  const view = await mount();
  await view.toggle(ID_COPYRIGHT);
  const form = () => view.card(ID_COPYRIGHT).querySelector('[data-case-form="counter"]');
  const before = globalThis.__casesCalls.length;

  await fillCounter(view, form(), { contact_email: "不是邮箱" });
  await view.submit(form());
  assert.equal(form().querySelector('[name="contact_email"]').getAttribute("aria-invalid"), "true");
  assert.equal(form().querySelector('[name="statement"]').getAttribute("aria-invalid"), "false");

  await view.type(form().querySelector('[name="contact_email"]'), "owner@example.com");
  await view.click(form().querySelector('[name="consent_jurisdiction"]')); // 取消勾选
  await view.submit(form());
  assert.equal(form().querySelector('[name="consent_jurisdiction"]').getAttribute("aria-invalid"), "true");
  assert.equal(form().querySelector('[name="good_faith"]').getAttribute("aria-invalid"), "false");

  await view.click(form().querySelector('[name="consent_jurisdiction"]')); // 再勾上
  await view.type(form().querySelector('[name="signature"]'), "   ");
  await view.submit(form());
  assert.equal(form().querySelector('[name="signature"]').getAttribute("aria-invalid"), "true");
  assert.equal(globalThis.__casesCalls.length, before, "整个过程一次请求都没发");
  await view.unmount();
});

test("反通知：填全后提交 → 一次 POST（路径、去空白后的请求体），随后刷新，状态变成反通知中、表单退场、出现已提交标记", async () => {
  const db = install();
  const view = await mount();
  await view.toggle(ID_COPYRIGHT);
  const form = view.card(ID_COPYRIGHT).querySelector('[data-case-form="counter"]');
  await fillCounter(view, form, { statement: "  这是我原创的海报。  ", contact_email: " owner@example.com ", signature: " 李作者 " });
  const getsBefore = gets().length;
  await view.submit(form);

  assert.equal(posts().length, 1);
  assert.equal(posts()[0].path, `/v1/moderation/cases/${ID_COPYRIGHT}/counter-notice`);
  assert.deepEqual(posts()[0].body, {
    statement: "这是我原创的海报。",
    contact_email: "owner@example.com",
    good_faith: true,
    consent_jurisdiction: true,
    signature: "李作者",
  });
  assert.equal(db.cases[0].status, "awaiting_counter");
  assert.ok(gets().length > getsBefore, "提交之后要重新取一次列表");

  const card = view.card(ID_COPYRIGHT);
  assert.match(card.querySelector("[data-case-status-label]").textContent, /反通知中 15 日后恢复/);
  assert.equal(card.querySelector("form"), null, "提交过的不再给表单");
  assert.equal(card.querySelector("[data-case-needs-action]"), null);
  assert.match(card.querySelector('[data-case-submitted="counter"]').textContent, /你已于 .*2026.* 提交反通知。/);
  assert.match(card.querySelector("[data-case-panel]").textContent, /反通知已收到。.* 前平台若没有进一步维持下架，内容会自动恢复。/);
  assert.equal(card.getAttribute("data-case-open"), "true", "提交后这一件仍展开着，用户能看到结果");
  await view.unmount();
});

test("反通知：网关失败 → 写「提交失败，请稍后再试。」，表单和已填内容留着，按钮恢复可点", async () => {
  install();
  const view = await mount();
  await view.toggle(ID_COPYRIGHT);
  const form = () => view.card(ID_COPYRIGHT).querySelector('[data-case-form="counter"]');
  await fillCounter(view, form());
  const original = globalThis.__casesAuthed;
  globalThis.__casesAuthed = (path, init, body) =>
    (init && init.method) === "POST" ? { ok: false, status: 500, error: "HTTP 500" } : original(path, init, body);
  await view.submit(form());
  assert.equal(posts().length, 1);
  assert.match(form().querySelector("[data-case-error]").textContent, /提交失败，请稍后再试。/);
  assert.doesNotMatch(form().querySelector("[data-case-error]").textContent, /500/);
  assert.equal(form().querySelector('[name="statement"]').value, "这是我原创的海报，附上原始工程文件。");
  assert.equal(form().querySelector("[data-case-submit]").disabled, false);

  globalThis.__casesAuthed = (path, init, body) =>
    (init && init.method) === "POST" ? { ok: false, status: 0, error: "网络错误" } : original(path, init, body);
  await view.submit(form());
  assert.match(form().querySelector("[data-case-error]").textContent, /网络不通，请稍后再试。/);

  globalThis.__casesAuthed = original;
  await view.submit(form());
  assert.equal(view.card(ID_COPYRIGHT).querySelector('[data-case-form="counter"]'), null, "重试成功后表单退场");
  await view.unmount();
});

// ---- 7 界面：申诉表单 --------------------------------------------------------------------------------

test("申诉：陈述为空不发请求并标红；填了就 POST /appeal，提交后表单退场、出现已提交标记", async () => {
  const db = install();
  const view = await mount();
  await view.toggle(ID_ILLEGAL);
  const form = () => view.card(ID_ILLEGAL).querySelector('[data-case-form="appeal"]');
  assert.match(form().textContent, /写清为什么你认为这次处置不对，平台会重新复核。/);

  await view.submit(form());
  assert.equal(posts().length, 0);
  assert.match(form().querySelector("[data-case-error]").textContent, /请填写申诉陈述/);
  assert.equal(form().querySelector('[name="statement"]').getAttribute("aria-invalid"), "true");

  await view.type(form().querySelector('[name="statement"]'), "   ");
  await view.submit(form());
  assert.equal(posts().length, 0, "只有空白也不行");

  await view.type(form().querySelector('[name="statement"]'), "  我的游戏没有任何不当内容。  ");
  assert.equal(form().querySelector("[data-case-error]"), null, "补上之后提示随之消失");
  const getsBefore = gets().length;
  await view.submit(form());
  assert.equal(posts().length, 1);
  assert.equal(posts()[0].path, `/v1/moderation/cases/${ID_ILLEGAL}/appeal`);
  assert.deepEqual(posts()[0].body, { statement: "我的游戏没有任何不当内容。" });
  assert.ok(db.cases[1].appeal_at);
  assert.ok(gets().length > getsBefore);

  const card = view.card(ID_ILLEGAL);
  assert.equal(card.querySelector("form"), null, "申诉过的不再给表单");
  assert.equal(card.querySelector("[data-case-needs-action]"), null);
  assert.match(card.querySelector('[data-case-submitted="appeal"]').textContent, /你已于 .*2026.* 提交申诉，平台复核后会更新这里的状态。/);
  await view.unmount();
});

test("申诉：404（案件被撤销）提示找不到；表单组件可注入 submit，提交成功把更新后的案件交给 onDone", async () => {
  const calls = [];
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(AppealForm, {
        caseId: "c-1",
        submit: async (caseId, body) => {
          calls.push({ caseId, body });
          const error = new client.ModerationApiError("x", 404);
          throw error;
        },
        onDone: () => calls.push("done"),
      }),
    );
  });
  const textarea = host.querySelector('[name="statement"]');
  await act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set.call(textarea, "理由");
    textarea.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await act(async () => {
    host.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
  assert.deepEqual(calls, [{ caseId: "c-1", body: { statement: "理由" } }]);
  assert.match(host.querySelector("[data-case-error]").textContent, /找不到这一件处置记录/);
  await act(() => {
    root.unmount();
  });

  const done = [];
  const host2 = document.createElement("div");
  document.body.appendChild(host2);
  const root2 = createRoot(host2);
  const updated = normalizeCase(serverCase({ appeal_at: "2026-10-23T00:00:00Z" }));
  await act(() => {
    root2.render(
      React.createElement(CounterNoticeForm, {
        caseId: ID_COPYRIGHT,
        submit: async () => updated,
        onDone: (value) => done.push(value),
      }),
    );
  });
  const form2 = host2.querySelector("form");
  const setv = (selector, value) => {
    const node = form2.querySelector(selector);
    const proto = node instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(node, value);
    node.dispatchEvent(new window.Event("input", { bubbles: true }));
  };
  await act(() => {
    setv('[name="statement"]', "陈述");
    setv('[name="contact_email"]', "a@b.co");
    setv('[name="signature"]', "签");
  });
  for (const name of ["good_faith", "consent_jurisdiction"]) {
    await act(() => {
      form2.querySelector(`[name="${name}"]`).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
  }
  await act(async () => {
    form2.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
  assert.deepEqual(done, [updated]);
  await act(() => {
    root2.unmount();
  });
});

// ---- 8 卖家界面与旧地址 ------------------------------------------------------------------------------

test("卖家界面「被平台隐藏」：说明改指 LeoChat 的内容处置，链接落到 /leochat?im=cases[:id]，不再用退役种类名", async () => {
  const domainStub = dataModule(`export function portalHref(path){ return "https://oceanleo.com" + path; }`);
  const formUiStub = dataModule(`
    export const BAY_FORM_DANGER_BUTTON_CLASS = ""; export const BAY_FORM_INPUT_CLASS = "";
    export const BAY_FORM_PRIMARY_BUTTON_CLASS = ""; export const BAY_FORM_SECONDARY_BUTTON_CLASS = "";
    export const BAY_FORM_TEXTAREA_CLASS = "";
  `);
  const sellerUrl = await compileModule("src/shell/bay/seller/seller-ui.tsx", {
    "../../../i18n/ui/useUI": uiStub,
    "../../../contracts/domain-family": domainStub,
    "../form/form-ui": formUiStub,
  });
  const { contentCasesHref, HiddenByPlatformNotice } = await import(sellerUrl);
  assert.equal(contentCasesHref(), "https://oceanleo.com/leochat?im=cases");
  assert.equal(contentCasesHref(null), "https://oceanleo.com/leochat?im=cases");
  assert.equal(contentCasesHref("不是案件 id"), "https://oceanleo.com/leochat?im=cases", "id 不像案件 id 就当没给");
  assert.equal(contentCasesHref(ID_COPYRIGHT), `https://oceanleo.com/leochat?im=cases:${ID_COPYRIGHT}`);

  const hidden = { id: ID_COPYRIGHT, target_kind: "talent_service", target_ref: "s1", status: "open", reason: "fake", detail: "", hidden: true, decision_note: "", actions: [] };
  const html = renderToStaticMarkup(React.createElement(HiddenByPlatformNotice, { what: "service", caseRow: hidden }));
  assert.match(html, /这项人工服务已被平台暂时隐藏，买家现在看不到。/);
  assert.match(html, /原因：虚假信息或夸大宣传/, "原因代码翻成人话");
  assert.match(html, new RegExp(`href="https://oceanleo\\.com/leochat\\?im=cases:${ID_COPYRIGHT}"`));
  assert.match(html, /在 LeoChat 的内容处置里提交反通知或申诉/);
  assert.doesNotMatch(html, /account\/content-cases|内容处理记录/);

  const noCase = renderToStaticMarkup(React.createElement(HiddenByPlatformNotice, { what: "service", caseRow: null }));
  assert.match(noCase, /原因在内容处置里。/);
  assert.match(noCase, /href="https:\/\/oceanleo\.com\/leochat\?im=cases"/);
  assert.doesNotMatch(noCase, /这项服务/);
  // 自由文本原因照旧原样写；其他两种说明不动
  const free = { ...hidden, reason: "违规广告", detail: "多次出现" };
  assert.match(renderToStaticMarkup(React.createElement(HiddenByPlatformNotice, { what: "profile", caseRow: free })), /原因：违规广告 · 多次出现/);
});

test("译文表：新增 29 句 16 语齐全、占位符不丢、非中日韩语种里没有汉字", async () => {
  const { register } = await import("node:module");
  register("./ts-extension-loader.mjs", import.meta.url);
  const { LOCALES } = await import("../src/i18n/config.ts");
  const { UI_MESSAGES } = await import("../src/i18n/ui/messages/index.ts");
  const { LBP_W09_MESSAGES } = await import("../src/i18n/ui/messages/lbp-w09-copy.ts");
  const keys = Object.keys(LBP_W09_MESSAGES.zh);
  assert.equal(keys.length, 29);
  const HAN = /[一-鿿]/;
  for (const key of keys) {
    assert.equal(LBP_W09_MESSAGES.zh[key], key, "中文站 key 等于值");
    const placeholders = [...key.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const locale of LOCALES) {
      if (locale === "zh") continue;
      const value = LBP_W09_MESSAGES[locale][key];
      assert.ok(value, `${locale} 缺译文：${key}`);
      assert.deepEqual([...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(), placeholders, `${locale} 丢了占位符：${key}`);
      if (!["zh-TW", "ja", "ko"].includes(locale)) assert.equal(HAN.test(value), false, `${locale} 里有汉字：${key}`);
      assert.equal(UI_MESSAGES[locale][key], value, `${locale} 合并后的词典里要有这一句`);
    }
  }
});
