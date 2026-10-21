import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { mountRoute } from './e9-richdoc-harness.mjs';
import { collectRichDocText, deriveEditorHandoffFromItem } from '../src/shell/advanced-routes/richdoc-pro-source.ts';

async function hostReady(saveOverride) {
  const host = mountRoute(saveOverride);
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  host.render();
  host.message({ type: 'ready' }); host.render();
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
  host.render();
  return host;
}

async function edit(host, revision) {
  host.message({ type: 'dirty', dirty: true, revision });
  host.render();
  await new Promise(resolve => setImmediate(resolve));
}

function saveReceipt(payload, revisionId) {
  return {
    ok: true,
    item: {
      key: 'doc', id: 'doc', artifactId: 'art-1', revisionId,
      title: 'Hosted document', kind: 'document', siteId: 'word',
      content: JSON.stringify(payload), meta: {},
    },
  };
}

// UC-6: docs/architecture/oceanleo-untrusted-content-isolation.md §8.3.
// Keep RichDoc recovery on the existing exact origin + frame source + instance gate.
test('RichDoc recovery source keeps the closed postMessage origin/source/instance gate', () => {
  const source = readFileSync('src/shell/advanced-routes/RichDocHostedRoute.tsx', 'utf8');
  assert.match(source, /acceptEditorFrameMessage\(event,\s*\{\s*expectedOrigin:\s*editorOrigin,\s*frameWindow:\s*iframeRef\.current\?\.contentWindow,\s*instanceId,/);
  assert.match(source, /if\s*\(!frame\s*\|\|\s*!isValidEditorTargetOrigin\(editorOrigin\)\)\s*return false/);
  assert.match(source, /frame\.postMessage\(envelope,\s*editorOrigin\)/);
  assert.doesNotMatch(source, /frame\.postMessage\(envelope,\s*["']\*["']\)/);
});

test('real RichDoc pro adapter waits for revision 4 and rejects a revision 3 snapshot', async () => {
  const host = await hostReady();
  try {
    for (let revision = 1; revision <= 3; revision++) host.message({ type: 'dirty', dirty: true, revision });
    let request = host.posted.findLast(m => m.type === 'recovery-capture');
    host.message({ type: 'recovery-snapshot', recoveryId: request.recoveryId, ok: true, snapshot: { revision: 3, payload: { text: 'third' } } });
    host.message({ type: 'dirty', dirty: true, revision: 4 });
    const adapter = host.render();
    assert.equal(adapter.persistence.draft.schema, 'oceanleo.richdoc.edit.v1');
    let finished = false;
    const capture = adapter.persistence.draft.captureRevision(4).then(value => { finished = true; return value; });
    request = host.posted.findLast(m => m.type === 'recovery-capture');
    host.message({ type: 'recovery-snapshot', recoveryId: request.recoveryId, ok: true, snapshot: { revision: 3, payload: { text: 'third' } } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(finished, false);
    host.message({ type: 'recovery-snapshot', recoveryId: request.recoveryId, ok: true, snapshot: { revision: 4, payload: { text: 'fourth' } } });
    assert.deepEqual(JSON.parse(JSON.stringify(await capture)), { revision: 4, payload: { text: 'fourth' } });
  } finally { host.unmount(); }
});

test('real RichDoc pro restore waits for the iframe receipt then captures the restored document', async () => {
  const host = await hostReady();
  try {
    const recovery = host.render().persistence.recovery;
    let finished = false;
    const restore = recovery.restore({ type: 'doc', text: 'restored' }).then(value => { finished = true; return value; });
    const request = host.posted.findLast(m => m.type === 'recovery-restore');
    assert.ok(request);
    await new Promise(resolve => setImmediate(resolve)); assert.equal(finished, false);
    host.message({ type: 'recovery-result', recoveryId: request.recoveryId, ok: true, revision: 8 });
    assert.equal(await restore, true);
    const next = host.render(); assert.equal(next.persistence.dirty, true);
    const captured = await next.persistence.draft.captureRevision(next.persistence.editRevision);
    assert.equal(captured.payload.text, 'restored');
    assert.equal(captured.revision, next.persistence.editRevision);
  } finally { host.unmount(); }
});

test('RichDoc save keeps its in-flight capture across a newer edit and commits/reopens the latest snapshot', async () => {
  const savedPayloads = [];
  const host = await hostReady(async ({ payload }) => {
    savedPayloads.push(payload);
    return {
      ok: true,
      item: {
        key: 'doc', id: 'doc', artifactId: 'art-1', revisionId: 'rev-2',
        title: 'Hosted document', kind: 'document', siteId: 'word', favorite: false,
        content: JSON.stringify(payload), meta: {},
      },
    };
  });
  try {
    const prior = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'before' }] }] };
    const latest = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'latest', marks: [{ type: 'bold' }, { type: 'textStyle', attrs: { fontSize: '28px' } }] }] }] };
    host.message({ type: 'dirty', dirty: true, revision: 1 });
    const adapter = host.render();
    assert.equal(adapter.persistence.dirty, true, 'dirty event should be accepted for the loaded source');
    await new Promise(resolve => setImmediate(resolve));
    const saving = adapter.persistence.flush();
    const saveCapture = host.posted.findLast(m => m.type === 'recovery-capture' && m.recoveryId.startsWith('save-'));
    assert.ok(saveCapture, `flush must request the current editor snapshot: ${JSON.stringify(host.posted)}`);

    host.message({ type: 'dirty', dirty: true, revision: 2 });
    const latestCacheCapture = host.posted.findLast(m => m.type === 'recovery-capture' && m.recoveryId.startsWith('rd-cache-'));
    assert.ok(latestCacheCapture);
    host.message({ type: 'recovery-snapshot', ok: true, recoveryId: latestCacheCapture.recoveryId, snapshot: { revision: 2, payload: latest } });
    host.message({ type: 'recovery-snapshot', ok: true, recoveryId: saveCapture.recoveryId, snapshot: { revision: 1, payload: prior } });

    const result = await saving;
    assert.equal(result.ok, true, result.error);
    assert.deepEqual(JSON.parse(JSON.stringify(savedPayloads)), [latest]);
    assert.equal(host.reports.length, 1);
    assert.equal(host.reports[0].revisionId, 'rev-2');
    const reopened = deriveEditorHandoffFromItem(host.reports[0]);
    assert.equal(reopened.kind, 'inline');
    assert.equal(collectRichDocText(reopened.json), 'latest');
  } finally { host.unmount(); }
});

test('RichDoc Umo explicit capture survives a later dirty generation and settles only after latest receipt', async () => {
  const savedPayloads = [];
  let releaseFirstSave;
  const firstSave = new Promise(resolve => { releaseFirstSave = resolve; });
  const host = await hostReady(async ({ payload }) => {
    savedPayloads.push(payload);
    if (savedPayloads.length === 1) return firstSave;
    return saveReceipt(payload, 'rev-3');
  });
  const nativeSaveId = 'umo-save-explicit-race';
  const prior = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'before' }] }] };
  const latest = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'latest', marks: [{ type: 'bold' }, { type: 'textStyle', attrs: { fontSize: '28px' } }] }] }] };
  try {
    await edit(host, 1);
    const cache1 = host.posted.findLast(m => m.type === 'recovery-capture' && m.recoveryId.startsWith('rd-cache-'));
    host.message({ type: 'recovery-snapshot', ok: true, recoveryId: cache1.recoveryId, snapshot: { revision: 1, payload: prior } });
    host.message({ type: 'recovery-snapshot', ok: true, recoveryId: nativeSaveId, snapshot: { revision: 1, payload: prior } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(savedPayloads.length, 1, 'native Umo save should reach the durable producer');

    await edit(host, 2);
    const cache2 = host.posted.findLast(m => m.type === 'recovery-capture' && m.recoveryId.startsWith('rd-cache-'));
    host.message({ type: 'recovery-snapshot', ok: true, recoveryId: cache2.recoveryId, snapshot: { revision: 2, payload: latest } });
    releaseFirstSave(saveReceipt(prior, 'rev-2'));

    for (let i = 0; i < 30 && !host.posted.some(m => m.type === 'save-result' && m.saveId === nativeSaveId); i += 1) {
      await new Promise(resolve => setImmediate(resolve));
    }
    const nativeResult = host.posted.findLast(m => m.type === 'save-result' && m.saveId === nativeSaveId);
    assert.ok(nativeResult, 'the original explicit save request id must settle after recapturing the later generation');
    assert.equal(nativeResult.ok, true, nativeResult.message);
    assert.deepEqual(JSON.parse(JSON.stringify(savedPayloads)), [prior, latest]);
    assert.equal(host.reports.length, 1);
    assert.equal(host.reports[0].revisionId, 'rev-3');
    const reopened = deriveEditorHandoffFromItem(host.reports[0]);
    assert.equal(reopened.kind, 'inline');
    assert.equal(collectRichDocText(reopened.json), 'latest');
  } finally { host.unmount(); }
});

test('RichDoc explicit Umo capture failure is returned immediately and does not call persistence', async () => {
  const savedPayloads = [];
  const host = await hostReady(async ({ payload }) => {
    savedPayloads.push(payload);
    return saveReceipt(payload, 'rev-2');
  });
  try {
    await edit(host, 1);
    const saveId = 'umo-save-editor-not-ready';
    host.message({ type: 'recovery-snapshot', ok: false, recoveryId: saveId, message: 'editor not ready' });
    const result = host.posted.findLast(m => m.type === 'save-result' && m.saveId === saveId);
    assert.ok(result);
    assert.equal(result.ok, false);
    assert.equal(result.message, 'editor not ready');
    assert.deepEqual(savedPayloads, []);
    assert.equal(host.adapter().persistence.dirty, true);
  } finally { host.unmount(); }
});

test('RichDoc explicit native save refuses a snapshot from an earlier editor revision', async () => {
  const savedPayloads = [];
  const host = await hostReady(async ({ payload }) => {
    savedPayloads.push(payload);
    return saveReceipt(payload, 'rev-2');
  });
  try {
    await edit(host, 1);
    await edit(host, 2);
    const saveId = 'umo-save-stale-revision';
    host.message({
      type: 'recovery-snapshot', ok: true, recoveryId: saveId,
      snapshot: { revision: 1, payload: { type: 'doc', text: 'stale' } },
    });
    const result = host.posted.findLast(m => m.type === 'save-result' && m.saveId === saveId);
    assert.ok(result);
    assert.equal(result.ok, false);
    assert.match(result.message, /较早版本/);
    assert.deepEqual(savedPayloads, []);
    assert.equal(host.adapter().persistence.dirty, true);
  } finally { host.unmount(); }
});

test('RichDoc rejects a mismatched in-flight save revision and keeps the latest dirty payload retryable', async () => {
  const savedPayloads = [];
  const host = await hostReady(async ({ payload }) => {
    savedPayloads.push(payload);
    return saveReceipt(payload, 'rev-2');
  });
  const latest = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'latest only' }] }] };
  try {
    await edit(host, 1);
    const adapter = host.render();
    const saving = adapter.persistence.flush();
    const saveCapture = host.posted.findLast(m => m.type === 'recovery-capture' && m.recoveryId.startsWith('save-'));
    assert.ok(saveCapture);
    await edit(host, 2);
    const cache = host.posted.findLast(m => m.type === 'recovery-capture' && m.recoveryId.startsWith('rd-cache-'));
    host.message({ type: 'recovery-snapshot', ok: true, recoveryId: saveCapture.recoveryId, snapshot: { revision: 2, payload: { type: 'doc', text: 'mismatched' } } });
    const failed = await saving;
    assert.equal(failed.ok, false);
    assert.match(failed.error, /不匹配/);
    assert.deepEqual(savedPayloads, []);

    host.message({ type: 'recovery-snapshot', ok: true, recoveryId: cache.recoveryId, snapshot: { revision: 2, payload: latest } });
    const retried = await host.adapter().persistence.flush();
    assert.equal(retried.ok, true, `${retried.error}; posted=${JSON.stringify(host.posted)}`);
    assert.deepEqual(JSON.parse(JSON.stringify(savedPayloads)), [latest]);
  } finally { host.unmount(); }
});

test('RichDoc cancels a pending save capture on document switch without persisting across scopes', async () => {
  const savedPayloads = [];
  const host = await hostReady(async ({ payload }) => {
    savedPayloads.push(payload);
    return saveReceipt(payload, 'rev-2');
  });
  try {
    await edit(host, 1);
    const saving = host.adapter().persistence.flush();
    assert.ok(host.posted.findLast(m => m.type === 'recovery-capture' && m.recoveryId.startsWith('save-')));
    host.setItem({ key: 'other-doc', id: 'other-doc', title: 'Another document' });
    assert.equal(host.currentItem().key, 'other-doc');
    host.render();
    await new Promise(resolve => setImmediate(resolve));
    const result = await saving;
    assert.equal(result.ok, false);
    assert.match(result.error, /切换|取消/);
    assert.deepEqual(savedPayloads, []);
  } finally { host.unmount(); }
});

test('RichDoc ignores a late cache snapshot from the prior document when generation resets', async () => {
  const saveCalls = [];
  const host = await hostReady(async ({ item, payload }) => {
    saveCalls.push({ itemKey: item.key, payload });
    return saveReceipt(payload, 'rev-b2');
  });
  const payloadA = { type: 'doc', text: 'A-payload' };
  const payloadB = { type: 'doc', text: 'B-payload' };
  try {
    await edit(host, 1);
    const captureA = host.posted.findLast(m => m.type === 'recovery-capture' && m.recoveryId.startsWith('rd-cache-'));
    assert.ok(captureA);

    host.setItem({ key: 'document-B', id: 'document-B', title: 'Document B' });
    host.render();
    await new Promise(resolve => setImmediate(resolve));
    host.message({ type: 'ready' });
    host.render();
    await Promise.resolve();
    await edit(host, 1);
    const captureB = host.posted.findLast(m => m.type === 'recovery-capture' && m.recoveryId.startsWith('rd-cache-'));
    assert.ok(captureB);
    assert.notEqual(captureA.recoveryId, captureB.recoveryId, 'recovery IDs must distinguish document scopes even when instance and revision are reused');

    // Delayed A data uses the same editor revision as B but must not satisfy B's cache request.
    host.message({ type: 'recovery-snapshot', ok: true, recoveryId: captureA.recoveryId, snapshot: { revision: 1, payload: payloadA } });
    const saving = host.adapter().persistence.flush();
    const saveCapture = host.posted.findLast(m => m.type === 'recovery-capture' && m.recoveryId.startsWith('save-'));
    assert.ok(saveCapture, 'A late cache response must not make B look already captured');
    host.message({ type: 'recovery-snapshot', ok: true, recoveryId: saveCapture.recoveryId, snapshot: { revision: 1, payload: payloadB } });

    const result = await saving;
    assert.equal(result.ok, true, result.error);
    assert.deepEqual(saveCalls.map(call => call.itemKey), ['document-B']);
    assert.deepEqual(JSON.parse(JSON.stringify(saveCalls.map(call => call.payload))), [payloadB]);
  } finally { host.unmount(); }
});

test('RichDoc unmount cancels the gate and never reports an unconfirmed write', async () => {
  const savedPayloads = [];
  const host = await hostReady(async ({ payload }) => {
    savedPayloads.push(payload);
    return saveReceipt(payload, 'rev-2');
  });
  await edit(host, 1);
  const saving = host.adapter().persistence.flush();
  assert.ok(host.posted.findLast(m => m.type === 'recovery-capture' && m.recoveryId.startsWith('save-')));
  host.unmount();
  const result = await saving;
  assert.equal(result.ok, false);
  assert.match(result.error, /关闭|取消/);
  assert.deepEqual(savedPayloads, []);
});

test('RichDoc rejects foreign origin, source, or instance messages before dirty/save handling', async () => {
  const savedPayloads = [];
  const host = await hostReady(async ({ payload }) => {
    savedPayloads.push(payload);
    return saveReceipt(payload, 'rev-2');
  });
  try {
    const dirty = { type: 'dirty', dirty: true, revision: 1 };
    host.message(dirty, { origin: 'https://foreign.example' });
    host.message(dirty, { source: {} });
    host.message(dirty, { data: { protocol: 'p', instanceId: 'foreign-instance', ...dirty } });
    assert.equal(host.adapter().persistence.dirty, false);
    assert.equal(host.posted.some(m => m.type === 'recovery-capture'), false);
    assert.deepEqual(savedPayloads, []);
  } finally { host.unmount(); }
});

test('RichDoc save retries a transient conflict result without clearing dirty or overlapping writes', async () => {
  let calls = 0;
  let releaseSave;
  const delayed = new Promise(resolve => { releaseSave = resolve; });
  const savedPayloads = [];
  const host = await hostReady(async ({ payload }) => {
    calls += 1;
    savedPayloads.push(payload);
    if (calls === 1) return delayed;
    if (calls === 2) return { ok: false, error: 'revision conflict' };
    return saveReceipt(payload, 'rev-2');
  });
  const payload = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'retry me' }] }] };
  try {
    await edit(host, 1);
    const cache = host.posted.findLast(m => m.type === 'recovery-capture' && m.recoveryId.startsWith('rd-cache-'));
    host.message({ type: 'recovery-snapshot', ok: true, recoveryId: cache.recoveryId, snapshot: { revision: 1, payload } });
    const adapter = host.render();
    const first = adapter.persistence.flush();
    const overlapping = adapter.persistence.flush();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1);
    releaseSave(saveReceipt(payload, 'rev-1'));
    assert.equal((await first).ok, true);
    assert.equal((await overlapping).ok, true);
    assert.equal(calls, 1, 'overlapping flush callers share one durable write');

    // A subsequent generation encounters conflict; dirty state and cached source survive for a user retry.
    await edit(host, 2);
    const cache2 = host.posted.findLast(m => m.type === 'recovery-capture' && m.recoveryId.startsWith('rd-cache-'));
    host.message({ type: 'recovery-snapshot', ok: true, recoveryId: cache2.recoveryId, snapshot: { revision: 2, payload } });
    const conflict = await host.render().persistence.flush();
    assert.equal(conflict.ok, false);
    assert.match(conflict.error, /revision conflict/);
    assert.equal(host.adapter().persistence.dirty, true);
    const retry = await host.adapter().persistence.flush();
    assert.equal(retry.ok, true, retry.error);
    assert.equal(calls, 3);
    assert.deepEqual(JSON.parse(JSON.stringify(savedPayloads)), [payload, payload, payload]);
  } finally { host.unmount(); }
});
