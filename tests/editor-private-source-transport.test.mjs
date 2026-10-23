import assert from 'node:assert/strict';
import test from 'node:test';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
const source = await import(await compileModule('src/shell/advanced-private-source.ts', {
  '../lib/auth/client': dataModule('export async function accessToken(){return "test-token";}'),
  '../lib/auth/config': dataModule('export const GATEWAY_BASE="https://api.dev.oceanleo.com";'),
}));
const digest = 'a'.repeat(64);
const url = `https://api.dev.oceanleo.com/v1/editor-sources/${digest}`;

test('private audio uploads create owner-private source locators and authenticate only the exact source route', async () => {
  const previous = globalThis.fetch;
  const file = new File(['ID3audio'], 'sample.mp3', { type: 'audio/mpeg' });
  const calls = [];
  globalThis.fetch = async (target, init) => {
    calls.push({ target, init });
    return Response.json({ file: { digest, bytes: file.size, mime: 'audio/mpeg', key: 'u/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/editor-sources/audio' } });
  };
  try {
    const result = await source.uploadPrivateEditorSource(file);
    assert.equal(result.ok, true);
    assert.equal(source.isPrivateEditorSourceUrl(result.data.file.url), true);
    assert.equal(calls[0].target, 'https://api.dev.oceanleo.com/v1/editor-sources');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer test-token');
    await source.readPrivateEditorSource(result.data.file.url);
    assert.equal(calls[1].init.headers.Authorization, 'Bearer test-token');
    for (const target of [url.replace('api.dev.oceanleo.com', 'evil.example'), url.replace('/editor-sources/', '/uploads/'), url.replace('https://', 'https://user:password@')]) {
      assert.equal(source.isPrivateEditorSourceUrl(target), false);
      await source.readPrivateEditorSource(target);
      assert.equal(calls.at(-1).init.headers?.Authorization, undefined);
    }
  } finally { globalThis.fetch = previous; }
});
