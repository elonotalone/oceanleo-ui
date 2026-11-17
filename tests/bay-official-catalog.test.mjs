import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { emptyMaterialFilters } from "../src/shell/bay/shell/material-taxonomy.ts";

const { fetchMaterialShelf } = await import(await compileModule("src/shell/bay/shell/material-shelf-client.ts", {
  "../../../lib/bay/http": dataModule('export async function bayGet(path,opts){return globalThis.__officialTaxonomyGet(path,opts);}'),
}));
const raw = (id, artifactType, siteKey) => ({ id: `catalog-${id}`, templateId: `catalog-${id}`, assetRef: {kind:"template",id:`catalog-${id}`}, artifactId: id, artifactType, title: id,
  keywords: ["approved"], tags: { industry: ["education"] }, previewUrl: `tpl-material/${id}`, siteKey, appId: "sample" });
const request = (shelfType, siteKey = "oceanleo") => ({ shelfType, siteKey, limit: 30, filters: emptyMaterialFilters() });
const options = () => ({ signal: new AbortController().signal, sellers: false });

test("portal website shelf follows API pages and retains every published catalog identity", async () => {
  const rows = Array.from({ length: 120 }, (_, i) => raw(`site-${i}`, "website", "website"));
  const paths = [];
  globalThis.__officialTaxonomyGet = async (path) => {
    paths.push(path); const params = new URL(path, "https://fixture.test").searchParams;
    assert.equal(params.get("shelfType"), "website"); assert.equal(params.has("siteKey"), false);
    const offset = Number(params.get("offset") || 0);
    return { items: rows.slice(offset, offset + 30), total: 120, nextOffset: offset < 90 ? offset + 30 : null, categoryCounts: { "website-business": 120 } };
  };
  const assets = []; let offset;
  do {
    const page = await fetchMaterialShelf(request("website"), { ...options(), officialOffset: offset });
    assets.push(...page.items); offset = page.nextOfficial;
  } while (offset !== null);
  assert.equal(paths.length, 4);
  assert.equal(assets.length, 120);
  assert.equal(new Set(assets.map((asset) => asset.catalog.artifactId)).size, 120);
  assert.equal(assets[119].catalog.catalogId, "catalog-site-119");
});

test("all ten game cards retain catalog and preview identities without a second stock query", async () => {
  const paths = [];
  globalThis.__officialTaxonomyGet = async (path) => { paths.push(path); return { items: Array.from({ length: 10 }, (_, i) => raw(`game-${i}`, "game", "game")), nextOffset: null }; };
  const page = await fetchMaterialShelf(request("game"), options());
  assert.equal(page.items.length, 10); assert.equal(paths.length, 1);
  for (const asset of page.items) {
    assert.equal(asset.type, "game"); assert.equal(asset.catalog.siteKey, "game");
    assert.equal(asset.catalog.catalogId, `catalog-${asset.catalog.artifactId}`);
    assert.equal(new URL(asset.openHref, "https://fixture.test").searchParams.get("item"), asset.catalog.artifactId);
  }
});

test("subsite and app shelf requests remain scoped; unavailable sources never trigger broader retries", async () => {
  const paths = [];
  globalThis.__officialTaxonomyGet = async (path) => { paths.push(path); throw new Error("forbidden"); };
  const page = await fetchMaterialShelf({ ...request("design", "image"), appId: "draw" }, options());
  assert.equal(page.items.length, 0); assert.equal(page.unavailable, true); assert.equal(paths.length, 1);
  const params = new URL(paths[0], "https://fixture.test").searchParams;
  assert.equal(params.get("siteKey"), "image"); assert.equal(params.get("appId"), "draw");
});

test("document and PDF render together while retaining their exact catalog carriers and rights", async () => {
  globalThis.__officialTaxonomyGet = async () => ({ items: [raw("doc", "document", "word"), raw("pdf", "pdf", "word")], nextOffset: null, categoryCounts: { "document-reports": 2 } });
  const page = await fetchMaterialShelf(request("document"), options());
  assert.deepEqual(page.items.map((asset) => asset.catalog.artifactType), ["document", "pdf"]);
  assert.deepEqual(page.items.map((asset) => asset.tags), [["approved"], ["approved"]]);
  for (const asset of page.items) {
    assert.equal(asset.price_fen, 0); assert.equal(asset.catalog.revisionId, null);
    assert.equal(asset.entry.libraryItem.meta.template_material_artifact_id, asset.catalog.artifactId);
  }
});

test("retained legal and PPT origins with no template registration keep platform purchase identities", async () => {
  globalThis.__officialTaxonomyGet = async () => ({ items: [
    { id: "library:legal", templateId: null, assetRef: { kind: "platform", id: "legal" }, artifactId: null, artifactType: "document", title: "Contract", previewMediaUrl: "https://fixture.test/legal.webp", keywords: [] },
    { id: "library:slides", templateId: null, assetRef: { kind: "platform", id: "slides" }, artifactId: "retained-root", artifactType: "deck", title: "Retained PPT", previewMediaUrl: "https://fixture.test/slides.webp", keywords: [] },
  ], nextOffset: null });
  const page = await fetchMaterialShelf(request("document"), options());
  assert.deepEqual(page.items.map((asset) => asset.id), ["library:legal", "library:slides"]);
  assert.equal(page.items[0].type, "document"); assert.equal(page.items[1].type, "ppt");
  assert.equal(page.items[0].catalog, undefined, "a platform origin never becomes a fictional template");
  assert.equal(page.items[0].thumb_url, "https://fixture.test/legal.webp");
});
