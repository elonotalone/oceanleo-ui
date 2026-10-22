"use client";

// 「录制中」「转写中」状态徽标（合同 §3.9；验收 A12/A13：所有人可见）。
// 状态以服务端 CallView.recording / transcription 为准（谁开的都一样显示）。
import { useUI } from "../../../../i18n/ui/useUI";
import { useRecordingState, useTranscriptionState } from "./hooks";
import { CaptionsIcon } from "./icons";
import type { CallServiceBadgesProps } from "./types";

/** 徽标底色：ui.css 里没有这两档半透明色，用行内样式（不改共享样式产物）。 */
export const BADGE_TINT = {
  recording: "rgba(239, 68, 68, 0.14)",
  transcription: "rgba(14, 165, 233, 0.14)",
} as const;

export function CallServiceBadges({ mode = "dock", className }: CallServiceBadgesProps) {
  const tt = useUI();
  const recording = useRecordingState();
  const transcription = useTranscriptionState();
  const showRecording = recording.available && recording.active;
  const showTranscription = transcription.available && transcription.enabled;
  if (!showRecording && !showTranscription) return null;
  const pill = mode === "stage" ? "px-2.5 py-1 text-[12px]" : "px-2 py-0.5 text-[11px]";
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={tt("通话服务状态")}
      data-call-service-badges={mode}
      className={["flex items-center gap-1.5", className].filter(Boolean).join(" ")}
    >
      {showRecording ? (
        <span
          data-call-badge="recording"
          className={`inline-flex items-center gap-1 rounded-full font-semibold text-red-600 dark:text-red-400 ${pill}`}
          style={{ backgroundColor: BADGE_TINT.recording }}
        >
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
          {tt("录制中")}
        </span>
      ) : null}
      {showTranscription ? (
        <span
          data-call-badge="transcription"
          className={`inline-flex items-center gap-1 rounded-full font-semibold text-sky-700 dark:text-sky-300 ${pill}`}
          style={{ backgroundColor: BADGE_TINT.transcription }}
        >
          <CaptionsIcon className="h-3 w-3 shrink-0" />
          {tt("转写中")}
        </span>
      ) : null}
    </div>
  );
}
