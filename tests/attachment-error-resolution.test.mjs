import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { rememberImagePreparation } from "../src/lib/upload/image-preparation.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const attachmentUrl = await compileModule("src/lib/attachment-url.ts", {
  "./auth/client": dataModule('export async function accessToken(){return "test-owner";}'),
  "./auth/config": dataModule('export const GATEWAY_BASE="https://gateway.test";'),
});
const { PRIVATE_ATTACHMENT_MAX_BYTES, PRIVATE_ATTACHMENT_TOO_LARGE } = await import(attachmentUrl);
const { useAttachments } = await import(await compileModule("src/shell/useAttachments.ts", {
  "../lib/attachment-url": attachmentUrl,
  "./composer-upload": dataModule(`
    export function uploadComposerFile(file, options) {
      return new Promise((resolve, reject) => globalThis.__w3ErrorUploads.push({file, options, resolve, reject}));
    }
  `),
}));

const file = (name = "photo.jpg") => new File(["image bytes"], name, { type: "image/jpeg" });
function oversizedFile() {
  const result = file("too-large.jpg");
  Object.defineProperty(result, "size", { value: PRIVATE_ATTACHMENT_MAX_BYTES + 1 });
  return result;
}
function success(name = "photo.jpg") {
  return { ok: true, upload: {
    name, mime: "image/jpeg", artifactId: "11111111-2222-4333-8444-555555555555",
    revisionId: "66666666-7777-4888-9999-aaaaaaaaaaaa",
    attachment: { url: "", artifact_id: "11111111-2222-4333-8444-555555555555",
      revision_id: "66666666-7777-4888-9999-aaaaaaaaaaaa" },
  } };
}

async function mount() {
  const uploads = globalThis.__w3ErrorUploads = [];
  const errors = [], resolved = [];
  let hook, state, setChatError;
  function Probe() {
    const [uploadError, setUploadError] = React.useState(null);
    const [chatError, updateChatError] = React.useState(null);
    setChatError = updateChatError;
    state = { uploadError, chatError };
    hook = useAttachments("oceanleo", (message) => {
      errors.push(message);
      setUploadError(message);
    }, (message) => {
      resolved.push(message);
      setUploadError((current) => current === message ? null : current);
    });
    return null;
  }
  const originalCreate = URL.createObjectURL;
  URL.createObjectURL = () => "blob:https://oceanleo.test/local";
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(Probe))));
  return {
    uploads, errors, resolved, get hook() { return hook; }, get state() { return state; },
    async select(files) { await act(async () => hook.handleAttachFiles(files)); },
    async settle(index, result) { await act(async () => uploads[index].resolve(result)); },
    async fail(index, error) { await this.settle(index, { ok: false, error }); },
    async reject(index) { await act(async () => uploads[index].reject(new Error("transport failed"))); },
    async retry(id) { await act(async () => hook.retryAttachment(id)); },
    async remove(id) { await act(async () => hook.removeAttachment(id)); },
    async clear() { await act(async () => hook.clear()); },
    async chatError(message) { await act(async () => setChatError(message)); },
    async close() {
      await act(async () => root.unmount());
      container.remove();
      URL.createObjectURL = originalCreate;
    },
  };
}

test("a failed upload resolves once at retry, stays resolved after success, and retains its exact original", async () => {
  const view = await mount();
  try {
    const prepared = file(), original = file("original.jpg");
    const dimensions = { originalWidth: 4032, originalHeight: 3024, width: 2560, height: 1920 };
    rememberImagePreparation({ original, upload: prepared, compressed: true, originalBytes: original.size,
      uploadBytes: prepared.size, dimensions, skippedReason: null });
    const clear = view.hook.clear, remove = view.hook.removeAttachment;
    await view.select([prepared]);
    await view.fail(0, "retry this upload");
    const id = view.hook.attachments[0].id;
    assert.equal(view.state.uploadError, "retry this upload");
    assert.equal(view.hook.composerAttachments[0].failedReason, "retry this upload");
    await view.retry(id);
    assert.deepEqual(view.resolved, ["retry this upload"]);
    assert.equal(view.state.uploadError, null);
    assert.equal(view.hook.composerAttachments[0].uploading, true);
    assert.equal(view.hook.composerAttachments[0].failedReason, undefined);
    assert.equal(view.hook.composerAttachments[0].originalFile, original);
    assert.deepEqual(view.hook.composerAttachments[0].preparedDimensions, dimensions);
    assert.equal(view.hook.clear, clear, "host error rerenders retain the existing stable clear callback");
    assert.equal(view.hook.removeAttachment, remove);
    await view.settle(1, success());
    assert.equal(view.hook.ready().length, 1);
    assert.equal(view.hook.composerAttachments[0].originalFile, original);
    assert.deepEqual(view.errors, ["retry this upload"]);
    assert.deepEqual(view.resolved, ["retry this upload"], "success does not resolve the same failure twice");
  } finally { await view.close(); }
});

test("removing an older different failure preserves the current upload and unrelated chat errors", async () => {
  const view = await mount();
  try {
    await view.select([file("a.jpg"), file("b.jpg")]);
    const [a, b] = view.hook.attachments;
    await view.fail(0, "first upload failed");
    await view.fail(1, "second upload failed");
    await view.chatError("model unavailable");
    await view.remove(a.id);
    assert.deepEqual(view.resolved, ["first upload failed"]);
    assert.equal(view.state.uploadError, "second upload failed");
    assert.equal(view.state.chatError, "model unavailable");
    await view.remove(b.id);
    await view.remove(b.id);
    assert.deepEqual(view.resolved, ["first upload failed", "second upload failed"]);
    assert.equal(view.state.uploadError, null);
    assert.equal(view.state.chatError, "model unavailable");
  } finally { await view.close(); }
});

test("retry and success do not resolve a message still owned by a sibling failed tile", async () => {
  const view = await mount();
  try {
    await view.select([file("a.jpg"), file("b.jpg")]);
    const [a, b] = view.hook.attachments;
    await act(async () => {
      for (const upload of view.uploads) upload.resolve({ ok: false, error: "shared upload failure" });
    });
    await view.retry(a.id);
    assert.deepEqual(view.resolved, []);
    assert.equal(view.state.uploadError, "shared upload failure");
    await view.settle(2, success("a.jpg"));
    assert.deepEqual(view.resolved, []);
    assert.equal(view.hook.attachments.find((item) => item.id === b.id).failed, true);
    await view.remove(b.id);
    assert.deepEqual(view.resolved, ["shared upload failure"]);
    assert.equal(view.state.uploadError, null);
  } finally { await view.close(); }
});

test("clear resolves each distinct failure and validation once, aborting pending work and ignoring its late rejection", async () => {
  const view = await mount();
  try {
    await view.select([file("a.jpg"), file("b.jpg"), file("c.jpg"), file("pending.jpg")]);
    await view.fail(0, "same failure");
    await view.fail(1, "same failure");
    await view.reject(2);
    await view.select([oversizedFile()]);
    await view.clear();
    assert.deepEqual(new Set(view.resolved), new Set(["same failure", "文件上传失败", PRIVATE_ATTACHMENT_TOO_LARGE]));
    assert.equal(view.resolved.length, 3, "StrictMode does not duplicate callback side effects");
    assert.equal(view.uploads[3].options.signal.aborted, true);
    assert.equal(view.hook.attachments.length, 0);
    assert.equal(view.state.uploadError, null);
    const reported = [...view.errors];
    await view.reject(3);
    await view.clear();
    assert.deepEqual(view.errors, reported);
    assert.equal(view.resolved.length, 3);
    assert.deepEqual(view.hook.ready(), []);
  } finally { await view.close(); }
});

for (const late of ["success", "failure"]) {
  test(`a removed retry's late ${late} cannot resolve a newer sibling error with the same message`, async () => {
    const view = await mount();
    try {
      await view.select([file("a.jpg"), file("b.jpg")]);
      const [a, b] = view.hook.attachments;
      await view.fail(0, "shared failure");
      await view.retry(a.id);
      assert.deepEqual(view.resolved, ["shared failure"]);
      await view.fail(1, "shared failure");
      await view.remove(a.id);
      assert.equal(view.uploads[2].options.signal.aborted, true);
      await view.settle(2, late === "success" ? success() : { ok: false, error: "obsolete failure" });
      assert.deepEqual(view.resolved, ["shared failure"]);
      assert.deepEqual(view.errors, ["shared failure", "shared failure"]);
      assert.equal(view.state.uploadError, "shared failure");
      assert.deepEqual(view.hook.attachments.map((item) => item.id), [b.id]);
      await view.remove(b.id);
      assert.deepEqual(view.resolved, ["shared failure", "shared failure"]);
    } finally { await view.close(); }
  });
}

test("known oversize validation resolves on a valid selection or clear, not an empty or mixed invalid selection", async () => {
  const view = await mount();
  try {
    await view.select([oversizedFile()]);
    assert.equal(view.uploads.length, 0);
    assert.equal(view.hook.attachments.length, 0);
    await view.select([]);
    await view.select([file(), oversizedFile()]);
    assert.deepEqual(view.resolved, []);
    assert.equal(view.state.uploadError, PRIVATE_ATTACHMENT_TOO_LARGE);
    await view.select([file("valid.jpg")]);
    assert.deepEqual(view.resolved, [PRIVATE_ATTACHMENT_TOO_LARGE]);
    assert.equal(view.state.uploadError, null);
    await view.select([oversizedFile()]);
    await view.clear();
    assert.deepEqual(view.resolved, [PRIVATE_ATTACHMENT_TOO_LARGE, PRIVATE_ATTACHMENT_TOO_LARGE]);
  } finally { await view.close(); }
});

test("a valid selection cannot resolve oversize text still owned by an actual failed tile", async () => {
  const view = await mount();
  try {
    await view.select([file()]);
    const id = view.hook.attachments[0].id;
    await view.fail(0, PRIVATE_ATTACHMENT_TOO_LARGE);
    await view.select([oversizedFile()]);
    await view.select([file("valid.jpg")]);
    assert.deepEqual(view.resolved, []);
    assert.equal(view.state.uploadError, PRIVATE_ATTACHMENT_TOO_LARGE);
    await view.remove(id);
    assert.deepEqual(view.resolved, [PRIVATE_ATTACHMENT_TOO_LARGE]);
    assert.equal(view.state.uploadError, null);
  } finally { await view.close(); }
});
