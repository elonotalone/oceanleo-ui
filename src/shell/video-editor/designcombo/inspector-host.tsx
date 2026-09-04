"use client";

/**
 * Host for the vendored inspector (property-registry + transform + caption style).
 */
import type { OpenVideoClip, OpenVideoProject } from "./schema";
import { VIDEO_DESIGNCOMBO_CHROME_ATTRS } from "./stage-plan";

export function DesigncomboInspectorHost({
  project,
  clip,
  onCrop,
  onCaptionStyle,
  onKeyframes,
}: {
  project: OpenVideoProject;
  clip: OpenVideoClip | null;
  onCrop: (crop: { x: number; y: number; width: number; height: number }) => void;
  onCaptionStyle: (color: string) => void;
  onKeyframes: () => void;
}) {
  const crop = clip?.crop || { x: 0, y: 0, width: 1, height: 1 };
  return (
    <div
      {...{ [VIDEO_DESIGNCOMBO_CHROME_ATTRS.inspector]: "true" }}
      data-video-designcombo-inspector-panel="true"
      className="h-full overflow-auto bg-[var(--card,#fff)] p-3 text-[12px] text-[var(--fg,#292524)]"
    >
      <p className="mb-2 font-semibold">检查器</p>
      {!clip ? (
        <p className="text-[var(--muted,#78716c)]">未选中片段。画布 {project.settings.width}×{project.settings.height} @{project.settings.fps}fps</p>
      ) : (
        <div className="space-y-3">
          <p>
            {clip.type} · {clip.name || clip.id}
          </p>
          <label className="block">
            裁切 X
            <input
              type="range"
              min={0}
              max={95}
              value={Math.round(crop.x * 100)}
              onChange={(event) =>
                onCrop({ ...crop, x: Number(event.target.value) / 100 })
              }
              className="w-full"
            />
          </label>
          <label className="block">
            裁切 Y
            <input
              type="range"
              min={0}
              max={95}
              value={Math.round(crop.y * 100)}
              onChange={(event) =>
                onCrop({ ...crop, y: Number(event.target.value) / 100 })
              }
              className="w-full"
            />
          </label>
          <label className="block">
            裁切宽
            <input
              type="range"
              min={5}
              max={100}
              value={Math.round(crop.width * 100)}
              onChange={(event) =>
                onCrop({ ...crop, width: Number(event.target.value) / 100 })
              }
              className="w-full"
            />
          </label>
          <label className="block">
            裁切高
            <input
              type="range"
              min={5}
              max={100}
              value={Math.round(crop.height * 100)}
              onChange={(event) =>
                onCrop({ ...crop, height: Number(event.target.value) / 100 })
              }
              className="w-full"
            />
          </label>
          {(clip.type === "Caption" || clip.type === "Text") && (
            <label className="block">
              字幕颜色
              <input
                type="color"
                value={String(clip.style?.color || "#ffffff")}
                onChange={(event) => onCaptionStyle(event.target.value)}
              />
            </label>
          )}
          <button
            type="button"
            data-video-designcombo-keyframes="true"
            className="rounded-lg border px-2 py-1"
            onClick={onKeyframes}
          >
            写入默认关键帧
          </button>
        </div>
      )}
    </div>
  );
}
