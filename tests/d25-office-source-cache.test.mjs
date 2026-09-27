import assert from 'node:assert/strict';
import test from 'node:test';
import { zipSync, strToU8 } from 'fflate';
import {
  loadOfficeSource, prefetchOfficeSource, peekOfficeSource,
  resetOfficeSourceCacheForTests, configureOfficeSourceCacheForTests, officeSourceCacheStats,
} from '../src/shell/office-editor/office-source-cache.ts';
import { fetchValidatedOfficePackage, fetchValidatedSpreadsheetSource } from '../src/shell/doc-editors/office-file.ts';

const mime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const zip = zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'ppt/presentation.xml': strToU8('<presentation/>') });
function item(url = 'https://assets.oceanleo.app/a.pptx', revisionId = 'r1', purpose = 'full') {
  return { id: 'a', artifactId: 'a', revisionId, title: 'a.pptx', kind: 'ppt', meta: {}, url,
    artifact: { artifactId: 'a', revisionId, sourceFormat: 'pptx', renditions: {
      [purpose]: { url, revisionId, purpose, mediaType: mime },
    } } };
}
function install(t, handler = () => new Response(zip, { headers: { 'content-type': mime } })) {
  resetOfficeSourceCacheForTests(); let count = 0;
  const previous = globalThis.fetch;
  globalThis.fetch = async (...args) => { count++; return handler(...args); };
  t.after(() => { globalThis.fetch = previous; resetOfficeSourceCacheForTests(); });
  return () => count;
}

test('prefetch + preview + editor share one download, including concurrent mount and new signed URL', async t => {
  const count = install(t); const a = item(); const b = item('https://assets.oceanleo.app/resigned.pptx');
  const results = await Promise.all([
    prefetchOfficeSource(a), fetchValidatedOfficePackage(a.url, 'pptx', { item: a }),
    loadOfficeSource(a.url, a.revisionId, a), prefetchOfficeSource(b),
  ]);
  assert.equal(count(), 1);
  assert.deepEqual(new Uint8Array(results[1].arrayBuffer), zip);
  await prefetchOfficeSource(item(b.url, 'r2')); assert.equal(count(), 2);
  await prefetchOfficeSource(item(b.url, 'r2', 'source')); assert.equal(count(), 3);
});

test('unknown artifact/revision/purpose falls back to URL and never aliases a different original', async t => {
  const count = install(t);
  await prefetchOfficeSource(item());
  const unknown = { ...item(), artifact: undefined, artifactId: undefined, revisionId: undefined };
  await prefetchOfficeSource(unknown);
  await prefetchOfficeSource({ ...unknown, url: 'https://assets.oceanleo.app/other.pptx' });
  assert.equal(count(), 3);
});

test('each load and peek owns bytes, mutation and transfer cannot corrupt cached bytes', async t => {
  const count = install(t), a = item();
  const [first, concurrent] = await Promise.all([prefetchOfficeSource(a), prefetchOfficeSource(a)]);
  new Uint8Array(first.bytes).fill(0);
  assert.deepEqual(new Uint8Array(concurrent.bytes), zip);
  structuredClone(concurrent.bytes, { transfer: [concurrent.bytes] });
  const peek = peekOfficeSource(a.url, a.revisionId); assert.ok(peek);
  new Uint8Array(peek.bytes).fill(0);
  const next = await prefetchOfficeSource(a);
  assert.deepEqual(new Uint8Array(next.bytes), zip); assert.equal(count(), 1);
});

test('unmount only cancels its consumer, keeping the shared download alive', async t => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const count = install(t, async (_url, options) => { await gate; assert.equal(options?.signal?.aborted, undefined); return new Response(zip); });
  const a = item(), controller = new AbortController();
  const cancelled = fetchValidatedOfficePackage(a.url, 'pptx', { item: a, signal: controller.signal });
  const survivor = fetchValidatedOfficePackage(a.url, 'pptx', { item: a });
  controller.abort(); release();
  await assert.rejects(cancelled, { name: 'AbortError' });
  assert.deepEqual(new Uint8Array((await survivor).arrayBuffer), zip); assert.equal(count(), 1);
});

for (const status of [401, 403]) test(`${status} notifies each live consumer; failed bytes are not cached and a new URL succeeds`, async t => {
  const count = install(t, url => new Response(String(url).includes('fresh') ? zip : '', { status: String(url).includes('fresh') ? 200 : status }));
  const a = item(), denied = [0, 0];
  const results = await Promise.allSettled(denied.map((_, i) => fetchValidatedOfficePackage(a.url, 'pptx', { item: a, onAccessDenied: () => denied[i]++ })));
  assert.ok(results.every(r => r.status === 'rejected' && r.reason.code === 'signed-url-expired'));
  assert.deepEqual(denied, [1, 1]); assert.equal(count(), 1); assert.equal(officeSourceCacheStats().size, 0);
  await prefetchOfficeSource(item('https://assets.oceanleo.app/fresh.pptx')); assert.equal(count(), 2);
});

test('validation failures are not cached', async t => {
  const count = install(t, () => new Response('bad package', { headers: { 'content-type': 'application/octet-stream' } }));
  await assert.rejects(prefetchOfficeSource(item()), /魔数/);
  await assert.rejects(prefetchOfficeSource(item()), /魔数/);
  assert.equal(count(), 2); assert.equal(officeSourceCacheStats().size, 0);
});

test('64 MB single-file limit retains the original error, including warm-cache smaller consumer limits', async t => {
  const count = install(t, () => new Response(zip, { headers: { 'content-length': String(64 * 1024 * 1024 + 1) } }));
  await assert.rejects(prefetchOfficeSource(item()), /素材过大，无法在浏览器内存中安全处理/);
  assert.equal(officeSourceCacheStats().size, 0); assert.equal(count(), 1);
  configureOfficeSourceCacheForTests({ fetchBytes: async () => new ArrayBuffer(64 * 1024 * 1024 + 1), parse: () => null });
  await assert.rejects(prefetchOfficeSource(item()), /素材过大，无法在浏览器内存中安全处理/);
});

test('cache holds at most four entries and 64 MB total', async () => {
  resetOfficeSourceCacheForTests();
  configureOfficeSourceCacheForTests({ fetchBytes: async () => new ArrayBuffer(1), parse: () => null });
  for (let i = 0; i < 5; i++) await loadOfficeSource(`https://assets.oceanleo.app/${i}.pptx`, 'r');
  assert.equal(officeSourceCacheStats().size, 4);
  resetOfficeSourceCacheForTests();
  configureOfficeSourceCacheForTests({ fetchBytes: async () => new ArrayBuffer(33 * 1024 * 1024), parse: () => null });
  await loadOfficeSource('https://assets.oceanleo.app/a.pptx', 'r');
  await loadOfficeSource('https://assets.oceanleo.app/b.pptx', 'r');
  assert.equal(officeSourceCacheStats().size, 1); assert.equal(officeSourceCacheStats().bytes, 33 * 1024 * 1024);
  resetOfficeSourceCacheForTests();
});

for (const [kind, kindName, mainPart, mediaType] of [
  ['docx', 'document', 'word/document.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['xlsx', 'sheet', 'xl/workbook.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
]) test(`${kind} preview and prefetch use the same bytes`, async t => {
  const data = zipSync({ '[Content_Types].xml': strToU8('<Types/>'), [mainPart]: strToU8('<root/>') });
  const count = install(t, () => new Response(data, { headers: { 'content-type': mediaType } }));
  const a = item(`https://assets.oceanleo.app/file.${kind}`); a.kind = kindName; a.title = `file.${kind}`;
  a.artifact.sourceFormat = kind; a.artifact.renditions.full.mediaType = mediaType;
  await prefetchOfficeSource(a);
  const bytes = kind === 'xlsx' ? await fetchValidatedSpreadsheetSource(a.url, a) : (await fetchValidatedOfficePackage(a.url, kind, { item: a })).arrayBuffer;
  assert.deepEqual(new Uint8Array(bytes), data); assert.equal(count(), 1);
});

test('a parser may mutate and transfer its input without corrupting later consumers', async () => {
  resetOfficeSourceCacheForTests();
  configureOfficeSourceCacheForTests({ fetchBytes: async () => zip.slice().buffer, parse: bytes => {
    new Uint8Array(bytes).fill(0); structuredClone(bytes, { transfer: [bytes] }); return { parsed: true };
  } });
  const a = item();
  await prefetchOfficeSource(a);
  assert.deepEqual(new Uint8Array((await prefetchOfficeSource(a)).bytes), zip);
  assert.equal(officeSourceCacheStats().fetches, 1); resetOfficeSourceCacheForTests();
});

test('a warm cache still enforces each consumer size limit', async t => {
  const count = install(t), a = item(); await prefetchOfficeSource(a);
  await assert.rejects(fetchValidatedOfficePackage(a.url, 'pptx', { item: a, maxBytes: 100 }), /素材过大，无法在浏览器内存中安全处理/);
  assert.deepEqual(new Uint8Array((await prefetchOfficeSource(a)).bytes), zip); assert.equal(count(), 1);
});

test('an unmounted consumer does not receive the surviving consumer access-denied callback', async t => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const count = install(t, async () => { await gate; return new Response('', { status: 403 }); });
  const a = item(), controller = new AbortController(), callbacks = [0, 0];
  const first = fetchValidatedOfficePackage(a.url, 'pptx', { item: a, signal: controller.signal, onAccessDenied: () => callbacks[0]++ });
  const second = fetchValidatedOfficePackage(a.url, 'pptx', { item: a, onAccessDenied: () => callbacks[1]++ });
  controller.abort(); release();
  const settled = await Promise.allSettled([first, second]);
  assert.equal(settled[0].reason.name, 'AbortError'); assert.equal(settled[1].reason.code, 'signed-url-expired');
  assert.deepEqual(callbacks, [0, 1]); assert.equal(count(), 1);
});
