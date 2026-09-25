import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act, useState } from 'react';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
import { compileSubject, mountDom, reactUrl, click } from './g3-test-support.mjs';

const ITEM = 'b3795a22-5c00-41a9-b2e0-55b38e9fd1c4';
// Same keys and double-browser state as session 8257fb2f (read-only SQL RID 091214-sql-34125).
const SNAPSHOT = { kind: 'website-builder', seedId: null, brief: '企业网站', briefTemplate: null,
  style: null, pages: '6', open: 'brief', previewUrl: null, projectName: '投资担保',
  previewDevice: 'desktop', canvasView: 'browser', __oceanleo_ui: { right_tab: 'browser' } };
const artifactClient = dataModule(`export async function getCurrentArtifactItem(id) {
  globalThis.__g3.reads.push(id);
  return { ok: true, data: { id, artifactId: id, kind: 'website', title: '投资担保 · 6 页企业官网' } };
}`);
const shared = { './artifact-client': artifactClient };
const actionsUrl = await compileModule('src/shell/workspace-actions.ts', shared);
const { WORKSPACE_ACTION_EVENT, workspaceSlotForLegacyId } = await import(actionsUrl);
const { useWorkspaceSlotState } = await import(await compileSubject('src/shell/result-canvas-slot-state.ts', { './workspace-actions': actionsUrl }));
const { useCatalogDeepLink } = await import(await compileSubject('src/shell/site-catalog-deeplink.tsx', shared));
const { useLibraryEditIntent } = await import(await compileModule('src/shell/library-edit-intent.ts', shared));
const { splitWorkspaceSessionSnapshot } = await import(await compileModule('src/shell/workspace-session-snapshot.ts'));
const workspace = dataModule(`export function useWorkspaceSession() { return { mode: 'workspace', siteId: 'website', appId: 'corp-site' }; }`);
const hydrationUrl = await compileModule('src/shell/workspace-runtime-hydration.tsx', { './workspace-session-context': workspace });
const { WorkspaceRuntimeBoundary, useWorkspaceRuntimeHydration } = await import(hydrationUrl);

// The website components are real. Only the shared canvas rendering is a probe;
// its selection and item-delivery hooks are the real production hooks.
function CanvasProbe(props) {
  const runtime = useWorkspaceRuntimeHydration();
  globalThis.__g3.runtime = runtime;
  const [item, setItem] = useState(null);
  const state = useWorkspaceSlotState({ ...props, showTemplate: true, runtimeHydration: runtime,
    slotForId: workspaceSlotForLegacyId,
    callerIdForSlot: id => ({ materials: 'material', mine: 'files', template: 'guide' }[id] || id) });
  globalThis.__g3.state = state;
  useLibraryEditIntent({ action: state.actionFor(state.selected), items: [], onOpenItem: () => { throw new Error('Preview must not edit'); },
    onPreviewItem: setItem, onFailure: error => { throw new Error(error.message); } });
  return React.createElement('div', { 'data-selected': state.selected, 'data-host-active': props.active },
    ['materials', 'browser', 'preview'].map(id => React.createElement('button', { key: id, 'data-tab': id, onClick: () => state.select(id) }, id)),
    // A library card already has its item; revealing its preview does not emit a workspace action.
    React.createElement('button', { 'data-card': ITEM, onClick: () => setItem({ artifactId: ITEM, title: '投资担保 · 6 页企业官网' }) }, '打开素材'),
    React.createElement('output', { 'data-item': item?.artifactId || '' }, state.selected === 'materials' ? item?.title : ''));
}
const ui = dataModule(`export function useUI() { return value => value; }`);
const shell = dataModule(`import React from ${JSON.stringify(reactUrl)};
  export function ResultCanvas(props) { return React.createElement(globalThis.__g3.CanvasProbe, props); }
  export function FunctionAgentChat(props) { globalThis.__g3.chat = props; return null; }
  export function useFnAgentBridge() {}
  export function CloudBrowserPanel() { return null; }
  export function LeoComposer() { return null; }
  export function StudioSection() { return null; }
  export function OptionRow() { return null; }
`);
const website = '/root/projects/website/front';
const websiteStubs = { '@oceanleo/ui/shell': shell, '@oceanleo/ui/i18n': ui,
  '@/lib/materials': dataModule(`export function materialContextForApp() { return null; }`),
  '@/lib/preview-origin': await compileModule(`${website}/lib/preview-origin.ts`),
  '@/lib/app-catalog': dataModule(`export const WEBSITE_APPS = []; export function useWebsiteApps() { return []; }`) };
const { BuilderProvider } = await import(await compileModule(`${website}/components/workspace/BuilderContext.tsx`, websiteStubs));
const { default: BuildConsole } = await import(await compileModule(`${website}/components/workspace/BuildConsole.tsx`, websiteStubs));
const { default: PreviewCanvas } = await import(await compileModule(`${website}/components/workspace/PreviewCanvas.tsx`, websiteStubs));
const APP = { id: 'corp-site', name: '企业官网' };
function Sender({ search, activeAppId = APP.id }) {
  useCatalogDeepLink({ activeAppId, requestedAppId: APP.id, apps: [APP], siteKey: 'website', locationSearch: search,
    onDeepLinkQueryStripped: () => {} });
  return null;
}
function Host({ search, activeAppId }) {
  return React.createElement(WorkspaceRuntimeBoundary, { scope: 'corp-site' },
    React.createElement(BuilderProvider, null, React.createElement(BuildConsole), React.createElement(PreviewCanvas, { appId: APP.id }),
      React.createElement(Sender, { search, activeAppId })));
}

for (const mode of ['bare-link', 'explicit-preview', 'card']) {
  test(`${mode}: website host + shared snapshot restored 3s later keeps the same material for 30s`, async t => {
    const search = mode === 'card' ? '' : `?tab=materials&item=${ITEM}${mode === 'explicit-preview' ? '&mode=preview' : ''}`;
    const mounted = await mountDom(`https://website.test/workspace/corp-site${search}`);
    globalThis.__g3 = { reads: [], CanvasProbe };
    const events = [];
    window.addEventListener(WORKSPACE_ACTION_EVENT, event => events.push(event.detail.action.tab));
    try {
      await mounted.render(React.createElement(Host, { search }));
      if (mode === 'card') {
        await click(mounted.container.querySelector('[data-tab="materials"]'));
        await click(mounted.container.querySelector('[data-card]'));
        assert.deepEqual(events, []);
      }
      assert.equal(mounted.container.querySelector('[data-selected]').dataset.selected, 'materials');
      assert.equal(mounted.container.querySelector('output').dataset.item, ITEM);
      assert.deepEqual(globalThis.__g3.reads, mode === 'card' ? [] : [ITEM]);
      t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
      setTimeout(() => {
        const split = splitWorkspaceSessionSnapshot(SNAPSHOT);
        globalThis.__g3.runtime.restoreSharedUi(split.ui);
        globalThis.__g3.chat.onRestoreSessionSnapshot(split.runtime);
        globalThis.__g3.runtime.markRuntimeReady();
      }, 3000);
      await act(async () => t.mock.timers.tick(3000));
      assert.equal(mounted.container.querySelector('[data-selected]').dataset.selected, 'materials');
      assert.equal(mounted.container.querySelector('[data-selected]').dataset.hostActive, 'material');
      assert.equal(globalThis.__g3.chat.getSessionSnapshot().canvasView, 'material');
      assert.equal(globalThis.__g3.runtime.snapshotSharedUi().right_tab, 'materials');
      for (let elapsed = 3000; elapsed < 30000; elapsed += 1000) {
        await act(async () => t.mock.timers.tick(1000));
        assert.equal(mounted.container.querySelector('[data-selected]').dataset.selected, 'materials');
        assert.equal(mounted.container.querySelector('output').dataset.item, ITEM);
      }
      assert.equal(events.includes('browser'), false);
      await click(mounted.container.querySelector('[data-tab="browser"]'));
      assert.equal(mounted.container.querySelector('[data-selected]').dataset.selected, 'browser');
    } finally { t.mock.timers.reset(); await mounted.close(); delete globalThis.__g3; }
  });
}

test('late catalog resolution opens a bare link once; in-page identity rewrites do not reopen it', async () => {
  const search = `?tab=materials&item=${ITEM}`;
  const mounted = await mountDom(`https://website.test/workspace/corp-site${search}`);
  globalThis.__g3 = { reads: [], CanvasProbe };
  try {
    await mounted.render(React.createElement(Host, { search, activeAppId: '' }));
    assert.equal(globalThis.__g3.reads.length, 0);
    await mounted.render(React.createElement(Host, { search, activeAppId: APP.id }));
    assert.deepEqual(globalThis.__g3.reads, [ITEM]);
    await click(mounted.container.querySelector('[data-tab="browser"]'));
    await mounted.render(React.createElement(Host, { search: '?tab=materials&item=another-item' }));
    assert.equal(mounted.container.querySelector('[data-selected]').dataset.selected, 'browser');
    assert.deepEqual(globalThis.__g3.reads, [ITEM]);
  } finally { await mounted.close(); delete globalThis.__g3; }
});
