// 从任何地方打开一段工作回放：派发窗口事件，由全局唯一的 WorkReplayHost 接住。归 W05（work-chat 契约 §8.2）。

export const WORK_REPLAY_OPEN_EVENT = "oceanleo:work-replay-open";

export function openWorkReplay(replayId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(WORK_REPLAY_OPEN_EVENT, { detail: { replayId } }));
}
