import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
import { reduceRows } from '../src/acp/reduce.ts';
import { viewBlocks } from '../src/acp/messages.ts';
import { acpTranscriptItems } from '../src/shell/transcript/adapters.ts';
import * as memory from '../src/shell/task-scroll-memory.ts';

const require = createRequire(import.meta.url);
const fabric = createRequire(require.resolve('fabric/node'));
const canvas = fabric.resolve('canvas'), previous = require.cache[canvas];
require.cache[canvas] = { id: canvas, filename: canvas, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabric.resolve('jsdom')).href);
if (previous) require.cache[canvas] = previous; else delete require.cache[canvas];
const { TranscriptStream, ACP_TRANSCRIPT_CAPABILITIES } = await import(await compileModule('src/shell/transcript/TranscriptStream.tsx', {
  '../../i18n/ui/useUI': dataModule('export const useUI = () => (s) => s;'),
}));
const original = 'Original answer: ' + Array.from({ length: 12 }, (_, i) => `Line ${i} keeps its own visible content. `).join('');
function chunk(id, text) {
  return { id, direction: 'agent', node_seq: id, received_at: '2026-11-19T10:00:00Z', raw: JSON.stringify({
    jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'main', update: {
      sessionUpdate: 'agent_message_chunk', messageId: 'answer', content: { type: 'text', text },
    } },
  }) };
}
const first = chunk(10, 'First page of earlier text. ');
const second = chunk(30, 'Another page starts inside the same answer. ');
const visible = chunk(50, original);
const append = chunk(70, ' Incoming output added at the bottom while history loads.');
const tool = { ...chunk(40, ''), raw: JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: {
  sessionId: 'main', update: { sessionUpdate: 'tool_call', toolCallId: 'interleave', title: 'Read', status: 'completed' },
} }) };

function page() {
  const dom = new JSDOM('<div id="scroll"></div>', { url: 'https://dev.oceanleo.com/tasks/test' });
  globalThis.window = dom.window;
  const root = dom.window.document.getElementById('scroll');
  let height = 0;
  Object.defineProperties(root, { clientHeight: { value: 300 }, scrollHeight: { get: () => height + 900 } });
  root.getBoundingClientRect = () => ({ top: 50, bottom: 350 });
  // jsdom supplies DOM/Range identity, but no layout. Model fixed-width text lines,
  // including ranges inside nested nodes; this is independent of anchor lookup.
  dom.window.Range.prototype.getBoundingClientRect = function () {
    const node = this.startContainer;
    const item = node.parentElement.closest('[data-stream-message-id]');
    const walker = node.ownerDocument.createTreeWalker(item, 4);
    let n, offset = 0;
    while ((n = walker.nextNode()) && n !== node) offset += n.length;
    const start = Math.floor((offset + this.startOffset) / 20) * 20;
    const end = Math.floor((offset + Math.max(this.startOffset, this.endOffset - 1)) / 20) * 20;
    const top = item.getBoundingClientRect().top + start;
    return { top, bottom: item.getBoundingClientRect().top + end + 20, width: 10, height: end - start + 20 };
  };
  return { root, render(rows) {
    const view = reduceRows(rows), items = acpTranscriptItems(viewBlocks(view, {}), view);
    root.innerHTML = renderToStaticMarkup(React.createElement(TranscriptStream, {
      items, capabilities: ACP_TRANSCRIPT_CAPABILITIES,
      renderItem: (value) => value.type === 'bubble'
        ? React.createElement('p', null, value.message.content.slice(0, 37), React.createElement('span', null, value.message.content.slice(37)))
        : React.createElement('div', null, 'Process'),
    }));
    height = 60;
    for (const item of root.querySelectorAll('[data-stream-message-id]')) {
      const top = height, size = Math.ceil(item.textContent.length / 20) * 20 + 20;
      item.getBoundingClientRect = () => ({ top: 50 + top - root.scrollTop, bottom: 50 + top + size - root.scrollTop, height: size });
      height += size;
    }
    return items;
  }, close() { dom.window.close(); } };
}

function contentTop(root, text) {
  const item = [...root.querySelectorAll('[data-stream-message-id]')].find(e => e.textContent.includes(text));
  const index = item.textContent.indexOf(text);
  return item.getBoundingClientRect().top + Math.floor(index / 20) * 20 - root.getBoundingClientRect().top;
}

test('capped ACP message rekeys on repeated prepends; exact visible content stays aligned even with simultaneous output', () => {
  const p = page();
  try {
    p.render([visible]); p.root.scrollTop = 165;
    const saved = memory.captureConversationAnchor(p.root, false, 'message-50');
    assert.equal(saved.messageId, 'message-50');
    assert.equal(saved.rowId, 50);
    const witness = original.slice(120, 190), offset = contentTop(p.root, witness);
    memory.rememberConversationAnchor('task:prepend', saved);
    const stored = memory.recallConversationAnchor('task:prepend');
    for (const rows of [[second, tool, visible, append], [first, second, tool, visible, append]]) {
      const items = p.render(rows), message = items.find(item => item.value.type === 'bubble');
      assert.notEqual(message.messageId, stored.messageId, 'real reducer changes first-row key');
      assert.deepEqual(message.rowIds, rows.filter(row => row !== tool).map(row => row.id));
      assert.equal(memory.restoreConversationAnchor(p.root, stored), false, 'do not treat a retained frame as missing');
      assert.equal(contentTop(p.root, witness), offset, 'same characters remain at the viewport offset');
      assert.ok(p.root.scrollTop < p.root.scrollHeight - p.root.clientHeight, 'reader does not jump to latest');
      memory.restoreConversationAnchor(p.root, stored);
      assert.equal(contentTop(p.root, witness), offset, 'later layout realignment is idempotent');
    }
  } finally { p.close(); }
});

test('rekeyed messages use exact frame membership, never an overlapping id range or matching text alone', () => {
  const p = page();
  try {
    p.render([visible]); p.root.scrollTop = 0;
    const saved = memory.captureConversationAnchor(p.root, false);
    p.render([second, tool, visible]);
    assert.equal(memory.restoreConversationAnchor(p.root, { ...saved, rowId: 40 }), true);
    assert.equal(p.root.scrollTop, p.root.scrollHeight);
    assert.equal(memory.restoreConversationAnchor(p.root, { ...saved, atBottom: true }), true);
  } finally { p.close(); }
});

test('legacy message anchors still restore without ACP membership', () => {
  const p = page();
  try {
    p.render([visible]);
    p.root.firstElementChild.firstElementChild.removeAttribute('data-stream-row-ids');
    p.root.scrollTop = 85;
    const saved = memory.captureConversationAnchor(p.root, false);
    assert.equal(saved.textAnchor, undefined);
    p.root.scrollTop = 0;
    assert.equal(memory.restoreConversationAnchor(p.root, saved), false);
    assert.equal(p.root.scrollTop, 85);
  } finally { p.close(); }
});
