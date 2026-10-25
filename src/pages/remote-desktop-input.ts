/**
 * 远程桌面查看页的纯函数：坐标换算、按键映射、文字分块、错误与状态文案。
 * 不碰 DOM、不碰网络，测试可直接 import。
 */

import type {
  RemoteDesktopAction,
  RemoteDesktopButton,
  RemoteDesktopStatus,
} from "../api/remote-desktop";

/** 单次 `type` 的文字上限；粘贴更长的文字按此分块依次送出（后端另有字符串上限）。 */
export const REMOTE_TYPE_CHUNK = 200;
/** 一次粘贴最多送多少字，超出直接截断并提示，避免把对方输入队列灌满。 */
export const REMOTE_PASTE_MAX = 2000;

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * `<img>` 用 `object-fit: contain` 时，元素矩形里会有上下或左右的留白；
 * 画面真正占的是居中的这块。比例坐标必须相对**这块**算，否则点在留白旁边就会偏。
 */
export function containedRect(rect: RectLike, contentWidth: number, contentHeight: number): RectLike {
  if (!(contentWidth > 0) || !(contentHeight > 0)) return rect;
  if (!(rect.width > 0) || !(rect.height > 0)) return rect;
  const scale = Math.min(rect.width / contentWidth, rect.height / contentHeight);
  const width = contentWidth * scale;
  const height = contentHeight * scale;
  return {
    left: rect.left + (rect.width - width) / 2,
    top: rect.top + (rect.height - height) / 2,
    width,
    height,
  };
}

/**
 * 把鼠标位置换成 0..1 的比例坐标。比例相对「画面元素」自身的矩形，
 * 所以无论页面缩放、全屏、窗口多大，对方电脑上落点都一致。
 * 元素没有尺寸时返回 null；落在画面之外会夹到边上（拖动时手滑出界不丢事件）。
 */
export function toNormalized(
  clientX: number,
  clientY: number,
  rect: RectLike,
): NormalizedPoint | null {
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  return {
    x: clamp01((clientX - rect.left) / rect.width),
    y: clamp01((clientY - rect.top) / rect.height),
  };
}

export function insideRect(clientX: number, clientY: number, rect: RectLike): boolean {
  return (
    clientX >= rect.left &&
    clientX <= rect.left + rect.width &&
    clientY >= rect.top &&
    clientY <= rect.top + rect.height
  );
}

export function mouseButton(button: number): RemoteDesktopButton | null {
  if (button === 0) return "left";
  if (button === 1) return "middle";
  if (button === 2) return "right";
  return null;
}

/** 拖动判定：按下与抬起的位移超过这个比例才算 drag，否则是点击。 */
export const DRAG_THRESHOLD = 0.006;

export function isDrag(from: NormalizedPoint, to: NormalizedPoint): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) > DRAG_THRESHOLD;
}

/** 手指/笔点按天然会抖几个像素；按 CSS 像素算位移，超过这个才算拖动，否则仍是点击。 */
export const TOUCH_SLOP_PX = 10;

/** 同一次手势里，第二次点按离第一次多近（比例坐标）才合成双击。 */
export const DOUBLE_TAP_RADIUS = 0.03;

/**
 * 指针手势的拖动判定。鼠标沿用比例阈值；触摸/笔用像素阈值（`rect` 是画面真正占的那块）。
 */
export function isPointerDrag(
  pointerType: string,
  from: NormalizedPoint,
  to: NormalizedPoint,
  rect: RectLike,
): boolean {
  if (pointerType !== "touch" && pointerType !== "pen") return isDrag(from, to);
  return Math.hypot((to.x - from.x) * rect.width, (to.y - from.y) * rect.height) > TOUCH_SLOP_PX;
}

export function isNearby(a: NormalizedPoint, b: NormalizedPoint): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= DOUBLE_TAP_RADIUS;
}

export interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing?: boolean;
}

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "AltGraph", "CapsLock", "OS"]);

/**
 * 键盘事件 → 动作。
 * - 单独按下修饰键：不发（真正的组合键在非修饰键到来时带上 modifiers）。
 * - 可打印单字符且没有 ctrl/meta/alt：作为 `type` 文字发送（带上 shift 之后的字符本身）。
 * - 其余（Enter、方向键、Ctrl+C …）：`keypress`，key 取浏览器 key，modifiers 小写。
 * - 输入法组字中（isComposing）不发，上屏文字走 `compositionend` / 粘贴路径。
 */
export function keyEventToAction(event: KeyEventLike): RemoteDesktopAction | null {
  if (event.isComposing || event.key === "Process" || event.key === "Dead") return null;
  // 手机软键盘常给 `Unidentified`（或空 key）：它不是一个键，字符要从 input 事件取。
  if (!event.key || event.key === "Unidentified") return null;
  if (MODIFIER_KEYS.has(event.key)) return null;
  const chord = event.ctrlKey || event.metaKey || event.altKey;
  if (!chord && [...event.key].length === 1) {
    return { kind: "type", text: event.key };
  }
  const modifiers: string[] = [];
  if (event.ctrlKey) modifiers.push("ctrl");
  if (event.altKey) modifiers.push("alt");
  if (event.metaKey) modifiers.push("meta");
  if (event.shiftKey) modifiers.push("shift");
  const key = event.key === " " ? "Space" : event.key;
  if (!key) return null;
  return modifiers.length > 0 ? { kind: "keypress", key, modifiers } : { kind: "keypress", key };
}

export type SoftInputKind = "text" | "enter" | "backspace" | "delete" | "ignore";

/**
 * 软键盘 / 浏览器的 `beforeinput`·`input` 事件的 inputType → 该怎么处理。
 * - 组字中、以及任何 `insertCompositionText`：一律 ignore，上屏文字只走 `compositionend`
 *   （Safari 会在 compositionend 之后再补一个 insertCompositionText 的 input，不能二次发送）。
 * - 粘贴走 paste 事件，不在这里发。
 * - 缺 inputType（旧浏览器）按普通文字。
 */
export function classifyInput(inputType: string | undefined | null, composing: boolean): SoftInputKind {
  if (composing) return "ignore";
  switch (inputType || "insertText") {
    case "insertText":
    case "insertReplacementText":
      return "text";
    case "insertLineBreak":
    case "insertParagraph":
      return "enter";
    case "deleteContentBackward":
      return "backspace";
    case "deleteContentForward":
      return "delete";
    default:
      return "ignore";
  }
}

/** 换行 / 删除这几类 inputType 对应的按键动作；文字类返回 null。 */
export function softInputKeyAction(kind: SoftInputKind): RemoteDesktopAction | null {
  switch (kind) {
    case "enter":
      return { kind: "keypress", key: "Enter" };
    case "backspace":
      return { kind: "keypress", key: "Backspace" };
    case "delete":
      return { kind: "keypress", key: "Delete" };
    default:
      return null;
  }
}

/** 文字按码点切块，不把代理对劈开。 */
export function chunkText(text: string, size = REMOTE_TYPE_CHUNK): string[] {
  const points = [...text];
  const out: string[] = [];
  for (let index = 0; index < points.length; index += size) {
    out.push(points.slice(index, index + size).join(""));
  }
  return out;
}

/**
 * 网关只收「可打印字符 + 换行 + 制表」：回车统一成换行，各种不间断/全角空白换成普通空格，
 * 控制符、零宽/格式符、未分配码位直接去掉，否则整段会被 422 拒掉。
 */
export function sanitizeRemoteText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\p{Zs}/gu, " ")
    .replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/gu, (ch) => (ch === "\n" || ch === "\t" ? ch : ""));
}

export function clampPaste(text: string): { text: string; truncated: boolean } {
  const points = [...text];
  if (points.length <= REMOTE_PASTE_MAX) return { text, truncated: false };
  return { text: points.slice(0, REMOTE_PASTE_MAX).join(""), truncated: true };
}

export type RemoteDesktopBlocker = "offline" | "unsupported" | "signed_out" | null;

/** Missing permission is a request, never an entry blocker. */
export function statusBlocker(status: RemoteDesktopStatus): RemoteDesktopBlocker {
  if (status.availability === "signed_out") return "signed_out";
  if (!status.online) return "offline";
  if (!status.supported) return "unsupported";
  return null;
}

/**
 * 网关（B）真实返回的码；这些会话已经不可能继续，不能再重试或再发输入。
 * `remote_desktop_unavailable` 在创建时是 409，也算：它是旧客户端/断线，不是别人占用。
 */
export const REMOTE_FATAL_CODES: ReadonlySet<string> = new Set([
  "unauthorized",
  "revoked",
  "device_offline",
  "remote_desktop_unavailable",
  "remote_desktop_disabled",
  "disabled_locally",
  "device_lost",
  "viewer_idle",
  "viewer_closed",
  "account_mismatch",
  "session_closed",
  "session_not_found",
  "session_expired",
  "expired",
  "denied",
  "request_expired",
  "signed_out",
  "controller_revoked",
]);

/** 这类拒绝只是「现在太快」，该停一会儿再送，而不是继续灌。 */
export const REMOTE_BACKPRESSURE_CODES: ReadonlySet<string> = new Set([
  "input_queue_full",
  "rate_limited",
  "quota_rate",
]);

/** 返回中文原文（调用方再过 `tt`），未知码落到统一兜底，不把英文 token 摆给用户。 */
export function remoteDesktopErrorCopy(code?: string, status?: number): string {
  switch (code) {
    case "unauthorized":
      return "登录已失效，请重新登录后再试。";
    case "network_error":
      return "网络不通，暂时连不上。";
    case "response_malformed":
      return "服务返回的内容读不懂，请稍后重试。";
    case "device_offline":
    case "offline":
      return "这台电脑不在线。";
    case "revoked":
    case "controller_revoked":
      return "访问权限已撤销。";
    case "denied":
      return "这台电脑拒绝了请求。";
    case "request_expired":
      return "请求已超时，请重试。";
    case "signed_out":
      return "这台电脑尚未登录。";
    case "controller_identity_unavailable":
      return "无法保存此设备的身份，请允许本地存储后重试。";
    case "remote_desktop_unavailable":
      return "联系不上这台电脑上的 OceanLeo：它可能没有运行、版本太旧或已断线。请在那台电脑上打开并更新 OceanLeo。";
    case "remote_desktop_unsupported":
    case "unsupported":
      return "这台电脑上的 OceanLeo 版本还不支持远程桌面，请先更新客户端。";
    case "remote_desktop_disabled":
    case "remote_desktop_not_enabled":
    case "not_enabled":
    case "disabled":
      return "请更新这台电脑上的 OceanLeo 后重试。";
    case "disabled_locally":
      return "那台电脑上已关闭远程桌面，会话已断开。";
    case "device_lost":
      return "与这台电脑失去联系，会话已断开。请确认它还在线后重新进入。";
    case "viewer_idle":
      return "太久没有操作，会话已自动断开。";
    case "viewer_closed":
      return "会话已断开。";
    case "account_mismatch":
      return "那台电脑上登录的账号与当前网页账号不一致，会话已断开。";
    case "session_closed":
      return "会话已结束，请重新进入。";
    case "session_active":
    case "remote_desktop_session_active":
      return "这台电脑已有一个正在进行的远程会话。";
    case "too_many_sessions":
      return "同时打开的远程会话太多了，请先关闭不用的会话。";
    case "input_queue_full":
      return "那台电脑一时处理不过来，刚才的输入被丢弃了。请放慢一点。";
    case "session_expired":
    case "expired":
      return "会话已到期，请重新进入。";
    case "session_not_found":
    case "not_found":
      return "会话已结束，请重新进入。";
    case "rate_limited":
    case "quota_rate":
      return "操作太频繁，稍等一下再试。";
    default:
      break;
  }
  if (status === 401) return "登录已失效，请重新登录后再试。";
  if (status === 404) return "会话已结束，请重新进入。";
  if (status === 429) return "操作太频繁，稍等一下再试。";
  return "这一步没有完成，请稍后重试。";
}

export function blockerCopy(blocker: Exclude<RemoteDesktopBlocker, null>): string {
  switch (blocker) {
    case "offline":
      return "这台电脑不在线，上线后才能查看桌面。";
    case "unsupported":
      return "这台电脑上的 OceanLeo 版本还不支持远程桌面，请先更新客户端。";
    case "signed_out":
      return "这台电脑尚未登录。";
  }
}
