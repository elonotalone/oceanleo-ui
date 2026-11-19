import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React, { act, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
const require = createRequire(import.meta.url);
const fabric = createRequire(require.resolve('fabric/node'));
const canvas = fabric.resolve('canvas');
const previous = require.cache[canvas];
require.cache[canvas] = { id: canvas, filename: canvas, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabric.resolve('jsdom')).href);
if (previous) require.cache[canvas] = previous; else delete require.cache[canvas];
const dom = new JSDOM('<html><body></body></html>', { pretendToBeVisual: true, url: 'https://dev.oceanleo.com/tasks/stream' });
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement })) Object.defineProperty(globalThis, key, { configurable: true, value });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
globalThis.cancelAnimationFrame = clearTimeout;
let resizes = [];
globalThis.ResizeObserver = class {
  constructor(callback) { this.callback = callback; resizes.push(this); }
  observe() {} disconnect() {}
};
const memory = await import('../src/shell/task-scroll-memory.ts');
const { useStreamScroll } = await import(await compileModule('src/shell/transcript/useStreamScroll.ts'));
const { useCloudHistory } = await import(await compileModule('src/shell/transcript/useCloudHistory.ts'));
const { TranscriptPane, TranscriptStream, StreamLatestButton, CLOUD_TRANSCRIPT_CAPABILITIES, ACP_TRANSCRIPT_CAPABILITIES } = await import(await compileModule('src/shell/transcript/TranscriptStream.tsx', {
  '../../i18n/ui/useUI': dataModule('export const useUI = () => (text, vars) => text.replace("{count}", String(vars?.count));'),
}));

async function mountStream({ key = 'task:test', ids = ['1', '2', '3', '4', '5'], ready = true, active = true, hasMoreAfter = false, viewport = 200, clamp = false, rendered = true, caps = CLOUD_TRANSCRIPT_CAPABILITIES } = {}) {
  resizes = []; const errors = []; const oldError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));
  const host = document.createElement('div'); document.body.append(host);
  let patch, scroll, scroller, shift = 0, currentIds = ids, currentViewport = viewport;
  function Harness() {
    const ref = useRef(null);
    const [value, set] = useState({ key, ids, ready, active, hasMoreAfter, viewport, rendered, revision: 0 });
    currentIds = value.rendered ? value.ids : []; currentViewport = value.viewport;
    patch = (next) => set((current) => ({ ...current, ...next }));
    scroll = useStreamScroll({ taskKey: value.key, scrollRef: ref, messageIds: value.ids, revision: value.revision,
      ready: value.ready, active: value.active, hasMoreAfter: value.hasMoreAfter, hasMore: false, loadEarlier: async () => {} });
    return React.createElement(TranscriptPane, { pane: caps.branch ? 'cloud' : 'acp', scrollRef: (node) => {
      ref.current = node;
      if (!node || scroller === node) return;
      scroller = node;
      Object.defineProperty(node, 'clientHeight', { configurable: true, get: () => currentViewport });
      Object.defineProperty(node, 'scrollHeight', { configurable: true, get: () => currentIds.length * 200 + shift });
      node.getBoundingClientRect = () => ({ top: 0, bottom: currentViewport, height: currentViewport });
      if (clamp) {
        let top = 0;
        Object.defineProperty(node, 'scrollTop', { configurable: true,
          get: () => Math.min(top, Math.max(0, node.scrollHeight - node.clientHeight)),
          set: (value) => { top = Math.max(0, Math.min(value, node.scrollHeight - node.clientHeight)); },
        });
      }
    }, onScroll: scroll.onScroll, top: null, empty: null, tail: null, canView: true, after: null,
    hasMore: false, history: scroll.history,
    footer: React.createElement('textarea', { 'aria-label': 'message' }),
    overlay: scroll.showLatest ? React.createElement(StreamLatestButton, { unread: scroll.unread, onClick: scroll.resumeFollowing }) : null,
    items: React.createElement(TranscriptStream, { items: (value.rendered ? value.ids : []).map((id) => ({ key: id, messageId: id, rowId: Number(id), value: id })), capabilities: caps,
      renderItem: (id) => React.createElement('div', { ref: (node) => {
        if (!node) return;
        node.parentElement.getBoundingClientRect = () => {
          const position = value.ids.indexOf(id) * 200 + shift - scroller.scrollTop;
          return { top: position, bottom: position + 200, height: 200 };
        };
      } }, id),
    }) });
  }
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Harness)));
  return { host, get scroller() { return scroller; }, get state() { return scroll; },
    patch: async (next) => act(async () => patch(next)),
    scroll: async (top) => act(async () => { scroller.scrollTop = top; scroller.dispatchEvent(new window.Event('scroll')); }),
    scrollEvent: async () => act(async () => { scroller.dispatchEvent(new window.Event('scroll')); }),
    resize: async (by) => act(async () => { shift += by; for (const resize of resizes) resize.callback(); }),
    close: async () => { await act(async () => root.unmount()); host.remove(); console.error = oldError; assert.deepEqual(errors, [], 'no hook loops or React errors'); },
  };
}

test('persistent anchors capture the actual topmost message and restore it after a reload/layout change', () => {
  memory.forgetConversationScrolls();
  const el = document.createElement('div'); let shift = 0;
  el.scrollTop = 210;
  Object.defineProperty(el, 'scrollHeight', { value: 1000 });
  el.getBoundingClientRect = () => ({ top: 20, bottom: 220 });
  for (const [id, top] of [['a', 0], ['b', 200], ['c', 400]]) {
    const item = document.createElement('div'); item.dataset.streamMessageId = id; item.dataset.streamRowId = String(top + 1);
    item.getBoundingClientRect = () => ({ top: 20 + top + shift - el.scrollTop, bottom: 220 + top + shift - el.scrollTop });
    el.append(item);
  }
  const anchor = memory.captureConversationAnchor(el, false, 'c');
  assert.deepEqual(anchor, { messageId: 'b', offset: -10, atBottom: false, rowId: 201, latestId: 'c' });
  memory.rememberConversationAnchor('task:memory', anchor);
  shift = 90; el.scrollTop = 0;
  assert.equal(memory.restoreConversationAnchor(el, memory.recallConversationAnchor('task:memory')), false);
  assert.equal(el.scrollTop, 300);
  assert.equal(memory.restoreConversationAnchor(el, { ...anchor, messageId: 'missing' }), true);
  assert.equal(el.scrollTop, 1000);
  assert.equal(memory.restoreConversationAnchor(el, { ...anchor, atBottom: true }), true);
  assert.equal(el.scrollTop, 1000);
});

for (const [name, caps] of [['cloud', CLOUD_TRANSCRIPT_CAPABILITIES], ['ACP', ACP_TRANSCRIPT_CAPABILITIES]]) {
  test(`${name}: Library/Back and reload restore the reader anchor before delayed rows and footer layout`, async () => {
    memory.forgetConversationScrolls();
    let view = await mountStream({ caps, clamp: true });
    try {
      await view.scroll(425);
      const saved = memory.recallConversationAnchor('task:test');
      assert.equal(saved.messageId, '3');
      assert.equal(saved.offset, -25);
      assert.equal(saved.atBottom, false);
      await view.close();
      // Back initially mounts an empty stream; history and the measured footer arrive later.
      view = await mountStream({ caps, clamp: true, ids: [], ready: false });
      await view.scrollEvent();
      window.dispatchEvent(new window.Event('pagehide'));
      assert.deepEqual(memory.recallConversationAnchor('task:test'), saved);
      await view.patch({ ids: ['4', '5'] });
      await view.scrollEvent();
      assert.deepEqual(memory.recallConversationAnchor('task:test'), saved, 'partial cache must not replace the anchor');
      // With the footer not yet measured the restored offset happens to be within 80px of the bottom.
      await view.patch({ ids: ['1', '2', '3', '4', '5'], ready: true, viewport: 650 });
      assert.equal(view.scroller.scrollTop, 350, 'browser clamps restoration before the footer is measured');
      await view.scrollEvent(); // Browser event from restoreConversationAnchor, not a reader scroll.
      await view.patch({ viewport: 200, revision: 1 });
      await view.resize(0);
      assert.equal(view.state.following, false, 'restoration must win over follow-latest');
      assert.equal(view.scroller.scrollTop, 425);
      assert.deepEqual(memory.captureConversationAnchor(view.scroller, false, '5'), saved);
      assert.deepEqual(memory.recallConversationAnchor('task:test'), saved);
      // Reload starts again with no rendered messages; neither scroll nor pagehide may resave it.
      await view.close();
      view = await mountStream({ caps, clamp: true, ids: [], ready: false });
      await view.scrollEvent();
      await view.patch({ ids: ['1', '2', '3', '4', '5'], ready: true });
      await view.scrollEvent();
      assert.equal(view.scroller.scrollTop, 425);
      assert.deepEqual(memory.recallConversationAnchor('task:test'), saved);
    } finally { await view.close(); }
  });

  test(`${name}: a mounted stream preserves its anchor while hidden, empty or loading`, async () => {
    memory.forgetConversationScrolls();
    const view = await mountStream({ caps });
    try {
      await view.scroll(425);
      const saved = memory.recallConversationAnchor('task:test');
      await view.patch({ ids: [], ready: false, active: false });
      await view.scroll(0);
      window.dispatchEvent(new window.Event('pagehide'));
      await view.patch({ active: true });
      await view.patch({ ids: ['4', '5'], ready: false });
      await view.scroll(200);
      assert.deepEqual(memory.recallConversationAnchor('task:test'), saved);
      await view.patch({ ids: ['1', '2', '3', '4', '5'], ready: true });
      await view.scrollEvent();
      assert.equal(view.scroller.scrollTop, 425);
      assert.equal(view.state.following, false);
      assert.deepEqual(memory.recallConversationAnchor('task:test'), saved);
      await view.scroll(700);
      assert.equal(view.state.following, false, 'reader may still move after restoration');
      assert.equal(memory.recallConversationAnchor('task:test').offset, -100);
    } finally { await view.close(); }
  });

  test(`${name}: a zero-height first layout waits for measurement before restoring`, async () => {
    memory.forgetConversationScrolls();
    const saved = { messageId: '3', offset: -25, atBottom: false, latestId: '5', rowId: 3 };
    memory.rememberConversationAnchor('task:test', saved);
    const view = await mountStream({ caps, viewport: 0 });
    try {
      await view.scrollEvent();
      window.dispatchEvent(new window.Event('pagehide'));
      assert.equal(view.scroller.scrollTop, 0);
      assert.deepEqual(memory.recallConversationAnchor('task:test'), saved);
      await view.patch({ viewport: 200 });
      await view.resize(0);
      await view.scrollEvent();
      assert.equal(view.scroller.scrollTop, 425);
      assert.equal(view.state.following, false);
      assert.deepEqual(memory.recallConversationAnchor('task:test'), saved);
    } finally { await view.close(); }
  });

  test(`${name}: reopen stays on message, growing content/prepends stay aligned, unread counts messages and latest resumes`, async () => {
    memory.forgetConversationScrolls();
    memory.rememberConversationAnchor('task:test', { messageId: '3', offset: -25, atBottom: false, latestId: '4', rowId: 3 });
    const view = await mountStream({ caps });
    try {
      assert.equal(view.scroller.scrollTop, 425);
      assert.equal(view.state.following, false);
      assert.equal(view.state.unread, 1, 'one new message since last visit');
      assert.ok(view.host.querySelector('[data-stream-latest]'));
      await view.resize(80);
      assert.equal(view.scroller.scrollTop, 505, 'image layout keeps the same message offset');
      await view.patch({ ids: ['0', '1', '2', '3', '4', '5'] });
      assert.equal(view.scroller.scrollTop, 705, 'prepend retains message + offset');
      assert.equal(view.state.unread, 1, 'older messages are not unread');
      await view.patch({ ids: ['0', '1', '2', '3', '4', '5', '6'] });
      assert.equal(view.state.unread, 2);
      await view.patch({ revision: 2 });
      assert.equal(view.state.unread, 2, 'a streamed chunk is not another message');
      await act(async () => view.state.resumeFollowing());
      assert.equal(view.state.following, true); assert.equal(view.state.unread, 0);
      assert.equal(view.host.querySelector('[data-stream-latest]'), null);
      assert.equal(memory.recallConversationAnchor('task:test').atBottom, true);
      const footer = view.host.querySelector('[data-agent-chat-footer]');
      assert.ok(footer.classList.contains('absolute'));
      assert.ok(footer.classList.contains('pointer-events-none'));
      assert.equal(footer.className.includes('border-t'), false);
      assert.equal(view.host.querySelector('[data-transcript-stream]').dataset.streamBranch, String(caps.branch));
    } finally { await view.close(); }
  });
}

test('a missing anchor falls back to latest; an at-bottom anchor ignores obsolete message ids', async () => {
  for (const atBottom of [false, true]) {
    memory.forgetConversationScrolls();
    memory.rememberConversationAnchor('task:test', { messageId: 'gone', offset: -45, atBottom });
    const view = await mountStream();
    try { assert.equal(view.state.following, true); assert.equal(view.scroller.scrollTop, 1000); }
    finally { await view.close(); }
  }
});

test('partial data waits to resolve the anchor and switching back restores the saved task independently', async () => {
  memory.forgetConversationScrolls();
  memory.rememberConversationAnchor('task:first', { messageId: '2', offset: -10, atBottom: false });
  const view = await mountStream({ key: 'task:first', ids: ['4', '5'], ready: false });
  try {
    assert.equal(view.scroller.scrollTop, 0, 'partial cache cannot overwrite a saved anchor');
    await view.patch({ ready: true, ids: ['1', '2', '3', '4', '5'] });
    assert.equal(view.scroller.scrollTop, 210);
    await view.patch({ key: 'task:second', ids: ['6', '7'] });
    assert.equal(view.state.following, true);
    await view.patch({ key: 'task:first', ids: ['1', '2', '3', '4', '5'] });
    assert.equal(view.scroller.scrollTop, 210);
  } finally { await view.close(); }
});

test('cloud rendered paging opens around an older id and new tail rows cannot evict the reading window', async () => {
  memory.forgetConversationScrolls();
  memory.rememberConversationAnchor('task:cloud-page', { messageId: '25', offset: -5, atBottom: false });
  const host = document.createElement('div'); document.body.append(host);
  let history, update;
  function Harness() {
    const [messages, set] = useState(Array.from({ length: 200 }, (_, id) => ({ id: id + 1, role: 'user', kind: 'text', content: String(id) })));
    update = set;
    history = useCloudHistory('task:cloud-page', messages);
    return React.createElement('div', null, history.visible.map((message) => React.createElement('span', { key: message.id }, message.id)));
  }
  const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(Harness)));
    assert.ok(history.visible.some((message) => message.id === 25));
    const first = history.visible[0].id;
    await act(async () => update((messages) => [...messages, { id: 201, role: 'assistant', kind: 'text', content: 'new' }]));
    assert.equal(history.visible[0].id, first, 'tail appends retain first rendered id');
    await act(async () => history.loadEarlier());
    assert.equal(history.visible[0].id, 1); assert.equal(history.hasMore, false);
  } finally { await act(async () => root.unmount()); host.remove(); }
});

test('corrupt/legacy pixel-only storage is ignored', () => {
  window.localStorage.setItem('oceanleo:conversation-anchors:v2', '{broken');
  assert.equal(memory.recallConversationAnchor('task:x'), null);
  window.localStorage.setItem('oceanleo:conversation-anchors:v2', JSON.stringify({ 'task:x': { top: 300, atBottom: false } }));
  assert.equal(memory.recallConversationAnchor('task:x'), null);
});

test('ACP adapter renders cloud timestamps, one copy action per completed turn and no branch/regenerate', async () => {
  const { AcpTranscript } = await import(await compileModule('src/acp/AcpTranscript.tsx', {
    '../i18n/ui/useUI': dataModule('export const useUI = () => (value, vars) => value.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? key));'),
    './share/share-clipboard': dataModule('export async function writeClipboardText(value) { globalThis.__streamCopied = value; return true; }'),
  }));
  const make = (id, direction, message) => ({ id, direction, received_at: '2026-11-19T10:00:00Z', raw: JSON.stringify({ jsonrpc: '2.0', ...message }) });
  const update = (id, update) => make(id, 'agent', { method: 'session/update', params: { sessionId: 's1', update } });
  const rows = [
    make(1, 'client', { id: 9, method: 'session/prompt', params: { sessionId: 's1', prompt: [{ type: 'text', text: 'Question' }] } }),
    update(2, { sessionUpdate: 'agent_message_chunk', messageId: 'a', content: { type: 'text', text: 'First part' } }),
    update(3, { sessionUpdate: 'tool_call', toolCallId: 'tool1', title: 'Read file', kind: 'read', status: 'completed' }),
    update(4, { sessionUpdate: 'agent_message_chunk', messageId: 'b', content: { type: 'text', text: 'Second part' } }),
    make(5, 'agent', { id: 9, result: { stopReason: 'end_turn' } }),
  ];
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(AcpTranscript, { rows, program: 'generic' })));
    assert.equal(host.querySelectorAll('[data-chat-time-separator]').length, 1);
    assert.equal(host.querySelector('time').getAttribute('datetime'), '2026-11-19T10:00:00.000Z');
    assert.equal(host.querySelectorAll('[data-agent-turn-actions]').length, 1);
    assert.equal(host.querySelector('[aria-label="重做"]'), null);
    const copy = host.querySelector('[data-agent-turn-actions] button');
    assert.ok(copy);
    await act(async () => copy.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
    assert.equal(globalThis.__streamCopied, 'First part\n\nSecond part');
    assert.equal(host.querySelector('[data-transcript-stream]').dataset.streamBranch, 'false');
  } finally { await act(async () => root.unmount()); host.remove(); delete globalThis.__streamCopied; }
});

test('footer resizing reserves the measured height and lifts the latest pill above it', async () => {
  memory.forgetConversationScrolls();
  memory.rememberConversationAnchor('task:test', { messageId: '2', offset: 0, atBottom: false });
  const view = await mountStream();
  try {
    const footer = view.host.querySelector('[data-agent-chat-footer]');
    footer.getBoundingClientRect = () => ({ height: 176 });
    await view.resize(0);
    assert.equal(view.scroller.style.paddingBottom, '192px');
    assert.equal(view.host.querySelector('[data-stream-latest]').parentElement.parentElement.style.bottom, '188px');
    assert.ok(footer.querySelector('textarea'), 'footer remains measurable and composer remains interactive');
    assert.ok(footer.firstElementChild.classList.contains('pointer-events-auto'));
    footer.getBoundingClientRect = () => ({ height: 84 });
    await view.resize(0);
    assert.equal(view.scroller.style.paddingBottom, '100px');
  } finally { await view.close(); }
});


test('forward-filling an anchored window counts only messages newer than the previous visit', async () => {
  memory.forgetConversationScrolls();
  memory.rememberConversationAnchor('task:test', { messageId: '2', offset: -10, atBottom: false, latestId: '8', rowId: 2 });
  const view = await mountStream({ hasMoreAfter: true });
  try {
    assert.equal(view.state.unread, 0);
    assert.equal(memory.recallConversationAnchor('task:test').latestId, '8', 'partial window cannot overwrite the saved last-known message');
    await view.patch({ ids: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], hasMoreAfter: false });
    assert.equal(view.state.unread, 2, 'older forward-filled history is not new');
    await view.patch({ ids: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'] });
    assert.equal(view.state.unread, 3);
    assert.equal(view.scroller.scrollTop, 210);
  } finally { await view.close(); }
});

for (const [name, caps] of [['cloud', CLOUD_TRANSCRIPT_CAPABILITIES], ['ACP', ACP_TRANSCRIPT_CAPABILITIES]]) {
  test(`${name}: cached ids wait for access-gated message DOM before deciding an anchor is missing`, async () => {
    memory.forgetConversationScrolls();
    const saved = { messageId: '3', offset: -25, atBottom: false, latestId: '5', rowId: 3 };
    memory.rememberConversationAnchor('task:test', saved);
    const view = await mountStream({ caps, clamp: true, rendered: false });
    try {
      assert.equal(view.scroller.scrollTop, 0);
      await view.scrollEvent();
      window.dispatchEvent(new window.Event('pagehide'));
      assert.deepEqual(memory.recallConversationAnchor('task:test'), saved);
      // Cached ids, ready and revision all stay the same when the access gate
      // opens. The column's real ResizeObserver is what retries placement.
      await view.patch({ rendered: true });
      await view.resize(0);
      await view.scrollEvent();
      assert.equal(view.scroller.scrollTop, 425);
      assert.equal(view.state.following, false, 'access loading must not switch restoration into follow-latest');
      assert.deepEqual(memory.captureConversationAnchor(view.scroller, false, '5'), saved);
      assert.deepEqual(memory.recallConversationAnchor('task:test'), saved);
    } finally { await view.close(); }
  });
}
