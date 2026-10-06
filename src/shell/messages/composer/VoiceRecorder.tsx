"use client";

// 语音：按住录音（松开发送）或点一下开始、再点一下结束；最长 5 分钟，到点自动结束。
// 录好的文件交给输入框走上传，再以 kind:"voice" 发出；转文字由服务端自动做。
import { useCallback, useEffect, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";

export const MAX_VOICE_MS = 5 * 60 * 1000;
const HOLD_RELEASE_MS = 600;

/** 浏览器支持的录音格式，按偏好挑第一个。 */
export function pickRecorderMime(
  isSupported: (mime: string) => boolean = (mime) =>
    typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime),
): string {
  for (const mime of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (isSupported(mime)) return mime;
  }
  return "";
}

export function formatClockMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function extensionFor(mime: string): string {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

export function VoiceRecorder({
  disabled,
  onRecorded,
  onError,
}: {
  disabled?: boolean;
  onRecorded: (file: File, durationMs: number) => void;
  onError?: (code: "unsupported" | "denied") => void;
}) {
  const tt = useUI();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRecording(false);
    setElapsed(0);
  }, []);

  const stop = useCallback((cancel: boolean) => {
    cancelledRef.current = cancel;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    else cleanup();
  }, [cleanup]);

  const start = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError?.("unsupported");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError?.("denied");
      return;
    }
    const mime = pickRecorderMime();
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    streamRef.current = stream;
    recorderRef.current = recorder;
    chunksRef.current = [];
    cancelledRef.current = false;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const duration = Date.now() - startedAtRef.current;
      const type = recorder.mimeType || mime || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      const cancelled = cancelledRef.current;
      cleanup();
      if (cancelled || blob.size === 0 || duration < 500) return;
      const file = new File([blob], `voice-${Date.now()}.${extensionFor(type)}`, { type });
      onRecorded(file, Math.min(duration, MAX_VOICE_MS));
    };
    startedAtRef.current = Date.now();
    recorder.start();
    setRecording(true);
    timerRef.current = setInterval(() => {
      const ms = Date.now() - startedAtRef.current;
      setElapsed(ms);
      if (ms >= MAX_VOICE_MS) stop(false);
    }, 250);
  }, [cleanup, onError, onRecorded, stop]);

  useEffect(
    () => () => {
      cancelledRef.current = true;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  if (recording) {
    return (
      <div className="flex items-center gap-2 rounded-full bg-red-50 px-2.5 py-1 text-[12.5px] text-red-700" data-recording="">
        <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
        <span className="tabular-nums">
          {formatClockMs(elapsed)} / {formatClockMs(MAX_VOICE_MS)}
        </span>
        <button type="button" onClick={() => stop(true)} className="text-neutral-500 hover:text-neutral-800">
          {tt("取消")}
        </button>
        <button
          type="button"
          onClick={() => stop(false)}
          className="rounded-full bg-red-600 px-2.5 py-0.5 text-white"
        >
          {tt("发送语音")}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={tt("录音")}
      title={tt("按住录音，松开发送；或点一下开始、再点一下结束")}
      onPointerDown={() => {
        // 按住录音：超过阈值再松开 = 发送；快速点一下 = 继续录，等点「发送语音」
        const pressedAt = Date.now();
        const onUp = () => {
          document.removeEventListener("pointerup", onUp);
          if (recorderRef.current && Date.now() - pressedAt >= HOLD_RELEASE_MS) stop(false);
        };
        document.addEventListener("pointerup", onUp);
        void start();
      }}
      className="flex h-11 w-11 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-40 md:h-8 md:w-8"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="9" y="3" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </svg>
    </button>
  );
}
