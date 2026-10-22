// 通话格子排序与说话检测（engine/ordering.ts、engine/speaking.ts，纯函数，时间注入）。合同 §3.1、§1 A4。
//
// 跑法：node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test tests/call-engine-ordering.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

import {
  EMPTY_ORDERING,
  SWAP_IN_SPEAKING_MS,
  SWAP_MIN_INTERVAL_MS,
  SWAP_PROTECT_RECENT_MS,
  computeOrder,
  pageOf,
  updateOrdering,
} from "../src/shell/messages/call/engine/ordering.ts";
import { QUIET_SPEAKER, SPEAKING_DEFAULTS, silence, updateSpeaker, viewLevel } from "../src/shell/messages/call/engine/speaking.ts";

const T0 = 1_000_000;

/** people: ["me", "a", "b", …]（第一个是自己），入场时间按下标递增 1 秒。 */
function roster(ids) {
  return ids.map((id, index) => ({ id, isMe: id === "me", joinedAt: T0 + index * 1_000 }));
}

/** 跑一轮：speaking = { id: { since, last } }（毫秒偏移，相对 T0）。 */
function step(previous, ids, now, speaking = {}, capacity = 4) {
  const info = {};
  for (const [id, value] of Object.entries(speaking)) {
    info[id] = {
      speakingSince: value.since === null || value.since === undefined ? null : T0 + value.since,
      lastSpokeAt: value.last === null || value.last === undefined ? null : T0 + value.last,
    };
  }
  return updateOrdering(previous, { participants: roster(ids), speaking: info, capacity, now: T0 + now });
}

test("order: self first, then stable entry order; newcomers go last; leavers drop out", () => {
  let state = step(EMPTY_ORDERING, ["a", "me", "b"], 0);
  assert.deepEqual(state.order, ["me", "a", "b"]);
  state = step(state, ["c", "a", "me", "b"], 1_000);
  assert.deepEqual(state.order, ["me", "a", "b", "c"], "a newcomer is appended even if listed first");
  state = step(state, ["me", "b", "c"], 2_000);
  assert.deepEqual(state.order, ["me", "b", "c"]);
  state = step(state, ["me", "b", "c", "a"], 3_000);
  assert.deepEqual(state.order, ["me", "b", "c", "a"], "someone who comes back joins at the end");
  assert.deepEqual(computeOrder(["x", "x", "y"], roster(["me", "y", "x"])), ["me", "x", "y"], "duplicates are ignored");
});

test("everyone fits: all visible, no overflow; speaking never moves anybody", () => {
  let state = step(EMPTY_ORDERING, ["me", "a", "b"], 0);
  assert.deepEqual(state.visible, ["me", "a", "b"]);
  assert.equal(state.overflowCount, 0);
  state = step(state, ["me", "a", "b"], 10_000, { b: { since: 7_000, last: 10_000 } });
  assert.deepEqual(state.order, ["me", "a", "b"], "speaking only lights the tile");
  assert.deepEqual(state.visible, ["me", "a", "b"]);
});

test("overflow: dock shows self + the earliest three, +N counts the rest", () => {
  const state = step(EMPTY_ORDERING, ["me", "a", "b", "c", "d", "e"], 0);
  assert.deepEqual(state.visible, ["me", "a", "b", "c"]);
  assert.equal(state.overflowCount, 2);
  assert.deepEqual(state.order, ["me", "a", "b", "c", "d", "e"]);
});

test("a hidden person swaps in only after speaking continuously for 2.5 s", () => {
  const ids = ["me", "a", "b", "c", "d"];
  let state = step(EMPTY_ORDERING, ids, 0);
  state = step(state, ids, 20_000 + SWAP_IN_SPEAKING_MS - 1, { d: { since: 20_000, last: 20_000 + SWAP_IN_SPEAKING_MS - 1 } });
  assert.deepEqual(state.visible, ["me", "a", "b", "c"], "2.499 s is not enough");
  assert.equal(state.lastSwapAt, null);
  state = step(state, ids, 20_000 + SWAP_IN_SPEAKING_MS, { d: { since: 20_000, last: 20_000 + SWAP_IN_SPEAKING_MS } });
  assert.deepEqual(state.visible, ["me", "d", "b", "c"], "d takes the slot of the longest-silent person (a), in place");
  assert.equal(state.lastSwapAt, T0 + 20_000 + SWAP_IN_SPEAKING_MS);
  assert.deepEqual(state.order, ids, "order itself never changes");
  assert.equal(state.overflowCount, 1);
});

test("the swapped-out tile is the one silent the longest; self is never swapped out", () => {
  const ids = ["me", "a", "b", "c", "d"];
  let state = step(EMPTY_ORDERING, ids, 0);
  // a 说过话（10 s 前），b 从没说过（入场 2 s），c 很久以前说过（入场后 1 s 就说过一句）。
  const now = 30_000;
  state = step(state, ids, now, {
    a: { since: null, last: 20_000 },
    b: { since: null, last: null },
    c: { since: null, last: 3_500 },
    d: { since: 26_000, last: now },
    me: { since: null, last: 1_000 },
  });
  // 沉默起点：a=20 s，b=入场 2 s，c=3.5 s → b 最久没说话。
  assert.deepEqual(state.visible, ["me", "a", "d", "c"]);
});

test("two swaps are at least 5 s apart", () => {
  const ids = ["me", "a", "b", "c", "d", "e"];
  let state = step(EMPTY_ORDERING, ids, 0);
  state = step(state, ids, 10_000, { d: { since: 7_000, last: 10_000 } });
  assert.deepEqual(state.visible, ["me", "d", "b", "c"]);
  const firstSwap = state.lastSwapAt;
  // e 已经连续说了 3 s，但距上次换位才 4.999 s。
  state = step(state, ids, 10_000 + SWAP_MIN_INTERVAL_MS - 1, {
    d: { since: null, last: 10_000 },
    e: { since: 12_000, last: 10_000 + SWAP_MIN_INTERVAL_MS - 1 },
  });
  assert.deepEqual(state.visible, ["me", "d", "b", "c"]);
  assert.equal(state.lastSwapAt, firstSwap);
  state = step(state, ids, 10_000 + SWAP_MIN_INTERVAL_MS, {
    d: { since: null, last: 10_000 },
    e: { since: 12_000, last: 10_000 + SWAP_MIN_INTERVAL_MS },
  });
  assert.deepEqual(state.visible, ["me", "d", "e", "c"], "b (never spoke) goes; d spoke 5 s ago so it is not protected but is more recent");
});

test("anyone who spoke within the last 3 s is protected from being swapped out", () => {
  const ids = ["me", "a", "b", "c", "d"];
  let state = step(EMPTY_ORDERING, ids, 0);
  const now = 40_000;
  const recent = now - SWAP_PROTECT_RECENT_MS + 1; // 2.999 s 前说过话
  state = step(state, ids, now, {
    a: { since: null, last: recent },
    b: { since: null, last: recent },
    c: { since: now - 10_000, last: now }, // 正在说
    d: { since: now - 5_000, last: now },
  });
  assert.deepEqual(state.visible, ["me", "a", "b", "c"], "nobody can be swapped out, so d waits");
  assert.equal(state.lastSwapAt, null);
  state = step(state, ids, now + 1, {
    a: { since: null, last: recent },
    b: { since: null, last: now - SWAP_PROTECT_RECENT_MS - 500 }, // 3.5 s 前
    c: { since: now - 10_000, last: now + 1 },
    d: { since: now - 5_000, last: now + 1 },
  });
  assert.deepEqual(state.visible, ["me", "a", "d", "c"], "b fell out of the 3 s window and is replaced");
});

test("when several hidden people qualify, the one speaking the longest comes in first", () => {
  const ids = ["me", "a", "b", "c", "d", "e"];
  let state = step(EMPTY_ORDERING, ids, 0);
  state = step(state, ids, 20_000, { d: { since: 16_000, last: 20_000 }, e: { since: 12_000, last: 20_000 } });
  assert.deepEqual(state.visible, ["me", "e", "b", "c"]);
});

test("a visible person leaving frees the slot in place for the earliest hidden person", () => {
  const ids = ["me", "a", "b", "c", "d", "e"];
  let state = step(EMPTY_ORDERING, ids, 0);
  assert.deepEqual(state.visible, ["me", "a", "b", "c"]);
  state = step(state, ["me", "a", "c", "d", "e"], 5_000);
  assert.deepEqual(state.visible, ["me", "a", "d", "c"], "d fills b's slot; c does not move");
  assert.equal(state.overflowCount, 1);
  state = step(state, ["me", "a", "c"], 6_000);
  assert.deepEqual(state.visible, ["me", "a", "c"], "nobody left to fill: the slot is dropped");
  assert.equal(state.overflowCount, 0);
});

test("self stays in slot 0 and a shrinking capacity drops the longest-silent tiles", () => {
  const ids = ["me", "a", "b", "c", "d", "e", "f", "g", "h"];
  let state = step(EMPTY_ORDERING, ids, 0, {}, 9);
  assert.equal(state.visible.length, 9);
  state = step(state, ids, 50_000, { a: { since: null, last: 49_000 }, h: { since: null, last: 48_000 } }, 4);
  assert.equal(state.visible[0], "me");
  assert.equal(state.visible.length, 4);
  assert.ok(state.visible.includes("a") && state.visible.includes("h"), "recent speakers survive the shrink");
  assert.equal(state.overflowCount, 5);
});

test("stage pages slice the stable order: 9 per page (4 on phones), clamped", () => {
  const order = Array.from({ length: 20 }, (_, i) => `p${i}`);
  assert.deepEqual(pageOf(order, 0, 9), { ids: order.slice(0, 9), page: 0, pages: 3 });
  assert.deepEqual(pageOf(order, 2, 9).ids, order.slice(18));
  assert.equal(pageOf(order, 7, 9).page, 2, "out-of-range pages clamp to the last page");
  assert.equal(pageOf(order, 0, 4).pages, 5);
  assert.deepEqual(pageOf([], 0, 9), { ids: [], page: 0, pages: 1 });
});

test("speaking detection: smoothed level, two thresholds and a hold time", () => {
  let s = QUIET_SPEAKER;
  s = updateSpeaker(s, 2, 0);
  assert.equal(s.speaking, false, "background noise is not speech");
  s = updateSpeaker(s, 40, 300);
  assert.equal(s.speaking, true);
  assert.equal(s.speakingSince, 300);
  assert.equal(s.lastSpokeAt, 300);
  s = updateSpeaker(s, 30, 600);
  assert.equal(s.speakingSince, 300, "a continuous run keeps its start");
  // 一个字间停顿（300 ms 的 0）不会结束这一段。
  s = updateSpeaker(s, 0, 900);
  assert.equal(s.speaking, true, "a short pause does not end the run");
  s = updateSpeaker(s, 35, 1_200);
  assert.equal(s.speakingSince, 300, "speech after a short pause continues the same run");
  // 真停下来：每 300 ms 一个 0，最晚 1.5 s 内熄灭，且不早于拖尾时间。
  let stoppedAt = null;
  for (let t = 1_500; t <= 4_000; t += 300) {
    s = updateSpeaker(s, 0, t);
    if (!s.speaking) {
      stoppedAt = t;
      break;
    }
  }
  assert.ok(stoppedAt !== null, "silence ends the run");
  assert.ok(stoppedAt - 1_200 >= SPEAKING_DEFAULTS.holdMs, "not before the hold time");
  assert.ok(stoppedAt - 1_200 <= 1_500, `ring turns off within 1.5 s after speech (took ${stoppedAt - 1_200} ms)`);
  assert.equal(s.speakingSince, null);
  assert.ok(s.lastSpokeAt >= 1_200, "lastSpokeAt survives the end of the run");
  const muted = silence({ ...s, speaking: true, speakingSince: 5, level: 30 });
  assert.equal(muted.speaking, false);
  assert.equal(muted.level, 0);
  assert.equal(muted.lastSpokeAt, s.lastSpokeAt);
});

test("view level is a 0-1 value rounded to two decimals", () => {
  assert.equal(viewLevel(undefined), 0);
  assert.equal(viewLevel({ ...QUIET_SPEAKER, level: 20 }), 0.5);
  assert.equal(viewLevel({ ...QUIET_SPEAKER, level: 400 }), 1);
  assert.equal(viewLevel({ ...QUIET_SPEAKER, level: -3 }), 0);
});
