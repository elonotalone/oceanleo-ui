"use client";

// 全局唯一的工作回放播放层（W08 挂在消息浮层旁，契约 §8.2）：
// 1) 监听 openWorkReplay 派发的窗口事件，弹出全屏播放层（盖在消息浮层之上）；
// 2) 自己监听 `replay.consent`（W08 的 useImEvent），收到就弹同意提示——不需要别人再挂任何东西。
import { useCallback, useEffect, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { ImProfile } from "../../../lib/im/types";
import { useImEvent } from "../../messages/realtime/hooks";
import { WORK_REPLAY_OPEN_EVENT } from "./open-work-replay";
import { canForkKind, createReplayArtifact, type ForkArtifactInput } from "./fork-artifact";
import { ReplayConsentPrompt } from "./ReplayConsentPrompt";
import { WorkReplayPlayer } from "./WorkReplayPlayer";

interface PendingConsent {
  replayId: string;
  title: string;
  from: ImProfile | null;
}

const LAYER_Z = 2147483000;

export function WorkReplayHost() {
  const [replayId, setReplayId] = useState<string | null>(null);
  const [consents, setConsents] = useState<PendingConsent[]>([]);
  const tt = useUI();
  // 「从这一步接手」：存成查看者自己库里的新作品（只有 video / audio 两族能存，见 fork-artifact.ts）。
  const createArtifact = useCallback((input: ForkArtifactInput) => createReplayArtifact(input, { tt }), [tt]);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const id = (event as CustomEvent<{ replayId?: string }>).detail?.replayId;
      if (typeof id === "string" && id) setReplayId(id);
    };
    window.addEventListener(WORK_REPLAY_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(WORK_REPLAY_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!replayId) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReplayId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replayId]);

  useImEvent("replay.consent", (event) => {
    setConsents((current) =>
      current.some((item) => item.replayId === event.replay_id)
        ? current
        : [...current, { replayId: event.replay_id, title: event.title, from: event.from ?? null }],
    );
  });

  const closeConsent = useCallback((id: string) => {
    setConsents((current) => current.filter((item) => item.replayId !== id));
  }, []);

  const consent = consents[0] ?? null;
  if (!replayId && !consent) return null;
  return (
    <>
      {replayId ? (
        <div
          role="dialog"
          aria-modal="true"
          data-work-replay-layer={replayId}
          className="fixed inset-0 bg-white"
          style={{ zIndex: LAYER_Z }}
        >
          <WorkReplayPlayer replayId={replayId} onClose={() => setReplayId(null)} createArtifact={createArtifact} canForkKind={canForkKind} />
        </div>
      ) : null}
      {consent ? (
        <ReplayConsentPrompt
          key={consent.replayId}
          replayId={consent.replayId}
          title={consent.title}
          from={consent.from}
          onDone={() => closeConsent(consent.replayId)}
        />
      ) : null}
    </>
  );
}
