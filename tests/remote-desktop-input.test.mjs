import assert from "node:assert/strict";
import test from "node:test";

import { compileModule } from "./helpers/module-bench.mjs";

const input = await import(await compileModule("src/pages/remote-desktop-input.ts", {}));

const rect = { left: 100, top: 50, width: 400, height: 200 };

test("坐标按画面元素矩形换成 0..1 比例，出界夹到边上", () => {
  assert.deepEqual(input.toNormalized(300, 150, rect), { x: 0.5, y: 0.5 });
  assert.deepEqual(input.toNormalized(100, 50, rect), { x: 0, y: 0 });
  assert.deepEqual(input.toNormalized(900, -40, rect), { x: 1, y: 0 });
  assert.equal(input.toNormalized(1, 1, { left: 0, top: 0, width: 0, height: 10 }), null);
  assert.equal(input.toNormalized(Number.NaN, 1, rect), null);
  assert.equal(input.insideRect(300, 150, rect), true);
  assert.equal(input.insideRect(99, 150, rect), false);
});

test("等比缩放：同一比例点在任意显示尺寸下落点相同", () => {
  const small = input.toNormalized(60, 30, { left: 0, top: 0, width: 120, height: 60 });
  const large = input.toNormalized(600, 300, { left: 0, top: 0, width: 1200, height: 600 });
  assert.deepEqual(small, large);
});

test("鼠标键与拖动判定", () => {
  assert.equal(input.mouseButton(0), "left");
  assert.equal(input.mouseButton(1), "middle");
  assert.equal(input.mouseButton(2), "right");
  assert.equal(input.mouseButton(3), null);
  assert.equal(input.isDrag({ x: 0.2, y: 0.2 }, { x: 0.2, y: 0.2 }), false);
  assert.equal(input.isDrag({ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.2 }), true);
});

const key = (key, extra = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...extra,
});

test("键盘：可打印字符走 type，组合键与功能键走 keypress，修饰键本身与输入法组字不发", () => {
  assert.deepEqual(input.keyEventToAction(key("a")), { kind: "type", text: "a" });
  assert.deepEqual(input.keyEventToAction(key("A", { shiftKey: true })), { kind: "type", text: "A" });
  assert.deepEqual(input.keyEventToAction(key("中")), { kind: "type", text: "中" });
  assert.deepEqual(input.keyEventToAction(key(" ")), { kind: "type", text: " " });
  assert.deepEqual(input.keyEventToAction(key("Enter")), { kind: "keypress", key: "Enter" });
  assert.deepEqual(input.keyEventToAction(key("c", { ctrlKey: true })), {
    kind: "keypress",
    key: "c",
    modifiers: ["ctrl"],
  });
  assert.deepEqual(input.keyEventToAction(key("ArrowLeft", { shiftKey: true, altKey: true })), {
    kind: "keypress",
    key: "ArrowLeft",
    modifiers: ["alt", "shift"],
  });
  assert.equal(input.keyEventToAction(key("Shift", { shiftKey: true })), null);
  assert.equal(input.keyEventToAction(key("Control", { ctrlKey: true })), null);
  assert.equal(input.keyEventToAction(key("a", { isComposing: true })), null);
  assert.equal(input.keyEventToAction(key("Process")), null);
});

test("文字按码点分块，不劈开代理对；超长粘贴被截断并标记", () => {
  const text = "😀".repeat(5) + "abc";
  const chunks = input.chunkText(text, 3);
  assert.deepEqual(chunks, ["😀😀😀", "😀😀a", "bc"]);
  assert.equal(chunks.join(""), text);
  const big = "x".repeat(input.REMOTE_PASTE_MAX + 50);
  const clamped = input.clampPaste(big);
  assert.equal(clamped.truncated, true);
  assert.equal([...clamped.text].length, input.REMOTE_PASTE_MAX);
  assert.deepEqual(input.clampPaste("短"), { text: "短", truncated: false });
});

test("未授权不是入口障碍；未登录、离线与旧客户端保留真实原因", () => {
  const base = { supported: true, enabled: true, online: true, session_id: null };
  assert.equal(input.statusBlocker(base), null);
  assert.equal(input.statusBlocker({ ...base, online: false, supported: false }), "offline");
  assert.equal(input.statusBlocker({ ...base, supported: false, enabled: false }), "unsupported");
  assert.equal(input.statusBlocker({ ...base, enabled: false }), null);
  assert.equal(input.statusBlocker({ ...base, availability: "signed_out" }), "signed_out");
  const copies = ["offline", "unsupported", "signed_out"].map(input.blockerCopy);
  assert.equal(new Set(copies).size, 3);
  assert.match(copies[2], /尚未登录/);
});

test("错误码都落成中文，未知码落到兜底，不外泄英文 token", () => {
  for (const code of [
    "unauthorized",
    "network_error",
    "response_malformed",
    "device_offline",
    "revoked",
    "remote_desktop_unsupported",
    "remote_desktop_disabled",
    "session_active",
    "remote_desktop_unavailable",
    "disabled_locally",
    "device_lost",
    "viewer_idle",
    "viewer_closed",
    "account_mismatch",
    "session_closed",
    "input_queue_full",
    "too_many_sessions",
    "expired",
    "session_expired",
    "session_not_found",
    "rate_limited",
    "totally_unknown_code",
    "HTTP 500",
  ]) {
    const copy = input.remoteDesktopErrorCopy(code);
    assert.match(copy, /[一-鿿]/, code);
    assert.doesNotMatch(copy, /[a-z]+_[a-z_]+/);
  }
  assert.doesNotMatch(input.remoteDesktopErrorCopy("x", 409), /已有一个正在进行/, "裸 409 不能说成别人占用");
  assert.match(input.remoteDesktopErrorCopy("x", 404), /已结束/);
  assert.equal(input.remoteDesktopErrorCopy(undefined, 500), "这一步没有完成，请稍后重试。");
});

test("native publisher failures explain the next action without exposing protocol codes", () => {
  assert.match(input.remoteDesktopErrorCopy("screen_permission_or_capture_unavailable"), /画面暂时无法获取.*重新连接/);
  assert.doesNotMatch(input.remoteDesktopErrorCopy("screen_permission_or_capture_unavailable"), /权限|允许.*录制屏幕/);
  assert.match(input.remoteDesktopErrorCopy("media_no_encoded_frame"), /未发出视频画面.*重新连接/);
  for (const code of ["media_no_encoded_frame", "media_first_frame_timeout", "media_gateway_unsupported"]) {
    assert.doesNotMatch(input.remoteDesktopErrorCopy(code), /屏幕录制权限/, "missing video alone is not evidence of denied screen permission");
  }
  for (const code of ["media_sdk_not_installed", "media_sdk_start_failed", "display_enumeration_failed", "display_geometry_failed", "display_not_found"]) {
    assert.equal(input.remoteDesktopErrorCopy(code), input.remoteDesktopErrorCopy("media_unavailable"));
  }
  for (const code of ["media_renew_failed", "media_credential_invalid", "media_lease_invalid"]) {
    assert.equal(input.remoteDesktopErrorCopy(code), input.remoteDesktopErrorCopy("media_auth_failed"));
  }
  assert.equal(input.remoteDesktopErrorCopy("media_capture_or_publish_failed"), input.remoteDesktopErrorCopy("screen_permission_or_capture_unavailable"));
});

test("capture stage failures only advise permissions when denial is explicit", () => {
  const failures = [
    ["screen_permission_required", /尚未允许屏幕录制/],
    ["screen_content_unavailable", /无法获取.*屏幕内容/],
    ["screen_content_timeout", /读取.*屏幕内容超时/],
    ["screen_display_mismatch", /显示器发生变化或无法使用/],
    ["screen_geometry_invalid", /显示器发生变化或无法使用/],
    ["screen_capture_output_failed", /无法输出屏幕画面/],
    ["screen_capture_start_failed", /画面未能启动/],
    ["screen_capture_start_timeout", /启动电脑画面超时/],
    ["screen_capture_cleanup_pending", /结束上一次画面采集/],
    ["screen_capture_quarantined", /画面采集暂不可用/],
    ["screen_capture_os_unsupported", /系统暂不支持屏幕采集/],
    ["screen_permission_or_capture_unavailable", /画面暂时无法获取/],
  ];
  for (const [code, expected] of failures) {
    const copy = input.remoteDesktopErrorCopy(code);
    assert.match(copy, expected, code);
    assert.match(copy, /控制已停止/, code);
    assert.doesNotMatch(copy, /screen_|NSError|离线|失去联系/, code);
    if (code !== "screen_permission_required") assert.doesNotMatch(copy, /权限|允许.*录制屏幕/, code);
  }
  assert.equal(input.remoteDesktopErrorCopy("NSError synthetic-private-detail token=fixture-only"), "这一步没有完成，请稍后重试。");
});

test("viewer and gateway stream failures describe a network interruption; device loss requires its explicit code", () => {
  for (const code of ["network_error", "stream_failed"]) {
    assert.match(input.remoteDesktopErrorCopy(code), /网络连接中断/);
    assert.doesNotMatch(input.remoteDesktopErrorCopy(code), /失去联系|不在线/);
  }
  assert.match(input.remoteDesktopErrorCopy("device_lost"), /这台电脑失去联系/);
});

test("B 的真实码：旧客户端/断线与「别人占用」是两句话", () => {
  const unavailable = input.remoteDesktopErrorCopy("remote_desktop_unavailable", 409);
  const active = input.remoteDesktopErrorCopy("session_active", 409);
  assert.notEqual(unavailable, active);
  assert.match(unavailable, /联系不上/);
  assert.match(active, /已有一个正在进行/);
  for (const code of ["remote_desktop_unavailable", "disabled_locally", "device_lost", "viewer_idle", "account_mismatch", "session_closed", "session_not_found"]) {
    assert.ok(input.REMOTE_FATAL_CODES.has(code), code);
  }
  assert.ok(!input.REMOTE_FATAL_CODES.has("session_active"));
  assert.ok(!input.REMOTE_FATAL_CODES.has("input_queue_full"));
  assert.ok(input.REMOTE_BACKPRESSURE_CODES.has("input_queue_full"));
});

test("containedRect：留白居中，画面区域等比；无尺寸时原样返回", () => {
  const wide = input.containedRect({ left: 100, top: 50, width: 400, height: 200 }, 1280, 720);
  assert.ok(Math.abs(wide.width - 355.5556) < 0.01);
  assert.equal(wide.height, 200);
  assert.ok(Math.abs(wide.left - (100 + (400 - wide.width) / 2)) < 1e-9);
  const tall = input.containedRect({ left: 0, top: 0, width: 200, height: 400 }, 1280, 720);
  assert.equal(tall.width, 200);
  assert.ok(Math.abs(tall.height - 112.5) < 1e-9);
  assert.ok(Math.abs(tall.top - (400 - 112.5) / 2) < 1e-9);
  const same = { left: 1, top: 2, width: 3, height: 4 };
  assert.equal(input.containedRect(same, 0, 0), same);
});

test("sanitizeRemoteText 产出网关可接受的文字（只含可打印字符、换行、制表）", () => {
  assert.equal(input.sanitizeRemoteText("a\r\nb\rc"), "a\nb\nc");
  assert.equal(input.sanitizeRemoteText("x\u00a0y\u3000z"), "x y z");
  assert.equal(input.sanitizeRemoteText("a\u200bb\u0000c\u007fd\u2028e"), "abcde");
  assert.equal(input.sanitizeRemoteText("\ttab\nline"), "\ttab\nline");
  assert.equal(input.sanitizeRemoteText("你好，world 😀"), "你好，world 😀");
});

test("Unidentified / 空 key 不是一个键：不产生 keypress", () => {
  const base = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };
  assert.equal(input.keyEventToAction({ ...base, key: "Unidentified" }), null);
  assert.equal(input.keyEventToAction({ ...base, key: "" }), null);
  assert.deepEqual(input.keyEventToAction({ ...base, key: "Enter" }), { kind: "keypress", key: "Enter" });
});

test("classifyInput：文字 / 换行 / 删除各归各类，组字与 insertCompositionText 一律忽略", () => {
  assert.equal(input.classifyInput("insertText", false), "text");
  assert.equal(input.classifyInput("insertReplacementText", false), "text");
  assert.equal(input.classifyInput(undefined, false), "text");
  assert.equal(input.classifyInput("insertLineBreak", false), "enter");
  assert.equal(input.classifyInput("insertParagraph", false), "enter");
  assert.equal(input.classifyInput("deleteContentBackward", false), "backspace");
  assert.equal(input.classifyInput("deleteContentForward", false), "delete");
  assert.equal(input.classifyInput("insertCompositionText", false), "ignore");
  assert.equal(input.classifyInput("insertText", true), "ignore");
  assert.equal(input.classifyInput("insertFromPaste", false), "ignore");
  assert.equal(input.classifyInput("historyUndo", false), "ignore");
  assert.deepEqual(input.softInputKeyAction("enter"), { kind: "keypress", key: "Enter" });
  assert.deepEqual(input.softInputKeyAction("backspace"), { kind: "keypress", key: "Backspace" });
  assert.deepEqual(input.softInputKeyAction("delete"), { kind: "keypress", key: "Delete" });
  assert.equal(input.softInputKeyAction("text"), null);
  assert.equal(input.softInputKeyAction("ignore"), null);
});

test("isPointerDrag：鼠标沿用比例阈值，触摸 / 笔按 10px 位移；isNearby 判双击距离", () => {
  const rect = { left: 0, top: 0, width: 400, height: 200 };
  const a = { x: 0.5, y: 0.5 };
  const nudge = { x: 0.5 + 5 / 400, y: 0.5 }; // 5px
  const far = { x: 0.5 + 20 / 400, y: 0.5 }; // 20px
  assert.equal(input.isPointerDrag("mouse", a, nudge, rect), true);
  assert.equal(input.isPointerDrag("touch", a, nudge, rect), false);
  assert.equal(input.isPointerDrag("pen", a, nudge, rect), false);
  assert.equal(input.isPointerDrag("touch", a, far, rect), true);
  assert.equal(input.isNearby(a, { x: 0.51, y: 0.5 }), true);
  assert.equal(input.isNearby(a, { x: 0.6, y: 0.5 }), false);
});
