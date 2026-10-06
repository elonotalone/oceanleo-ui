"use client";

// 剪辑：选起止章节、隐藏某些章节、决定要不要放进「被撤销的尝试」，然后确认范围（契约 §7.1：公开链接必须先确认）。
// 只有 owner 拿得到真实时刻，所以只有 owner 能剪。
import { useMemo, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { PatchWorkReplayInput, WorkReplay } from "./replay-work-api";
import { toggleHiddenChapter, trimRangeForChapters } from "./replay-work-model";
import { localizeChapterTitle } from "./WorkReplayTimeline";

export interface ReplayTrimEditorProps {
  data: WorkReplay;
  onApply: (patch: PatchWorkReplayInput) => Promise<boolean>;
  onClose?: () => void;
}

export function ReplayTrimEditor({ data, onApply, onClose }: ReplayTrimEditorProps) {
  const tt = useUI();
  const chapters = useMemo(() => data.chapters, [data.chapters]);
  const selectable = chapters.filter((chapter) => !chapter.hidden);
  const [fromId, setFromId] = useState(selectable[0]?.id ?? "");
  const [toId, setToId] = useState(selectable[selectable.length - 1]?.id ?? "");
  const [hidden, setHidden] = useState<string[]>(chapters.filter((chapter) => chapter.hidden).map((chapter) => chapter.id));
  const [showUndone, setShowUndone] = useState(data.replay.show_undone);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<"range" | "save" | null>(null);

  const apply = async () => {
    const range = trimRangeForChapters(data, fromId, toId);
    if (!range) {
      setFailed("range");
      return;
    }
    setBusy(true);
    setFailed(null);
    const ok = await onApply({ ...range, trim_confirmed: true, hidden_chapters: hidden, show_undone: showUndone });
    setBusy(false);
    if (!ok) setFailed("save");
  };

  return (
    <section data-replay-trim-editor className="space-y-3 text-[13px]">
      <p className="text-stone-600">{tt("选好要公开的部分，确认后才能生成公开链接。公开链接只会播放这一段。")}</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-stone-500">
          {tt("从")}
          <select
            data-replay-trim-from
            value={fromId}
            onChange={(event) => setFromId(event.target.value)}
            className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-neutral-900"
          >
            {selectable.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>
                {localizeChapterTitle(tt, chapter.title, chapter.title_parts)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-stone-500">
          {tt("到")}
          <select
            data-replay-trim-to
            value={toId}
            onChange={(event) => setToId(event.target.value)}
            className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-neutral-900"
          >
            {selectable.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>
                {localizeChapterTitle(tt, chapter.title, chapter.title_parts)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="space-y-1">
        <legend className="text-stone-500">{tt("隐藏这些章节")}</legend>
        {chapters.map((chapter) => (
          <label key={chapter.id} className="flex items-center gap-2 text-neutral-900">
            <input
              type="checkbox"
              data-replay-trim-hide={chapter.id}
              checked={hidden.includes(chapter.id)}
              onChange={() => setHidden((current) => toggleHiddenChapter(current, chapter.id))}
            />
            <span className="truncate">{localizeChapterTitle(tt, chapter.title, chapter.title_parts)}</span>
          </label>
        ))}
      </fieldset>
      <label className="flex items-center gap-2 text-neutral-900">
        <input
          type="checkbox"
          data-replay-show-undone
          checked={showUndone}
          onChange={(event) => setShowUndone(event.target.checked)}
        />
        {tt("显示被撤销的尝试")}
      </label>
      {failed === "range" ? <p className="text-rose-600">{tt("这个范围选不出来，换一下起止章节。")}</p> : null}
      {failed === "save" ? <p className="text-rose-600">{tt("没有保存成功，请再试一次。")}</p> : null}
      <div className="flex justify-end gap-2">
        {onClose ? (
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-stone-500 hover:bg-stone-100">
            {tt("取消")}
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy || selectable.length === 0}
          data-replay-trim-confirm
          onClick={() => void apply()}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {data.replay.trim?.confirmed ? tt("重新确认范围") : tt("确认范围")}
        </button>
      </div>
    </section>
  );
}
