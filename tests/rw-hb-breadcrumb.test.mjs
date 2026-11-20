// Shared Breadcrumb (wave 2026-11-20 roles, unit HB; contract §1.5): compact, left-aligned, "Parent / Current",
// the last item is the current page and never a link, it never stretches to fill its row.
import assert from 'node:assert/strict';
import test from 'node:test';
import React, {act} from 'react';
import {readFileSync} from 'node:fs';
import './helpers/w1-jsdom-window.mjs';
import {compileModule} from './helpers/module-bench.mjs';
const {createRoot} = await import('react-dom/client');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const {Breadcrumb} = await import(await compileModule('src/ui/Breadcrumb.tsx'));

async function mount(props) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(React.createElement(Breadcrumb, props)));
  return {host, close: async () => { await act(async () => root.unmount()); host.remove(); }};
}

test('renders ancestors as links, a "/" between levels, and the current page as plain text', async () => {
  const clicks = [];
  const view = await mount({label: 'Trail', items: [
    {label: 'Presentations', href: '?type=deck', onClick: (event) => { event.preventDefault(); clicks.push('deck'); }},
    {label: 'Business planning'},
  ]});
  try {
    const nav = view.host.querySelector('nav[data-breadcrumb]');
    assert.equal(nav.getAttribute('aria-label'), 'Trail');
    assert.deepEqual([...nav.querySelectorAll('li')].map((li) => li.textContent), ['Presentations', '/', 'Business planning']);
    const link = nav.querySelector('a');
    assert.equal(link.getAttribute('href'), '?type=deck');
    await act(async () => link.dispatchEvent(new window.MouseEvent('click', {bubbles: true, cancelable: true})));
    assert.deepEqual(clicks, ['deck']);
    const current = nav.querySelector('[data-breadcrumb-current]');
    assert.equal(current.getAttribute('aria-current'), 'page');
    assert.equal(current.querySelector('a,button'), null, 'current page is not a link');
    assert.ok(current.classList.contains('truncate') && current.classList.contains('min-w-0'));
    assert.equal(nav.querySelectorAll('a').length, 1);
  } finally { await view.close(); }
});

test('is compact and left-aligned: no justify-between, no flex-grow anywhere in the trail', async () => {
  const view = await mount({items: [{label: 'Projects', href: '/projects'}, {label: 'Legal'}], className: 'text-[13px]'});
  try {
    const nodes = [view.host.querySelector('nav'), ...view.host.querySelectorAll('nav *')];
    for (const node of nodes) {
      const cls = node.getAttribute('class') || '';
      assert.doesNotMatch(cls, /justify-between|justify-around|justify-evenly|(^|\s)(flex-1|grow|flex-grow|w-full)(\s|$)/, cls);
    }
    assert.match(view.host.querySelector('nav').className, /text-\[13px\]/);
  } finally { await view.close(); }
  const source = readFileSync(new URL('../src/ui/Breadcrumb.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /justify-between|flex-1\b/);
});

test('onClick-only ancestors are buttons; a custom current node replaces the last label', async () => {
  let opened = 0;
  const view = await mount({items: [{label: 'Legal', onClick: () => { opened += 1; }}, {label: 'Draft contract'}],
    current: React.createElement('h2', {className: 'x'}, 'Draft contract')});
  try {
    const button = view.host.querySelector('li button');
    assert.equal(button.getAttribute('type'), 'button');
    await act(async () => button.click());
    assert.equal(opened, 1);
    assert.equal(view.host.querySelector('[data-breadcrumb-current] h2').textContent, 'Draft contract');
  } finally { await view.close(); }
});

test('exported from @oceanleo/ui/ui and an empty trail renders nothing', async () => {
  const index = readFileSync(new URL('../src/ui/index.tsx', import.meta.url), 'utf8');
  assert.match(index, /export \{ Breadcrumb, type BreadcrumbItem, type BreadcrumbProps \} from "\.\/Breadcrumb";/);
  const view = await mount({items: []});
  try { assert.equal(view.host.innerHTML, ''); } finally { await view.close(); }
});
