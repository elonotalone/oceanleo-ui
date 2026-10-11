"use client";

import { useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  addBayLessonChapter,
  deleteBayLessonChapter,
  reorderBayLessonChapters,
  updateBayLessonChapter,
  type BayLessonChapter,
} from "../../../lib/bay/lessons";
import { BayApiError } from "../../../lib/bay/http";
import { pickLibraryWork } from "../needs/LibraryWorkPicker";
import { DANGER_BUTTON, INPUT_CLASS, SECONDARY_BUTTON } from "../seller/seller-ui";
import { baySiteName } from "../shell/bay-links";
import { moveChapter } from "./lesson-editor-model";

function errorText(error: unknown, fallback: string): string {
  return error instanceof BayApiError && error.message ? error.message : fallback;
}

export function ChapterList({
  lessonId,
  chapters,
  disabled,
  onChapters,
  onError,
}: {
  lessonId: string;
  chapters: BayLessonChapter[];
  disabled?: boolean;
  onChapters: (chapters: BayLessonChapter[]) => void;
  onError: (message: string) => void;
}): ReactElement {
  const tt = useUI();
  const [busy, setBusy] = useState("");
  const [titles, setTitles] = useState<Record<string, string>>({});
  const locked = Boolean(disabled || busy);

  async function run(key: string, work: () => Promise<BayLessonChapter[]>) {
    if (locked) return;
    setBusy(key);
    onError("");
    try {
      onChapters(await work());
    } catch (error) {
      onError(errorText(error, tt("章节没有改成，请稍后再试。")));
    } finally {
      setBusy("");
    }
  }

  async function addFromLibrary() {
    if (locked) return;
    const picked = await pickLibraryWork({ title: tt("给课程加一节") });
    if (!picked?.id) return;
    await run("add", async () => {
      const body = await addBayLessonChapter(lessonId, {
        title: picked.title || "",
        work: { kind: "task", id: picked.id },
      });
      return body.chapters;
    });
  }

  async function persistTitle(row: BayLessonChapter) {
    const next = (titles[row.id] ?? row.title).trim();
    if (next === row.title) return;
    await run(`title:${row.id}`, async () => {
      const body = await updateBayLessonChapter(lessonId, row.id, { title: next });
      return body.chapters;
    });
  }

  async function togglePreview(row: BayLessonChapter) {
    await run(`preview:${row.id}`, async () => {
      const body = await updateBayLessonChapter(lessonId, row.id, { free_preview: !row.free_preview });
      return body.chapters;
    });
  }

  async function move(row: BayLessonChapter, direction: -1 | 1) {
    const ids = moveChapter(
      chapters.map((item) => item.id),
      row.id,
      direction,
    );
    if (ids.join("\0") === chapters.map((item) => item.id).join("\0")) return;
    await run(`move:${row.id}:${direction}`, async () => {
      const body = await reorderBayLessonChapters(lessonId, ids);
      return body.chapters;
    });
  }

  async function remove(row: BayLessonChapter) {
    await run(`delete:${row.id}`, async () => {
      const body = await deleteBayLessonChapter(lessonId, row.id);
      return body.chapters;
    });
  }

  return (
    <div className="space-y-3">
      {chapters.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 px-4 py-6 text-center text-[12.5px] text-stone-500">
          {tt("还没有章节。课程的每一节是你库里的一个作品：视频、文档、幻灯片都可以")}
        </p>
      ) : (
        <ol className="space-y-2">
          {chapters.map((row, index) => {
            const site = baySiteName(row.work_site_key, tt) || row.work_site_key || "";
            return (
              <li key={row.id} className="rounded-xl border border-stone-200 bg-white p-3">
                <div className="flex flex-wrap items-start gap-2">
                  <span className="mt-2 w-6 shrink-0 text-[12px] font-medium text-stone-500">{index + 1}</span>
                  <div className="min-w-[10rem] flex-1">
                    <input
                      className={INPUT_CLASS}
                      value={titles[row.id] ?? row.title}
                      disabled={locked}
                      onChange={(event) => setTitles((current) => ({ ...current, [row.id]: event.target.value }))}
                      onBlur={() => void persistTitle(row)}
                    />
                    <p className="mt-1 truncate text-[12px] text-stone-500">
                      {[site, row.work_title].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <label className="mt-2 flex items-center gap-1.5 text-[12px] text-stone-600">
                    <input
                      type="checkbox"
                      checked={row.free_preview}
                      disabled={locked}
                      onChange={() => void togglePreview(row)}
                    />
                    {tt("免费试看")}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" disabled={locked || index === 0} className={SECONDARY_BUTTON} onClick={() => void move(row, -1)}>
                      {tt("上移")}
                    </button>
                    <button
                      type="button"
                      disabled={locked || index === chapters.length - 1}
                      className={SECONDARY_BUTTON}
                      onClick={() => void move(row, 1)}
                    >
                      {tt("下移")}
                    </button>
                    <button type="button" disabled={locked} className={DANGER_BUTTON} onClick={() => void remove(row)}>
                      {tt("删除")}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <button type="button" disabled={locked} className={SECONDARY_BUTTON} onClick={() => void addFromLibrary()}>
        {tt("从我的库里添加一节")}
      </button>
    </div>
  );
}
