import assert from 'node:assert/strict';
import test from 'node:test';
import { pathRoutes, readPathStats, WebRtcPathSelector } from '../src/api/remote-desktop-webrtc-path.ts';
import { WebRtcPathProbe } from '../src/api/remote-desktop-webrtc-path-probe.ts';
import { descriptor, FakePeer, FakeVideo, harness, settle, WALL } from './helpers/remote-desktop-webrtc.mjs';

const servers = [{ urls: ['stun:fixture.invalid'] },
  { urls: ['turn:a.invalid?transport=udp', 'turn:a.invalid?transport=tcp'], region: 'guangzhou', username: 'fixture', credential: 'fixture' },
  { urls: ['turn:b.invalid?transport=udp'], region: 'singapore', username: 'fixture', credential: 'fixture' }];
const routes = pathRoutes(servers), [direct, relayA, relayB] = routes;
function stats({ selected = 'd', directRtt = 201, relayRtt = 47, otherRtt = 90, responses = 1 } = {}) {
  return [{ id: 't', type: 'transport', selectedCandidatePairId: selected },
    ...[['d', 'ld', directRtt], ['a', 'la', relayRtt], ['b', 'lb', otherRtt]].map(([id, localCandidateId, rtt]) => ({
      id, type: 'candidate-pair', state: 'succeeded', localCandidateId, remoteCandidateId: 'r', currentRoundTripTime: rtt / 1000, responsesReceived: responses,
    })),
    { id: 'ld', type: 'local-candidate', candidateType: 'srflx', protocol: 'udp' },
    { id: 'la', type: 'local-candidate', candidateType: 'relay', protocol: 'udp', url: servers[1].urls[0] },
    { id: 'lb', type: 'local-candidate', candidateType: 'relay', protocol: 'udp', url: servers[2].urls[0] },
    { id: 'r', type: 'remote-candidate', candidateType: 'host', address: '192.0.2.1' }];
}
function timeline(selector, values, { start = 0, source = 'ice', selected = direct.key } = {}) {
  selector.selected(selected, start);
  values.forEach(([d, a, b], index) => {
    const now = start + index * 1000;
    for (const [route, rtt] of [[direct, d], [relayA, a], [relayB, b]]) if (rtt !== undefined) selector.observe(route.key, rtt, now, source, route.key);
  });
  return start + (values.length - 1) * 1000;
}
test('relay wins only after both margins hold for four independent samples over three seconds', () => {
  const selector = new WebRtcPathSelector(routes);
  timeline(selector, [[201, 47], [205, 48], [202, 49]]);
  assert.equal(selector.choose(direct.key, 2000), undefined);
  selector.observe(relayA.key, 47, 3000, 'ice', relayA.key); selector.observe(direct.key, 201, 3000, 'ice', direct.key);
  assert.equal(selector.choose(direct.key, 3000)?.key, relayA.key);
  assert.equal(selector.comparison(direct.key, 3000).relay_rtt_ms, 48);
});
test('direct better, marginal improvement and flapping never trigger a restart', () => {
  for (const values of [Array(8).fill([20, 47]), Array(8).fill([100, 75]), Array(8).fill([50, 30]),
    [[201, 47], [201, 210], [201, 47], [201, 210], [201, 47], [201, 210], [201, 47], [201, 210]]]) {
    const selector = new WebRtcPathSelector(routes); const now = timeline(selector, values);
    assert.equal(selector.choose(direct.key, now), undefined);
  }
});
test('all configured relay groups compete by measured latency; metadata never enters RTC configuration', () => {
  const selector = new WebRtcPathSelector(routes); timeline(selector, Array(4).fill([201, 70, 40]));
  assert.equal(selector.choose(direct.key, 3000)?.key, relayB.key);
  assert.equal(selector.comparison(direct.key, 3000).best_relay_region, 'singapore');
  assert.equal(relayB.servers[0].region, undefined);
  const reading = readPathStats(stats(), routes); assert.equal(reading.selected.route.key, direct.key);
  assert.equal(reading.succeeded.find(row => row.id === 'a').route.key, relayA.key);
});
test('freshness requires advancing response counters, never a repeated RTT or stats timestamp', () => {
  const selector = new WebRtcPathSelector(routes);
  for (let now = 0; now <= 20_000; now += 1000) for (const row of readPathStats(stats(), routes).succeeded) selector.ice(row, now);
  assert.equal(selector.choose(direct.key, 20_000), undefined);
  for (let i = 1; i <= 4; i++) for (const row of readPathStats(stats({ responses: i + 1 }), routes).succeeded) selector.ice(row, 20_000 + i * 1000);
  assert.equal(selector.choose(direct.key, 24_000)?.key, relayA.key);
});
test('return to direct has hysteresis and 60s minimum dwell; failed targets cool down for 120s', () => {
  const selector = new WebRtcPathSelector(routes); timeline(selector, Array(4).fill([201, 47]));
  selector.attempted(3000); selector.selected(relayA.key, 4000);
  timeline(selector, Array(4).fill([20, 100]), { start: 60_000, selected: relayA.key });
  assert.equal(selector.choose(relayA.key, 63_000), undefined);
  selector.observe(direct.key, 20, 64_000, 'ice', direct.key); selector.observe(relayA.key, 100, 64_000, 'ice', relayA.key);
  assert.equal(selector.choose(relayA.key, 64_000)?.key, direct.key);
  selector.failed(direct.key, 64_000);
  timeline(selector, Array(4).fill([20, 100]), { start: 130_000, selected: relayA.key });
  assert.equal(selector.choose(relayA.key, 133_000), undefined);
  timeline(selector, Array(4).fill([20, 100]), { start: 185_000, selected: relayA.key });
  assert.equal(selector.choose(relayA.key, 188_000)?.key, direct.key);
});
test('relay disappears, no relay configured, stats unavailable and mixed measurement sources fail safely', () => {
  const selector = new WebRtcPathSelector(routes); timeline(selector, Array(4).fill([201, 47]));
  assert.equal(selector.choose(direct.key, 6000), undefined, 'stale alternative expires');
  assert.deepEqual(selector.comparison(direct.key, 20_000), {});
  selector.updateRoutes([direct]); assert.equal(selector.choose(direct.key, 3000), undefined);
  assert.equal(new WebRtcPathSelector([direct]).choose(direct.key, 0), undefined);
  assert.deepEqual(readPathStats([], routes), { selected: undefined, succeeded: [] });
  const mixed = new WebRtcPathSelector(routes);
  for (let at = 0; at <= 3000; at += 1000) { mixed.observe(direct.key, 201, at, 'ice', 'd'); mixed.observe(relayA.key, 47, at, 'ctl', 'a'); }
  assert.equal(mixed.choose(direct.key, 3000), undefined, 'application RTT is not compared with ICE RTT');
});
test('malformed RTTs, counter resets and identity changes do not manufacture a sustained window', () => {
  const selector = new WebRtcPathSelector(routes);
  for (let i = 0; i < 8; i++) { selector.observe(direct.key, 201, i * 1000, 'ctl', 'd'); selector.observe(relayA.key, 47, i * 1000, 'ctl', `changing-${i}`); }
  assert.equal(selector.choose(direct.key, 7000), undefined);
  for (const rtt of [NaN, Infinity, -1, 600001]) selector.observe(relayA.key, rtt, 8000, 'ctl', 'bad');
  assert.equal(selector.choose(direct.key, 8000), undefined);
});
test('telemetry prefers a complete comparison; failed cooldown survives a peer reset', () => {
  const selector = new WebRtcPathSelector(routes); timeline(selector, Array(4).fill([201, 47]));
  selector.observe(direct.key, 200, 3000, 'ctl', 'd');
  assert.deepEqual(selector.comparison(direct.key, 3000), { comparison_source: 'ice', direct_rtt_ms: 201, relay_rtt_ms: 47, best_relay_region: 'guangzhou' });
  selector.failed(relayA.key, 3000); selector.reset(); timeline(selector, Array(4).fill([201, 47]), { start: 70_000 });
  assert.equal(selector.choose(direct.key, 73_000), undefined);
});

async function connected(t, iceServers = servers) {
  const h = await harness(t, { descriptor: descriptor({ ice_servers: iceServers }) });
  await h.viewer.start(); const pc = h.viewer.pc; h.open();
  await h.viewer.signal({ k: 'answer', gen: 1, sdp: 'initial-answer' });
  const video = new FakeVideo(); h.viewer.attachVideo(video); video.frame({ expectedDisplayTime: 110, receiveTime: 100 });
  pc.statsEntries = stats(); await h.advance(100);
  return { ...h, pc, video };
}
async function iceWindow(h, options = {}, count = 5) {
  for (let i = 0; i < count; i++) { h.pc.statsEntries = stats({ ...options, responses: 10 + i }); await h.advance(1000); }
}
test('live switch is one same-gen ICE restart, preserving peer, picture, channels and input sequence', async t => {
  const h = await connected(t), pc = h.pc;
  assert.equal(h.viewer.send({ kind: 'keypress', key: 'A' }), true); const seq = h.viewer.lastSequence(); h.receipt(seq);
  await iceWindow(h);
  assert.equal(h.viewer.pc, pc); assert.equal(h.viewer.gen, 1); assert.equal(pc.closed, 0);
  assert.equal(pc.configuration.iceTransportPolicy, 'relay'); assert.deepEqual(pc.configuration.iceServers, relayA.servers);
  assert.deepEqual(pc.offers, [undefined, { iceRestart: true }]); assert.equal(h.peers.length, 1, 'no unadvertised probe');
  assert.equal(h.viewer.send({ kind: 'keypress', key: 'B' }), true); assert.ok(h.viewer.lastSequence() > seq); h.receipt(h.viewer.lastSequence());
  h.video.frame({ expectedDisplayTime: h.now(), receiveTime: h.now() - 10 });
  await h.viewer.signal({ k: 'answer', gen: 1, sdp: 'restart-answer' });
  h.pc.statsEntries = stats({ selected: 'a', responses: 20 }); await h.advance(1000);
  assert.equal(h.states.at(-1).state, 'playing'); assert.deepEqual(h.terminals, []);
  assert.equal(h.states.at(-1).path.relay_region, 'guangzhou');
});
test('relay ICE disconnection falls back to all routes on the same peer after the existing 2s grace', async t => {
  const h = await connected(t); await iceWindow(h);
  await h.viewer.signal({ k: 'answer', gen: 1, sdp: 'restart-answer' }); h.pc.statsEntries = stats({ selected: 'a', responses: 25 }); await h.advance(1000);
  h.pc.ice('disconnected'); await h.advance(2000);
  assert.equal(h.pc.configuration.iceTransportPolicy, 'all'); assert.equal(h.pc.closed, 0); assert.equal(h.viewer.gen, 1); assert.deepEqual(h.terminals, []);
});
test('unconfirmed switch rolls back within 10s, same session and generation, without repeatedly selecting failed relay', async t => {
  const h = await connected(t); await iceWindow(h); await h.advance(10_000);
  assert.equal(h.pc.configuration.iceTransportPolicy, 'all'); assert.equal(h.pc.closed, 0); assert.equal(h.viewer.gen, 1);
  const offers = h.pc.offers.length; await iceWindow(h); assert.equal(h.pc.offers.length, offers); assert.deepEqual(h.terminals, []);
});
test('getStats rejection does not restart or end the session', async t => {
  const h = await connected(t); h.pc.getStats = async () => { throw Error('unavailable'); }; await h.advance(12_000);
  assert.equal(h.pc.offers.length, 1); assert.equal(h.pc.closed, 0); assert.deepEqual(h.terminals, []);
});
test('confirmed relay can return to direct once dwell expires, with no new peer or session', async t => {
  const h = await connected(t); await iceWindow(h);
  await h.viewer.signal({ k: 'answer', gen: 1, sdp: 'relay-answer' });
  h.pc.statsEntries = stats({ selected: 'a', responses: 20 }); await h.advance(1000);
  for (let i = 0; i < 59; i++) {
    h.pc.statsEntries = stats({ selected: 'a', directRtt: 20, relayRtt: 100, otherRtt: 110, responses: 100 + i }); await h.advance(1000);
  }
  assert.equal(h.pc.configuration.iceTransportPolicy, 'relay');
  h.pc.statsEntries = stats({ selected: 'a', directRtt: 20, relayRtt: 100, otherRtt: 110, responses: 200 }); await h.advance(1500);
  assert.equal(h.pc.configuration.iceTransportPolicy, 'all'); assert.equal(h.pc.offers.length, 3);
  assert.equal(h.viewer.gen, 1); assert.equal(h.pc.closed, 0); assert.equal(h.peers.length, 1);
});
test('comparisons expire when stats fail; an unconfirmed restart rolls back with renewed credentials', async t => {
  const h = await connected(t); await iceWindow(h);
  const renewed = servers.map(server => ({ ...server, credential: 'renewed' }));
  h.viewer.updateDescriptor(descriptor({ ice_servers: renewed, server_now: WALL / 1000 + 1, lease_expires_at: new Date(WALL + 180000).toISOString() }));
  h.pc.getStats = async () => { throw Error('unavailable'); }; await h.advance(11_000);
  assert.equal(h.pc.configuration.iceTransportPolicy, 'all');
  assert.ok(h.pc.configuration.iceServers.every(server => server.credential === 'renewed'));
  h.viewer.close(); const path = h.reports.at(-1).report.path;
  assert.equal(path.direct_rtt_ms, undefined); assert.equal(path.relay_rtt_ms, undefined);
});

function probeHarness(t, probeRoutes = [direct, relayA]) {
  let now = 0; const peers = [], sent = [], samples = [];
  const probe = new WebRtcPathProbe({ sid: 'sid', now: () => now, wallNow: () => WALL + now,
    createPeer: configuration => { const pc = new FakePeer(configuration); peers.push(pc); return pc; },
    send: value => { sent.push(value); return true; }, sample: (...args) => samples.push(args) });
  t.after(() => probe.reset());
  return { probe, peers, sent, samples, at(value) { now = value; }, async tick(value, selected = direct.key) { now = value; probe.tick(probeRoutes, selected, 1, true); await settle(); } };
}
test('probe capability gate prevents all parallel offers; advertised probe has only rd-ctl and no media', async t => {
  const h = probeHarness(t); await h.tick(0); assert.equal(h.peers.length, 0);
  h.probe.enable(); await h.tick(1); const pc = h.peers[0];
  assert.equal(pc.configuration.iceTransportPolicy, 'relay'); assert.equal(pc.transceiver, undefined);
  assert.deepEqual(pc.channels.map(channel => channel.label), ['rd-ctl']);
  assert.equal(h.sent.find(message => message.data.k === 'offer').t, 'rd.path_probe');
  assert.equal(h.sent[0].gen, 1); assert.equal(h.sent[0].data.target, 'relay');
});
test('probe pongs measure fresh full-path RTT only on the verified desired selected pair', async t => {
  const h = probeHarness(t); h.probe.enable(); await h.tick(0); const pc = h.peers[0]; pc.statsEntries = stats({ selected: 'a' }); pc.open();
  for (let i = 1; i <= 4; i++) {
    await h.tick(i * 1000); const ping = pc.channel('rd-ctl').sent.at(-1); assert.ok(ping);
    h.at(i * 1000 + 47); pc.channel('rd-ctl').message({ t: 'rd.pong', t_v: ping.t_v }); await settle();
  }
  assert.equal(h.samples.length, 4); assert.ok(h.samples.every(sample => sample[1] === 47));
  await h.tick(5100); const wrong = h.peers.at(-1); wrong.statsEntries = stats({ selected: 'd' }); wrong.open();
  await h.tick(6100); assert.equal(wrong.channel('rd-ctl').sent.length, 0, 'wrong actual route cannot be measured as relay');
});
test('survey measures every relay before releasing fresh samples for the best region', async t => {
  const h = probeHarness(t, routes); h.probe.enable(); await h.tick(0);
  const first = h.peers[0]; first.statsEntries = stats({ selected: 'a' }); first.open();
  for (let i = 1; i <= 4; i++) {
    await h.tick(i * 1000); const ping = first.channel('rd-ctl').sent.at(-1);
    h.at(i * 1000 + 70); first.channel('rd-ctl').message({ t: 'rd.pong', t_v: ping.t_v }); await settle();
  }
  assert.equal(h.samples.length, 0, 'first working region does not win before the other is measured');
  await h.tick(5100); const second = h.peers[1]; second.statsEntries = stats({ selected: 'b' }); second.open();
  for (let i = 1; i <= 4; i++) {
    await h.tick(5100 + i * 1000); const ping = second.channel('rd-ctl').sent.at(-1);
    h.at(5140 + i * 1000); second.channel('rd-ctl').message({ t: 'rd.pong', t_v: ping.t_v }); await settle();
  }
  assert.equal(h.samples.length, 4); assert.ok(h.samples.every(sample => sample[0].key === relayB.key && sample[1] === 40));
  assert.equal(first.closed, 1); assert.equal(second.closed, 1);
});
test('an earlier best region is freshly probed again, and a failed region does not block discovery', async t => {
  const h = probeHarness(t, routes); h.probe.enable(); await h.tick(0);
  const first = h.peers[0]; first.statsEntries = stats({ selected: 'a' }); first.open();
  for (let i = 1; i <= 4; i++) {
    await h.tick(i * 1000); const ping = first.channel('rd-ctl').sent.at(-1);
    h.at(i * 1000 + 40); first.channel('rd-ctl').message({ t: 'rd.pong', t_v: ping.t_v }); await settle();
  }
  await h.tick(5100); const failed = h.peers[1]; failed.channel('rd-ctl').error();
  await h.tick(6200); const recheck = h.peers[2]; assert.deepEqual(recheck.configuration.iceServers, relayA.servers);
  assert.equal(h.samples.length, 0, 'the earlier 40ms survey is not a fresh switch measurement');
  recheck.statsEntries = stats({ selected: 'a' }); recheck.open();
  for (let i = 1; i <= 4; i++) {
    await h.tick(6200 + i * 1000); const ping = recheck.channel('rd-ctl').sent.at(-1);
    h.at(6250 + i * 1000); recheck.channel('rd-ctl').message({ t: 'rd.pong', t_v: ping.t_v }); await settle();
  }
  assert.equal(h.samples.length, 4); assert.ok(h.samples.every(sample => sample[1] === 50));
});
test('probe candidate/answer routing rejects stale gen/id, expires after 12s and never touches a media peer', async t => {
  const h = probeHarness(t); h.probe.enable(); await h.tick(0); const pc = h.peers[0], id = h.sent[0].probe_id;
  await h.probe.receive({ gen: 2, probe_id: id, data: { k: 'answer', sdp: 'future' } }, 1);
  await h.probe.receive({ gen: 1, probe_id: id + 1, data: { k: 'answer', sdp: 'wrong' } }, 1); assert.equal(pc.remoteDescription, undefined);
  await h.probe.receive({ gen: 1, probe_id: id, data: { k: 'candidate', candidate: 'candidate:fixture' } }, 1);
  await h.probe.receive({ gen: 1, probe_id: id, data: { k: 'answer', sdp: 'probe-answer' } }, 1); assert.equal(pc.candidates.length, 1);
  await h.tick(12_000); assert.equal(pc.closed, 1); assert.equal(h.sent.at(-1).data.k, 'close');
  await h.tick(13_000); assert.equal(h.peers.length, 2); assert.ok(h.sent.at(-1).probe_id > id);
});
test('relay-selected viewer probes a direct-only candidate set to allow switching back', async t => {
  const h = probeHarness(t); h.probe.enable(); await h.tick(0, relayA.key);
  const pc = h.peers[0]; assert.equal(pc.configuration.iceTransportPolicy, 'all');
  assert.deepEqual(pc.configuration.iceServers, direct.servers); assert.equal(h.sent[0].data.target, 'direct');
  await h.probe.receive({ gen: 1, probe_id: h.sent[0].probe_id, data: { k: 'candidate', candidate: 'candidate:fixture typ relay' } }, 1);
  assert.equal(pc.candidates.length, 0);
});
test('capability received on main ctl creates only isolated probe signals and is reset on input/control repair', async t => {
  const h = await connected(t); h.pc.channel('rd-ctl').message({ t: 'rd.path_probe_ready', version: 1 }); await h.advance(100);
  assert.equal(h.peers.length, 2); const probe = h.peers[1];
  assert.deepEqual(h.signals.filter(signal => signal.k === 'offer').map(signal => signal.gen), [1]);
  assert.ok(h.pc.channel('rd-ctl').sent.some(message => message.t === 'rd.path_probe' && message.data.k === 'offer'));
  h.pc.channel('rd-ctl').error(); await h.advance(300); assert.equal(probe.closed, 1); assert.equal(h.viewer.pc, h.pc); assert.equal(h.pc.closed, 0);
});
test('capability-gated pong survey actually switches the live media peer with frozen ICE counter stats', async t => {
  const h = await connected(t, servers.slice(0, 2));
  h.pc.channel('rd-ctl').message({ t: 'rd.path_probe_ready', version: 1 }); await h.advance(100);
  const probe = h.peers[1]; probe.statsEntries = stats({ selected: 'a' }); probe.open();
  const delivered = new Set();
  for (let i = 0; i < 160 && h.pc.configuration.iceTransportPolicy !== 'relay'; i++) {
    await h.advance(50);
    for (const [peer, latency] of [[h.pc, 200], [probe, 50]]) {
      const channel = peer.channel('rd-ctl');
      for (const ping of channel.sent.filter(message => message.t === 'rd.ping')) {
        const key = `${latency}:${ping.t_v}`;
        if (channel.readyState === 'open' && !delivered.has(key) && h.wall() >= ping.t_v + latency) {
          delivered.add(key); channel.message({ t: 'rd.pong', t_v: ping.t_v }); await settle();
        }
      }
    }
  }
  await h.advance(100);
  assert.equal(h.pc.configuration.iceTransportPolicy, 'relay'); assert.equal(h.viewer.pc, h.pc);
  assert.equal(h.viewer.gen, 1); assert.equal(h.pc.closed, 0); assert.equal(h.pc.offers.length, 2);
  assert.deepEqual(h.terminals, []);
});
