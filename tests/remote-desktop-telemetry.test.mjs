import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { RemoteDesktopQualityHub } from "../src/api/remote-desktop-quality.ts";
import { RemoteDesktopMeasurements } from "../src/api/remote-desktop-measure.ts";
import { RemoteInputHistory } from "../src/api/remote-desktop-input-history.ts";
import { RemoteControlTimings } from "../src/api/remote-desktop-control-timing.ts";
import { RemoteTransportDiagnostics } from "../src/api/remote-desktop-diagnostics.ts";

const api = await import(await compileModule("src/api/remote-desktop.ts", {
  "../lib/auth/client": dataModule('export async function accessToken(){return globalThis.__rdTelemetryToken === undefined ? "fixture-token" : globalThis.__rdTelemetryToken;}'),
  "../lib/auth/config": dataModule('export const GATEWAY_BASE="https://fixture.invalid";'),
  "./device-settings": dataModule('export function controllerHeaders(){return {"X-OceanLeo-Controller":"fixture"};} export async function registerController(){return {ok:true};}'),
}));

class Socket {
  static OPEN = 1; static latest;
  readyState = 1; bufferedAmount = 0; sent = [];
  constructor() { Socket.latest = this; }
  send(text) { this.sent.push(JSON.parse(text)); }
  close() { this.readyState = 3; }
  message(value) { this.onmessage({ data: JSON.stringify(value) }); }
}
const env = () => ({ browser: "other", platform: "other", site: "dev" });

test("quality counts actual coalesced WS/DC writes and keeps the capability probe separate", async () => {
  globalThis.window = { location: { href: "https://fixture.invalid" } };
  globalThis.WebSocket = Socket;
  const hub = new RemoteDesktopQualityHub(() => performance.now(), env);
  const reports = [];
  const client = hub.wrap({ ...api.remoteDesktopClient,
    async createSession() { return { ok: true, data: { session_id: "session", state: "connecting", transport: "websocket-v2" } }; },
    async closeSession() { return { ok: true }; },
    async reportQuality(value) { reports.push(value); return { ok: true }; },
  });
  await client.createSession("device");
  const pending = client.openStream("device", "session", { state() {}, frame() {}, error() {} });
  await new Promise(setImmediate);
  const socket = Socket.latest;
  socket.onopen(); socket.message({ type: "state", state: "active", acked_seq: 0 });
  const stream = (await pending).data;
  try {
    socket.bufferedAmount = 70_000;
    for (let i = 0; i < 1000; i++) assert.equal(stream.send({ kind: "move", x: i / 1000, y: .5 }), true);
    const collector = hub.forSession("session");
    assert.deepEqual(collector.report().input, { ws_count: 0, dc_count: 0 });
    assert.equal(stream.inputHistory.size, 0, "unwritten input has no timestamp record");
    assert.equal(stream.diagnostics().queued_count, 1);
    socket.bufferedAmount = 0;
    await new Promise(resolve => setTimeout(resolve, 35));
    assert.equal(socket.sent.filter(value => value.type === "input").length, 1);
    assert.deepEqual(collector.report().input, { ws_count: 1, dc_count: 0 });
    assert.equal(stream.inputHistory.size, 1);
    const sent = [], listeners = new Set();
    stream.attachDataChannel({ send(text) { sent.push(JSON.parse(text)); return true; }, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } });
    const probe = sent.at(-1);
    assert.equal(probe.a.kind, "release_all");
    assert.deepEqual(collector.report().input, { ws_count: 1, dc_count: 0 });
    for (const listener of listeners) listener({ t: "rd.input_ack", v: 1, sid: "session", acked_seq: probe.seq });
    stream.send({ kind: "keypress", key: "Enter" });
    assert.equal(sent.at(-1).a.kind, "keypress");
    assert.deepEqual(collector.report().input, { ws_count: 1, dc_count: 1 });
    assert.equal(stream.inputHistory.get(sent.at(-1).seq).lane, "data_channel");
    assert.equal(stream.diagnostics().ws_write_count, collector.report().input.ws_count);
    assert.equal(stream.diagnostics().dc_write_count, collector.report().input.dc_count);
    assert.equal(stream.diagnostics().dc_probe_write_count, 1);
    await client.closeSession("device", "session");
    assert.deepEqual(reports[0].input, { ws_count: 1, dc_count: 1 });
    stream.close();
    assert.equal(stream.inputHistory.size, 0);
    assert.equal(listeners.size, 0);
  } finally { stream.close(); }
});

test("legacy HTTP counts a confirmed input submission and excludes failed attempts", async () => {
  const reports = []; let ok = false;
  const hub = new RemoteDesktopQualityHub(() => 0, env);
  const client = hub.wrap({
    async createSession() { return { ok: true, data: { session_id: "http", state: "connecting", transport: "http-v1" } }; },
    async sendInput() { return { ok }; }, async closeSession() { return { ok: true }; },
    async reportQuality(value) { reports.push(value); },
  });
  await client.createSession("device");
  await client.sendInput("device", "http", 1, { kind: "move" });
  ok = true; await client.sendInput("device", "http", 2, { kind: "move" });
  await client.closeSession("device", "http");
  assert.deepEqual(reports[0].input, { ws_count: 1, dc_count: 0 });
});

test("receipt consumers share the original write record without erasing opt-in picture measurement", () => {
  let now = 10_000;
  const history = new RemoteInputHistory(() => now, 500_000);
  const metrics = new RemoteTransportDiagnostics(() => now, history);
  const samples = [];
  const timing = new RemoteControlTimings(() => now, value => { samples.push(value); metrics.control(value); }, history);
  const measure = new RemoteDesktopMeasurements("shared", () => now + 500_000);
  measure.setEnabled(true); measure.setInputHistory(history);
  const entry = history.written(1, "data_channel", { kind: "move" });
  metrics.written("data_channel", 1); timing.sent(1, true); measure.inputSent(1);
  now += 25; timing.admittedThrough(1); metrics.observe({ dc_input_seq: 1, input_completed_seq: 0 });
  now += 25; timing.completedThrough(1); metrics.observe({ input_completed_seq: 1 });
  assert.equal(history.get(1), entry);
  assert.equal(entry.sentAt, 10_000);
  assert.equal(entry.picturePending, true, "admission/completion cannot consume the picture reader's record");
  assert.deepEqual(samples.map(value => [value.stage, value.elapsedMs]), [["direct_ack", 25], ["completion_watermark", 50]]);
  for (let seq = 2; seq <= 1000; seq++) history.written(seq, "websocket", { kind: "move" });
  assert.equal(history.size, 256);
  assert.equal(history.get(1), undefined);
  measure.setEnabled(false);
  assert.equal([...history.values()].some(value => value.picturePending), false);
  measure.dispose(); timing.dispose(); metrics.dispose(); history.clear();
  assert.equal(history.size, 0);
});


test("real HTTP input writes count 2xx, refused responses and each 401 retry while local auth/network failures stay unknown", async () => {
  const previousFetch = globalThis.fetch;
  try {
    for (const [name, replies, expectedWrites, token] of [
      ["accepted", [200], 1, "fixture-token"],
      ["refused", [403], 1, "fixture-token"],
      ["local_unauthorized", [], 0, null],
      ["network_unknown", ["network"], 0, "fixture-token"],
      ["reauthenticated", [401, 200], 2, "fixture-token"],
    ]) {
      globalThis.__rdTelemetryToken = token;
      let requests = 0, callbacks = 0;
      globalThis.fetch = async (_url, init) => {
        const status = replies[requests++];
        assert.deepEqual(Object.keys(JSON.parse(init.body)), ["seq", "action"]);
        if (status === "network") throw new TypeError("network unavailable");
        return new Response(JSON.stringify(status < 400 ? { accepted: true, seq: 1 } : { error: "input_not_allowed" }), { status });
      };
      const hub = new RemoteDesktopQualityHub(() => 0, env), reports = [];
      const client = hub.wrap({ ...api.remoteDesktopClient,
        async createSession() { return { ok: true, data: { session_id: name, state: "connecting", transport: "http-v1" } }; },
        async closeSession() { return { ok: true }; },
        async reportQuality(value) { reports.push(value); return { ok: true }; },
      });
      await client.createSession("device");
      const result = await client.sendInput("device", name, 1, { kind: "move", x: .5, y: .5 }, {
        inputWritten() { callbacks++; throw new Error("observer cannot affect the request"); },
      });
      await client.closeSession("device", name);
      assert.equal(reports[0].input.ws_count, expectedWrites, name);
      assert.equal(callbacks, expectedWrites, name);
      assert.equal(requests, replies.length, name);
      assert.equal(result.ok, name === "accepted" || name === "reauthenticated", name);
    }
  } finally { globalThis.fetch = previousFetch; delete globalThis.__rdTelemetryToken; }
});
