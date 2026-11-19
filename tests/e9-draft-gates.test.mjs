import test from 'node:test';
import assert from 'node:assert/strict';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
import { afterAdvancedDraftExport, bindAdvancedDraftGate, flushAdvancedDraftGate } from '../src/shell/advanced-draft-gates.ts';

const handoff = await import(await compileModule('src/shell/advanced-routes/editor-handoff.ts', {
  '../office-editor/useOfficeArtifactSource': dataModule('export function useOfficeArtifactSource() { return {}; }'),
}));

test('the export gate waits for a durable revision and preserves a failed receipt', async () => {
  assert.equal(flushAdvancedDraftGate('missing', 'export'), null);
  let release;
  const unbind = bindAdvancedDraftGate('agent-gate-root', reason => {
    assert.equal(reason, 'export');
    return new Promise(resolve => { release = resolve; });
  });
  try {
    let done = false;
    const saving = flushAdvancedDraftGate('agent-gate-root', 'export').then(result => { done = true; return result; });
    await Promise.resolve();
    assert.equal(done, false);
    release({ ok: false, error: 'Task snapshot rejected' });
    assert.deepEqual(await saving, { ok: false, error: 'Task snapshot rejected' });
    const retry = flushAdvancedDraftGate('agent-gate-root', 'export');
    release({ ok: true, item: { artifactId: 'agent-gate-root', revisionId: 'r2' } });
    assert.equal((await retry).item.revisionId, 'r2');
  } finally { unbind(); }
});

test('a stale gate cleanup cannot unregister a newer workbench for the same artifact', async () => {
  let oldCalls = 0;
  const old = bindAdvancedDraftGate('same-root', async () => { oldCalls++; return { ok: true }; });
  const current = bindAdvancedDraftGate('same-root', async () => ({ ok: false, error: 'local snapshot failed' }));
  try {
    old();
    assert.deepEqual(await flushAdvancedDraftGate('same-root', 'export'), { ok: false, error: 'local snapshot failed' });
    assert.equal(oldCalls, 0);
  } finally { current(); old(); }
  assert.equal(flushAdvancedDraftGate('same-root'), null);
});

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

test('failed draft recovery/version gate still blocks mode entry when the normal face has no document; leave-pro never locks', async () => {
  const item = { id: 'e9-failed-gate', key: 'e9-failed-gate', meta: {} };
  const normal = handoff.bindNormalFaceHandoff(item.key, { getHandoff: () => ({ kind: 'empty' }) });
  let gateCalls = 0;
  const gate = bindAdvancedDraftGate(item.key, async () => {
    gateCalls += 1;
    return { ok: false, error: 'restore first' };
  });
  try {
    assert.equal((await handoff.captureBeforeEnterPro(item)).ok, false);
    assert.equal(await handoff.saveBeforeLeavePro(item.key), true);
    await Promise.resolve();
    assert.ok(gateCalls >= 2, 'leave-pro must kick the same draft gate even when it fails');
  } finally { gate(); normal(); }
});

test('failed cloud save still enters pro from the in-memory document already on screen', async () => {
  const item = { id: 'e9-failed-memory', key: 'e9-failed-memory', meta: {} };
  const normal = handoff.bindNormalFaceHandoff(item.key, {
    getHandoff: () => ({ kind: 'inline', json: { text: 'on screen' }, revision: 3 }),
  });
  const gate = bindAdvancedDraftGate(item.key, async () => ({ ok: false, error: 'editor revision save failed' }));
  try {
    const result = await handoff.captureBeforeEnterPro(item);
    assert.equal(result.ok, true);
    assert.equal(result.handoff.kind, 'inline');
    assert.equal(result.handoff.json.text, 'on screen');
  } finally { gate(); normal(); }
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
