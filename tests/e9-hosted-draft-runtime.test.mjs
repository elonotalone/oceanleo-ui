import test from 'node:test';
import assert from 'node:assert/strict';
import { mountRoute } from './e9-richdoc-harness.mjs';

async function hostReady() {
  const host = mountRoute();
  await new Promise(resolve => setImmediate(resolve));
  host.message({ type: 'ready' }); host.render();
  return host;
}

test('real RichDoc pro adapter waits for revision 4 and rejects a revision 3 snapshot', async () => {
  const host = await hostReady();
  try {
    for (let revision = 1; revision <= 3; revision++) host.message({ type: 'dirty', dirty: true, revision });
    let request = host.posted.findLast(m => m.type === 'recovery-capture');
    host.message({ type: 'recovery-snapshot', recoveryId: request.recoveryId, ok: true, snapshot: { revision: 3, payload: { text: 'third' } } });
    host.message({ type: 'dirty', dirty: true, revision: 4 });
    const adapter = host.render();
    assert.equal(adapter.persistence.draft.schema, 'oceanleo.richdoc.pro.v1');
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
