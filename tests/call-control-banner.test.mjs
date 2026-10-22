// W09 提示条与菜单模型（纯函数）：角色判定、提示条行（进行中 + 我的待批准）、倒计时秒数、
// 结束/拒绝原因 → 提示码、请求错误码 → 提示码、短提示去重与上限、菜单项状态机。
import test from "node:test";
import assert from "node:assert/strict";

import {
  bannerLines,
  bannerText,
  controlRole,
  declinedNoticeCode,
  endedNoticeCode,
  noticeForTransition,
  noticeText,
  requestErrorNotice,
  secondsLeft,
} from "../src/shell/messages/call/control/banner-model.ts";
import { controlMenuModel } from "../src/shell/messages/call/control/menu-model.ts";
import { createNoticeStore } from "../src/shell/messages/call/control/notices.ts";

const tt = (zh, vars) => (vars ? String(zh).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh);

function view(over = {}) {
  return {
    session_id: "s1",
    call_id: "c1",
    controller_id: "u-ctrl",
    target_id: "u-tgt",
    state: "active",
    created_at: "2026-10-23T00:00:00.000Z",
    expires_at: "2026-10-23T00:01:30.000Z",
    approved_at: null,
    ended_at: null,
    end_reason: null,
    ...over,
  };
}

// ---- 角色 ----
test("controlRole：我是控制方 / 被控方 / 旁观者", () => {
  assert.equal(controlRole(view(), "u-ctrl"), "controller");
  assert.equal(controlRole(view(), "u-tgt"), "target");
  assert.equal(controlRole(view(), "u-other"), "viewer");
  assert.equal(controlRole(view(), null), "viewer");
});

// ---- 提示条行 ----
test("bannerLines：进行中的控制所有人都看到；我的待批准请求也在；别的通话的不算", () => {
  const sessions = [
    view({ session_id: "a", state: "active" }),
    view({ session_id: "b", state: "pending", controller_id: "u-me", target_id: "u-x" }),
    view({ session_id: "c", state: "pending", controller_id: "u-other", target_id: "u-y" }), // 别人发的待批准：不显示
    view({ session_id: "d", state: "ended" }),
    view({ session_id: "e", state: "active", call_id: "other-call" }), // 别的通话
  ];
  const lines = bannerLines(sessions, { callId: "c1", meId: "u-me", now: 0 });
  const ids = lines.map((l) => l.sessionId);
  assert.deepEqual(ids, ["a", "b"]); // active 在前，我的 waiting 在后
  assert.equal(lines[0].kind, "active");
  assert.equal(lines[1].kind, "waiting");
  assert.ok(lines[1].deadlineMs > 0);
});

test("bannerLines：与我有关的进行中排在旁观的前面", () => {
  const sessions = [
    view({ session_id: "viewer", controller_id: "x", target_id: "y" }),
    view({ session_id: "mine", controller_id: "u-me", target_id: "z" }),
  ];
  const lines = bannerLines(sessions, { callId: "c1", meId: "u-me", now: 0 });
  assert.equal(lines[0].sessionId, "mine");
});

test("bannerText：四种角色文案；secondsLeft 向上取整不为负", () => {
  const names = { controller: "张三", target: "李四" };
  assert.equal(bannerText(tt, { kind: "active", role: "controller" }, names), "你正在控制李四的电脑");
  assert.equal(bannerText(tt, { kind: "active", role: "target" }, names), "张三正在控制你的电脑");
  assert.equal(bannerText(tt, { kind: "active", role: "viewer" }, names), "张三正在控制李四的电脑");
  assert.equal(bannerText(tt, { kind: "waiting", role: "controller" }, names), "等待李四在桌面客户端同意…");
  assert.equal(secondsLeft(5000, 1500), 4);
  assert.equal(secondsLeft(1000, 5000), 0);
  assert.equal(secondsLeft(null, 0), 0);
});

// ---- 结束 / 拒绝原因 → 提示码 ----
test("endedNoticeCode：把 W04 的 end_reason 归到提示码（认不出给通用）", () => {
  assert.equal(endedNoticeCode("idle_timeout"), "ended_idle");
  assert.equal(endedNoticeCode("max_duration"), "ended_max");
  assert.equal(endedNoticeCode("device_disconnected"), "ended_device");
  assert.equal(endedNoticeCode("call_ended"), "ended_call");
  assert.equal(endedNoticeCode("target_left"), "ended_left");
  assert.equal(endedNoticeCode("connection_lost"), "ended_connection");
  assert.equal(endedNoticeCode("controller_stop"), "ended_by_peer");
  assert.equal(endedNoticeCode("something_new"), "ended");
  assert.equal(endedNoticeCode(null), "ended");
});

test("declinedNoticeCode：A-6 四个原因各自成码", () => {
  assert.equal(declinedNoticeCode("share_entire_screen"), "declined_share_entire_screen");
  assert.equal(declinedNoticeCode("unsupported"), "declined_unsupported");
  assert.equal(declinedNoticeCode("timeout"), "declined_timeout");
  assert.equal(declinedNoticeCode("user"), "declined");
  assert.equal(declinedNoticeCode(null), "declined");
});

test("requestErrorNotice：429/409/不在场各自成码", () => {
  assert.equal(requestErrorNotice("rate_limited", 429), "request_rate_limited");
  assert.equal(requestErrorNotice(null, 429), "request_rate_limited");
  assert.equal(requestErrorNotice("already_active", 409), "request_busy");
  assert.equal(requestErrorNotice("not_participant", 403), "request_unavailable");
  assert.equal(requestErrorNotice("call_unavailable", 404), "request_unavailable");
  assert.equal(requestErrorNotice("boom", 500), "request_failed");
});

// ---- 状态变化 → 给「我」的提示 ----
test("noticeForTransition：控制方视角", () => {
  const prev = view({ state: "pending" });
  assert.equal(noticeForTransition({ previous: prev, next: view({ state: "active" }), local: false }, "u-ctrl", false), "approved");
  assert.equal(
    noticeForTransition({ previous: prev, next: view({ state: "declined", end_reason: "share_entire_screen" }), local: false }, "u-ctrl", false),
    "declined_share_entire_screen",
  );
  assert.equal(noticeForTransition({ previous: prev, next: view({ state: "expired", end_reason: "timeout" }), local: false }, "u-ctrl", false), "expired");
  // 我自己取消 → 不提示
  assert.equal(noticeForTransition({ previous: prev, next: view({ state: "cancelled" }), local: true }, "u-ctrl", true), null);
});

test("noticeForTransition：被控方只在进行中→结束时提示；旁观者永不提示；我自己停不提示", () => {
  const active = view({ state: "active" });
  assert.equal(noticeForTransition({ previous: active, next: view({ state: "ended", end_reason: "idle" }), local: false }, "u-tgt", false), "ended_idle");
  assert.equal(noticeForTransition({ previous: active, next: view({ state: "ended" }), local: false }, "u-tgt", true), null); // 我停的
  assert.equal(noticeForTransition({ previous: active, next: view({ state: "ended" }), local: false }, "u-viewer", false), null); // 旁观者
});

test("noticeText：所有提示码都有中文文案（无 undefined），插值生效", () => {
  const codes = [
    "approved", "declined", "declined_share_entire_screen", "declined_unsupported", "declined_timeout", "expired",
    "request_failed", "request_rate_limited", "request_busy", "request_unavailable", "paste_truncated",
    "ended", "ended_by_peer", "ended_idle", "ended_max", "ended_device", "ended_call", "ended_left", "ended_connection",
    "host_need_whole_screen", "host_unsupported", "host_bridge_error", "host_share_stopped", "host_not_whole_screen", "host_left_call",
  ];
  for (const code of codes) {
    const text = noticeText(tt, code, { controller: "张三" });
    assert.ok(typeof text === "string" && text.length > 0 && !text.includes("undefined"), code);
  }
  assert.ok(noticeText(tt, "host_need_whole_screen", { controller: "张三" }).startsWith("张三"));
});

// ---- 短提示仓 ----
test("noticeStore：同会话同句去重；超过上限丢最旧；到期自动消失", () => {
  let now = 0;
  const timers = [];
  const s = createNoticeStore({
    now: () => now,
    setTimer: (fn, ms) => {
      const h = { at: now + ms, fn };
      timers.push(h);
      return h;
    },
    clearTimer: (h) => {
      const i = timers.indexOf(h);
      if (i >= 0) timers.splice(i, 1);
    },
  });
  assert.ok(s.push("approved", { sessionId: "s1" }));
  assert.equal(s.push("approved", { sessionId: "s1" }), null); // 去重
  s.push("ended_idle", { sessionId: "s2" });
  s.push("ended_max", { sessionId: "s3" });
  s.push("ended_call", { sessionId: "s4" });
  s.push("ended_left", { sessionId: "s5" }); // 第 5 条，超过上限 4
  assert.equal(s.snapshot().length, 4);
  assert.ok(!s.snapshot().some((n) => n.code === "approved")); // 最旧被挤掉
  // 到期
  now = 8000;
  for (const h of timers.filter((t) => t.at <= now)) h.fn();
  assert.equal(s.snapshot().length, 0);
});

// ---- 菜单模型 ----
const parts = [
  { participantId: "p-me", userId: "u-me", isMe: true, screen: false },
  { participantId: "p-tgt", userId: "u-tgt", isMe: false, screen: true }, // 在共享
  { participantId: "p-noscreen", userId: "u-noscreen", isMe: false, screen: false },
];

function menu(over = {}) {
  return controlMenuModel({
    phase: "connected",
    callId: "c1",
    screenSharerId: "p-tgt",
    participants: parts,
    sessions: [],
    meId: "u-me",
    participantId: "p-tgt",
    now: 0,
    ...over,
  });
}

test("菜单：对方在共享 → 可请求；自己/未共享/不在通话 → 隐藏", () => {
  assert.deepEqual(menu(), { kind: "request", callId: "c1", targetUserId: "u-tgt" });
  assert.equal(menu({ participantId: "p-me" }).kind, "hidden");
  assert.equal(menu({ participantId: "p-noscreen", screenSharerId: null }).kind, "hidden");
  assert.equal(menu({ phase: "idle" }).kind, "hidden");
});

test("菜单：我已在控制他 → controlling；我在等他 → waiting；别人在控制他 → busy", () => {
  const mineActive = [view({ session_id: "m", state: "active", controller_id: "u-me", target_id: "u-tgt" })];
  assert.deepEqual(menu({ sessions: mineActive }), { kind: "controlling", sessionId: "m" });
  const minePending = [view({ session_id: "p", state: "pending", controller_id: "u-me", target_id: "u-tgt" })];
  const w = menu({ sessions: minePending });
  assert.equal(w.kind, "waiting");
  assert.equal(w.sessionId, "p");
  const otherActive = [view({ session_id: "o", state: "active", controller_id: "u-other", target_id: "u-tgt" })];
  assert.equal(menu({ sessions: otherActive }).kind, "busy");
});
