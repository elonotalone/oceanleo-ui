import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React, { act } from "react";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { normalizeArtifactProjection, artifactDownloadPlanFor, artifactUserFacingDownloadHint } from "../src/shell/artifact-contract.ts";
import { artifactProjectionToLibraryItem } from "../src/shell/library-data.ts";
import { isolatedWebsitePreviewUrl, websiteViewerPlan } from "../src/shell/website-inline-preview.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const id = "84a73f17-5cae-4092-aecc-2740f7ce3813";
const revision = "source-revision-1";
const previewUrl = "https://library-preview.ws.oceanleo.app/site/index.html?cap=fixture";
const clientModule = await compileModule("src/shell/artifact-client.ts", {
  "../lib/auth/client": dataModule('export async function accessToken() { return "fixture-token"; }'),
  "../lib/auth/config": dataModule('export const GATEWAY_BASE = "https://gateway.invalid";'),
});
const client = await import(clientModule);
const { WebsiteArtifactViewer } = await import(await compileModule("src/shell/WebsiteArtifactViewer.tsx", {
  "./artifact-client": clientModule,
  "../i18n/ui/useUI": dataModule('export function useUI() { return value => value; }'),
  "./ArtifactRendition": dataModule('export function useArtifactRendition() { throw new Error("durable website must resolve preview before renditions"); }'),
  "../lib/media-proxy": dataModule('export function fetchMediaBlob() { throw new Error("must not probe cover bytes"); }'),
}));
const { createRoot } = await import("react-dom/client");

// E10: this artifact has oceanleo.website-project.v1 + source.json + two dependencies,
// while thumbnail, preview and full are PNG. The two dependency files travel
// inside the source ZIP response, never via the image rendition endpoint.
function fixture({ revisionId = revision, canExport = true, source = true, format = "oceanleo.website-project.v1" } = {}) {
  const renditions = Object.fromEntries(["thumbnail", "preview", "full"].map(purpose => [purpose, {
    purpose, revision_id: revisionId, url: `https://gateway.invalid/${purpose}.png`, format: "png", media_type: "image/png",
  }]));
  if (source) renditions.source = {
    purpose: "source", revision_id: revisionId, url: "https://gateway.invalid/source.json",
    format, media_type: "application/json", digest: "sha256:website-source-fixture",
  };
  const raw = {
    schema: "oceanleo.artifact.v1", artifact_id: id, revision_id: revisionId,
    artifact_type: "website", title: "编辑器示例", roles: ["user_work"], favorite: false,
    owner: { principal_id: "owner-fixture", visibility: "private" },
    access: { can_read: true, can_preview: true, can_edit: true, can_export_source: canExport,
      can_fork: false, can_insert: false, can_replace: false, can_favorite: false, can_bind: false },
    editability: "bounded", editor_capability: "website-editor", source_format: format, renditions,
    provenance: { id: "source-fixture", source_kind: "owned", license_code: "owned" },
    integrity: { ok: true, code: "ok", reason: "" }, context_bindings: [],
  };
  const artifact = normalizeArtifactProjection(raw);
  assert.ok(artifact, "fixture must be a real durable projection");
  return { raw, item: artifactProjectionToLibraryItem(artifact) };
}
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
function ready() { return { url: previewUrl, expires_at: new Date(Date.now() + 120_000).toISOString(), source_format: "oceanleo.website-project.v1" }; }
async function mounted(item, run) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try { await act(async () => root.render(React.createElement(WebsiteArtifactViewer, { item }))); await run(host, root); }
  finally { await act(async () => root.unmount()); host.remove(); }
}

// UC-1 / UC-3 / UC-6 — docs/architecture/oceanleo-untrusted-content-isolation.md.
test("84a73f17 PNG covers resolve a revision-specific isolated page before touching renditions", async () => {
  const calls = []; const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return json(ready()); };
  try {
    await mounted(fixture().item, async host => {
      const frame = host.querySelector("iframe"); assert.ok(frame);
      assert.equal(frame.getAttribute("src"), previewUrl);
      assert.equal(frame.getAttribute("referrerpolicy"), "no-referrer");
      assert.ok(frame.getAttribute("sandbox").includes("allow-scripts"));
      assert.ok(!frame.getAttribute("sandbox").includes("allow-same-origin"));
      assert.equal(host.querySelector("img"), null);
      assert.doesNotMatch(host.textContent, /只存了一张封面图/);
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `https://gateway.invalid/v1/artifacts/${id}/website-preview?revisionId=${revision}`);
    assert.equal(calls[0].init.headers.Authorization, "Bearer fixture-token");
    assert.equal(calls[0].init.cache, "no-store");
  } finally { globalThis.fetch = original; }
});

// UC-5: owner-only responses; docs/architecture/oceanleo-untrusted-content-isolation.md.
for (const [name, code, status, message] of [
  ["preview not generated", "preview_unavailable", 503, /预览还没生成/],
  ["source missing", "missing-source", 409, /源码缺失/],
  ["permission denied", "unauthorized", 403, /没有权限/],
]) test(`website preview distinguishes ${name} and retry resolves a real page`, async () => {
  const original = globalThis.fetch; let attempts = 0;
  globalThis.fetch = async () => ++attempts === 1 ? json({ detail: { code } }, status) : json(ready());
  try {
    await mounted(fixture().item, async host => {
      assert.match(host.querySelector('[role="status"]').textContent, message);
      assert.equal(host.querySelector("iframe"), null);
      assert.doesNotMatch(host.textContent, /只存了一张封面图/);
      await act(async () => host.querySelector("button").click());
      assert.equal(host.querySelector("iframe").getAttribute("src"), previewUrl);
    });
    assert.equal(attempts, 2);
  } finally { globalThis.fetch = original; }
});

// UC-1: only the current revision's isolated oceanleo.app preview URL may ever be painted;
// a late response from a previous revision is dropped, never shown.
test("changing revisions aborts the old resolver and never paints its late response", async () => {
  const original = globalThis.fetch; const calls = []; let release;
  globalThis.fetch = (url, init) => {
    calls.push({ url, signal: init.signal });
    if (calls.length === 1) return new Promise(resolve => { release = resolve; });
    return Promise.resolve(json(ready()));
  };
  try {
    await mounted(fixture().item, async (host, root) => {
      await act(async () => root.render(React.createElement(WebsiteArtifactViewer, { item: fixture({ revisionId: "revision/two?" }).item })));
      assert.equal(calls[0].signal.aborted, true);
      assert.equal(new URL(calls[1].url).searchParams.get("revisionId"), "revision/two?");
      await act(async () => release(json({ ...ready(), url: "https://old.oceanleo.app/" })));
      assert.equal(host.querySelector("iframe").getAttribute("src"), previewUrl);
    });
  } finally { globalThis.fetch = original; }
});

// UC-1 — docs/architecture/oceanleo-untrusted-content-isolation.md.
test("website preview rejects credential-bearing, expired, first-party and nonisolated URLs", async () => {
  for (const value of ["https://oceanleo.app", "https://oceanleo.com/x", "https://preview.oceanbizs.com/x", "https://a.oceanleo.app.evil.test", "http://a.oceanleo.app", "https://a.oceanleo.app:444", "https://u:p@a.oceanleo.app", "javascript:alert(1)"]) {
    assert.equal(isolatedWebsitePreviewUrl(value), "", value);
  }
  assert.equal(isolatedWebsitePreviewUrl(previewUrl), previewUrl);
  const original = globalThis.fetch;
  try {
    for (const payload of [{ ...ready(), url: "https://preview.oceanleo.com" }, { ...ready(), expires_at: "2000-01-01T00:00:00Z" }, { ...ready(), source_format: "" }]) {
      globalThis.fetch = async () => json(payload);
      const result = await client.getArtifactWebsitePreview(fixture().item);
      assert.equal(result.ok, false); assert.equal(result.code, "invalid-response");
    }
  } finally { globalThis.fetch = original; }
});

test("website preview shows startup stages and polls until the executor is ready", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1
      ? json({ status: "starting", stage: "installing_dependencies", source_format: "website-code@1" })
      : json(ready());
  };
  try {
    await mounted(fixture().item, async (host) => {
      assert.match(host.querySelector('[role="status"]').textContent, /安装网站依赖/);
      await act(async () => new Promise((resolve) => setTimeout(resolve, 650)));
      assert.equal(host.querySelector("iframe").getAttribute("src"), previewUrl);
      assert.equal(calls, 2);
    });
  } finally { globalThis.fetch = original; }
});

test("website preview renders a non-retryable failure reason and retries on demand", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1
      ? json({
          status: "failed",
          source_format: "website-code@1",
          reason: { code: "build_failed", message: "网站预览启动失败，请重试。" },
        })
      : json(ready());
  };
  try {
    await mounted(fixture().item, async (host) => {
      assert.match(host.querySelector('[role="status"]').textContent, /启动失败/);
      assert.equal(host.querySelector("iframe"), null);
      await act(async () => host.querySelector("button").click());
      assert.equal(host.querySelector("iframe").getAttribute("src"), previewUrl);
      assert.equal(calls, 2);
    });
  } finally { globalThis.fetch = original; }
});

// UC-1 / UC-3 / UC-4 / UC-6 — docs/architecture/oceanleo-untrusted-content-isolation.md.
test("website frame keeps the shared restrictive sandbox and no inline execution or messaging", () => {
  const source = readFileSync("src/shell/WebsiteArtifactViewer.tsx", "utf8");
  const restrictiveSandbox = /sandbox=\{webViewerFrameSandbox\(false\)\}/;
  assert.match(source, restrictiveSandbox);
  // Break the security line in memory and prove the assertion turns red;
  // the shared working tree never carries the unsafe variant.
  assert.throws(() => assert.match(source.replace("sandbox={webViewerFrameSandbox(false)}", "sandbox={webViewerFrameSandbox(true)}"), restrictiveSandbox));
  assert.match(source, /referrerPolicy="no-referrer"/);
  assert.doesNotMatch(source, /srcDoc=|dangerouslySetInnerHTML|postMessage\(/);
});

test("website download evidence and hint promise source ZIP, never PNG or a JSON entrypoint", () => {
  const { item } = fixture();
  assert.deepEqual(artifactDownloadPlanFor(item.artifact).map(({ purpose, mode }) => ({ purpose, mode })), [{ purpose: "source", mode: "source" }]);
  assert.equal(client.artifactDownloadEvidence(item).available, true);
  assert.equal(client.artifactDownloadTypeHint(item).downloadMediaType, "application/zip");
  assert.match(artifactUserFacingDownloadHint({ artifactType: "website", sourceFormat: "oceanleo.website-project.v1", editorCapability: "website-editor", title: "示例" }).filename, /\.zip$/);
  assert.deepEqual(artifactDownloadPlanFor(fixture({ canExport: false }).item.artifact), []);
  assert.equal(client.artifactDownloadEvidence(fixture({ source: false }).item).available, false);
  const plan = websiteViewerPlan({ hasUrl: true, mediaType: "image/png", body: { status: "unread" } });
  assert.doesNotMatch(plan.notice, /没有随附|只存了一张/);
});

// UC-NONE: this checks the authenticated, revision-pinned source ZIP download,
// not the UGC origin, cookie, frame, postMessage or CORS boundaries of UC-1 through UC-7.
test("Download fetches the exact revision source ZIP with auth and returns its bytes to the existing action", async () => {
  const original = globalThis.fetch; const calls = [];
  const { raw, item } = fixture();
  // A nonempty ZIP local-file signature plus source closure marker. Actual ZIP
  // closure generation belongs to WEBAPI; this test verifies byte preservation.
  const zip = new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "source.json\nimages/a.png\nimages/b.png"], { type: "application/zip" });
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (new URL(url).pathname.startsWith("/v1/library/items/")) return json(raw);
    assert.equal(url, `https://gateway.invalid/v1/artifacts/${id}/website-source.zip?revisionId=${revision}`);
    return new Response(zip, { headers: { "Content-Type": "application/zip" } });
  };
  try {
    const result = await client.getArtifactDownload(item);
    assert.equal(result.ok, true, result.error);
    assert.equal(result.data.artifactId, id); assert.equal(result.data.revisionId, revision);
    assert.equal(result.data.purpose, "source"); assert.equal(result.data.mediaType, "application/zip");
    assert.match(result.data.filename, /\.zip$/);
    const downloaded = await original(result.data.url);
    assert.deepEqual(new Uint8Array(await downloaded.arrayBuffer()), new Uint8Array(await zip.arrayBuffer()));
    URL.revokeObjectURL(result.data.url);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].init.headers.Authorization, "Bearer fixture-token");
    assert.equal(calls[1].init.cache, "no-store");
    assert.ok(calls.every(call => !call.url.includes("/renditions/")));
  } finally { globalThis.fetch = original; }
});

// UC-5: owner-only source access; docs/architecture/oceanleo-untrusted-content-isolation.md.
test("source ZIP rejects permission denial and image/JSON responses without a cover fallback", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error("permission must be checked before network"); };
    assert.equal((await client.getArtifactWebsiteSourceZip(fixture({ canExport: false }).item)).ok, false);
    for (const response of [json({ code: "unauthorized" }, 403), json({ source: "json is not a ZIP" }), new Response("image bytes", { headers: { "Content-Type": "image/png" } }), new Response("not zip", { headers: { "Content-Type": "application/zip" } })]) {
      globalThis.fetch = async () => response;
      const result = await client.getArtifactWebsiteSourceZip(fixture().item);
      assert.equal(result.ok, false);
    }
  } finally { globalThis.fetch = original; }
});

test("libweb copy covers zh, en, zh-TW and every other locale with English", async () => {
  const { LIBWEB_MESSAGES } = await import(await compileModule("src/i18n/ui/messages/libweb-copy.ts"));
  const chinese = LIBWEB_MESSAGES.zh;
  for (const [locale, dictionary] of Object.entries(LIBWEB_MESSAGES)) {
    assert.deepEqual(Object.keys(dictionary), Object.keys(chinese));
    if (locale !== "zh" && locale !== "zh-TW") for (const text of Object.values(dictionary)) assert.doesNotMatch(text, /[\u3400-\u9fff]/);
  }
});
