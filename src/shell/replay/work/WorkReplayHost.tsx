"use client";

// 全局唯一的工作回放播放层（W08 挂在消息浮层旁）。监听 openWorkReplay 派发的窗口事件，弹出全屏播放层。
import { useEffect, useState } from "react";
import { WORK_REPLAY_OPEN_EVENT } from "./open-work-replay";

export function WorkReplayHost() {
  const [replayId, setReplayId] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const id = (event as CustomEvent<{ replayId?: string }>).detail?.replayId;
      if (typeof id === "string" && id) setReplayId(id);
    };
    window.addEventListener(WORK_REPLAY_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(WORK_REPLAY_OPEN_EVENT, onOpen);
  }, []);

  if (!replayId) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      data-work-replay-layer={replayId}
      style={{ position: "fixed", inset: 0, zIndex: 2147483000, background: "#0b0d12" }}
    >
      <button type="button" onClick={() => setReplayId(null)} aria-label="close">
        ×
      </button>
    </div>
  );
}
