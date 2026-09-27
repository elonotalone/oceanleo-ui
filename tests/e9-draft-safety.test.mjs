import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { compileModule } from './helpers/module-bench.mjs';

async function subject() {
  return import(await compileModule('src/shell/advanced-draft-recovery.ts'));
}

test('portable drafts preserve JSON and reject binary, temporary URLs, lossy objects and excessive size', async () => {
  const { portableAdvancedDraft, ADVANCED_PORTABLE_DRAFT_MAX_BYTES } = await subject();
  const cyclic = {}; cyclic.self = cyclic;
  for (const bad of [new ArrayBuffer(8), new Blob(['x']), new Uint8Array(2), new Map(), new Set(),
    () => 1, cyclic, { nested: ['blob:https://local/1'] }, { number: NaN }, { date: new Date() },
    { text: 'x'.repeat(ADVANCED_PORTABLE_DRAFT_MAX_BYTES) }]) {
    assert.equal(portableAdvancedDraft(bad), null);
  }
  const source = { slides: [{ text: 'hi', size: 12 }], empty: null };
  assert.deepEqual(portableAdvancedDraft(source), source);
  assert.notEqual(portableAdvancedDraft(source), source, 'capture must detach mutable editor state');
});

test('asynchronous capture must receipt the represented revision; cached revision 3 cannot acknowledge revision 4', async () => {
  const { capturePortableAdvancedDraft } = await subject();
  assert.equal(await capturePortableAdvancedDraft({ schema: 'a', capture: async () => ({ text: 'old' }) }, 4), null);
  assert.equal(await capturePortableAdvancedDraft({ schema: 'a', capture: () => null,
    captureRevision: async () => ({ revision: 3, payload: { text: 'old' } }) }, 4), null);
  assert.deepEqual(await capturePortableAdvancedDraft({ schema: 'a', capture: () => null,
    captureRevision: async () => ({ revision: 4, payload: { text: 'new' } }) }, 4), { text: 'new' });
});

// Evaluate the real adapter declaration (including its real capture function),
// not a test-owned imitation of the schema/capture wiring.
function realRecovery(file, bindings) {
  const source = readFileSync(new URL('../src/shell/' + file, import.meta.url), 'utf8');
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let recovery;
  const visit = node => {
    if (ts.isPropertyAssignment(node) && node.name.getText(tree) === 'recovery') recovery = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(tree); assert.ok(recovery);
  const exports = {};
  vm.runInNewContext(ts.transpileModule('exports.recovery = ' + recovery.getText(tree), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText, { exports, ...bindings, structuredClone, advancedRecoveryKey: () => 'real-material', item: {} });
  return exports.recovery;
}

test('three real ordinary recovery adapters declare schemas and capture portable working documents', async () => {
  const { portableAdvancedDraft, draftFromRecovery, capturePortableAdvancedDraft } = await subject();
  const cases = [
    ['advanced-routes/RichDocRoute.tsx', 'oceanleo.richdoc.edit.v1', { type: 'doc', content: [{ type: 'paragraph' }] }],
    ['advanced-routes/Model3DRoute.tsx', 'oceanleo.threed.edit.v1', { azimuth: 1, zoom: 2, materialColor: '#fff' }],
    ['advanced-routes/VideoTimelineRoute.tsx', 'oceanleo.video-timeline.edit.v1', { tracks: [], clips: [] }],
  ];
  for (const [file, schema, payload] of cases) {
    const recovery = realRecovery(file, { editor: { sourceReady: true, editor: { getJSON: () => payload }, restoreRecovery() {}, doc: payload }, history: { snapshot: payload }, restoreWorkingDocument: () => true });
    assert.equal(recovery.draftSchema, schema);
    assert.deepEqual(recovery.capture(), payload);
    assert.deepEqual(await capturePortableAdvancedDraft(draftFromRecovery(recovery), 3), payload);
    assert.deepEqual(portableAdvancedDraft(payload), payload);
  }
});

test('workflow adapter captures its host graph and never claims the unobserved embedded graph as a draft', async () => {
  const { draftFromRecovery, capturePortableAdvancedDraft } = await subject();
  const graph = { nodes: [{ id: 'one', kind: 'input' }], edges: [] };
  const local = realRecovery('workflow-carrier/VideoCanvasStage.tsx', { graph, liveCanvasBase: '' });
  assert.deepEqual(await capturePortableAdvancedDraft(draftFromRecovery(local), 1), graph);
  const embedded = realRecovery('workflow-carrier/VideoCanvasStage.tsx', { graph, liveCanvasBase: 'https://video.oceanleo.app' });
  assert.equal(draftFromRecovery(embedded), undefined);
});
