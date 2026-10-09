// LeoBay 第四波 W3：类目按站——站点图标优先、34 个交付类目、站默认类目、产品名不翻译。
import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const httpStub = dataModule(`
  export class BayApiError extends Error {}
  export async function bayGet(){ throw new Error("network is stubbed"); }
`);
const uiStub = dataModule(`
  export function useUI(){
    const locale = globalThis.__bay5Locale || "zh";
    return (zh) => {
      if (!String(locale).startsWith("zh") && zh === "其他") return "Other";
      return zh;
    };
  }
`);
const localeStub = dataModule(`export function useLocale(){ return globalThis.__bay5Locale || "zh"; }`);
const cardStub = dataModule(`
  export function DemandCard(){ return null; }
  export function HelpRequestCard(){ return null; }
  export function ConsultCard(){ return null; }
  export function ServiceCard(){ return null; }
`);
const stateStub = dataModule(`
  export function openBay(){}
  export function requireBayLogin(){ return true; }
  export function setBayFilter(){}
  export function useBaySignedIn(){ return false; }
`);
const dataStub = dataModule(`
  export function useBayFeed(){ return { items: [], loading: false, loaded: true, error: null, hasMore: false, loadMore(){}, retry(){} }; }
  export function useBayCategories(){ return { categories: [], loading: false, failed: false }; }
`);

const { BayCategoryIcon } = await import(await compileModule("src/shell/bay/shell/bay-icons.tsx"));
const categoriesMod = await import(
  await compileModule("src/lib/bay/categories.ts", { "./http": httpStub })
);
const needsMod = await import(
  await compileModule("src/shell/bay/needs/need-categories.ts", {
    "../../../lib/bay/http": httpStub,
    "../../../i18n/ui/useUI": uiStub,
  })
);
const { useBayCategoryName } = await import(
  await compileModule("src/shell/bay/shell/BayList.tsx", {
    "next-intl": localeStub,
    "../../../i18n/ui/useUI": uiStub,
    "../needs": cardStub,
    "../supply": cardStub,
    "./bay-state": stateStub,
    "./use-bay-data": dataStub,
  })
);

const DELIVERY = [
  ["agent", "LeoAgent"],
  ["website", "Website"],
  ["prompt", "LeoPrompt"],
  ["ecommerce", "LeoStudio"],
  ["ppt", "LeoSlides"],
  ["excel", "LeoSheet"],
  ["word", "LeoDoc"],
  ["converter", "LeoConvert"],
  ["aihuman", "LeoHuman"],
  ["image", "LeoImage"],
  ["video", "LeoVideo"],
  ["resume", "LeoResume"],
  ["bizdev", "LeoBizDev"],
  ["logo", "LeoLogo"],
  ["interior", "LeoInterior"],
  ["chat", "LeoChat"],
  ["threed", "Leo3D"],
  ["music", "LeoMusic"],
  ["meeting", "LeoMeeting"],
  ["paper", "LeoPaper"],
  ["notebook", "LeoNote"],
  ["law", "LeoLaw"],
  ["study", "LeoStudy"],
  ["edu", "LeoEdu"],
  ["novel", "LeoNovel"],
  ["script", "LeoScript"],
  ["design", "LeoDesign"],
  ["make", "LeoMake"],
  ["search", "LeoSearch"],
  ["finance", "LeoFinance"],
  ["med", "LeoMed"],
  ["travel", "LeoTravel"],
  ["game", "LeoPlay"],
  ["other", "其他"],
];

function deliveryRow([slug, name], index) {
  return {
    slug,
    parent_slug: null,
    name_zh: slug === "other" ? "其他" : name,
    name_en: slug === "other" ? "Other" : name,
    summary: null,
    icon: slug === "other" ? "dots" : slug,
    position: (index + 1) * 10,
    published: true,
    catalog_kind: "delivery",
    regulated_domain: "none",
    main_site: slug === "other" ? "oceanleo" : slug,
  };
}

const consultRows = [
  {
    slug: "c_med_report",
    parent_slug: null,
    name_zh: "体检报告",
    name_en: "Medical report",
    summary: null,
    icon: "advice",
    position: 5,
    published: true,
    catalog_kind: "consult",
    regulated_domain: "medical",
    main_site: null,
  },
  {
    slug: "c_law_case",
    parent_slug: null,
    name_zh: "案例检索",
    name_en: "Case search",
    summary: null,
    icon: "advice",
    position: 7,
    published: true,
    catalog_kind: "consult",
    regulated_domain: "legal",
    main_site: null,
  },
  {
    slug: "c_tax",
    parent_slug: null,
    name_zh: "财税",
    name_en: "Tax",
    summary: null,
    icon: "advice",
    position: 9,
    published: true,
    catalog_kind: "consult",
    regulated_domain: "tax",
    main_site: null,
  },
];

const siteDefaults = { aitools: "other", asset: "other", oceanleo: null };
for (const [slug] of DELIVERY) {
  if (slug !== "other") siteDefaults[slug] = slug;
}

const SITE_RESPONSE = {
  items: [],
  flat_items: [...consultRows, ...DELIVERY.map(deliveryRow).reverse()],
  total: DELIVERY.length + consultRows.length,
  site_defaults: siteDefaults,
};

function iconHtml(name) {
  return renderToStaticMarkup(React.createElement(BayCategoryIcon, { name }));
}

test("BayCategoryIcon：站 key 画站点图标；dots / advice / palette 走旧图标；认不出回落 dots", () => {
  for (const name of ["ppt", "music", "image"]) {
    const html = iconHtml(name);
    assert.match(html, new RegExp(`data-bay-category-icon="${name}"`));
    assert.match(html, /<svg/);
  }
  for (const name of ["dots", "advice", "palette"]) {
    const html = iconHtml(name);
    assert.equal(html.includes("data-bay-category-icon"), false, name);
    assert.match(html, /^<svg/);
  }
  assert.equal(iconHtml("不存在"), iconHtml("dots"));
});

test("deliveryCategories：34 个交付类目按 position 排，不含答疑", () => {
  const rows = categoriesMod.deliveryCategories(SITE_RESPONSE);
  assert.equal(rows.length, 34);
  assert.deepEqual(
    rows.map((row) => row.slug),
    DELIVERY.map(([slug]) => slug),
  );
  assert.equal(
    rows.some((row) => row.catalog_kind === "consult"),
    false,
  );
});

test("siteDefaultCategory：music→music，aitools→other，oceanleo 与不认识的站→null", () => {
  assert.equal(categoriesMod.siteDefaultCategory(SITE_RESPONSE, "music"), "music");
  assert.equal(categoriesMod.siteDefaultCategory(SITE_RESPONSE, "aitools"), "other");
  assert.equal(categoriesMod.siteDefaultCategory(SITE_RESPONSE, "oceanleo"), null);
  assert.equal(categoriesMod.siteDefaultCategory(SITE_RESPONSE, "nosuchsite"), null);
});

test("needCategories：34 个都在（含 law、med），答疑领域不在", () => {
  const rows = needsMod.needCategories(SITE_RESPONSE);
  const slugs = rows.map((row) => row.slug);
  assert.equal(rows.length, 34);
  assert.ok(slugs.includes("law"));
  assert.ok(slugs.includes("med"));
  assert.equal(slugs.includes("c_med_report"), false);
  assert.equal(slugs.includes("c_law_case"), false);
  assert.equal(needsMod.isNeedCategory("music", SITE_RESPONSE), true);
  assert.equal(needsMod.defaultNeedCategory("music", SITE_RESPONSE), "music");
});

test("useBayCategoryName：产品名中英文都是 LeoSlides；「其他」英文走词典", () => {
  function Probe({ category }) {
    const name = useBayCategoryName();
    return React.createElement("span", { "data-name": name(category) });
  }
  const slides = { name_zh: "LeoSlides", name_en: "LeoSlides", slug: "ppt" };
  const other = { name_zh: "其他", name_en: "Other", slug: "other" };

  globalThis.__bay5Locale = "zh";
  assert.match(renderToStaticMarkup(React.createElement(Probe, { category: slides })), /data-name="LeoSlides"/);
  assert.match(renderToStaticMarkup(React.createElement(Probe, { category: other })), /data-name="其他"/);

  globalThis.__bay5Locale = "en";
  assert.match(renderToStaticMarkup(React.createElement(Probe, { category: slides })), /data-name="LeoSlides"/);
  assert.match(renderToStaticMarkup(React.createElement(Probe, { category: other })), /data-name="Other"/);
});
