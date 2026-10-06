// W04：信息流里的需求卡与求助卡、类目只列交付型、默认类目按站。
import assert from "node:assert/strict";
import test from "node:test";

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);
const httpStub = dataModule(`
  export class BayApiError extends Error {}
  export async function bayGet(){ throw new Error("network is stubbed"); }
  export async function bayPost(){ throw new Error("network is stubbed"); }
  export async function bayPatch(){ throw new Error("network is stubbed"); }
  export async function bayDelete(){ throw new Error("network is stubbed"); }
`);
const agentStub = dataModule(`export async function authed(){ return { ok: false, status: 401 }; }`);

const stubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/bay/http": httpStub,
  "../../../lib/agent": agentStub,
};
const cats = await import(await compileModule("src/shell/bay/needs/need-categories.ts", stubs));
const cards = await import(await compileModule("src/shell/bay/needs/NeedCards.tsx", stubs));

const CATEGORIES = {
  items: [],
  flat_items: [
    { slug: "design", name_zh: "设计与视觉", catalog_kind: "delivery", regulated_domain: "none", position: 10, published: true },
    { slug: "doc", name_zh: "文档与表格", catalog_kind: "delivery", regulated_domain: "none", position: 50, published: true },
    { slug: "other", name_zh: "其他", catalog_kind: "delivery", regulated_domain: "none", position: 160, published: true },
    { slug: "consult-med", name_zh: "医疗答疑", catalog_kind: "consult", regulated_domain: "medical", position: 1000, published: true },
    { slug: "consult-career", name_zh: "职业咨询", catalog_kind: "consult", regulated_domain: "career", position: 1100, published: true },
  ],
  total: 5,
  site_defaults: { ppt: "doc", design: "design", oceanleo: null, chat: "other", ghost: "consult-med" },
};

function item(extra = {}) {
  return {
    kind: "demand",
    id: "d1",
    title: "做一份路演稿",
    summary: "十页以内，要有财务预测",
    category: "doc",
    created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    posted_site: "ppt",
    handling_site: "ppt",
    price: { min_fen: 50000, max_fen: 100000, unit: null, currency: "CNY" },
    author: { user_id: "u1", handle: "leo", display_name: "Leo", avatar_url: null, verified_level: 0, rating_avg: null, rating_count: 0 },
    stats: { proposal_count: 3 },
    status: "open",
    deadline_at: null,
    cover_url: null,
    has_attached_work: false,
    ...extra,
  };
}

test("类目只列交付型：答疑类目（含医疗）一律不出现", () => {
  const slugs = cats.deliveryCategories(CATEGORIES).map((row) => row.slug);
  assert.deepEqual(slugs, ["design", "doc", "other"]);
});

test("默认类目按站读 site_defaults；门户为空；指向答疑类目的默认值不认", () => {
  assert.equal(cats.defaultNeedCategory("ppt", CATEGORIES), "doc");
  assert.equal(cats.defaultNeedCategory("design", CATEGORIES), "design");
  assert.equal(cats.defaultNeedCategory("oceanleo", CATEGORIES), null);
  assert.equal(cats.defaultNeedCategory("ghost", CATEGORIES), null);
  assert.equal(cats.defaultNeedCategory("unknown-site", CATEGORIES), null);
  assert.equal(cats.defaultNeedCategory("ppt", null), null);
});

test("需求卡：标题、摘要、类目、预算、报价数、发布者、发布时间", () => {
  cats.resetNeedCategoriesForTests(CATEGORIES);
  const html = renderToStaticMarkup(React.createElement(cards.DemandCard, { item: item(), onOpen() {} }));
  assert.match(html, /data-bay-card="demand"/);
  assert.match(html, /做一份路演稿/);
  assert.match(html, /十页以内/);
  assert.match(html, /文档与表格/);
  assert.match(html, /3 份报价/);
  assert.match(html, /Leo/);
  assert.match(html, /5 分钟前/);
  assert.match(html, /500/);
  assert.doesNotMatch(html, /附有作品/);
});

test("需求卡：附有作品时有标记；预算面议；没有名字时不露 uuid", () => {
  const html = renderToStaticMarkup(
    React.createElement(cards.DemandCard, {
      item: item({ has_attached_work: true, price: null, author: { user_id: "u-uuid", handle: null, display_name: "", avatar_url: null, verified_level: 0, rating_avg: null, rating_count: 0 } }),
      onOpen() {},
    }),
  );
  assert.match(html, /附有作品/);
  assert.match(html, /预算面议/);
  assert.match(html, /OceanLeo 用户/);
  assert.doesNotMatch(html, /u-uuid/);
});

test("求助卡：状态、类目、附有作品；用户文字按纯文本出", () => {
  const html = renderToStaticMarkup(
    React.createElement(cards.HelpRequestCard, {
      item: item({ kind: "help", title: "<img src=x onerror=alert(1)>", status: "open", category: "design", has_attached_work: true }),
      onOpen() {},
    }),
  );
  assert.match(html, /data-bay-card="help"/);
  assert.match(html, /等人接住/);
  assert.match(html, /设计与视觉/);
  assert.match(html, /附有作品/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});

test("needs 目录与 lib 里没有 dangerouslySetInnerHTML / innerHTML", () => {
  const root = fileURLToPath(new URL("../src/", import.meta.url));
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name)) files.push(path);
    }
  };
  walk(join(root, "shell/bay/needs"));
  files.push(join(root, "lib/bay/demands.ts"), join(root, "lib/bay/handoffs.ts"));
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /dangerouslySetInnerHTML|innerHTML/, file);
  }
});
