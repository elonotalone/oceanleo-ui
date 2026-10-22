"use client";

// 「通话检测」面板（A14）：麦克风音量条（独立 getUserMedia，选中的设备）、扬声器试音（Web Audio 合成，可选输出设备）、
// 摄像头本地预览、连接测试（test-token → 独立诊断引擎入 diag- 频道 → 发布音频 5 秒 → 好/一般/差 + 原始数字）、
// 「复制诊断信息」（不含任何 token）。不在通话中也能打开。
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useUI } from "../../../../i18n/ui/useUI";
import { currentDomainFamily } from "../../../../contracts/domain-family";
import { getClientHostConfig } from "../../../../contracts/client-host-config";
import { callsApi } from "../../../../lib/im/calls-api";
import { callActions, createDiagnosticsEngine, useCall, type CallSnapshot, type MediaDeviceLite } from "../engine";
import {
  connectionTestErrorText,
  gradeLabel,
  runConnectionTest,
  type ConnectionTestProgress,
  type ConnectionTestResult,
} from "./connection-test";
import { formatStat } from "./health";
import { IconCamera, IconCheck, IconClose, IconCopy, IconMic, IconNetwork, IconSpeaker, Spinner } from "./icons";
import { describeIssue, type IssueEnvironment } from "./issues";
import { DiagDialog } from "./layer";
import {
  listMediaDevices,
  mediaErrorCode,
  mediaErrorText,
  playTestSound,
  queryPermission,
  startCameraPreview,
  startMicMeter,
  supportsSinkSelection,
  type DeviceLists,
  type MediaErrorCode,
  type SoundPlayback,
} from "./media-probes";
import {
  buildDiagnosticsReport,
  type ClientLite,
  type DeviceEntry,
  type PermissionStateLite,
} from "./report";
import { useIssueEnvironment } from "./use-issue-environment";
import { useNetworkHealth } from "./use-network-health";

export interface CallTestPanelProps {
  open: boolean;
  onClose(): void;
}

const EMPTY_DEVICES: DeviceLists = { microphones: [], cameras: [], speakers: [] };
const PSEUDO_DEVICE_IDS = new Set(["default", "communications"]);

/** 引擎/浏览器给的设备 id → 下拉框的值（"" = 系统默认）。 */
export function selectValue(deviceId: string | null | undefined): string {
  if (!deviceId || PSEUDO_DEVICE_IDS.has(deviceId)) return "";
  return deviceId;
}

/** 下拉框里列哪些设备：去掉 Chrome 的 default/communications 伪设备（由「系统默认」代表）。 */
export function realDevices(list: MediaDeviceLite[]): MediaDeviceLite[] {
  return list.filter((device) => !PSEUDO_DEVICE_IDS.has(device.deviceId));
}

function abortableSleep(signal: AbortSignal) {
  return (ms: number) =>
    new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        signal.removeEventListener("abort", done);
        resolve();
      }
      signal.addEventListener("abort", done);
    });
}

function editionHere(): "cn" | "global" {
  try {
    return currentDomainFamily() === "cn" ? "cn" : "global";
  } catch {
    return "global";
  }
}

function clientHere(): ClientLite {
  try {
    return getClientHostConfig()?.platform ?? "web";
  } catch {
    return "web";
  }
}

function entries(list: MediaDeviceLite[], selectedId: string | null): DeviceEntry[] {
  const selected = selectValue(selectedId);
  return list.map((device) => ({
    label: device.label,
    selected: selected ? device.deviceId === selected : device.deviceId === "default",
  }));
}

const LIST_OF: Record<"mic" | "camera" | "speaker", keyof DeviceLists> = {
  mic: "microphones",
  camera: "cameras",
  speaker: "speakers",
};

/**
 * 面板里选的设备写回引擎时用的 id：具体设备原样；「系统默认」只有在浏览器真有 `default` 这个设备（Chrome）时
 * 才写回 `default`，否则没有可写的 id（Safari/Firefox 没有这个伪设备），返回 null 表示不写。
 */
export function engineDeviceId(value: string, list: MediaDeviceLite[]): string | null {
  if (value) return value;
  return list.some((device) => device.deviceId === "default") ? "default" : null;
}

type TestState =
  | { status: "idle" }
  | { status: "running"; progress: ConnectionTestProgress | null }
  | { status: "done"; result: ConnectionTestResult };

export function CallTestPanel({ open, onClose }: CallTestPanelProps) {
  if (!open) return null;
  return <CallTestDialog onClose={onClose} />;
}

function CallTestDialog({ onClose }: { onClose(): void }) {
  const tt = useUI();
  const call = useCall();
  const health = useNetworkHealth();
  const env = useIssueEnvironment(call.me.audioOnly, call.limits);
  const titleId = useId();

  const [devices, setDevices] = useState<DeviceLists>(EMPTY_DEVICES);
  const [micId, setMicId] = useState<string | null>(call.me.micDeviceId);
  const [speakerId, setSpeakerId] = useState<string | null>(call.me.speakerDeviceId);
  const [cameraId, setCameraId] = useState<string | null>(call.me.cameraDeviceId);
  const [permissions, setPermissions] = useState<{ microphone: PermissionStateLite; camera: PermissionStateLite }>({
    microphone: "unknown",
    camera: "unknown",
  });

  const refreshDevices = useCallback(async () => {
    setDevices(await listMediaDevices());
  }, []);
  const refreshPermissions = useCallback(async () => {
    const [microphone, camera] = await Promise.all([queryPermission("microphone"), queryPermission("camera")]);
    setPermissions({ microphone, camera });
  }, []);

  useEffect(() => {
    void refreshDevices();
    void refreshPermissions();
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.addEventListener) return;
    const onChange = () => void refreshDevices();
    md.addEventListener("devicechange", onChange);
    return () => md.removeEventListener("devicechange", onChange);
  }, [refreshDevices, refreshPermissions]);

  const devicesRef = useRef(devices);
  devicesRef.current = devices;
  const pickDevice = useCallback((kind: "mic" | "camera" | "speaker", value: string) => {
    const id = value || null;
    if (kind === "mic") setMicId(id);
    if (kind === "camera") setCameraId(id);
    if (kind === "speaker") setSpeakerId(id);
    // 与通话共用同一个选择（通话中立即切换，不在通话中记住）。
    const engineId = engineDeviceId(value, devicesRef.current[LIST_OF[kind]]);
    if (engineId) void callActions.selectDevice(kind, engineId).catch(() => undefined);
  }, []);

  // ---------- 麦克风音量条 ----------
  const [micLevel, setMicLevel] = useState(0);
  const [micError, setMicError] = useState<MediaErrorCode | null>(null);
  const [micRetry, setMicRetry] = useState(0);
  const micPeakRef = useRef<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | null = null;
    setMicError(null);
    startMicMeter(micId, (level) => {
      if (cancelled) return;
      setMicLevel(level);
      micPeakRef.current = Math.max(micPeakRef.current ?? 0, level);
    })
      .then((meter) => {
        if (cancelled) {
          meter.stop();
          return;
        }
        stop = () => meter.stop();
        void refreshDevices();
        void refreshPermissions();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setMicError(mediaErrorCode(error));
        setMicLevel(0);
        void refreshPermissions();
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [micId, micRetry, refreshDevices, refreshPermissions]);

  // ---------- 扬声器试音 ----------
  const sinkSelectable = useMemo(() => supportsSinkSelection(), []);
  const [playing, setPlaying] = useState(false);
  const [speakerFailed, setSpeakerFailed] = useState(false);
  const playbackRef = useRef<SoundPlayback | null>(null);
  useEffect(() => () => playbackRef.current?.stop(), []);
  const playSound = useCallback(async () => {
    playbackRef.current?.stop();
    setSpeakerFailed(false);
    setPlaying(true);
    try {
      const playback = await playTestSound(sinkSelectable ? speakerId : null);
      playbackRef.current = playback;
      await playback.done;
    } catch {
      setSpeakerFailed(true);
    } finally {
      setPlaying(false);
    }
  }, [sinkSelectable, speakerId]);

  // ---------- 摄像头预览 ----------
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraLive, setCameraLive] = useState(false);
  const [cameraError, setCameraError] = useState<MediaErrorCode | null>(null);
  useEffect(() => {
    if (!cameraOn || !videoRef.current) return;
    let cancelled = false;
    let stop: (() => void) | null = null;
    setCameraError(null);
    setCameraLive(false);
    startCameraPreview(cameraId, videoRef.current)
      .then((preview) => {
        if (cancelled) {
          preview.stop();
          return;
        }
        stop = () => preview.stop();
        setCameraLive(true);
        void refreshDevices();
        void refreshPermissions();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setCameraError(mediaErrorCode(error));
        setCameraOn(false);
        void refreshPermissions();
      });
    return () => {
      cancelled = true;
      stop?.();
      setCameraLive(false);
    };
  }, [cameraOn, cameraId, refreshDevices, refreshPermissions]);

  // ---------- 连接测试 ----------
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const startTest = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setTest({ status: "running", progress: null });
    const result = await runConnectionTest({
      testToken: () => callsApi.testToken(),
      createEngine: () => createDiagnosticsEngine(),
      sleep: abortableSleep(controller.signal),
      now: () => Date.now(),
      micDeviceId: micId,
      signal: controller.signal,
      onProgress: (progress) => {
        if (!controller.signal.aborted) setTest({ status: "running", progress });
      },
    });
    if (controller.signal.aborted) return;
    setTest({ status: "done", result });
  }, [micId]);

  // ---------- 复制诊断信息 ----------
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [reportText, setReportText] = useState<string | null>(null);
  const copyReport = useCallback(async () => {
    const text = buildDiagnosticsReport({
      time: new Date(),
      edition: editionHere(),
      client: clientHere(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      devices: {
        microphones: entries(devices.microphones, micId),
        cameras: entries(devices.cameras, cameraId),
        speakers: entries(devices.speakers, speakerId),
      },
      permissions,
      speakerSelectable: sinkSelectable,
      micPeak: micPeakRef.current,
      call: callSummary(call, health.stats),
      test: test.status === "done" ? { grade: test.result.grade, numbers: test.result.numbers, error: test.result.error } : null,
    });
    setReportText(text);
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }, [call, cameraId, devices, health.stats, micId, permissions, sinkSelectable, speakerId, test]);

  return (
    <DiagDialog onClose={onClose} labelledBy={titleId}>
      <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 pb-3 pt-4 dark:border-white/10">
        <div className="min-w-0">
          <h2 id={titleId} className="text-[15px] font-semibold">
            {tt("通话检测")}
          </h2>
          <p className="mt-0.5 text-[12px] text-neutral-500 dark:text-neutral-400">{tt("检查麦克风、扬声器、摄像头和网络连接。")}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={tt("关闭")}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-neutral-400 dark:hover:bg-white/10"
        >
          <IconClose size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4" data-call-test-sections="">
        <Section icon={<IconMic size={16} />} title={tt("麦克风")} name="mic">
          <DeviceSelect
            label={tt("选择麦克风")}
            value={selectValue(micId)}
            devices={realDevices(devices.microphones)}
            fallbackName={(n) => tt("麦克风 {n}", { n })}
            onChange={(value) => pickDevice("mic", value)}
          />
          <div
            role="meter"
            aria-label={tt("麦克风音量")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(micLevel * 100)}
            data-mic-meter=""
            className="mt-2.5 flex h-2.5 w-full gap-[3px]"
          >
            {Array.from({ length: 20 }, (_, index) => (
              <span
                key={index}
                aria-hidden="true"
                className={`flex-1 rounded-[2px] transition-colors duration-75 ${
                  micLevel * 20 > index
                    ? index >= 17
                      ? "bg-red-500"
                      : index >= 13
                        ? "bg-amber-400"
                        : "bg-emerald-500"
                    : "bg-neutral-200 dark:bg-white/10"
                }`}
              />
            ))}
          </div>
          {micError ? (
            <MediaProblem
              text={tt(mediaErrorText("mic", micError))}
              help={micError === "permission" ? describeIssue({ kind: "mic_permission" }, env).help.map((line) => tt(line)) : []}
              retryLabel={tt("重试")}
              onRetry={() => setMicRetry((n) => n + 1)}
            />
          ) : (
            <p className="mt-1.5 text-[12px] text-neutral-500 dark:text-neutral-400">{tt("对着麦克风说话，音量条会跳动。")}</p>
          )}
        </Section>

        <Section icon={<IconSpeaker size={16} />} title={tt("扬声器")} name="speaker">
          <div className="flex items-center gap-2">
            {sinkSelectable && devices.speakers.length ? (
              <div className="min-w-0 flex-1">
                <DeviceSelect
                  label={tt("选择扬声器")}
                  value={selectValue(speakerId)}
                  devices={realDevices(devices.speakers)}
                  fallbackName={(n) => tt("扬声器 {n}", { n })}
                  onChange={(value) => pickDevice("speaker", value)}
                />
              </div>
            ) : (
              <p className="min-w-0 flex-1 text-[12px] text-neutral-500 dark:text-neutral-400">
                {tt("这个浏览器不能选择扬声器，会用系统默认的输出设备。")}
              </p>
            )}
            <button
              type="button"
              onClick={() => void playSound()}
              disabled={playing}
              data-speaker-test=""
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-neutral-200 px-3 text-[13px] font-medium hover:bg-neutral-50 disabled:opacity-60 dark:border-white/15 dark:hover:bg-white/10"
            >
              {playing ? <Spinner size={13} /> : null}
              {playing ? tt("正在播放…") : tt("播放试音")}
            </button>
          </div>
          <p className="mt-1.5 text-[12px] text-neutral-500 dark:text-neutral-400" aria-live="polite">
            {speakerFailed ? tt("没能播放试音，请检查扬声器或换一个输出设备。") : tt("听到提示音说明扬声器正常。")}
          </p>
        </Section>

        <Section icon={<IconCamera size={16} />} title={tt("摄像头")} name="camera">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <DeviceSelect
                label={tt("选择摄像头")}
                value={selectValue(cameraId)}
                devices={realDevices(devices.cameras)}
                fallbackName={(n) => tt("摄像头 {n}", { n })}
                onChange={(value) => pickDevice("camera", value)}
              />
            </div>
            <button
              type="button"
              onClick={() => setCameraOn((on) => !on)}
              aria-pressed={cameraOn}
              data-camera-preview-toggle=""
              className="flex h-8 shrink-0 items-center rounded-lg border border-neutral-200 px-3 text-[13px] font-medium hover:bg-neutral-50 dark:border-white/15 dark:hover:bg-white/10"
            >
              {cameraOn ? tt("关闭预览") : tt("打开预览")}
            </button>
          </div>
          <div className={`relative mt-2.5 aspect-video w-full overflow-hidden rounded-xl bg-neutral-900 ${cameraOn ? "" : "hidden"}`}>
            <video
              ref={videoRef}
              aria-label={tt("摄像头预览")}
              muted
              playsInline
              autoPlay
              className="h-full w-full -scale-x-100 object-cover"
            />
            {cameraOn && !cameraLive ? (
              <span className="absolute inset-0 flex items-center justify-center text-white/80">
                <Spinner size={18} />
              </span>
            ) : null}
          </div>
          {cameraError ? (
            <MediaProblem
              text={tt(mediaErrorText("camera", cameraError))}
              help={cameraError === "permission" ? describeIssue({ kind: "camera_permission" }, env).help.map((line) => tt(line)) : []}
              retryLabel={tt("重试")}
              onRetry={() => setCameraOn(true)}
            />
          ) : null}
        </Section>

        <Section icon={<IconNetwork size={16} />} title={tt("连接测试")} name="connection">
          <ConnectionTestBlock test={test} onStart={() => void startTest()} env={env} />
        </Section>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 px-5 py-3 dark:border-white/10">
        <button
          type="button"
          onClick={() => void copyReport()}
          data-copy-diagnostics=""
          className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-white/10"
        >
          {copyState === "copied" ? <IconCheck size={14} /> : <IconCopy size={14} />}
          {copyState === "copied" ? tt("已复制") : tt("复制诊断信息")}
        </button>
        <button
          type="button"
          onClick={onClose}
          data-call-test-close=""
          className="h-8 rounded-lg bg-neutral-900 px-4 text-[13px] font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {tt("关闭")}
        </button>
        {copyState === "failed" && reportText ? (
          <div className="w-full">
            <p className="text-[12px] text-amber-700 dark:text-amber-400">{tt("复制失败，请手动选中下面的文字复制。")}</p>
            <textarea
              readOnly
              value={reportText}
              aria-label={tt("诊断信息")}
              onFocus={(event) => event.currentTarget.select()}
              className="mt-1 h-28 w-full resize-none rounded-lg border border-neutral-200 bg-neutral-50 p-2 font-mono text-[11px] dark:border-white/10 dark:bg-white/5"
            />
          </div>
        ) : null}
      </div>
    </DiagDialog>
  );
}

function callSummary(call: CallSnapshot, stats: import("../engine").CallStats | null) {
  if (call.phase === "idle") return null;
  return {
    phase: call.phase,
    network: call.me.network,
    audioOnly: call.me.audioOnly,
    stats,
    issues: call.issues.map((issue) => issue.kind),
  };
}

function Section({ icon, title, name, children }: { icon: ReactNode; title: string; name: string; children: ReactNode }) {
  return (
    <section data-call-test-section={name} aria-label={title}>
      <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-neutral-800 dark:text-neutral-100">
        <span className="text-neutral-500 dark:text-neutral-400">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function DeviceSelect({
  label,
  value,
  devices,
  fallbackName,
  onChange,
}: {
  label: string;
  value: string;
  devices: MediaDeviceLite[];
  fallbackName(n: number): string;
  onChange(value: string): void;
}) {
  const tt = useUI();
  const known = !value || devices.some((device) => device.deviceId === value);
  return (
    <select
      aria-label={label}
      value={known ? value : ""}
      onChange={(event) => onChange(event.target.value)}
      className="h-8 w-full truncate rounded-lg border border-neutral-200 bg-white px-2 text-[13px] text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-100"
    >
      <option value="">{tt("系统默认")}</option>
      {devices.map((device, index) => (
        <option key={device.deviceId} value={device.deviceId}>
          {device.label || fallbackName(index + 1)}
        </option>
      ))}
    </select>
  );
}

function MediaProblem({ text, help, retryLabel, onRetry }: { text: string; help: string[]; retryLabel: string; onRetry(): void }) {
  return (
    <div role="alert" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
      <p className="font-medium">{text}</p>
      {help.length ? (
        <ol className="mt-1 list-decimal space-y-0.5 pl-4">
          {help.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      ) : null}
      <button
        type="button"
        onClick={onRetry}
        className="mt-1.5 rounded-md border border-amber-300 px-2 py-0.5 text-[12px] font-medium hover:bg-amber-100 dark:border-amber-400/40 dark:hover:bg-amber-500/20"
      >
        {retryLabel}
      </button>
    </div>
  );
}

const GRADE_TONE: Record<string, string> = {
  good: "text-emerald-600 dark:text-emerald-400",
  fair: "text-amber-600 dark:text-amber-400",
  poor: "text-red-600 dark:text-red-400",
};

function progressText(progress: ConnectionTestProgress | null): string {
  if (!progress || progress.stage === "token" || progress.stage === "engine") return "正在准备…";
  if (progress.stage === "joining") return "正在连接通话服务器…";
  return "正在测试，约 {n} 秒…";
}

export function ConnectionTestBlock({ test, onStart, env }: { test: TestState; onStart(): void; env: IssueEnvironment }) {
  const tt = useUI();
  const running = test.status === "running";
  const result = test.status === "done" ? test.result : null;
  const progress = test.status === "running" ? test.progress : null;
  const remaining = progress?.stage === "measuring" ? Math.max(1, Math.ceil((progress.remainingMs ?? 0) / 1000)) : 0;
  return (
    <div data-connection-test={test.status}>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-[12px] text-neutral-500 dark:text-neutral-400" aria-live="polite">
          {running
            ? tt(progressText(progress), { n: remaining })
            : result
              ? null
              : tt("连上一个测试频道，发送约 5 秒声音，看网络好不好。")}
        </p>
        <button
          type="button"
          onClick={onStart}
          disabled={running}
          data-connection-test-start=""
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-neutral-200 px-3 text-[13px] font-medium hover:bg-neutral-50 disabled:opacity-60 dark:border-white/15 dark:hover:bg-white/10"
        >
          {running ? <Spinner size={13} /> : null}
          {running ? tt("正在测试…") : result ? tt("再测一次") : tt("开始测试")}
        </button>
      </div>
      {result ? (
        <div className="mt-2" aria-live="polite" data-connection-result={result.grade}>
          {result.grade === "failed" ? (
            result.error && result.error !== "aborted" ? (
              <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">
                {tt(connectionTestErrorText(result.error) ?? "连接测试失败，请稍后再试。")}
              </p>
            ) : null
          ) : (
            <>
              <p className={`text-[14px] font-semibold ${GRADE_TONE[result.grade] ?? ""}`}>{tt(gradeLabel(result.grade))}</p>
              {result.numbers ? (
                <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[12px] text-neutral-600 dark:text-neutral-300">
                  <Stat label={tt("往返时延")} value={formatStat(result.numbers.rttMs, "ms")} />
                  <Stat label={tt("入会耗时")} value={formatStat(result.numbers.joinMs, "ms")} />
                  <Stat label={tt("上行码率")} value={formatStat(result.numbers.upKbps, "kbps")} />
                  <Stat label={tt("上行丢包")} value={formatStat(result.numbers.upLossPct, "%")} />
                </dl>
              ) : null}
              {result.grade === "poor" ? (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[12px] text-neutral-600 dark:text-neutral-300">
                  {describeIssue({ kind: "network_poor" }, { ...env, audioOnly: true }).help.map((line) => (
                    <li key={line}>{tt(line)}</li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}
