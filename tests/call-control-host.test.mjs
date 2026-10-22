// W09 被控方逻辑：桌面桥有/无两条路径、非整屏拒绝、首次防骗提醒、被控期间自停、会话仓对账与过期、
// 桥返回值归一化、decline 原因映射。测 host-logic / bridge / control-store 的真实现（纯 TS，无 DOM）。
import test from "node:test";
import assert from "node:assert/strict";

import {
  antiFraudSeen,
  decideControlRequest,
  declineAfterOffer,
  gatewayOriginOf,
  isWholeScreenShare,
  markAntiFraudSeen,
  targetStopReason,
} from "../src/shell/messages/call/control/host-logic.ts";
import { normalizeOfferResult, readCallControlBridge } from "../src/shell/messages/call/control/bridge.ts";
import {
  createControlStore,
  isLiveControlState,
  normalizeControlView,
  pendingDeadlineMs,
} from "../src/shell/messages/call/control/control-store.ts";

const MONITOR = { width: 1920, height: 1080, displaySurface: "monitor" };
const WINDOW = { width: 1280, height: 720, displaySurface: "window" };

// ---- 整屏判定 ----
test("isWholeScreenShare：只有 displaySurface=monitor 且尺寸有效才算整屏", () => {
  assert.ok(isWholeScreenShare(MONITOR));
  assert.ok(!isWholeScreenShare(WINDOW));
  assert.ok(!isWholeScreenShare({ width: 0, height: 0, displaySurface: "monitor" }));
  assert.ok(!isWholeScreenShare(null));
});

// ---- 收到请求的分流 ----
test("decideControlRequest：普通浏览器（无桥）→ 卡片提示去桌面客户端同意", () => {
  const d = decideControlRequest({ inThisCall: true, pending: true, hasBridge: false, surface: MONITOR });
  assert.deepEqual(d, { action: "browser_card" });
});

test("decideControlRequest：桌面桥 + 整屏 → 调桥 offer", () => {
  const d = decideControlRequest({ inThisCall: true, pending: true, hasBridge: true, surface: MONITOR });
  assert.deepEqual(d, { action: "offer" });
});

test("decideControlRequest：桌面桥但共享的是窗口（非整屏）→ 自动拒绝，不调桥", () => {
  const d = decideControlRequest({ inThisCall: true, pending: true, hasBridge: true, surface: WINDOW });
  assert.deepEqual(d, { action: "decline_not_whole_screen" });
});

test("decideControlRequest：不在这通通话里 / 已不待批准 → 不管", () => {
  assert.deepEqual(decideControlRequest({ inThisCall: false, pending: true, hasBridge: true, surface: MONITOR }), {
    action: "ignore",
    why: "not_in_call",
  });
  assert.deepEqual(decideControlRequest({ inThisCall: true, pending: false, hasBridge: true, surface: MONITOR }), {
    action: "ignore",
    why: "not_pending",
  });
});

// ---- 桥返回值 → 补拒绝原因（A-6） ----
test("declineAfterOffer：approved 不补拒绝；其余按 A-6 原因补拒绝", () => {
  assert.equal(declineAfterOffer("approved"), null);
  assert.equal(declineAfterOffer("timeout"), "timeout");
  assert.equal(declineAfterOffer("unsupported"), "unsupported");
  assert.equal(declineAfterOffer("declined"), "user");
});

test("normalizeOfferResult：认不出的决定按 unsupported（绝不当成同意）", () => {
  assert.deepEqual(normalizeOfferResult({ decision: "approved" }), { decision: "approved", reason: null });
  assert.deepEqual(normalizeOfferResult({ decision: "timeout", reason: "no one home" }), {
    decision: "timeout",
    reason: "no one home",
  });
  assert.equal(normalizeOfferResult({ decision: "yes" }).decision, "unsupported");
  assert.equal(normalizeOfferResult(null).decision, "unsupported");
  assert.equal(normalizeOfferResult("approved").decision, "unsupported");
});

// ---- 桥读取：形状不对就当没有 ----
test("readCallControlBridge：版本不对或方法缺失一律视为没有桥", () => {
  const good = { version: 1, offer: () => {}, stop: () => {}, onState: () => () => {} };
  assert.equal(readCallControlBridge({ __oceanleoCallControl: good }), good);
  assert.equal(readCallControlBridge({ __oceanleoCallControl: { version: 2, offer() {}, stop() {}, onState() {} } }), null);
  assert.equal(readCallControlBridge({ __oceanleoCallControl: { version: 1, offer() {} } }), null);
  assert.equal(readCallControlBridge({}), null);
  assert.equal(readCallControlBridge(null), null);
});

// ---- 被控期间自停 ----
test("targetStopReason：离开通话 / 停止共享 / 共享改成窗口 → 各自停止原因", () => {
  const base = { phase: "connected", callId: "c1", sessionCallId: "c1", screenOn: true, surface: MONITOR };
  assert.equal(targetStopReason(base), null);
  assert.equal(targetStopReason({ ...base, phase: "idle" }), "left_call");
  assert.equal(targetStopReason({ ...base, callId: "other" }), "left_call");
  assert.equal(targetStopReason({ ...base, screenOn: false }), "share_stopped");
  assert.equal(targetStopReason({ ...base, surface: WINDOW }), "not_whole_screen");
  assert.equal(targetStopReason({ ...base, phase: "reconnecting" }), null); // 重连中仍算在通话里
});

// ---- 防骗提醒（记忆） ----
test("antiFraud：首次未读 → 提醒；记住后不再提醒；storage 抛错也不崩", () => {
  const mem = new Map();
  const storage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, v),
  };
  assert.equal(antiFraudSeen(storage), false);
  markAntiFraudSeen(storage);
  assert.equal(antiFraudSeen(storage), true);
  assert.equal(antiFraudSeen(null), false);
  const throwing = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(antiFraudSeen(throwing), false);
  markAntiFraudSeen(throwing); // 不抛
});

test("gatewayOriginOf：取 origin；空/相对地址退回页面 origin", () => {
  assert.equal(gatewayOriginOf("https://api.dev.oceanleo.com/v1", "https://p.dev.oceanleo.com"), "https://api.dev.oceanleo.com");
  assert.equal(gatewayOriginOf("", "https://p.dev.oceanleo.com"), "https://p.dev.oceanleo.com");
  assert.equal(gatewayOriginOf("not a url", "https://p.dev.oceanleo.com"), "https://p.dev.oceanleo.com");
});

// ---- 会话仓 ----
function store() {
  let now = 1000;
  return { s: createControlStore({ now: () => now }), set: (v) => (now = v), add: (ms) => (now += ms) };
}

const VIEW = {
  session_id: "s1",
  call_id: "c1",
  controller_id: "u-ctrl",
  target_id: "u-tgt",
  state: "pending",
  created_at: "2026-10-23T00:00:00.000Z",
  expires_at: "2026-10-23T00:01:30.000Z",
  approved_at: null,
  ended_at: null,
  end_reason: null,
};

test("normalizeControlView：缺关键字段 → null", () => {
  assert.equal(normalizeControlView(null), null);
  assert.equal(normalizeControlView({ session_id: "s" }), null);
  assert.ok(normalizeControlView(VIEW));
});

test("仓：状态只往前走，迟到的旧状态丢弃", () => {
  const { s } = store();
  s.ingest({ ...VIEW, state: "active", approved_at: "2026-10-23T00:00:05.000Z" });
  const stale = s.ingest({ ...VIEW, state: "pending" });
  assert.equal(stale, null); // active 之后不回退到 pending
  assert.equal(s.get("s1").state, "active");
});

test("仓：服务端终态可改写本端推断的终态，反之不行", () => {
  const { s } = store();
  s.ingest({ ...VIEW, state: "active" });
  s.markLocal("s1", "ended", "connection_lost"); // 本端推断
  assert.equal(s.get("s1").end_reason, "connection_lost");
  s.ingest({ ...VIEW, state: "ended", end_reason: "idle" }); // 服务端权威
  assert.equal(s.get("s1").end_reason, "idle");
  s.ingest({ ...VIEW, state: "ended", end_reason: "something_else" }); // 服务端终态不再被改写
  assert.equal(s.get("s1").end_reason, "idle");
});

test("仓：reconcileCall 把本仓里活着、但 controls 已不含且超过宽限的会话收成 ended", () => {
  const { s, add } = store();
  s.ingest({ ...VIEW, state: "active" });
  // controls 里没有 s1，但还没过宽限期 → 不动
  s.reconcileCall("c1", []);
  assert.equal(s.get("s1").state, "active");
  add(4000); // 过 3 秒宽限
  s.reconcileCall("c1", []);
  assert.equal(s.get("s1").state, "ended");
});

test("仓：expireOverdue 把过了 90 秒还 pending 的会话收成 expired(timeout)", () => {
  const { s, set } = store();
  s.ingest(VIEW); // expires_at = 00:01:30
  set(Date.parse("2026-10-23T00:01:35.000Z")); // 过期 + 宽限
  const transitions = s.expireOverdue();
  assert.equal(transitions.length, 1);
  assert.equal(s.get("s1").state, "expired");
  assert.equal(s.get("s1").end_reason, "timeout");
});

test("仓：被控方请求存储，会话离开 pending 即撤掉", () => {
  const { s } = store();
  assert.ok(s.addRequest({ call_id: "c1", session_id: "s1", controller_id: "u-ctrl", conversation_id: "conv", expires_at: VIEW.expires_at }));
  assert.equal(s.snapshot().requests.length, 1);
  s.ingest({ ...VIEW, state: "active" });
  assert.equal(s.snapshot().requests.length, 0); // active 后请求撤掉
});

test("pendingDeadlineMs / isLiveControlState", () => {
  assert.equal(pendingDeadlineMs(VIEW, 0), Date.parse("2026-10-23T00:01:30.000Z"));
  assert.equal(pendingDeadlineMs({ created_at: "2026-10-23T00:00:00.000Z" }, 0), Date.parse("2026-10-23T00:00:00.000Z") + 90_000);
  assert.equal(pendingDeadlineMs({}, 5000), 95_000);
  assert.ok(isLiveControlState("pending"));
  assert.ok(isLiveControlState("active"));
  assert.ok(!isLiveControlState("ended"));
});
