"use client";

// 通话服务宿主（合同 §3.9；W07 挂在小窗里，通话期间常驻）。不渲染任何东西，只管：
//  - 字幕显示：订阅 `call_caption`（合同 §3.3）→ 状态仓按说话人聚合；到点淡出；记下说话人名字。
//  - 字幕上行：通话在进行 + 服务端转写开着 + 自己开麦 → 打开 §3.6 的上行 WebSocket，
//    采同一个麦克风的 PCM（16 kHz s16le 单声道，100 ms 一帧）；静音 pause、开麦 resume；断线退避重连；
//    关转写 / 离开 / 通话结束即停（卸载时也停）。
import { useEffect, useRef } from "react";
import { useCall } from "../engine";
import { useImEvent } from "../../realtime/hooks";
import { nextCaptionExpiry } from "./captions-model";
import type { CaptionsController } from "./controller";
import { callIsLive, useServicesState } from "./hooks";
import { participantUuid } from "./ids";
import { createBrowserCaptionsController, servicesStore } from "./runtime";
import { effectiveView, transcriptionIsOn } from "./store";

export function CallServicesHost(): null {
  const call = useCall();
  const services = useServicesState();
  const live = callIsLive(call.phase) && Boolean(call.callId);
  const callId = live ? call.callId : null;

  // 进入 / 离开 / 换通话：清空上一通的字幕、错误与覆盖。卸载（小窗随通话结束消失）时归零。
  useEffect(() => {
    servicesStore.setCall(callId);
  }, [callId]);
  useEffect(() => () => servicesStore.setCall(null), []);

  // 说话人名册（离开的人最后几句字幕仍能标对名字）。
  useEffect(() => {
    if (callId) servicesStore.rememberSpeakers(call.participants);
  }, [callId, call.participants]);

  // 字幕事件：只收当前通话的（状态仓再按 call_id 过滤一次）。
  useImEvent("call_caption", (event) => {
    if (event.call_id && event.call_id === servicesStore.getState().callId) servicesStore.applyCaption(event);
  });

  // 淡出：在下一句到期时清一次。
  useEffect(() => {
    const at = nextCaptionExpiry(services.captions);
    if (at === null) return undefined;
    const timer = setTimeout(() => servicesStore.prune(), Math.max(0, at - Date.now()) + 30);
    return () => clearTimeout(timer);
  }, [services.captions]);

  // 上行控制器：一个宿主一份，卸载即关连接、停采集。
  const controllerRef = useRef<CaptionsController | null>(null);
  useEffect(() => {
    const controller = createBrowserCaptionsController();
    controllerRef.current = controller;
    return () => {
      controllerRef.current = null;
      controller.dispose();
    };
  }, []);

  const me = call.participants.find((p) => p.isMe) ?? null;
  const participantId = live ? participantUuid(me?.participantId) : null;
  const transcription = live
    ? transcriptionIsOn(effectiveView(call.server?.transcription ?? null, services.transcription.override, Date.now()))
    : false;
  const mic = live && call.me.mic;
  const micDeviceId = call.me.micDeviceId;

  useEffect(() => {
    controllerRef.current?.update({ callId, participantId, inCall: live, transcription, mic, micDeviceId });
  }, [callId, participantId, live, transcription, mic, micDeviceId]);

  return null;
}
