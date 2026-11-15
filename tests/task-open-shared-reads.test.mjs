import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { compileModule, dataModule } from './helpers/module-bench.mjs';

const realAuth = await compileModule('src/lib/auth/client.ts');
const auth = dataModule(`export * from ${JSON.stringify(realAuth)}; export async function accessToken(){return 'test-read-owner';} export function cachedAccessToken(){return 'test-read-owner';}`);
const realConfig = await compileModule('src/lib/auth/config.ts');
const config = dataModule(`export * from ${JSON.stringify(realConfig)}; export const GATEWAY_BASE='https://shared-read.test'; export function gatewayBase(){return GATEWAY_BASE;}`);
const shared = dataModule(`export { sharedGatewayFetch } from ${JSON.stringify(pathToFileURL(resolve('src/lib/shared-get.ts')).href)};`);
const standard = { './auth/client': auth, './auth/config': config, './shared-get': shared };
const agent = await import(await compileModule('src/lib/agent.ts', standard));
const sessions = await import(await compileModule('src/lib/app-session.ts', { './agent': dataModule(`export * from ${JSON.stringify(await compileModule('src/lib/agent.ts', standard))};`) }));
const browser = await import(await compileModule('src/lib/browser.ts', { ...standard, './agent': dataModule(`export * from ${JSON.stringify(await compileModule('src/lib/agent.ts', standard))};`) }));
const computers = await import(await compileModule('src/lib/cloud-computer-api.ts', standard));
const account = await import(await compileModule('src/lib/auth/account.ts', { './client': auth, './config': config, '../shared-get': shared }));
const library = await import(await compileModule('src/shell/artifact-client.ts', { '../lib/auth/client': auth, '../lib/auth/config': config, '../lib/shared-get': shared }));

// Replay the duplicate counts measured on one task open, through the actual
// public helpers used by the page, sidebar, browser, wallet and Library.
test('the measured task-open GET fan-out shares each identical URL while all callers retain their results', async (t) => {
  const held = [];
  t.mock.method(globalThis, 'fetch', (url, init) => new Promise((resolve) => held.push({ url: String(url), init, resolve })));
  const pending = [
    ...Array.from({ length: 10 }, () => agent.authed('/v1/agent/tasks/t1')),
    ...Array.from({ length: 10 }, () => sessions.listAppSessions()),
    ...Array.from({ length: 8 }, () => browser.listCloudBrowsers()),
    ...Array.from({ length: 4 }, () => computers.listComputers()),
    ...Array.from({ length: 3 }, () => account.getCredits()),
    ...Array.from({ length: 3 }, () => library.listMyArtifacts()),
  ];
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(held.length, 6, '38 callers produce one request for each of six distinct URLs');
  assert.equal(new Set(held.map((call) => call.url)).size, 6);
  for (const call of held) {
    const body = call.url.includes('/credits') ? { balance: 0, currency: 'USD' }
      : call.url.includes('/agent/tasks/') ? { task: { id: 't1' }, messages: [], artifacts: [] }
        : call.url.includes('/library/mine') ? { items: [], total: 0, ownerPrincipalId: 'test-owner', scope: 'mine' }
          : { items: [], total: 0 };
    call.resolve(new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }));
  }
  const results = await Promise.all(pending);
  assert.equal(results.length, 38);
  const failures = results.flatMap((result, index) => (index >= 28 && index < 32 ? Array.isArray(result.items) : result.ok === true) ? [] : [{ index, result }]);
  assert.deepEqual(failures, []);
});

test('task and session list clients preserve ETag and send conditional headers through the real transport', async (t) => {
  const { createConditionalHistoryListReader } = await import('../src/lib/history-list-api.ts');
  const reader = createConditionalHistoryListReader();
  const calls = [];
  let withEtag = true;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const conditional = new Headers(init.headers).get('If-None-Match');
    calls.push({ url: String(url), conditional });
    if (withEtag && conditional) return new Response(null, { status: 304, headers: { ETag: '"rows-v1"' } });
    return new Response(JSON.stringify({ items: [{ id: 'task-or-session' }] }), {
      headers: { 'content-type': 'application/json', ...(withEtag ? { ETag: '"rows-v1"' } : {}) },
    });
  });
  for (const [key, read] of [
    ['tasks', (signal, headers) => agent.listTasks(100, undefined, false, 'all', 'all', { signal, headers })],
    ['sessions', (signal, headers) => sessions.listAppSessions({ surface: 'all', signal, headers })],
  ]) {
    const first = await reader.read(key, read);
    const second = await reader.read(key, read);
    assert.deepEqual(second.data, first.data);
    assert.equal(first.etag, '"rows-v1"');
  }
  assert.deepEqual(calls.map(call => call.conditional), [null, '"rows-v1"', null, '"rows-v1"']);
  withEtag = false;
  await reader.read('tasks', (signal, headers) => agent.listTasks(100, undefined, false, 'all', 'all', { signal, headers }));
  await reader.read('tasks', (signal, headers) => agent.listTasks(100, undefined, false, 'all', 'all', { signal, headers }));
  assert.equal(calls.at(-1).conditional, null, 'a gateway without ETag continues to return ordinary lists');
});
