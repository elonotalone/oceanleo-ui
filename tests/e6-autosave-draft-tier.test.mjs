import assert from 'node:assert/strict';
import test from 'node:test';
import { AdvancedPersistenceController } from '../src/shell/advanced-persistence-controller.ts';

const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
class Clock {
  now = 0; next = 0; timers = new Map();
  setTimeout = (callback, delay) => { const id = ++this.next; this.timers.set(id, { at: this.now + delay, callback }); return id; };
  clearTimeout = id => this.timers.delete(id);
  async advance(ms) {
    const end = this.now + ms;
    for (;;) {
      const due = [...this.timers].filter(([, t]) => t.at <= end).sort((a,b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.timers.delete(due[0]); this.now = due[1].at; due[1].callback(); await settle();
    }
    this.now = end; await settle();
  }
}
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function fixture(extra = {}) {
  const clock = new Clock(), drafts = [], versions = [], states = [], records = [];
  const controller = new AdvancedPersistenceController({
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    onStateChange: s => states.push(s),
    draft: { saveRevision: async r => { drafts.push(r); return true; } },
    flushRevision: async r => { versions.push(r); return { ok: true, item: { id: `v${r}` } }; },
    recordSavedItem: async (item, revision) => { records.push([item.id, revision]); return true; },
    ...extra,
  });
  controller.observe({ revision: 0, dirty: false });
  return { controller, clock, drafts, versions, states, records };
}
test('draft acknowledgement reports saved after 400ms without exporting a version', async () => {
  const f = fixture();
  f.controller.observe({ revision: 1, dirty: true });
  await f.clock.advance(399); assert.deepEqual(f.drafts, []);
  await f.clock.advance(1);
  assert.deepEqual(f.drafts, [1]);
  assert.equal(f.controller.snapshot().state, 'saved');
  assert.deepEqual(f.versions, []);
  assert.equal(f.controller.hasUnconfirmedWork(), true, 'the complete version still needs to be published');
  f.controller.dispose();
});
test('version generation waits 20 seconds after the last acknowledged draft', async () => {
  const f = fixture();
  f.controller.observe({ revision: 1, dirty: true });
  await f.clock.advance(400);
  await f.clock.advance(19_999);
  assert.deepEqual(f.versions, []);
  await f.clock.advance(1);
  assert.deepEqual(f.versions, [1]);
  assert.equal(f.controller.snapshot().state, 'saved');
  assert.equal(f.controller.hasUnconfirmedWork(), false);
  f.controller.dispose();
});

test('new edits reach the draft tier while the previous version is still exporting', async () => {
  const pending = deferred(), versions = [];
  const f = fixture({ flushRevision: async r => { versions.push(r); return pending.promise; } });
  f.controller.observe({ revision: 1, dirty: true });
  await f.clock.advance(20_400);
  assert.deepEqual(versions, [1]);
  assert.equal(f.controller.snapshot().state, 'saved');
  f.controller.observe({ revision: 2, dirty: true });
  await f.clock.advance(400);
  assert.deepEqual(f.drafts, [1, 2]);
  assert.equal(f.controller.snapshot().acknowledgedRevision, 2);
  assert.equal(f.controller.snapshot().state, 'saved');
  pending.resolve({ ok: true, item: { id: 'v1' } }); await f.controller.whenIdle();
  assert.equal(f.controller.snapshot().acknowledgedRevision, 2);
  assert.deepEqual(versions, [1]);
  f.controller.dispose();
});
test('flushLatest immediately requests and awaits a complete version, and shares concurrent gates', async () => {
  const pending = deferred(), versions = [];
  const f = fixture({ flushRevision: r => { versions.push(r); return pending.promise; } });
  f.controller.observe({ revision: 1, dirty: true });
  const a = f.controller.flushLatest(), b = f.controller.flushLatest();
  assert.strictEqual(a, b); assert.deepEqual(versions, [1]);
  let finished = false; a.then(() => { finished = true; });
  await settle(); assert.equal(finished, false);
  pending.resolve({ ok: true, item: { id: 'v1' } });
  assert.equal((await a).ok, true); assert.equal(finished, true);
  assert.equal(f.controller.hasUnconfirmedWork(), false);
  f.controller.dispose();
});
test('explicit version gate drains edits made during export', async () => {
  const pending = deferred(), versions = [];
  const f = fixture({ flushRevision: async r => { versions.push(r); return r === 1 ? pending.promise : { ok: true, item: { id: 'v2' } }; } });
  f.controller.observe({ revision: 1, dirty: true });
  const gate = f.controller.flushLatest();
  f.controller.observe({ revision: 2, dirty: true });
  await f.clock.advance(400);
  pending.resolve({ ok: true, item: { id: 'v1' } });
  assert.equal((await gate).ok, true); assert.deepEqual(versions, [1,2]);
  assert.equal(f.controller.hasUnconfirmedWork(), false); f.controller.dispose();
});
test('draft failure never acknowledges saved and exhausts 1.5/4/9 second retries into error', async () => {
  const attempts = [];
  const f = fixture({ draft: { saveRevision: async r => { attempts.push([r, f.clock.now]); return false; } } });
  f.controller.observe({ revision: 1, dirty: true });
  await f.clock.advance(400); assert.equal(f.controller.snapshot().state, 'saving');
  await f.clock.advance(1_500 + 4_000 + 9_000);
  assert.deepEqual(attempts, [[1,400],[1,1900],[1,5900],[1,14900]]);
  assert.equal(f.controller.snapshot().state, 'error');
  assert.equal(f.controller.snapshot().acknowledgedRevision, 0);
  assert.deepEqual(f.versions, []); f.controller.dispose();
});
test('version failure preserves saved and retries in the background', async () => {
  let attempts = 0;
  const f = fixture({ flushRevision: async () => ++attempts === 1 ? { ok: false, error: 'network' } : { ok: true, item: { id: 'v1' } } });
  f.controller.observe({ revision: 1, dirty: true });
  await f.clock.advance(20_400);
  assert.equal(attempts, 1); assert.equal(f.controller.snapshot().state, 'saved');
  assert.deepEqual(f.states, ['saving', 'saved']);
  await f.clock.advance(1_500);
  assert.equal(attempts, 2); assert.equal(f.controller.hasUnconfirmedWork(), false); f.controller.dispose();
});
test('failed version CAS reuses the exported item without erasing a durable draft', async () => {
  let records = 0;
  const f = fixture({ maxRetries: 0, recordSavedItem: async () => ++records > 1 });
  f.controller.observe({ revision: 1, dirty: true }); await f.clock.advance(400);
  assert.equal((await f.controller.flushLatest()).ok, false);
  assert.equal(f.controller.snapshot().state, 'saved');
  assert.equal(f.controller.snapshot().pendingSessionRevision, 1);
  assert.equal((await f.controller.retry()).ok, true);
  assert.deepEqual(f.versions, [1]); assert.equal(records, 2); f.controller.dispose();
});
test('restored server draft starts saved and schedules one full version without re-upload', async () => {
  const f = fixture();
  f.controller.observe({ revision: 7, dirty: true, restoredDraft: true });
  f.controller.observe({ revision: 7, dirty: true, restoredDraft: true });
  assert.equal(f.controller.snapshot().state, 'saved');
  await f.clock.advance(19_999); assert.deepEqual(f.versions, []); assert.deepEqual(f.drafts, []);
  await f.clock.advance(1); assert.deepEqual(f.versions, [7]);
  f.controller.observe({ revision: 8, dirty: true }); await f.clock.advance(400);
  assert.deepEqual(f.drafts, [8]); f.controller.dispose();
});
test('no draft adapter retains legacy debounce, state sequence and error/retry behavior', async () => {
  let succeeds = false;
  const f = fixture({ draft: undefined, maxRetries: 0, flushRevision: async r => {
    f.versions.push(r); return succeeds ? { ok: true, item: { id: 'v1' } } : { ok: false, error: 'network' };
  } });
  f.controller.observe({ revision: 1, dirty: true });
  await f.clock.advance(400); assert.deepEqual(f.versions, []);
  await f.clock.advance(1199); assert.deepEqual(f.versions, []);
  await f.clock.advance(1); assert.equal(f.controller.snapshot().state, 'error');
  succeeds = true; await f.controller.retry();
  assert.deepEqual(f.states, ['saving', 'error', 'saving', 'saved']);
  assert.deepEqual(f.versions, [1,1]); f.controller.dispose();
});
test('a late draft failure cannot undo a successful version acknowledgement', async () => {
  const pending = deferred();
  const f = fixture({ draft: { saveRevision: () => pending.promise } });
  f.controller.observe({ revision: 1, dirty: true }); await f.clock.advance(400);
  assert.equal((await f.controller.flushLatest()).ok, true);
  pending.resolve(false); await f.controller.whenIdle();
  assert.equal(f.controller.snapshot().state, 'saved'); f.controller.dispose();
});

test('an idle deadline that expires during a long export still publishes the newer draft', async () => {
  const pending = deferred(), versions = [];
  const f = fixture({ flushRevision: async r => { versions.push(r); return r === 1 ? pending.promise : { ok: true }; } });
  f.controller.observe({ revision: 1, dirty: true }); await f.clock.advance(20_400);
  f.controller.observe({ revision: 2, dirty: true }); await f.clock.advance(20_400);
  assert.deepEqual(versions, [1]);
  pending.resolve({ ok: true }); await settle(); await f.clock.advance(0);
  assert.deepEqual(versions, [1,2]); f.controller.dispose();
});

test('rebinding while a version is in flight retains the original session commit callback', async () => {
  const pending = deferred(); const records = [];
  const f = fixture({ flushRevision: () => pending.promise,
    recordSavedItem: async (_item, r) => { records.push(['old-session',r]); return true; } });
  f.controller.observe({ revision: 1, dirty: true });
  const flushing = f.controller.flushLatest();
  f.controller.rebind({ recordSavedItem: async (_item,r) => { records.push(['new-session',r]); return true; } });
  pending.resolve({ ok: true, item: { id: 'version-1' } }); await flushing;
  assert.deepEqual(records, [['old-session',1]]); f.controller.dispose();
});
test('a hosted face cannot take over a draft controller belonging to the normal face', async () => {
  const { handOff, takeBack, resetBackgroundSaverForTests } = await import('../src/shell/advanced-background-saver.ts');
  const pending = deferred(); const f = fixture({ maxRetries: 0, flushRevision: () => pending.promise });
  f.controller.observe({ revision: 1, dirty: true });
  handOff('e6-face', f.controller);
  assert.equal(takeBack('e6-face', false), null);
  assert.strictEqual(takeBack('e6-face', true), f.controller);
  pending.resolve({ ok: true }); await f.controller.whenIdle(); f.controller.dispose(); resetBackgroundSaverForTests();
});
