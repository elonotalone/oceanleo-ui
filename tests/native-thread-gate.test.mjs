// R1: native permissions/questions render in the main stream's GateBubble look.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://oceanleo.com/tasks/t" });
const { window } = dom;
for (const [name, value] of Object.entries({
  window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement,
  Element: window.Element, Node: window.Node, Event: window.Event, MouseEvent: window.MouseEvent,
  HTMLInputElement: window.HTMLInputElement, HTMLTextAreaElement: window.HTMLTextAreaElement,
})) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
for (const proto of [window.HTMLElement.prototype, window.Element.prototype]) {
  proto.attachEvent = function attachEvent() {};
  proto.detachEvent = function detachEvent() {};
}

const uiStub = dataModule(`
  export function useUI() {
    return (value, vars) => value.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? "{" + key + "}"));
  }
`);
const { AgentTranscriptBubble } = await import(await compileModule("src/shell/AgentTranscriptBubble.tsx", {
  "../i18n/ui/useUI": uiStub,
  "./share/share-clipboard": dataModule("export async function writeClipboardText() { return true; }"),
  "../lib/cloud-computer-api": dataModule("export async function cloudComputerRequest(path) { return globalThis.__archiveRequest(path); }"),
}));
const { dialogToAgentMessages } = await import("../src/shell/native-thread/map-dialog.ts");

function permissionMessage(chosen = "") {
  return dialogToAgentMessages([{ kind: "turn", id: "t", acpSession: "s", stop: "", live: true, items: [
    { kind: "permission", id: "p", permId: "perm-1", title: "Allow edit?", permKind: "edit", toolTitle: "Edit a.ts", chosen, auto: false,
      options: [{ id: "once", name: "Allow once", kind: "allow_once" }, { id: "always", name: "Always", kind: "allow_always" }, { id: "no", name: "Reject", kind: "reject_once" }] },
  ] }], { live: true })[0];
}

function questionMessage(questions, submitted = false) {
  return dialogToAgentMessages([{ kind: "turn", id: "t", acpSession: "s", stop: "", live: true, items: [
    { kind: "question", id: "q", questionId: "ask-1", title: "Need input", detail: "", questions, submitted },
  ] }], { live: true })[0];
}

async function render(props) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(AgentTranscriptBubble, props)));
  return {
    host,
    async update(next) { await act(async () => root.render(React.createElement(AgentTranscriptBubble, { ...props, ...next }))); },
    cleanup() { act(() => root.unmount()); host.remove(); },
  };
}

async function click(element) {
  assert.ok(element, "missing element");
  await act(async () => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

test("native permission renders one gate button per option; allow kinds primary; callback gets option id; disabled after choosing", async () => {
  const calls = [];
  const message = permissionMessage();
  const view = await render({ message, onNativeAnswer: (m, answer) => calls.push([m.id, answer]) });
  try {
    const box = view.host.querySelector('[data-native-permission="perm-1"]');
    assert.ok(box);
    assert.match(box.className, /border-amber-200/, "same GateBubble frame");
    assert.match(view.host.textContent, /需要你确认/);
    assert.match(view.host.textContent, /Allow edit\?\nEdit a\.ts|Allow edit\?Edit a\.ts|Allow edit\?/);
    const buttons = [...view.host.querySelectorAll("[data-native-permission-option]")];
    assert.deepEqual(buttons.map((b) => b.getAttribute("data-native-permission-option")), ["once", "always", "no"]);
    assert.match(buttons[0].className, /bg-amber-500/);
    assert.match(buttons[1].className, /bg-amber-500/);
    assert.match(buttons[2].className, /border-amber-300/);
    await click(buttons[1]);
    assert.deepEqual(calls, [[message.id, "always"]]);
    assert.ok([...view.host.querySelectorAll("[data-native-permission-option]")].every((b) => b.disabled), "held while the answer is in flight");
    assert.equal(view.host.querySelector("[data-native-permission-chosen]"), null, "no local 已选 before the record says so");
    await click(view.host.querySelector('[data-native-permission-option="no"]'));
    assert.equal(calls.length, 1, "a second pick is ignored");
    await view.update({ message: permissionMessage("Always") });
    assert.match(view.host.querySelector("[data-native-permission-chosen]").textContent, /已选：Always/);
    assert.match(view.host.textContent, /已确认/);
  } finally { view.cleanup(); }
});

test("a chosen or read-only permission is not actionable", async () => {
  const view = await render({ message: permissionMessage("Allow once") });
  try {
    assert.ok([...view.host.querySelectorAll("[data-native-permission-option]")].every((b) => b.disabled));
    assert.match(view.host.textContent, /已选：Allow once/);
    assert.match(view.host.textContent, /已确认/);
  } finally { view.cleanup(); }
  // Pending but not live (no onNativeAnswer, e.g. offline archive): read-only, no local choice.
  const readOnly = await render({ message: permissionMessage() });
  try {
    const buttons = [...readOnly.host.querySelectorAll("[data-native-permission-option]")];
    assert.ok(buttons.length === 3 && buttons.every((b) => b.disabled));
    await click(buttons[0]);
    assert.equal(readOnly.host.querySelector("[data-native-permission-chosen]"), null);
    assert.doesNotMatch(readOnly.host.textContent, /需要你确认/);
  } finally { readOnly.cleanup(); }
  const question = await render({ message: questionMessage({ questions: [{ id: "c", prompt: "Pick", options: ["A"] }] }) });
  try {
    assert.equal(question.host.querySelector("form"), null, "read-only question has no form");
    assert.equal(question.host.querySelector("[data-native-question-submitted]"), null);
  } finally { question.cleanup(); }
});

test("native question with options submits field values in gate style", async () => {
  const calls = [];
  const message = questionMessage({ questions: [{ id: "color", prompt: "Pick a color", options: [{ id: "r", label: "Red" }, { id: "b", label: "Blue" }] }] });
  const view = await render({ message, onNativeAnswer: (m, answer) => calls.push(answer) });
  try {
    assert.ok(view.host.querySelector('[data-native-question="ask-1"]'));
    assert.match(view.host.textContent, /Need input/);
    assert.match(view.host.textContent, /Pick a color/);
    const submit = view.host.querySelector("[data-native-question-submit]");
    assert.equal(submit.disabled, true);
    await click(view.host.querySelector('[data-native-question-option="b"]'));
    assert.equal(view.host.querySelector('[data-native-question-option="b"]').getAttribute("aria-pressed"), "true");
    await click(view.host.querySelector("[data-native-question-submit]"));
    assert.deepEqual(calls, [{ color: "b" }]);
    assert.equal(view.host.querySelector("[data-native-question-submitted]"), null, "no local 已经提交 before the record says so");
    assert.equal(view.host.querySelector("[data-native-question-submit]").disabled, true, "held while in flight");
    await click(view.host.querySelector("[data-native-question-submit]"));
    assert.equal(calls.length, 1);
    await view.update({ message: questionMessage({ questions: [{ id: "color", prompt: "Pick a color", options: [{ id: "r", label: "Red" }, { id: "b", label: "Blue" }] }] }, true) });
    assert.ok(view.host.querySelector("[data-native-question-submitted]"));
  } finally { view.cleanup(); }
});

test("unstructured native question falls back to one text answer; submitted state is read-only", async () => {
  const calls = [];
  const view = await render({ message: questionMessage(null), onNativeAnswer: (_m, answer) => calls.push(answer) });
  try {
    const input = view.host.querySelector("textarea[data-native-question-input]");
    assert.ok(input);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      input.dispatchEvent(new window.FocusEvent("focusin", { bubbles: true }));
      setter.call(input, "Use option two");
      input.dispatchEvent(new window.KeyboardEvent("keyup", { key: "a", bubbles: true }));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(view.host.querySelector("[data-native-question-submit]"));
    assert.deepEqual(calls, [{ text: "Use option two" }]);
  } finally { view.cleanup(); }
  const done = await render({ message: questionMessage(null, true), onNativeAnswer: () => assert.fail("no answer") });
  try {
    assert.ok(done.host.querySelector("[data-native-question-submitted]"));
    assert.equal(done.host.querySelector("textarea"), null);
  } finally { done.cleanup(); }
});

test("cloud gates are unchanged; native archived attachment fetches a signed URL only on click", async () => {
  const cloud = await render({ message: { id: 5, role: "assistant", kind: "gate", content: "Continue?" }, gateActive: true, onGate: () => {} });
  try {
    assert.match(cloud.host.textContent, /确认继续/);
    assert.match(cloud.host.textContent, /到此停止/);
    assert.equal(cloud.host.querySelector("[data-native-permission]"), null);
  } finally { cloud.cleanup(); }
  const user = dialogToAgentMessages([{ kind: "user", id: "u", text: "see file", attachments: [
    { name: "report.pdf", mime: "application/pdf", archive: { id: "f", name: "report.pdf", mime: "application/pdf", size: 4, download_path: "/v1/computer-task-sessions/m/attachments/f" } },
    { name: "local.txt", mime: "text/plain", path: "/tmp/local.txt" },
  ] }], { live: true })[0];
  const requests = [];
  globalThis.__archiveRequest = async (path) => { requests.push(path); return { url: "https://storage.example.test/signed" }; };
  const view = await render({ message: user });
  try {
    assert.equal(requests.length, 0);
    assert.ok(view.host.querySelector("[data-native-attachment]"), "path-only file is an inert chip");
    assert.equal(view.host.querySelector('a[href=""]'), null);
    await click(view.host.querySelector("[data-native-archived-attachment]"));
    for (let i = 0; i < 100 && !view.host.querySelector('[data-native-archived-attachment="ready"]'); i += 1) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
    }
    assert.deepEqual(requests, ["/v1/computer-task-sessions/m/attachments/f"]);
    assert.equal(view.host.querySelector('[data-native-archived-attachment="ready"]').getAttribute("href"), "https://storage.example.test/signed");
  } finally { view.cleanup(); }
});
