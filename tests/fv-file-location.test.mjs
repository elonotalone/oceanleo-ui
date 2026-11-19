import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { compileModule, dataModule } from './helpers/module-bench.mjs';

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve('fabric/node'));
const canvasEntry = fabricRequire.resolve('canvas');
const previous = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve('jsdom')).href);
if (previous) require.cache[canvasEntry] = previous; else delete require.cache[canvasEntry];
const { FrameFileLocation } = await import(await compileModule('src/shell/FrameFileLocation.tsx', {
  '../lib/auth/client': dataModule('export async function accessToken() { return "fixture-token"; }'),
  '../lib/auth/config': dataModule('export const GATEWAY_BASE = "https://gateway.test";'),
  '../i18n/ui/useUI': dataModule('export const useUI = () => value => value;'),
}));
const TASK = '11111111-1111-4111-8111-111111111111';
const ART = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REV = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

async function domTest(run) {
  const dom = new JSDOM('<div id="root"></div>');
  const saved = Object.fromEntries(['window', 'document', 'fetch', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.getElementById('root'));
  try { await run(root, document); }
  finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
}

test('a location imports only on click, then opens the confirmed Library revision', () => domTest(async (root, doc) => {
  const requests = [], opened = [];
  globalThis.fetch = async (url, options) => { requests.push({ url, options }); return new Response(JSON.stringify({ artifact_id: ART, revision_id: REV, title: 'report.pdf', media_type: 'application/pdf' }), { status: 200 }); };
  await act(async () => root.render(React.createElement(FrameFileLocation, { location: { taskId: TASK, __oceanleoFrameRow: 42, path: '/tmp/report.pdf', line: 3 }, onOpenAttachment: attachment => opened.push(attachment) })));
  assert.equal(requests.length, 0);
  assert.equal(doc.querySelector('button').textContent, '/tmp/report.pdf:3');
  await act(async () => doc.querySelector('button').click());
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `https://gateway.test/v1/tasks/${TASK}/frames/42/file-preview`);
  assert.deepEqual(JSON.parse(requests[0].options.body), { path: '/tmp/report.pdf' });
  assert.equal(requests[0].options.redirect, 'error');
  assert.equal(opened[0].artifact_id, ART);
  assert.equal(opened[0].revision_id, REV);
}));

test('import failure gives an explicit error and allows retry; unscoped paths stay text', () => domTest(async (root, doc) => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('', { status: 403 }); };
  const props = { location: { taskId: TASK, __oceanleoFrameRow: 5, path: '/tmp/a' }, onOpenAttachment: () => assert.fail('must not open') };
  await act(async () => root.render(React.createElement(FrameFileLocation, props)));
  await act(async () => doc.querySelector('button').click());
  assert.match(doc.querySelector('[role="alert"]').textContent, /无法读取文件/);
  assert.equal(doc.querySelector('button').disabled, false);
  await act(async () => doc.querySelector('button').click());
  assert.equal(calls, 2);
  await act(async () => root.render(React.createElement(FrameFileLocation, { ...props, location: { path: '/tmp/a' } })));
  assert.equal(doc.querySelector('button'), null);
}));
