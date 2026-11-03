import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { compileModule } from "./helpers/module-bench.mjs";

const { runDeviceSettingsOperation } = await import(await compileModule("src/pages/devices/device-settings-state.ts"));

async function measured(operation) {
  const started = performance.now();
  let watchdog;
  try {
    const result = await Promise.race([
      operation,
      new Promise((resolve) => { watchdog = setTimeout(() => resolve({ ok: false, error: "still_waiting" }), 150); }),
    ]);
    return { result, elapsed: performance.now() - started };
  } finally { clearTimeout(watchdog); }
}

for (const stall of ["start", "receipt"]) {
  test(`settings deadline releases busy state when the ${stall} request never replies`, async (t) => {
    const calls = { starts: 0, polls: 0, aborted: 0 };
    const never = (signal) => new Promise(() => {
      signal.addEventListener("abort", () => { calls.aborted += 1; }, { once: true });
    });
    const client = {
      startOperation(_id, _operation, signal) {
        calls.starts += 1;
        return stall === "start" ? never(signal) : Promise.resolve({ ok: true, data: { state: "pending", operation_id: "receipt-1" } });
      },
      getOperation(_id, _receipt, signal) { calls.polls += 1; return never(signal); },
    };
    const { result, elapsed } = await measured(runDeviceSettingsOperation(client, "target", { kind: "remote_access.update", enabled: false, input_allowed: true, agent_control_allowed: false, agent_always_ask: true }, new AbortController().signal, { intervalMs: 1, timeoutMs: 20 }));
    t.diagnostic(`${stall}: ${result.error} after ${elapsed.toFixed(1)}ms; starts=${calls.starts}, polls=${calls.polls}, aborted=${calls.aborted}`);
    assert.equal(result.error, "request_expired");
    assert.equal(calls.starts, 1, "a timed-out mutation is never replayed");
    assert.equal(calls.aborted, 1, "deadline aborts the pending transport request");
    const polls = calls.polls;
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(calls.polls, polls, "no receipt polling continues after the deadline");
  });
}

test("closing settings cancels an unresponsive operation immediately", async () => {
  const controller = new AbortController();
  let transportAborted = false;
  const pending = runDeviceSettingsOperation({
    startOperation(_id, _operation, signal) {
      signal.addEventListener("abort", () => { transportAborted = true; }, { once: true });
      return new Promise(() => {});
    },
  }, "target", { kind: "cover.read" }, controller.signal, { timeoutMs: 1_000 });
  controller.abort();
  const { result } = await measured(pending);
  assert.equal(result.error, "aborted");
  assert.equal(transportAborted, true);
});
