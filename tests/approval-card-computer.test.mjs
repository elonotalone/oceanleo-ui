// UX wave 2026-11-07 (unit LA): in 每次都问 the gateway gates every computer-changing tool call
// of the OceanLeo agent with the existing approval card (`connector_id` = `computer:<id>`).
// Ask means every time, so such a card offers only 允许这一次 and 拒绝: the gateway refuses the
// task / always scopes for a computer, and the user switches to 不问 in the composer pill instead.
// A connector card keeps its four buttons.
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

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://oceanleo.com/" });
const { window } = dom;
for (const [name, value] of Object.entries({
  window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement,
  Element: window.Element, Node: window.Node, Event: window.Event, MouseEvent: window.MouseEvent,
})) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { ApprovalCard, isComputerApproval } = await import(
  await compileModule("src/shell/ApprovalCard.tsx", {
    "../i18n/ui/useUI": dataModule(`
      export function useUI() {
        return (value, vars) => String(value).replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? "{" + key + "}"));
      }
    `),
    "../api/approvals": dataModule(`
      export async function getApproval(id) { return { ok: true, data: { id, status: "pending" } }; }
      export async function decideApproval(id, decision, scope) {
        (globalThis.__decided ||= []).push([id, decision, scope]);
        return { ok: true, data: { id, status: decision === "approve" ? "approved" : "denied" } };
      }
    `),
  })
);

const computerPayload = {
  approval_id: "appr-c1",
  connector_id: "computer:cc_1",
  connector_label: "我的 Mac",
  tool: "shell",
  summary: "在这台电脑上运行 rm -rf build",
  args_preview: "rm -rf build",
};
const connectorPayload = {
  approval_id: "appr-g1",
  connector_id: "gmail",
  connector_label: "Gmail",
  tool: "send_email",
  summary: "用 Gmail 发送邮件给 a@b.com",
  args_preview: "",
};

async function flush(count = 6) { for (let i = 0; i < count; i += 1) await act(async () => {}); }
async function mount(payload) {
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(ApprovalCard, { payload })));
  await flush();
  return {
    container,
    buttons: () => [...container.querySelectorAll("button")].map((node) => node.textContent).filter((text) => text !== "查看详情"),
    button: (label) => [...container.querySelectorAll("button")].find((node) => node.textContent === label),
    async click(node) { assert.ok(node, "expected control"); await act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))); await flush(); },
    async unmount() { await act(async () => root.unmount()); container.remove(); },
  };
}

test("isComputerApproval: computer:<id> is a computer card, a connector id is not", () => {
  assert.equal(isComputerApproval(computerPayload), true);
  assert.equal(isComputerApproval({ ...computerPayload, connector_id: "computer:cc_6b9905f8aaf2" }), true);
  assert.equal(isComputerApproval(connectorPayload), false);
  assert.equal(isComputerApproval({ ...connectorPayload, connector_id: "computer" }), false);
  assert.equal(isComputerApproval({ ...connectorPayload, connector_id: "my-computer:1" }), false);
});

test("a computer card offers exactly 允许这一次 and 拒绝; 允许这一次 decides once", async () => {
  globalThis.__decided = [];
  const m = await mount(computerPayload);
  try {
    assert.deepEqual(m.buttons(), ["允许这一次", "拒绝"]);
    assert.doesNotMatch(m.container.textContent, /不再询问/, "no always-allow hint");
    await m.click(m.button("允许这一次"));
    assert.deepEqual(globalThis.__decided, [["appr-c1", "approve", "once"]]);
    assert.match(m.container.textContent, /已允许/);
  } finally { await m.unmount(); }
});

test("拒绝 on a computer card denies", async () => {
  globalThis.__decided = [];
  const m = await mount(computerPayload);
  try {
    await m.click(m.button("拒绝"));
    assert.deepEqual(globalThis.__decided, [["appr-c1", "deny", undefined]]);
    assert.match(m.container.textContent, /已拒绝/);
  } finally { await m.unmount(); }
});

test("a connector card keeps its four buttons and the always-allow hint", async () => {
  const m = await mount(connectorPayload);
  try {
    assert.deepEqual(m.buttons(), ["允许这一次", "这个任务里都允许", "以后都允许", "拒绝"]);
    assert.match(m.container.textContent, /以后「Gmail」执行这个动作时不再询问/);
  } finally { await m.unmount(); }
});
