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

/** 文字按码点切块，不把代理对劈开。 */
export function chunkText(text: string, size = REMOTE_TYPE_CHUNK): string[] {
  const points = [...text];
  const out: string[] = [];
  for (let index = 0; index < points.length; index += size) {
    out.push(points.slice(index, index + size).join(""));
  }
  return out;
}

export function clampPaste(text: string): { text: string; truncated: boolean } {
  const points = [...text];
  if (points.length <= REMOTE_PASTE_MAX) return { text, truncated: false };
  return { text: points.slice(0, REMOTE_PASTE_MAX).join(""), truncated: true };
}

export type RemoteDesktopBlocker = "offline" | "unsupported" | "disabled" | null;

/** 进入前提：在线 → 新客户端已上报支持 → 本机已打开。顺序即用户该先解决的顺序。 */
export function statusBlocker(status: RemoteDesktopStatus): RemoteDesktopBlocker {
  if (!status.online) return "offline";
  if (!status.supported) return "unsupported";
  if (!status.enabled) return "disabled";
  return null;
}

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
      return "这台电脑已被撤销配对。";
    case "remote_desktop_unsupported":
    case "unsupported":
      return "这台电脑上的 OceanLeo 版本还不支持远程桌面，请先更新客户端。";
    case "remote_desktop_disabled":
    case "remote_desktop_not_enabled":
    case "not_enabled":
    case "disabled":
      return "这台电脑还没有允许远程桌面。请在那台电脑的 OceanLeo 里打开开关。";
    case "session_active":
    case "remote_desktop_session_active":
      return "这台电脑已有一个正在进行的远程会话。";
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
  if (status === 409) return "这台电脑已有一个正在进行的远程会话。";
  if (status === 429) return "操作太频繁，稍等一下再试。";
  return "这一步没有完成，请稍后重试。";
}

export function blockerCopy(blocker: Exclude<RemoteDesktopBlocker, null>): string {
  switch (blocker) {
    case "offline":
      return "这台电脑不在线，上线后才能查看桌面。";
    case "unsupported":
      return "这台电脑上的 OceanLeo 版本还不支持远程桌面，请先更新客户端。";
    case "disabled":
      return "这台电脑还没有允许远程桌面。这个开关只能在那台电脑的 OceanLeo 里打开。";
  }
}
