"use client";

// ============================================================================
// @oceanleo/ui — VideoTimelineControls：剪辑工具面板（窄栏）
// ----------------------------------------------------------------------------
// 素材添加（上传/URL）、剪辑动作（分割/删除/复制/撤销重做）、加轨、画布格式、
// 选中 clip 属性（ClipInspector）、封面帧、草稿、导出。与 VideoTimelineStage
// 共享同一个 useVideoTimeline 返回值。
// ============================================================================

import { useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
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

function ToolButton({
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
      className="rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2.5 py-2 text-[11px] text-[var(--fg-2,#57534e)] transition hover:bg-[var(--surface-hover,rgba(0,0,0,.04))] disabled:opacity-40"
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
    <div className="min-h-full space-y-4 overflow-y-auto bg-[var(--card,#fff)] p-4">
      {/* 素材 */}
      <section>
        <p className="mb-2 text-[11px] font-semibold text-[var(--fg,#292524)]">{tt("素材")}</p>
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
            disabled={state.addingMedia || state.loadingSource}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
            style={{ background: accent }}
          >
            {state.addingMedia ? tt("添加中…") : tt("添加媒体")}
          </button>
          <ToolButton
            label={tt("粘贴 URL")}
            disabled={state.loadingSource}
            onClick={() => setShowUrlInput((value) => !value)}
          />
        </div>
        {showUrlInput && (
          <div className="mt-1.5 flex gap-1.5">
            <input
              value={urlDraft}
              disabled={state.loadingSource}
              onChange={(event) => setUrlDraft(event.target.value)}
              placeholder="https://…"
              className="min-w-0 flex-1 rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2.5 py-2 text-[11px] text-[var(--fg,#292524)] focus:border-[var(--accent,#7c3aed)] focus:outline-none"
            />
            <ToolButton
              label={tt("添加")}
              disabled={
                state.addingMedia || state.loadingSource || !urlDraft.trim()
              }
              onClick={() => {
                void state.addMediaUrl(urlDraft);
                setUrlDraft("");
                setShowUrlInput(false);
              }}
            />
          </div>
        )}
        <div className="mt-1.5">
          <ToolButton
            label={tt("添加文字")}
            disabled={!state.sourceReady}
            onClick={state.addTextClip}
          />
        </div>
      </section>

      {/* 剪辑动作 */}
      <section className="border-t border-[var(--border,#e7e5e4)] pt-3">
        <p className="mb-2 text-[11px] font-semibold text-[var(--fg,#292524)]">{tt("剪辑")}</p>
        <div className="grid grid-cols-2 gap-1.5">
          <ToolButton
            label={tt("分割")}
            title={tt("在播放头处分割（S）")}
            disabled={!state.sourceReady}
            onClick={state.splitAtPlayhead}
          />
          <ToolButton
            label={tt("撤销")}
            title="Ctrl+Z"
            disabled={!state.sourceReady || !state.canUndo}
            onClick={state.undo}
          />
          <ToolButton
            label={tt("重做")}
            title="Ctrl+Shift+Z"
            disabled={!state.sourceReady || !state.canRedo}
            onClick={state.redo}
          />
        </div>
      </section>

      {/* 轨道 */}
      <section className="border-t border-[var(--border,#e7e5e4)] pt-3">
        <p className="mb-2 text-[11px] font-semibold text-[var(--fg,#292524)]">{tt("添加轨道")}</p>
        <div className="grid grid-cols-2 gap-1.5">
          {TRACK_ADDS.map((entry) => (
            <ToolButton
              key={entry.kind}
              label={`+ ${tt(entry.label)}`}
              disabled={!state.sourceReady}
              onClick={() => state.addTrack(entry.kind)}
            />
          ))}
        </div>
      </section>

      {/* 画布格式 */}
      <section className="border-t border-[var(--border,#e7e5e4)] pt-3">
        <p className="mb-2 text-[11px] font-semibold text-[var(--fg,#292524)]">{tt("画布")}</p>
        <div className="grid grid-cols-4 gap-1">
          {FORMATS.map((format) => {
            const active =
              state.doc.width === format.width && state.doc.height === format.height;
            return (
              <button
                key={format.label}
                type="button"
                disabled={!state.sourceReady}
                onClick={() =>
                  state.setCanvasFormat(format.width, format.height, state.doc.fps)
                }
                className="rounded-lg border px-1 py-1.5 text-[10px] disabled:opacity-40"
                style={
                  active
                    ? { borderColor: accent, color: accent, background: `${accent}12` }
                    : { borderColor: "#e7e5e4", color: "#57534e" }
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
              disabled={!state.sourceReady}
              onClick={() => state.setCanvasFormat(state.doc.width, state.doc.height, fps)}
              className="rounded-lg border px-1 py-1.5 text-[10px] tabular-nums disabled:opacity-40"
              style={
                state.doc.fps === fps
                  ? { borderColor: accent, color: accent, background: `${accent}12` }
                  : { borderColor: "#e7e5e4", color: "#57534e" }
              }
            >
              {fps} fps
            </button>
          ))}
        </div>
      </section>

      {/* 输出 */}
      <section className="space-y-1.5 border-t border-[var(--border,#e7e5e4)] pt-3">
        <p className="mb-0.5 text-[11px] font-semibold text-[var(--fg,#292524)]">{tt("输出")}</p>
        <button
          type="button"
          disabled={
            !state.sourceReady ||
            state.capturingCover ||
            state.loadingSource ||
            !state.previewReady
          }
          onClick={() => void state.captureCover()}
          className="w-full rounded-xl border border-[var(--border,#e7e5e4)] py-2.5 text-[11px] text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))] disabled:opacity-50"
        >
          {state.capturingCover
            ? tt("生成封面中…")
            : state.coverUrl
              ? tt("重设封面帧（已设置）")
              : tt("当前帧设为封面")}
        </button>
        {state.exporting && (
          <p className="text-center text-[10px] text-[var(--muted,#78716c)]">
            {state.exportStatus === "running"
              ? tt("服务端渲染中…")
              : tt("等待渲染…")}
          </p>
        )}
        {state.exportedUrl && (
          <p className="break-all text-[10px] text-emerald-600">
            {tt("导出完成，已保存到我的库")}
          </p>
        )}
        {state.draftSavedUrl && !state.exportedUrl && (
          <p className="text-[10px] text-[var(--muted,#78716c)]">{tt("草稿已保存到我的库")}</p>
        )}
      </section>
    </div>
  );
}
