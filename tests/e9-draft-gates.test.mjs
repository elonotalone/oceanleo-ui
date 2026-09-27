import test from 'node:test';
import assert from 'node:assert/strict';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
import { afterAdvancedDraftExport, bindAdvancedDraftGate } from '../src/shell/advanced-draft-gates.ts';
import { advancedDraftAfterVersion } from '../src/shell/advanced-draft.ts';

const handoff = await import(await compileModule('src/shell/advanced-routes/editor-handoff.ts', {
  '../office-editor/useOfficeArtifactSource': dataModule('export function useOfficeArtifactSource() { return {}; }'),
}));

test('mode entry awaits version/session gate and does not bypass it through legacy background save', async () => {
  let release, legacy = 0;
  const item = { id: 'e9-gate-item', key: 'e9-gate-item', meta: {} };
  const normal = handoff.bindNormalFaceHandoff(item.key, {
    getHandoff: () => ({ kind: 'inline', json: { text: 'latest' }, revision: 4 }),
    persistInBackground: () => { legacy++; },
  });
  const gate = bindAdvancedDraftGate(item.key, () => new Promise(resolve => { release = resolve; }));
  try {
    let done = false;
    const entering = handoff.captureBeforeEnterPro(item).then(value => { done = true; return value; });
    await Promise.resolve(); assert.equal(done, false); assert.equal(legacy, 0);
    release({ ok: true, item: { ...item, revisionId: 'committed-version' } });
    assert.equal((await entering).item.revisionId, 'committed-version');
    assert.equal(legacy, 0);
  } finally { gate(); normal(); }
});

test('failed draft recovery/version gate blocks both mode entry and mode exit', async () => {
  const item = { id: 'e9-failed-gate', key: 'e9-failed-gate', meta: {} };
  const normal = handoff.bindNormalFaceHandoff(item.key, { getHandoff: () => ({ kind: 'inline', json: {} }) });
  const gate = bindAdvancedDraftGate(item.key, async () => ({ ok: false, error: 'restore first' }));
  try {
    assert.equal((await handoff.captureBeforeEnterPro(item)).ok, false);
    assert.equal(await handoff.saveBeforeLeavePro(item.key), false);
  } finally { gate(); normal(); }
});

test('complete version clears a restored receipt despite restarted editor counter, preserving a later or foreign draft', () => {
  const pointer = { rootId: 'r', baseRevisionId: 'base', schema: 'oceanleo.richdoc.edit.v1', editRevision: 7, savedAt: '2026-09-27T00:00:00Z', url: 'https://files.example/seven.json' };
  const coverage = { schema: pointer.schema, restored: pointer };
  assert.equal(advancedDraftAfterVersion(pointer, 7, 'base', coverage), pointer,
    'a session-only graph save must not erase its only durable working document');
  assert.equal(advancedDraftAfterVersion(pointer, 1, 'new-base', coverage), null);
  const newer = { ...pointer, editRevision: 2, url: 'https://files.example/newer.json' };
  assert.equal(advancedDraftAfterVersion(newer, 1, 'new-base', coverage).url, newer.url);
  const otherFace = { ...pointer, schema: 'oceanleo.richdoc.pro.v1', editRevision: 1 };
  assert.equal(advancedDraftAfterVersion(otherFace, 99, 'new-base', coverage).schema, otherFace.schema);
});

test('download waits for full version and session confirmation and stops on failure', async () => {
  let release, downloads = 0;
  const unbind = bindAdvancedDraftGate('e9-download', reason => {
    assert.equal(reason, 'export');
    return new Promise(resolve => { release = resolve; });
  });
  try {
    const failed = afterAdvancedDraftExport('e9-download', () => { downloads++; });
    assert.equal(downloads, 0); release({ ok: false }); await failed; assert.equal(downloads, 0);
    const success = afterAdvancedDraftExport('e9-download', () => { downloads++; });
    assert.equal(downloads, 0); release({ ok: true }); await success; assert.equal(downloads, 1);
  } finally { unbind(); }
});
