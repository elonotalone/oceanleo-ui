import assert from 'node:assert/strict';
import test from 'node:test';
import { compileModule, dataModule } from './helpers/module-bench.mjs';

const transport = await import(await compileModule('src/shell/advanced-draft-transport.ts', {
  '../lib/auth/client': dataModule('export async function accessToken(){ return globalThis.__draftToken; }'),
  '../lib/auth/config': dataModule('export const GATEWAY_BASE="https://api.dev.oceanleo.com";'),
}));
const digest = 'a'.repeat(64);
const key = 'u/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/editor-drafts/working.json';

test('working draft upload uses private route and returns a non-expiring authenticated locator', async () => {
  globalThis.__draftToken = 'test-token';
  const previous = globalThis.fetch;
  const file = new File(['{"version":1,"data":{}}'], 'draft.json');
  let request;
  globalThis.fetch = async (url, init) => { request = { url, init }; return Response.json({ file: { key, digest, bytes: file.size } }); };
  try {
    const result = await transport.uploadPrivateWorkingDraft(file);
    assert.equal(result.ok, true);
    assert.equal(request.url, 'https://api.dev.oceanleo.com/v1/editor-drafts');
    assert.equal(request.init.headers.Authorization, 'Bearer test-token');
    assert.equal(request.init.credentials, 'omit');
    const locator = new URL(result.data.file.url);
    assert.equal(locator.searchParams.get('key'), key);
    assert.equal(locator.searchParams.get('size'), String(file.size));
    assert.equal(locator.searchParams.has('token'), false);
  } finally { globalThis.fetch = previous; }
});

test('draft read sends the token only to the exact gateway draft route', async () => {
  const previous = globalThis.fetch;
  globalThis.__draftToken = 'test-token';
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return Response.json({}); };
  try {
    await transport.readPrivateWorkingDraft(`https://api.dev.oceanleo.com/v1/editor-drafts/${digest}`, { headers: { Accept: 'application/json' } });
    for (const url of [`https://evil.example/v1/editor-drafts/${digest}`, `https://api.dev.oceanleo.com/other/${digest}`]) {
      await transport.readPrivateWorkingDraft(url, { credentials: 'omit' });
    }
    assert.equal(calls[0].init.headers.Authorization, 'Bearer test-token');
    for (const call of calls.slice(1)) assert.equal(call.init.headers?.Authorization, undefined);
    globalThis.__draftToken = null;
    await assert.rejects(() => transport.readPrivateWorkingDraft(`https://api.dev.oceanleo.com/v1/editor-drafts/${digest}`, {}));
    assert.equal(calls.length, 3);
  } finally { globalThis.fetch = previous; }
});
