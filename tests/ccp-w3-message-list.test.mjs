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
const previousCanvas = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
else delete require.cache[canvasEntry];
const { window } = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
for (const [name, value] of Object.entries({ window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node, Event: window.Event })) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const resizeObservers = new Set();
globalThis.ResizeObserver = class {
  constructor(callback) { this.callback = callback; resizeObservers.add(this); }
  observe() {}
  disconnect() { resizeObservers.delete(this); }
};
const { MessageList } = await import(await compileModule("src/shell/cloud-computer/agent-dialog/MessageList.tsx", {
  "../../../i18n/ui/useUI": dataModule('const tt = (s) => s; export function useUI() { return tt; }'),
}));
const user = (id = "u1") => ({ kind: "user", id, text: "Explain these lines\n" + "long".repeat(80) });
const turn = (text = "First answer") => ({ kind: "turn", id: "t1", stop: "", items: [
  { id: "i1", kind: "assistant", text }, { id: "i2", kind: "assistant", text: "Second block" },
] });
async function mount(t) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let dialog = { program: "oceanleo", activeSession: "s1", messages: [user(), turn()], install: {}, programs: [] };
  const render = async (patch = {}) => {
    dialog = { ...dialog, ...patch };
    await act(async () => root.render(React.createElement(MessageList, { dialog })));
  };
  await render();
  const node = host.querySelector("[data-oceanleo-cc-messages]");
  let height = 1000;
  Object.defineProperties(node, {
    scrollHeight: { configurable: true, get: () => height },
    clientHeight: { configurable: true, value: 200 },
  });
  const scroll = async (top) => {
    await act(async () => { node.scrollTop = top; node.dispatchEvent(new window.Event("scroll")); });
  };
  t.after(async () => { await act(async () => root.unmount()); host.remove(); });
  const resized = async () => {
    await act(async () => { for (const observer of resizeObservers) observer.callback([]); });
  };
  return { host, node, render, scroll, resized, grow: (value) => { height = value; } };
}

test("Codex history image links render as attachment indications without serial text", async (t) => {
  const { host, render } = await mount(t);
  await render({ messages: [{ kind: "user", id: "image-history", text: "Look here\n[@image](data:image/png;base64," + "a".repeat(200000) + ")" }] });
  const bubble = host.querySelector("[data-oceanleo-cc-user]");
  assert.equal(bubble.querySelector("p").textContent, "Look here\n");
  assert.equal(bubble.querySelector("[data-oceanleo-cc-user-files]").textContent.trim(), "图片");
  assert.ok(bubble.textContent.length < 100);
  await render({ messages: [{ kind: "user", id: "photo-only", text: "[@image](data:image/jpeg;base64,YWJj)" }] });
  assert.equal(host.querySelector("[data-oceanleo-cc-user] p"), null);
  assert.ok(host.querySelector("[data-oceanleo-cc-user-files]"));
  const image = host.querySelector("[data-oceanleo-cc-user-image]");
  assert.equal(image.getAttribute("src"), "data:image/jpeg;base64,YWJj");
  await act(async () => { image.dispatchEvent(new window.Event("error")); });
  assert.equal(image.hidden, true);
  assert.equal(host.querySelector("[data-oceanleo-cc-user-files]").textContent.trim(), "图片");
  await render({ messages: [{ kind: "user", id: "unsafe-photo", text: "", attachments: [
    { name: "vector.svg", mime: "image/svg+xml", preview: "data:image/svg+xml;base64,YWJj" },
    { name: "remote.png", mime: "image/png", preview: "https://example.com/a.png" },
  ] }] });
  assert.equal(host.querySelector("[data-oceanleo-cc-user-image]"), null);
  assert.match(host.querySelector("[data-oceanleo-cc-user-files]").textContent, /vector.svg/);
});

test("user bubble has a human icon and larger text; each agent turn has one avatar for all blocks", async (t) => {
  const { host, render, node } = await mount(t);
  const userNode = host.querySelector("[data-oceanleo-cc-user]");
  assert.ok(userNode.querySelector('svg'));
  assert.equal(userNode.querySelector('[data-oceanleo-cc-user-avatar]').getAttribute('aria-hidden'), 'true');
  assert.ok(userNode.querySelector('p').classList.contains('text-[15px]'));
  assert.ok(userNode.querySelector('p').classList.contains('dark:bg-neutral-800'));
  assert.ok(userNode.querySelector('p').classList.contains('[overflow-wrap:anywhere]'));
  const agent = host.querySelector('[data-oceanleo-cc-turn]');
  assert.ok(agent.classList.contains('text-[13px]'));
  assert.equal(agent.querySelectorAll('[data-oceanleo-cc-agent-avatar]').length, 1);
  assert.equal(agent.querySelectorAll('[data-oceanleo-cc-assistant]').length, 2);
  assert.equal(agent.querySelector('[data-oceanleo-cc-agent-avatar]').textContent, '✦');
  assert.equal(agent.querySelectorAll('[data-oceanleo-cc-assistant]')[1].querySelector('[data-oceanleo-cc-agent-avatar]'), null);
  assert.ok(node.classList.contains('overflow-y-auto'));
  for (const [program, mark] of [['cursor', 'C'], ['claude', 'C'], ['codex', 'C'], ['hermes', 'H']]) {
    await render({ program });
    assert.equal(host.querySelector('[data-oceanleo-cc-agent-avatar]').textContent, mark);
  }
  await render({ messages: [{ kind: 'notice', id: 'n1', code: 'computer_offline', program: 'oceanleo' }] });
  assert.ok(host.querySelector('[data-oceanleo-cc-notice]').classList.contains('text-amber-700'));
  assert.equal(host.querySelector('[data-oceanleo-cc-agent-avatar]'), null);
});

test("reading history survives streaming; latest button smoothly returns and resumes following", async (t) => {
  const { host, node, render, scroll, grow } = await mount(t);
  await scroll(200);
  grow(1200);
  await render({ messages: [user(), turn('More streaming text')] });
  assert.equal(node.scrollTop, 200);
  const latest = host.querySelector('[data-oceanleo-cc-latest]');
  assert.match(latest.textContent, /最新消息/);
  let requested;
  node.scrollTo = (options) => { requested = options; };
  await act(async () => latest.click());
  assert.deepEqual(requested, { top: 1200, behavior: 'smooth' });
  await scroll(400); // intermediate smooth-scroll event must not cancel following
  assert.equal(host.querySelector('[data-oceanleo-cc-latest]'), null);
  await scroll(1000);
  grow(1400);
  await render({ messages: [user(), turn('Still streaming')] });
  assert.equal(node.scrollTop, 1400);
  assert.equal(host.querySelector('[data-oceanleo-cc-latest]'), null);
});

test("near-bottom follows growth, but exactly 80px away preserves the reader's position", async (t) => {
  const { node, render, scroll, grow } = await mount(t);
  await scroll(721);
  grow(1200);
  await render({ messages: [user(), turn('Added')] });
  assert.equal(node.scrollTop, 1200);
  await scroll(920);
  grow(1500);
  await render({ messages: [user(), turn('More')] });
  assert.equal(node.scrollTop, 920);
});

test("replacement history, session and program changes reset to bottom", async (t) => {
  const { host, node, render, scroll } = await mount(t);
  for (const patch of [
    { messages: [user('replacement'), turn()] },
    { activeSession: 's2' },
    { program: 'hermes' },
    { messages: [] },
    { messages: [user('new-session'), turn()] },
  ]) {
    await scroll(100);
    await render(patch);
    assert.equal(node.scrollTop, 1000);
    assert.equal(host.querySelector('[data-oceanleo-cc-latest]'), null);
  }
});

test("Markdown height growth without a new frame follows the tail; reading history stays put", async (t) => {
  const { host, node, scroll, resized, grow } = await mount(t);
  await scroll(800);
  grow(1400);
  await resized();
  assert.equal(node.scrollTop, 1400);
  await scroll(250);
  grow(1800);
  await resized();
  assert.equal(node.scrollTop, 250);
  assert.ok(host.querySelector('[data-oceanleo-cc-latest]'));
  await scroll(1600);
  grow(2000);
  await resized();
  assert.equal(node.scrollTop, 2000);
});

test("near the top asks for older history; prepending keeps the same row on screen", async (t) => {
  let asked = 0;
  const { host, node, render, scroll, grow } = await mount(t);
  await render({
    hasOlder: true,
    historyOffset: 8,
    historyLoading: false,
    loadOlderHistory: () => { asked += 1; },
  });
  assert.equal(asked, 0);
  assert.match(host.querySelector("[data-oceanleo-cc-history-older]").textContent, /向上滑动查看更早的对话/);
  await scroll(20);
  assert.equal(asked, 1);
  await act(async () => host.querySelector("[data-oceanleo-cc-history-older]").click());
  assert.equal(asked, 2);
  grow(1800);
  await render({
    hasOlder: false,
    historyOffset: 0,
    messages: [user("old"), user(), turn()],
    loadOlderHistory: () => { asked += 1; },
  });
  assert.equal(node.scrollTop, 820);
});

test("clicking text or scrolling down at the bottom does not disable following", async (t) => {
  const { node, resized, grow } = await mount(t);
  await act(async () => {
    node.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    node.dispatchEvent(new window.WheelEvent('wheel', { bubbles: true, deltaY: 50 }));
  });
  grow(1200);
  await resized();
  assert.equal(node.scrollTop, 1200);
});
