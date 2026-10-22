"use client";

// 转写开关、录制开关（合同 §3.9；验收 A12/A13：任何在场的人都可以开、可以关）。
// 「显示字幕」开关在 W07 的麦克风菜单里（读 useCaptions().hidden、调 setHidden），这里不重复做。
// 开关调 transcriptionApi / recordingApi（经状态仓）；状态以服务端 CallView 为准。
// 录制存储没开通（503 recording_storage_unavailable）：按钮上方弹出原话「录制存储尚未开通」，不显示「录制中」，
// 本通话内按钮的提示与可读说明也一直带着这句（再点会重试，万一中途开通了）。
import { useId, type ReactNode } from "react";
import { useUI } from "../../../../i18n/ui/useUI";
import { useRecordingState, useTranscriptionState } from "./hooks";
import { CaptionsIcon, RecordIcon, SpinnerIcon, StopIcon } from "./icons";
import type { CallServiceToggleProps } from "./types";

type Tone = "info" | "danger";

const PRESSED_TONE: Record<Tone, string> = {
  info: "text-sky-700 dark:text-sky-300",
  danger: "text-red-600 dark:text-red-400",
};

/** 提示气泡：底色 ui.css 没有这一档，行内样式；层级 ≥1160（W07：小窗 1050、放大视图 1100、通话菜单 1150、举报框 1200）。 */
const BUBBLE_STYLE = {
  zIndex: 1160,
  backgroundColor: "rgba(0, 0, 0, 0.84)",
  width: "max-content",
  maxWidth: 240,
  whiteSpace: "normal",
} as const;

interface ToggleViewProps {
  kind: "transcription" | "recording";
  mode: "dock" | "stage";
  variant: "button" | "menuitem";
  className?: string;
  label: string;
  hint: string;
  pressed: boolean;
  busy: boolean;
  disabled: boolean;
  tone: Tone;
  icon: ReactNode;
  /** 一直带着的说明（如「录制存储尚未开通」）。 */
  note: string | null;
  /** 刚发生的错误（状态仓 8 秒后自动清掉）。 */
  error: string | null;
  onToggle(): void;
}

function ToggleView(props: ToggleViewProps) {
  const messageId = useId();
  const { kind, mode, variant, className, label, hint, pressed, busy, disabled, tone, icon, note, error, onToggle } = props;
  const message = error ?? note;
  const describedBy = message ? messageId : undefined;
  const iconNode = busy ? <SpinnerIcon className="h-4 w-4 shrink-0 animate-spin" /> : icon;
  const toneClass = pressed ? PRESSED_TONE[tone] : "";

  if (variant === "menuitem") {
    return (
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={pressed}
        aria-busy={busy || undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        title={hint}
        onClick={onToggle}
        data-call-service-toggle={kind}
        className={["flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed", toneClass, className]
          .filter(Boolean)
          .join(" ")}
      >
        {iconNode}
        <span className="min-w-0 flex-1">
          <span className="block">{label}</span>
          {message ? (
            <span id={messageId} role={error ? "alert" : undefined} className="block text-[11px] text-red-600 dark:text-red-400">
              {message}
            </span>
          ) : null}
        </span>
      </button>
    );
  }

  const compact = mode === "dock";
  return (
    <span className={["relative inline-flex", className].filter(Boolean).join(" ")} data-call-service-toggle={kind}>
      <button
        type="button"
        aria-pressed={pressed}
        aria-busy={busy || undefined}
        aria-label={compact ? label : undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        title={message ? `${hint}\n${message}` : hint}
        onClick={onToggle}
        className={[
          compact
            ? "inline-flex h-9 w-9 items-center justify-center rounded-full"
            : "inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium",
          "hover:bg-black/5 dark:hover:bg-white/10 focus-visible:outline focus-visible:outline-2 disabled:opacity-50 disabled:cursor-not-allowed",
          toneClass,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {iconNode}
        {compact ? null : <span>{label}</span>}
      </button>
      {error ? (
        <span
          id={messageId}
          role="alert"
          className="absolute bottom-full left-0 mb-1 rounded-md px-2 py-1 text-[11px] leading-4 text-white shadow-lg"
          style={BUBBLE_STYLE}
        >
          {error}
        </span>
      ) : note ? (
        <span id={messageId} className="sr-only">
          {note}
        </span>
      ) : null}
    </span>
  );
}

export function CallTranscriptionToggle({ mode = "stage", variant = "button", className }: CallServiceToggleProps) {
  const tt = useUI();
  const transcription = useTranscriptionState();
  if (!transcription.available) return null;
  return (
    <ToggleView
      kind="transcription"
      mode={mode}
      variant={variant}
      className={className}
      label={transcription.enabled ? tt("关闭转写") : tt("开启转写")}
      hint={tt("开启后所有人都会看到字幕，通话结束后 Leo 会在会话里留下纪要")}
      pressed={transcription.enabled}
      busy={transcription.busy}
      disabled={transcription.busy}
      tone="info"
      icon={<CaptionsIcon className="h-4 w-4 shrink-0" />}
      note={null}
      error={transcription.error ? tt(transcription.error.message) : null}
      onToggle={() => void transcription.toggle()}
    />
  );
}

export function CallRecordingToggle({ mode = "stage", variant = "button", className }: CallServiceToggleProps) {
  const tt = useUI();
  const recording = useRecordingState();
  if (!recording.available) return null;
  const label = recording.stopping ? tt("正在停止录制") : recording.active ? tt("停止录制") : tt("开始录制");
  return (
    <ToggleView
      kind="recording"
      mode={mode}
      variant={variant}
      className={className}
      label={label}
      hint={tt("开始后所有人都会看到「录制中」，结束后录像会出现在会话里")}
      pressed={recording.active}
      busy={recording.busy}
      disabled={recording.busy || recording.stopping}
      tone="danger"
      icon={recording.active ? <StopIcon className="h-4 w-4 shrink-0" /> : <RecordIcon className="h-4 w-4 shrink-0" />}
      note={recording.storageUnavailable ? tt("录制存储尚未开通") : null}
      error={recording.error ? tt(recording.error.message) : null}
      onToggle={() => void recording.toggle()}
    />
  );
}
