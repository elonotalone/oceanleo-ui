import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import './helpers/w1-jsdom-window.mjs';
import { compileModule } from './helpers/module-bench.mjs';
const { SelectionToolbarNumberControl } = await import(await compileModule('src/shell/SelectionToolbarNumberControl.tsx'));
const { createRoot } = await import('react-dom/client');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test('Enter in an edit-bar number field cannot submit its hosting form or reach workspace shortcuts', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  let bubbled = 0;
  let changes = 0;
  try {
    await act(async () => root.render(React.createElement('form', { onKeyDown: () => { bubbled += 1; } },
      React.createElement(SelectionToolbarNumberControl, { control: { id: 'font-size', label: 'Size', value: 24, type: 'number' }, emit: () => { changes += 1; }, menu: false, iconOnly: false }))));
    const event = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    await act(async () => host.querySelector('input').dispatchEvent(event));
    assert.equal(event.defaultPrevented, true);
    assert.equal(bubbled, 0);
    assert.equal(changes, 0, 'onChange already commits the value; Enter must not create a duplicate edit');
  } finally { await act(async () => root.unmount()); host.remove(); }
});
