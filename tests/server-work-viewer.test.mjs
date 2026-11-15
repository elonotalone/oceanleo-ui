// UC-NONE: the server viewer is a mount, so it cannot drift into a second preview implementation.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/shell/works/ServerWorkViewer.tsx',import.meta.url),'utf8');
test('server work viewer mounts the shared works workbench',()=>{assert.match(source,/<WorkWorkbench workId=\{item.id\}/);assert.doesNotMatch(source,/iframe|worksApi\.|setInterval|setTimeout/);});

// Loading another Library preview must not load the full workbench graph.
// Opening a server folder must still reach that same workbench with its id.
import React, { act } from 'react';
import './helpers/w1-jsdom-window.mjs';
import { compileModule, dataModule } from './helpers/module-bench.mjs';

test('server workbench loads only when its viewer mounts and follows the work id', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.__ufWorkbenchReact = React;
  globalThis.__ufWorkbenchLoads = 0;
  const { ServerWorkViewer } = await import(await compileModule('src/shell/works/ServerWorkViewer.tsx', {
    '../../i18n/ui/useUI': dataModule('export function useUI(){return value=>value;}'),
    '../works-workbench/WorkWorkbench': dataModule(`
      globalThis.__ufWorkbenchLoads += 1;
      export function WorkWorkbench({workId}) {
        return globalThis.__ufWorkbenchReact.createElement('div', {'data-workbench-id':workId});
      }
    `),
  }));
  assert.equal(globalThis.__ufWorkbenchLoads, 0, 'importing Library viewers must leave workbench unloaded');
  const { createRoot } = await import('react-dom/client');
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(ServerWorkViewer, {item:{id:'server-one'}})));
    for (let attempt = 0; attempt < 50 && !host.querySelector('[data-workbench-id]'); attempt += 1) {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    }
    assert.equal(globalThis.__ufWorkbenchLoads, 1);
    assert.equal(host.querySelector('[data-workbench-id]')?.dataset.workbenchId, 'server-one');
    await act(async () => root.render(React.createElement(ServerWorkViewer, {item:{id:'server-two'}})));
    assert.equal(globalThis.__ufWorkbenchLoads, 1);
    assert.equal(host.querySelector('[data-workbench-id]')?.dataset.workbenchId, 'server-two');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    delete globalThis.__ufWorkbenchReact;
    delete globalThis.__ufWorkbenchLoads;
  }
});
