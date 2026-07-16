"use client";

// ============================================================================
// @oceanleo/ui — VideoTimelineControls：剪辑「设置」overlay 侧栏内容
// ----------------------------------------------------------------------------
// v2（2026-07-16，Canva 骨架）：撤销/重做、分割、加轨、保存草稿、导出成片已上移
// 到统一顶栏（AdvancedTopBar），本组件只承载需要面板展开的复杂选择：素材导入、
// 画布画幅/帧率、封面帧。仍与 VideoTimelineStage 共享同一个 useVideoTimeline。
// 所有视觉走 CHROME/CSS 变量令牌，天然跟随深/浅双主题。
// ============================================================================

import { useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { CHROME, PanelSection } from "../editor-chrome";
import type { VideoTimelineState } from "./use-video-timeline";
import type { TrackKind } from "./types";

const FORMATS: Array<{ label: string; width: number; height: number }> = [
  { label: "16:9", width: 1920, height: 1080 },
  { label: "9:16", width: 1080, height: 1920 },
  { label: "1:1", width: 1080, height: 1080 },
  { label: "4:3", width: 1440, height: 1080 },
];

const TRACK_ADDS: Array<{ kind: TrackKind; label: string }> = [
  { kind: "video", label: "视频轨" },
  { kind: "audio", label: "音频轨" },
  { kind: "text", label: "文字轨" },
  { kind: "image", label: "贴图轨" },
];

function PanelButton({
  label,
  onClick,
  disabled,
  title,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-lg border ${CHROME.border} px-2 py-1.5 text-[11px] ${CHROME.fg2} ${CHROME.hover} disabled:opacity-40`}
    >
      {label}
    </button>
  );
}

export function VideoTimelineControls({
  state,
  accent = "#4f46e5",
}: {
  state: VideoTimelineState;
  accent?: string;
}) {
  const tt = useUI();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);

  return (
    <div className="space-y-1">
      <PanelSection title={tt("素材")}>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,audio/*,image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void state.addMediaFile(file);
          }}
        />
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            disabled={state.addingMedia}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
            style={{ background: accent }}
          >
            {state.addingMedia ? tt("添加中…") : tt("添加媒体")}
          </button>
          <PanelButton
            label={tt("粘贴 URL")}
            onClick={() => setShowUrlInput((value) => !value)}
          />
        </div>
        {showUrlInput && (
          <div className="mt-1.5 flex gap-1.5">
            <input
              value={urlDraft}
              onChange={(event) => setUrlDraft(event.target.value)}
              placeholder="https://…"
              className={`min-w-0 flex-1 rounded-lg border ${CHROME.border} ${CHROME.surface} px-2 py-1.5 text-[11px] ${CHROME.fg} focus:outline-none`}
            />
            <PanelButton
              label={tt("添加")}
              disabled={state.addingMedia || !urlDraft.trim()}
              onClick={() => {
                void state.addMediaUrl(urlDraft);
                setUrlDraft("");
                setShowUrlInput(false);
              }}
            />
          </div>
        )}
        <div className="mt-1.5">
          <PanelButton label={tt("添加文字")} onClick={state.addTextClip} />
        </div>
      </PanelSection>

      <PanelSection title={tt("添加轨道")}>
        <div className="grid grid-cols-2 gap-1.5">
          {TRACK_ADDS.map((entry) => (
            <PanelButton
              key={entry.kind}
              label={`+ ${tt(entry.label)}`}
              onClick={() => state.addTrack(entry.kind)}
            />
          ))}
        </div>
      </PanelSection>

      <PanelSection title={tt("画布")}>
        <div className="grid grid-cols-4 gap-1">
          {FORMATS.map((format) => {
            const active =
              state.doc.width === format.width && state.doc.height === format.height;
            return (
              <button
                key={format.label}
                type="button"
                onClick={() =>
                  state.setCanvasFormat(format.width, format.height, state.doc.fps)
                }
                className={`rounded-lg border px-1 py-1.5 text-[10px] transition ${CHROME.hover}`}
                style={
                  active
                    ? { borderColor: accent, color: accent, background: `${accent}12` }
                    : { borderColor: "var(--border,#e7e5e4)", color: "var(--fg-2,#57534e)" }
                }
              >
                {format.label}
              </button>
            );
          })}
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-1">
          {[24, 30, 60].map((fps) => (
            <button
              key={fps}
              type="button"
              onClick={() => state.setCanvasFormat(state.doc.width, state.doc.height, fps)}
              className={`rounded-lg border px-1 py-1.5 text-[10px] tabular-nums transition ${CHROME.hover}`}
              style={
                state.doc.fps === fps
                  ? { borderColor: accent, color: accent, background: `${accent}12` }
                  : { borderColor: "var(--border,#e7e5e4)", color: "var(--fg-2,#57534e)" }
              }
            >
              {fps} fps
            </button>
          ))}
        </div>
      </PanelSection>

      <PanelSection title={tt("封面")}>
        <button
          type="button"
          disabled={
            state.capturingCover || state.loadingSource || !state.previewReady
          }
          onClick={() => void state.captureCover()}
          className={`w-full rounded-lg border ${CHROME.border} py-2 text-[11px] ${CHROME.fg2} ${CHROME.hover} disabled:opacity-50`}
        >
          {state.capturingCover
            ? tt("生成封面中…")
            : state.coverUrl
              ? tt("重设封面帧（已设置）")
              : tt("当前帧设为封面")}
        </button>
      </PanelSection>
    </div>
  );
}
