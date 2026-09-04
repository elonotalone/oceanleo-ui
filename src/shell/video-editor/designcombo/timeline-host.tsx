"use client";

/**
 * Host for the vendored OpenVideo timeline. Renders the JSON tracks/clips.
 * Pixel chrome of the upstream timeline.tsx is in vendor/.../timeline.tsx.upstream;
 * this host is what L3 shows without pulling @openvideo/timeline into tsc.
 */
import { usToMs, type OpenVideoProject } from "./schema";
import { VIDEO_DESIGNCOMBO_CHROME_ATTRS } from "./stage-plan";

export function DesigncomboTimelineHost({
  project,
  selectedClipId,
  playheadUs,
  onSelect,
  onSeekUs,
}: {
  project: OpenVideoProject;
  selectedClipId: string;
  playheadUs: number;
  onSelect: (clipId: string) => void;
  onSeekUs: (us: number) => void;
}) {
  const duration = Math.max(
    1,
    ...Object.values(project.clips).map((clip) => clip.timing.display.to),
  );
  return (
    <div
      {...{ [VIDEO_DESIGNCOMBO_CHROME_ATTRS.timelineChrome]: "true" }}
      data-video-designcombo-timeline="true"
      className="h-full overflow-auto bg-[var(--awb-stage-bg,#111)] p-2 text-[11px] text-[var(--awb-on-accent,#fff)]"
    >
      <div className="mb-1 flex justify-between">
        <span>时间线</span>
        <span>{(usToMs(playheadUs) / 1000).toFixed(2)}s</span>
      </div>
      {project.tracks.map((track) => (
        <div key={track.id} className="mb-2">
          <div className="mb-0.5 opacity-70">{track.name || track.type}</div>
          <div
            className="relative h-8 rounded bg-black/40"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const ratio = (event.clientX - rect.left) / Math.max(1, rect.width);
              onSeekUs(ratio * duration);
            }}
          >
            {track.clipIds.map((id) => {
              const clip = project.clips[id];
              if (!clip) return null;
              const left = (clip.timing.display.from / duration) * 100;
              const width = ((clip.timing.display.to - clip.timing.display.from) / duration) * 100;
              const selected = id === selectedClipId;
              return (
                <button
                  key={id}
                  type="button"
                  data-clip-id={id}
                  data-clip-type={clip.type}
                  className="absolute top-0.5 h-7 overflow-hidden rounded px-1 text-left"
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(2, width)}%`,
                    background: selected ? "var(--awb-accent,#7c3aed)" : "#334155",
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(id);
                  }}
                >
                  {clip.text || clip.name || clip.type}
                </button>
              );
            })}
            <div
              className="pointer-events-none absolute top-0 h-full w-px bg-amber-300"
              style={{ left: `${(playheadUs / duration) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
