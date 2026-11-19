import assert from 'node:assert/strict';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {EDITOR_GATEWAY_ROUTES} from './gateway-routes.ts';
import {scanEditorGatewayRequests} from './scan-editor-requests.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const matches = (request, routes = EDITOR_GATEWAY_ROUTES) => routes.some(route => {
  if (route.method !== request.method) return false;
  const observed = new RegExp('^' + request.path.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$');
  const example = route.path.replace(/\{purpose\}/g, 'source').replace(/\{digest\}/g, 'a'.repeat(64)).replace(/\{[^}]+\}/g, 'example');
  return observed.test(example);
});

test('editor helpers, dynamic editor imports and shared providers only use declared gateway routes', () => {
  const {requests, files} = scanEditorGatewayRequests(root, {fixture: [
    'const ignored = "/v1/not-a-request";',
    '// fetch("/v1/comment-is-not-a-request")',
    'const OFFICE_PATH = "/v1/fixture-convert";',
    'function unusualHelper(path: string) {return fetch(path, {method:"POST"});}',
    'function contractFixture() {',
    '  unusualHelper(OFFICE_PATH);',
    '  globalThis.fetch(`https://gateway.example/v1/fixture-items/${encodeURIComponent("id")}`, {method:"PUT"});',
    '}',
  ].join('\n')});
  assert.ok(files.length > 30, 'follow editor route components into their helpers');
  assert.ok(files.some(f => /GridUniverStage/.test(f)), 'follow dynamic grid imports');
  assert.ok(requests.some(r => r.path === '/v1/editor-working-copies/*/published' && r.method === 'POST'), 'follow the working-copy request helper');
  const fixtureRequests = requests.filter(r => r.file.endsWith('__scan_fixture__.tsx'));
  assert.ok(fixtureRequests.some(r => r.path === '/v1/fixture-convert' && r.method === 'POST'), 'an arbitrarily named request helper is checked');
  assert.ok(fixtureRequests.some(r => r.path === '/v1/fixture-items/id' && r.method === 'PUT'), 'template URLs and qualified fetch calls are checked');
  assert.ok(fixtureRequests.every(r => !matches(r)), 'adding an undeclared path must fail');
  assert.ok(!requests.some(r => /not-a-request/.test(r.path)), 'comments and ordinary strings are not requests');
  const actual = requests.filter(r => !r.file.endsWith('__scan_fixture__.tsx'));
  assert.ok(actual.length > 30);
  for (const [method, path, observed, retry] of [
    ['GET', '/v1/website-projects/presets/tiers', '/v1/website-projects/presets/tiers', 'safe'],
    ['POST', '/v1/website-projects/from-tier/{tier_id}', '/v1/website-projects/from-tier/*', 'never-blind'],
  ]) {
    assert.ok(actual.some(r => r.method === method && r.path === observed), `scan the concrete tier request: ${method} ${observed}`);
    const route = EDITOR_GATEWAY_ROUTES.find(r => r.method === method && r.path === path);
    assert.ok(route, `register the exact tier route: ${method} ${path}`);
    assert.equal(route.offline, 'online-only');
    assert.equal(route.retry, retry);
    assert.equal(EDITOR_GATEWAY_ROUTES.some(r => r.path === path && r.method !== method), false, 'tier routes grant only their declared verb');
  }
  const missing = actual.filter(r => !matches(r));
  assert.equal(missing.length, 0, `Unlisted editor requests (${missing.length}):\n${missing.slice(0, 65).map(r => `${r.method} ${r.path} (${r.file}:${r.line})`).join('\n')}`);
  // Removing an actual route from the contract must turn coverage red.
  assert.ok(actual.some(r => r.path === '/v1/convert/office' && r.method === 'POST'));
  const withoutOffice = EDITOR_GATEWAY_ROUTES.filter(r => r.path !== '/v1/convert/office');
  assert.ok(actual.some(r => !matches(r, withoutOffice)), 'removing a required route makes coverage fail');
});
