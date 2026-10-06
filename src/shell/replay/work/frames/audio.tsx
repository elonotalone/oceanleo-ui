"use client";

// audio 的回放画法（work-chat W14，契约 §8.4）：轨道与剪辑片段的时间轴示意。
// 一条「音频」底轨，上面每条编辑操作一个片段（按起止秒画；没有区间的画成整段细条）。
import { useUI } from "../../../../i18n/ui/useUI";
import {
  type AudioCollabOperation,
  audioFromRevisionJson,
  audioFromYDoc,
  audioOperationIds,
  audioSegments,
  audioToArtifactJson,
  type AudioCollabState,
} from "../../../collab/adapters/audio";
import type { ReplayFrameProps, ReplayFrameRenderer } from "../frame-types";
import { joinNotes, plainChangeTranslate, type ChangeTranslate } from "./notes";

const TYPE_LABEL: Record<string, string> = {
  crop: "裁剪",
  delete: "删除",
  fade: "淡入淡出",
  gain: "音量",
  effects: "效果",
};
const TYPE_COLOR: Record<string, string> = {
  crop: "#3b82f6",
  delete: "#ef4444",
  fade: "#a855f7",
  gain: "#10b981",
  effects: "#f59e0b",
};
const DEFAULT_SPAN_SECONDS = 10;

function AudioFrame({ snapshot, prev, width, height, authorColor = "#4f46e5" }: ReplayFrameProps) {
  const tt = useUI();
  const state = snapshot as AudioCollabState;
  const segments = audioSegments(state);
  const known = new Set(audioOperationIds((prev as AudioCollabState | undefined)?.operations ?? []));
  const span = Math.max(DEFAULT_SPAN_SECONDS, ...segments.map((segment) => segment.end ?? 0));
  const rowHeight = Math.max(10, Math.min(18, Math.floor((height - 40) / Math.max(1, segments.length)) - 2));
  return (
    <div
      data-replay-frame="audio"
      style={{ width, height }}
      className="overflow-hidden rounded border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-1 text-[10px] text-[var(--foreground,#292524)]"
    >
      <div className="mb-1 flex items-center gap-1">
        <span className="w-10 shrink-0 opacity-70">{tt("音频")}</span>
        <div className="h-4 flex-1 rounded-sm bg-[#1F6FEB]/70" />
      </div>
      {segments.length === 0 ? (
        <p className="p-1 text-[var(--muted-foreground,#57534e)]">{tt("还没有剪辑操作")}</p>
      ) : (
        segments.map((segment) => {
          const mark = prev ? !known.has(segment.id) : false;
          const whole = segment.start === null || segment.end === null;
          const left = whole ? 0 : (segment.start! / span) * 100;
          const size = whole ? 100 : Math.max(1, ((segment.end! - segment.start!) / span) * 100);
          return (
            <div key={segment.id} className="mb-0.5 flex items-center gap-1" style={{ height: rowHeight }}>
              <span className="w-10 shrink-0 truncate opacity-70">{tt(TYPE_LABEL[segment.type] ?? segment.type)}</span>
              <div className="relative h-full flex-1 rounded-sm bg-[var(--muted,#f5f5f4)]">
                <div
                  data-segment-id={segment.id}
                  data-changed={mark ? "true" : undefined}
                  className="absolute top-0 h-full rounded-sm"
                  style={{
                    left: `${left}%`,
                    width: `${size}%`,
                    opacity: whole ? 0.55 : 1,
                    background: TYPE_COLOR[segment.type] ?? "#64748b",
                    outline: mark ? `2px solid ${authorColor}` : undefined,
                    outlineOffset: mark ? 1 : undefined,
                  }}
                />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

/** 这一步改了什么（剪辑操作的增减）。 */
export function describeAudioChange(prev: unknown, next: unknown, tt?: ChangeTranslate): string | null {
  if (!isRecord(next) || !Array.isArray(next.operations)) return null;
  const nextOps = next.operations as AudioCollabOperation[];
  const prevOps = isRecord(prev) && Array.isArray(prev.operations) ? (prev.operations as AudioCollabOperation[]) : [];
  const before = new Set(audioOperationIds(prevOps));
  const after = audioOperationIds(nextOps);
  const afterSet = new Set(after);
  const added = after.filter((id) => !before.has(id)).length;
  const removed = [...before].filter((id) => !afterSet.has(id)).length;
  const t = tt ?? plainChangeTranslate;
  const parts: string[] = [];
  if (added) parts.push(t("加了 {n} 个剪辑操作", { n: added }));
  if (removed) parts.push(t("撤掉了 {n} 个剪辑操作", { n: removed }));
  return joinNotes(tt, parts);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const renderer: ReplayFrameRenderer = {
  kind: "audio",
  fromY: audioFromYDoc,
  fromRevision: audioFromRevisionJson,
  Frame: AudioFrame,
  describeChange: describeAudioChange,
  toArtifactJson: audioToArtifactJson,
};

export default renderer;
