// 通话画面的 <video> 池（返工 A-34 / V02 发现 D3）。
// 同一个参与者的同一路画面（摄像头 / 屏幕）只建一个 <video>、只 attachVideo 一次；之后小窗 ↔ 放大视图、
// 宫格 ↔ 共享版式、仅语音开关来回切换，只是把这个元素挪进新的格子，不解绑再绑——
// 解绑再绑会让 SDK 换源时的 play() 被新的 load 打断（「The play() request was interrupted by a new load request」）。
// 只有这个人离开通话、或整通通话不在了，才解绑（attachVideo(null, …)）。
import { callActions } from "../engine";

export type VideoTrack = "camera" | "screen";

/** 画面铺满格子：摄像头裁边铺满，屏幕完整显示（留黑边）。类名都在 ui.css 里。 */
const CAMERA_CLASS = "absolute inset-0 h-full w-full object-cover";
const SCREEN_CLASS = "absolute inset-0 h-full w-full object-contain";

const pool = new Map<string, { participantId: string; track: VideoTrack; el: HTMLVideoElement }>();

function keyOf(participantId: string, track: VideoTrack): string {
  return `${track}:${participantId}`;
}

/** 取这个人这一路画面的 <video>；第一次取时建好并交给引擎绑定，之后原样返回同一个元素。 */
export function acquireVideo(participantId: string, track: VideoTrack, mirror = false): HTMLVideoElement {
  const key = keyOf(participantId, track);
  let entry = pool.get(key);
  if (!entry) {
    const el = document.createElement("video");
    // 远端声音由 SDK 自己播放，<video> 只出画面：静音 + 自动播放 + 行内播放（iOS 要属性形式）。
    el.muted = true;
    el.autoplay = true;
    el.playsInline = true;
    el.setAttribute("muted", "");
    el.setAttribute("autoplay", "");
    el.setAttribute("playsinline", "");
    el.setAttribute("data-call-video", track);
    el.setAttribute("data-call-video-of", participantId);
    el.className = track === "screen" ? SCREEN_CLASS : CAMERA_CLASS;
    entry = { participantId, track, el };
    pool.set(key, entry);
    callActions.attachVideo(el, participantId, track);
  }
  // 自己的摄像头预览照镜子习惯左右翻转；别人的、屏幕都不翻。
  entry.el.style.transform = mirror && track === "camera" ? "scaleX(-1)" : "";
  return entry.el;
}

/**
 * 元素离开文档后浏览器会把它暂停（HTML 规范的 internal pause steps），重新挂回来时不会自动续播，
 * 所以挂回来若是暂停着且已有画面源，就补一次 play()；被新的 load 打断等失败一律接住，不外抛。
 */
export function resumeIfPaused(el: HTMLVideoElement): void {
  if (!el.paused || !el.srcObject) return;
  try {
    const played = el.play();
    if (played && typeof played.catch === "function") played.catch(() => undefined);
  } catch {
    /* 老浏览器 play() 同步抛错：同样不外抛 */
  }
}

/** 解绑并丢掉 keep 判否的那些画面（人离开了）。 */
export function releaseVideos(keep: (participantId: string, track: VideoTrack) => boolean): void {
  for (const [key, entry] of [...pool]) {
    if (keep(entry.participantId, entry.track)) continue;
    pool.delete(key);
    entry.el.remove();
    callActions.attachVideo(null, entry.participantId, entry.track);
  }
}

/** 通话不在了：全部解绑。 */
export function releaseAllVideos(): void {
  releaseVideos(() => false);
}

/** 池里现在有几路画面（测试与排障用）。 */
export function pooledVideoCount(): number {
  return pool.size;
}
