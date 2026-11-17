import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { UI_MESSAGES } from "../src/i18n/ui/messages/index.ts";
import { LOCALES } from "../src/i18n/config.ts";
import * as taxonomy from "../src/shell/bay/shell/material-taxonomy.ts";

export const fixture = { version: 1, shelves: ["deck", "design", "document", "sheet", "website", "game", "video", "model_3d", "audio"].map((id) => ({
  id, labels: { zh: id === "sheet" ? "Sheet" : id, en: id }, artifactTypes: id === "document" ? ["document", "pdf"] : [id],
  categories: [{ id: `${id}-category`, labels: { zh: "分类", en: "Category" }, contentTypes: [{ id: `${id}-content`, labels: { zh: "内容", en: "Content" } }] }],
})), tagVocabularies: { industry: [{ id: "education", labels: { zh: "教育", en: "Education" } }], style: [{ id: "minimal", labels: { zh: "简约", en: "Minimal" } }] } };
const source = await compileModule("src/shell/bay/shell/material-shelf-client.ts", {
  "../../../lib/bay/http": dataModule("export async function bayGet(path,options){return globalThis.__taxonomyGet(path,options);}"),
  "../../material-library-template-source": dataModule("export function normalizeTemplateMaterial(row){return row.id && row.artifactType ? row : null;}"),
  "../asset/bay-template-shelf": dataModule("export function templateMaterialToBayAsset(row,type){return {...row,id:'template-material:'+row.id,type};}"),
});
const client = await import(source);
const signal = () => new AbortController().signal;

test("navigation comes from validated API data, including empty categories and video", () => {
  const parsed = taxonomy.parseMaterialTaxonomy(fixture);
  assert.deepEqual(parsed.shelves.map((row) => row.id), ["deck", "design", "document", "sheet", "website", "game", "video", "model_3d", "audio"]);
  assert.deepEqual(parsed.shelves.find((row) => row.id === "document").artifactTypes, ["document", "pdf"]);
  assert.throws(() => taxonomy.parseMaterialTaxonomy({ shelves: [] }));
  assert.throws(() => taxonomy.parseMaterialTaxonomy({ ...fixture, shelves: [fixture.shelves[0], fixture.shelves[0]] }));
  assert.equal(taxonomy.materialLabel({ id: "x", labels: { zh: "演示", en: "Presentations" } }, "de"), "Presentations");
});

test("category, content, document format and cross tags round-trip without disturbing detail routing", () => {
  const shelf = fixture.shelves.find((row) => row.id === "document");
  const filters = { category: "document-category", contentType: "document-content", format: "pdf", tags: { industry: ["education"], style: ["minimal"] } };
  const search = taxonomy.materialSearch("?asset=template:a&kind=asset&view=owned&zone=stocked", "document", filters);
  assert.deepEqual(taxonomy.readMaterialFilters(search, shelf, fixture), filters);
  assert.equal(new URLSearchParams(search).get("asset"), "template:a");
  assert.equal(new URLSearchParams(search).has("view"), false);
  assert.equal(new URLSearchParams(search).has("zone"), false);
  assert.deepEqual(taxonomy.readMaterialFilters("?cat=foreign&contentType=foreign&format=exe&tag.style=foreign", shelf, fixture), taxonomy.emptyMaterialFilters());
  const cleared = taxonomy.materialSearch(search, "sheet", taxonomy.emptyMaterialFilters());
  for (const key of ["cat", "contentType", "format", "tag.style", "tag.industry"]) assert.equal(new URLSearchParams(cleared).has(key), false);
});

test("official and seller queries share taxonomy filters and preserve marketplace category meaning", () => {
  const request = { siteKey: "oceanleo", shelfType: "document", limit: 30, q: "report", filters: {
    category: "document-category", contentType: "document-content", format: "pdf", tags: { industry: ["education"] },
  } };
  const official = new URL(client.materialShelfPath(request, "official", 30), "https://example.test");
  const seller = new URL(client.materialShelfPath(request, "seller", "cursor"), "https://example.test");
  assert.equal(official.searchParams.get("category"), "document-category");
  assert.equal(seller.searchParams.get("materialCategory"), "document-category");
  assert.equal(seller.searchParams.has("category"), false);
  for (const url of [official, seller]) {
    assert.equal(url.searchParams.get("shelfType"), "document");
    assert.equal(url.searchParams.get("artifactType"), "pdf");
    assert.deepEqual(JSON.parse(url.searchParams.get("tags")), { industry: ["education"] });
    assert.equal(url.searchParams.get("q"), "report");
    assert.equal(url.searchParams.has("siteKey"), false);
  }
  assert.equal(official.searchParams.get("offset"), "30");
  assert.equal(seller.searchParams.get("cursor"), "cursor");
  const scoped = new URL(client.materialShelfPath({ ...request, siteKey: "word", appId: "contracts" }, "official"), "https://example.test");
  assert.equal(scoped.searchParams.get("siteKey"), "word");
  assert.equal(scoped.searchParams.get("appId"), "contracts");
});

test("page acquisition merges source counts, preserves exact identities and independent cursors", async () => {
  globalThis.__taxonomyGet = async (path) => path.startsWith("/v1/materials?") ? {
    items: [{ id: "doc", templateId: "doc", assetRef: {kind:"template",id:"doc"}, artifactType: "document" }, { id: "pdf", templateId: "pdf", assetRef: {kind:"template",id:"pdf"}, artifactType: "pdf" }, { id: "bad", templateId: "bad", assetRef: {kind:"template",id:"bad"}, artifactType: "chart" }],
    categoryCounts: { "document-category": 8 }, nextOffset: 30,
  } : { items: [{ id: "sale", title: "Seller PDF", price: { min_fen: 900, currency: "USD" }, material: { artifactType: "pdf" }, author: { display_name: "Author" } }], categoryCounts: { "document-category": 2 }, next_cursor: "next" };
  const page = await client.fetchMaterialShelf({ siteKey: "oceanleo", shelfType: "document", limit: 30, filters: taxonomy.emptyMaterialFilters() }, { signal: signal(), sellers: true });
  assert.deepEqual(page.items.map((row) => [row.id, row.type]), [["template-material:doc", "document"], ["template-material:pdf", "pdf"], ["listing:sale", "pdf"]]);
  assert.deepEqual(page.categoryCounts, { "document-category": 10 });
  assert.equal(page.items[2].price_fen, 900); assert.equal(page.items[2].currency, "USD");
  assert.equal(page.nextOfficial, 30); assert.equal(page.nextSeller, "next"); assert.equal(page.unavailable, false);
});

test("partial source failure retains successful results and cancellation cannot return stale content", async () => {
  globalThis.__taxonomyGet = async (path) => { if (path.startsWith("/v1/talent")) throw new Error("unavailable"); return { items: [{ id: "v", templateId: "v", assetRef: {kind:"template",id:"v"}, artifactType: "video" }], categoryCounts: {} }; };
  const request = { siteKey: "oceanleo", shelfType: "video", limit: 30, filters: taxonomy.emptyMaterialFilters() };
  const page = await client.fetchMaterialShelf(request, { signal: signal(), sellers: true });
  assert.equal(page.items.length, 1); assert.equal(page.unavailable, true);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(client.fetchMaterialShelf(request, { signal: controller.signal, sellers: true }), { name: "AbortError" });
  let calls = 0;
  globalThis.__taxonomyGet = async () => { calls += 1; return { items: [] }; };
  await client.fetchMaterialShelf(request, { signal: signal(), sellers: true, officialOffset: null, sellerCursor: "next" });
  assert.equal(calls, 1, "an exhausted source is not fetched again");
});

test("all taxonomy chrome keys have actual translations in all 17 locale dictionaries", () => {
  for (const locale of LOCALES) for (const key of ["内容分类", "内容类型", "全部内容类型", "场合", "全部格式", "其他文档格式", "素材分类未能加载，请重试。", "部分素材未能加载，请重试。", ...Object.values(taxonomy.MATERIAL_TAG_LABELS)]) {
    assert.ok(UI_MESSAGES[locale][key], `${locale}: ${key}`);
    if (!["zh", "zh-TW", "ja"].includes(locale)) assert.doesNotMatch(UI_MESSAGES[locale][key], /[一-鿿]/, `${locale}: ${key}`);
  }
});
