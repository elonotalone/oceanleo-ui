import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import React, {act} from 'react';
import {compileModule, dataModule} from './helpers/module-bench.mjs';
const require = createRequire(import.meta.url);
const fabric = createRequire(require.resolve('fabric/node'));
const canvas = fabric.resolve('canvas'), cached = require.cache[canvas];
require.cache[canvas] = {id: canvas, filename: canvas, loaded: true, exports: {}};
const {JSDOM} = await import(pathToFileURL(fabric.resolve('jsdom')).href);
if (cached) require.cache[canvas] = cached; else delete require.cache[canvas];
const dom = new JSDOM('<!doctype html><html><body></body></html>', {url: 'https://dev.oceanleo.com'});
for (const [name, value] of Object.entries({window: dom.window, document: dom.window.document, navigator: dom.window.navigator}))
  Object.defineProperty(globalThis, name, {value, configurable: true});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const {createRoot} = await import('react-dom/client');
globalThis.__tooluiCopied = [];
// ToolView went with the deleted MessageList; the raw folds it rendered are ToolRawFolds (AgentProgress uses them).
const {ToolRawFolds} = await import(await compileModule('src/shell/cloud-computer/agent-dialog/ToolRawFolds.tsx', {
  '../../../i18n/ui/useUI': dataModule('export function useUI(){return source => ({"参数":"Input","结果":"Output","展开":"Expand","收起":"Collapse","复制":"Copy","已复制":"Copied"}[source] || source)}'),
  '../../share/share-clipboard': dataModule('export async function writeClipboardText(text){globalThis.__tooluiCopied.push(text);return true}'),
}));
async function mount(card) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(React.createElement(ToolRawFolds, {tool: card})));
  return {host, root, close() {act(() => root.unmount()); host.remove();}};
}
const card = {id: 'read', title: 'Read file', kind: 'read', status: 'completed', content: [], locations: [], rawInput: {path: 'a.txt'}, rawOutput: 'hello'};
const click = async element => {assert.ok(element); await act(async () => element.click());};
test('each raw field starts folded, uses monospace and copies the displayed filtered value', async () => {
  const view = await mount(card);
  try {
    assert.equal(view.host.querySelectorAll('[data-tool-payload]').length, 2);
    assert.equal(view.host.querySelector('pre'), null);
    const input = view.host.querySelector('[data-tool-payload]'); await click(input.querySelector('button'));
    assert.match(input.querySelector('pre').className, /font-mono/); assert.match(input.textContent, /a.txt/);
    await click(input.querySelectorAll('button')[1]);
    assert.equal(globalThis.__tooluiCopied.at(-1), '{\n  "path": "a.txt"\n}');
    await act(async () => view.root.render(React.createElement(ToolRawFolds, {tool: {...card, rawInput: {path: 'b.txt'}}})));
    assert.equal(input.querySelectorAll('button')[1].textContent, 'Copy');
    await click(input.querySelectorAll('button')[1]);
    assert.match(globalThis.__tooluiCopied.at(-1), /b.txt/);
  } finally {view.close();}
});
test('web raw output remains a text node and redacted envelopes cannot expose their content', async () => {
  const view = await mount({...card, rawInput: {redacted: true, original: 'synthetic-hidden'}, rawOutput: '<img src=x onerror=alert(1)>'});
  try {
    for (const payload of view.host.querySelectorAll('[data-tool-payload]')) await click(payload.querySelector('button'));
    assert.doesNotMatch(view.host.textContent, /synthetic-hidden/);
    assert.match(view.host.textContent, /REDACTED/); assert.equal(view.host.querySelector('img'), null);
    assert.match(view.host.textContent, /<img src=x/);
  } finally {view.close();}
});
