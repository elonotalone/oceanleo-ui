// W09：聊天附件上传——init → 直传 → finalize 的顺序、取消、超 100MB 拒绝、进度。
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const upload = await import(
  await compileModule("src/shell/messages/composer/upload.ts", {
    "../../../lib/im/messages-api": dataModule("export const messagesApi = {};"),
    "../../../lib/upload/progress": dataModule("export const xhrUpload = async () => ({ ok: true });"),
  })
);
const { MAX_UPLOAD_BYTES, UploadError, attachmentKindFor, checkUploadable, messageKindForAttachments, uploadAttachment } = upload;

function fakeFile(size, overrides = {}) {
  return { name: "报告.pdf", size, type: "application/pdf", ...overrides };
}

function makeDeps(log, options = {}) {
  return {
    api: {
      async uploadInit(input) {
        log.push(["init", input]);
        if (options.initFails) throw Object.assign(new Error("x"), { code: "rate_limited" });
        return { upload_url: "https://storage.example/upload/abc", finalize_token: "tok-1", upload_complete: options.alreadyComplete };
      },
      async uploadFinalize(token) {
        log.push(["finalize", token]);
        if (options.finalizeFails) throw new Error("x");
        return { kind: "file", url: "https://storage.example/obj/abc", name: "报告.pdf", size: 10, mime: "application/pdf" };
      },
    },
    async transfer(request) {
      log.push(["transfer", request.method, request.url]);
      request.onProgress?.(5, 10);
      request.onProgress?.(10, 10);
      if (options.hang) {
        await new Promise((resolve) => request.signal.addEventListener("abort", resolve));
        return { ok: false, status: 0, responseText: "", aborted: true, networkError: false };
      }
      if (options.transferStatus) return { ok: false, status: options.transferStatus, responseText: "", aborted: false, networkError: false };
      return { ok: true, status: 200, responseText: "", aborted: false, networkError: false };
    },
  };
}

test("顺序：init → 直传（PUT 到 upload_url）→ finalize，并上报进度", async () => {
  const log = [];
  const progress = [];
  const attachment = await uploadAttachment(fakeFile(10), {
    deps: makeDeps(log),
    onProgress: (ratio) => progress.push(ratio),
  });
  assert.deepEqual(
    log.map((entry) => entry[0]),
    ["init", "transfer", "finalize"],
  );
  assert.equal(log[0][1].size, 10);
  assert.equal(log[0][1].mime, "application/pdf");
  assert.equal(log[0][1].kind, "file");
  assert.deepEqual(log[1].slice(1), ["PUT", "https://storage.example/upload/abc"]);
  assert.equal(log[2][1], "tok-1");
  assert.equal(attachment.url, "https://storage.example/obj/abc");
  assert.equal(progress[0], 0.5);
  assert.equal(progress.at(-1), 1);
});

test("超过 100MB：直接拒绝，一个请求都不发", async () => {
  const log = [];
  await assert.rejects(
    uploadAttachment(fakeFile(MAX_UPLOAD_BYTES + 1), { deps: makeDeps(log) }),
    (error) => error instanceof UploadError && error.code === "too_large",
  );
  assert.equal(log.length, 0);
  // 刚好 100MB 允许
  assert.equal(checkUploadable({ size: MAX_UPLOAD_BYTES }), null);
  assert.equal(MAX_UPLOAD_BYTES, 100 * 1024 * 1024);
});

test("空文件拒绝", async () => {
  const log = [];
  await assert.rejects(uploadAttachment(fakeFile(0), { deps: makeDeps(log) }), (error) => error.code === "empty");
  assert.equal(log.length, 0);
});

test("传输途中取消：不会再 finalize", async () => {
  const log = [];
  const controller = new AbortController();
  const pending = uploadAttachment(fakeFile(10), { deps: makeDeps(log, { hang: true }), signal: controller.signal });
  await new Promise((resolve) => setTimeout(resolve, 5));
  controller.abort();
  await assert.rejects(pending, (error) => error instanceof UploadError && error.code === "cancelled");
  assert.ok(!log.some((entry) => entry[0] === "finalize"));
});

test("开始前就取消：不发 init", async () => {
  const log = [];
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(uploadAttachment(fakeFile(10), { deps: makeDeps(log), signal: controller.signal }), (error) => error.code === "cancelled");
  assert.equal(log.length, 0);
});

test("各步失败给出对应错误码，且不继续往下走", async () => {
  const a = [];
  await assert.rejects(uploadAttachment(fakeFile(10), { deps: makeDeps(a, { initFails: true }) }), (e) => e.code === "init_failed");
  assert.deepEqual(a.map((x) => x[0]), ["init"]);
  const b = [];
  await assert.rejects(uploadAttachment(fakeFile(10), { deps: makeDeps(b, { transferStatus: 403 }) }), (e) => e.code === "transfer_failed");
  assert.ok(!b.some((x) => x[0] === "finalize"));
  const c = [];
  await assert.rejects(uploadAttachment(fakeFile(10), { deps: makeDeps(c, { finalizeFails: true }) }), (e) => e.code === "finalize_failed");
});

test("断点续传命中（upload_complete）：跳过直传直接 finalize", async () => {
  const log = [];
  await uploadAttachment(fakeFile(10), { deps: makeDeps(log, { alreadyComplete: true }) });
  assert.deepEqual(log.map((x) => x[0]), ["init", "finalize"]);
});

test("附件类型：图片/视频/音频/文件；SVG 一律当文件（不内联预览）", () => {
  assert.equal(attachmentKindFor({ name: "a.png", type: "image/png" }), "image");
  assert.equal(attachmentKindFor({ name: "a.svg", type: "image/svg+xml" }), "file");
  assert.equal(attachmentKindFor({ name: "a.mp4", type: "video/mp4" }), "video");
  assert.equal(attachmentKindFor({ name: "a.mp3", type: "audio/mpeg" }), "audio");
  assert.equal(attachmentKindFor({ name: "a.html", type: "text/html" }), "file");
  const img = { kind: "image" };
  assert.equal(messageKindForAttachments([img, img]), "image");
  assert.equal(messageKindForAttachments([img, { kind: "file" }]), "file");
});

test("指定 kind（语音）会原样传给 init", async () => {
  const log = [];
  await uploadAttachment(fakeFile(10, { type: "audio/webm", name: "voice.webm" }), { deps: makeDeps(log), kind: "voice" });
  assert.equal(log[0][1].kind, "voice");
});
