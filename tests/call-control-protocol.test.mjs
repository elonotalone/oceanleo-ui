// W09 远程控制协议（纯函数）：帧编码、坐标换算（含 object-fit 留黑边）、发送器节流/限速/保序/抬起兜底、
// 文本切分与长度、按键白名单、连按三次 Esc。直接 import 真实现（纯 TS，无 DOM）。
import test from "node:test";
import assert from "node:assert/strict";

import {
  CONTROL_FRAME_MAX_BYTES,
  CONTROL_KEY_CODES,
  CONTROL_TEXT_MAX_CHARS,
  clampWheel,
  controlButton,
  controlMods,
  createControlSender,
  createEscapeStopDetector,
  displayedContentRect,
  encodeFrame,
  frameFits,
  isControlKeyCode,
  mapClientPointToSurface,
  parseObjectFit,
  parseObjectPosition,
  roundRatio,
  sanitizeControlText,
  splitControlText,
  surfacePointToClient,
  utf8Length,
  wheelPixels,
} from "../src/shell/messages/call/control/protocol.ts";

// ---- 帧编码 ----
test("encodeFrame：形状逐字对应合同 §3.8", () => {
  assert.equal(encodeFrame({ t: "mm", x: 0.5, y: 0.25 }), '{"t":"mm","x":0.5,"y":0.25}');
  assert.equal(encodeFrame({ t: "md", b: "right", x: 0, y: 1 }), '{"t":"md","b":"right","x":0,"y":1}');
  assert.equal(encodeFrame({ t: "wh", dx: -3, dy: 120 }), '{"t":"wh","dx":-3,"dy":120}');
  assert.equal(
    encodeFrame({ t: "kd", code: "KeyA", key: "a", mods: ["ctrl"] }),
    '{"t":"kd","code":"KeyA","key":"a","mods":["ctrl"]}',
  );
  assert.equal(encodeFrame({ t: "stop" }), '{"t":"stop"}');
});

test("controlButton / controlMods：侧键不转发，修饰键顺序固定", () => {
  assert.equal(controlButton(0), "left");
  assert.equal(controlButton(1), "middle");
  assert.equal(controlButton(2), "right");
  assert.equal(controlButton(3), null); // 浏览器后退键
  assert.deepEqual(controlMods({ metaKey: true, shiftKey: true }), ["shift", "meta"]);
  assert.deepEqual(controlMods({}), []);
});

test("utf8Length / frameFits：按 UTF-8 字节判 2 KB 上限", () => {
  assert.equal(utf8Length("a"), 1);
  assert.equal(utf8Length("é"), 2);
  assert.equal(utf8Length("中"), 3);
  assert.equal(utf8Length("😀"), 4);
  assert.ok(frameFits({ t: "tx", text: "你好" }));
  assert.ok(!frameFits({ t: "tx", text: "字".repeat(CONTROL_FRAME_MAX_BYTES) }));
});

test("clampWheel / wheelPixels：像素钳在 ±2000，行列页换算", () => {
  assert.equal(clampWheel(5000), 2000);
  assert.equal(clampWheel(-5000), -2000);
  assert.equal(clampWheel(3.6), 4);
  assert.equal(wheelPixels(3, 0, 800), 3); // 像素
  assert.equal(wheelPixels(3, 1, 800), 120); // 行 ×40
  assert.equal(wheelPixels(1, 2, 720), 720); // 页 = 画面高
});

// ---- 坐标换算（object-fit） ----
const BOX_WIDE = { left: 0, top: 0, width: 400, height: 200 }; // 2:1 盒子
const SRC_SQUARE = { width: 100, height: 100 }; // 1:1 画面

test("contain：方画面进宽盒子 → 两侧留黑边，黑边上返回 null", () => {
  const content = displayedContentRect(BOX_WIDE, SRC_SQUARE, "contain");
  // 画面缩放到 200×200，水平居中：左黑边 100，右黑边从 300 起
  assert.deepEqual(content, { left: 100, top: 0, width: 200, height: 200 });
  assert.equal(mapClientPointToSurface(100, 0, BOX_WIDE, SRC_SQUARE, { fit: "contain" }).x, 0);
  assert.deepEqual(mapClientPointToSurface(200, 100, BOX_WIDE, SRC_SQUARE, { fit: "contain" }), { x: 0.5, y: 0.5 });
  assert.equal(mapClientPointToSurface(300, 200, BOX_WIDE, SRC_SQUARE, { fit: "contain" }).x, 1);
  // 左黑边（x=40）：不发
  assert.equal(mapClientPointToSurface(40, 100, BOX_WIDE, SRC_SQUARE, { fit: "contain" }), null);
});

test("contain + clamp：拖动出界钳到画面边缘而不是返回 null", () => {
  const clamped = mapClientPointToSurface(40, 100, BOX_WIDE, SRC_SQUARE, { fit: "contain", clamp: true });
  assert.deepEqual(clamped, { x: 0, y: 0.5 });
});

test("cover：方画面铺满宽盒子 → 上下被裁，裁掉的部分看不见返回 null", () => {
  // scale = max(4,2)=4 → 画面 400×400，垂直居中，top=-100；可见区仅盒子内 [0,200]
  const content = displayedContentRect(BOX_WIDE, SRC_SQUARE, "cover");
  assert.deepEqual(content, { left: 0, top: -100, width: 400, height: 400 });
  // 盒子中心 → 画面中心
  assert.deepEqual(mapClientPointToSurface(200, 100, BOX_WIDE, SRC_SQUARE, { fit: "cover" }), { x: 0.5, y: 0.5 });
  // 盒子左上角仍在可见画面内（画面比盒子大，无黑边）
  assert.deepEqual(mapClientPointToSurface(0, 0, BOX_WIDE, SRC_SQUARE, { fit: "cover" }), { x: 0, y: 0.25 });
});

test("fill：拉伸铺满，x/y 各自按盒子比例", () => {
  assert.deepEqual(mapClientPointToSurface(100, 50, BOX_WIDE, SRC_SQUARE, { fit: "fill" }), { x: 0.25, y: 0.25 });
});

test("object-position：左上对齐改变黑边位置", () => {
  const pos = parseObjectPosition("left top");
  const content = displayedContentRect(BOX_WIDE, SRC_SQUARE, "contain", pos);
  assert.deepEqual(content, { left: 0, top: 0, width: 200, height: 200 });
});

test("parseObjectFit / parseObjectPosition：认不出按 contain + 居中", () => {
  assert.equal(parseObjectFit("cover"), "cover");
  assert.equal(parseObjectFit("weird"), "contain");
  assert.equal(parseObjectFit(null), "contain");
  assert.deepEqual(parseObjectPosition("50% 50%"), { x: { frac: 0.5 }, y: { frac: 0.5 } });
  assert.deepEqual(parseObjectPosition(""), { x: { frac: 0.5 }, y: { frac: 0.5 } });
});

test("surfacePointToClient 是 mapClientPointToSurface 的逆（contain 中心）", () => {
  const client = surfacePointToClient(0.5, 0.5, BOX_WIDE, SRC_SQUARE, { fit: "contain" });
  assert.deepEqual(client, { clientX: 200, clientY: 100 });
});

test("退化输入：盒子/画面尺寸为 0 或非有限 → null", () => {
  assert.equal(mapClientPointToSurface(10, 10, { left: 0, top: 0, width: 0, height: 10 }, SRC_SQUARE), null);
  assert.equal(mapClientPointToSurface(10, 10, BOX_WIDE, { width: 0, height: 10 }), null);
  assert.equal(mapClientPointToSurface(NaN, 10, BOX_WIDE, SRC_SQUARE), null);
  assert.equal(roundRatio(2), 1);
  assert.equal(roundRatio(-1), 0);
});

// ---- 按键白名单 ----
test("isControlKeyCode：字母/数字/功能/方向/修饰键放行；电源/媒体/输入法切换键不放行", () => {
  for (const code of ["KeyA", "Digit0", "F5", "ArrowUp", "Enter", "Escape", "ShiftLeft", "NumpadEnter", "Comma"]) {
    assert.ok(isControlKeyCode(code), code);
  }
  for (const code of ["Power", "Sleep", "MediaPlayPause", "BrowserBack", "Lang1", "Convert", "PrintScreen", "F13", "NumLock"]) {
    assert.ok(!isControlKeyCode(code), code);
  }
  assert.ok(!isControlKeyCode(""));
  assert.ok(CONTROL_KEY_CODES.has("KeyZ"));
});

// ---- 文本 ----
test("sanitizeControlText：统一换行、去控制字符、剥孤立代理", () => {
  assert.equal(sanitizeControlText("a\r\nb\rc"), "a\nb\nc");
  assert.equal(sanitizeControlText("a\u0000\u0007b"), "ab");
  assert.equal(sanitizeControlText("tab\there"), "tab\there");
  assert.equal(sanitizeControlText("x\uD800y"), "xy");
});

test("splitControlText：每段 ≤500 码点且整帧 ≤2 KB，不切开代理对", () => {
  const long = "字".repeat(1200);
  const chunks = splitControlText(long);
  assert.ok(chunks.length >= 3);
  for (const chunk of chunks) {
    assert.ok([...chunk].length <= CONTROL_TEXT_MAX_CHARS);
    assert.ok(frameFits({ t: "tx", text: chunk }));
  }
  assert.equal(chunks.join(""), long);
  // 全是 4 字节 emoji：字节上限比码点上限先触发，但不拆代理对
  const emoji = "😀".repeat(300);
  for (const chunk of splitControlText(emoji)) {
    assert.ok(frameFits({ t: "tx", text: chunk }));
    assert.ok(!/[\uD800-\uDBFF]$/.test(chunk)); // 结尾不是落单的高代理
  }
  assert.equal(splitControlText("").length, 0);
});

// ---- 连按三次 Esc ----
test("createEscapeStopDetector：窗口内连按 3 次 Esc 触发；中间按别的键清零；长按重复不算", () => {
  let now = 0;
  const esc = createEscapeStopDetector(() => now);
  assert.equal(esc.press("Escape"), false);
  assert.equal(esc.press("Escape"), false);
  assert.equal(esc.press("Escape"), true); // 第 3 次
  // 中间插入别的键会清零
  assert.equal(esc.press("Escape"), false);
  assert.equal(esc.press("KeyA"), false);
  assert.equal(esc.press("Escape"), false);
  assert.equal(esc.press("Escape"), false);
  assert.equal(esc.press("Escape"), true);
  // 超出 1.5 秒窗口不累计
  esc.reset();
  assert.equal(esc.press("Escape"), false);
  now = 2000;
  assert.equal(esc.press("Escape"), false);
  now = 2100;
  assert.equal(esc.press("Escape"), false); // 只剩 2 次在窗口内
  // 长按自动重复不计
  assert.equal(esc.press("Escape", true), false);
});

// ---- 发送器：节流 / 限速 / 保序 / 抬起兜底 ----
function fakeSender(budgetPerSec = 100) {
  let now = 0;
  const timers = [];
  const out = [];
  const sender = createControlSender({
    deliver: (frame) => {
      out.push(frame);
      return true;
    },
    now: () => now,
    setTimer: (fn, ms) => {
      const handle = { at: now + ms, fn };
      timers.push(handle);
      return handle;
    },
    clearTimer: (handle) => {
      const i = timers.indexOf(handle);
      if (i >= 0) timers.splice(i, 1);
    },
    budgetPerSec,
  });
  const advance = (ms) => {
    now += ms;
    for (const handle of timers.filter((t) => t.at <= now)) {
      const i = timers.indexOf(handle);
      if (i >= 0) timers.splice(i, 1);
      handle.fn();
    }
  };
  return { sender, out, advance, setNow: (v) => (now = v) };
}

test("发送器：首帧立即发，随后节流窗口内的连续 move 合并成最新一帧", () => {
  const { sender, out, advance } = fakeSender();
  sender.move(0.05, 0.05); // 首帧立即发
  sender.move(0.1, 0.1); // 下面三帧都落在 17 ms 节流窗口内，排队合并
  sender.move(0.2, 0.2);
  sender.move(0.3, 0.3);
  advance(100);
  const moves = out.filter((f) => f.t === "mm");
  assert.equal(moves.length, 2); // 首帧 + 合并后的最新一帧
  assert.deepEqual(moves[0], { t: "mm", x: 0.05, y: 0.05 });
  assert.deepEqual(moves.at(-1), { t: "mm", x: 0.3, y: 0.3 });
});

test("发送器：move 节流到 ≤60 次/秒（相邻 mm 帧间隔 ≥17 ms）", () => {
  const { sender, out, advance } = fakeSender();
  for (let i = 0; i < 20; i += 1) {
    sender.move(i / 100, 0);
    advance(5); // 每 5 ms 来一次（200 次/秒）
  }
  advance(500);
  const moves = out.filter((f) => f.t === "mm");
  // 100 ms 里按 17 ms 间隔最多 ~6 帧，远少于 20
  assert.ok(moves.length <= 8, `moves=${moves.length}`);
});

test("发送器：1 秒滑动窗口内总量不超预算", () => {
  const { sender, out, advance } = fakeSender(10);
  for (let i = 0; i < 40; i += 1) sender.tap("KeyA", "a");
  advance(900);
  assert.ok(out.length <= 10, `sent=${out.length} in first second`);
  advance(200); // 跨过 1 秒窗口
  assert.ok(out.length > 10);
});

test("发送器：down 丢掉排队中（尚未发出）的 move；up 只在按下过时发", () => {
  const { sender, out, advance } = fakeSender();
  sender.move(0.1, 0.1); // 首帧立即发
  sender.move(0.4, 0.4); // 节流窗口内 → 排队，尚未发出
  sender.down("left", 0.5, 0.5); // 丢掉排队的 mm0.4
  advance(100);
  assert.ok(!out.some((f) => f.t === "mm" && f.x === 0.4), "排队中的 move 被 down 吞掉");
  assert.deepEqual(out.find((f) => f.t === "md"), { t: "md", b: "left", x: 0.5, y: 0.5 });
  out.length = 0;
  sender.up("right", 0.5, 0.5); // 没按下过右键
  advance(100);
  assert.equal(out.length, 0);
});

test("发送器：keyUp 只抬起本端按下过的键；releaseAll 抬起全部挂起的键与鼠标键", () => {
  const { sender, out, advance } = fakeSender();
  assert.equal(sender.keyDown("KeyA", "a", []), true);
  assert.equal(sender.keyDown("Power", "Power", []), false); // 白名单外
  sender.down("left", 0.5, 0.5);
  advance(50);
  out.length = 0;
  assert.equal(sender.keyUp("KeyB", "b", []), false); // 没按下过
  sender.releaseAll();
  advance(50);
  assert.ok(out.some((f) => f.t === "ku" && f.code === "KeyA"));
  assert.ok(out.some((f) => f.t === "mu" && f.b === "left"));
  assert.deepEqual(sender.pressedKeys(), []);
  assert.deepEqual(sender.pressedButtons(), []);
});

test("发送器：stop 先抬起全部再发一帧 stop，并清掉排队的移动", () => {
  const { sender, out, advance } = fakeSender();
  sender.keyDown("KeyA", "a", []);
  sender.move(0.9, 0.9);
  sender.stop();
  advance(100);
  const idxStop = out.findIndex((f) => f.t === "stop");
  const idxKeyUp = out.findIndex((f) => f.t === "ku" && f.code === "KeyA");
  assert.ok(idxKeyUp >= 0 && idxStop >= 0 && idxKeyUp < idxStop, "先抬起键再 stop");
});

test("发送器：text 超长截断到 2000 码点并标 truncated", () => {
  const { sender, out, advance } = fakeSender(10_000);
  const r = sender.text("字".repeat(2500));
  advance(1000);
  assert.equal(r.truncated, true);
  assert.equal(r.chars, 2000);
  const sent = out.filter((f) => f.t === "tx").map((f) => f.text).join("");
  assert.equal([...sent].length, 2000);
});
