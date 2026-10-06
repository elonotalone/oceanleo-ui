"use client";

// video 的回放画法（work-chat W14，契约 §8.4）：时间线示意。
// 每条轨道一行，片段按起止画成条；这一步变过的片段用作者颜色描边。
import { useUI } from "../../../../i18n/ui/useUI";
import {
  videoDescribeChange,
  videoDiff,
  videoFromRevisionJson,
  videoFromYDoc,
  videoToArtifactJson,
} from "../../../collab/adapters/video";
import type { TimelineDoc } from "../../../video-editor/types";
import type { ReplayFrameProps, ReplayFrameRenderer } from "../frame-types";

const KIND_COLOR: Record<string, string> = { video: "#3b82f6", audio: "#10b981", text: "#f59e0b", image: "#a855f7" };
const KIND_LABEL: Record<string, string> = { video: "视频", audio: "音频", text: "字幕", image: "图片" };

function VideoFrame({ snapshot, prev, width, height, authorColor = "#4f46e5" }: ReplayFrameProps) {
  const tt = useUI();
  const doc = snapshot as TimelineDoc;
  const diff = prev ? videoDiff(prev as TimelineDoc, doc) : null;
  const touched = new Set([...(diff?.added ?? []), ...(diff?.changed ?? [])]);
  const total = Math.max(1, ...doc.tracks.flatMap((track) => track.clips.map((clip) => clip.start_ms + clip.duration_ms)));
  const labelWidth = 44;
  const rows = Math.max(1, doc.tracks.length);
  const rowHeight = Math.max(14, Math.min(40, Math.floor((height - 8) / rows) - 4));
  const trackWidth = Math.max(10, width - labelWidth - 8);
  return (
    <div
      data-replay-frame="video"
      style={{ width, height }}
      className="overflow-hidden rounded border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-1 text-[10px] text-[var(--foreground,#292524)]"
    >
      {doc.tracks.length === 0 || doc.tracks.every((track) => track.clips.length === 0) ? (
        <p className="p-2 text-[var(--muted-foreground,#57534e)]">{tt("时间线是空的")}</p>
      ) : (
        doc.tracks.map((track) => (
          <div key={track.id} className="mb-1 flex items-center" style={{ height: rowHeight }}>
            <span style={{ width: labelWidth }} className="shrink-0 truncate opacity-70">
              {tt(KIND_LABEL[track.kind] ?? track.kind)}
            </span>
            <div className="relative rounded bg-[var(--muted,#f5f5f4)]" style={{ width: trackWidth, height: rowHeight }}>
              {track.clips.map((clip) => {
                const mark = touched.has(clip.id);
                return (
                  <div
                    key={clip.id}
                    data-clip-id={clip.id}
                    data-changed={mark ? "true" : undefined}
                    className="absolute top-0 overflow-hidden rounded-sm"
                    style={{
                      left: `${(clip.start_ms / total) * 100}%`,
                      width: `${Math.max(1, (clip.duration_ms / total) * 100)}%`,
                      height: rowHeight,
                      background: KIND_COLOR[track.kind] ?? "#64748b",
                      outline: mark ? `2px solid ${authorColor}` : undefined,
                      outlineOffset: mark ? 1 : undefined,
                    }}
                  >
                    {track.kind === "text" && clip.text ? <span className="px-1 text-white">{clip.text}</span> : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

const renderer: ReplayFrameRenderer = {
  kind: "video",
  fromY: videoFromYDoc,
  fromRevision: videoFromRevisionJson,
  Frame: VideoFrame,
  describeChange: videoDescribeChange,
  toArtifactJson: videoToArtifactJson,
};

export default renderer;
