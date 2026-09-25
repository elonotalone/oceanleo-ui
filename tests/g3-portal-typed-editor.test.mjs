import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
import { compileSubject, mountDom, reactUrl, click } from './g3-test-support.mjs';
import { editorCapabilityFor } from '../src/shell/workbench-routes.ts';
import { resetLibraryCurrentIdentityForTests } from '../src/shell/library-current-identity.ts';

const ui = dataModule(`export function useUI() { return (text, values) => values?.title ? text.replace('{title}', values.title) : text; }`);
const client = dataModule(`
  export const ARTIFACT_LIBRARY_CHANGE_EVENT = 'g3-library-change';
  export async function listMyArtifacts() { return { ok: true, data: { items: globalThis.__g3library.items, ownerPrincipalId: 'owner', nextCursor: null } }; }
  export async function listFavoriteArtifacts() { return { ok: true, data: { items: [], ownerPrincipalId: 'owner', nextCursor: null } }; }
  export async function getCurrentArtifactItem(id) { return { ok: true, data: globalThis.__g3library.items.find(item => item.artifactId === id) }; }
  export async function prepareArtifactForAction(action, item) {
    globalThis.__g3library.prepared.push({ action, id: item.artifactId });
    if (globalThis.__g3library.hold) await new Promise(resolve => { globalThis.__g3library.release = resolve; });
    if (globalThis.__g3library.fail) return { ok: false, error: '素材读取失败，请重试。' };
    return { ok: true, data: item };
  }
  export function artifactDownloadEvidence() { return { visible: false, available: false }; }
  export async function ensureArtifact() { throw new Error('unexpected ensure'); }
  export async function retireArtifact() { throw new Error('unexpected retire'); }
  export async function getArtifactDownload() { throw new Error('unexpected download'); }
  export async function setArtifactFavorite() { throw new Error('unexpected favorite'); }
`);
const session = dataModule(`import React, { createContext, useContext } from ${JSON.stringify(reactUrl)};
  const Context = createContext(null);
  export function WorkspaceSessionProvider({ children, appId, siteId }) {
    const value = { appId, siteId, session: null, sessionId: null, taskId: null };
    globalThis.__g3library.binding = { appId, siteId };
    return React.createElement(Context.Provider, { value }, children);
  }
  export function useOptionalWorkspaceSession() { return useContext(Context); }
  export function useWorkspaceSession() { return useContext(Context); }
`);
const pass = dataModule(`export function WorkbenchMaterialProvider({ children }) { return children; }
  export function WorkbenchErrorBoundary({ children }) { return children; }
  export function LibraryScope({ children }) { return children; }
  export function AdvancedWorkbenchBlankStage() { throw new Error('No blank draft allowed'); }
  export function useWorkbenchOpenClaim() {}
`);
const routeNames = ['EmbeddedRoute', 'DeckRoute', 'RichDocRoute', 'GridRoute', 'ImageRoute', 'PdfRoute', 'Model3DRoute', 'GameRoute', 'VideoTimelineRoute', 'VideoCanvasRoute', 'AudioRoute', 'ChartRoute', 'UnsupportedRoute'];
const routes = dataModule(`import React from ${JSON.stringify(reactUrl)};\n` + routeNames.map(name => `export function ${name}(props) {
  globalThis.__g3library.editor = { route: '${name}', item: props.item, linkUrl: props.linkUrl };
  return React.createElement('div', { 'data-editor': '${name}', 'data-artifact': props.item.artifactId, 'data-revision': props.item.revisionId }, props.item.title);
}`).join('\n'));
const preload = dataModule(`
  export function editorOpenSessionId(item) { return item.artifactId; }
  export function markEditorOpen() {}
  export function ensureHostedEditorPreconnect() {}
  export function installEditorHoverPreload() { return () => {}; }
  export async function loadEditorModuleWithRetry(load) { return load(); }
  export async function preloadEditorFor() { return { codeReady: true, sourceReady: true }; }
  export function registerEditorRouteLoader() {}
  export function scheduleSiteHomeEditorPreload() { return () => {}; }
`);
const view = dataModule(`import React from ${JSON.stringify(reactUrl)};
  export function WorkspaceCard({ entry, onOpen }) { return React.createElement('button', { 'data-card': entry.libraryItem.artifactId, onClick: onOpen }, entry.title); }
  export const WorkspaceListRow = WorkspaceCard;
  export function WorkspaceLibraryEmpty() { return null; }
  export function WorkspaceLibraryEntryViewer({ entry }) { return React.createElement('div', { 'data-preview': entry.libraryItem.artifactId }, entry.title); }
`);
const stubs = {
  '../i18n/ui/useUI': ui,
  './artifact-client': client,
  '../lib/database': dataModule(`export async function uploadFile() { throw new Error('unexpected upload'); }`),
  './WorkspaceSession': session,
  './workbench-material-provider': pass,
  './workbench-open-store': pass,
  './WorkbenchErrorBoundary': pass,
  './AdvancedWorkbenchStage': pass,
  './library-scope': pass,
  './workspace-library-view': view,
  './editor-open-timing': preload,
  './editor-preload': preload,
  'next/navigation': dataModule(`export function usePathname() { return window.location.pathname; }
    export function useRouter() { return { replace: href => { globalThis.__g3library.navigations.push(href); window.history.replaceState(null, '', href); } }; }`),
  'next/dynamic': dataModule(`import React, { Suspense } from ${JSON.stringify(reactUrl)};
    export default function dynamic(load) { const Component = React.lazy(async () => ({ default: await load() }));
      return props => React.createElement(Suspense, { fallback: '正在打开' }, React.createElement(Component, props)); }`),
  '../lib/lazy-with-retry': dataModule(`export const chunkRetryLoader = (id, load) => load; export const withChunkRetry = (id, Component) => Component;`),
  './advanced-routes/WorkbenchRouteLoading': dataModule(`export function WorkbenchRouteLoading() { return null; } export function WorkbenchRouteChunkError() { return null; }`),
  '../lib/auth/client': dataModule(`export function browserClient() { throw new Error('unexpected auth access'); }`),
  '../ui': dataModule(`export function Modal() { return null; } export function SkeletonCard() { return null; } export function EmptyState() { return null; } export function timeAgo() { return ''; }`),
  './StorageCapacityStrip': dataModule(`export function StorageCapacityStrip() { return null; }`),
};
for (const name of routeNames) stubs[`./advanced-routes/${name}`] = routes;
// Keep real ArtifactActions, WorkspaceLibrary, MyLibrary and workbench dispatch.
stubs['./ArtifactActions'] = await compileSubject('src/shell/ArtifactActions.tsx', stubs);
const workbench = await compileSubject('src/shell/AdvancedContentWorkbench.tsx', stubs);
stubs['./AdvancedContentWorkbench'] = workbench;
const library = await compileSubject('src/shell/WorkspaceLibrary.tsx', stubs);
stubs['./WorkspaceLibrary'] = library;
const mine = await compileSubject('src/shell/MyLibrary.tsx', stubs);
stubs['./MyLibrary'] = mine;
const artifactLibrary = await compileModule('src/shell/ArtifactLibrary.tsx', stubs);
const portal = await compileModule('/root/projects/oceanleo/app/library/page.tsx', {
  '@/app/_components/clone-shell': dataModule(`export function CloneShell({ children }) { return children; }`),
  './local-task-panel': dataModule(`export function LocalTaskSlot() { return null; }`),
  '@oceanleo/ui/shell': dataModule(`export { ArtifactLibrary } from ${JSON.stringify(artifactLibrary)}; export function LibraryLocalScopeProvider({ children }) { return children; }`),
});
const { default: LibraryPage } = await import(portal);

function material(kind, artifactType, capability, format, siteId) {
  const artifactId = `g3-${artifactType}`;
  const revisionId = 'g3-revision-1';
  return { key: `artifact:${artifactId}:${revisionId}`, source: 'artifact', id: artifactId, artifactId, revisionId,
    artifactType, title: `G3 ${artifactType} 内容`, kind, siteId, favorite: false, content: '这份素材的内容',
    url: `https://assets.test/${artifactId}.${format}`, previewUrl: `https://assets.test/${artifactId}.png`,
    meta: { workspace_library_surface: 'materials', material_app_bindings: [{ appId: `app-${artifactType}`, siteKey: siteId, position: 0, label: kind, origin: true, role: 'owner' }] },
    artifact: { artifactId, revisionId, artifactType, editorCapability: capability, sourceFormat: format,
      owner: { principalId: 'owner', visibility: 'private', originSiteKey: siteId },
      access: { canRead: true, canPreview: true, canEdit: true, canFork: false, canExportSource: true },
      integrity: { ok: true, reason: '' },
      renditions: { source: { purpose: 'source', revisionId, url: `https://assets.test/${artifactId}.${format}`, digest: 'sha256:g3' },
        preview: { purpose: 'preview', revisionId, url: `https://assets.test/${artifactId}.png` } } } };
}
const CASES = [
  [material('website', 'website', 'website-editor', 'website-source@1', 'website'), 'EmbeddedRoute'],
  [material('ppt', 'deck', 'deck-editor', 'pptx', 'ppt'), 'DeckRoute'],
  [material('document', 'document', 'richdoc-editor', 'docx', 'word'), 'RichDocRoute'],
];

test('清单自检：CASES 覆盖网站、幻灯片、文档三种素材——表变空时下面那批用例会静默不注册', () => {
  assert.equal(CASES.length, 3, `CASES 应覆盖 3 种素材，实测 ${CASES.length} 种`);
  const routes = CASES.map(([, route]) => route);
  assert.equal(new Set(routes).size, routes.length, `CASES 里有重复的路由：${routes}`);
});

for (const [item, route] of CASES) {
  test(`portal library Edit delivers ${item.artifactType} identity to ${route} and stays at its library URL`, async () => {
    const mounted = await mountDom();
    resetLibraryCurrentIdentityForTests();
    globalThis.__g3library = { items: [item], prepared: [], navigations: [], hold: true };
    try {
      assert.equal(editorCapabilityFor(item).available, true);
      await mounted.render(React.createElement(LibraryPage));
      await click(mounted.container.querySelector('[data-card]'));
      assert.equal(mounted.container.querySelector('[data-preview]').dataset.preview, item.artifactId);
      const edit = [...mounted.container.querySelectorAll('button')].find(button => button.getAttribute('aria-label')?.startsWith('编辑「'));
      await click(edit);
      assert.match(edit.textContent, /处理中/);
      assert.equal(Boolean(edit.querySelector('.animate-spin')), true);
      assert.doesNotMatch(mounted.container.textContent, /正在打开编辑器|编辑器已打开/);
      assert.equal(mounted.container.querySelector('[data-editor]'), null);
      await act(async () => { globalThis.__g3library.release(); });
      await act(async () => {});
      const editor = mounted.container.querySelector('[data-editor]');
      assert.equal(editor?.dataset.editor, route);
      assert.equal(editor?.dataset.artifact, item.artifactId);
      assert.equal(editor?.dataset.revision, item.revisionId);
      assert.equal(globalThis.__g3library.editor.item, item);
      assert.equal(globalThis.__g3library.editor.linkUrl, item.url);
      assert.deepEqual(globalThis.__g3library.binding, { appId: 'library', siteId: item.siteId });
      assert.equal(window.location.pathname + window.location.search, `/library?item=${item.artifactId}`);
      assert.deepEqual(globalThis.__g3library.prepared, [{ action: 'edit', id: item.artifactId }]);
      assert.deepEqual(globalThis.__g3library.navigations, []);
      assert.doesNotMatch(mounted.container.textContent, /正在打开编辑器|编辑器已打开|所属网站已下线/);
    } finally { await mounted.close(); delete globalThis.__g3library; resetLibraryCurrentIdentityForTests(); }
  });
}

test('library preparation failure stays on the same material and reports the error', async () => {
  const mounted = await mountDom();
  resetLibraryCurrentIdentityForTests();
  const [item] = CASES[0];
  globalThis.__g3library = { items: [item], prepared: [], navigations: [], fail: true };
  try {
    await mounted.render(React.createElement(LibraryPage));
    await click(mounted.container.querySelector('[data-card]'));
    await click([...mounted.container.querySelectorAll('button')].find(button => button.getAttribute('aria-label')?.startsWith('编辑「')));
    assert.equal(mounted.container.querySelector('[data-editor]'), null);
    assert.equal(mounted.container.querySelector('[data-preview]').dataset.preview, item.artifactId);
    assert.match(mounted.container.querySelector('[role="alert"]')?.textContent || '', /素材读取失败/);
    assert.doesNotMatch(mounted.container.textContent, /编辑器已打开/);
  } finally { await mounted.close(); delete globalThis.__g3library; resetLibraryCurrentIdentityForTests(); }
});


test('owned library detail has no full-width progress or success row while edit is pending and complete', async () => {
  const mounted = await mountDom();
  resetLibraryCurrentIdentityForTests();
  const item = { ...CASES[1][0], meta: {} };
  globalThis.__g3library = { items: [item], prepared: [], navigations: [], hold: true };
  try {
    await mounted.render(React.createElement(LibraryPage));
    await click(mounted.container.querySelector('[data-card]'));
    await click([...mounted.container.querySelectorAll('button')].find(button => button.getAttribute('aria-label')?.startsWith('编辑「')));
    assert.doesNotMatch(mounted.container.textContent, /正在打开编辑器|编辑器已打开/);
    const statusRows = [...mounted.container.querySelectorAll('[role="status"]')].filter(node => !node.classList.contains('sr-only') && !node.closest('button'));
    assert.equal(statusRows.length, 0);
    await act(async () => globalThis.__g3library.release());
    await act(async () => {});
    assert.equal(mounted.container.querySelector('[data-editor]')?.dataset.editor, 'DeckRoute');
    assert.doesNotMatch(mounted.container.textContent, /正在打开编辑器|编辑器已打开/);
  } finally { await mounted.close(); delete globalThis.__g3library; resetLibraryCurrentIdentityForTests(); }
});
