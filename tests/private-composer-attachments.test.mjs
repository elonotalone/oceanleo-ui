// W6 (2026-10-31): composer uploads are private Library references.
//
//   1. Display URLs (tiles, bubbles, history) are never a raw `*.supabase.co`
//      storage URL: local blob first, a private reference becomes a gateway
//      rendition grant, a legacy public object goes through the gateway proxy.
//   2. `uploadComposerFile` uses only the private route with an idempotency
//      key, refuses > 20 MB before any request, and fails closed without ids.
//   3. `useAttachments` keeps a failed tile (`failed: true`) and retries it;
//      what it sends to the agent is `{url: "", artifact_id, revision_id}`.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);

const ART = "11111111-2222-4333-8444-555555555555";
const REV = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const RAW = "https://kvrtcumcmhyqhmawpzyc.supabase.co/storage/v1/object/public/media-uploads/u/x/a.png";

const AUTH_STUBS = {
  "./auth/client": dataModule(`
    export async function accessToken(){ return "owner-token"; }
    export function cachedAccessToken(){ return "owner-token"; }
  `),
  "./auth/config": dataModule('export const GATEWAY_BASE = "https://gateway.test";'),
};

const urlModule = await import(
  await compileModule("src/lib/attachment-url.ts", AUTH_STUBS)
);
const {
  agentAttachmentFromPrivateUpload,
  attachmentDisplayUrl,
  clearAttachmentUrlCache,
  isRawStorageUrl,
  resolveAttachmentDisplayUrl,
} = urlModule;

function hostOf(url) {
  return new URL(url).hostname;
}

async function withFetch(handler, run) {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
  try {
    await run(calls);
  } finally {
    globalThis.fetch = previous;
  }
}

test("raw storage URLs are recognized", () => {
  assert.equal(isRawStorageUrl(RAW), true);
  assert.equal(isRawStorageUrl("https://x.supabase.co/storage/v1/object/sign/project-assets/a?token=t"), true);
  assert.equal(isRawStorageUrl("https://gateway.test/v1/artifact-renditions/access/tok"), false);
  assert.equal(isRawStorageUrl("blob:https://oceanleo.com/1"), false);
});

test("display URL: local blob first, reference has no sync URL, legacy object is gateway-proxied", () => {
  assert.equal(
    attachmentDisplayUrl({ previewUrl: "blob:https://oceanleo.com/1", url: RAW, artifact_id: ART, revision_id: REV }),
    "blob:https://oceanleo.com/1",
  );
  assert.equal(attachmentDisplayUrl({ url: RAW, artifact_id: ART, revision_id: REV }), undefined);
  const legacy = attachmentDisplayUrl({ url: RAW });
  assert.equal(hostOf(legacy), "gateway.test");
  assert.ok(legacy.startsWith("https://gateway.test/v1/media/proxy?url="));
  assert.equal(attachmentDisplayUrl({ url: "/v1/artifact-renditions/access/t" }), "https://gateway.test/v1/artifact-renditions/access/t");
});

test("a private reference resolves to a cached gateway rendition grant", async () => {
  clearAttachmentUrlCache();
  await withFetch(
    () =>
      new Response(
        JSON.stringify({ accessUrl: "/v1/artifact-renditions/access/grant-1", expiresAt: new Date(Date.now() + 300_000).toISOString() }),
        { status: 200 },
      ),
    async (calls) => {
      const att = { url: "", artifact_id: ART, revision_id: REV, mime: "image/png" };
      const first = await resolveAttachmentDisplayUrl(att);
      const second = await resolveAttachmentDisplayUrl(att);
      assert.equal(first, "https://gateway.test/v1/artifact-renditions/access/grant-1");
      assert.equal(second, first);
      assert.equal(calls.length, 1, "the grant is cached until it is about to expire");
      assert.equal(calls[0].init.headers.Authorization, "Bearer owner-token");
      assert.equal(calls[0].url, `https://gateway.test/v1/artifacts/${ART}/revisions/${REV}/renditions/thumbnail?mode=preview`);
    },
  );
});

test("a grant that is not a gateway access path is never shown", async () => {
  clearAttachmentUrlCache();
  await withFetch(
    () => new Response(JSON.stringify({ accessUrl: RAW }), { status: 200 }),
    async () => {
      assert.equal(await resolveAttachmentDisplayUrl({ artifactId: ART, revisionId: REV }), undefined);
    },
  );
});

test("agent attachment from a private upload carries only the reference", () => {
  assert.deepEqual(
    agentAttachmentFromPrivateUpload(
      { id: ART, url: "", title: "bill.pdf", mime: "application/pdf", artifact_id: ART, revision_id: REV },
      { name: "fallback.pdf" },
    ),
    { url: "", artifact_id: ART, revision_id: REV, name: "bill.pdf", mime: "application/pdf", media_type: "doc" },
  );
  assert.equal(agentAttachmentFromPrivateUpload({ id: "x", url: RAW }, { name: "a.png" }), null);
});

// ---------------------------------------------------------------- uploadComposerFile

function databaseStub(responses) {
  globalThis.__w6Uploads = [];
  globalThis.__w6Responses = responses;
  return dataModule(`
    export async function normalizeUploadIdempotencyKey(parts){ return parts.join(":"); }
    export async function uploadFile(file, opts){
      globalThis.__w6Uploads.push({ name: file.name, opts });
      const next = globalThis.__w6Responses.shift();
      return typeof next === "function" ? next(file, opts) : next;
    }
  `);
}

async function compileComposerUpload(responses) {
  return import(
    await compileModule("src/shell/composer-upload.ts", {
      "../lib/database": databaseStub(responses),
      "../lib/attachment-url": dataModule(`
        export const PRIVATE_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
        export const PRIVATE_ATTACHMENT_TOO_LARGE = "文件超过 20MB，暂不支持";
        export function mediaTypeFromMime(m){ return String(m||"").startsWith("image/") ? "image" : "doc"; }
        export function agentAttachmentFromPrivateUpload(u, f){
          if (!u.artifact_id || !u.revision_id) return null;
          return { url: "", artifact_id: u.artifact_id, revision_id: u.revision_id, name: u.title || f.name, mime: u.mime || f.mime };
        }
      `),
      "./artifact-contract": dataModule(`
        export function normalizeArtifactProjectionResult(){ return { ok: false }; }
        export function artifactIsVisible(){ return true; }
      `),
      "./library-data": dataModule("export function artifactProjectionToLibraryItem(x){ return x; }"),
    })
  );
}

const okUpload = {
  ok: true,
  data: { ok: true, file: { id: ART, url: "", title: "a.png", mime: "image/png", artifact_id: ART, revision_id: REV } },
};

test("uploadComposerFile: private route with an idempotency key, reference result", async () => {
  const { uploadComposerFile } = await compileComposerUpload([okUpload]);
  const file = new File([new Uint8Array(10)], "a.png", { type: "image/png", lastModified: 7 });
  const result = await uploadComposerFile(file, { siteId: "oceanleo" });
  assert.equal(result.ok, true);
  assert.equal(result.upload.artifactId, ART);
  assert.equal(result.upload.attachment.url, "");
  assert.equal(result.upload.attachment.artifact_id, ART);
  const call = globalThis.__w6Uploads[0];
  assert.equal(call.opts.privateUpload, true);
  assert.equal(call.opts.idempotencyKey, "composer-upload-v1:oceanleo:a.png:10:7");
});

test("uploadComposerFile: > 20 MB refused before any request", async () => {
  const { uploadComposerFile } = await compileComposerUpload([okUpload]);
  const big = { name: "big.mp4", size: 20 * 1024 * 1024 + 1, type: "video/mp4", lastModified: 1 };
  const result = await uploadComposerFile(big, { siteId: "oceanleo" });
  assert.deepEqual(
    { ok: result.ok, error: result.error, tooLarge: result.tooLarge },
    { ok: false, error: "文件超过 20MB，暂不支持", tooLarge: true },
  );
  assert.equal(globalThis.__w6Uploads.length, 0);
});

test("uploadComposerFile: no artifact ids is a failure, never a public fallback", async () => {
  const { uploadComposerFile } = await compileComposerUpload([
    { ok: true, data: { ok: true, file: { id: "p", url: RAW } } },
  ]);
  const result = await uploadComposerFile(new File(["x"], "a.txt"), { siteId: "oceanleo" });
  assert.equal(result.ok, false);
  assert.equal(globalThis.__w6Uploads.length, 1);
  assert.equal(globalThis.__w6Uploads[0].opts.privateUpload, true);
});

// ---------------------------------------------------------------- useAttachments

async function withDom(run) {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({ window, document: window.document, navigator: window.navigator })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    restore.push(() => {
      if (had) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: previous });
      else delete globalThis[name];
    });
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const previousCreate = URL.createObjectURL;
  let blobSeq = 0;
  URL.createObjectURL = () => `blob:https://oceanleo.test/${++blobSeq}`;
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  try {
    await run(root);
  } finally {
    await act(async () => root.unmount());
    URL.createObjectURL = previousCreate;
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    window.close();
  }
}

test("useAttachments: failed upload stays as a failed tile and retry re-uploads privately", async () => {
  globalThis.__w6Composer = [];
  globalThis.__w6ComposerResults = [
    { ok: false, error: "网络错误" },
    {
      ok: true,
      upload: {
        artifactId: ART,
        revisionId: REV,
        name: "a.png",
        mime: "image/png",
        mediaType: "image",
        libraryItem: { key: "k", artifactId: ART, revisionId: REV },
        attachment: { url: "", artifact_id: ART, revision_id: REV, name: "a.png", mime: "image/png", media_type: "image" },
      },
    },
  ];
  const { useAttachments } = await import(
    await compileModule("src/shell/useAttachments.ts", {
      "./composer-upload": dataModule(`
        export async function uploadComposerFile(file, opts){
          globalThis.__w6Composer.push({ name: file.name, opts });
          return globalThis.__w6ComposerResults.shift();
        }
      `),
      "../lib/attachment-url": await compileModule("src/lib/attachment-url.ts", AUTH_STUBS),
    })
  );
  let hook;
  const errors = [];
  function Probe() {
    hook = useAttachments("oceanleo", (msg) => errors.push(msg));
    return null;
  }
  await withDom(async (root) => {
    await act(async () => root.render(React.createElement(Probe)));
    const file = new File([new Uint8Array(4)], "a.png", { type: "image/png" });
    await act(async () => hook.handleAttachFiles([file]));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    assert.equal(hook.composerAttachments.length, 1, "a failed upload is not dropped");
    assert.equal(hook.composerAttachments[0].failed, true);
    assert.equal(hook.uploading, false);
    assert.deepEqual(hook.ready(), [], "a failed tile is never sent");
    assert.deepEqual(errors, ["网络错误"]);

    const id = hook.composerAttachments[0].id;
    await act(async () => hook.retryAttachment(id));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    assert.equal(globalThis.__w6Composer.length, 2);
    assert.equal(globalThis.__w6Composer[1].opts.siteId, "oceanleo");
    const tile = hook.composerAttachments[0];
    assert.equal(tile.failed, undefined);
    assert.equal(tile.artifactId, ART);
    assert.equal(tile.revisionId, REV);
    assert.equal(tile.libraryItem.key, "k");
    assert.ok(tile.previewUrl.startsWith("blob:"), "the tile thumbnail is the local blob");
    for (const value of [tile.previewUrl, tile.url]) {
      assert.ok(!isRawStorageUrl(value), `no storage URL in UI state: ${value}`);
    }
    assert.deepEqual(hook.ready(), [
      { url: "", artifact_id: ART, revision_id: REV, name: "a.png", mime: "image/png", media_type: "image" },
    ]);
  });
});

test("useAttachments: a legacy public URL from a picked file is gateway-proxied in UI state", async () => {
  const { useAttachments } = await import(
    await compileModule("src/shell/useAttachments.ts", {
      "./composer-upload": dataModule("export async function uploadComposerFile(){ return { ok: false, error: 'x' }; }"),
      "../lib/attachment-url": await compileModule("src/lib/attachment-url.ts", AUTH_STUBS),
    })
  );
  let hook;
  function Probe() {
    hook = useAttachments("site");
    return null;
  }
  await withDom(async (root) => {
    await act(async () => root.render(React.createElement(Probe)));
    await act(async () => hook.addReady({ id: "f1", name: "a.png", previewUrl: RAW, attachment: { url: RAW, name: "a.png" } }));
    const tile = hook.composerAttachments[0];
    assert.equal(hostOf(tile.previewUrl), "gateway.test");
    assert.equal(hostOf(tile.url), "gateway.test");
  });
});
