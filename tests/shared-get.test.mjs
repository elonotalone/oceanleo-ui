import assert from 'node:assert/strict';
import test from 'node:test';
import { sharedGatewayFetch } from '../src/lib/shared-get.ts';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise((resolve) => setImmediate(resolve));
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const auth = { headers: { Authorization: 'Bearer test-user-a' }, credentials: 'include', cache: 'no-store' };

function network(t) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', (url, init) => {
    const held = deferred(); calls.push({ url, init, ...held }); return held.promise;
  });
  return calls;
}

test('identical concurrent GETs share one network call and independently readable bodies; a settled read is fresh', async (t) => {
  const calls = network(t);
  const pending = Array.from({ length: 40 }, () => sharedGatewayFetch('https://gw.test/tasks', auth));
  await tick(); assert.equal(calls.length, 1);
  calls[0].resolve(json({ rows: [1, 2] }));
  const responses = await Promise.all(pending);
  assert.equal(new Set(responses).size, 40);
  assert.deepEqual(await Promise.all(responses.map((response) => response.json())), Array(40).fill({ rows: [1, 2] }));
  const fresh = sharedGatewayFetch('https://gw.test/tasks', auth); await tick(); assert.equal(calls.length, 2);
  calls[1].resolve(json({ rows: [3] })); assert.deepEqual(await (await fresh).json(), { rows: [3] });
});

test('authorization, query, origin, credentials, and headers partition reads', async (t) => {
  const calls = network(t);
  const reads = [
    sharedGatewayFetch('https://gw.test/tasks', auth),
    sharedGatewayFetch('https://gw.test/tasks', { ...auth, headers: { Authorization: 'Bearer test-user-b' } }),
    sharedGatewayFetch('https://gw.test/tasks?q=1', auth),
    sharedGatewayFetch('https://other.test/tasks', auth),
    sharedGatewayFetch('https://gw.test/tasks', { ...auth, credentials: 'omit' }),
    sharedGatewayFetch('https://gw.test/tasks', { ...auth, headers: { ...auth.headers, Accept: 'application/json' } }),
  ];
  await tick(); assert.equal(calls.length, 6);
  calls.forEach((call) => call.resolve(json({ ok: true }))); await Promise.all(reads);
});

test('POSTs and other mutations are never shared', async (t) => {
  const calls = network(t);
  const reads = ['POST', 'POST', 'DELETE', 'DELETE'].map((method) => sharedGatewayFetch('https://gw.test/send', { ...auth, method }));
  assert.equal(calls.length, 4); calls.forEach((call) => call.resolve(json({ ok: true })));
  await Promise.all(reads);
});

for (const failure of ['network', 'http']) test(`${failure} failure is shared only while in flight and does not poison retry`, async (t) => {
  const calls = network(t);
  const pending = [sharedGatewayFetch('https://gw.test/fail', auth), sharedGatewayFetch('https://gw.test/fail', auth)];
  const all = Promise.allSettled(pending); await tick(); assert.equal(calls.length, 1);
  if (failure === 'network') calls[0].reject(new Error('offline')); else calls[0].resolve(json({ error: 'retry' }, 503));
  const results = await all;
  if (failure === 'network') assert.ok(results.every((result) => result.status === 'rejected'));
  else assert.ok(results.every((result) => result.value.status === 503));
  const fresh = sharedGatewayFetch('https://gw.test/fail', auth); await tick(); assert.equal(calls.length, 2);
  calls[1].resolve(json({ ok: true })); assert.equal((await fresh).status, 200);
});

test('one aborted reader does not cancel another reader of the same GET', async (t) => {
  const calls = network(t); const first = new AbortController(); const second = new AbortController();
  const abandoned = sharedGatewayFetch('https://gw.test/cancel', { ...auth, signal: first.signal });
  const kept = sharedGatewayFetch('https://gw.test/cancel', { ...auth, signal: second.signal });
  const rejected = assert.rejects(abandoned, { name: 'AbortError' });
  await tick(); first.abort(); await rejected;
  assert.equal(calls[0].init.signal.aborted, false);
  calls[0].resolve(json({ kept: true })); assert.deepEqual(await (await kept).json(), { kept: true });
});

test('last reader aborts the underlying GET and a subsequent reader starts afresh', async (t) => {
  const calls = network(t); const controller = new AbortController();
  const abandoned = sharedGatewayFetch('https://gw.test/all-cancel', { ...auth, signal: controller.signal });
  const rejected = assert.rejects(abandoned, { name: 'AbortError' });
  await tick(); controller.abort(); await rejected;
  assert.equal(calls[0].init.signal.aborted, true);
  const fresh = sharedGatewayFetch('https://gw.test/all-cancel', auth); await tick(); assert.equal(calls.length, 2);
  calls[0].reject(new Error('aborted')); calls[1].resolve(json({ fresh: true }));
  assert.deepEqual(await (await fresh).json(), { fresh: true });
});

test('an already aborted caller never starts a GET', async (t) => {
  const calls = network(t); const controller = new AbortController(); controller.abort();
  await assert.rejects(sharedGatewayFetch('https://gw.test/pre-cancel', { ...auth, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls.length, 0);
});

test('read stays shared while its JSON body downloads after headers', async (t) => {
  const calls = network(t); let stream;
  const body = new ReadableStream({ start(controller) { stream = controller; } });
  const first = sharedGatewayFetch('https://gw.test/body', auth); await tick();
  calls[0].resolve(new Response(body, { headers: { 'content-type': 'application/json' } })); await tick();
  const second = sharedGatewayFetch('https://gw.test/body', auth); await tick(); assert.equal(calls.length, 1);
  stream.enqueue(new TextEncoder().encode('{"body":true}')); stream.close();
  assert.deepEqual(await Promise.all([first, second].map(async (read) => (await read).json())), [{ body: true }, { body: true }]);
});

test('an old hung read cannot block a retry or delete the newer in-flight read', async (t) => {
  const calls = network(t); let now = 100;
  t.mock.method(Date, 'now', () => now);
  const old = sharedGatewayFetch('https://gw.test/hung', auth); await tick();
  now += 10_001;
  const fresh = sharedGatewayFetch('https://gw.test/hung', auth); await tick(); assert.equal(calls.length, 2);
  calls[0].resolve(json({ old: true })); await old;
  const joined = sharedGatewayFetch('https://gw.test/hung', auth); await tick(); assert.equal(calls.length, 2);
  calls[1].resolve(json({ new: true })); await Promise.all([fresh, joined]);
});
