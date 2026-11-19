import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import './helpers/w1-jsdom-window.mjs';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
import { bayRecoverySources, forbiddenRecoveryControls } from './helpers/bay-recovery-scan.mjs';
import ts from 'typescript';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const ui = dataModule('export const useUI=()=>key=>key;');
const h = React.createElement;
async function mount(Component, props = {}) {
  const el = document.createElement('div'); document.body.append(el);
  const root = createRoot(el);
  const render = async props => { await act(async () => root.render(h(Component, props))); };
  await render(props);
  return { el, render, cleanup: async () => { await act(async () => root.unmount()); el.remove(); } };
}
const wake = async (name = 'online') => { await act(async () => window.dispatchEvent(new window.Event(name))); };
const tick = async (t, ms) => { await act(async () => t.mock.timers.tick(ms)); };
function active() {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
}
const preparationModule = dataModule('export const prepareArtifactForAction=(...args)=>globalThis.__f2Prepare(...args);');
await import(preparationModule);
const entryModule = await import(await compileModule('src/shell/result-canvas-entry-state.ts', {
  './asset-detail/resolve': dataModule('export const resolveAssetDetail=(...args)=>globalThis.__f2Resolve(...args);'),
  './artifact-client': preparationModule,
}));
const request = nonce => ({ nonce, mode: 'preview', ref: { kind: 'artifact', artifactId: nonce }, surface: 'task' });
const detail = id => ({ entry: { id, title: id }, actionContext: { rights: { canView: true, canEdit: false } } });
let latest;
function EntryProbe({ request, opened }) {
  latest = entryModule.useWorkspaceEntryRequest(request, opened);
  return h('div', { 'data-status': latest.status || '' }, latest.status === 'error' ? latest.reason : '');
}

test('entry stays loading and backs off while offline/hidden, then opens on restored connectivity', async t => {
  active(); t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0, available = false; const opened = [];
  globalThis.__f2Resolve = async () => { calls++; if (!available) throw new TypeError('transport'); return detail('real-file'); };
  const view = await mount(EntryProbe, { request: request('recover'), opened: value => opened.push(value) });
  try {
    assert.equal(calls, 1); assert.equal(latest.status, 'loading');
    await tick(t, 999); assert.equal(calls, 1);
    await tick(t, 1); assert.equal(calls, 2);
    await tick(t, 1999); assert.equal(calls, 2);
    await tick(t, 1); assert.equal(calls, 3);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    await wake('offline'); await tick(t, 60_000); assert.equal(calls, 3);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await wake('online'); assert.equal(calls, 3);
    active(); available = true; await wake('focus');
    assert.equal(calls, 4); assert.equal(opened.length, 1); assert.equal(opened[0].entry.id, 'real-file');
    assert.equal(latest.status, null); await tick(t, 60_000); assert.equal(calls, 4);
  } finally { await view.cleanup(); t.mock.timers.reset(); active(); }
});

test('terminal entry failures show sentences and never retry; edit preparation uses the same classification', async t => {
  active(); t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const failure of [{ status: 404 }, { status: 410 }, { status: 401 }, { status: 403 }, { kind: 'not-found' }, { kind: 'no-access' }]) {
    let calls = 0; globalThis.__f2Resolve = async () => { calls++; throw failure; };
    const view = await mount(EntryProbe, { request: request(JSON.stringify(failure)), opened: () => assert.fail('must not open') });
    assert.equal(latest.status, 'error'); assert.match(view.el.textContent, /不存在|权限/);
    await wake(); await tick(t, 60_000); assert.equal(calls, 1); await view.cleanup();
  }
  let calls = 0, reached;
  const prepared = new Promise(resolve => { reached = resolve; });
  globalThis.__f2Prepare = async () => { calls++; reached(); return { ok: false, status: 403 }; };
  const view = await mount(EntryProbe, { request: { nonce: 'prepare-denied', mode: 'edit', entry: { id: 'file', libraryItem: {} }, actionContext: { rights: { canView: true, canEdit: true } } }, opened: () => assert.fail('must not open') });
  try { await act(async () => { await prepared; }); assert.equal(calls, 1, 'lazy edit preparation must execute'); assert.equal(latest.status, 'error'); await wake(); await tick(t, 60_000); assert.equal(calls, 1); }
  finally { await view.cleanup(); t.mock.timers.reset(); }
});

test('dismissal and replacement cancel recovery and reject stale resolutions', async t => {
  active(); t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0, release; const opened = [];
  globalThis.__f2Resolve = async ref => { calls++; if (ref.artifactId === 'pending') return new Promise(resolve => { release = resolve; }); throw Error('temporary'); };
  const view = await mount(EntryProbe, { request: request('failure'), opened: value => opened.push(value) });
  try {
    await act(async () => latest.dismiss()); await wake(); await tick(t, 60_000); assert.equal(calls, 1); assert.equal(latest.status, null);
    await view.render({ request: request('pending'), opened: value => opened.push(value) });
    globalThis.__f2Resolve = async () => detail('selected');
    await view.render({ request: request('selected'), opened: value => opened.push(value) });
    await act(async () => release(detail('stale')));
    assert.deepEqual(opened.map(value => value.entry.id), ['selected']);
  } finally { await view.cleanup(); t.mock.timers.reset(); }
});

const { AutoRecovery } = await import(await compileModule('src/shell/AutoRecovery.tsx', { '../i18n/ui/useUI': ui }));
test('shared read recovery keeps backoff across loading remounts and stops on terminal errors', async t => {
  active(); t.mock.timers.enable({ apis: ['setTimeout'] }); let calls = 0;
  const props = { identity: 'f2-remount', recover: () => calls++ };
  let view = await mount(AutoRecovery, props);
  try {
    assert.equal(view.el.querySelector('[aria-busy]').getAttribute('aria-busy'), 'true'); assert.equal(view.el.querySelector('button'), null);
    await tick(t, 1000); assert.equal(calls, 1); await view.cleanup();
    view = await mount(AutoRecovery, props); await tick(t, 1999); assert.equal(calls, 1); await tick(t, 1); assert.equal(calls, 2);
    await view.render({ ...props, error: { status: 403 } }); assert.match(view.el.textContent, /没有权限/); await wake(); await tick(t, 60_000); assert.equal(calls, 2);
  } finally { await view.cleanup(); t.mock.timers.reset(); }
});

const person = { user_id: 'seller/with-id', username: null, name: 'Seller', avatar_url: null, following: false, follows_me: false, blocked: false };
const followClient = await compileModule('src/lib/bay/following.ts', {
  './http': dataModule('export const bayGet=(...args)=>globalThis.__f2BayGet(...args);export const bayPost=async()=>({following:true});export const bayDelete=async()=>({following:false});'),
});
const { getBayFollowPerson } = await import(followClient);
const { BayFollowButton } = await import(await compileModule('src/shell/bay/following/BayFollowButton.tsx', {
  '../../../i18n/ui/useUI': ui,
  '../../../lib/auth/client': dataModule('export const getUserId=async()=>"viewer";'),
  '../../../lib/bay/following': followClient,
  '../shell/bay-state': dataModule('export const useBaySignedIn=()=>true;export const requireBayLogin=()=>true;'),
}));
test('known seller lookup uses only the exact id endpoint with cancellation, independent of capped search', async () => {
  active(); const calls = []; const controller = new AbortController();
  globalThis.__f2BayGet = async (path, options) => { calls.push({ path, options }); return path.includes('/search') ? { people: Array.from({ length: 20 }, (_, i) => ({ ...person, user_id: 'other-' + i })) } : person; };
  assert.deepEqual(await getBayFollowPerson(person.user_id, controller.signal), person);
  assert.equal(calls[0].path, '/v1/im/users/seller%2Fwith-id'); assert.equal(calls[0].options.signal, controller.signal);
  const view = await mount(BayFollowButton, { userId: person.user_id, username: 'unrelated-name' });
  try {
    const button = view.el.querySelector('button'); assert.equal(button.disabled, false);
    assert.ok(calls.every(call => !call.path.includes('/search')));
    await act(async () => button.click()); assert.equal(button.getAttribute('aria-pressed'), 'true');
  } finally { await view.cleanup(); }
});
test('unavailable exact lookup is labelled and recovers; blocked or mismatched cards stay unavailable', async () => {
  active(); let available = false;
  globalThis.__f2BayGet = async () => { if (!available) throw { status: 503, code: 'people_unavailable' }; return person; };
  const view = await mount(BayFollowButton, { userId: person.user_id, username: 'seller' });
  try { assert.equal(view.el.querySelector('button').disabled, true); assert.match(view.el.textContent, /暂不可用/); available = true; await wake(); assert.equal(view.el.querySelector('button').disabled, false); }
  finally { await view.cleanup(); }
  for (const card of [{ ...person, blocked: true }, { ...person, user_id: 'other' }]) {
    globalThis.__f2BayGet = async () => card;
    const view = await mount(BayFollowButton, { userId: person.user_id, username: 'seller' });
    assert.equal(view.el.querySelector('button').disabled, true); assert.match(view.el.textContent, /暂不可用/); await view.cleanup();
  }
});

test('whole-host scan fails for both literal and computed load Retry controls in memory', () => {
  const sources = bayRecoverySources(); assert.deepEqual(forbiddenRecoveryControls(sources), []);
  for (const [file, code] of [
    ['src/shell/ResultCanvas.tsx', '<button>{tt("重试")}</button>'],
    ['src/shell/WorkspacePaneErrorBoundary.tsx', '<button>{this.props.retryLabel}</button>'],
    ['src/shell/messages/conversation/MessageItem.tsx', '<button onClick={load}>{tt("重试")}</button>'],
    ['src/shell/MyLibrary.tsx', '<button onClick={load}>{tt(libraryLoadFailureCopy(failure).retryLabel)}</button>'],
  ]) {
    const probe = new Map(sources); probe.set(file, ts.createSourceFile(file, code, 99, true, ts.ScriptKind.TSX));
    assert.ok(forbiddenRecoveryControls(probe).some(hit => hit.startsWith(file + ':')));
  }
});

const server = await import(await compileModule('src/pages/devices/server-page-shared.tsx', {
  '../../i18n/ui/useUI': ui,
  '../../lib/cloud-computer-api': dataModule('export class CloudComputerError extends Error {}'),
  './DeviceDialog': dataModule('export const DeviceDialog=()=>null;export const DEVICE_BUTTON="";export const DEVICE_PRIMARY_BUTTON="";'),
}));
test('shared server recovery never automatically repeats a failed destructive action', async t => {
  active(); t.mock.timers.enable({ apis: ['setTimeout'] }); let control, writes = 0;
  function ActionProbe() { control = server.useServerAction(); return control.feedback; }
  const view = await mount(ActionProbe);
  try {
    await act(async () => control.run(async () => { writes++; throw Error('action failed'); }));
    assert.equal(writes, 1); assert.match(view.el.textContent, /action failed/);
    assert.equal(view.el.querySelector('[data-auto-recovery]'), null);
    await wake(); await tick(t, 60_000); assert.equal(writes, 1);
  } finally { await view.cleanup(); t.mock.timers.reset(); }
});

const { WorkspacePaneErrorBoundary } = await import(await compileModule('src/shell/WorkspacePaneErrorBoundary.tsx', {
  '../i18n/ui/useUI': ui,
  '../lib/telemetry/errors': dataModule('export const reportBoundaryError=()=>{};'),
}));
test('sidebar crash recovery preserves the sibling draft and hides raw errors', async t => {
  active(); t.mock.method(console, 'error', () => {}); let available = false;
  function Fragile() { if (!available) throw Error('raw private error'); return h('span', null, 'recovered content'); }
  function Probe() { return h('div', null, h('input', { defaultValue: 'unsaved draft' }), h(WorkspacePaneErrorBoundary, { recoveryKey: 'f2-crash', closeLabel: 'Close', onClose: () => {} }, h(Fragile))); }
  const view = await mount(Probe);
  try {
    assert.ok(view.el.querySelector('[data-auto-recovery]')); assert.doesNotMatch(view.el.textContent, /raw private|Retry|重试/);
    available = true; await wake(); assert.match(view.el.textContent, /recovered content/);
    assert.equal(view.el.querySelector('input').value, 'unsaved draft');
  } finally { await view.cleanup(); }
});
