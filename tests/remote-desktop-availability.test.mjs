import assert from "node:assert/strict";
import test from "node:test";
import { document, window } from "./helpers/remote-desktop-dom.mjs";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const { useDeviceCloudAgent } = await import(await compileModule("src/pages/devices/use-device-cloud-agent.ts", {
  "../../lib/cloud-agent-api": dataModule('export async function listCloudAgentAvailability(){ throw new Error("inject test client"); }'),
}));
const { parseCloudAgentAvailability } = await import("../src/lib/execution-target.ts");
const { parseLocalAgentRun } = await import("../src/lib/local-agent-task.ts");

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
async function mount(client) {
  let current;
  const settings = { async getSettings() { return { ok: false }; } };
  function Probe() {
    current = useDeviceCloudAgent("synthetic-pc", settings, client);
    return React.createElement("output", null, current.agent?.text);
  }
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(Probe)); await flush(); });
  return { host, value: () => current, async close() { await act(async () => root.unmount()); host.remove(); } };
}
async function advance(t, ms) { await act(async () => { t.mock.timers.tick(ms); await flush(); }); }

test("unsupported gateway is named, stops availability polling, and does not block human remote consent", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let reads = 0;
  const view = await mount({ async availability() { reads++; return { kind: "absent", reason: "unsupported", status: 405 }; } });
  try {
    assert.match(view.host.textContent, /服务版本不支持 AI 电脑状态，远程桌面仍可单独连接/);
    assert.equal(view.value().agent.handBack, false);
    assert.equal(view.value().consent, undefined, "AI status cannot grant or deny human remote consent");
    await advance(t, 60000);
    await act(async () => { document.dispatchEvent(new window.Event("visibilitychange")); await flush(); });
    await advance(t, 60000);
    assert.equal(reads, 1, "a permanent405 never becomes an endless retry");
  } finally { await view.close(); }
});

test("transient availability failures back off and stop after three reads", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let reads = 0;
  const view = await mount({ async availability() { reads++; return { kind: "error", status: 503 }; } });
  try {
    assert.equal(reads, 1);
    await advance(t, 3999); assert.equal(reads, 1);
    await advance(t, 1); assert.equal(reads, 2);
    await advance(t, 7999); assert.equal(reads, 2);
    await advance(t, 1); assert.equal(reads, 3);
    await advance(t, 120000); assert.equal(reads, 3);
    assert.match(view.host.textContent, /暂时无法核对 AI 电脑状态/);
    assert.equal(view.value().agent.handBack, false);
  } finally { await view.close(); }
});

test("an unavailable status clears stale hand-back authority; a later confirmed read restores it", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const devices = parseCloudAgentAvailability({ devices: [{ device_id: "synthetic-pc", available: false, remote_takeover: false,
    live_session: { session_id: "cas_test", task_id: "synthetic-task", state: "paused", owner: "human" } }] });
  const run = parseLocalAgentRun({ run_id: "synthetic-run", device_id: "synthetic-pc", driver: "cloud", session_id: "cas_test",
    state: "paused", desired_state: "pause", control_revision: 3, report_seq: 4, owner: "human", health: { kind: "human_in_control" } });
  let failed = false, controls = 0;
  const client = {
    async availability() { return failed ? { kind: "error" } : { kind: "ok", devices }; },
    async taskRun() { return { kind: "ok", run }; },
    async control() { controls++; return { ok: true, run }; },
  };
  const view = await mount(client);
  try {
    assert.equal(view.value().agent.handBack, true);
    failed = true;
    await advance(t, 2000);
    assert.equal(view.value().agent.handBack, false);
    view.value().agent.onHandBack();
    assert.equal(controls, 0);
    failed = false;
    await advance(t, 4000);
    assert.equal(view.value().agent.handBack, true);
  } finally { await view.close(); }
});
