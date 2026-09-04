/**
 * 运行 / 停止 / 重载 的去向。纯函数，闸直接调它。
 *
 * 「停止」= 暂停（lifecycle paused，iframe 不拆）。
 * 「重载」= 换 reloadKey，预览宿主必须重挂 iframe。
 * 「运行」= 取消暂停；不换 reloadKey（那是重载的事）。
 *
 * 产品被改成按钮空转时，比较函数吐出的状态就能红（A-48）。
 */
export interface GamePreviewPlayback {
  paused: boolean;
  reloadKey: number;
}

export type GamePreviewControl = "run" | "stop" | "reload";

export const GAME_PREVIEW_INITIAL: GamePreviewPlayback = {
  paused: false,
  reloadKey: 0,
};

export function planGamePreviewControl(
  state: GamePreviewPlayback,
  action: GamePreviewControl,
): GamePreviewPlayback {
  if (action === "stop") {
    return { paused: true, reloadKey: state.reloadKey };
  }
  if (action === "reload") {
    return { paused: false, reloadKey: state.reloadKey + 1 };
  }
  return { paused: false, reloadKey: state.reloadKey };
}

export function isGamePreviewRunning(state: GamePreviewPlayback): boolean {
  return state.paused === false;
}
