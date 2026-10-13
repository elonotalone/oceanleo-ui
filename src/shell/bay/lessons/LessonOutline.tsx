"use client";

// 课程大纲：试看 / 已学 / 锁。能看的在新窗口打开查看页，并记成已学；403 只提示、不开窗。
import { useState, type ReactElement } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import { openBayLessonChapter, setBayLessonProgress, type BayLessonChapter } from "../../../lib/bay/lessons";
import { workPreviewHref } from "../needs/need-links";
import { siteLabel } from "../needs/need-format";
import { requireBayLogin } from "../shell/bay-state";
import { errorStatus, errorText } from "../supply/use-bay-resource";
import { chapterAccess } from "./purchase-model";

export async function playLessonChapter(lessonId: string, chapter: BayLessonChapter): Promise<{ opened: boolean; error: string; doneIds?: string[] }> {
  try {
    const result = await openBayLessonChapter(lessonId, chapter.id);
    const href = workPreviewHref({ site_key: result.site_key ?? undefined, preview_url: result.preview_url });
    if (!href) return { opened: false, error: "这一节的内容暂时打不开，请联系卖家" };
    window.open(href, "_blank", "noopener,noreferrer");
    try {
      const next = await setBayLessonProgress(lessonId, chapter.id, true);
      return { opened: true, error: "", doneIds: next.done_chapter_ids || [] };
    } catch {
      return { opened: true, error: "", doneIds: [chapter.id] };
    }
  } catch (err) {
    const fallback = errorStatus(err) === 403 ? "买了这门课才能看这一节" : "这一节的内容暂时打不开，请联系卖家";
    return { opened: false, error: errorText(err) || fallback };
  }
}

export function LessonOutline({
  lessonId,
  chapters,
  doneIds,
  owned,
  onDoneIds,
}: {
  lessonId: string;
  chapters: BayLessonChapter[];
  doneIds: string[];
  owned: boolean;
  onDoneIds: (ids: string[]) => void;
}): ReactElement {
  const tt = useUI();
  const [hint, setHint] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const done = new Set(doneIds);
  const ordered = [...chapters].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));

  async function openOne(chapter: BayLessonChapter) {
    if (chapterAccess(chapter, owned) === "locked") {
      setHint(tt("买了这门课才能看这一节"));
      return;
    }
    if (!requireBayLogin()) return;
    if (busyId) return;
    setBusyId(chapter.id);
    setHint("");
    const result = await playLessonChapter(lessonId, chapter);
    if (!result.opened) {
      setHint(tt(result.error));
    } else if (result.doneIds) {
      onDoneIds(result.doneIds);
    } else {
      onDoneIds(Array.from(new Set([...doneIds, chapter.id])));
    }
    setBusyId(null);
  }

  async function toggleDone(chapter: BayLessonChapter) {
    if (!requireBayLogin() || busyId) return;
    setBusyId(chapter.id);
    setHint("");
    try {
      const next = await setBayLessonProgress(lessonId, chapter.id, !done.has(chapter.id));
      onDoneIds(next.done_chapter_ids || []);
    } catch (err) {
      setHint(tt(errorText(err) || "没处理成功，请稍后再试。"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section data-bay-outline className="mt-5">
      <h3 className="text-[14px] font-semibold text-neutral-900">{tt("课程大纲")}</h3>
      {hint ? <p className="mt-2 text-[12px] text-rose-600">{hint}</p> : null}
      <ol className="mt-2 divide-y divide-neutral-100">
        {ordered.map((chapter, index) => {
          const access = chapterAccess(chapter, owned);
          const learned = done.has(chapter.id);
          return (
            <li key={chapter.id} data-bay-chapter={chapter.id} data-bay-access={access} className="flex items-center gap-2 px-3 py-2.5">
              <span className="w-6 shrink-0 text-[12px] text-neutral-500">{index + 1}</span>
              <button
                type="button"
                disabled={busyId === chapter.id}
                onClick={() => void openOne(chapter)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-[13px] font-medium text-neutral-900">{chapter.title}</span>
                <span className="mt-0.5 block truncate text-[11px] text-neutral-500">{siteLabel(tt, chapter.work_site_key)}</span>
              </button>
              {chapter.free_preview ? (
                <span className="shrink-0 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">{tt("试看")}</span>
              ) : null}
              {access === "locked" ? (
                <span data-bay-lock className="shrink-0 text-[11px] text-neutral-400">
                  {tt("未解锁")}
                </span>
              ) : (
                <button
                  type="button"
                  data-bay-done={learned ? "on" : "off"}
                  disabled={busyId === chapter.id}
                  onClick={() => void toggleDone(chapter)}
                  className={
                    "shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] disabled:opacity-60 " +
                    (learned ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-neutral-200 text-neutral-500")
                  }
                >
                  {tt("已学")}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
