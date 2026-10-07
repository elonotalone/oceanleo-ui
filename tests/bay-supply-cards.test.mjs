// W05：信息流里的服务卡与答疑卡。
// 覆盖：价格/交期/评分的展示、用户内容当纯文本、封面只认 http(s)、受限领域答疑不渲染；
// 以及 W05 的目录里没有 dangerouslySetInnerHTML / innerHTML。
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);
const httpStub = dataModule(`
  export class BayApiError extends Error {}
  const no = async () => { throw new Error("network is stubbed"); };
  export const bayGet = no, bayPost = no, bayPatch = no, bayDelete = no;
`);
const stateStub = dataModule(`
  export function openBay(){}
  export function requireBayLogin(){ return true; }
  export function bayBack(){}
`);
const authStub = dataModule(`export async function getUserId(){ return null; }`);
const dealStub = dataModule(`export async function openTradeThread(){} export function DealConversationView(){ return null; }`);
const settingsStub = dataModule(`export async function ensureBayTerms(){ return true; }`);
const paymentsStub = dataModule(`
  export async function fetchBayPaymentConfig(){ return { enabled: false, buyer_ready: false, seller_ready: false, currency: "usd" }; }
  export async function startBayPayment(){ throw new Error("must not pay in tests"); }
`);
const stubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/bay/http": httpStub,
  "../../../lib/bay/payments": paymentsStub,
  "../../../lib/auth/client": authStub,
  "../shell/bay-state": stateStub,
  "../deal": dealStub,
  "../settings": settingsStub,
  "../shell/BayMine": dataModule(`export function BaySignInPrompt(){ return null; } export function BayMine(){ return null; }`),
  "./ProfilePane": dataModule(`export function ProfilePane(){} export function ProfileDetailView(){}`),
};
const { ServiceCard } = await import(await compileModule("src/shell/bay/supply/ServiceCard.tsx", stubs));
const { ConsultCard } = await import(await compileModule("src/shell/bay/supply/ConsultCard.tsx", stubs));
const supply = await import(await compileModule("src/shell/bay/supply/index.ts", stubs));

const html = (node) => renderToStaticMarkup(node);

function item(extra = {}) {
  return {
    kind: "service",
    id: "svc-1",
    title: "品牌 Logo 设计",
    summary: "三版方案，含源文件",
    category: "design",
    created_at: "2026-10-06T10:00:00Z",
    posted_site: "design",
    handling_site: "design",
    price: { min_fen: 128000, max_fen: 300000, unit: "project", currency: "CNY" },
    author: { user_id: "u1", handle: "leo", display_name: "Leo", avatar_url: null, verified_level: 0, rating_avg: 4.86, rating_count: 12 },
    stats: { order_count: 3 },
    status: "published",
    deadline_at: null,
    cover_url: "https://cdn.example/cover.png",
    has_attached_work: false,
    ...extra,
  };
}

test("服务卡：封面、标题、起价、几天交付、评分、卖家", () => {
  const out = html(React.createElement(ServiceCard, { item: item({ delivery_days: 3 }), onOpen() {} }));
  assert.match(out, /data-bay-card="service"/);
  assert.match(out, /品牌 Logo 设计/);
  assert.match(out, /¥1,280 起/);
  assert.match(out, /3 天交付/);
  assert.match(out, /4\.9 分 · 12 条评价/);
  assert.match(out, /3 份订单/);
  assert.match(out, /src="https:\/\/cdn\.example\/cover\.png"/);
  assert.match(out, /data-bay-seller[^>]*>Leo</);
});

test("服务卡：没交期字段不编造；delivery_days 为 null 不显示天数；没评价说暂无评价；免费与面议", () => {
  const out = html(React.createElement(ServiceCard, { item: item({ author: { ...item().author, rating_count: 0 } }), onOpen() {} }));
  assert.doesNotMatch(out, /天交付/);
  assert.match(out, /暂无评价/);
  assert.doesNotMatch(html(React.createElement(ServiceCard, { item: item({ delivery_days: null }), onOpen() {} })), /天交付/);
  assert.match(html(React.createElement(ServiceCard, { item: item({ price: { min_fen: 0, max_fen: 0, unit: null, currency: "CNY" } }), onOpen() {} })), /免费/);
  assert.match(html(React.createElement(ServiceCard, { item: item({ price: null }), onOpen() {} })), /面议/);
});

test("服务卡与答疑卡：整行是一个按钮，点整张卡打开", () => {
  const opened = [];
  const service = html(React.createElement(ServiceCard, { item: item({ delivery_days: 3 }), onOpen() { opened.push("service"); } }));
  assert.match(service, /<button[^>]*data-bay-card="service"/);
  assert.equal((service.match(/<button/g) || []).length, 1);
  const consultItem = item({ kind: "consult", id: "c1", price: { min_fen: 20000, max_fen: null, unit: "session", currency: "CNY" }, cover_url: null });
  const consult = html(React.createElement(ConsultCard, { item: consultItem, onOpen() { opened.push("consult"); } }));
  assert.match(consult, /<button[^>]*data-bay-card="consult"/);
  assert.equal((consult.match(/<button/g) || []).length, 1);
});

test("服务卡：用户内容当纯文本，封面只认 http(s)", () => {
  const evil = "<img src=x onerror=alert(1)>";
  const out = html(React.createElement(ServiceCard, { item: item({ title: evil, summary: evil, cover_url: "javascript:alert(1)" }), onOpen() {} }));
  assert.ok(!out.includes("<img src=x"), "标题不能被当成 HTML");
  assert.ok(out.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.doesNotMatch(out, /javascript:/);
  assert.doesNotMatch(out, /<img/);
});

test("答疑卡：价格按次/按小时；受限领域（医疗、法律、宠物医疗）不渲染", () => {
  const consult = item({ kind: "consult", id: "c1", price: { min_fen: 20000, max_fen: null, unit: "session", currency: "CNY" }, cover_url: null });
  const out = html(React.createElement(ConsultCard, { item: consult, onOpen() {} }));
  assert.match(out, /data-bay-card="consult"/);
  assert.match(out, /¥200 \/ 每次/);
  assert.match(out, /查看与预约/);
  assert.match(html(React.createElement(ConsultCard, { item: { ...consult, price: { ...consult.price, unit: "hour" } }, onOpen() {} })), /\/ 每小时/);
  for (const domain of ["medical", "legal", "vet"]) {
    assert.equal(html(React.createElement(ConsultCard, { item: { ...consult, regulated_domain: domain }, onOpen() {} })), "");
    assert.equal(html(React.createElement(ServiceCard, { item: { ...consult, kind: "service", regulated_domain: domain }, onOpen() {} })), "");
  }
  assert.notEqual(html(React.createElement(ConsultCard, { item: { ...consult, regulated_domain: "tax" }, onOpen() {} })), "");
});

test("出口：supply 的 index.ts 导出契约里的全部名字", () => {
  for (const name of ["ServiceCard", "ConsultCard", "ServicePane", "ConsultPane", "ProfilePane", "CheckoutPane", "BayProfilePublic", "BayServicePublic"]) {
    assert.equal(typeof supply[name], "function", name);
  }
});

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

test("W05 的目录里没有 dangerouslySetInnerHTML / innerHTML", () => {
  const files = [
    ...walk(path.join(REPO, "src/shell/bay/supply")),
    ...["services", "directory", "consults", "favorites", "reputation", "checkout", "public"].map((name) => path.join(REPO, `src/lib/bay/${name}.ts`)),
  ];
  assert.ok(files.length >= 8);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /dangerouslySetInnerHTML|innerHTML/, path.relative(REPO, file));
  }
});
