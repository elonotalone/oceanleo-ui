// W1 2026-10-31: native-session attachments.
// - a prompt the gateway refuses before acknowledging it puts its text and
//   attachments back in the composer (and drops the echo bubble);
// - gateway faults read as the server's fault, never "your computer's program";
// - open_session never spins forever (20 s → retry once → stop with a notice);
// - picked images keep a local blob: thumbnail through the bubble.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test, { mock } from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { applyDialog, initialDialogState } from "../src/shell/cloud-computer/agent-dialog/reduce.ts";
import { GATEWAY_ERROR_COPY, noticeCopy, UNSENT_RESTORED_COPY } from "../src/shell/cloud-computer/agent-dialog/notice.ts";
import { isLocalBlobPreview, mergeLocalPreviews, safeImagePreview, userAttachments } from "../src/shell/cloud-computer/agent-dialog/message-attachments.ts";
import { dialogToAgentMessages } from "../src/shell/native-thread/map-dialog.ts";
import { NATIVE_ATTACHMENTS_MESSAGES } from "../src/i18n/ui/messages/native-attachments-copy.ts";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://oceanleo.com/" });
const { window } = dom;
for (const [name, value] of Object.entries({
  window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement,
  Element: window.Element, Node: window.Node, Event: window.Event, MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent, File: window.File, Blob: window.Blob,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let blobSeq = 0;
const revoked = [];
const previousCreate = URL.createObjectURL;
const previousRevoke = URL.revokeObjectURL;
URL.createObjectURL = () => `blob:https://oceanleo.com/0000aaaa-0000-4000-8000-${String(++blobSeq).padStart(12, "0")}`;
URL.revokeObjectURL = (url) => { revoked.push(url); };

class FakeSocket {
  static sockets = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.listeners = new Map();
    FakeSocket.sockets.push(this);
    queueMicrotask(() => {
      if (this.readyState === 3) return;
      this.readyState = 1;
      this.emit("open", {});
    });
  }
  addEventListener(type, fn, options) {
    const once = Boolean(options && options.once);
    const wrapped = (event) => {
      if (once) this.removeEventListener(type, wrapped);
      fn(event);
    };
    wrapped.original = fn;
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), wrapped]);
  }
  removeEventListener(type, fn) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== fn && item.original !== fn));
  }
  send(data) {
    const frame = JSON.parse(data);
    this.sent.push(frame);
    if (frame.t === "occupancy") {
      queueMicrotask(() => {
        if (this.readyState === 1) this.server({ t: "occupancy", program: frame.program, busy: [] });
      });
    }
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit("close", {});
  }
  emit(type, event) {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event);
  }
  server(frame) {
    this.emit("message", { data: JSON.stringify(frame) });
  }
}
FakeSocket.OPEN = 1;
globalThis.WebSocket = FakeSocket;
window.WebSocket = FakeSocket;

class FakeXhr {
  static instances = [];
  constructor() {
    this.upload = { onprogress: null };
    this.headers = {};
    FakeXhr.instances.push(this);
  }
  open(method, url) { this.method = method; this.url = url; }
  setRequestHeader(name, value) { this.headers[name] = value; }
  send(body) { this.body = body; }
  abort() {}
  succeed(payload) {
    this.status = 200;
    this.responseText = JSON.stringify(payload);
    this.onload?.();
  }
}
const previousXhr = globalThis.XMLHttpRequest;
globalThis.XMLHttpRequest = FakeXhr;

const reactUrl = pathToFileURL(require.resolve("react")).href;
const uiStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function useUI() { return (value) => value; }
`);
const authStub = dataModule(`
  export async function accessToken() { return "tok"; }
  export function cachedAccessToken() { return "tok"; }
`);
const configStub = dataModule(`export const GATEWAY_BASE = "https://gw.test";`);
const agentStub = dataModule(`
  export async function getTask() { return { ok: false, data: null }; }
  export async function stopTask() { return { ok: false }; }
`);
const computerAgentStub = dataModule(`
  export async function agentState() { return { ok: false, error: "off" }; }
  export async function agentTurn() { return { ok: false, error: "off" }; }
  export async function agentReset() { return { ok: false, error: "off" }; }
`);
const { useAgentDialog, distinctName, SESSION_LOAD_TIMEOUT_MS } = await import(
  await compileModule("src/shell/cloud-computer/agent-dialog/useAgentDialogController.tsx", {
    "../../../i18n/ui/useUI": uiStub,
    "../../../lib/auth/client": authStub,
    "./auth/client": authStub,
    "./auth/config": configStub,
    "../../../lib/agent": agentStub,
    "../../../lib/cloud-computer-agent-api": computerAgentStub,
  })
);

async function flush(rounds = 6) {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

async function until(fn, label) {
  for (let i = 0; i < 80; i += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    if (fn()) return;
  }
  throw new Error(label);
}

async function mount(options = {}) {
  FakeSocket.sockets.length = 0;
  FakeXhr.instances.length = 0;
  const box = { latest: null };
  function Probe() {
    box.latest = useAgentDialog({ computerId: "cc_1", sessionId: "sid_1", enabled: true, initialProgram: "cursor", openActiveSession: false, ...options });
    return null;
  }
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(Probe)); });
  await until(() => FakeSocket.sockets.some((socket) => socket.readyState === 1), "socket open");
  await until(() => box.latest.occupancyAt != null, "occupancy idle");
  const socket = () => [...FakeSocket.sockets].reverse().find((item) => item.readyState === 1);
  return {
    box,
    socket,
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

async function attachAndSend(view, names = ["shot.png"], text = "look") {
  const files = names.map((name) => new File([new Uint8Array(4)], name, { type: "image/png" }));
  await act(async () => { view.box.latest.addAttachments(files); });
  await until(() => FakeXhr.instances.length === files.length, "inbox xhr");
  const paths = [];
  await act(async () => {
    FakeXhr.instances.forEach((xhr, index) => {
      const name = new URL(xhr.url).searchParams.get("name");
      const path = `/root/oceanleo-inbox/20261031T010203Z-${name}`;
      paths.push(path);
      xhr.succeed({ path, name, size: 4, mime: "image/png" });
    });
  });
  await until(() => view.box.latest.attachments.every((item) => item.state === "done"), "uploads done");
  await act(async () => { view.box.latest.setDraft(text); });
  let sent;
  await act(async () => { sent = await view.box.latest.send(); });
  assert.equal(sent, true);
  const prompt = view.socket().sent.filter((frame) => frame.t === "prompt").at(-1);
  assert.ok(prompt);
  return { prompt, paths };
}

test("gateway refusal before acknowledgement puts text and attachments back", async () => {
  const view = await mount();
  try {
    const { prompt, paths } = await attachAndSend(view);
    assert.equal(view.box.latest.draft, "");
    assert.equal(view.box.latest.attachments.length, 0);
    const echo = view.box.latest.messages.filter((m) => m.kind === "user");
    assert.equal(echo.length, 1);
    assert.match(echo[0].attachments[0].preview, /^blob:/, "picked image keeps a local thumbnail");
    await act(async () => {
      view.socket().server({ t: "error", code: "gateway_error", program: "cursor", ref: prompt.ref });
    });
    await flush();
    const latest = view.box.latest;
    assert.equal(latest.draft, "look");
    assert.deepEqual(latest.attachments.map((item) => item.path), paths);
    assert.deepEqual(latest.restoredDraft && latest.restoredDraft.text, "look");
    assert.equal(latest.messages.filter((m) => m.kind === "user").length, 0, "the echo bubble is gone");
    const notice = latest.messages.at(-1);
    assert.equal(notice.kind, "notice");
    assert.equal(notice.code, "gateway_error");
    assert.equal(notice.text, UNSENT_RESTORED_COPY);
    assert.equal(latest.busy, false);
    // Retry sends the same files again.
    let again;
    await act(async () => { again = await latest.send(); });
    assert.equal(again, true);
    const retry = view.socket().sent.filter((frame) => frame.t === "prompt").at(-1);
    assert.deepEqual(retry.files.map((file) => file.path), paths);
    assert.equal(retry.text, "look");
  } finally {
    await view.unmount();
  }
});

test("the gateway's own sentence is preferred and an acknowledged prompt is never restored", async () => {
  const view = await mount();
  try {
    const first = await attachAndSend(view, ["a.png"], "one");
    await act(async () => {
      view.socket().server({ t: "error", code: "invalid_argument", program: "cursor", ref: first.prompt.ref, text: "附件还没存好，请把附件重新加一次再发。" });
    });
    await flush();
    assert.equal(view.box.latest.messages.at(-1).text, "附件还没存好，请把附件重新加一次再发。");
    assert.equal(view.box.latest.draft, "one");
    await act(async () => { view.box.latest.removeAttachment(view.box.latest.attachments[0].id); });
    assert.ok(revoked.some((url) => url.startsWith("blob:")), "a removed chip releases its thumbnail");
    await act(async () => { view.box.latest.setDraft(""); });

    FakeXhr.instances.length = 0;
    const second = await attachAndSend(view, ["b.png"], "two");
    await act(async () => {
      view.socket().server({ t: "session_opened", program: "cursor", acp_session: "s-new", ref: second.prompt.ref });
      view.socket().server({
        t: "user_message", program: "cursor", acp_session: "s-new", ref: second.prompt.ref, text: "two",
        attachments: [{ name: "b.png", mime: "image/png", path: second.paths[0], archive: { id: "cta_b", name: "b.png", mime: "image/png", size: 4, download_path: "/v1/computer-task-sessions/cts_1/attachments/cta_b" } }],
      });
    });
    await flush();
    const user = view.box.latest.messages.filter((m) => m.kind === "user").at(-1);
    assert.equal(user.attachments[0].archive.id, "cta_b", "server rows replace the echo");
    assert.match(user.attachments[0].preview, /^blob:/, "and keep its local thumbnail");
    await act(async () => {
      view.socket().server({ t: "error", code: "gateway_error", program: "cursor", acp_session: "s-new", ref: second.prompt.ref });
    });
    await flush();
    assert.equal(view.box.latest.attachments.length, 0);
    assert.equal(view.box.latest.draft, "");
    assert.equal(view.box.latest.messages.at(-1).text, undefined, "nothing was kept, so no 'kept' sentence");
  } finally {
    await view.unmount();
  }
});

test("a dropped link is not a refusal", async () => {
  const view = await mount();
  try {
    const { prompt } = await attachAndSend(view, ["c.png"], "three");
    await act(async () => {
      view.socket().server({ t: "error", code: "dialog_detached", program: "cursor", ref: prompt.ref });
    });
    await flush();
    assert.equal(view.box.latest.attachments.length, 0);
    assert.equal(view.box.latest.draft, "");
  } finally {
    await view.unmount();
  }
});

test("two files of one paste get distinct names", async () => {
  assert.equal(distinctName("image.png", new Set()), "image.png");
  assert.equal(distinctName("image.png", new Set(["image.png", "image-2.png"])), "image-3.png");
  assert.equal(distinctName("Makefile", new Set(["Makefile"])), "Makefile-2");
  const view = await mount();
  try {
    const files = [new File([new Uint8Array(2)], "image.png", { type: "image/png" }), new File([new Uint8Array(3)], "image.png", { type: "image/png" })];
    await act(async () => { view.box.latest.addAttachments(files); });
    await until(() => FakeXhr.instances.length === 2, "two uploads");
    assert.deepEqual(FakeXhr.instances.map((xhr) => new URL(xhr.url).searchParams.get("name")), ["image.png", "image-2.png"]);
    assert.deepEqual(view.box.latest.attachments.map((item) => item.name), ["image.png", "image-2.png"]);
  } finally {
    await view.unmount();
  }
});

test("open_session retries once after 20 s, then stops loading with a notice", async () => {
  assert.equal(SESSION_LOAD_TIMEOUT_MS, 20_000);
  const view = await mount();
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    await act(async () => { view.box.latest.openSession("s-old"); });
    await flush();
    const opens = () => view.socket().sent.filter((frame) => frame.t === "open_session" && frame.acp_session === "s-old").length;
    assert.equal(opens(), 1);
    assert.equal(view.box.latest.sessionLoading, true);
    await act(async () => { mock.timers.tick(SESSION_LOAD_TIMEOUT_MS); });
    await flush();
    assert.equal(opens(), 2, "asked once more");
    assert.equal(view.box.latest.sessionLoading, true);
    await act(async () => { mock.timers.tick(SESSION_LOAD_TIMEOUT_MS); });
    await flush();
    assert.equal(view.box.latest.sessionLoading, false);
    assert.equal(view.box.latest.messages.at(-1).code, "session_load_timeout");
    assert.equal(opens(), 2, "no third request");
  } finally {
    mock.timers.reset();
    await view.unmount();
  }
});

test("reducer: send-failed and the timeout clear sessionLoading; drop-unsent removes the echo", () => {
  const loading = { ...initialDialogState(), program: "cursor", activeSession: "s1", sessionLoading: true };
  assert.equal(applyDialog(loading, { type: "send-failed" }).sessionLoading, false);
  const timedOut = applyDialog(loading, { type: "session-load-timeout", acpSession: "s1" });
  assert.equal(timedOut.sessionLoading, false);
  assert.equal(timedOut.messages.at(-1).code, "session_load_timeout");
  assert.equal(applyDialog(loading, { type: "session-load-timeout", acpSession: "other" }), loading, "a stale timer is ignored");
  const withUser = applyDialog({ ...initialDialogState(), program: "cursor" }, { type: "user", text: "hi" });
  assert.equal(applyDialog(withUser, { type: "drop-unsent", text: "hi" }).messages.length, 0);
  assert.equal(applyDialog(withUser, { type: "drop-unsent", text: "other" }).messages.length, 1, "only the echo of that text");
  // gateway_error ends the turn like node_error does.
  const running = applyDialog({ ...withUser, activeSession: "s1" }, { type: "frame", frame: { t: "turn_start", program: "cursor", acp_session: "s1" } });
  const failed = applyDialog(running, { type: "frame", frame: { t: "error", code: "gateway_error", program: "cursor", acp_session: "s1" } });
  assert.equal(failed.busy, false);
});

test("gateway_error copy never blames the user's computer; translations exist", () => {
  const tt = (value) => value;
  assert.equal(noticeCopy(tt, "gateway_error"), GATEWAY_ERROR_COPY);
  assert.doesNotMatch(noticeCopy(tt, "gateway_error"), /电脑/);
  assert.equal(noticeCopy(tt, "node_error"), "这台电脑上的程序出错了。");
  for (const locale of ["en", "zh-TW"]) {
    assert.ok(NATIVE_ATTACHMENTS_MESSAGES[locale][UNSENT_RESTORED_COPY], `${locale} restored copy`);
    assert.ok(NATIVE_ATTACHMENTS_MESSAGES[locale][GATEWAY_ERROR_COPY], `${locale} gateway copy`);
    assert.ok(NATIVE_ATTACHMENTS_MESSAGES[locale]["附件还没存好，请把附件重新加一次再发。"], `${locale} gateway sentence`);
  }
  assert.equal(NATIVE_ATTACHMENTS_MESSAGES.en[UNSENT_RESTORED_COPY].startsWith("Not sent"), true);
});

test("local blob thumbnails pass, other URLs do not; the main stream shows them as images", () => {
  const blob = "blob:https://oceanleo.com/0000aaaa-0000-4000-8000-000000000001";
  assert.equal(isLocalBlobPreview(blob), true);
  assert.equal(safeImagePreview(blob), blob);
  for (const bad of ["blob:javascript:alert(1)", "https://x.supabase.co/a.png", "blob:https://oceanleo.com/../x", "javascript:alert(1)"]) {
    assert.equal(safeImagePreview(bad), undefined, bad);
  }
  assert.deepEqual(userAttachments([{ name: "a.png", mime: "image/png", preview: blob }])[0].preview, blob);
  const merged = mergeLocalPreviews(
    [{ name: "a.png", mime: "image/png", path: "/root/oceanleo-inbox/a.png", archive: { id: "x" } }, { name: "b.txt", mime: "text/plain" }],
    [{ name: "a.png", mime: "image/png", path: "/root/oceanleo-inbox/a.png", preview: blob }, { name: "b.txt", mime: "text/plain" }],
  );
  assert.equal(merged[0].preview, blob);
  assert.equal(merged[1].preview, undefined);
  const [user] = dialogToAgentMessages([{ kind: "user", id: "u", text: "see", attachments: [{ name: "a.png", mime: "image/png", preview: blob }] }], { live: true });
  assert.equal(user.meta.attachments[0].url, blob);
  assert.equal(user.meta.attachments[0].media_type, "image");
});

const signed = { url: "https://proj.supabase.co/storage/v1/object/sign/project-assets/u/x?token=t" };
const thumbModule = await import(
  await compileModule("src/shell/native-thread/NativeArchivedImage.tsx", {
    "../../lib/cloud-computer-api": dataModule(`
      export async function cloudComputerRequest(path) {
        globalThis.__w1ThumbCalls = (globalThis.__w1ThumbCalls || 0) + 1;
        if (path.endsWith("/refused")) throw new Error("403");
        return globalThis.__w1Signed;
      }
    `),
  })
);

test("saved native images render a local blob thumbnail; failures fall back to the chip", async () => {
  const { archivedImageEligible, NativeArchivedImage, resetArchivedThumbsForTests } = thumbModule;
  const path = "/v1/computer-task-sessions/cts_1/attachments/cta_img";
  assert.equal(archivedImageEligible("image/png", 1234, path), true);
  assert.equal(archivedImageEligible("application/pdf", 1234, path), false);
  assert.equal(archivedImageEligible("image/png", 50 * 1024 * 1024, path), false, "too big to inline");
  assert.equal(archivedImageEligible("image/png", 10, "https://evil.example/x.png"), false);
  globalThis.__w1Signed = signed;
  globalThis.__w1ThumbCalls = 0;
  const fetched = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    fetched.push([String(url), init?.credentials]);
    return { ok: true, blob: async () => new window.Blob([new Uint8Array([1, 2, 3])], { type: "application/octet-stream" }) };
  };
  resetArchivedThumbsForTests();
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const root = createRoot(host);
  try {
    const chip = React.createElement("span", { "data-chip": "" }, "shot.png");
    await act(async () => {
      root.render(React.createElement(React.Fragment, null,
        React.createElement(NativeArchivedImage, { name: "shot.png", path, mime: "image/png", fallback: chip }),
        React.createElement(NativeArchivedImage, { name: "shot.png", path, mime: "image/png", fallback: chip }),
      ));
    });
    await until(() => host.querySelectorAll("[data-native-archived-image='ready']").length === 2, "thumbnails ready");
    const img = host.querySelector("img");
    assert.match(img.getAttribute("src"), /^blob:https:\/\/oceanleo\.com\//);
    assert.equal(host.innerHTML.includes("supabase"), false, "the storage host never reaches the page");
    assert.equal(globalThis.__w1ThumbCalls, 1, "one signed read per attachment");
    assert.deepEqual(fetched, [[signed.url, "omit"]]);
    await act(async () => {
      root.render(React.createElement(NativeArchivedImage, {
        name: "x.png", path: "/v1/computer-task-sessions/cts_1/attachments/refused", mime: "image/png", fallback: chip,
      }));
    });
    await until(() => host.querySelector("[data-chip]"), "chip fallback");
    globalThis.__w1Signed = { url: "http://insecure.example/x.png" };
    await act(async () => {
      root.render(React.createElement(NativeArchivedImage, {
        name: "y.png", path: "/v1/computer-task-sessions/cts_1/attachments/plain", mime: "image/png", fallback: chip,
      }));
    });
    await until(() => host.querySelector("[data-chip]"), "non-https falls back");
  } finally {
    globalThis.fetch = previousFetch;
    await act(async () => root.unmount());
    host.remove();
  }
});

test.after(() => {
  if (previousXhr === undefined) delete globalThis.XMLHttpRequest;
  else globalThis.XMLHttpRequest = previousXhr;
  URL.createObjectURL = previousCreate;
  URL.revokeObjectURL = previousRevoke;
});
