"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { accessToken } from "../../lib/auth/client";
import { GATEWAY_BASE } from "../../lib/auth/config";
import { formatMoney } from "../../lib/money";
import { callStatusLabel, formatConnectedTime, tokenUsageRows } from "../../lib/call-billing-display";
import { acceptMediaStreamIfCurrent, floatToPcm16LE, flushPlaybackQueue, isCurrentCallAttempt, isCurrentCallSocket, pcm16LEToFloat, shouldRefreshRealtimeBill, stopMediaStreams, videoFrameEnvelope } from "../../lib/realtime-audio";
import { appendFinalUserTranscript, upsertFinalAssistantTranscript } from "../../lib/realtime-transcript";
import { claimCall, releaseCall } from "../messages/meeting/meeting-host-state";
import {
  base64ToBytes, bytesToBase64, closeLeoRealtimeSession, createLeoRealtimeSession, realtimeSocket, takeRealtimeMessages,
  LEO_TRANSCRIPT_UPDATED_EVENT, START_LEO_REALTIME_EVENT, type LeoRealtimeBill, type LeoRealtimeContext,
  type LeoRealtimeServerEvent, type LeoRealtimeSession,
} from "../../lib/leo-realtime";

type StartRequest = { sessionId: string; context?: LeoRealtimeContext };
type CallState = "idle" | "starting" | "connected" | "ending" | "ended";

const errorCopy: Record<string, string> = {
  unauthorized: "登录状态已过期，请重新登录后发起通话。",
  call_cancelled: "连接已取消，麦克风已停止。",
  insufficient_balance: "余额不足，无法开始 Leo 实时通话。",
  realtime_config_missing: "本版 Leo 实时模型尚未配置，当前没有启动媒体。",
  realtime_unavailable: "Leo 实时通话暂不可用，请稍后重试。",
  realtime_provider_not_configured: "本版 Leo 实时模型尚未配置，当前没有启动媒体。",
  realtime_model_unavailable: "当前版本没有可用的实时模型，通话未启动。",
  billing_unavailable: "服务端计费核验尚未就绪，通话未启动。",
  RATE_LIMIT: "输入或画面帧速率超过服务端限制。已按服务端节流继续；过长语音片段请说短一些。",
  FRAME_TOO_LARGE: "画面帧超过服务端大小限制，正在降低分辨率后继续发送。",
  media_devices_unavailable: "此浏览器没有可用的麦克风。",
  NotAllowedError: "麦克风权限未获准。允许麦克风后再开始通话。",
  audio_worklet_unsupported: "此浏览器不支持低延迟音频，请更新浏览器后重试。",
};

const workletSource =
  "class LeoPcmCapture extends AudioWorkletProcessor {" +
  "constructor(options){super();this.target=options.processorOptions.targetRate;this.phase=0;this.carry=[];this.chunk=Math.max(1,Math.round(this.target*.02));}" +
  "process(inputs,outputs){const input=inputs[0]&&inputs[0][0],output=outputs[0]&&outputs[0][0];if(output)output.fill(0);if(!input)return true;const ratio=sampleRate/this.target;" +
  "for(let i=0;i<input.length;i++){this.phase++;if(this.phase>=ratio){this.phase-=ratio;this.carry.push(input[i]);if(this.carry.length>=this.chunk){this.port.postMessage(new Float32Array(this.carry));this.carry=[];}}}return true;}}" +
  "registerProcessor('leo-pcm-capture',LeoPcmCapture);";

function copyError(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  return errorCopy[code] || errorCopy[error instanceof DOMException ? error.name : ""] || (code ? "通话未能开始：" + code : "通话未能开始，请稍后重试。");
}

export function RealtimeCallHost() {
  const [request, setRequest] = useState<StartRequest | null>(null);
  const [state, setState] = useState<CallState>("idle");
  const [message, setMessage] = useState("");
  const [transcript, setTranscript] = useState<string[]>([]);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [bill, setBill] = useState<LeoRealtimeBill | null>(null);
  const [session, setSession] = useState<LeoRealtimeSession | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState("");
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState("");
  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const cameraRef = useRef<MediaStream | null>(null);
  const screenRef = useRef<MediaStream | null>(null);
  const cameraVideo = useRef<HTMLVideoElement | null>(null);
  const screenVideo = useRef<HTMLVideoElement | null>(null);
  const playback = useRef<AudioBufferSourceNode[]>([]);
  const playbackAt = useRef(0);
  const frameTimer = useRef<number | null>(null);
  const frameSourceTurn = useRef<"camera" | "screen">("camera");
  const mutedRef = useRef(false);
  const stateRef = useRef<CallState>(state);
  const sessionRef = useRef<LeoRealtimeSession | null>(session);
  const attemptRef = useRef(0);
  const callClaimRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cameraGenerationRef = useRef(0);
  const screenGenerationRef = useRef(0);
  const microphoneGenerationRef = useRef(0);
  const responseTextRef = useRef("");
  const responseActiveRef = useRef(false);
  const mountedRef = useRef(false);
  const frameEdgeRef = useRef(512);
  const frameQualityRef = useRef(0.7);
  const billFetchRef = useRef<Promise<LeoRealtimeBill | null> | null>(null);
  const lastBillFetchRef = useRef(0);
  mutedRef.current = muted;
  stateRef.current = state;
  sessionRef.current = session;

  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<StartRequest>).detail;
      if (!detail?.sessionId) return;
      if (stateRef.current === "starting" || stateRef.current === "connected" || stateRef.current === "ending") {
        setMessage("Leo 实时通话已经在进行中。");
        return;
      }
      setRequest(detail);
      setState("idle");
      setMessage("");
      setBill(null);
      setTranscript([]);
      setMinimized(false);
    };
    window.addEventListener(START_LEO_REALTIME_EVENT, receive);
    return () => window.removeEventListener(START_LEO_REALTIME_EVENT, receive);
  }, []);

  useEffect(() => {
    let alive = true;
    void navigator.mediaDevices?.enumerateDevices?.().then((rows) => {
      if (alive) {
        setDevices(rows.filter((device) => device.kind === "audioinput"));
        setCameras(rows.filter((device) => device.kind === "videoinput"));
      }
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (cameraVideo.current && cameraRef.current) cameraVideo.current.srcObject = cameraRef.current;
  }, [cameraOn]);
  useEffect(() => {
    if (screenVideo.current && screenRef.current) screenVideo.current.srcObject = screenRef.current;
  }, [sharing]);

  function send(payload: object): void {
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify(payload));
  }

  function acceptServerText(raw: string): void {
    let data: LeoRealtimeServerEvent;
    try { data = JSON.parse(raw) as LeoRealtimeServerEvent; } catch { return; }
    if (data.type === "audio.output") playAudio(data.audio);
    else if (data.type === "speech.started") flushAudio();
    else if (data.type === "response.started") {
      responseTextRef.current = "";
      responseActiveRef.current = true;
      setTranscript((rows) => [...rows, "Leo："]);
    }
    else if (data.type === "text.delta") {
      const text = data.text ?? data.delta ?? "";
      if (!text) return;
      responseTextRef.current += text;
      const rendered = "Leo：" + responseTextRef.current;
      setTranscript((rows) => responseActiveRef.current && rows.at(-1) === "Leo："
        ? [...rows.slice(0, -1), rendered]
        : responseActiveRef.current && rows.at(-1)?.startsWith("Leo：")
        ? [...rows.slice(0, -1), rendered]
        : [...rows.slice(-99), rendered]);
    } else if (data.type === "response.finished") {
      responseActiveRef.current = false;
      if (!responseTextRef.current) setTranscript((rows) => rows.at(-1) === "Leo：" ? rows.slice(0, -1) : rows);
    }
    else if (data.type === "transcript.final" && data.text) {
      window.dispatchEvent(new CustomEvent(LEO_TRANSCRIPT_UPDATED_EVENT, { detail: { sessionId: sessionRef.current?.leo_session_id ?? request?.sessionId } }));
      if (data.role === "user") {
        setTranscript((rows) => appendFinalUserTranscript(rows, data.text!));
      } else {
        responseTextRef.current = data.text;
        responseActiveRef.current = false;
        setTranscript((rows) => upsertFinalAssistantTranscript(rows, data.text!));
      }
    } else if (data.type === "transcript" && data.text) {
      setTranscript((rows) => [...rows.slice(-99), (data.role === "user" ? "我：" : "Leo：") + data.text]);
    } else if (data.type === "usage.settled") {
      const id = sessionRef.current?.session_id;
      if (id) void loadBill(id);
    } else if (data.type === "session.closed") void endCall(false);
    else if (data.type === "error") {
      const code = data.code || "";
      if (code === "FRAME_TOO_LARGE") {
        frameEdgeRef.current = Math.max(192, Math.round(frameEdgeRef.current * 0.75));
        frameQualityRef.current = Math.max(0.35, frameQualityRef.current - 0.1);
      }
      setMessage(data.message || errorCopy[code] || "实时通话发生错误。");
    }
  }

  function flushAudio(): void {
    flushPlaybackQueue(playback.current, audioContextRef.current?.currentTime ?? 0, (time) => { playbackAt.current = time; });
  }

  function playAudio(encoded: string): void {
    const context = audioContextRef.current;
    const currentSession = sessionRef.current;
    if (!context || !currentSession) return;
    const bytes = base64ToBytes(encoded);
    const decoded = pcm16LEToFloat(bytes);
    const data = new Float32Array(new ArrayBuffer(decoded.byteLength));
    data.set(decoded);
    const buffer = context.createBuffer(1, data.length, currentSession.audio.output_sample_rate_hz);
    buffer.copyToChannel(data, 0);
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.connect(context.destination);
    const startAt = Math.max(context.currentTime + 0.015, playbackAt.current);
    playbackAt.current = startAt + buffer.duration;
    playback.current.push(node);
    node.onended = () => { playback.current = playback.current.filter((entry) => entry !== node); node.disconnect(); };
    node.start(startAt);
  }

  function cleanupMedia(): void {
    cameraGenerationRef.current += 1;
    screenGenerationRef.current += 1;
    microphoneGenerationRef.current += 1;
    if (frameTimer.current !== null) window.clearInterval(frameTimer.current);
    frameTimer.current = null;
    workletRef.current?.disconnect();
    sourceRef.current?.disconnect();
    workletRef.current = null;
    sourceRef.current = null;
    stopMediaStreams([micRef.current, cameraRef.current, screenRef.current]);
    micRef.current = null;
    cameraRef.current = null;
    screenRef.current = null;
    if (mountedRef.current) {
      setCameraOn(false);
      setSharing(false);
      setMuted(false);
    }
    flushAudio();
    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
  }

  async function loadBill(id: string): Promise<LeoRealtimeBill | null> {
    if (billFetchRef.current) return billFetchRef.current;
    const fetchPromise = (async () => {
      const token = await accessToken();
      if (!token) return null;
      const base = (GATEWAY_BASE || "").replace(/\/+$/, "");
      const response = await fetch(base + "/v1/leo/realtime/sessions/" + encodeURIComponent(id) + "/bill", {
        headers: { Authorization: "Bearer " + token },
      });
      if (!response.ok) return null;
      const result = await response.json() as LeoRealtimeBill;
      lastBillFetchRef.current = Date.now();
      if (mountedRef.current) setBill(result);
      return result;
    })().finally(() => { billFetchRef.current = null; });
    billFetchRef.current = fetchPromise;
    return fetchPromise;
  }

  async function refreshFinalBill(id: string): Promise<void> {
    // Provider settlement can trail websocket close. Bound the wait, and leave
    // the UI pending if the authoritative ledger has not reconciled yet.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const result = await loadBill(id).catch(() => null);
      if (result?.pending_reconciliation || result?.status === "closed" || result?.status === "settled") return;
      if (attempt < 5) await new Promise((resolve) => window.setTimeout(resolve, 500));
    }
  }

  async function endCall(sendClose = true): Promise<void> {
    if (stateRef.current === "idle" || stateRef.current === "ended" || stateRef.current === "ending") return;
    if (stateRef.current === "starting") {
      attemptRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
    }
    stateRef.current = "ending";
    if (mountedRef.current) setState("ending");
    const current = sessionRef.current;
    const socket = socketRef.current;
    if (sendClose && socket?.readyState === WebSocket.OPEN) {
      send({ type: "control.close" });
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, 1500);
        socket.addEventListener("close", () => { window.clearTimeout(timer); resolve(); }, { once: true });
      });
    }
    if (sendClose && socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, "user ended");
    socketRef.current = null;
    cleanupMedia();
    if (current) {
      try { await refreshFinalBill(current.session_id); } catch { /* a later bill refresh may succeed */ }
      window.dispatchEvent(new CustomEvent(LEO_TRANSCRIPT_UPDATED_EVENT, { detail: { sessionId: current.leo_session_id ?? request?.sessionId } }));
    }
    if (mountedRef.current) setState("ended");
    stateRef.current = "ended";
    releaseCall("leo-realtime", callClaimRef.current);
    callClaimRef.current = null;
  }

  async function startCall(): Promise<void> {
    if (!request || stateRef.current === "starting" || stateRef.current === "connected") return;
    const claim = claimCall("leo-realtime");
    if (claim === null) { setMessage("另一个通话正在进行，请先结束它再开始 Leo 实时通话。"); return; }
    callClaimRef.current = claim;
    const attempt = ++attemptRef.current;
    const abortController = new AbortController();
    abortRef.current = abortController;
    responseTextRef.current = "";
    responseActiveRef.current = false;
    setState("starting");
    stateRef.current = "starting";
    setMessage("");
    let stream: MediaStream | null = null;
    let admittedSessionId: string | null = null;
    let localSocket: WebSocket | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("media_devices_unavailable");
      stream = await navigator.mediaDevices.getUserMedia({ audio: selectedMic ? { deviceId: { exact: selectedMic } } : true });
      if (attempt !== attemptRef.current || abortController.signal.aborted) { stream.getTracks().forEach((track) => track.stop()); return; }
      micRef.current = stream;
      const created = await createLeoRealtimeSession(request.sessionId, request.context, abortController.signal);
      admittedSessionId = created.session_id;
      if (attempt !== attemptRef.current || abortController.signal.aborted) {
        void closeLeoRealtimeSession(created.session_id).catch(() => undefined);
        return;
      }
      sessionRef.current = created;
      setSession(created);
      const socket = await realtimeSocket(created, abortController.signal);
      localSocket = socket;
      if (attempt !== attemptRef.current || abortController.signal.aborted) {
        socket.close(1000, "call cancelled");
        void closeLeoRealtimeSession(created.session_id).catch(() => undefined);
        return;
      }
      socketRef.current = socket;
      socket.onmessage = (event) => acceptServerText(String(event.data));
      for (const pending of takeRealtimeMessages(socket)) acceptServerText(pending);
      socket.onclose = () => {
        if (!isCurrentCallSocket(attempt, attemptRef.current, socket, socketRef.current)) return;
        if (stateRef.current === "starting" || stateRef.current === "connected") {
          setMessage("连接已中断；媒体已停止。重新连接会创建一笔新的服务端计量会话。");
          void endCall(false);
        }
      };
      const context = new AudioContext();
      audioContextRef.current = context;
      await context.resume();
      const blobUrl = URL.createObjectURL(new Blob([workletSource], { type: "text/javascript" }));
      try { await context.audioWorklet.addModule(blobUrl); } finally { URL.revokeObjectURL(blobUrl); }
      if (attempt !== attemptRef.current || abortController.signal.aborted) throw new Error("call_cancelled");
      const source = context.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(context, "leo-pcm-capture", {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
        processorOptions: { targetRate: created.audio.input_sample_rate_hz },
      });
      source.connect(worklet);
      worklet.connect(context.destination);
      worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (socket.readyState !== WebSocket.OPEN || mutedRef.current || stateRef.current !== "connected") return;
        send({ type: "audio.input", audio: bytesToBase64(floatToPcm16LE(new Float32Array(event.data))) });
      };
      sourceRef.current = source;
      workletRef.current = worklet;
      if (socket.readyState !== WebSocket.OPEN) throw new Error("realtime_socket_closed");
      setState("connected");
      stateRef.current = "connected";
      setMinimized(false);
      abortRef.current = null;
    } catch (error) {
      const cancelled = attempt !== attemptRef.current || abortController.signal.aborted;
      if (!isCurrentCallAttempt(attempt, attemptRef.current)) {
        // A newer attempt may already own every shared ref. Tear down only this
        // attempt's local resources; never reset or clean up the newer call.
        stream?.getTracks().forEach((track) => track.stop());
        if (localSocket && localSocket.readyState < WebSocket.CLOSING) localSocket.close(1000, "stale call attempt");
        if (admittedSessionId) void closeLeoRealtimeSession(admittedSessionId).catch(() => undefined);
        return;
      }
      stateRef.current = "ending";
      if (abortRef.current === abortController) abortRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
      micRef.current = null;
      if (localSocket && localSocket.readyState < WebSocket.CLOSING) localSocket.close();
      socketRef.current = null;
      cleanupMedia();
      if (admittedSessionId) void closeLeoRealtimeSession(admittedSessionId).catch(() => undefined);
      if (!cancelled) {
        if (mountedRef.current) setMessage(copyError(error));
        if (mountedRef.current) setState("idle");
        stateRef.current = "idle";
        releaseCall("leo-realtime", claim);
        if (callClaimRef.current === claim) callClaimRef.current = null;
      }
    }
  }

  function cancelStart(): void {
    if (stateRef.current !== "starting") return;
    attemptRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    socketRef.current?.close(1000, "call cancelled");
    socketRef.current = null;
    cleanupMedia();
    setState("idle");
    stateRef.current = "idle";
    setMessage(errorCopy.call_cancelled);
    releaseCall("leo-realtime", callClaimRef.current);
    callClaimRef.current = null;
  }

  useEffect(() => {
    if (state !== "connected" || !session?.session_id) return;
    const sessionId = session.session_id;
    const timer = window.setInterval(() => {
      if (shouldRefreshRealtimeBill(lastBillFetchRef.current)) void loadBill(sessionId).catch(() => undefined);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [state, session?.session_id]);

  async function toggleCamera(): Promise<void> {
    if (cameraRef.current) {
      cameraGenerationRef.current += 1;
      cameraRef.current.getTracks().forEach((track) => track.stop());
      cameraRef.current = null;
      setCameraOn(false);
      return;
    }
    const generation = ++cameraGenerationRef.current;
    try {
      const stream = await acceptMediaStreamIfCurrent(
        navigator.mediaDevices.getUserMedia({ video: selectedCamera ? { deviceId: { exact: selectedCamera } } : true, audio: false }),
        () => generation === cameraGenerationRef.current && stateRef.current === "connected",
      );
      if (!stream) return;
      cameraRef.current = stream;
      setCameraOn(true);
    } catch (error) { if (generation === cameraGenerationRef.current && stateRef.current === "connected") setMessage(copyError(error)); }
  }

  async function switchMicrophone(deviceId: string): Promise<void> {
    if (stateRef.current !== "connected" || !audioContextRef.current || !workletRef.current) {
      setSelectedMic(deviceId);
      return;
    }
    const generation = ++microphoneGenerationRef.current;
    try {
      const next = await acceptMediaStreamIfCurrent(
        navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true }),
        () => generation === microphoneGenerationRef.current && stateRef.current === "connected",
      );
      if (!next) return;
      if (mutedRef.current) next.getAudioTracks().forEach((track) => { track.enabled = false; });
      const source = audioContextRef.current.createMediaStreamSource(next);
      source.connect(workletRef.current);
      const previous = sourceRef.current;
      sourceRef.current = source;
      const previousStream = micRef.current;
      micRef.current = next;
      previous?.disconnect();
      previousStream?.getTracks().forEach((track) => track.stop());
      setSelectedMic(deviceId);
    } catch (error) { if (generation === microphoneGenerationRef.current && stateRef.current === "connected") setMessage(copyError(error)); }
  }

  async function switchCamera(deviceId: string): Promise<void> {
    if (!cameraRef.current) { setSelectedCamera(deviceId); return; }
    const generation = ++cameraGenerationRef.current;
    try {
      const next = await acceptMediaStreamIfCurrent(
        navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : true, audio: false }),
        () => generation === cameraGenerationRef.current && stateRef.current === "connected",
      );
      if (!next) return;
      const previous = cameraRef.current;
      cameraRef.current = next;
      if (cameraVideo.current) cameraVideo.current.srcObject = next;
      previous?.getTracks().forEach((track) => track.stop());
      setSelectedCamera(deviceId);
    } catch (error) { if (generation === cameraGenerationRef.current && stateRef.current === "connected") setMessage(copyError(error)); }
  }

  async function toggleScreen(): Promise<void> {
    if (screenRef.current) {
      screenGenerationRef.current += 1;
      screenRef.current.getTracks().forEach((track) => track.stop());
      screenRef.current = null;
      setSharing(false);
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) { setMessage("此浏览器不支持屏幕共享。"); return; }
    const generation = ++screenGenerationRef.current;
    try {
      const stream = await acceptMediaStreamIfCurrent(
        navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 2, max: 4 } }, audio: false }),
        () => generation === screenGenerationRef.current && stateRef.current === "connected",
      );
      if (!stream) return;
      screenRef.current = stream;
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (screenRef.current !== stream) return;
        screenRef.current = null;
        screenGenerationRef.current += 1;
        setSharing(false);
      });
      setSharing(true);
    } catch (error) { if (generation === screenGenerationRef.current && stateRef.current === "connected") setMessage(copyError(error)); }
  }

  useEffect(() => {
    if (state !== "connected" || (!cameraOn && !sharing)) return;
    const capture = (video: HTMLVideoElement | null, source: "camera" | "screen") => {
      if (!video || video.readyState < 2) return;
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, frameEdgeRef.current / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(async (blob) => {
        if (!blob || socketRef.current?.readyState !== WebSocket.OPEN) return;
        send(videoFrameEnvelope(source, bytesToBase64(new Uint8Array(await blob.arrayBuffer()))));
      }, "image/jpeg", frameQualityRef.current);
    };
    frameTimer.current = window.setInterval(() => {
      if (cameraOn && sharing) {
        const source = frameSourceTurn.current;
        frameSourceTurn.current = source === "camera" ? "screen" : "camera";
        capture(source === "camera" ? cameraVideo.current : screenVideo.current, source);
      } else if (cameraOn) capture(cameraVideo.current, "camera");
      else if (sharing) capture(screenVideo.current, "screen");
    }, 1000);
    return () => { if (frameTimer.current !== null) window.clearInterval(frameTimer.current); frameTimer.current = null; };
  }, [cameraOn, sharing, state]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      attemptRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      stateRef.current = "ending";
      socketRef.current?.close(1000, "host unmounted");
      cleanupMedia();
      releaseCall("leo-realtime", callClaimRef.current);
      callClaimRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onPageHide = () => {
      attemptRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      stateRef.current = "ending";
      send({ type: "control.close" });
      socketRef.current?.close(1000, "page hidden");
      socketRef.current = null;
      cleanupMedia();
      stateRef.current = "ended";
      setState("ended");
      releaseCall("leo-realtime", callClaimRef.current);
      callClaimRef.current = null;
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  if (!request) return null;
  const active = state === "connected" || state === "starting" || state === "ending";
  return (
    <>
      <video ref={cameraVideo} muted autoPlay playsInline className="hidden" />
      <video ref={screenVideo} muted autoPlay playsInline className="hidden" />
      {minimized && active ? (
        <button type="button" className="fixed bottom-4 right-4 z-[95] min-h-12 rounded-full bg-slate-900 px-5 text-sm font-semibold text-white shadow-xl" onClick={() => setMinimized(false)}>Leo 通话中 · 返回</button>
      ) : (
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" data-realtime-call>
          <section role="dialog" aria-modal="true" aria-labelledby="realtime-title" className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <header className="flex items-center justify-between border-b px-4 py-3">
              <div><h2 id="realtime-title" className="font-semibold">Leo 实时通话</h2><p className="text-xs text-neutral-500">使用当前 Leo 对话的上下文</p></div>
              {active ? <button type="button" onClick={() => setMinimized(true)} className="min-h-11 px-3 text-sm">最小化</button> : <button type="button" onClick={() => setRequest(null)} className="min-h-11 px-3 text-sm">关闭</button>}
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {message ? <p role="status" className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{message}</p> : null}
              {state === "idle" || state === "ended" ? <>
                <label className="flex items-center gap-2 text-sm">麦克风
                  <select value={selectedMic} onChange={(event) => void switchMicrophone(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-lg border px-3">
                    <option value="">系统默认</option>{devices.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || "麦克风 " + (index + 1)}</option>)}
                  </select>
                </label>
                <label className="mt-2 flex items-center gap-2 text-sm">摄像头
                  <select value={selectedCamera} onChange={(event) => void switchCamera(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-lg border px-3">
                    <option value="">系统默认</option>{cameras.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || "摄像头 " + (index + 1)}</option>)}
                  </select>
                </label>
                <p className="mt-3 text-xs leading-5 text-neutral-600">开始后会向服务端发送麦克风音频并播放 Leo 回答。摄像头与屏幕共享默认关闭；服务端按实际观测用量结算，页面计时不计费。</p>
                {bill ? <p className="mt-3 rounded-lg bg-neutral-50 p-3 text-sm">上次服务端计费状态：{bill.gross != null ? formatMoney(bill.gross, bill.currency, 6) : "—"}（优惠 {bill.discount != null ? formatMoney(bill.discount, bill.currency, 6) : "—"}，实扣 {bill.net != null ? formatMoney(bill.net, bill.currency, 6) : "—"}）</p> : null}
                <button type="button" onClick={() => void startCall()} className="mt-4 min-h-12 w-full rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">检查麦克风并开始</button>
              </> : null}
              {state === "starting" ? <p role="status" className="py-12 text-center text-sm">正在检查设备并连接……</p> : null}
              {state === "starting" ? <button type="button" onClick={cancelStart} className="min-h-11 w-full rounded-lg border text-sm">取消连接</button> : null}
              {state === "connected" ? <>
                <div className="grid grid-cols-2 gap-2"><div className="rounded-lg bg-neutral-100 p-2 text-xs">{cameraOn ? "摄像头已共享" : "摄像头关闭"}</div><div className="rounded-lg bg-neutral-100 p-2 text-xs">{sharing ? "屏幕画面已共享" : "屏幕未共享"}</div></div>
                <div aria-live="polite" className="mt-3 max-h-48 min-h-24 overflow-y-auto rounded-lg bg-neutral-50 p-3 text-sm">{transcript.length ? transcript.map((line, index) => <p key={index} className="mb-1">{line}</p>) : <p className="text-neutral-500">正在聆听……</p>}</div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <select aria-label="切换麦克风" value={selectedMic} onChange={(event) => void switchMicrophone(event.target.value)} className="min-h-11 rounded-lg border px-2 text-sm"><option value="">系统默认麦克风</option>{devices.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || "麦克风 " + (index + 1)}</option>)}</select>
                  <select aria-label="切换摄像头" value={selectedCamera} onChange={(event) => void switchCamera(event.target.value)} className="min-h-11 rounded-lg border px-2 text-sm"><option value="">系统默认摄像头</option>{cameras.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || "摄像头 " + (index + 1)}</option>)}</select>
                  <button type="button" onClick={() => { const next = !muted; setMuted(next); micRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; }); }} className="min-h-11 rounded-lg border px-2 text-sm">{muted ? "打开麦克风" : "静音"}</button>
                  <button type="button" onClick={() => void toggleCamera()} className="min-h-11 rounded-lg border px-2 text-sm">{cameraOn ? "关闭摄像头" : "共享摄像头"}</button>
                  <button type="button" onClick={() => void toggleScreen()} className="min-h-11 rounded-lg border px-2 text-sm">{sharing ? "停止屏幕" : "共享屏幕"}</button>
                  <button type="button" onClick={() => { flushAudio(); send({ type: "control.interrupt" }); }} className="min-h-11 rounded-lg border px-2 text-sm">打断 Leo</button>
                </div>
                <button type="button" onClick={() => void endCall()} className="mt-3 min-h-12 w-full rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white">结束通话并查看账单</button>
              </> : null}
              {state === "ending" ? <p role="status" className="py-8 text-center text-sm">正在停止媒体并读取服务端账单……</p> : null}
              {state === "ended" ? <div className="mt-4 rounded-xl border p-4" role="status">
                <h3 className="font-semibold">服务端用量回执</h3>
                {bill ? <><p className="mt-2 text-xs font-medium">{callStatusLabel(bill.status, bill.pending_reconciliation)}</p><dl className="mt-2 grid grid-cols-2 gap-y-2 text-sm"><dt>服务端计量时长</dt><dd className="text-right">{formatConnectedTime(bill.connected_seconds)}</dd><dt>原价</dt><dd className="text-right">{bill.gross != null ? formatMoney(bill.gross, bill.currency, 9) : "—"}</dd><dt>优惠</dt><dd className="text-right">{bill.discount != null ? formatMoney(bill.discount, bill.currency, 9) : "—"}</dd><dt>已结算费用</dt><dd className="text-right font-semibold">{formatMoney((bill.settled_nano ?? (bill.net != null ? Math.round(bill.net * 1e9) : 0)) / 1e9, bill.currency, 9)}</dd><dt>当前预留（待结算/可能释放）</dt><dd className="text-right">{formatMoney((bill.currently_held_nano ?? bill.pending_release_nano ?? 0) / 1e9, bill.currency, 9)}</dd>{bill.unresolved_held_nano ? <><dt>待核对预留</dt><dd className="text-right">{formatMoney(bill.unresolved_held_nano / 1e9, bill.currency, 9)}</dd></> : null}{tokenUsageRows(bill.raw_usage).map((row) => <Fragment key={row.label}><dt>{row.label}</dt><dd className="text-right">{row.value.toLocaleString()}</dd></Fragment>)}</dl><p className="mt-2 text-xs text-neutral-600">实时语音账单按服务端确认的模型用量结算；显示的音频/文本 token 数用于用量核对。预留额不是最终费用，若服务端核对未完成会明确保持待核对状态。</p><details className="mt-3 text-xs"><summary className="min-h-8 cursor-pointer">高级核对：原始用量与资费快照</summary><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify({ raw_usage: bill.raw_usage ?? "—", tariff_snapshot: bill.tariff_snapshot ?? "—" }, null, 2)}</pre></details></> : <p className="mt-2 text-sm text-amber-800">账单暂不可读取，请稍后查看；不会用页面时长估算费用。</p>}
                <button type="button" className="mt-4 min-h-11 rounded-lg border px-4 text-sm" onClick={() => { setState("idle"); setSession(null); setBill(null); setMessage(""); }}>重新连接</button>
              </div> : null}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
