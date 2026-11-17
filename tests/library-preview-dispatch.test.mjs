import './helpers/w1-jsdom-window.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ts from 'typescript';
import { normalizeLibraryPreview, normalizeLibraryFacts, normalizeArtifactProjection } from '../src/shell/artifact-contract.ts';
import { artifactProjectionToLibraryItem } from '../src/shell/library-data.ts';

const path = new URL('../src/shell/library-viewers.tsx', import.meta.url);
const source = ts.createSourceFile(path.pathname, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = source.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === 'LibraryItemViewerBody');
const js = ts.transpileModule(declaration.getText(source).replace('export ', ''), { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const stub = kind => props => React.createElement('div', { 'data-viewer': kind, 'data-url': props.src || props.fullUrl || props.url || props.item?.url || '', 'data-mode': props.mode || '', 'data-key': props.item?.key || '' });
let calls = 0;
const Viewer = new Function('deps', `const {React,useState,useEffect,useRef,useUI,getArtifactItem,NativeLibraryItemViewerBody,DownloadOnlyFileCard,LoadingView,LibraryPdfReader,Center,ProgressiveArtifactImage,LibraryMediaPreview,ThreeDViewer,AttachmentFileViewer,Suspense,fetchItemSourceBlob,libraryMediaGeometry}=deps;${js};return LibraryItemViewerBody;`)({
  React, ...React, useUI: () => s => s, getArtifactItem: async () => { calls++; return { ok: true, data: { ...base, preview: { state: 'ready', kind: 'image', url: '/ready.png' } } }; },
  NativeLibraryItemViewerBody: stub('native'), DownloadOnlyFileCard: stub('download'), LoadingView: stub('loading'), LibraryPdfReader: stub('pdf'),
  Center: ({ children }) => children, ProgressiveArtifactImage: stub('image'), LibraryMediaPreview: props => stub(props.kind)(props),
  ThreeDViewer: stub('model'), AttachmentFileViewer: stub('file'), fetchItemSourceBlob: () => {}, libraryMediaGeometry: () => ({}),
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const base = { key: 'one:r1', id: 'one', artifactId: 'one', revisionId: 'r1', title: 'Old Office.doc', kind: 'document', source: 'artifact', siteId: '', favorite: false, url: '/original.doc', meta: {} };
for (const kind of ['pdf','image','video','audio','model','tree','text','native']) test(`saved preview.kind=${kind} selects its viewer independently of source extension`, async () => {
  const node = document.createElement('div'), root = createRoot(node);
  await act(async () => root.render(React.createElement(Viewer, { item: { ...base, preview: { state: 'ready', kind, url: `/derived.${kind}` } } })));
  assert.equal(node.querySelector('[data-viewer]')?.dataset.viewer, ['tree','text'].includes(kind) ? 'file' : kind);
  if (['tree','text'].includes(kind)) assert.equal(node.querySelector('[data-viewer]').dataset.mode, kind);
  if (['image','video','audio','model'].includes(kind)) assert.equal(node.querySelector('[data-viewer]').dataset.url, `/derived.${kind}`);
  await act(async () => root.unmount());
});
test('unavailable is download-only and a ready preview without a URL is also download-only', async () => {
  const node = document.createElement('div'), root = createRoot(node);
  for (const preview of [{ state: 'unavailable', kind: 'native' }, { state: 'ready', kind: 'pdf' }]) {
    await act(async () => root.render(React.createElement(Viewer, { item: { ...base, preview } })));
    assert.equal(node.querySelector('[data-viewer]').dataset.viewer, 'download');
    assert.equal(node.querySelector('[role="alert"]'), null);
  }
  await act(async () => root.unmount());
});
test('pending refreshes the same saved revision then shows the derived preview', async () => {
  const timers = [], original = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  const node = document.createElement('div'), root = createRoot(node);
  try {
    await act(async () => root.render(React.createElement(Viewer, { item: { ...base, preview: { state: 'pending', kind: 'pdf' } } })));
    assert.match(node.textContent, /正在准备文件预览/); assert.equal(calls, 0);
    await act(async () => timers.find(t => t.ms === 2000).fn());
    assert.equal(calls, 1); assert.equal(node.querySelector('[data-viewer]').dataset.viewer, 'image');
  } finally { await act(async () => root.unmount()); globalThis.setTimeout = original; }
});
test('preview/facts normalizers retain only valid stored facts', () => {
  assert.deepEqual(normalizeLibraryPreview({ state: 'pending', kind: 'pdf' }), { state: 'pending', kind: 'pdf' });
  assert.equal(normalizeLibraryPreview({ state: 'ready', kind: 'html' }), undefined);
  assert.deepEqual(normalizeLibraryFacts({ width: 1200, height: 800, durationSeconds: 5, pages: 3, faces: 2, bpm: 180, bad: Infinity }), { durationSeconds: 5, width: 1200, height: 800, pages: 3 });
  assert.deepEqual(normalizeLibraryFacts({ width: -1, height: '800', pages: NaN }), {});
});
test('wire preview/facts survive both projection normalizer and Library item mapping', () => {
  const raw = { schema: 'oceanleo.artifact.v1', artifactId: 'a', revisionId: 'r', artifactType: 'document', sourceFormat: 'doc', title: 'file',
    owner: { principalId: 'owner', visibility: 'private' }, access: { canRead: true, canPreview: true, canEdit: false, canFork: false, canInsert: false, canReplace: false, canFavorite: false, canBind: false, canExportSource: true }, roles: [],
    preview: { state: 'ready', kind: 'pdf', url: 'https://files.test/derived.pdf' }, facts: { pages: 9 }, renditions: {} };
  const projection = normalizeArtifactProjection(raw); assert.ok(projection);
  const item = artifactProjectionToLibraryItem(projection);
  assert.deepEqual(item.preview, raw.preview); assert.deepEqual(item.facts, raw.facts);
});

test('LeoBay origin items use the same preview contract and preserve the original file URL', () => {
  const text = readFileSync(new URL('../src/shell/bay/asset/BayAssetDetail.tsx', import.meta.url), 'utf8');
  const file = ts.createSourceFile('origin.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = file.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === 'bayOriginViewerItem');
  const compiled = ts.transpileModule(declaration.getText(file).replace('export ', ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const convert = new Function('safeHttpUrl','assetFormat','assetFileName', compiled + ';return bayOriginViewerItem;')(
    value => /^https?:\/\//.test(value || '') ? value : '', asset => asset.format || '', asset => asset.title);
  const item = convert({ id: 'old-office', type: 'document', title: 'Contract.doc', full_url: 'https://files.test/contract.doc', preview_url: 'https://files.test/contract.pdf', format: 'doc', file_size: 42 });
  assert.equal(item.kind, 'document');assert.equal(item.url, 'https://files.test/contract.doc');assert.equal(item.preview.kind, 'pdf');assert.equal(item.preview.url, 'https://files.test/contract.pdf');
  assert.match(text, /<LibraryItemViewer item=\{bayOriginViewerItem\(full\)\}/);
  assert.doesNotMatch(text, /function (?:PptPager|DocumentPreview|ChartFrame)/);
});
