import assert from "node:assert/strict";
import test from "node:test";
import { boundedHistoryListRequest, readHistoryListSource, historyInitialRetryDelayMs, historyActionFailureText } from "../src/lib/history-list-api.ts";

test("a list deadline aborts transport and settles even if authentication ignores cancellation", async () => {
  let signal;
  await assert.rejects(boundedHistoryListRequest((value) => {
    signal = value;
    return new Promise(() => {});
  }, { timeoutMs: 15 }), (error) => error.status === 408 && error.code === "history_list_timeout");
  assert.equal(signal.aborted, true);
});

test("cancelling a view aborts its list read; an already cancelled view starts no read", async () => {
  const controller = new AbortController();
  let signal;
  const pending = boundedHistoryListRequest((value) => {
    signal = value;
    return new Promise(() => {});
  }, { signal: controller.signal });
  await Promise.resolve();
  controller.abort();
  await assert.rejects(pending, (error) => error.code === "history_list_aborted");
  assert.equal(signal.aborted, true);
  let started = false;
  await assert.rejects(boundedHistoryListRequest(async () => { started = true; }, { signal: controller.signal }));
  assert.equal(started, false);
});

test("thrown errors, timeouts and malformed partial APIs remain failures, never empty successes", async () => {
  const rejected = await readHistoryListSource(() => { throw new Error("native list unavailable"); });
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /native list unavailable/);
  const timeout = await readHistoryListSource(() => new Promise(() => {}), { timeoutMs: 15 });
  assert.equal(timeout.status, 408);
  for (const data of [undefined, {}, { items: null }, { items: "bad" },
    { items: [null] }, { items: [{}] }, { items: [{ id: " " }] }, { items: ["partial"] }]) {
    const result = await readHistoryListSource(async () => ({ ok: true, data }));
    assert.equal(result.ok, false);
    assert.equal(result.status, 502);
  }
  const empty = await readHistoryListSource(async () => ({ ok: true, data: { items: [] } }));
  assert.equal(empty.ok, true);
});

test("initial retries cap at 30 seconds and action failures never repeat transport text", () => {
  assert.deepEqual([0,1,2,3,4,10].map(historyInitialRetryDelayMs), [2000,4000,8000,16000,30000,30000]);
  for (const error of ["Network error: can't reach the AI gateway.", "Failed to fetch", "加载超时，请重试。", "网络错误"]) {
    assert.equal(historyActionFailureText({error}, "删除失败，请重试。"), "删除失败，请重试。");
  }
  assert.notEqual(historyActionFailureText({error:"LOCAL_AGENT_STOP_PENDING"}, "删除失败，请重试。"), "删除失败，请重试。");
});
