import assert from "node:assert/strict";
import test from "node:test";
import { createStreamingTextBuffer } from "../src/shell/agent-thread/streaming-text.ts";

function harness() {
  let now = 0;
  let seq = 0;
  const pending = new Map();
  const seen = [];
  const buffer = createStreamingTextBuffer(
    text => seen.push({ text, at: now }),
    (run, delay) => { const id = ++seq; pending.set(id, { run, due: now + delay }); return id; },
    id => pending.delete(id),
  );
  function step() {
    const [id, next] = [...pending].sort((a, b) => a[1].due - b[1].due)[0] || [];
    if (!next) return false;
    pending.delete(id); now = next.due; next.run(); return true;
  }
  return { buffer, seen, pending, step, drain() { while (step()); } };
}

test("live CJK chunks display one grapheme per tick and appending does not restart the timer", () => {
  const h = harness();
  h.buffer.update("这是第一段", true);
  assert.equal(h.seen[0].text, "这");
  h.step();
  h.buffer.update("这是第一段继续写", true);
  h.drain();
  assert.deepEqual(h.seen.map(x => x.text), ["这", "这是", "这是第", "这是第一", "这是第一段", "这是第一段继", "这是第一段继续", "这是第一段继续写"]);
  assert.ok(h.seen.slice(1).every((x, i) => x.at > h.seen[i].at));
  assert.ok(h.seen.at(-1).at < 300);
});

test("emoji families, combining marks and flags never split into broken characters", () => {
  const h = harness();
  const pieces = ["中", "👨‍👩‍👧‍👦", "é", "🇨🇳", "文"];
  h.buffer.update(pieces.join(""), true); h.drain();
  assert.deepEqual(h.seen.map(x => x.text), pieces.map((_, i) => pieces.slice(0, i + 1).join("")));
});

test("completed history is immediate, final correction and stop flush pending text", () => {
  const h = harness();
  h.buffer.update("历史完整回答", false);
  assert.deepEqual(h.seen.map(x => x.text), ["历史完整回答"]);
  h.buffer.update("历史完整回答还有正在输出", true);
  assert.ok(h.pending.size);
  h.buffer.update("最终校正后的完整回答", false);
  assert.equal(h.seen.at(-1).text, "最终校正后的完整回答");
  assert.equal(h.pending.size, 0);
});

test("large frames catch up in less than 1 second; dispose cancels all later publishes", () => {
  const h = harness();
  h.buffer.update("字".repeat(1000), true); h.drain();
  assert.equal(h.seen.at(-1).text.length, 1000);
  assert.ok(h.seen.at(-1).at < 1000);
  h.buffer.update("字".repeat(1010), true);
  const count = h.seen.length;
  h.buffer.dispose(); h.drain();
  assert.equal(h.seen.length, count);
  assert.equal(h.pending.size, 0);
});
