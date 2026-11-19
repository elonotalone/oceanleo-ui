import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react';
await import('./agent-chat-conversations.test.mjs');
const { mount, settle, session, computerTask, rows, connect, deliver } = globalThis.__agentChatHarness;
const sessions = [session('history_codex', 'acp', 'codex')];
const initialRows = () => [
  { ...rows.prompt(101, 'Recent question'), id: 100 }, { ...rows.done(101), id: 101 },
  { ...rows.prompt(102, 'Reading this question'), id: 102 }, { ...rows.done(102), id: 103 },
];
const olderRows = () => [{ ...rows.prompt(99, 'Earlier question'), id: 90 }, { ...rows.done(99), id: 91 }];
const page = (items, more = true, before = 100) => ({ rows: items, tail_id: 103, next_before: before, has_more: more, capped: false, has_more_after: false });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const wait = () => { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; };

async function historyMount(route, { anchor } = {}) {
  const anchorKey = "oceanleo:conversation-anchors:v2";
  const oldAnchor = localStorage.getItem(anchorKey);
  localStorage.setItem(anchorKey, JSON.stringify(anchor ? { "task:t1": anchor } : {}));
  const oldFetch = globalThis.fetch; const errors = []; const oldError = console.error;
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  const oldClient = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  const oldHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
  const requests = [];
  console.error = (...args) => errors.push(args.map(String).join(' '));
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return this.hasAttribute('data-agent-stream-scroller') ? 400 : 0; } });
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get() { return this.hasAttribute('data-agent-stream-scroller') ? 4000 : 0; } });
  HTMLElement.prototype.getBoundingClientRect = function () {
    const scroller = this.closest('[data-agent-stream-scroller]');
    if (this.hasAttribute('data-agent-stream-scroller')) return { top: 0, bottom: 400, height: 400 };
    if (this.hasAttribute('data-older-history-sentinel')) return { top: -scroller.scrollTop, bottom: -scroller.scrollTop };
    if (this.hasAttribute('data-history-key')) {
      const index = [...this.parentElement.children].indexOf(this);
      return { top: 32 + index * 500 - scroller.scrollTop, bottom: 532 + index * 500 - scroller.scrollTop };
    }
    return originalRect.call(this);
  };
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/history?')) {
      const query = new URL(String(url)).searchParams; requests.push(query);
      return route(query, requests.length);
    }
    return oldFetch(url, init);
  };
  const view = await mount({ taskId: 't1' }, { task: computerTask(), sessions });
  await settle();
  const scroller = view.host.querySelector('[data-agent-stream="acp"] [data-agent-stream-scroller]');
  return { ...view, scroller, requests, async scroll(top) { await act(async () => { scroller.scrollTop = top; scroller.dispatchEvent(new Event('scroll')); }); await settle(); }, async close() {
    await view.unmount(); globalThis.fetch = oldFetch; console.error = oldError; HTMLElement.prototype.getBoundingClientRect = originalRect;
    for (const [name, descriptor] of [['clientHeight', oldClient], ['scrollHeight', oldHeight]]) { if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor); else delete HTMLElement.prototype[name]; }
    if (oldAnchor == null) localStorage.removeItem(anchorKey); else localStorage.setItem(anchorKey, oldAnchor);
    assert.deepEqual(errors, [], 'real task pane must not log React errors');
  } };
}

test('real ACP pane prefetches one batch without a button; only top shows spinner; a prepend preserves reading while bottom rows stream', async () => {
  const pending = wait();
  const view = await historyMount((query) => query.has('before') ? pending.promise : json(page(initialRows())));
  try {
    assert.equal(view.requests.length, 2, 'initial window plus one background batch');
    assert.doesNotMatch(view.host.textContent, /加载更早的消息|Load earlier messages|正在加载更早/);
    assert.equal(view.host.querySelector('[data-acp-history-window]'), null);
    assert.equal(view.host.querySelector('.v-spinner'), null, 'prefetch is quiet below top');
    await view.scroll(500); await view.scroll(400); assert.equal(view.requests.length, 2, 'no parallel batch');
    await view.scroll(0); assert.ok(view.host.querySelector('.v-spinner'));
    await view.scroll(550); assert.equal(view.host.querySelector('.v-spinner'), null);
    const item = [...view.host.querySelectorAll('[data-acp-transcript] [data-history-key]')].find((child) => child.textContent.includes('Reading this question'));
    const before = item.getBoundingClientRect().top;
    await connect();
    await act(async () => pending.resolve(json(page(olderRows(), false, null))));
    await settle();
    assert.ok(Math.abs(item.getBoundingClientRect().top - before) <= 1, 'reading line stays anchored after prepend and top-slot removal');
    const anchoredTop = view.scroller.scrollTop;
    await deliver({ ...rows.prompt(103, 'New bottom message'), id: 104 });
    assert.equal(view.scroller.scrollTop, anchoredTop, 'streaming bottom does not pull a scrolled-up reader');
    assert.equal(view.host.querySelector('[data-older-history-top]'), null);
    assert.match(view.host.textContent, /Earlier question/);
  } finally { await view.close(); }
});

test('real ACP pane retries a history failure silently with the same cursor', async () => {
  let attempts = 0; const pending = wait();
  const view = await historyMount((query) => {
    if (!query.has('before')) return json(page(initialRows()));
    attempts++; return attempts === 1 ? json({ detail: 'history offline' }, 503) : pending.promise;
  });
  try {
    assert.equal(attempts, 1); assert.doesNotMatch(view.host.textContent, /history offline|加载更早/);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 1100))); await settle();
    assert.equal(attempts, 2); assert.equal(view.requests[1].get('before'), view.requests[2].get('before'));
    await act(async () => pending.resolve(json(page(olderRows(), false, null)))); await settle();
    assert.match(view.host.textContent, /Earlier question/); assert.doesNotMatch(view.host.textContent, /history offline|加载更早/);
  } finally { await view.close(); }
});

test('real ACP pane requests the next batch before reaching the top and stops when its buffer is full', async () => {
  let attempts = 0;
  const view = await historyMount((query) => {
    if (!query.has('before')) return json(page(initialRows()));
    attempts++;
    return attempts === 1 ? json(page(olderRows(), true, 90)) : json(page([{ ...rows.prompt(98, 'Oldest question'), id: 80 }, { ...rows.done(98), id: 81 }], false, null));
  });
  try {
    await settle(); assert.equal(attempts, 1);
    await view.scroll(550); await settle(); assert.equal(attempts, 2, 'load starts 550px above top of a 400px viewport');
    assert.match(view.host.textContent, /Oldest question/); assert.equal(view.host.querySelector('.v-spinner'), null);
  } finally { await view.close(); }
});

test('reopening a saved reading position fills forward, preserves the oldest cursor and then prefetches older turns', async () => {
  const pending = wait();
  const view = await historyMount((query) => {
    if (query.has('before')) return pending.promise;
    if (query.has('after')) return json({ ...page([{ ...rows.prompt(103, 'Forward-filled latest'), id: 110 }, { ...rows.done(103), id: 111 }], false, 110), tail_id: 111 });
    return json({ ...page(initialRows()), has_more_after: true, next_after: 103, newest_id: 103 });
  }, { anchor: { messageId: "turn-102", rowId: 102, offset: -18, atBottom: false } });
  try {
    assert.equal(view.requests[0].get('anchor'), '102');
    assert.equal(view.requests[1].get('after'), '103');
    assert.equal(view.requests[2].get('before'), '100', 'older cursor belongs to original anchored page, not forward-filled tail');
    assert.equal(view.host.querySelector('[data-stream-message-id="turn-102"]').getBoundingClientRect().top, -18, 'saved message offset restores after the window attaches');
    assert.match(view.host.textContent, /Forward-filled latest/);
    await act(async () => pending.resolve(json(page(olderRows(), false, null)))); await settle();
    assert.match(view.host.textContent, /Earlier question/);
    assert.notEqual(view.scroller.scrollTop, 4000, 'prefetch never follows to bottom');
  } finally { await view.close(); }
});

test('anchored history opens its live subscription before forward fill finishes and retains rows received meanwhile', async () => {
  const pending = wait();
  const view = await historyMount((query) => {
    if (query.has('after')) return pending.promise;
    return json({ ...page(initialRows(), false, null), has_more_after: true, next_after: 103, newest_id: 103 });
  }, { anchor: { messageId: "turn-102", rowId: 102, offset: -18, atBottom: false } });
  try {
    assert.match(view.host.textContent, /Reading this question/);
    assert.ok(globalThis.__agentChatHarness.socket(), 'live socket does not wait for the forward-fill read');
    await connect();
    await deliver({ ...rows.prompt(900, 'Live output while filling'), id: 120 });
    await act(async () => pending.resolve(json({ ...page([{ ...rows.prompt(103, 'Forward fill arrives later'), id: 110 }, { ...rows.done(103), id: 111 }], false, null), tail_id: 111 })));
    await settle();
    assert.match(view.host.textContent, /Live output while filling/);
    assert.match(view.host.textContent, /Forward fill arrives later/);
    assert.equal(globalThis.__sockets.length, 1, 'history completion does not reopen the live socket');
  } finally { pending.resolve(json(page([], false, null))); await view.close(); }
});

test('a capped long turn recovers the saved chunk before rendering or falling back to latest', async () => {
  const pending = wait();
  // The live failure: /history?anchor=3832 yielded only the final 2000 rows
  // (4658..6657), so the first chunk/key of the visible message was missing.
  const newest = [
    ...Array.from({ length: 1999 }, (_, index) => ({ ...rows.chunk('x'), id: 4658 + index })),
    { ...rows.done(840), id: 6657 },
  ];
  const view = await historyMount((query) => {
    if (query.get('before') === '4658') return pending.promise;
    return json({ ...page(newest, true, 4658), oldest_id: 4658, newest_id: 6657, tail_id: 6657, capped: true });
  }, { anchor: { messageId: 'message-3832', rowId: 3832, offset: -18, atBottom: false } });
  try {
    assert.equal(view.requests[0].get('anchor'), '3832');
    assert.equal(view.requests[1].get('before'), '4658', 'a capped missing row is searched through the earlier cursor');
    assert.equal(view.host.querySelector('[data-stream-message-id="message-4658"]'), null, 'do not place a truncated replacement message');
    await act(async () => pending.resolve(json({
      ...page([{ ...rows.prompt(840, 'Long turn'), id: 840 }, { ...rows.chunk('Start of saved response '), id: 3832 }], false, null),
      oldest_id: 840, newest_id: 3832, tail_id: 6657,
    })));
    await settle();
    const saved = view.host.querySelector('[data-stream-message-id="message-3832"]');
    assert.ok(saved, 'the reconstructed message keeps its original chunk id');
    assert.equal(saved.getBoundingClientRect().top, -18, 'saved offset restores before follow-latest');
    assert.equal(view.requests.length, 2, 'no unanchored fallback or extra paging after the oldest page');
    assert.equal(view.host.querySelector('[data-stream-message-id="message-4658"]'), null);
    assert.match(view.host.textContent, /Start of saved response x{1999}/, 'both recovered and newest chunks are retained');
  } finally { pending.resolve(json(page([], false, null))); await view.close(); }
});

test('an anchor genuinely missing after crossing its row cursor still falls back to latest', async () => {
  const recent = [{ ...rows.prompt(110, 'Latest turn'), id: 110 }, { ...rows.done(110), id: 111 }];
  const view = await historyMount((query) => {
    if (query.has('before')) return json(page(initialRows().filter(row => row.id < 102), true, 100));
    return json({ ...page(recent, query.has('anchor'), query.has('anchor') ? 110 : null), tail_id: 111, capped: query.has('anchor') });
  }, { anchor: { messageId: 'turn-102', rowId: 102, offset: -18, atBottom: false } });
  try {
    assert.deepEqual(view.requests.map(query => Object.fromEntries(query)), [
      { anchor: '102', turns: '8' }, { before: '110', turns: '8' }, { turns: '8' },
    ]);
    assert.match(view.host.textContent, /Latest turn/);
    assert.equal(view.host.querySelector('[data-stream-message-id="turn-102"]'), null);
    assert.equal(view.scroller.scrollTop, 4000, 'unknown saved message opens at latest');
  } finally { await view.close(); }
});
