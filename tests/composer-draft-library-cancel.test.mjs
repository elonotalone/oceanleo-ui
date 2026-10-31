// 2026-10-31 oceanbizs composer fixes (A1 / A2 / A5):
//
//   A1. Refresh keeps the composer's text and its finished private attachments
//       (`draftKey` → sessionStorage). Only references are stored — no bytes, no
//       URLs; uploading / failed / computer-inbox files are not restored. A send
//       that unmounts the composer (home → task conversation) spends the draft.
//   A2. 「＋」→「从资料库添加文件」: the picker lists private Library files and hands
//       the host the same reference shape 「最近文件」 does; shown in the browser
//       menu and in the mobile native branch.
//   A5. An uploading tile has the same × as a finished one; removing it aborts the
//       upload and a late result never brings the tile back.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);

const ART = "11111111-2222-4333-8444-555555555555";
const REV = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const ART2 = "21111111-2222-4333-8444-555555555555";
const REV2 = "76666666-7777-4888-9999-aaaaaaaaaaaa";
const ART3 = "31111111-2222-4333-8444-555555555555";
const REV3 = "86666666-7777-4888-9999-aaaaaaaaaaaa";

const AUTH_STUBS = {
  "./auth/client": dataModule(`
    export async function accessToken(){ return "owner-token"; }
    export function cachedAccessToken(){ return "owner-token"; }
  `),
  "./auth/config": dataModule('export const GATEWAY_BASE = "https://gateway.test";'),
};
const attachmentUrl = await compileModule("src/lib/attachment-url.ts", AUTH_STUBS);
const uiStub = dataModule(`export function useUI(){ return (zh) => zh; }`);
const artifactClientStub = dataModule(`
  export async function getArtifactItem(){ return { ok: false, status: 500 }; }
  export async function listMyArtifacts(){ return { ok: false }; }
`);
const composerUpload = await compileModule("src/shell/composer-upload.ts", {
  "../lib/database": dataModule(`
    export async function normalizeUploadIdempotencyKey(parts){ return parts.join(":"); }
    export async function uploadFile(){ return { ok: false }; }
  `),
  "../lib/attachment-url": attachmentUrl,
  "./artifact-contract": dataModule(`
    export function normalizeArtifactProjectionResult(){ return { ok: false }; }
    export function artifactIsVisible(){ return true; }
  `),
  "./library-data": dataModule("export function artifactProjectionToLibraryItem(x){ return x; }"),
});
const { composerAttachmentFromLibraryItem, agentAttachmentFromComposer } = await import(composerUpload);

const draftModule = await import(
  await compileModule("src/shell/composer-draft.ts", {
    "../lib/attachment-url": attachmentUrl,
    "./composer-upload": composerUpload,
    "./artifact-client": artifactClientStub,
  })
);
const {
  composerDraftStorageKey,
  draftAttachmentsOf,
  readComposerDraft,
  rehydrateDraftAttachments,
  useComposerDraft,
  writeComposerDraft,
} = draftModule;

function libraryItem(artifactId, revisionId, extra = {}) {
  return {
    key: `artifact:${artifactId}`,
    source: "artifact",
    id: artifactId,
    title: "bill.png",
    kind: "image",
    siteId: "oceanleo",
    favorite: false,
    meta: {},
    artifactId,
    revisionId,
    posterUrl: "https://gateway.test/v1/artifact-renditions/access/poster",
    artifact: { artifactId, revisionId, renditions: { source: { mediaType: "image/png" } } },
    ...extra,
  };
}

// ---------------------------------------------------------------- DOM bench

async function withDom(run) {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://oceanleo.com/",
  });
  const { window } = dom;
  // Touch device: no hover, so the tile's × is always rendered.
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    sessionStorage: window.sessionStorage,
  })) {
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
    await run(root, container, window);
  } finally {
    await act(async () => root.unmount());
    URL.createObjectURL = previousCreate;
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    window.close();
  }
}

async function flush(count = 6) {
  for (let i = 0; i < count; i += 1) await act(async () => { await Promise.resolve(); });
}

// ---------------------------------------------------------------- A1 draft

test("A1: only finished private references are stored, without any URL", () => {
  const stored = draftAttachmentsOf([
    { id: "a", name: "a.png", mime: "image/png", previewUrl: "blob:https://x/1", url: "blob:https://x/1", artifactId: ART, revisionId: REV, mediaType: "image", libraryItem: { url: "https://gateway.test/x" } },
    { id: "b", name: "b.png", uploading: true },
    { id: "c", name: "c.png", failed: true, artifactId: ART2, revisionId: REV2 },
    { id: "d", name: "inbox.txt", mime: "text/plain", previewUrl: "blob:https://x/2" },
  ]);
  assert.deepEqual(stored, [
    { id: "a", artifactId: ART, revisionId: REV, name: "a.png", mime: "image/png", mediaType: "image" },
  ]);
});

test("A1: rehydrate re-reads each reference; gone files are dropped, offline keeps the reference", async () => {
  const calls = [];
  const restored = await rehydrateDraftAttachments(
    [
      { id: "up_1", artifactId: ART, revisionId: REV, name: "mine.png", mime: "image/png" },
      { id: "up_2", artifactId: ART2, revisionId: REV2, name: "gone.pdf" },
      { id: "up_3", artifactId: ART3, revisionId: REV3, name: "offline.pdf", mime: "application/pdf" },
    ],
    async (artifactId, revisionId) => {
      calls.push([artifactId, revisionId]);
      if (artifactId === ART) return { ok: true, data: libraryItem(ART, REV) };
      if (artifactId === ART2) return { ok: false, status: 404 };
      throw new Error("offline");
    },
  );
  assert.equal(calls.length, 3);
  assert.deepEqual(restored.map((att) => att.id), ["up_1", "up_3"]);
  const [fresh, refOnly] = restored;
  assert.equal(fresh.name, "mine.png", "the attached name stays");
  assert.equal(fresh.artifactId, ART);
  assert.equal(fresh.revisionId, REV);
  assert.equal(fresh.libraryItem.key, `artifact:${ART}`, "a typed item to open it in the sidebar");
  assert.equal(fresh.previewUrl, "https://gateway.test/v1/artifact-renditions/access/poster");
  assert.deepEqual(refOnly, { id: "up_3", artifactId: ART3, revisionId: REV3, name: "offline.pdf", mime: "application/pdf" });
});

test("A1: useComposerDraft restores text + attachments, saves edits, and a send that unmounts spends it", async () => {
  await withDom(async (root) => {
    const key = composerDraftStorageKey("home");
    writeComposerDraft("home", "写一份周报", [
      { id: "up_1", artifactId: ART, revisionId: REV, name: "mine.png", mime: "image/png" },
    ]);
    let api;
    let state;
    function Probe() {
      const [value, setValue] = React.useState("");
      const [attachments, setAttachments] = React.useState([]);
      const draft = useComposerDraft({
        draftKey: "home",
        value,
        onChange: setValue,
        attachments,
        onAddAttachments: (items) => setAttachments((cur) => [...cur, ...items]),
        fetchItem: async () => ({ ok: true, data: libraryItem(ART, REV) }),
      });
      state = { value, attachments };
      api = { setValue, setAttachments, draft };
      return null;
    }
    await act(async () => root.render(React.createElement(Probe)));
    await flush();
    assert.equal(state.value, "写一份周报", "text is back after the refresh");
    assert.equal(state.attachments.length, 1, "the finished attachment is back");
    assert.equal(state.attachments[0].artifactId, ART);
    assert.equal(state.attachments[0].libraryItem.key, `artifact:${ART}`);

    await act(async () => api.setValue("写一份周报，带图"));
    await act(async () =>
      api.setAttachments((cur) => [...cur, { id: "up_2", name: "late.png", uploading: true }]),
    );
    const saved = readComposerDraft("home");
    assert.equal(saved.text, "写一份周报，带图");
    assert.deepEqual(saved.attachments.map((att) => att.id), ["up_1"], "an uploading file is not stored");
    assert.ok(!sessionStorage.getItem(key).includes("blob:"), "no URL in storage");
    assert.ok(!sessionStorage.getItem(key).includes("https:"), "no URL in storage");

    // Send, then the home page swaps the composer for the task conversation.
    api.draft.markSubmitted();
    await act(async () => root.render(React.createElement("div")));
    assert.equal(sessionStorage.getItem(key), null, "a sent draft never comes back");
  });
});

test("A1: a send whose host clears the composer clears the draft; a restored unsent text keeps it", async () => {
  await withDom(async (root) => {
    let api;
    function Probe() {
      const [value, setValue] = React.useState("");
      const draft = useComposerDraft({ draftKey: "task:t1", value, onChange: setValue });
      api = { setValue, draft };
      return null;
    }
    await act(async () => root.render(React.createElement(Probe)));
    await act(async () => api.setValue("继续"));
    assert.equal(readComposerDraft("task:t1").text, "继续");
    api.draft.markSubmitted();
    await act(async () => api.setValue(""));
    assert.equal(readComposerDraft("task:t1"), null);
    // The server refused it: the host hands the text back (unsentRestored).
    await act(async () => api.setValue("继续"));
    assert.equal(readComposerDraft("task:t1").text, "继续");
  });
});

test("A1: LeoComposer wires draftKey through useComposerDraft and marks the send", () => {
  const source = readFileSync(new URL("../src/shell/LeoComposer.tsx", import.meta.url), "utf8");
  assert.match(source, /useComposerDraft\(\{ draftKey, value, onChange, attachments, onAddAttachments \}\)/);
  assert.match(source, /draft\.markSubmitted\(\);/);
  const home = readFileSync(new URL("../src/shell/HomeIntro.tsx", import.meta.url), "utf8");
  assert.match(home, /draftKey=\{`home:\$\{attachSiteId\}`\}/);
  assert.match(home, /onAddAttachments=\{toolsOn \? atts\.addComposerAttachments : undefined\}/);
});

// ---------------------------------------------------------------- A2 library

test("A2: a Library item becomes the same reference attachment 最近文件 builds", () => {
  const att = composerAttachmentFromLibraryItem(libraryItem(ART, REV));
  assert.deepEqual(
    { id: att.id, name: att.name, mime: att.mime, mediaType: att.mediaType, artifactId: att.artifactId, revisionId: att.revisionId },
    { id: ART, name: "bill.png", mime: "image/png", mediaType: "image", artifactId: ART, revisionId: REV },
  );
  assert.equal(att.libraryItem.key, `artifact:${ART}`);
  assert.equal(
    composerAttachmentFromLibraryItem(libraryItem(ART, REV, { posterUrl: "https://abc.supabase.co/storage/v1/object/x.png" })).previewUrl,
    undefined,
    "a raw storage URL is never a preview",
  );
  assert.equal(composerAttachmentFromLibraryItem({ ...libraryItem("x", "y"), artifact: undefined }), null);
  assert.deepEqual(agentAttachmentFromComposer(att), {
    url: "", artifact_id: ART, revision_id: REV, name: "bill.png", mime: "image/png", media_type: "image",
  });
});

test("A2: the picker lists private Library files, filters, marks attached ones and hands back a pick", async () => {
  const { ComposerLibraryPicker } = await import(
    await compileModule("src/shell/ComposerLibraryPicker.tsx", {
      "../i18n/ui/useUI": uiStub,
      "./composer-upload": composerUpload,
      "./artifact-client": artifactClientStub,
    })
  );
  await withDom(async (root, container, window) => {
    const picks = [];
    const load = async () => ({
      ok: true,
      data: {
        items: [
          libraryItem(ART, REV),
          libraryItem(ART2, REV2, { title: "合同.pdf", kind: "doc", posterUrl: undefined, artifact: { artifactId: ART2, revisionId: REV2, renditions: { source: { mediaType: "application/pdf" } } } }),
          { ...libraryItem("x", "y", { title: "no-ref" }), artifact: undefined },
        ],
      },
    });
    await act(async () =>
      root.render(
        React.createElement(ComposerLibraryPicker, {
          onBack() {},
          onPick: (file) => picks.push(file),
          attachedIds: [ART],
          load,
        }),
      ),
    );
    await flush();
    const rows = () => [...container.querySelectorAll("[data-composer-library-item]")];
    assert.deepEqual(rows().map((row) => row.getAttribute("data-composer-library-item")), [ART, ART2]);
    assert.equal(rows()[0].disabled, true, "an attached file is not added twice");

    const input = container.querySelector("input");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    await act(async () => {
      setter.call(input, "合同");
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    assert.deepEqual(rows().map((row) => row.getAttribute("data-composer-library-item")), [ART2]);
    await act(async () => rows()[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    assert.equal(picks.length, 1);
    assert.equal(picks[0].artifactId, ART2);
    assert.equal(picks[0].mime, "application/pdf");
  });
});

test("A2: 「从资料库添加文件」 sits in the browser menu and the mobile native branch", () => {
  const source = readFileSync(new URL("../src/shell/LeoComposer.tsx", import.meta.url), "utf8");
  const at = source.indexOf('label={tt("从资料库添加文件")}');
  assert.ok(at > 0, "menu row exists");
  const guard = source.lastIndexOf("{onAddAttachments && (", at);
  const nativeOnly = source.lastIndexOf("nativeActions.length === 0", at);
  assert.ok(guard > nativeOnly, "not inside the browser-only 「从本地添加文件」 branch");
  assert.match(source, /Boolean\(onAddAttachments\) \|\|/, "the 「＋」 key shows for it alone");
});

test("A2: useAttachments adds a picked Library file as a ready reference", async () => {
  const { useAttachments } = await import(
    await compileModule("src/shell/useAttachments.ts", {
      "./composer-upload": dataModule("export async function uploadComposerFile(){ return { ok: false, error: 'x' }; }"),
      "../lib/attachment-url": attachmentUrl,
    })
  );
  let hook;
  function Probe() {
    hook = useAttachments("oceanleo");
    return null;
  }
  await withDom(async (root) => {
    await act(async () => root.render(React.createElement(Probe)));
    const picked = composerAttachmentFromLibraryItem(libraryItem(ART, REV));
    await act(async () => hook.addComposerAttachments([picked, picked, { id: "no-ref", name: "x" }]));
    assert.equal(hook.composerAttachments.length, 1);
    assert.equal(hook.composerAttachments[0].artifactId, ART);
    assert.deepEqual(hook.ready(), [
      { url: "", artifact_id: ART, revision_id: REV, name: "bill.png", mime: "image/png", media_type: "image" },
    ]);
  });
});

// ---------------------------------------------------------------- A5 cancel

test("A5: removing an uploading tile aborts its upload; the late result never re-adds it", async () => {
  globalThis.__a5Uploads = [];
  const { useAttachments } = await import(
    await compileModule("src/shell/useAttachments.ts", {
      "./composer-upload": dataModule(`
        export function uploadComposerFile(file, opts){
          return new Promise((resolve) => globalThis.__a5Uploads.push({ file, opts, resolve }));
        }
      `),
      "../lib/attachment-url": attachmentUrl,
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
    await act(async () => hook.handleAttachFiles([new File([new Uint8Array(4)], "a.png", { type: "image/png" })]));
    assert.equal(hook.composerAttachments[0].uploading, true);
    const [upload] = globalThis.__a5Uploads;
    assert.ok(upload.opts.signal, "the upload is abortable");

    await act(async () => hook.removeAttachment(hook.composerAttachments[0].id));
    assert.equal(upload.opts.signal.aborted, true);
    assert.equal(hook.composerAttachments.length, 0);
    assert.equal(hook.uploading, false, "sending is no longer blocked");

    await act(async () => {
      upload.resolve({ ok: false, error: "aborted" });
      await Promise.resolve();
    });
    assert.equal(hook.composerAttachments.length, 0, "a late result never brings it back");
    assert.deepEqual(errors, [], "a cancelled upload is not reported as a failure");
  });
});

test("A5: an uploading tile renders the same × as a finished one", async () => {
  const { AttachmentStrip } = await import(
    await compileModule("src/shell/AttachmentStrip.tsx", {
      "../i18n/ui/useUI": uiStub,
      "../lib/attachment-url": attachmentUrl,
    })
  );
  await withDom(async (root, container, window) => {
    const removed = [];
    await act(async () =>
      root.render(
        React.createElement(AttachmentStrip, {
          attachments: [
            { id: "up", name: "a.png", mime: "image/png", previewUrl: "blob:https://x/1", uploading: true },
            { id: "done", name: "b.png", mime: "image/png", previewUrl: "blob:https://x/2" },
          ],
          onRemove: (id) => removed.push(id),
        }),
      ),
    );
    const uploading = container.querySelector('[data-upload-tile="uploading"]');
    const ready = container.querySelector('[data-upload-tile="ready"]');
    assert.ok(uploading.querySelector("[data-upload-remove]"), "× on the uploading tile");
    assert.ok(ready.querySelector("[data-upload-remove]"), "× on the finished tile");
    await act(async () =>
      uploading.querySelector("[data-upload-remove]").dispatchEvent(new window.MouseEvent("click", { bubbles: true })),
    );
    assert.deepEqual(removed, ["up"]);
  });
});
