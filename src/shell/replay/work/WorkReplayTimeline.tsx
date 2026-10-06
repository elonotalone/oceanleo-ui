"use client";

// 回放播放器底部的时间轴：章节块、日期标记、「跳过」标记、倍速、拖动（work-chat 契约 §7.2 / §8.2）。
import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useUI, type UITranslate } from "../../../i18n/ui/useUI";
import type { WorkReplay } from "./replay-work-api";
import {
  REPLAY_SPEEDS,
  type ChapterWeekday,
  formatClock,
  parseChapterTitle,
  parseGapText,
  timelineMarks,
  type ReplayClock,
  type ReplaySpeed,
} from "./replay-work-model";

export function localizeGap(tt: UITranslate, text: string | null | undefined): string {
  const parts = parseGapText(text);
  if (!parts) return tt("跳过空闲时间");
  const pieces: string[] = [];
  if (parts.days) pieces.push(tt("{n} 天", { n: parts.days }));
  if (parts.hours) pieces.push(tt("{n} 小时", { n: parts.hours }));
  if (parts.minutes && !parts.days) pieces.push(tt("{n} 分", { n: parts.minutes }));
  if (!parts.days && !parts.hours && !parts.minutes && parts.seconds) pieces.push(tt("{n} 秒", { n: parts.seconds }));
  return tt("跳过 {span}", { span: pieces.join(" ") });
}

function weekdayLabel(tt: UITranslate, weekday: ChapterWeekday): string {
  switch (weekday) {
    case "周一":
      return tt("周一");
    case "周二":
      return tt("周二");
    case "周三":
      return tt("周三");
    case "周四":
      return tt("周四");
    case "周五":
      return tt("周五");
    case "周六":
      return tt("周六");
    default:
      return tt("周日");
  }
}

export function localizeChapterTitle(tt: UITranslate, title: string): string {
  const parts = parseChapterTitle(title);
  if (!parts) return title;
  const half = parts.half === "上午" ? tt("上午") : tt("下午");
  return `${weekdayLabel(tt, parts.weekday)} ${half} · ${parts.name || tt("工作")}`;
}

export function formatDayLabel(tt: UITranslate, date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  return tt("{m} 月 {d} 日", { m: Number(match[2]), d: Number(match[3]) });
}

export interface WorkReplayTimelineProps {
  data: Pick<WorkReplay, "chapters" | "events" | "days" | "playback_ms">;
  clock: ReplayClock;
  activeChapterId: string | null;
  onSeek: (t: number) => void;
  onToggle: () => void;
  onSpeed: (speed: ReplaySpeed) => void;
  onChapter: (chapterId: string) => void;
}

export function WorkReplayTimeline(props: WorkReplayTimelineProps) {
  const { data, clock, activeChapterId, onSeek, onToggle, onSpeed, onChapter } = props;
  const tt = useUI();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const marks = timelineMarks(data);
  const total = Math.max(data.playback_ms, 1);

  const seekFromPointer = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
      onSeek(ratio * data.playback_ms);
    },
    [data.playback_ms, onSeek],
  );

  return (
    <div data-work-replay-timeline className="flex flex-col gap-2 border-t border-stone-200 bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-replay-toggle
          onClick={onToggle}
          className="rounded-full bg-neutral-900 px-4 py-1.5 text-[13px] text-white hover:bg-neutral-700"
        >
          {clock.playing ? tt("暂停") : clock.ended ? tt("重播") : tt("播放")}
        </button>
        <span data-replay-clock className="tabular-nums text-[12px] text-stone-500">
          {formatClock(clock.t)} / {formatClock(data.playback_ms)}
        </span>
        <div className="ml-auto flex items-center gap-1" role="group" aria-label={tt("倍速")}>
          {REPLAY_SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              data-replay-speed={speed}
              aria-pressed={clock.speed === speed}
              onClick={() => onSpeed(speed)}
              className={`rounded-md px-2 py-1 text-[12px] ${
                clock.speed === speed ? "bg-neutral-900 text-white" : "text-stone-500 hover:bg-stone-100"
              }`}
            >
              {speed}×
            </button>
          ))}
        </div>
      </div>

      <div
        ref={trackRef}
        data-replay-track
        role="slider"
        aria-label={tt("播放进度")}
        aria-valuemin={0}
        aria-valuemax={data.playback_ms}
        aria-valuenow={Math.round(clock.t)}
        tabIndex={0}
        className="relative h-9 cursor-pointer touch-none select-none rounded-md bg-stone-100"
        onPointerDown={(event) => {
          draggingRef.current = true;
          (event.currentTarget as HTMLDivElement).setPointerCapture?.(event.pointerId);
          seekFromPointer(event);
        }}
        onPointerMove={(event) => {
          if (draggingRef.current) seekFromPointer(event);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") onSeek(clock.t + 5000);
          else if (event.key === "ArrowLeft") onSeek(clock.t - 5000);
        }}
      >
        {marks.chapters.map((mark) => {
          const chapter = data.chapters.find((item) => item.id === mark.id);
          if (!chapter || mark.hidden) return null;
          return (
            <button
              key={mark.id}
              type="button"
              data-replay-chapter={mark.id}
              data-active={activeChapterId === mark.id ? "true" : undefined}
              title={localizeChapterTitle(tt, chapter.title)}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onChapter(mark.id)}
              className={`absolute top-0 h-full overflow-hidden rounded-md border px-1 text-left text-[11px] leading-9 ${
                activeChapterId === mark.id
                  ? "border-neutral-900 bg-white text-neutral-900"
                  : "border-stone-200 bg-stone-200/70 text-stone-500 hover:bg-white"
              }`}
              style={{ left: `${mark.left * 100}%`, width: `max(${mark.width * 100}%, 6px)` }}
            >
              <span className="truncate">{localizeChapterTitle(tt, chapter.title)}</span>
            </button>
          );
        })}
        {marks.gaps.map((gap, index) => (
          <span
            key={`gap-${index}`}
            data-replay-gap-mark
            title={localizeGap(tt, gap.text)}
            className="pointer-events-none absolute top-1 h-7 w-px border-l border-dashed border-amber-500"
            style={{ left: `${gap.left * 100}%` }}
          />
        ))}
        {marks.days.map((day, index) => (
          <span
            key={`day-${index}`}
            data-replay-day-mark={day.date}
            className="pointer-events-none absolute -top-4 text-[10px] text-stone-400"
            style={{ left: `${day.left * 100}%` }}
          >
            {formatDayLabel(tt, day.date)}
          </span>
        ))}
        <span
          data-replay-playhead
          className="pointer-events-none absolute top-0 h-full w-0.5 bg-rose-500"
          style={{ left: `${Math.min(clock.t / total, 1) * 100}%` }}
        />
      </div>

      {data.days.length > 0 ? (
        <ul data-replay-days className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-stone-500">
          {data.days.map((day) => (
            <li key={day.date}>
              {formatDayLabel(tt, day.date)} · {tt("活跃 {n} 分钟", { n: Math.max(1, Math.round(day.active_ms / 60_000)) })}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
