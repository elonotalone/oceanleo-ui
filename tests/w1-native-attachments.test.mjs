// W1 2026-10-31: native-session attachments.
// - a prompt the gateway refuses before acknowledging it puts its text and
//   attachments back in the composer (and drops the echo bubble);
// - gateway faults read as the server's fault, never "your computer's program";
// - open_session never spins forever (20 s → retry once → stop with a notice);
// - picked images keep a local blob: thumbnail through the bubble.
// (The composer/controller cases went with the deleted agent-dialog controller; the shared reducer, notice
// copy, attachment previews and archived-image thumbnails stay.)
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

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

async function until(fn, label) {
  for (let i = 0; i < 80; i += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    if (fn()) return;
  }
  throw new Error(label);
}

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
  URL.createObjectURL = previousCreate;
  URL.revokeObjectURL = previousRevoke;
});
