import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import './helpers/w1-jsdom-window.mjs';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
import { configureClientHost } from '../src/contracts/client-host-config.ts';

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve('react')).href;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.Event = window.Event;
globalThis.CustomEvent = window.CustomEvent;
globalThis.StorageEvent = window.StorageEvent;
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
window.HTMLElement.prototype.scrollIntoView = function () {};
const motionStyle = document.createElement('style');
motionStyle.id = 'leo-overlay-motion';
document.head.append(motionStyle);
const toastStyle = document.createElement('style'); toastStyle.id = 'leo-toast-motion'; document.head.append(toastStyle);
const identityListeners = new Set();
let nativeIdentity;
let failRead = false;
const nativeSession = {
  async getSession() { if (failRead) throw new Error('temporary native read outage'); return nativeIdentity; },
  subscribe(listener) { identityListeners.add(listener); return () => identityListeners.delete(listener); },
};
configureClientHost({
  family: 'ws', platform: 'desktop', locale: 'en', capabilities: [],
  portalOrigin: 'https://oceanbizs.com', gatewayOrigin: 'https://api.oceanbizs.com',
  identityOrigin: 'https://login.oceanbizs.com', identityAnonKey: 'fixture-anon', nativeSession,
});
const sdk = dataModule(`
  export class NavigatorLockAcquireTimeoutError extends Error {}
  export function createClient() {
    return { auth: {
      async getUser() { return { data: { user: { id: 'u1', email: 'ada@example.test', user_metadata: { full_name: 'Ada' } } }, error: null }; },
      async stopAutoRefresh() {}, onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
    } };
  }
`);
const tt = dataModule('const tt = (text) => text; export function useUI() { return tt; }');
const noop = (name) => dataModule(`export function ${name}(){ return null; }`);
const overrides = {
  '@supabase/supabase-js': sdk,
  '@supabase/ssr': dataModule('export function createBrowserClient(){ throw new Error("fixture uses native storage only"); }'),
  '../i18n/ui/useUI': tt,
  '../lib/org-api': dataModule('export async function listMyOrgs(){ return []; }'),
  './messages/MessagesHost': noop('MessagesHost'),
  './leo/LeoShellMount': noop('LeoShellMount'),
  './account/DeviceStatusPopover': noop('DeviceStatusPopover'),
  './leochat/LeoChatButton': noop('LeoChatButton'),
  './account/SettingsModalHost': dataModule('export function SettingsModalHost(){ return null; } export function openSettingsModal(tab){ globalThis.__openedAccountTab = tab; }'),
  '../lib/presence': dataModule('export function usePresenceHeartbeat(){}'),
  './ModelPicker': noop('ModelGroupPicker'),
  '../theme': noop('ThemeSwitcher'),
  '../i18n/LanguageSwitcher': noop('LanguageSwitcher'),
  'next/navigation': dataModule('export function usePathname(){return "/";} export function useSearchParams(){return new URLSearchParams();} export function useRouter(){ return {push(){},replace(){},prefetch(){}}; }'),
  'next/link': dataModule(`import React from ${JSON.stringify(reactUrl)}; export default function Link({children,href,...props}){return React.createElement('a',{href,...props},children);}`),
};
const authUrl = await compileModule('src/lib/auth/client.ts', overrides);
const identityUrl = await compileModule('src/lib/auth/account-identity.ts', { ...overrides, './client': authUrl });
const shellOverrides = { ...overrides, '../lib/auth': identityUrl, '../lib/auth/client': authUrl, '../lib/auth/account-identity': identityUrl };
const { AccountMenu } = await import(await compileModule('src/shell/AccountMenu.tsx', shellOverrides));
const auth = await import(authUrl);
const brand = { name: 'Fixture', accent: '#000', logo: React.createElement('span', null, 'F') };
const liveIdentity = (ttl = 60_000) => ({ userId: 'u1', email: 'ada@example.test', accessToken: 'fixture-token', refreshToken: 'fixture-refresh', expiresAt: Date.now() + ttl });
const flush = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); }); };
async function announce(identity) {
  nativeIdentity = identity;
  await act(async () => { for (const listener of identityListeners) listener(); });
  await flush();
}
function triggers() { return [...document.querySelectorAll('[data-account-trigger]')]; }

// Any unexpected React/runtime error fails every transition check.
const roots = [];
test.afterEach(async () => { await act(async () => { for (const root of roots.splice(0)) root.unmount(); }); document.body.replaceChildren(); });
const errors = [];
const originalError = console.error;
console.error = (...args) => { errors.push(args.map(String).join(' ')); };
test.after(() => { console.error = originalError; assert.deepEqual(errors, []); });

test('confirmed no session hides stale caller name and avatar; returning token restores it', async () => {
  nativeIdentity = null;
  const mount = document.createElement('div'); document.body.append(mount);
  const root = createRoot(mount); roots.push(root);
  const props = { name: 'Cached Ada', email: 'ada@example.test', avatar: React.createElement('span', { 'data-cached-avatar': '' }, 'OLD'), balanceText: '0', orgHref: '/', homeHref: '/', helpHref: null, docsHref: '/', onOpenSettings() {}, onSignOut() {} };
  await act(async () => root.render(React.createElement(AccountMenu, props)));
  await flush();
  assert.equal(triggers()[0].getAttribute('aria-label'), '登录');
  assert.equal(document.querySelector('[data-cached-avatar]'), null);
  await announce(liveIdentity());
  assert.equal(triggers()[0].getAttribute('aria-label'), 'Cached Ada');
  assert.ok(document.querySelector('[data-cached-avatar]'));
  failRead = true;
  // A failed local read must not erase a previously confirmed usable session.
  await act(async () => window.dispatchEvent(new window.CustomEvent('oceanleo:auth-state')));
  await flush();
  assert.equal(triggers()[0].getAttribute('aria-label'), 'Cached Ada');
  failRead = false;

});

test('token expiry without an auth event clears account; renewal before expiry never flickers', async () => {
  nativeIdentity = liveIdentity(1800);
  const mount = document.createElement('div'); document.body.append(mount);
  const root = createRoot(mount); roots.push(root);
  const props = { name: 'Ada', balanceText: '0', orgHref: '/', homeHref: '/', helpHref: null, docsHref: '/', onOpenSettings() {}, onSignOut() {} };
  await act(async () => root.render(React.createElement(AccountMenu, props)));
  await flush();
  assert.equal(triggers()[0].getAttribute('aria-label'), 'Ada');
  await announce(liveIdentity(1800));
  assert.equal(triggers()[0].getAttribute('aria-label'), 'Ada');
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1850)); });
  assert.equal(triggers()[0].getAttribute('aria-label'), '登录');
  await announce(liveIdentity());
  assert.equal(triggers()[0].getAttribute('aria-label'), 'Ada');

});

test('remembered account without an access token is unusable; read outages remain unknown', async () => {
  nativeIdentity = { ...liveIdentity(), accessToken: '' };
  assert.deepEqual(await auth.getUsableSessionSnapshot(), { available: true, userId: null, email: null, expiresAt: null });
  failRead = true;
  assert.equal((await auth.getUsableSessionSnapshot()).available, false);
  failRead = false;
});

test('temporary reads cannot cancel the known expiry boundary', async () => {
  nativeIdentity = liveIdentity(1800);
  const mount = document.createElement('div'); document.body.append(mount);
  const root = createRoot(mount); roots.push(root);
  const props = { name: 'Ada', balanceText: '0', orgHref: '/', homeHref: '/', helpHref: null, docsHref: '/', onOpenSettings() {}, onSignOut() {} };
  await act(async () => root.render(React.createElement(AccountMenu, props)));
  await flush();
  failRead = true;
  await act(async () => window.dispatchEvent(new window.CustomEvent('oceanleo:auth-state')));
  await flush();
  assert.equal(triggers()[0].getAttribute('aria-label'), 'Ada');
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1850)); });
  assert.equal(triggers()[0].getAttribute('aria-label'), '登录');
  failRead = false;
  await announce(liveIdentity());
  assert.equal(triggers()[0].getAttribute('aria-label'), 'Ada');
});
