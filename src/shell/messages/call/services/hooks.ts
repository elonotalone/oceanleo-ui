"use client";

// 通话服务的 React 钩子（合同 §3.9：useCaptions / useRecordingState / useTranscriptionState）。
// 「开着没有」一律以服务端 CallView（W05 快照的 `server` 字段）为准；开关请求刚返回、广播未到时短暂用请求结果。
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useUI } from "../../../../i18n/ui/useUI";
import { useCall, type CallPhase } from "../engine";
import { captionLines } from "./captions-model";
import { participantKey } from "./ids";
import { servicesStore } from "./runtime";
import {
  effectiveView,
  initialServicesState,
  recordingIsActive,
  recordingIsStopping,
  transcriptionIsOn,
  type ServicesState,
} from "./store";
import type { CaptionLine, CaptionsState, RecordingState, TranscriptionState } from "./types";

const SERVER_STATE: ServicesState = initialServicesState(false);

/** useCaptions() 最多给几行、每行最多几个字（组件再按小窗/放大视图裁）。 */
export const CAPTION_HOOK_MAX_LINES = 4;
export const CAPTION_HOOK_MAX_CHARS = 240;

export function useServicesState(): ServicesState {
  return useSyncExternalStore(servicesStore.subscribe, servicesStore.getState, () => SERVER_STATE);
}

/** 通话在进行：已连接或正在重连（断网重连期间开关与字幕照常可用）。 */
export function callIsLive(phase: CallPhase): boolean {
  return phase === "connected" || phase === "reconnecting";
}

/** 宿主没挂上或刚换通话时，先把状态仓对齐到这通通话再动开关。 */
function alignStore(callId: string): void {
  if (servicesStore.getState().callId !== callId) servicesStore.setCall(callId);
}

export function useTranscriptionState(): TranscriptionState {
  const call = useCall();
  const services = useServicesState();
  const callId = call.callId;
  const live = callIsLive(call.phase) && Boolean(callId);
  const server = call.server?.transcription ?? null;
  const view = live ? effectiveView(server, services.transcription.override) : null;
  const toggle = useCallback(async () => {
    if (!callId || !live) return;
    alignStore(callId);
    await servicesStore.toggleTranscription(callId, server);
  }, [callId, live, server]);
  const error = services.transcription.error;
  return {
    view,
    enabled: transcriptionIsOn(view),
    available: live,
    busy: services.transcription.busy,
    error: error ? { code: error.code, message: error.message } : null,
    toggle,
  };
}

export function useRecordingState(): RecordingState {
  const call = useCall();
  const services = useServicesState();
  const callId = call.callId;
  const live = callIsLive(call.phase) && Boolean(callId);
  const server = call.server?.recording ?? null;
  const view = live ? effectiveView(server, services.recording.override) : null;
  const toggle = useCallback(async () => {
    if (!callId || !live) return;
    alignStore(callId);
    await servicesStore.toggleRecording(callId, server);
  }, [callId, live, server]);
  const error = services.recording.error;
  return {
    view,
    active: recordingIsActive(view),
    stopping: recordingIsStopping(view),
    available: live,
    busy: services.recording.busy,
    error: error ? { code: error.code, message: error.message } : null,
    storageUnavailable: live && services.recording.storageUnavailable && services.callId === callId,
    toggle,
  };
}

export function useCaptions(): CaptionsState {
  const tt = useUI();
  const call = useCall();
  const services = useServicesState();
  const callId = call.callId;
  const live = callIsLive(call.phase) && Boolean(callId);
  const transcription = live ? effectiveView(call.server?.transcription ?? null, services.transcription.override) : null;
  const enabled = transcriptionIsOn(transcription);
  const { captions, speakers } = services;
  const participants = call.participants;

  const lines = useMemo<CaptionLine[]>(() => {
    if (!enabled || !callId || captions.callId !== callId) return [];
    const byParticipant = new Map(participants.map((p) => [participantKey(p.participantId), p]));
    const byUser = new Map(participants.map((p) => [p.userId, p]));
    const myUserId = participants.find((p) => p.isMe)?.userId ?? null;
    return captionLines(captions, servicesStore.now(), CAPTION_HOOK_MAX_LINES, CAPTION_HOOK_MAX_CHARS).map((line) => {
      const key = participantKey(line.participantId);
      const present = byParticipant.get(key);
      const known = speakers[key];
      const byUserId = line.userId ? byUser.get(line.userId) : undefined;
      const isMe = present ? present.isMe : known ? known.isMe : Boolean(myUserId && line.userId === myUserId);
      const name = (present?.displayName || known?.displayName || byUserId?.displayName || "").trim();
      return {
        participantId: line.participantId,
        userId: line.userId,
        speakerName: isMe ? tt("我") : name || tt("参与者"),
        isMe,
        sentenceId: line.sentenceId,
        text: line.text,
        isFinal: line.isFinal,
        updatedAt: line.updatedAt,
      };
    });
  }, [enabled, callId, captions, speakers, participants, tt]);

  const setHidden = useCallback((hidden: boolean) => servicesStore.setCaptionsHidden(hidden), []);
  return {
    enabled,
    lines,
    hidden: services.captionsHidden,
    setHidden,
    uplink: services.uplink,
    capture: services.capture,
  };
}
