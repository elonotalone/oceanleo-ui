import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
for (const [name, value] of Object.entries({
  getSelection: window.getSelection.bind(window), MutationObserver: window.MutationObserver,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
})) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
for (const name of ["innerHeight", "innerWidth", "scrollX", "scrollY", "pageXOffset", "pageYOffset"])
  Object.defineProperty(globalThis, name, { configurable: true, get: () => window[name] });
document.elementFromPoint = () => null;
window.Range.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
window.Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} });
const tiptap = ["@tiptap/react", "@tiptap/core", "@tiptap/pm/state", "@tiptap/extension-document",
  "@tiptap/extension-paragraph", "@tiptap/extension-text", "@tiptap/extension-placeholder", "@tiptap/extension-history"];
const { PromptHighlightArea } = await import(await compileModule("src/shell/PromptHighlightArea.tsx", {
  ...Object.fromEntries(tiptap.map(name => [name, import.meta.resolve(name)])),
  "../lib/auth/client": dataModule('export async function accessToken(){return "test-stub";} export function cachedAccessToken(){return null;} export async function getUserId(){return "test-user";}'),
}));
const originalError = console.error;
let errors = [], calls = [], replies = new Map(), opens = [];
const originalFetch = globalThis.fetch;
beforeEach(() => {
  errors = []; calls = []; replies = new Map(); opens = [];
  console.error = (...args) => errors.push(args);
  window.open = (...args) => { opens.push(args); return null; };
  globalThis.fetch = async (url) => {
    const parsed = new URL(url, window.location.origin);
    calls.push(parsed.pathname);
    assert.match(parsed.pathname, /^\/v1\/agent\/tasks\/[\da-f-]+$/, "direct lookup only, never history list");
    const id = parsed.pathname.split('/').at(-1);
    const reply = replies.get(id);
    if (typeof reply === 'function') return reply();
    return Response.json(reply ? { task: { id, title: reply }, messages: [], artifacts: [] } : {detail: 'not found'}, {status: reply ? 200 : 404});
  };
});
afterEach(() => {
  console.error = originalError; globalThis.fetch = originalFetch;
  assert.deepEqual(errors, [], "real render must not produce console.error");
});
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const url = n => `https://oceanbizs.com/tasks/${id(n)}`;
const tick = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 35)); });
async function waitFor(check) {
  for (let i=0; i<40 && !check(); i++) await tick();
  assert.ok(check(), "expected editor transition completed");
}
async function mount(initial = '') {
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container); const ref = React.createRef();
  let setValue, value = initial; const emitted = [];
  function Host() {
    const [draft, setDraft] = React.useState(initial); setValue = setDraft; value = draft;
    return React.createElement(PromptHighlightArea, {ref, value: draft, template: null,
      onChange(next) { emitted.push(next); setDraft(next); }});
  }
  await act(async () => root.render(React.createElement(Host)));
  await waitFor(() => ref.current?.el()?.editor);
  const box = ref.current.el(); const editor = box.editor;
  return { box, editor, ref, emitted, get value(){return value;},
    async restore(next) { await act(async () => setValue(next)); },
    async key(key) {
      const code = { Backspace:8, Delete:46, ArrowLeft:37, ArrowRight:39 }[key];
      await act(async () => box.dispatchEvent(new window.KeyboardEvent('keydown', {key, keyCode:code, which:code, bubbles:true, cancelable:true})));
    },
    async click(selector) {
      const target = box.querySelector(selector); assert.ok(target);
      // Physical click path: ProseMirror's mousedown/up drives handleClickOn.
      const pos = target.closest('[data-composer-task-chip]') ? 1 : 2;
      editor.view.posAtCoords = () => ({pos, inside:0});
      await act(async () => {
        target.dispatchEvent(new window.MouseEvent('mousedown', {bubbles:true, button:0}));
        target.dispatchEvent(new window.MouseEvent('mouseup', {bubbles:true, button:0}));
        target.dispatchEvent(new window.MouseEvent('click', {bubbles:true, cancelable:true, button:0}));
      });
    },
    async close() { await act(async () => root.unmount()); container.remove(); },
  };
}

test('own task beyond 100: title-only atom, direct lookup, URL emission, restore and icon-only opening', async () => {
  replies.set(id(478), 'A much older conversation');
  const view = await mount();
  try {
    await act(async () => view.editor.commands.insertContent(url(478)));
    await waitFor(() => view.box.querySelector('.oc-task-chip'));
    assert.equal(view.box.textContent, 'A much older conversation');
    assert.equal(view.box.querySelector('.oc-task-chip').getAttribute('contenteditable'), 'false');
    assert.equal(view.box.querySelector('a'), null);
    assert.equal(view.value, url(478)); assert.ok(view.emitted.includes(url(478)));
    assert.equal(view.ref.current.getText(), url(478)); assert.equal(view.editor.getText(), url(478));
    await act(async () => view.editor.commands.selectAll());
    assert.equal(view.ref.current.getSelectedText(), url(478));
    await view.click('.oc-task-chip-label'); assert.equal(opens.length, 0);
    await view.click('.oc-composer-link-icon');
    assert.deepEqual(opens, [[url(478), '_blank', 'noopener,noreferrer']]);
    await view.restore(''); await view.restore(url(478));
    await waitFor(() => view.box.querySelector('.oc-task-chip'));
    assert.equal(view.box.textContent, 'A much older conversation');
    assert.deepEqual(calls, [`/v1/agent/tasks/${id(478)}`]);
  } finally { await view.close(); }
});

for (const key of ['Backspace', 'Delete']) test(`${key} removes the entire atom in one keypress`, async () => {
  const n = key === 'Backspace' ? 2 : 3; replies.set(id(n), 'Remove me');
  const view = await mount(url(n));
  try {
    await waitFor(() => view.box.querySelector('.oc-task-chip'));
    await act(async () => view.editor.commands.setTextSelection(key === 'Backspace' ? 2 : 1));
    await view.key(key);
    assert.equal(view.value, ''); assert.equal(view.box.querySelector('.oc-task-chip'), null);
    assert.equal(view.editor.state.selection.empty, true);
  } finally { await view.close(); }
});

test('selection across a chip replaces the whole chip; composition beside it preserves URL', async () => {
  replies.set(id(4), 'Conversation');
  const view = await mount(url(4));
  try {
    await waitFor(() => view.box.querySelector('.oc-task-chip'));
    await act(async () => {
      view.editor.commands.setTextSelection(2);
      view.box.dispatchEvent(new window.CompositionEvent('compositionstart', {bubbles:true}));
      view.editor.view.dispatch(view.editor.state.tr.insertText('中文'));
      view.box.dispatchEvent(new window.CompositionEvent('compositionend', {bubbles:true, data:'中文'}));
    });
    await tick();
    assert.equal(view.value, url(4)+'中文');
    assert.equal(view.box.querySelectorAll('.oc-task-chip').length, 1);
    await act(async () => {
      view.editor.commands.selectAll();
      view.editor.view.dispatch(view.editor.state.tr.insertText('replacement'));
    });
    assert.equal(view.value, 'replacement'); assert.equal(view.box.querySelector('.oc-task-chip'), null);
  } finally { await view.close(); }
});

test('foreign task stays an ordinary link, failure is cached, and only its icon opens', async () => {
  const view = await mount(url(5));
  try {
    await tick(); await tick();
    assert.equal(view.box.querySelector('.oc-task-chip'), null);
    assert.equal(view.box.querySelector('a')?.textContent, url(5));
    await view.click('.oc-composer-link-text'); assert.equal(opens.length, 0);
    await view.click('.oc-composer-link-icon'); assert.equal(opens.length, 1);
    await view.restore(''); await view.restore(url(5)); await tick();
    assert.equal(calls.length, 1);
    await view.restore('https://example.com/plain'); await tick();
    assert.equal(calls.length, 1, 'non-task links never request tasks');
  } finally { await view.close(); }
});

test('in-flight task requests deduplicate and async replies use current positions', async () => {
  let resolve;
  replies.set(id(6), () => new Promise(r => {resolve = r;}));
  const view = await mount(`${url(6)} ${url(6)}`);
  try {
    await waitFor(() => resolve);
    assert.equal(calls.length, 1);
    await act(async () => view.editor.view.dispatch(view.editor.state.tr.insertText('prefix ', 1)));
    await act(async () => resolve(Response.json({task:{id:id(6),title:'Shared title'}})));
    await waitFor(() => view.box.querySelectorAll('.oc-task-chip').length === 2);
    assert.equal(view.box.textContent, 'prefix Shared title Shared title');
    assert.equal(view.value, `prefix ${url(6)} ${url(6)}`);
  } finally { await view.close(); }
});

test('cursor CSS limits pointer to the icon and keeps link text editable', () => {
  const css = readFileSync(new URL('../src/theme/globals.css', import.meta.url),'utf8');
  assert.match(css, /\.oc-slot-editor \.oc-composer-link \{[^}]*cursor: text/);
  assert.match(css, /\.oc-task-chip-label \{[^}]*cursor: default/);
  assert.match(css, /\.oc-slot-editor \.oc-composer-link-icon-wrap,\s*\.oc-slot-editor \.oc-composer-link-icon \{ cursor: pointer/);
});

test('a task deleted during lookup is not resurrected; another editor shares the in-flight lookup', async () => {
  let resolve;
  replies.set(id(7), () => new Promise(r => { resolve = r; }));
  const first = await mount(url(7)); const second = await mount(url(7));
  try {
    await waitFor(() => resolve);
    assert.equal(calls.length, 1);
    await first.restore('kept');
    await act(async () => resolve(Response.json({task:{id:id(7),title:'Resolved'}})));
    await waitFor(() => second.box.querySelector('.oc-task-chip'));
    assert.equal(first.box.textContent, 'kept');
    assert.equal(first.box.querySelector('.oc-task-chip'), null);
    assert.equal(second.ref.current.getText(), url(7));
  } finally { await first.close(); await second.close(); }
});

test('resolution waits until composition ends and programmatic text restores the chip', async () => {
  let resolve;
  replies.set(id(8), () => new Promise(r => { resolve = r; }));
  const view = await mount(url(8));
  try {
    await waitFor(() => resolve);
    await act(async () => {
      view.editor.commands.setTextSelection(view.editor.state.doc.content.size - 1);
      view.box.dispatchEvent(new window.CompositionEvent('compositionstart', {bubbles:true}));
      resolve(Response.json({task:{id:id(8),title:'Composed'}}));
    });
    await tick();
    assert.equal(view.box.querySelector('.oc-task-chip'), null);
    await act(async () => {
      view.editor.view.dispatch(view.editor.state.tr.insertText('完成'));
      view.box.dispatchEvent(new window.CompositionEvent('compositionend', {bubbles:true,data:'完成'}));
    });
    await waitFor(() => view.box.querySelector('.oc-task-chip'));
    assert.equal(view.value, url(8)+'完成');
    await act(async () => view.ref.current.setText(''));
    await act(async () => view.ref.current.setText(url(8)));
    await waitFor(() => view.box.querySelector('.oc-task-chip'));
    assert.equal(view.value, url(8));
    assert.equal(view.box.textContent, 'Composed');
  } finally { await view.close(); }
});

test('forbidden tasks and failed network requests stay ordinary links without retry loops', async () => {
  replies.set(id(9), () => Response.json({detail:'forbidden'}, {status:403}));
  replies.set(id(10), () => {throw new Error('offline');});
  const view = await mount(`${url(9)} ${url(10)}`);
  try {
    await tick(); await tick();
    assert.equal(view.box.querySelectorAll('a').length, 2);
    assert.equal(view.box.querySelector('.oc-task-chip'), null);
    await view.restore(''); await view.restore(`${url(9)} ${url(10)}`);
    await tick(); assert.equal(calls.length, 2);
  } finally { await view.close(); }
});

test('automatic resolution is not a separate undo step; deleting a chip can be undone', async () => {
  replies.set(id(11), 'Undo title');
  const view = await mount();
  try {
    await act(async () => view.editor.commands.insertContent(url(11)));
    await waitFor(() => view.box.querySelector('.oc-task-chip'));
    await act(async () => view.editor.commands.undo());
    await tick(); assert.equal(view.value, '');
    await act(async () => view.editor.commands.redo());
    await waitFor(() => view.box.querySelector('.oc-task-chip'));
    await act(async () => view.editor.commands.setTextSelection(2));
    await view.key('Backspace'); assert.equal(view.value, '');
    await act(async () => view.editor.commands.undo());
    await waitFor(() => view.box.querySelector('.oc-task-chip'));
    assert.equal(view.value, url(11));
  } finally { await view.close(); }
});
