import assert from 'node:assert/strict';
import test from 'node:test';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
import { REMOTE_MEDIA_FRAME_TIMEOUT_MS } from '../src/pages/remote-desktop-media.ts';
import { RemoteDesktopQualityHub } from '../src/api/remote-desktop-quality.ts';

const api = await import(await compileModule('src/api/remote-desktop.ts', {
  '../lib/auth/client': dataModule('export async function accessToken(){return "fixture";}'),
  '../lib/auth/config': dataModule('export const GATEWAY_BASE="https://fixture.invalid";'),
  './device-settings': dataModule('export function controllerHeaders(){return {"X-OceanLeo-Controller":"fixture"};} export function registerController(){}'),
}));
class Socket {
  static OPEN = 1; static latest;
  readyState = 1; bufferedAmount = 0; sent = [];
  constructor() { Socket.latest = this; }
  send(raw) { this.sent.push(JSON.parse(raw)); }
  message(value) { this.onmessage({ data: JSON.stringify(value) }); }
  close() { this.readyState = 3; }
}
const actions = h => h.socket.sent.filter(value => value.type === 'input');
async function harness(t, modern = true, floor = 0, measureQuality = false) {
  let now = 100;
  t.mock.method(performance, 'now', () => now);
  globalThis.window = { location: { href: 'https://fixture.invalid/devices' } };
  globalThis.WebSocket = Socket;
  const samples = [], errors = [];
  const hub = measureQuality ? new RemoteDesktopQualityHub(() => now, () => ({ browser: 'chrome', platform: 'macos', site: 'global' })) : null;
  const client = hub ? hub.wrap({ ...api.remoteDesktopClient,
    async createSession() { return { ok: true, data: { session_id: 'session', state: 'connecting', transport: 'websocket-v2' } }; },
  }) : api.remoteDesktopClient;
  if (hub) await client.createSession('device');
  const opening = client.openStream('device', 'session', {
    state() {}, frame() {}, error: value => errors.push(value), controlTiming: value => samples.push(value),
  });
  await new Promise(setImmediate);
  const socket = Socket.latest;
  socket.onopen();
  socket.message({ type: 'state', state: 'active', input_seq: floor, acked_seq: floor,
    ...(modern ? { input_receipt_version: 1 } : {}) });
  const stream = (await opening).data;
  t.after(() => stream.close());
  const h = { socket, stream, samples, errors, collector: hub?.forSession('session'), advance(ms) { now += ms; },
    receipt(seq, status = 'executed', extra = {}) { socket.message({ type: 'input_receipt', session_id: 'session', seq, status, executed_at_ms: 1_800_000_000_000, ...extra }); },
    legacy(seq) { socket.message({ type: 'input_ack', seq }); socket.message({ type: 'state', state: 'active', acked_seq: seq }); },
  };
  return h;
}
function direct(h) {
  let listener;
  const peer = { sent: [], send(raw) { this.sent.push(JSON.parse(raw)); return true; }, subscribe(fn) { listener = fn; return () => { listener = null; }; },
    emit(value) { listener?.({ v: 1, sid: 'session', ...value }); } };
  h.stream.attachDataChannel(peer);
  return peer;
}
const motion = x => ({ kind: 'move', x, y: .5 });

test('negotiated receipts keep eight credits until each exact terminal seq arrives', async t => {
  const h = await harness(t);
  for (let i = 0; i < 10; i++) h.stream.send({ kind: 'keypress', key: 'Enter' });
  assert.equal(actions(h).length, 8);
  for (let seq = 1; seq <= 8; seq++) h.legacy(seq);
  assert.equal(actions(h).length, 8);
  assert.deepEqual(h.samples, []);
  h.receipt(8, 'merged');
  assert.equal(actions(h).length, 9);
  h.receipt(8, 'executed');
  assert.equal(actions(h).length, 9, 'duplicate cannot grant another credit or change its outcome');
  h.receipt(3, 'rejected');
  assert.equal(actions(h).length, 10);
  assert.deepEqual(h.samples.map(value => [value.seq, value.status]), [[8, 'merged'], [3, 'rejected']]);
  assert.equal(h.stream.diagnostics().outstanding_count, 8);
});

test('receipt RTT uses local monotonic clocks and deduplicates delivery across DC and WS', async t => {
  const h = await harness(t), peer = direct(h);
  const probe = peer.sent[0].seq;
  peer.emit({ t: 'rd.input_ack', acked_seq: probe, input_receipt_version: 1 });
  h.stream.send(motion(.1));
  assert.equal(h.stream.inputPath(), 'websocket', 'legacy admission cannot prove a modern probe');
  h.advance(17); peer.emit({ t: 'rd.input_receipt', seq: probe, status: 'executed', executed_at_ms: 99 });
  h.stream.send(motion(.2));
  assert.equal(h.stream.inputPath(), 'data_channel');
  const seq = peer.sent.at(-1).seq;
  h.advance(23); peer.emit({ t: 'rd.input_receipt', seq, status: 'executed', executed_at_ms: 9_000_000_000_000 });
  h.receipt(seq);
  assert.equal(h.samples.filter(value => value.seq === seq).length, 1);
  assert.equal(h.samples.find(value => value.seq === seq).elapsedMs, 23);
  assert.equal(h.stream.inputHistory.get(seq).receipt.executed_at_ms, 9_000_000_000_000);
  assert.equal(h.stream.inputHistory.get(probe).probe, true);
  assert.equal(h.stream.inputHistory.get(probe).receipt.status, 'executed', 'history retains the probe terminal proof');
  assert.equal(h.samples.some(value => value.seq === probe), false, 'probe diagnostics are separate from business RTT');
});

test('probe receipts prove the DC lane without business samples; real input is counted once through the quality hub', async t => {
  const h = await harness(t, true, 0, true), peer = direct(h);
  const probe = peer.sent[0].seq;
  h.advance(17);
  peer.emit({ t: 'rd.input_receipt', seq: probe, status: 'executed', executed_at_ms: 1_800_000_000_000 });
  h.receipt(probe);
  assert.deepEqual(h.collector.report().input, { ws_count: 0, dc_count: 0 });
  assert.deepEqual(h.collector.takeDirectAckWindow(), {});
  assert.deepEqual(h.samples, []);
  assert.equal(h.stream.inputHistory.get(probe).probe, true);
  assert.equal(h.stream.inputHistory.get(probe).receipt.status, 'executed');
  const probed = h.stream.diagnostics();
  assert.equal(probed.dc_probe_write_count, 1);
  assert.equal(probed.dc_write_count, 0);
  assert.equal(probed.dc_completed_count, 0);
  assert.equal(probed.dc_receipt_seq, probe);

  assert.equal(h.stream.send(motion(.2)), true);
  assert.equal(h.stream.inputPath(), 'data_channel', 'the probe receipt still proves the subscribed lane');
  assert.equal(actions(h).length, 0);
  const seq = peer.sent.at(-1).seq;
  h.advance(23);
  peer.emit({ t: 'rd.input_receipt', seq, status: 'executed', executed_at_ms: 1_800_000_000_023 });
  h.receipt(seq);
  assert.deepEqual(h.samples, [{ seq, stage: 'input_receipt', status: 'executed', elapsedMs: 23 }]);
  assert.deepEqual(h.collector.report().input, { ws_count: 0, dc_count: 1,
    executed: { n: 1, p50: 23, p90: 23, p99: 23, max: 23 } });
  assert.deepEqual(h.collector.takeDirectAckWindow(), { input_ack_p50_ms: 23, input_ack_p95_ms: 23 });
  assert.equal(h.stream.diagnostics().dc_completed_count, 1);
  assert.equal(h.stream.inputHistory.get(probe).receipt.status, 'executed');
  assert.deepEqual(h.errors, []);
});

test('new receipt arriving before state negotiation immediately fences every legacy ack', async t => {
  const h = await harness(t, false);
  h.stream.send(motion(.1)); h.receipt(1);
  for (let i = 0; i < 9; i++) h.stream.send({ kind: 'keypress', key: 'Enter' });
  assert.equal(actions(h).length, 9);
  h.legacy(2);
  assert.equal(actions(h).length, 9);
  assert.equal(h.samples.length, 1);
});

test('future, prior-stream, wrong-session and failed-probe holes cannot release credits', async t => {
  const h = await harness(t, true, 40);
  h.receipt(40); h.receipt(41); h.receipt(42, 'executed', { session_id: 'other' });
  h.stream.attachDataChannel({ send() { return false; } }); // Claims 41 but never writes it.
  for (let i = 0; i < 9; i++) h.stream.send({ kind: 'keypress', key: 'Enter' });
  assert.equal(actions(h).length, 8);
  h.receipt(41); h.receipt(1000); h.receipt(42, 'executed', { status: 'unknown' });
  assert.equal(actions(h).length, 8);
  assert.deepEqual(h.samples, []);
  h.receipt(43); assert.equal(actions(h).length, 9);
  assert.deepEqual(h.errors, []);
});

for (const status of ['merged', 'rejected']) test(`handoff ${status} frees its credit but never confirms execution`, async t => {
  const h = await harness(t);
  const pending = h.stream.releaseForHandoff();
  const rejected = assert.rejects(pending, new RegExp(`input_receipt_${status}`));
  h.receipt(1, status); await rejected;
  assert.equal(h.stream.diagnostics().outstanding_count, 0);
  assert.equal(h.stream.send(motion(.3)), true, 'negative decision keeps manual control available');
  assert.equal(actions(h).length, 2);
});

test('handoff requires the exact release_all executed, never higher seq or legacy watermarks', async t => {
  const h = await harness(t), peer = direct(h);
  h.receipt(peer.sent[0].seq);
  let done = false;
  const pending = h.stream.releaseForHandoff().then(() => { done = true; });
  const seq = peer.sent.at(-1).seq;
  assert.equal(peer.sent.at(-1).a.kind, 'release_all');
  peer.emit({ t: 'rd.input_ack', acked_seq: seq, input_receipt_version: 1 }); h.legacy(seq); h.receipt(seq + 1);
  await Promise.resolve(); assert.equal(done, false);
  h.receipt(seq); await pending;
  assert.equal(done, true);
  h.stream.finishHandoff(); assert.equal(h.stream.send(motion(.4)), true);
});

test('legacy publishers retain admission credits without requiring new fields', async t => {
  const h = await harness(t, false);
  for (let i = 0; i < 9; i++) h.stream.send({ kind: 'keypress', key: 'Enter' });
  assert.equal(actions(h).length, 8);
  h.legacy(1); assert.equal(actions(h).length, 9);
  assert.deepEqual(h.samples.map(value => value.stage), ['accepted', 'completion_watermark']);
});

test('first-frame timeout retains one native retry opportunity and capture recovery margin', () => {
  const healthWindow = 8_000, stopGrace = 2_000, firstRetryBackoff = 1_037;
  assert.equal(REMOTE_MEDIA_FRAME_TIMEOUT_MS, 20_000);
  assert.ok(healthWindow + stopGrace + 8_000 + 2_000 <= REMOTE_MEDIA_FRAME_TIMEOUT_MS,
    'hung-worker replacement can begin by 10s with 8s rebuild/frame and 2s transport margin');
  assert.ok(firstRetryBackoff + 8_000 + 2_000 < REMOTE_MEDIA_FRAME_TIMEOUT_MS,
    'WorkerStopped(7) gets its first retry well before the current viewer deadline');
});

for (const error of ['input_not_allowed', 'rate_limited', 'input_queue_full']) test(`modern gateway ${error} ends uncertain input instead of silently exhausting credits`, async t => {
  const h = await harness(t);
  h.stream.send({ kind: 'keypress', key: 'Enter' });
  h.socket.message({ type: 'input_rejected', seq: 1, error, retry_after_ms: 100 });
  assert.deepEqual(h.errors, ['input_ack_unknown']);
  assert.equal(h.stream.send({ kind: 'keypress', key: 'Enter' }), false);
  assert.deepEqual(h.samples, []);
  assert.equal(actions(h).filter(value => value.action.kind === 'keypress').length, 1, 'never replays the rejected write');
});
