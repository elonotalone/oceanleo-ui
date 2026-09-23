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
  return { host, node, render, scroll, grow: (value) => { height = value; } };
}

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
