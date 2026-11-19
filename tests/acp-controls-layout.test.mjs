import './helpers/w1-jsdom-window.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { compileModule, dataModule } from './helpers/module-bench.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const stubs = {
  '../../i18n/ui/useUI': dataModule('export const useUI=()=> (s,v) => s.replace(/\\{(\\w+)\\}/g, (_,k) => v?.[k] ?? k);'),
};
const { AcpSessionControls } = await import(await compileModule('src/shell/acp-task/AcpSessionControls.tsx', stubs));
const { StreamNoticeTarget } = await import(await compileModule('src/shell/transcript/StreamNotice.tsx', stubs));

test('controls reserve the same footer row when loaded, loading, unavailable, failed and recovered', async () => {
  const host = document.createElement('div');
  const stream = document.createElement('div');
  document.body.append(host, stream);
  const root = createRoot(host);
  let selected = '';
  const commands = [{ name: 'compact', description: 'Summarize this session' }];
  const states = [
    ['loaded', { commands, usage: { used: 25, size: 100 } }],
    ['loading', { commands: [], usage: null }],
    ['unavailable', { commands: [], usage: null, error: '' }],
    ['failed', { commands: [], usage: null, error: 'HTTP 503' }],
    ['recovered', { commands, usage: { used: 50, size: 100 } }],
  ];
  let row;
  try {
    for (const [state, props] of states) {
      await act(async () => root.render(React.createElement(StreamNoticeTarget.Provider, { value: stream },
        React.createElement('footer', null,
          React.createElement(AcpSessionControls, { ...props, input: '/co', onChange(value) { selected = value; } }),
          React.createElement('textarea', { 'aria-label': 'Message' }),
        ),
      )));
      const current = host.querySelector('[data-acp-session-controls]');
      if (row) assert.equal(current, row, `${state}: keep the reserved row mounted`);
      row = current;
      const style = window.getComputedStyle(row);
      assert.equal(style.height, '18px', `${state}: constant footer contribution`);
      assert.equal(style.flexShrink, '0', `${state}: row cannot shrink`);
      assert.equal(style.position, 'relative');
      assert.equal(host.querySelector('[role="alert"]'), null, `${state}: no footer error`);
      assert.equal(stream.querySelectorAll('[role="alert"]').length, state === 'failed' ? 1 : 0);
      if (state === 'loaded' || state === 'recovered') {
        const menu = row.querySelector('[role="menu"]');
        const menuStyle = window.getComputedStyle(menu);
        assert.equal(menuStyle.position, 'absolute', 'suggestions do not add to footer height');
        assert.equal(menuStyle.bottom, '100%', 'suggestions open above the reserved row');
        assert.equal(row.querySelector('[data-acp-context]').style.height, '100%');
        assert.equal(row.querySelector('meter').value, props.usage.used);
        await act(async () => menu.querySelector('button').click());
        assert.equal(selected, '/compact ');
      } else {
        assert.equal(row.querySelector('meter, [role="menu"]'), null, `${state}: no stale controls`);
      }
    }
  } finally {
    await act(async () => root.unmount());
    host.remove();
    stream.remove();
  }
});
