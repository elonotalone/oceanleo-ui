// 课程栏卡片上的价格、评分、套餐省多少。纯函数，测试直接 import。
import type { BayLessonBundle } from "../../../lib/bay/lessons";

/** 0（或无效）写「免费」；否则交给仓里现有的金额格式化函数。 */
export function lessonPriceLabel(priceFen: number, format: (fen: number) => string): string {
  if (!Number.isFinite(priceFen) || priceFen <= 0) return "免费";
  return format(priceFen);
}

/** 没有评价时不展示；有则「★ 4.8（23）」，平均分一位小数。 */
export function ratingLabel(avg: number, count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  const score = Number.isFinite(avg) ? avg : 0;
  return `★ ${score.toFixed(1)}（${count}）`;
}

/** 单买合计减套餐价；负数当 0。 */
export function bundleSaving(bundle: Pick<BayLessonBundle, "price_fen" | "lessons_total_fen">): number {
  const total = Number.isFinite(bundle.lessons_total_fen) ? Number(bundle.lessons_total_fen) : 0;
  const price = Number.isFinite(bundle.price_fen) ? Number(bundle.price_fen) : 0;
  return Math.max(0, total - price);
}
