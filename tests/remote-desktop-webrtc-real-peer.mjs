#!/usr/bin/env node
/**
 * Optional real libwebrtc loopback, no browser, gateway, device, or added dependencies.
 * node --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs \
 *   tests/remote-desktop-webrtc-real-peer.mjs [--implementation @roamhq/wrtc] [--timeout-ms 15000]
 * Uses the SAME WebRtcRemoteDesktopViewer as the browser/WebView.
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const argv = process.argv.slice(2);
if (argv.includes('--help')) {
  process.stdout.write('Optional real-peer loopback using an already-installed wrtc-compatible module.\nUsage: node --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs tests/remote-desktop-webrtc-real-peer.mjs [--implementation PACKAGE_OR_PATH] [--timeout-ms 15000]\nAuto-detects @roamhq/wrtc, wrtc, @koush/wrtc. No installed implementation => SKIP (exit 0).\n');
  process.exit(0);
}
const flags = new Map();
for (let i = 0; i < argv.length; i += 2) {
  if (!['--implementation', '--timeout-ms'].includes(argv[i]) || !argv[i + 1]) throw new Error(`Unknown/incomplete option: ${argv[i]}`);
  flags.set(argv[i], argv[i + 1]);
}
const timeoutMs = Number(flags.get('--timeout-ms') ?? 15000);
if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) throw new Error('--timeout-ms must be 1000..60000');
const require = createRequire(import.meta.url);
let implementation, implementationName;
for (const name of flags.has('--implementation') ? [flags.get('--implementation')] : ['@roamhq/wrtc', 'wrtc', '@koush/wrtc']) {
  let resolved;
  try { resolved = require.resolve(name); }
  catch (error) { if (error.code === 'MODULE_NOT_FOUND' && !flags.has('--implementation')) continue; throw error; }
  const imported = await import(pathToFileURL(resolved).href);
  implementation = imported.default ?? imported;
  if (typeof implementation.RTCPeerConnection !== 'function') throw new Error(`${name} does not export RTCPeerConnection`);
  implementationName = name;
  break;
}
if (!implementation) {
  process.stdout.write('SKIP real-peer: no installed @roamhq/wrtc, wrtc, or @koush/wrtc. No dependency was installed.\n');
  process.exit(0);
}
const { WebRtcRemoteDesktopViewer } = await import('../src/api/remote-desktop-webrtc.ts');
const { RTCPeerConnection, RTCRtpReceiver, MediaStream, nonstandard } = implementation;
globalThis.RTCPeerConnection = RTCPeerConnection;
if (RTCRtpReceiver) globalThis.RTCRtpReceiver = RTCRtpReceiver;
if (MediaStream) globalThis.MediaStream = MediaStream;
const sid = 'node-loopback';
const host = new RTCPeerConnection({ iceServers: [] });
const channels = new Map();
let viewer, generation = 1, hostSignalChain = Promise.resolve(), frameTimer, sourceTrack;
let acknowledged = false, finished = false;
const pendingHostCandidates = [];
let resolveDone, rejectDone;
const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
const fail = (error) => rejectDone(error instanceof Error ? error : new Error(String(error)));
const deadline = setTimeout(() => fail(new Error('Real-peer loopback timed out')), timeoutMs);
const source = nonstandard?.RTCVideoSource ? new nonstandard.RTCVideoSource() : null;
if (source) {
  sourceTrack = source.createTrack();
  host.addTrack(sourceTrack);
  const width = 320, height = 180, data = new Uint8ClampedArray(width * height * 3 / 2).fill(128);
  frameTimer = setInterval(() => source.onFrame({ width, height, data }), 100);
}
host.onicecandidate = ({ candidate }) => {
  if (candidate) void viewer.signal({ k: 'candidate', gen: generation, candidate: candidate.candidate, sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex }).catch(fail);
};
host.ondatachannel = ({ channel }) => {
  channels.set(channel.label, channel);
  channel.onmessage = ({ data }) => {
    try {
      const message = JSON.parse(String(data));
      assert.equal(message.sid, sid);
      const control = channels.get('rd-ctl');
      if (channel.label === 'rd-ctl' && message.t === 'rd.ping' && control?.readyState === 'open') {
        const now = Date.now();
        control.send(JSON.stringify({ t: 'rd.pong', v: 1, sid, t_v: message.t_v, device_wall_ms: now, host_receive_ms: now, host_send_ms: Date.now() }));
      } else if (message.a && control?.readyState === 'open') {
        assert.ok(channel.label === (message.a.kind === 'move' ? 'rd-fast' : 'rd-input'));
        control.send(JSON.stringify({ t: 'rd.input_receipt', v: 1, sid, seq: message.seq, status: 'executed', received_at_ms: Date.now(), executed_at_ms: Date.now() }));
        if (message.a.kind === 'click') acknowledged = true;
      }
    } catch (error) { fail(error); }
  };
};
const sendSignal = (message) => {
  hostSignalChain = hostSignalChain.then(async () => {
    generation = message.gen ?? generation;
    if (message.k === 'offer') {
      await host.setRemoteDescription({ type: 'offer', sdp: message.sdp });
      for (const candidate of pendingHostCandidates.splice(0)) await host.addIceCandidate(candidate);
      await host.setLocalDescription(await host.createAnswer());
      await viewer.signal({ k: 'answer', gen: generation, sdp: host.localDescription.sdp });
    } else if (message.k === 'candidate') {
      const candidate = { candidate: message.candidate, sdpMid: message.sdpMid, sdpMLineIndex: message.sdpMLineIndex };
      if (host.remoteDescription) await host.addIceCandidate(candidate); else pendingHostCandidates.push(candidate);
    }
  }).catch(fail);
  return true;
};
let reported = 0;
viewer = new WebRtcRemoteDesktopViewer({
  descriptor: { transport: 'webrtc-v1', role: 'viewer', session_id: sid, display_id: null, ice_servers: [], server_now: Date.now()/1000,
    ice_expires_at: new Date(Date.now()+3600000).toISOString(), lease_expires_at: new Date(Date.now()+120000).toISOString() },
  deviceId: 'node-loopback', sendSignal, createPeer: (configuration) => new RTCPeerConnection(configuration),
  onState() {}, onFrame() {}, onTerminal: fail,
  onReport() { reported++; },
});
const poll = setInterval(async () => {
  try {
    if (finished || channels.size !== 3 || [...channels.values()].some(channel => channel.readyState !== 'open')) return;
    if (!acknowledged) { viewer.send({ kind: 'click', x: 0.5, y: 0.5 }); return; }
    const stats = await viewer.pc.getStats();
    const video = [...stats.values()].find(row => row.type === 'inbound-rtp' && (row.kind === 'video' || row.mediaType === 'video'));
    if (source && !(video?.framesDecoded > 0)) return;
    finished = true;
    process.stdout.write(JSON.stringify({ result: 'PASS', implementation: implementationName, transport: 'webrtc-v1', gen: viewer.gen,
      channels: [...channels.keys()], input_receipt: acknowledged, frames_decoded: video?.framesDecoded ?? null, video_source: Boolean(source), reports: reported }) + '\n');
    resolveDone();
  } catch (error) { fail(error); }
}, 100);
try { await viewer.start(); await done; }
finally {
  clearTimeout(deadline); clearInterval(poll); clearInterval(frameTimer);
  viewer.close('viewer_left'); sourceTrack?.stop(); host.close();
}
