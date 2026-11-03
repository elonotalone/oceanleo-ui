import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const auth = dataModule('export async function accessToken(){return globalThis.__w8ExportToken;}');
const config = dataModule('export const GATEWAY_BASE="https://unused.invalid"; export function gatewayBase(){return globalThis.__w8ExportGateway;}');
const runtime = await compileModule("src/api/website-runtime.ts", { "../lib/auth/client": auth, "../lib/auth/config": config });
const filenames = await compileModule("src/shell/template-download.ts", { "../lib/auth/client": auth, "../lib/auth/config": config });
const { websiteExportsApi, websiteDatabaseExportConnection, saveWebsiteExport, WebsiteExportError } = await import(await compileModule("src/api/website-exports.ts", {
  "./website-runtime": runtime, "../shell/template-download": filenames,
}));

// Real ZIP fixture containing index.html; it is never executed or rendered.
const ZIP = new Uint8Array(Buffer.from("UEsDBBQAAAAAAAAAIVz7bP4dGwAAABsAAAAKAAAAaW5kZXguaHRtbDxtYWluPkV4cG9ydCBmaXh0dXJlPC9tYWluPlBLAQIUAxQAAAAAAAAAIVz7bP4dGwAAABsAAAAKAAAAAAAAAAAAAACAAQAAAABpbmRleC5odG1sUEsFBgAAAAABAAEAOAAAAEMAAAAAAA==", "base64"));
const PGDMP = new Uint8Array([0x50, 0x47, 0x44, 0x4d, 0x50, 1, 15, 0, 4, 8, 1, 0]);
function response(kind, headers = {}, status = 200, bytes = kind === "code" ? ZIP : PGDMP) {
  return new Response(bytes, { status, headers: {
    "Content-Type": kind === "code" ? "application/zip" : "application/octet-stream",
    "Content-Disposition": `attachment; filename="website-${kind}.${kind === "code" ? "zip" : "dump"}"`, ...headers,
  } });
}
function downloadProbe() {
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL,
    click: window.HTMLAnchorElement.prototype.click, timeout: window.setTimeout };
  const objects = [], clicks = [], revoked = [], timers = [];
  URL.createObjectURL = blob => { const url = "blob:https://oceanleo.com/export-" + objects.length; objects.push({ url, blob }); return url; };
  URL.revokeObjectURL = url => { revoked.push(url); };
  window.HTMLAnchorElement.prototype.click = function () { clicks.push({ href: this.href, filename: this.download }); };
  window.setTimeout = (callback, delay) => { timers.push({ callback, delay }); return timers.length; };
  return { objects, clicks, revoked, timers, restore() {
    URL.createObjectURL = original.create; URL.revokeObjectURL = original.revoke;
    window.HTMLAnchorElement.prototype.click = original.click; window.setTimeout = original.timeout;
  } };
}
function defaults() { globalThis.__w8ExportGateway = "https://gateway-one.invalid"; globalThis.__w8ExportToken = "export-test-token-one"; }

// UC-5: docs/architecture/oceanleo-untrusted-content-isolation.md.
// Supporting owner-only downloads: the authenticated gateway and environment are explicit, and private credentials never become a navigation URL.
test("export requests resolve current gateway/auth and fixed owner paths with escaped project and explicit database scope", async () => {
  defaults();
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return response(url.includes("/database?") ? "database" : "code"); };
  const controller = new AbortController();
  try {
    await websiteExportsApi.code("project/one", controller.signal);
    globalThis.__w8ExportGateway = "https://gateway-two.invalid"; globalThis.__w8ExportToken = "export-test-token-two";
    await websiteExportsApi.database("project/one", "supabase", "production", controller.signal);
    await websiteExportsApi.database("project/one", "managed", "preview", controller.signal);
    assert.equal(calls[0].url, "https://gateway-one.invalid/v1/website-projects/project%2Fone/exports/code");
    const database = new URL(calls[1].url);
    assert.equal(database.origin, "https://gateway-two.invalid");
    assert.deepEqual([...database.searchParams], [["connection_ref", "supabase"], ["environment", "production"], ["schema", "public"]]);
    assert.equal(new URL(calls[2].url).searchParams.get("connection_ref"), "managed");
    assert.equal(new URL(calls[2].url).searchParams.get("environment"), "preview");
    assert.equal(calls[0].init.headers.Authorization, "Bearer export-test-token-one");
    assert.equal(calls[1].init.headers.Authorization, "Bearer export-test-token-two");
    assert.equal(calls[0].init.headers.Accept, "application/zip"); assert.equal(calls[1].init.headers.Accept, "application/octet-stream");
    for (const call of calls) {
      assert.equal(call.init.method, "GET"); assert.equal(call.init.cache, "no-store"); assert.equal(call.init.credentials, "include");
      assert.equal(call.init.redirect, "error"); assert.equal(call.init.signal, controller.signal);
      assert.doesNotMatch(call.url, /export-test-token|oceanleo\.app/);
    }
  } finally { globalThis.fetch = original; }
});

// UC-5: docs/architecture/oceanleo-untrusted-content-isolation.md.
// Closed selected-connector mapping cannot guess a database or introduce vault/provider schema inputs.
test("database mapping is closed and unsupported connection or environment never sends a request", async () => {
  assert.equal(websiteDatabaseExportConnection("ours_postgres"), "managed");
  for (const connector of ["own_supabase", "supabase_on_behalf"]) assert.equal(websiteDatabaseExportConnection(connector), "supabase");
  for (const connector of ["unknown", "", "constructor", "__proto__", "vault:secret"]) assert.equal(websiteDatabaseExportConnection(connector), null);
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return response("database"); };
  try {
    for (const [connection, environment] of [["vault:secret", "preview"], ["supabase", undefined], ["managed", "staging"], ["supabase&schema=auth", "production"]]) {
      await assert.rejects(() => websiteExportsApi.database("p", connection, environment), error => error instanceof WebsiteExportError && error.code === "unsupported-database");
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

// UC-5: docs/architecture/oceanleo-untrusted-content-isolation.md.
// Private response bytes are retained exactly and saved through local, short-lived object URLs rather than credentialed navigation.
test("verified ZIP and PGDMP bytes reach local downloads with safe filenames and revoked object URLs", async () => {
  defaults();
  const original = globalThis.fetch, probe = downloadProbe();
  globalThis.fetch = async url => url.includes("/database?") ? response("database") : response("code", {
    "Content-Disposition": "attachment; filename*=UTF-8''%E4%BB%A3%E7%A0%81%2Fdownload.zip",
  });
  try {
    const code = await websiteExportsApi.code("p"); saveWebsiteExport(code);
    const database = await websiteExportsApi.database("p", "managed", "preview"); saveWebsiteExport(database);
    assert.equal(probe.clicks.length, 2); assert.equal(probe.objects.length, 2);
    assert.equal(probe.clicks[0].filename, "代码download.zip"); assert.equal(probe.clicks[1].filename, "website-database.dump");
    assert.deepEqual(new Uint8Array(await probe.objects[0].blob.arrayBuffer()), ZIP);
    assert.deepEqual(new Uint8Array(await probe.objects[1].blob.arrayBuffer()), PGDMP);
    assert.equal(probe.objects[0].blob.type, "application/zip"); assert.equal(probe.objects[1].blob.type, "application/octet-stream");
    for (const click of probe.clicks) { assert.match(click.href, /^blob:/); assert.doesNotMatch(click.href, /export-test-token|\/v1\//); }
    assert.equal(document.querySelectorAll("a[download]").length, 0); assert.deepEqual(probe.revoked, []);
    assert.ok(probe.timers.every(timer => timer.delay === 1000)); probe.timers.forEach(timer => timer.callback());
    assert.deepEqual(probe.revoked, probe.objects.map(object => object.url));
  } finally { probe.restore(); globalThis.fetch = original; }
});

// UC-5: docs/architecture/oceanleo-untrusted-content-isolation.md.
// MIME, magic and complete-response checks reject HTML/JSON/error payloads without exposing their text or saving them as archives.
test("wrong MIME, bytes and non-200 responses never start a download or expose raw error content", async () => {
  defaults();
  const original = globalThis.fetch, probe = downloadProbe();
  const privateText = "private-provider-response-value";
  const cases = [
    () => response("code", {}, 200, new TextEncoder().encode("<html>" + privateText + "</html>")),
    () => response("code", { "Content-Type": "text/html" }),
    () => response("code", { "Content-Type": "application/json" }, 200, new TextEncoder().encode('{"error":"' + privateText + '"}')),
    () => response("code", {}, 206),
    () => response("code", {}, 201),
    () => response("database", {}, 200, new TextEncoder().encode("<html>" + privateText)),
    () => response("database", { "Content-Type": "application/zip" }),
  ];
  try {
    for (let index = 0; index < cases.length; index++) {
      globalThis.fetch = async () => cases[index]();
      const request = index < 5 ? websiteExportsApi.code("p") : websiteExportsApi.database("p", "supabase", "production");
      await assert.rejects(() => request.then(saveWebsiteExport), error => {
        assert.ok(error instanceof WebsiteExportError); assert.equal(error.code, "invalid-file");
        assert.doesNotMatch(error.message + JSON.stringify(error), new RegExp(privateText)); return true;
      });
    }
    for (const [status, expected] of [[401, "unauthorized"], [403, "unauthorized"], [409, "not-ready"], [413, "too-large"], [429, "busy"], [503, "unavailable"]]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ detail: { code: privateText, message: privateText, headers: { Authorization: privateText } } }), { status, headers: { "Content-Type": "application/json" } });
      await assert.rejects(() => websiteExportsApi.database("p", "supabase", "production").then(saveWebsiteExport), error => {
        assert.ok(error instanceof WebsiteExportError); assert.equal(error.code, expected);
        assert.doesNotMatch(error.message + JSON.stringify(error), new RegExp(privateText)); return true;
      });
    }
    assert.equal(probe.clicks.length, 0); assert.equal(probe.objects.length, 0);
  } finally { probe.restore(); globalThis.fetch = original; }
});

// UC-NONE: local export size and filename handling.
// These controlled responses check bounded file consumption and safe local names; owner authorization is tested separately.
test("declared oversize files are rejected before reading and unsafe extensions use a bounded archive filename", async () => {
  defaults();
  const original = globalThis.fetch; let blobReads = 0;
  globalThis.fetch = async () => {
    const result = response("code", { "Content-Length": String(27 * 1024 * 1024) });
    result.blob = async () => { blobReads++; return new Blob([ZIP], { type: "application/zip" }); };
    return result;
  };
  try {
    await assert.rejects(() => websiteExportsApi.code("p"), error => error instanceof WebsiteExportError && error.code === "too-large");
    assert.equal(blobReads, 0);
    globalThis.fetch = async () => response("code", { "Content-Disposition": 'attachment; filename="../page.html"' });
    assert.equal((await websiteExportsApi.code("p")).filename, "website-code.zip");
    globalThis.fetch = async () => response("database", { "Content-Disposition": 'attachment; filename="' + "x".repeat(200) + '.dump"' });
    assert.equal((await websiteExportsApi.database("p", "managed", "preview")).filename, "website-database.dump");
  } finally { globalThis.fetch = original; }
});

// UC-NONE: local asynchronous cancellation.
// This case verifies that cancelled work cannot produce a save result even when a body collaborator resolves late.
test("abort is honored before fetch and after a delayed body completes", async () => {
  defaults();
  const original = globalThis.fetch; let calls = 0, releaseBody, bodyStarted;
  const started = new Promise(resolve => { bodyStarted = resolve; });
  globalThis.fetch = async () => {
    calls++;
    const result = response("code");
    result.blob = () => { bodyStarted(); return new Promise(resolve => { releaseBody = resolve; }); };
    return result;
  };
  try {
    const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(() => websiteExportsApi.code("p", cancelled.signal), error => error instanceof WebsiteExportError && error.code === "cancelled");
    assert.equal(calls, 0);
    const controller = new AbortController(), request = websiteExportsApi.code("p", controller.signal);
    await started; controller.abort(); releaseBody(new Blob([ZIP], { type: "application/zip" }));
    await assert.rejects(() => request, error => error instanceof WebsiteExportError && error.code === "cancelled");
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

// UC-NONE: local object-URL cleanup on browser-save failure.
// No server call is retried; the temporary URL and anchor must be released when the browser cannot start saving.
test("a failed browser save revokes its object URL without retaining the browser error", () => {
  const probe = downloadProbe();
  window.HTMLAnchorElement.prototype.click = () => { throw new Error("private-browser-detail"); };
  try {
    assert.throws(() => saveWebsiteExport({ blob: new Blob([ZIP], { type: "application/zip" }), filename: "website-code.zip" }), error => {
      assert.ok(error instanceof WebsiteExportError); assert.equal(error.code, "failed");
      assert.doesNotMatch(error.message, /private-browser-detail/); return true;
    });
    assert.deepEqual(probe.revoked, probe.objects.map(object => object.url));
    assert.equal(document.querySelectorAll("a[download]").length, 0);
  } finally { probe.restore(); }
});
