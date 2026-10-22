"use client";

// 字幕行（合同 §3.9；验收 A12）：小窗一行、放大视图两行，每行标说话人；每人可在本地隐藏（记住选择）。
// 只在服务端转写开着时出现。一行放不下时保留结尾（最新的字），说话人名始终可见。
import { useUI } from "../../../../i18n/ui/useUI";
import { tailText } from "./captions-model";
import { useCaptions } from "./hooks";
import { CaptionsIcon, CaptionsOffIcon, CloseIcon } from "./icons";
import type { CallCaptionsLineProps } from "./types";

/** 小窗 1 行 / 放大视图 2 行；每行最多显示的字数（再长从前面截断）。 */
export const CAPTION_LAYOUT = {
  dock: { lines: 1, chars: 80 },
  stage: { lines: 2, chars: 160 },
} as const;

/** 字幕底：深色半透明（深浅主题下都清楚）。ui.css 没有这一档，行内样式。 */
const CAPTION_SURFACE = { backgroundColor: "rgba(0, 0, 0, 0.72)" } as const;

export function CallCaptionsLine({ mode = "dock", className }: CallCaptionsLineProps) {
  const tt = useUI();
  const captions = useCaptions();
  if (!captions.enabled) return null;
  const layout = CAPTION_LAYOUT[mode] ?? CAPTION_LAYOUT.dock;

  if (captions.hidden) {
    return (
      <button
        type="button"
        data-call-captions="hidden"
        onClick={() => captions.setHidden(false)}
        aria-label={tt("显示字幕")}
        title={tt("显示字幕")}
        className={[
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white/80 hover:bg-white/10 focus-visible:outline focus-visible:outline-2",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        style={CAPTION_SURFACE}
      >
        <CaptionsOffIcon className="h-3.5 w-3.5 shrink-0" />
        {mode === "stage" ? <span>{tt("显示字幕")}</span> : null}
      </button>
    );
  }

  const lines = captions.lines.slice(-layout.lines);
  const notice =
    captions.uplink.error === "asr_unavailable"
      ? tt("实时转写暂不可用，请稍后再试")
      : mode === "stage" && captions.capture === "unsupported"
        ? tt("这台设备暂时不能把你的话转成字幕")
        : null;
  if (lines.length === 0 && !notice) return null;

  return (
    <div
      role="region"
      aria-label={tt("通话字幕")}
      data-call-captions={mode}
      className={["relative flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-white", className].filter(Boolean).join(" ")}
      style={CAPTION_SURFACE}
    >
      <CaptionsIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />
      {/* 读屏只播报最新定稿的一句；看得见的几行会随中间结果变动，不做实时播报，免得刷屏。 */}
      <span className="sr-only" aria-live="polite" aria-atomic="true" data-caption-announce="">
        {captions.latestFinal ? `${captions.latestFinal.speakerName} ${captions.latestFinal.text}` : ""}
      </span>
      <div className="min-w-0 flex-1">
        {lines.map((line) => (
          <p
            key={`${line.participantId}\u0000${line.sentenceId}`}
            data-caption-speaker={line.participantId}
            data-caption-final={line.isFinal ? "1" : "0"}
            className={`flex min-w-0 items-baseline gap-1.5 leading-5 ${mode === "stage" ? "text-[13px]" : "text-[12px]"}`}
          >
            <span className="shrink-0 truncate font-semibold text-white/70" style={{ maxWidth: "40%" }}>
              {line.speakerName}
            </span>
            <span className="flex min-w-0 flex-1 justify-end overflow-hidden" dir="auto">
              <span className={`whitespace-nowrap ${line.isFinal ? "" : "opacity-80"}`}>{tailText(line.text, layout.chars)}</span>
            </span>
          </p>
        ))}
        {notice ? <p className="text-[11px] leading-4 text-white/70">{notice}</p> : null}
      </div>
      <button
        type="button"
        onClick={() => captions.setHidden(true)}
        aria-label={tt("隐藏字幕")}
        title={tt("隐藏字幕")}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white/70 hover:bg-white/10 focus-visible:outline focus-visible:outline-2"
      >
        <CloseIcon className="h-3 w-3" />
      </button>
    </div>
  );
}
