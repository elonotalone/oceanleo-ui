import assert from 'node:assert/strict';
import test from 'node:test';
import { compileModule, dataModule } from '../../tests/helpers/module-bench.mjs';
// UC-NONE: authenticated gateway clients only; fake responses never authorize resources.
const auth = dataModule('export async function accessToken(){return "fixture-token";}');
const config = dataModule('export function gatewayBase(){return "https://gateway.invalid";}');
const { workUsageApi, WorkUsageError } = await import(await compileModule('src/api/work-usage.ts', {
  '../lib/auth/client': auth, '../lib/auth/config': config,
}));
const money = (amount_minor = 123) => ({ amount_minor, currency: 'USD' });
const limit = { monthly_limit: money(1000), used: money(), reached: false, on_reach: 'notify' };
const usage = { total: money(), lines: ['metered', 'lower_bound', 'not_attributed'].map(basis => ({ kind: 'fc_requests', quantity: 2, unit: 'request', amount: money(basis === 'not_attributed' ? 0 : 123), basis })) };
function mockFetch(fn) { const previous = globalThis.fetch; globalThis.fetch = fn; return () => { globalThis.fetch = previous; }; }

test('usage and limit calls preserve gateway paths, exact money, auth and cancellation', async () => {
  const calls = [], controller = new AbortController();
  const restore = mockFetch(async (url, init) => { calls.push({ url, init }); return Response.json(url.includes('/usage?') ? usage : limit); });
  try {
    assert.deepEqual(await workUsageApi.get('work/a?', 'month', controller.signal), usage);
    assert.deepEqual(await workUsageApi.limit('work/a?', controller.signal), limit);
    assert.deepEqual(await workUsageApi.setLimit('work/a?', { monthly_limit: null, on_reach: 'stop' }, controller.signal), limit);
    assert.deepEqual(calls.map(call => call.url), [
      'https://gateway.invalid/v1/works/work%2Fa%3F/usage?range=month',
      'https://gateway.invalid/v1/works/work%2Fa%3F/usage-limit',
      'https://gateway.invalid/v1/works/work%2Fa%3F/usage-limit',
    ]);
    for (const { init } of calls) { assert.equal(init.headers.Authorization, 'Bearer fixture-token'); assert.equal(init.credentials, 'include'); assert.equal(init.cache, 'no-store'); assert.equal(init.signal, controller.signal); }
    assert.equal(calls[2].init.method, 'PUT');
    assert.deepEqual(JSON.parse(calls[2].init.body), { monthly_limit: null, on_reach: 'stop' });
  } finally { restore(); }
});

test('missing routes and storage failures remain distinct and never retain server text', async () => {
  const restore = mockFetch(async () => Response.json({ detail: 'secret-provider-body' }, { status: globalThis.__ucStatus }));
  try { for (const status of [401, 403, 404, 501, 503]) {
    globalThis.__ucStatus = status;
    await assert.rejects(workUsageApi.get('w'), error => error instanceof WorkUsageError && error.status === status && !String(error).includes('secret'));
  } } finally { restore(); delete globalThis.__ucStatus; }
});

test('malformed money, mixed currency, invalid basis and invalid limits cannot become success', async () => {
  let body;
  const restore = mockFetch(async () => Response.json(body));
  try {
    for (const bad of [null, {}, { ...usage, total: money(-1) }, { ...usage, total: money(1.2) },
      { ...usage, lines: [{ ...usage.lines[0], quantity: -1 }] }, { ...usage, lines: [{ ...usage.lines[0], basis: 'estimated' }] },
      { ...usage, lines: [{ ...usage.lines[0], amount: { amount_minor: 1, currency: 'CNY' } }] }]) {
      body = bad; await assert.rejects(workUsageApi.get('w'), error => error.status === 502);
    }
    for (const bad of [{ ...limit, monthly_limit: undefined }, { ...limit, reached: 'yes' }, { ...limit, on_reach: 'delete' },
      { ...limit, monthly_limit: { amount_minor: 100, currency: 'CNY' } }]) {
      body = bad; await assert.rejects(workUsageApi.limit('w'), error => error.status === 502);
    }
  } finally { restore(); }
});

test('missing metering storage retains only its closed prerequisite code', async () => {
  const restore = mockFetch(async () => Response.json({ detail: { code: 'metering_unavailable', reason: 'usage_storage_unavailable', provider: 'secret' } }, { status: 503 }));
  try { await assert.rejects(workUsageApi.limit('w'), error => error.status === 503 && error.code === 'metering_unavailable' && !String(error).includes('secret')); }
  finally { restore(); }
});
