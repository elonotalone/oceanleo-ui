import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import React, { act } from 'react';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
import { usePluginPage, resetPluginPageCache } from '../src/shell/plugin-chrome/plugin-page-store.ts';
import { resetPluginModeCache } from '../src/shell/plugin-chrome/plugin-mode-store.ts';

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve('fabric/node'));
const canvasEntry = fabricRequire.resolve('canvas');
const previousCanvas = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve('jsdom')).href);
if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
else delete require.cache[canvasEntry];
const reactUrl = pathToFileURL(require.resolve('react')).href;
const stubs = {
  '../i18n/ui/useUI': dataModule('const tt = (value) => value; export function useUI() { return tt; }'),
  './AdvancedStageControls': dataModule('export function AdvancedStageControls() { return null; }'),
  './AdvancedWorkbenchStage': dataModule('export function AdvancedWorkbenchStage({editorStage}) { return editorStage; }'),
  './FloatingContextToolbar': dataModule(`
    export function FloatingContextToolbar({children}) { return children; }
    const controller = { mode: 'docked', dropActive: false, leading: null, trailing: null };
    export function useFloatingContextToolbar() { return controller; }
  `),
  './inline-advanced-workbench-drop': dataModule(`
    const result = { dropMessage: '', performUpload() {}, handleDrop() {} };
    export function useInlineAdvancedWorkbenchDrop() { return result; }
  `),
  './InlineEditorMaterialPanel': dataModule('export function InlineEditorMaterialPanel() { return null; }'),
  './plugin-chrome/PluginAgentPanel': dataModule('export function PluginAgentPanel() { return null; }'),
  './plugin-chrome/PluginGlobalRow': dataModule(`
    import { createElement } from ${JSON.stringify(reactUrl)};
    export function PluginGlobalRow({onBack}) { return createElement('button', {onClick:onBack,'data-exit':true}, 'exit'); }
  `),
  './advanced-session-context': dataModule('export function useAdvancedSession() { return null; }'),
  './workbench-material-provider': dataModule(`
    export const WORKBENCH_MATERIAL_MIME = 'application/x-oceanleo-material';
    export function useWorkbenchMaterials() { return null; }
  `),
  './use-advanced-autosave': dataModule(`
    const result = {state: 'saved', flushLatest: async () => ({ok: true}), retry: async () => {}};
    export function useAdvancedAutoSave() { return result; }
  `),
  './use-advanced-recovery': dataModule('export function useAdvancedRecovery() {}'),
  './workbench-routes': dataModule('export function editBarOwnershipForItem() { return "host"; }'),
};
const load = async (path) => import(await compileModule(path, stubs));
const { InlineAdvancedWorkbenchShell } = await load('src/shell/InlineAdvancedWorkbenchShell.tsx');
const { SplitWorkspace } = await load('src/shell/SplitWorkspace.tsx');
const { useAdvancedLayout } = await load('src/shell/advanced-layout-context.tsx');

class ErrorBoundary extends React.Component {
  state = {error: ''};
  static getDerivedStateFromError(error) { return {error: error.message}; }
  componentDidCatch(error) { this.props.errors.push(error.message); }
  render() { return this.state.error ? React.createElement('output', {'data-crash': true}, this.state.error) : this.props.children; }
}

test('host-reported design page switches settle in the workspace header slot', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {pretendToBeVisual: true, url: 'https://test.dev.oceanleo.com/'});
  const {window} = dom;
  const restore = [];
  for (const [key,value] of Object.entries({window, document:window.document, navigator:window.navigator, HTMLElement:window.HTMLElement, Element:window.Element, Node:window.Node, Event:window.Event, MouseEvent:window.MouseEvent, requestAnimationFrame:window.requestAnimationFrame.bind(window), cancelAnimationFrame:window.cancelAnimationFrame.bind(window), IS_REACT_ACT_ENVIRONMENT:true})) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis,key);
    restore.push(() => descriptor ? Object.defineProperty(globalThis,key,descriptor) : delete globalThis[key]);
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  }
  resetPluginModeCache(); resetPluginPageCache();
  const {createRoot} = await import('react-dom/client');
  const container = window.document.createElement('div'); window.document.body.append(container);
  const errors=[];
  const root=createRoot(container,{onCaughtError() {}});
  let commits=0;
  const transitions=[];
  const item = {id:'d4-public-design',key:'artifact:d4-public-design',title:'design',kind:'image',meta:{}};
  const h=React.createElement;
  function Selection() { useAdvancedLayout(); return h('span',{'data-selection':true}); }
  function Editor({onClose}) {
    const {pageId}=usePluginPage('design-canvas');
    const [mode,setMode]=React.useState('normal');
    React.useLayoutEffect(() => { commits++; transitions.push([pageId,mode]); });
    return h(InlineAdvancedWorkbenchShell,{item,siteId:'design',onClose,adapter:{
      id:'design-canvas', label:'设计画布',
      pages:{activePageId:pageId}, mode:{current:mode,setMode},
      stage:h('div',{'data-design-content':mode}, 'public design'),
      contextToolbar:h(Selection),
    }});
  }
  function Host() {
    const [open,setOpen]=React.useState(true);
    return h(SplitWorkspace,{left:h('span',null,'left'),right:open?h(Editor,{onClose:()=>setOpen(false)}):h('button',{'data-reopen':true,onClick:()=>setOpen(true)},'reopen')});
  }
  const click=async (selector)=>{
    const button=container.querySelector(selector);
    assert.ok(button,`Missing ${selector}`);
    await act(async()=>button.dispatchEvent(new window.MouseEvent('click',{bubbles:true})));
  };
  try {
    await act(async()=>root.render(h(ErrorBoundary,{errors},h(Host))));
    for (const page of ['pro','artifact']) {
      await click(`[data-plugin-page="${page}"]`);
      assert.deepEqual(errors,[],`page ${page} must settle, commits=${commits}, transitions=${JSON.stringify(transitions.slice(0,12))}`);
      assert.equal(container.querySelector(`[data-plugin-page="${page}"]`)?.getAttribute('aria-selected'),'true');
      assert.equal(container.querySelector('[data-design-content]')?.getAttribute('data-design-content'),page==='pro'?'pro':'normal');
    }
    await click('[data-exit]');
    await click('[data-reopen]');
    assert.ok(container.querySelector('[data-design-content]'));
    assert.deepEqual(errors,[]);
    assert.ok(commits < 20, `expected bounded commits, got ${commits}`);
  } finally {
    await act(async()=>root.unmount());
    dom.window.close();
    for(const undo of restore.reverse())undo();
  }
});
