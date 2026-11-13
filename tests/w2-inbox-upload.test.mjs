import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { UPLOAD_UI_MESSAGES } from "../src/i18n/ui/messages/upload-ui-copy.ts";
import { LOCALES } from "../src/i18n/config.ts";

const { putComputerInbox } = await import(await compileModule("src/lib/cloud-computer-api.ts", {
  "./auth/client": dataModule('export async function accessToken(){return "test-owner";}'),
  "./auth/config": dataModule('export function gatewayBase(){return "https://gateway.test";}'),
}));

class Xhr {
  static instances = [];
  upload = {};
  headers = {};
  constructor() { Xhr.instances.push(this); }
  open(method, url) { this.method = method; this.url = url; }
  setRequestHeader(key, value) { this.headers[key] = value; }
  send(body) { this.body = body; }
  abort() { this.aborted = true; this.onabort?.(); }
  respond(body, status = 200) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.onload();
  }
}
const file = new File(["secret"], "private.png", { type: "image/png" });

async function usingXhr(run) {
  const previous = globalThis.XMLHttpRequest;
  globalThis.XMLHttpRequest = Xhr;
  Xhr.instances = [];
  try { await run(); } finally {
    if (previous === undefined) delete globalThis.XMLHttpRequest;
    else globalThis.XMLHttpRequest = previous;
  }
}

async function latest() {
  await Promise.resolve();
  assert.ok(Xhr.instances.length);
  return Xhr.instances.at(-1);
}

test("inbox sends the stable UUID and session; current responses and progress remain compatible", () => usingXhr(async () => {
  const progress = [];
  const promise = putComputerInbox(" cc_1 ", file, (value) => progress.push(value), {
    task_session_id: "cts_1", upload_id: "11111111-1111-4111-8111-111111111111",
  });
  const xhr = await latest();
  const url = new URL(xhr.url);
  assert.equal(url.pathname, "/v1/computers/cc_1/inbox");
  assert.equal(url.searchParams.get("upload_id"), "11111111-1111-4111-8111-111111111111");
  assert.equal(url.searchParams.get("task_session_id"), "cts_1");
  assert.equal(xhr.method, "PUT");
  assert.equal(xhr.body, file);
  assert.equal(xhr.timeout, 60_000);
  xhr.upload.onprogress({ lengthComputable: true, loaded: 3, total: 6 });
  xhr.upload.onprogress({ lengthComputable: true, loaded: 0, total: 0 });
  xhr.respond({ path: "/home/inbox/private.png" });
  assert.deepEqual(await promise, { path: "/home/inbox/private.png", name: file.name, size: 6, mime: file.type });
  assert.deepEqual(progress, [50, 100]);
}));

test("inbox abort settles immediately and ignores every late event", () => usingXhr(async () => {
  const controller = new AbortController();
  const progress = [];
  const promise = putComputerInbox("cc_1", file, (value) => progress.push(value), { signal: controller.signal });
  const rejected = assert.rejects(promise, (error) => error.code === "client_aborted");
  const xhr = await latest();
  controller.abort();
  await rejected;
  assert.equal(xhr.aborted, true);
  xhr.respond({ path: "/home/inbox/late.png" });
  xhr.ontimeout();
  xhr.onerror();
  xhr.upload.onprogress({ lengthComputable: true, loaded: 6, total: 6 });
  assert.deepEqual(progress, []);
}));

test("already cancelled input never constructs an XHR", () => usingXhr(async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(putComputerInbox("cc_1", file, undefined, { signal: controller.signal }), { code: "client_aborted" });
  assert.equal(Xhr.instances.length, 0);
}));

test("XHR abort and timeout both reject; no unbounded zero timeout is accepted", () => usingXhr(async () => {
  for (const [event, code] of [["onabort", "client_aborted"], ["ontimeout", "client_upload_timeout"]]) {
    const promise = putComputerInbox("cc_1", file, undefined, { timeoutMs: 0 });
    const rejected = assert.rejects(promise, { code });
    const xhr = await latest();
    assert.equal(xhr.timeout, 60_000);
    xhr[event]();
    await rejected;
  }
}));

test("settling a request detaches its abort listener; archive pending, done and failed all allow file use", () => usingXhr(async () => {
  for (const state of ["pending", "done", "failed"]) {
    const controller = new AbortController();
    const promise = putComputerInbox("cc_1", file, undefined, { signal: controller.signal, timeoutMs: 1234 });
    const xhr = await latest();
    assert.equal(xhr.timeout, 1234);
    xhr.respond({ path: "/home/inbox/private.png", archive: { state } });
    const result = await promise;
    assert.equal(result.archive.state, state);
    controller.abort();
    assert.equal(xhr.aborted, undefined, "completed XHR no longer listens for abort");
  }
}));

test("HTTP failure and invalid success path still fail closed", () => usingXhr(async () => {
  for (const [status, body] of [[409, { detail: { code: "node_busy" } }], [200, { path: "https://elsewhere.test/file" }]]) {
    const promise = putComputerInbox("cc_1", file);
    const rejected = assert.rejects(promise);
    (await latest()).respond(body, status);
    await rejected;
  }
}));

test("upload state copy covers every locale and preserves progress interpolation", () => {
  assert.deepEqual(Object.keys(UPLOAD_UI_MESSAGES).sort(), [...LOCALES].sort());
  const sourceKeys = Object.keys(UPLOAD_UI_MESSAGES.zh).sort();
  const originalProgressKeys = ["正在压缩…", "正在上传…", "正在上传 {percent}%", "等待电脑确认…", "上传超时，请重试或移除文件。"];
  for (const key of originalProgressKeys) assert.ok(sourceKeys.includes(key), `original progress copy missing: ${key}`);
  const placeholders = (text) => [...text.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]).sort();
  for (const locale of LOCALES) {
    const messages = UPLOAD_UI_MESSAGES[locale];
    assert.deepEqual(Object.keys(messages).sort(), sourceKeys, `${locale}: exact upload/import key parity`);
    const values = Object.values(messages);
    assert.ok(values.every((value) => typeof value === "string" && value.trim()), locale);
    if (locale !== "zh" && locale !== "zh-TW") assert.ok(values.every((value) => !/[\u3400-\u9fff]/.test(value)), locale);
    for (const key of sourceKeys) assert.deepEqual(placeholders(messages[key]), placeholders(key), `${locale}: ${key}`);
    assert.match(messages["正在上传 {percent}%"], /\{percent\}/);
  }
});
