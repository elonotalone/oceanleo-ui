// W05：门户公开主页/服务页的取数与纯展示。
// 覆盖：404/坏参数返回 null；取数不带登录、带 revalidate:300；受限领域当没有；
// delivery_days 有值才显示、null 不显示；两个组件在无 window 的 node 里能 SSR；
// 用户内容当纯文本；public-views 只导出约定名字，不拉 AppShell。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const configStub = dataModule(`export const GATEWAY_BASE = "https://gw.test";`);
const pub = await import(await compileModule("src/lib/bay/public.ts", { "../auth/config": configStub }));

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);
const viewStubs = { "../../../i18n/ui/useUI": uiStub };
const { BayProfilePublic } = await import(await compileModule("src/shell/bay/supply/BayProfilePublic.tsx", viewStubs));
const { BayServicePublic } = await import(await compileModule("src/shell/bay/supply/BayServicePublic.tsx", viewStubs));
const views = await import(await compileModule("src/shell/bay/supply/public-views.ts", viewStubs));

const html = (node) => renderToStaticMarkup(node);

function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
    return handler(url, init, calls);
  };
  return calls;
}

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

function profileRaw(extra = {}) {
  return {
    profile: {
      handle: "leo",
      display_name: "Leo",
      headline: "设计师",
      bio: "做品牌",
      rating_avg: 4.8,
      rating_count: 10,
      completed_contracts: 7,
      response_minutes: 20,
      published: true,
      ...extra.profile,
    },
    services: extra.services ?? [
      { id: "svc-1", title: "Logo", status: "published", min_price_fen: 128000, currency: "CNY", delivery_days: 3, order_count: 2 },
      { id: "svc-2", title: "海报", status: "published", price_fen: 80000, currency: "CNY", delivery_days: null },
    ],
    showcase: extra.showcase ?? [{ id: "w1", title: "案例 A", summary: "一页", source_kind: "task" }],
    reviews: extra.reviews ?? [{ id: "r1", rating: 5, body: "很好", author_role: "buyer", author: { display_name: "买家" } }],
  };
}

function serviceRaw(extra = {}) {
  return {
    service: {
      id: "svc-1",
      title: "品牌 Logo 设计",
      summary: "三版方案",
      description: "含源文件",
      category: "design",
      status: "published",
      currency: "CNY",
      order_count: 3,
      delivery_mode: "on_platform",
      regulated_domain: "none",
      tiers: [
        { tier: "basic", title: "基础", price_fen: 30000, currency: "CNY", delivery_days: 3, revisions: 1, enabled: true },
        { tier: "standard", title: "标准", price_fen: 60000, currency: "CNY", delivery_days: null, revisions: 2, enabled: true },
      ],
      addons: [],
      faq: [{ id: "f1", question: "含源文件吗", answer: "含" }],
      media: [],
      reviews: [{ id: "r1", rating: 5, body: "很好", author: { display_name: "买家" } }],
      review_summary: { rating_avg: 5, rating_count: 1 },
      seller: { handle: "leo", display_name: "Leo", rating_avg: 4.8, rating_count: 10, completed_contracts: 7 },
      ...extra,
    },
  };
}

test("公开取数：404 / 坏参数返回 null，不把故障当成没有", async () => {
  const calls = mockFetch(() => jsonResponse(404, { detail: "gone" }));
  assert.equal(await pub.fetchBayProfilePublic("leo"), null);
  assert.equal(await pub.fetchBayServicePublic("svc-1"), null);
  assert.equal(await pub.fetchBayProfilePublic("bad handle"), null);
  assert.equal(await pub.fetchBayServicePublic(""), null);
  assert.equal(calls.length, 2);
  mockFetch(() => jsonResponse(503, { detail: "down" }));
  await assert.rejects(() => pub.fetchBayProfilePublic("leo"), (error) => error instanceof pub.BayPublicFetchError && error.status === 503);
});

test("公开取数：不带登录、revalidate 300、路径编码", async () => {
  const calls = mockFetch(() => jsonResponse(200, profileRaw()));
  const data = await pub.fetchBayProfilePublic("Leo_1");
  assert.equal(data.handle, "leo");
  assert.equal(calls[0].url, "https://gw.test/v1/talent/profiles/Leo_1");
  assert.equal(calls[0].init.credentials, "omit");
  assert.equal(calls[0].init.next.revalidate, 300);
  assert.equal(calls[0].init.headers.accept, "application/json");
  assert.equal(calls[0].init.headers.authorization, undefined);

  const serviceCalls = mockFetch(() => jsonResponse(200, serviceRaw()));
  const service = await pub.fetchBayServicePublic("svc-1");
  assert.equal(service.id, "svc-1");
  assert.equal(serviceCalls[0].url, "https://gw.test/v1/talent/services/svc-1");
  assert.equal(serviceCalls[0].init.credentials, "omit");
  assert.equal(serviceCalls[0].init.next.revalidate, 300);
});

test("公开整形：未公开/被隐藏/受限领域当没有；delivery_days 取最便宜有值档", () => {
  assert.equal(pub.toBayProfilePublic(profileRaw({ profile: { handle: "leo", published: false } })), null);
  assert.equal(pub.toBayServicePublic(serviceRaw({ status: "draft" })), null);
  assert.equal(pub.toBayServicePublic(serviceRaw({ regulated_domain: "medical" })), null);
  assert.equal(pub.toBayServicePublic(serviceRaw({ regulated_domain: "legal" })), null);
  assert.equal(pub.toBayServicePublic(serviceRaw({ regulated_domain: "vet" })), null);
  const shaped = pub.toBayServicePublic(serviceRaw());
  assert.equal(shaped.delivery_days, 3);
  assert.equal(shaped.min_price_fen, 30000);
  const noDays = pub.toBayServicePublic(
    serviceRaw({
      delivery_days: null,
      tiers: [{ tier: "basic", title: "B", price_fen: 100, currency: "CNY", delivery_days: null, revisions: 1, enabled: true }],
    }),
  );
  assert.equal(noDays.delivery_days, null);
});

test("公开主页组件：无 window 能 SSR；有交期显示、null 不显示；用户内容当文本", () => {
  assert.equal(typeof globalThis.window, "undefined");
  const data = pub.toBayProfilePublic(profileRaw());
  const out = html(React.createElement(BayProfilePublic, { data }));
  assert.match(out, /data-bay-public="profile"/);
  assert.match(out, /Leo/);
  assert.match(out, /Logo/);
  assert.match(out, /3 天交付/);
  assert.match(out, /¥1,280 起/);
  assert.doesNotMatch(out.split("海报")[1] || "", /天交付/);
  const evil = pub.toBayProfilePublic(
    profileRaw({
      profile: { handle: "leo", display_name: "<img src=x onerror=alert(1)>", published: true },
      services: [],
      showcase: [],
      reviews: [],
    }),
  );
  const escaped = html(React.createElement(BayProfilePublic, { data: evil }));
  assert.ok(escaped.includes("&lt;img src=x"));
  assert.ok(!escaped.includes("<img src=x"));
});

test("公开服务组件：无 window 能 SSR；delivery_days null 不显示天数", () => {
  assert.equal(typeof globalThis.window, "undefined");
  const withDays = pub.toBayServicePublic(serviceRaw());
  const shown = html(React.createElement(BayServicePublic, { data: withDays }));
  assert.match(shown, /data-bay-public="service"/);
  assert.match(shown, /品牌 Logo 设计/);
  assert.match(shown, /3 天交付/);
  assert.match(shown, /含源文件吗/);
  const noDays = pub.toBayServicePublic(
    serviceRaw({
      delivery_days: null,
      tiers: [{ tier: "basic", title: "B", price_fen: 100, currency: "CNY", delivery_days: null, revisions: 1, enabled: true }],
    }),
  );
  const hidden = html(React.createElement(BayServicePublic, { data: noDays }));
  assert.doesNotMatch(hidden, /天交付/);
  assert.match(hidden, /改稿 1 次/);
});

test("public-views：只导出两个组件和数据类型用到的名字；源码不碰 window / AppShell", () => {
  assert.equal(typeof views.BayProfilePublic, "function");
  assert.equal(typeof views.BayServicePublic, "function");
  assert.deepEqual(
    Object.keys(views).sort(),
    ["BayProfilePublic", "BayServicePublic"].sort(),
  );
  for (const rel of ["src/shell/bay/supply/public-views.ts", "src/shell/bay/supply/BayProfilePublic.tsx", "src/shell/bay/supply/BayServicePublic.tsx", "src/shell/bay/supply/public-text.ts"]) {
    const text = readFileSync(path.join(REPO, rel), "utf8");
    assert.doesNotMatch(text, /dangerouslySetInnerHTML|\.innerHTML/);
    assert.doesNotMatch(text, /from ["'][^"']*(bay-state|AppShell|lib\/bay\/http)["']/);
    assert.doesNotMatch(text, /\bwindow\./);
    assert.doesNotMatch(text, /\bdocument\./);
  }
});
