import './helpers/w1-jsdom-window.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {compileModule, dataModule} from './helpers/module-bench.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const {SidebarSectionBadge} = await import(await compileModule('src/shell/badges/SidebarSectionBadge.tsx'));
const {SidebarAccountCluster} = await import(await compileModule('src/shell/account/SidebarAccountCluster.tsx', {
  '../AccountMenu': dataModule('export function AccountMenu(){return null}'),
  '../../contracts/domain-family': dataModule('export function portalHref(path){return path}'),
  '../../lib/auth/client': dataModule('export async function signOutEverywhere(){}'),
  './DeviceStatusPopover': dataModule('export function DeviceStatusPopover(){return null}'),
  '../leochat/LeoChatButton': dataModule('export function LeoChatButton(){return null}'),
  './SettingsModalHost': dataModule('export function openSettingsModal(){}'),
}));

for (const [count, text] of [[0, ''], [1, '1'], [120, '99+']]) {
  test(`real sidebar badge ${count}: ${text || 'hidden'}, rail retains count`, async () => {
    const errors = [], previous = console.error;
    console.error = (...args) => errors.push(args.join(' '));
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(React.createElement(SidebarSectionBadge, {count, rail: true})));
      assert.equal(container.textContent, text);
      assert.equal(container.querySelectorAll('[data-section-badge]').length, count ? 1 : 0);
      if (count) assert.equal(container.firstElementChild.style.position, 'absolute');
      assert.deepEqual(errors, []);
    } finally {await act(async () => root.unmount()); container.remove(); console.error = previous;}
  });
}

test('real account cluster follows server dot, and hides it when signed out', async () => {
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container), errors = [], previous = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  try {
    for (const [signedIn, accountDot, expected] of [[true, true, 1], [true, false, 0], [false, true, 0]]) {
      await act(async () => root.render(React.createElement(SidebarAccountCluster, {name: 'Owner', balanceText: '0', signedIn, accountDot})));
      assert.equal(container.querySelectorAll('[data-account-badge]').length, expected);
    }
    assert.deepEqual(errors, []);
  } finally {await act(async () => root.unmount()); container.remove(); console.error = previous;}
});
