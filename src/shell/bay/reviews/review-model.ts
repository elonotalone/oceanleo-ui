import type { BayItemReview, BayItemReviewSummary, BayReviewFilter } from "../../../lib/bay/item-reviews";

export const REVIEW_FILTERS: readonly BayReviewFilter[] = ["all", "good", "mid", "bad", "photos", "followup"];

const FILTER_LABELS: Record<BayReviewFilter, string> = {
  all: "全部",
  good: "好评",
  mid: "中评",
  bad: "差评",
  photos: "有图",
  followup: "有追评",
};

export function filterCount(summary: BayItemReviewSummary, filter: BayReviewFilter): number {
  if (filter === "all") return summary.total ?? 0;
  return summary[filter] ?? 0;
}

export function filterLabel(filter: BayReviewFilter): string {
  return FILTER_LABELS[filter];
}

export function composerProblem(input: { rating: number; body: string; photos: string[] }): string | null {
  const rating = input.rating;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return "请先选星级";
  const body = input.body ?? "";
  if (rating <= 2 && body.trim().length < 5) return "差评请写明原因（至少 5 个字）";
  if (body.length > 2000) return "评价正文最多 2000 个字";
  const photos = Array.isArray(input.photos) ? input.photos : [];
  if (photos.length > 9) return "最多上传 9 张图";
  if (photos.some((url) => !String(url).trim().startsWith("https://"))) return "图片地址必须是 https:// 开头";
  return null;
}

export function followupDays(createdAt: string | null, followupAt: string | null): number | null {
  if (!createdAt || !followupAt) return null;
  const created = Date.parse(createdAt);
  const followup = Date.parse(followupAt);
  if (!Number.isFinite(created) || !Number.isFinite(followup)) return null;
  return Math.max(0, Math.floor((followup - created) / 86_400_000));
}

export function canFollowup(review: Pick<BayItemReview, "viewer_is_author" | "followup_body">): boolean {
  return Boolean(review.viewer_is_author && !review.followup_body);
}

export function canReplyReview(review: Pick<BayItemReview, "viewer_is_seller" | "seller_reply">): boolean {
  return Boolean(review.viewer_is_seller && !review.seller_reply);
}

export function canReplyFollowup(
  review: Pick<BayItemReview, "viewer_is_seller" | "followup_body" | "followup_reply">,
): boolean {
  return Boolean(review.viewer_is_seller && review.followup_body && !review.followup_reply);
}

export function canVote(review: Pick<BayItemReview, "viewer_is_author">): boolean {
  return !review.viewer_is_author;
}

export function safePhotos(urls: string[]): string[] {
  return (urls || []).map((url) => url.trim()).filter((url) => url.startsWith("https://")).slice(0, 9);
}

export function stepPhoto(index: number, total: number, delta: -1 | 1): number {
  if (total <= 0) return 0;
  return ((index + delta) % total + total) % total;
}
