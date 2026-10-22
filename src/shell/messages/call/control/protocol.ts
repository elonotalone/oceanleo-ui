// 远程控制线上协议（合同 §3.8，控制方 → 设备）与纯函数。纯 TS：不碰 DOM、不碰 React，
// tests/call-control-protocol.test.mjs 直接 import 这份真实实现。
//
// 这里管：
//  - 帧编码 mm/md/mu/wh/kd/ku/tx/stop（坐标是共享画面上的 0–1 比例，滚轮是像素）；
//  - 坐标换算：按 <video> 实际显示区域（object-fit 留黑边 / 裁切 / 拉伸，object-position）把客户端坐标换成 0–1；
//  - 发送器：移动 ≤60 次/秒（只留最新），滚轮合并，全部消息在 1 秒滑动窗口里 ≤100 条（服务端上限 120，
//    留余量给网络抖动造成的扎堆），单帧 ≤2 KB，帧序不乱，按下过的键与鼠标键都能一键全部抬起；
//  - 文本：一段 ≤500 字（按码点数，与服务端 Python `len` 一致）、单帧 ≤2 KB；
//  - 按键白名单（只发 `KeyboardEvent.code` 白名单里的键）与修饰键；
//  - 连按三次 Esc 结束控制。

// ---- 合同 §3.1 常量（远程控制部分） ------------------------------------------------
export const CONTROL_PENDING_MS = 90_000;
export const CONTROL_MAX_MS = 60 * 60_000;
export const CONTROL_IDLE_MS = 5 * 60_000;
export const CONTROL_FRAME_MAX_BYTES = 2048;
export const CONTROL_SERVER_RATE_PER_SEC = 120;
export const CONTROL_TEXT_MAX_CHARS = 500;
export const CONTROL_REQUESTS_PER_WINDOW = 5;
export const CONTROL_REQUEST_WINDOW_MS = 10 * 60_000;

// ---- 本端自己的节奏（都比服务端上限更紧） --------------------------------------------
/** 客户端 1 秒滑动窗口内最多发这么多条（服务端 120，留 20 条余量）。 */
export const CONTROL_SEND_BUDGET_PER_SEC = 100;
/** 指针移动最短间隔：17 ms ≈ 58.8 次/秒 ≤ 60 次/秒。 */
export const CONTROL_MOVE_INTERVAL_MS = 17;
/** 滚轮合并窗口：≤30 次/秒。 */
export const CONTROL_WHEEL_INTERVAL_MS = 33;
/** 单帧滚轮像素上限（多出来的部分合并后截断）。 */
export const CONTROL_WHEEL_MAX_PX = 2000;
/** 一次粘贴最多发这么多字（4 帧）；多出来的不发，并提示。 */
export const CONTROL_PASTE_MAX_CHARS = 2000;
/** `key` 字段最长 32 个 UTF-16 单元（`KeyboardEvent.key` 的命名键最长约 20）。 */
export const CONTROL_KEY_MAX_CHARS = 32;
/** 发送队列上限；人手打不满，满了只丢非「抬起」类帧。 */
export const CONTROL_QUEUE_MAX = 256;
/** 连按 3 次 Esc（1.5 秒内、中间没按别的键）结束控制。 */
export const CONTROL_ESC_STOP_PRESSES = 3;
export const CONTROL_ESC_STOP_WINDOW_MS = 1500;

// ---- 路径 ---------------------------------------------------------------------------
const enc = encodeURIComponent;

export const controlRequestsPath = (callId: string): string => `/v1/im/calls/${enc(callId)}/control/requests`;
export const controlSessionPath = (sessionId: string): string => `/v1/im/calls/control/${enc(sessionId)}`;

/** 控制方中继 WebSocket 地址（§3.8 `/v1/im/calls/control/{session_id}/ws`）；地址不合格返回 null。 */
export function controlSocketUrl(gatewayBase: string, sessionId: string): string | null {
  const base = String(gatewayBase || "").trim().replace(/\/+$/, "");
  if (!base || !sessionId) return null;
  const path = `${controlSessionPath(sessionId)}/ws`;
  if (/^https:\/\//i.test(base)) return `${base.replace(/^https:/i, "wss:")}${path}`;
  if (/^http:\/\//i.test(base)) return `${base.replace(/^http:/i, "ws:")}${path}`;
  return null;
}

// ---- 帧 -----------------------------------------------------------------------------
export type ControlButton = "left" | "right" | "middle";
export type ControlMod = "shift" | "ctrl" | "alt" | "meta";
export const CONTROL_MODS: readonly ControlMod[] = ["shift", "ctrl", "alt", "meta"];

export type ControllerFrame =
  | { t: "mm"; x: number; y: number }
  | { t: "md"; b: ControlButton; x: number; y: number }
  | { t: "mu"; b: ControlButton; x: number; y: number }
  | { t: "wh"; dx: number; dy: number }
  | { t: "kd"; code: string; key: string; mods: ControlMod[] }
  | { t: "ku"; code: string; key: string; mods: ControlMod[] }
  | { t: "tx"; text: string }
  | { t: "stop" };

/** 设备批准时上报、服务端在 `ready` 里转给控制方的被控显示器尺寸（§3.8）。 */
export interface ControlSurface {
  width: number;
  height: number;
  scale?: number | null;
  monitor_id?: string | number | null;
}

/** 服务端/设备 → 控制方 的帧，解析后的形状。 */
export type ControlServerFrame =
  | { kind: "ready"; surface: ControlSurface | null }
  | { kind: "waiting" }
  | { kind: "state"; state: "active" | "paused" | "ended"; reason: string | null }
  | { kind: "surface"; width: number; height: number }
  | { kind: "error"; code: string; message: string | null }
  | { kind: "ended"; reason: string | null };

export function encodeFrame(frame: ControllerFrame): string {
  return JSON.stringify(frame);
}

/** UTF-8 字节数（不分配内存；孤立代理按 3 字节，与 TextEncoder 的替换字符一致）。 */
export function utf8Length(value: string): number {
  let bytes = 0;
  for (let i = 0; i < value.length; i += 1) {
    const unit = value.charCodeAt(i);
    if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < value.length) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i += 1;
      } else {
        bytes += 3;
      }
    } else bytes += 3;
  }
  return bytes;
}

export function frameBytes(frame: ControllerFrame): number {
  return utf8Length(encodeFrame(frame));
}

export function frameFits(frame: ControllerFrame): boolean {
  return frameBytes(frame) <= CONTROL_FRAME_MAX_BYTES;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** 0–1 比例保留 5 位小数（8K 屏上误差 <0.1 像素），并钳在 [0,1]。 */
export function roundRatio(value: number): number {
  return Math.round(clamp01(value) * 100_000) / 100_000;
}

export function clampWheel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value);
  return Math.max(-CONTROL_WHEEL_MAX_PX, Math.min(CONTROL_WHEEL_MAX_PX, rounded));
}

/** `PointerEvent.button` → 线上按键名；后退/前进等侧键不转发（null）。 */
export function controlButton(button: number): ControlButton | null {
  if (button === 0) return "left";
  if (button === 1) return "middle";
  if (button === 2) return "right";
  return null;
}

// ---- 按键白名单 ------------------------------------------------------------------------
const LETTER_CODES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((c) => `Key${c}`);
const DIGIT_CODES = "0123456789".split("").map((d) => `Digit${d}`);
const FUNCTION_CODES = Array.from({ length: 12 }, (_, i) => `F${i + 1}`);
const NUMPAD_CODES = [
  ..."0123456789".split("").map((d) => `Numpad${d}`),
  "NumpadAdd",
  "NumpadSubtract",
  "NumpadMultiply",
  "NumpadDivide",
  "NumpadDecimal",
  "NumpadEnter",
];
const NAVIGATION_CODES = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Insert",
  "Delete",
];
const EDITING_CODES = ["Enter", "Tab", "Escape", "Backspace", "Space", "CapsLock", "ContextMenu"];
const PUNCTUATION_CODES = [
  "Minus",
  "Equal",
  "BracketLeft",
  "BracketRight",
  "Backslash",
  "Semicolon",
  "Quote",
  "Backquote",
  "Comma",
  "Period",
  "Slash",
  "IntlBackslash",
];
export const CONTROL_MODIFIER_CODES: readonly string[] = [
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
];

/**
 * 允许转发的物理键（`KeyboardEvent.code`）。不在表里的一律不发：电源/睡眠/媒体键/浏览器键/
 * 输入法切换键（Lang1/Lang2/Convert…）/PrintScreen/NumLock/ScrollLock/Pause/F13+。
 */
export const CONTROL_KEY_CODES: ReadonlySet<string> = new Set([
  ...LETTER_CODES,
  ...DIGIT_CODES,
  ...FUNCTION_CODES,
  ...NUMPAD_CODES,
  ...NAVIGATION_CODES,
  ...EDITING_CODES,
  ...PUNCTUATION_CODES,
  ...CONTROL_MODIFIER_CODES,
]);

export function isControlKeyCode(code: string): boolean {
  return typeof code === "string" && CONTROL_KEY_CODES.has(code);
}

export function isModifierCode(code: string): boolean {
  return CONTROL_MODIFIER_CODES.includes(code);
}

/** 修饰键状态 → 固定顺序的 mods 数组。 */
export function controlMods(event: {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}): ControlMod[] {
  const mods: ControlMod[] = [];
  if (event.shiftKey) mods.push("shift");
  if (event.ctrlKey) mods.push("ctrl");
  if (event.altKey) mods.push("alt");
  if (event.metaKey) mods.push("meta");
  return mods;
}

/** `KeyboardEvent.key` 只留可打印内容、截到 32 个单元；空了就用 code 兜底。 */
export function sanitizeKeyName(key: string, code: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = String(key ?? "").replace(/[\u0000-\u001F\u007F]/g, "");
  const value = cleaned.length > 0 ? cleaned : String(code ?? "");
  return value.slice(0, CONTROL_KEY_MAX_CHARS);
}

function sanitizeMods(mods: readonly string[] | null | undefined): ControlMod[] {
  const set = new Set(mods ?? []);
  return CONTROL_MODS.filter((mod) => set.has(mod));
}

// ---- 文本 ------------------------------------------------------------------------------
/** 统一换行，去掉除 \t \n 以外的控制字符与孤立代理。 */
export function sanitizeControlText(text: string): string {
  return (
    String(text ?? "")
      .replace(/\r\n?/g, "\n")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
  );
}

const TX_OVERHEAD_BYTES = utf8Length(encodeFrame({ t: "tx", text: "" }));

/** 切成若干段：每段 ≤maxChars 个码点，且整帧 JSON ≤maxFrameBytes 字节。不会切开代理对。 */
export function splitControlText(
  text: string,
  maxChars: number = CONTROL_TEXT_MAX_CHARS,
  maxFrameBytes: number = CONTROL_FRAME_MAX_BYTES,
): string[] {
  const clean = sanitizeControlText(text);
  if (!clean) return [];
  const budget = Math.max(8, maxFrameBytes - TX_OVERHEAD_BYTES);
  const chunks: string[] = [];
  let current = "";
  let count = 0;
  let bytes = 0;
  for (const ch of clean) {
    const cost = utf8Length(JSON.stringify(ch)) - 2; // 转义后的字节数（引号不算）
    if (count + 1 > maxChars || bytes + cost > budget) {
      if (current) chunks.push(current);
      current = "";
      count = 0;
      bytes = 0;
    }
    current += ch;
    count += 1;
    bytes += cost;
  }
  if (current) chunks.push(current);
  return chunks;
}

/** 码点数（与服务端 `len(text)` 一致）。 */
export function codePointLength(text: string): number {
  let n = 0;
  for (const _ of String(text ?? "")) n += 1;
  return n;
}

/** 截到前 max 个码点。 */
export function truncateCodePoints(text: string, max: number): string {
  let out = "";
  let n = 0;
  for (const ch of String(text ?? "")) {
    if (n >= max) break;
    out += ch;
    n += 1;
  }
  return out;
}

// ---- 坐标换算（object-fit / object-position） ---------------------------------------------
export interface BoxRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface IntrinsicSize {
  width: number;
  height: number;
}

export type ObjectFit = "contain" | "cover" | "fill" | "none" | "scale-down";
export type AxisPosition = { frac: number } | { px: number };
export interface ObjectPosition {
  x: AxisPosition;
  y: AxisPosition;
}

export const CENTER_POSITION: ObjectPosition = { x: { frac: 0.5 }, y: { frac: 0.5 } };

/** `<video>` 的 UA 默认就是 contain；认不出的值也按 contain。 */
export function parseObjectFit(value: string | null | undefined): ObjectFit {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "cover" || v === "fill" || v === "none" || v === "scale-down") return v;
  return "contain";
}

function parseAxisToken(token: string, axis: "x" | "y"): AxisPosition | null {
  if (token === "center") return { frac: 0.5 };
  if ((axis === "x" && token === "left") || (axis === "y" && token === "top")) return { frac: 0 };
  if ((axis === "x" && token === "right") || (axis === "y" && token === "bottom")) return { frac: 1 };
  const pct = /^(-?\d+(?:\.\d+)?)%$/.exec(token);
  if (pct) return { frac: Number(pct[1]) / 100 };
  const px = /^(-?\d+(?:\.\d+)?)px$/.exec(token);
  if (px) return { px: Number(px[1]) };
  if (token === "0") return { px: 0 };
  return null;
}

/** 计算样式里的 object-position（`50% 50%`、`0px 10px`、`left top`…）；认不出就居中。 */
export function parseObjectPosition(value: string | null | undefined): ObjectPosition {
  const tokens = String(value ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 2) return CENTER_POSITION;
  let first = tokens[0];
  let second = tokens[1] ?? "center";
  if (first === "top" || first === "bottom" || second === "left" || second === "right") {
    [first, second] = [second, first];
  }
  const x = parseAxisToken(first, "x");
  const y = parseAxisToken(second, "y");
  return x && y ? { x, y } : CENTER_POSITION;
}

function validBox(box: BoxRect): boolean {
  return [box.left, box.top, box.width, box.height].every(Number.isFinite) && box.width > 0 && box.height > 0;
}

function validSize(size: IntrinsicSize): boolean {
  return Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0;
}

/** 视频画面在元素盒子里实际画出来的矩形（可能比盒子小=留黑边，或比盒子大=被裁切）。 */
export function displayedContentRect(
  box: BoxRect,
  intrinsic: IntrinsicSize,
  fit: ObjectFit = "contain",
  position: ObjectPosition = CENTER_POSITION,
): BoxRect | null {
  if (!validBox(box) || !validSize(intrinsic)) return null;
  const sx = box.width / intrinsic.width;
  const sy = box.height / intrinsic.height;
  let width: number;
  let height: number;
  switch (fit) {
    case "fill":
      width = box.width;
      height = box.height;
      break;
    case "cover": {
      const s = Math.max(sx, sy);
      width = intrinsic.width * s;
      height = intrinsic.height * s;
      break;
    }
    case "none":
      width = intrinsic.width;
      height = intrinsic.height;
      break;
    case "scale-down": {
      const s = Math.min(1, Math.min(sx, sy));
      width = intrinsic.width * s;
      height = intrinsic.height * s;
      break;
    }
    default: {
      const s = Math.min(sx, sy);
      width = intrinsic.width * s;
      height = intrinsic.height * s;
    }
  }
  const offset = (axis: AxisPosition, free: number) => ("px" in axis ? axis.px : free * axis.frac);
  return {
    left: box.left + offset(position.x, box.width - width),
    top: box.top + offset(position.y, box.height - height),
    width,
    height,
  };
}

/** 画面里真正看得见的部分 = 画面矩形 ∩ 元素盒子（cover/none 溢出的部分被裁掉）。 */
export function visibleContentRect(
  box: BoxRect,
  intrinsic: IntrinsicSize,
  fit: ObjectFit = "contain",
  position: ObjectPosition = CENTER_POSITION,
): BoxRect | null {
  const content = displayedContentRect(box, intrinsic, fit, position);
  if (!content) return null;
  const left = Math.max(content.left, box.left);
  const top = Math.max(content.top, box.top);
  const right = Math.min(content.left + content.width, box.left + box.width);
  const bottom = Math.min(content.top + content.height, box.top + box.height);
  if (right <= left || bottom <= top) return null;
  return { left, top, width: right - left, height: bottom - top };
}

export interface MapPointOptions {
  fit?: ObjectFit;
  position?: ObjectPosition;
  /** 拖动出界时钳到画面边缘（按下状态下用）；默认出界返回 null（黑边上不发）。 */
  clamp?: boolean;
}

/** 客户端坐标 → 共享画面上的 0–1 比例；点在黑边/盒子外返回 null（clamp 时钳到边上）。 */
export function mapClientPointToSurface(
  clientX: number,
  clientY: number,
  box: BoxRect,
  intrinsic: IntrinsicSize,
  options: MapPointOptions = {},
): { x: number; y: number } | null {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  const fit = options.fit ?? "contain";
  const position = options.position ?? CENTER_POSITION;
  const content = displayedContentRect(box, intrinsic, fit, position);
  const visible = visibleContentRect(box, intrinsic, fit, position);
  if (!content || !visible) return null;
  let px = clientX;
  let py = clientY;
  const inside =
    px >= visible.left && px <= visible.left + visible.width && py >= visible.top && py <= visible.top + visible.height;
  if (!inside) {
    if (!options.clamp) return null;
    px = Math.min(Math.max(px, visible.left), visible.left + visible.width);
    py = Math.min(Math.max(py, visible.top), visible.top + visible.height);
  }
  return {
    x: roundRatio((px - content.left) / content.width),
    y: roundRatio((py - content.top) / content.height),
  };
}

/** 反过来：0–1 比例 → 客户端坐标（画控制方光标用）。 */
export function surfacePointToClient(
  x: number,
  y: number,
  box: BoxRect,
  intrinsic: IntrinsicSize,
  options: Omit<MapPointOptions, "clamp"> = {},
): { clientX: number; clientY: number } | null {
  const content = displayedContentRect(box, intrinsic, options.fit ?? "contain", options.position ?? CENTER_POSITION);
  if (!content) return null;
  return { clientX: content.left + clamp01(x) * content.width, clientY: content.top + clamp01(y) * content.height };
}

/** 滚轮增量统一成像素：deltaMode 0=像素、1=行（按 40 像素/行）、2=页（按画面高度）。 */
export function wheelPixels(delta: number, deltaMode: number, pageHeight: number): number {
  if (!Number.isFinite(delta)) return 0;
  const unit = deltaMode === 1 ? 40 : deltaMode === 2 ? Math.max(1, pageHeight || 800) : 1;
  return delta * unit;
}

// ---- 解析服务端帧 ------------------------------------------------------------------------
function finitePositive(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseSurface(raw: unknown): ControlSurface | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const width = finitePositive(r.width);
  const height = finitePositive(r.height);
  if (!width || !height) return null;
  const surface: ControlSurface = { width, height };
  const scale = finitePositive(r.scale);
  if (scale) surface.scale = scale;
  if (typeof r.monitor_id === "string" || typeof r.monitor_id === "number") surface.monitor_id = r.monitor_id;
  return surface;
}

function reasonOf(value: unknown): string | null {
  return typeof value === "string" && value ? value.slice(0, 64) : null;
}

/** 文本帧 → 结构化帧；认不出的（pong、未来的新帧）返回 null。 */
export function parseServerFrame(data: unknown): ControlServerFrame | null {
  if (typeof data !== "string" || data.length > 16_384) return null;
  let msg: unknown;
  try {
    msg = JSON.parse(data);
  } catch {
    return null;
  }
  if (!msg || typeof msg !== "object") return null;
  const m = msg as Record<string, unknown>;
  if (m.type === "ready") return { kind: "ready", surface: parseSurface(m.surface) };
  if (m.type === "waiting") return { kind: "waiting" };
  if (m.type === "error") {
    return {
      kind: "error",
      code: typeof m.code === "string" && m.code ? m.code.slice(0, 64) : "error",
      message: typeof m.message === "string" ? m.message.slice(0, 200) : null,
    };
  }
  if (m.type === "ended") return { kind: "ended", reason: reasonOf(m.reason) };
  if (m.t === "state" && (m.state === "active" || m.state === "paused" || m.state === "ended")) {
    return { kind: "state", state: m.state, reason: reasonOf(m.reason) };
  }
  if (m.t === "surface") {
    const width = finitePositive(m.width);
    const height = finitePositive(m.height);
    if (width && height) return { kind: "surface", width, height };
  }
  return null;
}

// ---- 发送器：节流 + 限速 + 保序 + 抬起兜底 -------------------------------------------------
export interface ControlSenderDeps {
  /** 真正发出去；false = 链路没就绪（帧被丢弃并计数）。 */
  deliver(frame: ControllerFrame): boolean;
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** 默认 CONTROL_SEND_BUDGET_PER_SEC。 */
  budgetPerSec?: number;
}

export interface ControlSenderStats {
  sent: number;
  coalesced: number;
  dropped: number;
  queued: number;
}

export interface ControlSender {
  move(x: number, y: number): void;
  down(button: ControlButton, x: number, y: number): void;
  up(button: ControlButton, x: number, y: number): void;
  wheel(dx: number, dy: number): void;
  /** 白名单外的键返回 false，不发。 */
  keyDown(code: string, key: string, mods: readonly ControlMod[]): boolean;
  /** 只抬起本端按下过的键；没按下过返回 false。 */
  keyUp(code: string, key: string, mods: readonly ControlMod[]): boolean;
  /** 按下再抬起（输入法删除、换行等）。 */
  tap(code: string, key: string, mods?: readonly ControlMod[]): boolean;
  /** 发文本（自动切段）；返回实际排队的码点数与是否被截断。 */
  text(text: string, maxChars?: number): { chars: number; truncated: boolean };
  /** 先抬起全部，再发 stop（清掉排队中的移动/滚轮）。 */
  stop(): void;
  /** 抬起全部按下的键与鼠标键（失焦、页面隐藏、结束时用），防止对方电脑上「卡键」。 */
  releaseAll(): void;
  pressedKeys(): string[];
  pressedButtons(): ControlButton[];
  /** 链路已断：清空队列与按下状态，不再发任何东西。 */
  reset(): void;
  stats(): ControlSenderStats;
}

type QueueItem = { frame: ControllerFrame; release: boolean };

export function createControlSender(deps: ControlSenderDeps): ControlSender {
  const budget = Math.max(1, Math.floor(deps.budgetPerSec ?? CONTROL_SEND_BUDGET_PER_SEC));
  const queue: QueueItem[] = [];
  const sentAt: number[] = [];
  const keys = new Map<string, string>();
  const buttons = new Set<ControlButton>();
  let lastPoint = { x: 0.5, y: 0.5 };
  let lastMoveAt = -Infinity;
  let lastWheelAt = -Infinity;
  let timer: unknown = null;
  const stats = { sent: 0, coalesced: 0, dropped: 0 };

  function schedule(ms: number): void {
    if (timer !== null) return;
    timer = deps.setTimer(() => {
      timer = null;
      pump();
    }, Math.max(1, Math.ceil(ms)));
  }

  function pump(): void {
    while (queue.length > 0) {
      const now = deps.now();
      while (sentAt.length > 0 && sentAt[0] <= now - 1000) sentAt.shift();
      if (sentAt.length >= budget) {
        schedule(sentAt[0] + 1000 - now);
        return;
      }
      const head = queue[0];
      if (head.frame.t === "mm") {
        const wait = lastMoveAt + CONTROL_MOVE_INTERVAL_MS - now;
        if (wait > 0) {
          schedule(wait);
          return;
        }
      } else if (head.frame.t === "wh") {
        const wait = lastWheelAt + CONTROL_WHEEL_INTERVAL_MS - now;
        if (wait > 0) {
          schedule(wait);
          return;
        }
      }
      queue.shift();
      let delivered = false;
      try {
        delivered = deps.deliver(head.frame);
      } catch {
        delivered = false;
      }
      if (delivered) {
        sentAt.push(now);
        stats.sent += 1;
        if (head.frame.t === "mm") lastMoveAt = now;
        if (head.frame.t === "wh") lastWheelAt = now;
      } else {
        stats.dropped += 1;
      }
    }
  }

  function enqueue(frame: ControllerFrame, release = false): void {
    if (!frameFits(frame)) {
      stats.dropped += 1;
      return;
    }
    if (queue.length >= CONTROL_QUEUE_MAX && !release) {
      stats.dropped += 1;
      return;
    }
    queue.push({ frame, release });
    pump();
  }

  function tail(): QueueItem | undefined {
    return queue[queue.length - 1];
  }

  function dropTrailingMove(): void {
    const last = tail();
    if (last && last.frame.t === "mm") {
      queue.pop();
      stats.coalesced += 1;
    }
  }

  const sender: ControlSender = {
    move(x, y) {
      const frame: ControllerFrame = { t: "mm", x: roundRatio(x), y: roundRatio(y) };
      lastPoint = { x: frame.x, y: frame.y };
      const last = tail();
      if (last && last.frame.t === "mm") {
        last.frame = frame;
        stats.coalesced += 1;
        return;
      }
      enqueue(frame);
    },
    down(button, x, y) {
      const frame: ControllerFrame = { t: "md", b: button, x: roundRatio(x), y: roundRatio(y) };
      lastPoint = { x: frame.x, y: frame.y };
      dropTrailingMove(); // md 自带坐标，排队中的移动没必要再发
      buttons.add(button);
      enqueue(frame);
    },
    up(button, x, y) {
      if (!buttons.has(button)) return;
      const frame: ControllerFrame = { t: "mu", b: button, x: roundRatio(x), y: roundRatio(y) };
      lastPoint = { x: frame.x, y: frame.y };
      dropTrailingMove();
      buttons.delete(button);
      enqueue(frame, true);
    },
    wheel(dx, dy) {
      const ndx = clampWheel(dx);
      const ndy = clampWheel(dy);
      if (ndx === 0 && ndy === 0) return;
      const last = tail();
      if (last && last.frame.t === "wh") {
        last.frame = { t: "wh", dx: clampWheel(last.frame.dx + ndx), dy: clampWheel(last.frame.dy + ndy) };
        stats.coalesced += 1;
        return;
      }
      enqueue({ t: "wh", dx: ndx, dy: ndy });
    },
    keyDown(code, key, mods) {
      if (!isControlKeyCode(code)) return false;
      const name = sanitizeKeyName(key, code);
      keys.set(code, name);
      enqueue({ t: "kd", code, key: name, mods: sanitizeMods(mods) });
      return true;
    },
    keyUp(code, key, mods) {
      if (!keys.has(code)) return false;
      const name = sanitizeKeyName(key, code) || keys.get(code) || code;
      keys.delete(code);
      enqueue({ t: "ku", code, key: name, mods: sanitizeMods(mods) }, true);
      return true;
    },
    tap(code, key, mods = []) {
      if (!sender.keyDown(code, key, mods)) return false;
      sender.keyUp(code, key, mods);
      return true;
    },
    text(text, maxChars = CONTROL_PASTE_MAX_CHARS) {
      const clean = sanitizeControlText(text);
      const total = codePointLength(clean);
      const limited = total > maxChars ? truncateCodePoints(clean, maxChars) : clean;
      let chars = 0;
      for (const chunk of splitControlText(limited)) {
        enqueue({ t: "tx", text: chunk });
        chars += codePointLength(chunk);
      }
      return { chars, truncated: total > maxChars };
    },
    stop() {
      for (let i = queue.length - 1; i >= 0; i -= 1) {
        if (!queue[i].release) queue.splice(i, 1);
      }
      sender.releaseAll();
      enqueue({ t: "stop" }, true);
    },
    releaseAll() {
      for (const [code, name] of Array.from(keys.entries())) {
        keys.delete(code);
        enqueue({ t: "ku", code, key: name, mods: [] }, true);
      }
      for (const button of Array.from(buttons)) {
        buttons.delete(button);
        enqueue({ t: "mu", b: button, x: lastPoint.x, y: lastPoint.y }, true);
      }
    },
    pressedKeys: () => Array.from(keys.keys()),
    pressedButtons: () => Array.from(buttons),
    reset() {
      if (timer !== null) deps.clearTimer(timer);
      timer = null;
      stats.dropped += queue.length;
      queue.length = 0;
      keys.clear();
      buttons.clear();
    },
    stats: () => ({ ...stats, queued: queue.length }),
  };
  return sender;
}

// ---- 连按三次 Esc ------------------------------------------------------------------------
export interface EscapeStopDetector {
  /** 每次 keydown 调一次；返回 true = 该结束控制了。 */
  press(code: string, repeat?: boolean): boolean;
  reset(): void;
}

export function createEscapeStopDetector(
  now: () => number,
  presses: number = CONTROL_ESC_STOP_PRESSES,
  windowMs: number = CONTROL_ESC_STOP_WINDOW_MS,
): EscapeStopDetector {
  let times: number[] = [];
  return {
    press(code, repeat = false) {
      if (code !== "Escape") {
        times = [];
        return false;
      }
      if (repeat) return false; // 按住不放的自动重复不算
      const t = now();
      times = times.filter((at) => t - at <= windowMs);
      times.push(t);
      if (times.length >= presses) {
        times = [];
        return true;
      }
      return false;
    },
    reset() {
      times = [];
    },
  };
}
