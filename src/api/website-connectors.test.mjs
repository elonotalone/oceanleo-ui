import assert from 'node:assert/strict';
import test from 'node:test';
import { compileModule, dataModule } from '../../tests/helpers/module-bench.mjs';
// UC-NONE: all fetch calls are recording doubles, including sample creation.
const deps = {
  '../lib/auth/client': dataModule('export async function accessToken(){return "fixture-token";}'),
  '../lib/auth/config': dataModule('export function gatewayBase(){return "https://gateway.invalid";}'),
};
const runtime = await compileModule('src/api/website-runtime.ts', deps);
const { websiteConnectorsApi, WebsiteTierSampleError } = await import(await compileModule('src/api/website-connectors.ts', { ...deps, './website-runtime': runtime }));
const id = '11111111-1111-4111-8111-111111111111';
const sample = { project: { project_id: id }, tier_id: 'static' };

test('D11 connector reads and mutations retain not_ready status with real route methods and environments', async () => {
  const previous = fetch, calls = [];
  const response = {project_id:id,environment:'production',slots:[{slot:'scheduler',status:'not_ready',status_detail:'Scheduled execution is not enabled'}]};
  globalThis.fetch = async (url, init) => {calls.push({url,method:init.method??'GET',body:init.body?JSON.parse(init.body):null});return Response.json(response);};
  try {
    assert.deepEqual(await websiteConnectorsApi.get(id,'production'),response);
    assert.deepEqual(await websiteConnectorsApi.select(id,'hosting','ours_fc','production'),response);
    assert.deepEqual(await websiteConnectorsApi.preset(id,'request_billed','production'),response);
    assert.deepEqual(calls,[
      {url:`https://gateway.invalid/v1/website-projects/${id}/connectors?environment=production`,method:'GET',body:null},
      {url:`https://gateway.invalid/v1/website-projects/${id}/connectors/hosting?environment=production`,method:'PUT',body:{connector_id:'ours_fc'}},
      {url:`https://gateway.invalid/v1/website-projects/${id}/connectors/preset?environment=production`,method:'POST',body:{preset_id:'request_billed'}},
    ]);
  } finally {globalThis.fetch=previous;}
});

test('tier catalog uses owner project context and sample creation uses the fixed local route', async () => {
  const previous = fetch, calls = [], controller = new AbortController();
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return Response.json(url.includes('presets/tiers') ? { presets: [{ id: 'request_billed', label: 'FC', selections: {}, available: false, status: 'not_ready', status_detail: 'FC disabled' }] } : sample); };
  try {
    assert.equal((await websiteConnectorsApi.tiers('owner/project', controller.signal))[0].status, 'not_ready');
    assert.deepEqual(await websiteConnectorsApi.createSample('own_accounts', 'zh', controller.signal), sample);
    assert.equal(calls[0].url, 'https://gateway.invalid/v1/website-projects/presets/tiers?project_id=owner%2Fproject');
    assert.equal(calls[1].url, 'https://gateway.invalid/v1/website-projects/from-tier/own_accounts');
    assert.deepEqual(JSON.parse(calls[1].init.body), { locale: 'zh' });
    assert.equal(calls[1].init.method, 'POST');
    for (const { init } of calls) { assert.equal(init.headers.Authorization, 'Bearer fixture-token'); assert.equal(init.signal, controller.signal); assert.equal(init.credentials, 'include'); assert.equal(init.cache, 'no-store'); }
  } finally { globalThis.fetch = previous; }
});

test('sample partial success preserves only a validated receipt, never provider details', async () => {
  const previous = fetch;
  globalThis.fetch = async () => Response.json({ detail: { code: 'tier_sample_setup_unconfirmed', project_id: id, message: 'secret-provider-body' } }, { status: 503 });
  try { await assert.rejects(websiteConnectorsApi.createSample('server', 'en'), error => error instanceof WebsiteTierSampleError && error.project_id === id && !String(error).includes('secret')); }
  finally { globalThis.fetch = previous; }
});

test('missing tier routes and malformed creation/catalog responses fail honestly', async () => {
  const previous = fetch;
  try {
    globalThis.fetch = async () => Response.json({}, { status: 404 });
    await assert.rejects(websiteConnectorsApi.tiers(id), error => error.status === 404);
    await assert.rejects(websiteConnectorsApi.createSample('static', 'en'), error => error.status === 404);
    globalThis.fetch = async () => Response.json({});
    await assert.rejects(websiteConnectorsApi.tiers(id), error => error.status === 502);
    await assert.rejects(websiteConnectorsApi.createSample('static', 'en'), error => error.status === 502);
    for (const presets of [[null], [{ id: 'static', label: 'Static', selections: {}, audience: [] }], [{ id: 'static', label: 'Static', selections: {}, sample: {} }]]) {
      globalThis.fetch = async () => Response.json({ presets });
      await assert.rejects(websiteConnectorsApi.tiers(id), error => error.status === 502);
    }
  } finally { globalThis.fetch = previous; }
});
