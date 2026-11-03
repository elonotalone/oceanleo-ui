import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { artifactProjectionToLibraryItem } from "../src/shell/library-data.ts";
import { normalizeArtifactProjection } from "../src/shell/artifact-contract.ts";
import { materialShelfEntries } from "../src/shell/material-library-presentation.ts";
import { artifactEntry } from "../src/shell/material-library-controller.ts";
import { materialArtifactDedupeKey } from "../src/shell/material-library-dedupe.ts";
import { materialCatalogCards } from "../src/shell/material-catalog-group.ts";
import { materialFacetRecords } from "../src/shell/material-library-facets.ts";
import { templateMaterialEntry, normalizeTemplateMaterial } from "../src/shell/material-library-template-source.ts";

// Stub credentials only. Requests, scope enforcement, projections, visibility,
// editor support and source normalization all run through the real modules.
const { listBayOfficialTemplates, templateMaterialToBayAsset } = await import(
  await compileModule("src/shell/bay/asset/bay-template-shelf.ts", {
    "../../../lib/auth/client": dataModule('export async function accessToken(){return "test-session";}'),
  })
);

const context = { contextId: "olctx:v1:image:app:image", siteKey: "image", appId: "image" };
function row(id, overrides = {}) {
  return {
    schema: "oceanleo.artifact.v1", artifact_id: id, revision_id: `r-${id}`,
    artifact_type: "single_file_image", roles: ["template"], title: id, favorite: false,
    owner: { principal_id: "platform", visibility: "public", origin_site_key: "image", origin_app_id: "image" },
    access: { read: true, preview: true, edit: false, fork: true, insert: true, replace: true, favorite: true, bind: true, export_source: true },
    editability: "bounded", editor_capability: "image-editor", source_format: "webp",
    renditions: {
      thumbnail: { purpose: "thumbnail", revision_id: `r-${id}`, url: `https://assets.test/${id}.webp`, media_type: "image/webp" },
      preview: { purpose: "preview", revision_id: `r-${id}`, url: `https://assets.test/${id}.webp`, media_type: "image/webp" },
      source: { purpose: "source", revision_id: `r-${id}`, url: `https://assets.test/${id}.webp`, media_type: "image/webp", digest: "sha256:source" },
    },
    provenance: { id: `prov-${id}`, source_kind: "owned", license_code: "owned" },
    integrity: { ok: true, code: "ok", reason: "" },
    context_bindings: [{ context_id: context.contextId, role: "primary", pinned_revision_id: `r-${id}`, rank: 0 }],
    ...overrides,
  };
}
function catalogRow(id, overrides = {}) {
  return {
    id: `catalog-${id}`, artifactId: id, artifactType: "single_file_image",
    title: id, tags: [], previewUrl: `tpl-material/${id}`, siteKey: "image", appId: "image",
    ...overrides,
  };
}
function response(body, status = 200) {
  if (Array.isArray(body.items) && body.total == null) body = { ...body, total: body.items.length };
  return { ok: status < 400, status, headers: new Headers({ "Content-Type": "application/json" }), json: async () => body };
}
async function withFetch(handler, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(url);
    return handler(url, init);
  };
  try { await run(calls); } finally { globalThis.fetch = original; }
}
function item(raw) {
  const projection = normalizeArtifactProjection(raw);
  assert.ok(projection, raw.artifact_id);
  return artifactProjectionToLibraryItem(projection);
}
const ids = (assets) => new Set(assets.map((asset) => asset.catalog.artifactId));

test("identity-set parity with MaterialLibrary: published catalog, current app and site; retired, no-permission and plugins excluded", async () => {
  const published = catalogRow("published");
  const retired = catalogRow("retired", { status: "retired" });
  const primary = row("current-app");
  const duplicate = row("published");
  const site = row("site-only", { context_bindings: [] });
  const denied = row("no-permission", { access: { read: false, preview: false, edit: false, fork: false, insert: false, replace: false, favorite: false, bind: false, export_source: false } });
  const invalid = row("retired-projection", { integrity: { ok: false, code: "retired", reason: "retired" } });
  const plugin = row("plugin", { artifact_type: "geo_map", editor_capability: "geo-map-editor" });
  const privateRow = row("private", { owner: { principal_id: "owner", visibility: "private", origin_site_key: "image", origin_app_id: "image" } });
  await withFetch((url) => {
    if (url.pathname === "/v1/template-materials") {
      // Same published-only source contract as template_materials.py.
      return response({ items: [published, retired].filter((r) => r.status !== "retired") });
    }
    if (url.pathname === "/v1/library/primary") return response({ contextId: context.contextId, items: [primary, denied, invalid, plugin, privateRow] });
    if (url.pathname === "/v1/library/search") return response({ scope: "public", items: [duplicate, site] });
    throw new Error(url.pathname);
  }, async (calls) => {
    const actual = await listBayOfficialTemplates({ type: "image", context, signal: new AbortController().signal });
    const old = materialShelfEntries({
      level: "primary", siteKey: "image", deepLinked: [], exactLocal: [],
      officialTemplates: [templateMaterialEntry(normalizeTemplateMaterial(published))],
      remote: [primary, duplicate, site].map((r) => artifactEntry(item(r))),
    });
    assert.deepEqual(ids(actual.items), new Set(old.map((entry) => materialArtifactDedupeKey(entry).slice("artifact:".length))));
    assert.deepEqual(ids(actual.items), new Set(["published", "current-app", "site-only"]));
    assert.equal(actual.total, 3);
    const catalog = actual.items.find((a) => a.catalog.catalogId);
    assert.equal(catalog.catalog.revisionId, null);
    assert.equal(catalog.entry.libraryItem.artifactId, undefined, "catalog row never impersonates a durable revision");
    assert.ok(catalog.catalogIdentities.some((identity) => identity.revisionId === "r-published"));
    const current = actual.items.find((a) => a.catalog.source === "library-primary");
    assert.equal(current.catalog.revisionId, "r-current-app");
    assert.deepEqual(current.catalog.context, context);
    assert.equal(new URL(current.openHref, "https://example.test").searchParams.get("item"), "artifact:current-app:r-current-app");
    assert.equal(current.entry.libraryItem.artifact.access.canEdit, false);
    assert.equal(current.entry.libraryItem.artifact.access.canFork, true);
    const search = calls.find((url) => url.pathname === "/v1/library/search");
    assert.equal(search.searchParams.get("originSiteKey"), "image");
    assert.equal(search.searchParams.get("artifactType"), "single_file_image");
    assert.equal(search.searchParams.get("role"), "template");
    assert.ok(calls.some((url) => url.pathname === "/v1/library/primary" && url.searchParams.get("contextId") === context.contextId));
  });
});

test("site pagination completes before search and output pagination, including offset without limit", async () => {
  const siteKey = "catalog-pagination";
  await withFetch((url) => {
    if (url.pathname === "/v1/template-materials") return response({ items: [] });
    const offset = Number(url.searchParams.get("offset") || 0);
    return response({ scope: "public", items: [row(offset ? "needle" : "first", {
      owner: { principal_id: "platform", visibility: "public", origin_site_key: siteKey, origin_app_id: "image" },
      context_bindings: [],
    })], total: 2, nextOffset: offset ? null : 1 });
  }, async (calls) => {
    const result = await listBayOfficialTemplates({ type: "image", siteKey, q: "needle", limit: 1, signal: new AbortController().signal });
    assert.deepEqual(ids(result.items), new Set(["needle"]));
    assert.equal(result.total, 1);
    assert.equal(result.hasMore, false);
    assert.equal(calls.filter((url) => url.pathname === "/v1/library/search").length, 2);
    const next = await listBayOfficialTemplates({ type: "image", siteKey, offset: 1, signal: new AbortController().signal });
    assert.deepEqual(ids(next.items), new Set(["needle"]));
  });
});

test("unauthorized current app still lists public site materials, without any unscoped retry", async () => {
  const ctx = { contextId: "olctx:v1:anonymous:app:image", siteKey: "anonymous", appId: "image" };
  await withFetch((url) => {
    if (url.pathname === "/v1/template-materials") return response({ items: [] });
    if (url.pathname === "/v1/library/primary") return response({ detail: "unauthorized" }, 403);
    return response({ scope: "public", items: [] });
  }, async (calls) => {
    const result = await listBayOfficialTemplates({ type: "image", context: ctx, signal: new AbortController().signal });
    assert.deepEqual(result.items, []);
    assert.deepEqual(result.unavailableSources, ["library-primary"]);
    assert.equal(calls.length, 3);
    assert.ok(calls.filter((url) => url.pathname === "/v1/library/search").every((url) => url.searchParams.get("originSiteKey") === ctx.siteKey));
  });
});

test("scope failures never broaden the catalog or query a different site", async () => {
  await withFetch(() => { throw new Error("must not fetch"); }, async (calls) => {
    for (const options of [
      { level: "primary" },
      { level: "primary", siteKey: "image" },
      { siteKey: "other", context },
      { context: { siteKey: "image", appId: "image" } },
    ]) await assert.rejects(listBayOfficialTemplates({ type: "image", ...options }), /invalid-binding/);
    assert.deepEqual(calls, []);
  });
});

test("website facets and distinct same-skin versions feed the existing MaterialLibrary grouping helpers", () => {
  const tags = ["industry:business", "sub:accounting", "shape:s5", "skin:paper", "group:accounting-s5"];
  const assets = ["one", "two"].map((id, index) => templateMaterialToBayAsset(normalizeTemplateMaterial(catalogRow(id, {
    artifactType: "website", siteKey: "website", appId: "agency",
    tags: [...tags, `tpl:${id}`, ...(index ? [] : ["groupcover:1"])],
  })), "website"));
  assert.equal(assets[0].facets.industry, "business");
  assert.equal(assets[0].facets.sub, "accounting");
  assert.equal(assets[0].facets.shape, "s5");
  assert.equal(assets[0].facets.skin, "paper");
  assert.equal(assets[0].catalog.catalogId, "catalog-one");
  const cards = materialCatalogCards(materialFacetRecords(assets.map((a) => a.entry)));
  assert.equal(cards.length, 1);
  assert.equal(cards[0].variants.length, 2);
  assert.deepEqual(cards[0].variants.map((variant) => variant.key), ["one", "two"]);
});


test("primary catalog scope filters by app while site scope keeps other apps and rejects a foreign site", async () => {
  const ctx = { contextId: "olctx:v1:scope-test:app:image", siteKey: "scope-test", appId: "image" };
  await withFetch((url) => {
    if (url.pathname === "/v1/template-materials") return response({ items: [
      catalogRow("this-app", { siteKey: ctx.siteKey }),
      catalogRow("other-app", { siteKey: ctx.siteKey, appId: "poster" }),
      catalogRow("foreign-site", { siteKey: "foreign" }),
    ] });
    if (url.pathname === "/v1/library/primary") return response({ contextId: ctx.contextId, items: [] });
    return response({ scope: "public", items: [row("foreign-typed")] });
  }, async (calls) => {
    const primary = await listBayOfficialTemplates({ type: "image", context: ctx, level: "primary", signal: new AbortController().signal });
    assert.deepEqual(ids(primary.items), new Set(["this-app"]));
    assert.equal(calls.find((url) => url.pathname === "/v1/template-materials").searchParams.get("appId"), "image");
    const site = await listBayOfficialTemplates({ type: "image", context: ctx, level: "site", signal: new AbortController().signal });
    assert.deepEqual(ids(site.items), new Set(["this-app", "other-app"]));
  });
});

test("public search permission failure never returns a partial catalog or retries globally", async () => {
  await withFetch((url) => url.pathname === "/v1/template-materials"
    ? response({ items: [catalogRow("catalog-ok")] })
    : response({ detail: "forbidden" }, 403), async (calls) => {
    await assert.rejects(listBayOfficialTemplates({ type: "image", siteKey: "site-denied", signal: new AbortController().signal }));
    assert.equal(calls.filter((url) => url.pathname === "/v1/library/search").length, 1);
    assert.equal(calls.find((url) => url.pathname === "/v1/library/search").searchParams.get("originSiteKey"), "site-denied");
  });
});

test("stalled site pagination rejects instead of hanging or declaring a partial shelf complete", async () => {
  await withFetch((url) => url.pathname === "/v1/template-materials"
    ? response({ items: [] })
    : response({ scope: "public", items: [], total: 2, nextOffset: 1 }), async (calls) => {
    await assert.rejects(listBayOfficialTemplates({ type: "image", siteKey: "stalled", signal: new AbortController().signal }), /invalid-response/);
    assert.equal(calls.filter((url) => url.pathname === "/v1/library/search").length, 2);
  });
});
