import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import React, {act} from 'react';
import {compileModule, dataModule} from './helpers/module-bench.mjs';
import {TOOLUI_MESSAGES} from '../src/i18n/ui/messages/toolui-copy.ts';

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
globalThis.__toolwebCopied = [];
globalThis.__toolwebLocale = 'en';
globalThis.__toolwebClipboardOK = true;
globalThis.__toolwebTranslate = source => {
  const locale = globalThis.__toolwebLocale;
  const generic = locale === 'zh' ? {} : locale === 'zh-TW'
    ? {'参数': '參數', '结果': '結果', '展开': '展開', '收起': '收起', '复制': '複製', '已复制': '已複製'}
    : {'参数': 'Input', '结果': 'Output', '展开': 'Expand', '收起': 'Collapse', '复制': 'Copy', '已复制': 'Copied'};
  return TOOLUI_MESSAGES[locale]?.[source] ?? generic[source] ?? source;
};
const {AgentProgress} = await import(await compileModule('src/shell/AgentProgress.tsx', {
  '../i18n/ui/useUI': dataModule('export function useUI(){return globalThis.__toolwebTranslate}'),
  './share/share-clipboard': dataModule('export async function writeClipboardText(text){globalThis.__toolwebCopied.push(text);return globalThis.__toolwebClipboardOK}'),
}));
const message = card => ({id: 1, role: 'assistant', kind: 'step', content: 'Run tool', meta: {tool_card: {id: 'root', kind: 'execute', ...card}}});
async function mount(card) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const update = async next => {await act(async () => root.render(React.createElement(AgentProgress, {messages: [message(next)], running: true})));};
  await update(card);
  return {host, update, close() {act(() => root.unmount()); host.remove();}};
}
const click = async element => {assert.ok(element, 'expected clickable element'); await act(async () => element.click());};
const tool = view => view.host.querySelector('[data-agent-process-tool]');
const payloads = view => [...tool(view).querySelectorAll('[data-tool-payload]')];
const openTool = async view => {await click(tool(view).querySelector('button'));};

test('main task timeline opens separate raw folds, preserves outer folds and copies the displayed streamed value', async () => {
  const card = {rawInput: {command: 'pwd'}, rawOutput: '/repo'};
  const view = await mount(card);
  try {
    assert.equal(tool(view).querySelector('button').getAttribute('aria-expanded'), 'false');
    assert.equal(payloads(view).length, 0);
    await openTool(view);
    const [input, output] = payloads(view);
    assert.equal(payloads(view).length, 2);
    assert.match(input.textContent, /^Input/); assert.match(output.textContent, /^Output/);
    assert.equal(input.querySelector('button').getAttribute('aria-expanded'), 'false');
    await click(input.querySelector('button'));
    assert.equal(output.querySelector('pre'), null, 'output stays independently folded');
    const pre = input.querySelector('pre');
    assert.match(pre.className, /font-mono/); assert.match(pre.className, /select-text/);
    await click(pre);
    assert.equal(tool(view).querySelector('button').getAttribute('aria-expanded'), 'true');
    await click(input.querySelectorAll('button')[1]);
    assert.equal(globalThis.__toolwebCopied.at(-1), pre.textContent);
    assert.equal(input.querySelectorAll('button')[1].textContent, 'Copied');
    assert.equal(input.querySelectorAll('button')[1].getAttribute('aria-label'), 'Tool content copied');
    await view.update({...card, rawInput: {command: 'ls'}});
    assert.equal(input.querySelectorAll('button')[1].textContent, 'Copy');
    await click(input.querySelectorAll('button')[1]);
    assert.equal(globalThis.__toolwebCopied.at(-1), '{\n  "command": "ls"\n}');
    await click(output.querySelector('button'));
    await click(input.querySelector('button'));
    assert.equal(input.querySelector('pre'), null);
    assert.equal(output.querySelector('pre').textContent, '/repo');
  } finally {view.close();}
});

test('main timeline caps displayed and copied output and handles redaction and untrusted text as text', async () => {
  const view = await mount({rawInput: {redacted: true, original: 'synthetic-hidden'}, raw_input: 'synthetic-hidden', raw_output: 'x'.repeat(70000)});
  try {
    await openTool(view);
    const [input, output] = payloads(view);
    await click(input.querySelector('button')); await click(output.querySelector('button'));
    assert.match(input.textContent, /REDACTED/); assert.doesNotMatch(view.host.textContent, /synthetic-hidden/);
    const shown = output.querySelector('pre').textContent;
    assert.ok(shown.length <= 65536); assert.match(shown, /\n\[TRUNCATED\]$/);
    await click(output.querySelectorAll('button')[1]);
    assert.equal(globalThis.__toolwebCopied.at(-1), shown);
    await view.update({rawOutput: '<script>synthetic-script</script>'});
    const remaining = payloads(view);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].querySelector('button').getAttribute('aria-expanded'), 'true');
    assert.equal(view.host.querySelector('script'), null);
    assert.equal(remaining[0].querySelector('pre').textContent, '<script>synthetic-script</script>');
  } finally {view.close();}
});

test('nested tool raw values remain independently folded and coexist with native diff/terminal/locations', async () => {
  const view = await mount({rawInput: {request: 'check'},
    content: [{type: 'diff', path: 'a.ts', old_text: 'a', new_text: 'b'}, {type: 'terminal', output: 'done'}],
    locations: [{path: 'a.ts', line: 1}],
    children: [{id: 'child', kind: 'read', title: 'Read child', status: 'completed', raw_input: false, raw_output: null}],
  });
  try {
    await openTool(view);
    assert.ok(view.host.querySelector('[data-agent-process-diff="a.ts"]'));
    assert.equal(view.host.querySelector('[data-agent-process-terminal]').textContent, 'done');
    assert.equal(view.host.querySelector('[data-agent-process-locations]').textContent, 'a.ts:1');
    const child = view.host.querySelector('[data-agent-process-substep-list] [data-agent-process-tool]');
    await click(child.querySelector('button'));
    const [input, output] = child.querySelectorAll('[data-tool-payload]');
    await click(input.querySelector('button')); await click(output.querySelector('button'));
    assert.equal(input.querySelector('pre').textContent, 'false');
    assert.equal(output.querySelector('pre').textContent, 'null');
    assert.equal(tool(view).querySelector('button').getAttribute('aria-expanded'), 'true');
  } finally {view.close();}
});

test('raw payloads specify readable light/dark foregrounds and backgrounds and localized copy labels', async () => {
  for (const locale of ['en', 'zh', 'zh-TW', 'ja']) {
    globalThis.__toolwebLocale = locale;
    for (const theme of ['', 'dark']) {
      document.documentElement.className = theme;
      const view = await mount({rawInput: 0});
      try {
        await openTool(view);
        const [input] = payloads(view); await click(input.querySelector('button'));
        const pre = input.querySelector('pre');
        assert.match(pre.className, /text-stone-600/); assert.match(pre.className, /dark:text-stone-300/);
        assert.match(pre.className, /bg-stone-50/); assert.match(pre.className, /dark:bg-stone-900/);
        assert.equal(input.querySelectorAll('button')[1].getAttribute('aria-label'), TOOLUI_MESSAGES[locale]['复制工具内容']);
        if (!locale.startsWith('zh')) assert.doesNotMatch(input.textContent, /[\u3400-\u9fff]/);
      } finally {view.close();}
    }
  }
  globalThis.__toolwebLocale = 'en'; document.documentElement.className = '';
});

test('tools without raw values retain preview rows without empty folds; failed copy stays unconfirmed', async () => {
  const view = await mount({});
  try {
    await openTool(view); assert.equal(payloads(view).length, 0);
    await view.update({rawOutput: 'copy me'});
    const [output] = payloads(view); await click(output.querySelector('button'));
    globalThis.__toolwebClipboardOK = false;
    await click(output.querySelectorAll('button')[1]);
    assert.equal(output.querySelectorAll('button')[1].textContent, 'Copy');
  } finally {globalThis.__toolwebClipboardOK = true; view.close();}
});
