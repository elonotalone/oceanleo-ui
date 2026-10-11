import type { BayLesson, BayLessonInput, BayLessonMine, BayLessonPurchase } from "../../../lib/bay/lessons";

export type LessonDraft = {
  title: string;
  summary: string;
  description: string;
  coverUrl: string;
  category: string;
  price: string;
};

export type BundleDraft = {
  title: string;
  summary: string;
  coverUrl: string;
  price: string;
};

const TITLE_LIMIT = 80;
const SUMMARY_LIMIT = 200;
const DESCRIPTION_LIMIT = 4000;

export function emptyLessonDraft(): LessonDraft {
  return { title: "", summary: "", description: "", coverUrl: "", category: "", price: "" };
}

export function emptyBundleDraft(): BundleDraft {
  return { title: "", summary: "", coverUrl: "", price: "" };
}

/** 输入框金额 → 最小单位；留空当 0；不是数字返回 null。 */
export function parseLessonPriceFen(text: string): number | null {
  const raw = String(text ?? "").trim();
  if (!raw) return 0;
  if (raw.includes("-")) return null;
  const value = Number(raw.replace(/[,，\s]/g, ""));
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export function draftFromLesson(
  lesson: Pick<BayLesson, "title" | "summary" | "description" | "cover_url" | "category" | "price_fen">,
  toInput: (fen: number) => string,
): LessonDraft {
  return {
    title: lesson.title || "",
    summary: lesson.summary || "",
    description: lesson.description || "",
    coverUrl: lesson.cover_url || "",
    category: lesson.category || "",
    price: toInput(lesson.price_fen || 0),
  };
}

export function lessonPatch(
  draft: LessonDraft,
  lesson: Pick<BayLesson, "title" | "summary" | "description" | "cover_url" | "category" | "price_fen">,
  toFen: (text: string) => number | null,
): BayLessonInput {
  const patch: BayLessonInput = {};
  if (draft.title !== (lesson.title || "")) patch.title = draft.title;
  if (draft.summary !== (lesson.summary || "")) patch.summary = draft.summary;
  if (draft.description !== (lesson.description || "")) patch.description = draft.description;
  const nextCover = draft.coverUrl.trim() === "" ? null : draft.coverUrl;
  if (nextCover !== (lesson.cover_url || null)) patch.cover_url = nextCover;
  if (draft.category !== (lesson.category || "")) patch.category = draft.category || null;
  const fen = toFen(draft.price);
  if (fen !== null && fen !== (lesson.price_fen || 0)) patch.price_fen = fen;
  return patch;
}

export function lessonDraftProblems(draft: LessonDraft, toFen: (text: string) => number | null): string[] {
  const problems: string[] = [];
  if (!draft.title.trim()) problems.push("请填写名称");
  else if (draft.title.length > TITLE_LIMIT) problems.push("名称不能超过 80 个字");
  if (!draft.summary.trim()) problems.push("请写一句话简介");
  else if (draft.summary.length > SUMMARY_LIMIT) problems.push("一句话简介不能超过 200 个字");
  if (draft.description.length > DESCRIPTION_LIMIT) problems.push("详细介绍不能超过 4000 个字");
  if (draft.coverUrl.trim() && !draft.coverUrl.startsWith("https://")) {
    problems.push("封面图需要是 https 开头的图片地址");
  }
  if (!draft.category.trim()) problems.push("请选择一个站点类目");
  if (toFen(draft.price) === null) problems.push("价格不是合法金额");
  return problems;
}

export function moveChapter(ids: string[], id: string, direction: -1 | 1): string[] {
  const index = ids.indexOf(id);
  if (index < 0) return ids.slice();
  const next = index + direction;
  if (next < 0 || next >= ids.length) return ids.slice();
  const copy = ids.slice();
  const current = copy[index];
  copy[index] = copy[next];
  copy[next] = current;
  return copy;
}

export function bundleTotals(
  lessons: Pick<BayLesson, "id" | "price_fen">[],
  selectedIds: string[],
  bundlePriceFen: number,
): { total: number; saving: number; overpriced: boolean } {
  const selected = new Set(selectedIds);
  const total = lessons.filter((row) => selected.has(row.id)).reduce((sum, row) => sum + (row.price_fen || 0), 0);
  const price = Number.isFinite(bundlePriceFen) ? bundlePriceFen : 0;
  return { total, saving: total - price, overpriced: price > total };
}

export function bundleProblems(draft: BundleDraft, selectedIds: string[], totals: { overpriced: boolean }): string[] {
  const problems: string[] = [];
  if (!draft.title.trim()) problems.push("请填写名称");
  else if (draft.title.length > TITLE_LIMIT) problems.push("名称不能超过 80 个字");
  if (!draft.summary.trim()) problems.push("请写一句话简介");
  else if (draft.summary.length > SUMMARY_LIMIT) problems.push("一句话简介不能超过 200 个字");
  if (selectedIds.length < 2) problems.push("至少要勾选两门课");
  if (selectedIds.length > 20) problems.push("一套最多 20 门课");
  if (totals.overpriced) problems.push("套餐价不能高于里面课程单买的合计");
  return problems;
}

export function sortSoldOrders(items: BayLessonPurchase[]): BayLessonPurchase[] {
  return items.slice().sort((a, b) => {
    const aHot = a.status === "refund_requested" ? 0 : 1;
    const bHot = b.status === "refund_requested" ? 0 : 1;
    if (aHot !== bHot) return aHot - bHot;
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });
}

export function lessonStatusLabel(lesson: Pick<BayLessonMine, "status" | "moderation_hidden">): string {
  if (lesson.moderation_hidden) return "已被平台隐藏";
  if (lesson.status === "published") return "已上架";
  if (lesson.status === "offline") return "已下架";
  return "草稿";
}

export function refundHoursLeft(dueAt: string | null | undefined, nowMs = Date.now()): number {
  if (!dueAt) return 0;
  const due = Date.parse(dueAt);
  if (!Number.isFinite(due)) return 0;
  return Math.max(0, Math.ceil((due - nowMs) / 3_600_000));
}
