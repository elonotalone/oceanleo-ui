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
  now += 50; timing.receipt({ seq: 1, status: "executed", executed_at_ms: 1 });
  assert.equal(history.get(1), entry);
  assert.equal(entry.sentAt, 10_000);
  assert.equal(entry.picturePending, true, "admission/completion cannot consume the picture reader's record");
  assert.deepEqual(samples.map(value => [value.stage, value.elapsedMs]), [["input_receipt", 50]]);
  for (let seq = 2; seq <= 1000; seq++) history.written(seq, "websocket", { kind: "move" });
  assert.equal(history.size, 256);
  assert.equal(history.get(1), undefined);
  measure.setEnabled(false);
  assert.equal([...history.values()].some(value => value.picturePending), false);
  measure.dispose(); timing.dispose(); metrics.dispose(); history.clear();
  assert.equal(history.size, 0);
});
