// LeoBay 第二波 W3：数字商品卡的角标与免费；详情不出档位表，出按类型的交付与自定义条款；免费获取。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://design.oceanleo.com/bay" });
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

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
const stubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/bay/http": httpStub,
  "../../../lib/auth/client": authStub,
  "../shell/bay-state": stateStub,
  "../deal": dealStub,
  "../form/BayTypedPreview": dataModule(`export function BayTypedPreview(){ return null; }`),
  "../form/BayImageGallery": dataModule(`export function BayImageStage(){ return null; } export function BayImageGallery(){ return null; }`),
  "../auth/config": dataModule(`export const GATEWAY_BASE = "https://api.example.test";`),
  "../../../lib/database": dataModule(`export async function uploadFile(){ return { ok: true, data: { file: { url: "https://cdn.example.com/cover.png" } } }; }`),
  "../../../contracts/domain-family": dataModule(`export function currentDomainFamily(){ return "com"; }`),
  "../../artifact-client": dataModule(`export async function getCurrentArtifactItem(){ return { ok: false }; }`),
  "../../library-viewers": dataModule(`export function LibraryItemViewer(){ return null; }`),
};
const { ServiceCard } = await import(await compileModule("src/shell/bay/supply/ServiceCard.tsx", stubs));
const { ServiceDetailView } = await import(await compileModule("src/shell/bay/supply/ServicePane.tsx", stubs));

function item(extra = {}) {
  return {
    kind: "service",
    id: "svc-1",
    title: "一套图标",
    summary: "",
    category: "design",
    created_at: "2026-10-06T10:00:00Z",
    posted_site: "design",
    handling_site: "design",
    price: { min_fen: 0, max_fen: 0, unit: null, currency: "CNY" },
    author: {
      user_id: "u1",
      handle: "oceanleo",
      display_name: "OceanLeo",
      avatar_url: null,
      verified_level: 0,
      rating_avg: null,
      rating_count: 0,
      official: true,
    },
    stats: { order_count: 0 },
    status: "published",
    deadline_at: null,
    cover_url: null,
    has_attached_work: false,
    listing_kind: "digital",
    ...extra,
  };
}

function digitalService(extra = {}) {
  return {
    id: "svc-d",
    user_id: "seller-1",
    title: "一套图标",
    summary: "",
    description: "",
    category: "design",
    cover_url: null,
    engagement_kind: "fixed",
    price_fen: 0,
    price_unit: "project",
    delivery_days: 3,
    status: "published",
    listing_kind: "digital",
    license: "personal",
    view_count: 0,
    order_count: 0,
    tags: [],
    currency: "CNY",
    tiers: [
      { id: "t1", service_id: "svc-d", tier: "basic", title: "基础", description: "", price_fen: 0, delivery_days: 3, revisions: 0, features: [], enabled: true },
    ],
    addons: [{ id: "a1", service_id: "svc-d", title: "加急", description: "", price_fen: 5000, extra_days: 1, enabled: true }],
    faq: [],
    media: [],
    reviews: [],
    seller: { user_id: "seller-1", handle: "leo", display_name: "Leo", avatar_url: null },
    ...extra,
  };
}

const html = (node) => renderToStaticMarkup(node);

test("数字商品卡：角标是数字商品，价格为 0 写免费，官方标在名字后面", () => {
  const out = html(React.createElement(ServiceCard, { item: item(), onOpen() {} }));
  assert.match(out, /数字商品/);
  assert.match(out, /免费/);
  assert.match(out, /data-bay-kind="digital"/);
  assert.match(out, /data-bay-official[^>]*>官方</);
  assert.doesNotMatch(out, />服务</);
});

test("数字商品详情：不出档位表与加购，出立即交付，不出授权罐头句，免费时按钮是免费获取", () => {
  const out = html(React.createElement(ServiceDetailView, { service: digitalService(), viewerId: "buyer-1", layout: "docked" }));
  assert.doesNotMatch(out, /选择档位/);
  assert.doesNotMatch(out, /data-bay-tier=/);
  assert.doesNotMatch(out, /data-bay-addon=/);
  assert.doesNotMatch(out, /天交付/);
  assert.match(out, /data-bay-digital-terms/);
  assert.match(out, /付款后立即交付/);
  assert.doesNotMatch(out, /授权范围/);
  assert.doesNotMatch(out, /个人使用/);
  assert.doesNotMatch(out, /可商用/);
  assert.doesNotMatch(out, /已交付的数字商品不退款/);
  assert.doesNotMatch(out, /不得转售原文件/);
  assert.doesNotMatch(out, /data-bay-custom-terms/);
  assert.doesNotMatch(out, /data-bay-deadline/);
  assert.match(out, /data-bay-action="claim"/);
  assert.match(out, /免费获取/);
  assert.doesNotMatch(out, /立即下单/);
});

test("数字商品详情：自定义条款原样出现，有截止日期就写出", () => {
  const out = html(
    React.createElement(ServiceDetailView, {
      service: digitalService({ custom_terms: "只给甲方用\n不得外传", deadline_at: "2026-12-01T23:59:59Z" }),
      viewerId: "buyer-1",
      layout: "docked",
    }),
  );
  assert.match(out, /data-bay-custom-terms/);
  assert.match(out, /只给甲方用/);
  assert.match(out, /不得外传/);
  assert.match(out, /data-bay-deadline/);
  assert.match(out, /2026-12-01 截止/);
  assert.doesNotMatch(out, /授权范围/);
  assert.doesNotMatch(out, /个人使用/);
});
