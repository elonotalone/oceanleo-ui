// 当前通话用的 SDK 实例（只有一份；入会成功时登记，离开/销毁时清掉）。
// 给仲裁 A-9 的 `getLocalMicTrack()` 用：调用方只许 clone() 后使用、自己 stop 自己的 clone，绝不 stop 原轨道。
import type { ArtcEngine } from "./sdk";

let activeEngine: ArtcEngine | null = null;

export function setActiveEngine(engine: ArtcEngine | null): void {
  activeEngine = engine;
}

export function getActiveEngine(): ArtcEngine | null {
  return activeEngine;
}

/** 当前发布中的本地麦克风轨道（ARTC `engine.getAudioTrack()` 不传 userId 的返回值）；未入会/没有时 null。 */
export async function getLocalMicTrack(): Promise<MediaStreamTrack | null> {
  const engine = activeEngine;
  if (!engine || typeof engine.getAudioTrack !== "function") return null;
  try {
    const track = await engine.getAudioTrack();
    return track && track.readyState !== "ended" ? track : null;
  } catch {
    return null;
  }
}
