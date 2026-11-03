import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const stubs = {
  "../i18n/ui/useUI": dataModule('export function useUI(){return (s, vars) => s.replace(/\\{(\\w+)\\}/g, (_, k) => String(vars?.[k] ?? k));}'),
  "../lib/attachment-url": dataModule('export function useAttachmentDisplayUrl(){return undefined;} export function attachmentRef(){return null;} export function attachmentDisplayUrl(a){return a.url || a.previewUrl;} export async function resolveAttachmentDisplayUrl(){throw Error("pending attachment resolved URL");}'),
  "./WorkspaceLibrary": dataModule('export function WorkspaceLibrary(){throw Error("pending attachment opened local viewer");}'),
  "./TaskWorkspaceShell": dataModule('export function attachmentWorkspaceItem(a){return {id:a.id,kind:"image",url:a.url || a.previewUrl,meta:{}};} export function attachmentOpenMode(){return "preview";}'),
  "./artifact-client": dataModule('export async function getArtifactItem(){throw Error("pending attachment read Library");}'),
};
const { AttachmentStrip } = await import(await compileModule("src/shell/AttachmentStrip.tsx", stubs));
const { UploadTile } = await import(await compileModule("src/lib/upload/upload-tile.tsx", stubs));
const { immediateTaskAttachment, resolveTaskAttachment, useTaskAttachmentOpener } = await import(await compileModule("src/shell/task-attachment-open.ts", stubs));
const h = React.createElement;

async function render(element, run) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const update = async (next) => act(async () => root.render(next));
  try { await update(element); await run(container, update); }
  finally { await act(async () => root.unmount()); container.remove(); }
}

const snapshot = (ratio) => ({ loaded: ratio * 100, total: 100, ratio, elapsedMs: 10, remainingMs: null, bytesPerSecond: 0, done: false, failed: false });

test("all four chip states: only ready opens; upload progress, remove and retry stay usable", async () => {
  const opened = [], removed = [], retried = [], cancelled = [];
  const attachments = [
    { id: "up", name: "up.png", mime: "image/png", previewUrl: "blob:up", uploading: true, progress: snapshot(0.42) },
    { id: "ready", name: "ready.png", mime: "image/png", previewUrl: "blob:ready" },
    { id: "bad", name: "bad.png", mime: "image/png", previewUrl: "blob:bad", failed: true },
  ];
  const pending = new window.File(["image"], "compress.png", { type: "image/png" });
  const previousCreate = URL.createObjectURL, previousRevoke = URL.revokeObjectURL;
  const revoked = [];
  URL.createObjectURL = () => "blob:compress";
  URL.revokeObjectURL = (url) => revoked.push(url);
  try {
    await render(h(AttachmentStrip, { attachments, pendingFiles: [pending], onRemovePending: (file) => cancelled.push(file), onOpenAttachment: (item) => opened.push(item.id), onRemove: (id) => removed.push(id), onRetry: (id) => retried.push(id) }), async (container) => {
      assert.deepEqual([...container.querySelectorAll("[data-upload-tile]")].map((el) => el.dataset.uploadTile), ["uploading", "ready", "failed", "compressing"]);
      for (const state of ["uploading", "failed", "compressing"]) {
        assert.equal(container.querySelector(`[data-upload-tile="${state}"] button[aria-label$=".png"]`), null, state);
      }
      const up = container.querySelector('[data-upload-tile="uploading"]');
      assert.equal(up.querySelector('[role="progressbar"]').getAttribute("aria-valuenow"), "42");
      await act(async () => {
        up.querySelector("[data-upload-remove]").click();
        container.querySelector('[data-upload-tile="compressing"] [data-upload-remove]').click();
        container.querySelector("[data-upload-retry]").click();
        container.querySelector('[data-upload-tile="ready"] button[aria-label="ready.png"]').click();
      });
      assert.deepEqual(removed, ["up"]);
      assert.deepEqual(cancelled, [pending]);
      assert.deepEqual(retried, ["bad"]);
      assert.deepEqual(opened, ["ready"]);
    });
    assert.deepEqual(revoked, ["blob:compress"]);
  } finally { URL.createObjectURL = previousCreate; URL.revokeObjectURL = previousRevoke; }
});

test("UploadTile independently blocks onOpen during compression, uploading and failure", async () => {
  const opened = [];
  const component = (state, ratio = 0.5) => h(UploadTile, { name: "image.png", mime: "image/png", previewUrl: "blob:tile", state, progress: snapshot(ratio), onOpen: () => opened.push(state), tt: (s) => s });
  await render(component("uploading", 1), async (container, update) => {
    assert.match(container.querySelector('[data-upload-tile]').title, /等待电脑确认/);
    for (const state of ["compressing", "uploading", "failed"]) {
      await update(component(state));
      assert.equal(container.querySelector("button"), null, state);
    }
    await update(component("ready"));
    await act(async () => container.querySelector("button").click());
    assert.deepEqual(opened, ["ready"]);
  });
});

test("deferred files have no preview target while remaining sendable", async () => {
  const held = { id: "held", name: "held.png", mime: "image/png", previewUrl: "blob:held", uploading: false, openingDisabled: true };
  await render(h(AttachmentStrip, { attachments: [held], onOpenAttachment: () => { throw Error("held file opened"); } }), async (container) => {
    assert.ok(container.querySelector('[data-upload-tile="ready"]'), "no upload spinner before session creation");
    assert.equal(container.querySelector("button"), null);
  });
});

test("direct resolvers reject in-progress files even with a blob, Library item or durable reference", async () => {
  const never = () => { throw Error("pending files must not resolve URLs or read Library"); };
  for (const flags of [{ uploading: true }, { failed: true }, { openingDisabled: true }, { state: "compressing" }, { id: "pending:blob:1" }]) {
    const attachment = { id: "x", name: "image.png", previewUrl: "blob:x", artifactId: "a", revisionId: "r", libraryItem: { id: "library", kind: "image" }, ...flags };
    assert.equal(immediateTaskAttachment(attachment), null);
    assert.equal(await resolveTaskAttachment(attachment, "oceanleo", { loadLibraryItem: never, resolveUrl: never, loadNativeArchive: never }), null);
  }
});

test("shared hook does not navigate to Library or preview for pending images and files", async () => {
  const shown = [], library = [];
  let open;
  function Probe() { open = useTaskAttachmentOpener("oceanleo", (item) => shown.push(item), (action) => library.push(action)); return null; }
  await render(h(Probe), async () => {
    for (const mime of ["image/png", "application/pdf"]) {
      assert.equal(await open({ id: "x", uploading: true, mime, previewUrl: "blob:x", artifactId: "a", revisionId: "r" }), false);
    }
    assert.deepEqual(shown, []);
    assert.deepEqual(library, []);
  });
});
