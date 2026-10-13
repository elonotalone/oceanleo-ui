import type { BayLesson, BayLessonInput, BayLessonMine, BayLessonPurchase } from "../../../lib/bay/lessons";
import {
  audienceDone,
  audienceMemberIds,
  emptyAudience,
  normalizeAudience,
  type BayAudience,
} from "../form/bay-audience";
import { BAY_GALLERY_MAX, cleanGalleryUrls, galleryCoverUrl } from "../form/bay-gallery";

export type LessonDraft = {
  title: string;
  summary: string;
  description: string;
  coverUrl: string;
  galleryUrls: string[];
  category: string;
  price: string;
  customTerms: string;
  audience: BayAudience;
  deadlineAt: string;
};

export type BundleDraft = {
  title: string;
  summary: string;
  coverUrl: string;
  galleryUrls: string[];
  price: string;
};

const TITLE_LIMIT = 80;
const SUMMARY_LIMIT = 200;
const DESCRIPTION_LIMIT = 4000;

function dateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? "" : at.toISOString().slice(0, 10);
}

function deadlinePayload(deadlineAt: string): string | null {
  return deadlineAt ? new Date(`${deadlineAt}T23:59:59`).toISOString() : null;
}

function audienceFromLesson(
  lesson: Pick<BayLesson, "audience_mode" | "audience_handle" | "audience_member_ids">,
): BayAudience {
  return normalizeAudience({
    mode: lesson.audience_mode || "public",
    handle: lesson.audience_handle || "",
    members: (lesson.audience_member_ids || []).map((userId) => ({ userId, name: userId })),
  });
}

export function lessonTermsWrite(draft: LessonDraft): Pick<
  BayLessonInput,
  "custom_terms" | "audience_mode" | "audience_handle" | "audience_member_ids" | "deadline_at"
> {
  const audience = draft.audience ?? emptyAudience();
  return {
    custom_terms: (draft.customTerms || "").trim() || null,
    audience_mode: audience.mode === "verified_first" ? "public" : audience.mode,
    audience_handle: audience.mode === "invited" ? audience.handle.trim() || audience.members[0]?.name || null : null,
    audience_member_ids: audience.mode === "invited" || audience.mode === "group" ? audienceMemberIds(audience) : [],
    deadline_at: deadlinePayload(draft.deadlineAt || ""),
  };
}

export function emptyLessonDraft(): LessonDraft {
  return {
    title: "",
    summary: "",
    description: "",
    coverUrl: "",
    galleryUrls: [],
    category: "",
    price: "",
    customTerms: "",
    audience: emptyAudience(),
    deadlineAt: "",
  };
}

export function emptyBundleDraft(): BundleDraft {
  return { title: "", summary: "", coverUrl: "", galleryUrls: [], price: "" };
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
  lesson: Pick<
    BayLesson,
    | "title"
    | "summary"
    | "description"
    | "cover_url"
    | "gallery_urls"
    | "category"
    | "price_fen"
    | "custom_terms"
    | "audience_mode"
    | "audience_handle"
    | "audience_member_ids"
    | "deadline_at"
  >,
  toInput: (fen: number) => string,
): LessonDraft {
  const galleryUrls = cleanGalleryUrls(lesson.gallery_urls, lesson.cover_url);
  return {
    title: lesson.title || "",
    summary: lesson.summary || "",
    description: lesson.description || "",
    coverUrl: galleryCoverUrl(galleryUrls),
    galleryUrls,
    category: lesson.category || "",
    price: toInput(lesson.price_fen || 0),
    customTerms: typeof lesson.custom_terms === "string" ? lesson.custom_terms : "",
    audience: audienceFromLesson(lesson),
    deadlineAt: dateInputValue(lesson.deadline_at),
  };
}

export function lessonPatch(
  draft: LessonDraft,
  lesson: Pick<
    BayLesson,
    | "title"
    | "summary"
    | "description"
    | "cover_url"
    | "gallery_urls"
    | "category"
    | "price_fen"
    | "custom_terms"
    | "audience_mode"
    | "audience_handle"
    | "audience_member_ids"
    | "deadline_at"
  >,
  toFen: (text: string) => number | null,
): BayLessonInput {
  const patch: BayLessonInput = {};
  if (draft.title !== (lesson.title || "")) patch.title = draft.title;
  if (draft.summary !== (lesson.summary || "")) patch.summary = draft.summary;
  if (draft.description !== (lesson.description || "")) patch.description = draft.description;
  const gallery = cleanGalleryUrls(draft.galleryUrls, draft.coverUrl).slice(0, BAY_GALLERY_MAX);
  const prevGallery = cleanGalleryUrls(lesson.gallery_urls, lesson.cover_url);
  const nextCover = galleryCoverUrl(gallery) || null;
  if (nextCover !== (lesson.cover_url || null)) patch.cover_url = nextCover;
  if (gallery.join("\0") !== prevGallery.join("\0")) patch.gallery_urls = gallery;
  if (draft.category !== (lesson.category || "")) patch.category = draft.category || null;
  const fen = toFen(draft.price);
  if (fen !== null && fen !== (lesson.price_fen || 0)) patch.price_fen = fen;
  const nextTerms = (draft.customTerms || "").trim();
  const prevTerms = typeof lesson.custom_terms === "string" ? lesson.custom_terms : "";
  if (nextTerms !== prevTerms) patch.custom_terms = nextTerms || null;
  const audience = draft.audience ?? emptyAudience();
  const prevMode = lesson.audience_mode || "public";
  const prevHandle = lesson.audience_handle || "";
  const prevMembers = [...new Set(lesson.audience_member_ids || [])].filter(Boolean);
  const nextHandle = audience.mode === "invited" ? audience.handle.trim() || audience.members[0]?.name || "" : "";
  const nextMembers = audience.mode === "invited" || audience.mode === "group" ? audienceMemberIds(audience) : [];
  if (audience.mode !== prevMode) patch.audience_mode = audience.mode;
  if (nextHandle !== prevHandle) patch.audience_handle = nextHandle || null;
  if (nextMembers.join("\0") !== prevMembers.join("\0")) patch.audience_member_ids = nextMembers;
  const nextDeadline = draft.deadlineAt || "";
  const prevDeadline = dateInputValue(lesson.deadline_at);
  if (nextDeadline !== prevDeadline) patch.deadline_at = deadlinePayload(nextDeadline);
  return patch;
}

export function lessonDraftProblems(draft: LessonDraft, toFen: (text: string) => number | null): string[] {
  const problems: string[] = [];
  if (!draft.title.trim()) problems.push("请填写标题");
  else if (draft.title.length > TITLE_LIMIT) problems.push("标题不能超过 80 个字");
  if (draft.summary.length > SUMMARY_LIMIT) problems.push("一句话简介不能超过 200 个字");
  if (draft.description.length > DESCRIPTION_LIMIT) problems.push("详细介绍不能超过 4000 个字");
  const gallery = cleanGalleryUrls(draft.galleryUrls, draft.coverUrl);
  if (!gallery.length) {
    problems.push(draft.coverUrl.trim() ? "封面图需要是 https 开头的图片地址" : "至少一张预览图");
  }
  if (!draft.category.trim()) problems.push("请选择一个站点类目");
  if (draft.price.trim() && toFen(draft.price) === null) problems.push("价格不是合法金额");
  const audience = draft.audience ?? emptyAudience();
  if (!audienceDone(audience)) problems.push("请选择要给谁看");
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
  if (!draft.title.trim()) problems.push("请填写标题");
  else if (draft.title.length > TITLE_LIMIT) problems.push("标题不能超过 80 个字");
  if (draft.summary.length > SUMMARY_LIMIT) problems.push("一句话简介不能超过 200 个字");
  const gallery = cleanGalleryUrls(draft.galleryUrls, draft.coverUrl);
  if (!gallery.length) {
    problems.push(draft.coverUrl.trim() ? "封面图需要是 https 开头的图片地址" : "至少一张预览图");
  }
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
