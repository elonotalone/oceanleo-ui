// 开发者面板的纯换算：对比、折线坐标、环形分段、商品行跳到哪。组件只负责画。
import type { BayDashboardItemKind, BayDashboardProduct, BayDashboardRange } from "../../../lib/bay/dashboard";

export type ChangeKind = "up" | "down" | "flat" | "from-zero" | "empty";

export type ChangeView = {
  kind: ChangeKind;
  label: string;
};

export type ChartPoint = {
  x: number;
  y: number;
};

export type DonutSegment = {
  start: number;
  end: number;
  share: number;
  isOther: boolean;
};

export type DonutItem = {
  title: string;
  share: number;
  income_fen: number;
  isOther: boolean;
};

export type ProductTarget =
  | { kind: "app-manage"; appId: string; tab: "feedback" | "errors" }
  | { kind: "lesson"; id: string }
  | { kind: "bundle"; id: string }
  | { kind: "service"; id: string };

export const DASHBOARD_RANGES: readonly BayDashboardRange[] = [7, 30, 90, 365];

export const DONUT_COLOR_CLASSES = [
  "text-emerald-700",
  "text-sky-700",
  "text-amber-700",
  "text-rose-700",
  "text-stone-700",
  "text-amber-800",
  "text-rose-600",
] as const;

const DONUT_LIMIT = 6;

export function changeOf(now: number, prev: number): ChangeView {
  const current = Number.isFinite(now) ? now : 0;
  const previous = Number.isFinite(prev) ? prev : 0;
  if (previous === 0 && current === 0) return { kind: "empty", label: "—" };
  if (previous === 0) return { kind: "from-zero", label: "上一段为 0" };
  const percent = Math.round(((current - previous) / Math.abs(previous)) * 100);
  if (percent > 0) return { kind: "up", label: `↑ ${percent}%` };
  if (percent < 0) return { kind: "down", label: `↓ ${Math.abs(percent)}%` };
  return { kind: "flat", label: "持平" };
}

export function chartPoints(values: number[], width: number, height: number, padding: number): ChartPoint[] {
  if (!values.length) return [];
  const innerWidth = Math.max(0, width - padding * 2);
  const innerHeight = Math.max(0, height - padding * 2);
  const max = Math.max(0, ...values.map((value) => (Number.isFinite(value) ? value : 0)));
  return values.map((raw, index) => {
    const value = Number.isFinite(raw) ? raw : 0;
    const x = values.length === 1 ? padding + innerWidth / 2 : padding + (innerWidth * index) / (values.length - 1);
    const y = max <= 0 ? padding + innerHeight : padding + innerHeight * (1 - Math.max(0, value) / max);
    return { x, y };
  });
}

export function chartHasLine(values: number[]): boolean {
  return values.some((value) => Number.isFinite(value) && value > 0);
}

export function axisDateIndices(length: number): number[] {
  if (length <= 0) return [];
  if (length === 1) return [0];
  if (length === 2) return [0, 1];
  return [0, Math.floor((length - 1) / 2), length - 1];
}

export function donutItems(products: Array<Pick<BayDashboardProduct, "title" | "share" | "income_fen">>): DonutItem[] {
  if (products.length <= DONUT_LIMIT) {
    return products.map((row) => ({ title: row.title, share: row.share, income_fen: row.income_fen, isOther: false }));
  }
  const head = products.slice(0, DONUT_LIMIT);
  const tail = products.slice(DONUT_LIMIT);
  return [
    ...head.map((row) => ({ title: row.title, share: row.share, income_fen: row.income_fen, isOther: false })),
    {
      title: "其他",
      share: tail.reduce((sum, row) => sum + (Number.isFinite(row.share) ? row.share : 0), 0),
      income_fen: tail.reduce((sum, row) => sum + (Number.isFinite(row.income_fen) ? row.income_fen : 0), 0),
      isOther: true,
    },
  ];
}

export function donutSegments(shares: number[]): DonutSegment[] {
  const cleaned = shares.map((share) => (Number.isFinite(share) && share > 0 ? share : 0));
  if (cleaned.every((share) => share === 0)) return [];
  const used = cleaned.length > DONUT_LIMIT
    ? [...cleaned.slice(0, DONUT_LIMIT), cleaned.slice(DONUT_LIMIT).reduce((sum, share) => sum + share, 0)]
    : cleaned;
  const total = used.reduce((sum, share) => sum + share, 0);
  if (total <= 0) return [];
  let cursor = 0;
  return used.map((share, index) => {
    const portion = share / total;
    const start = cursor;
    const end = cursor + portion;
    cursor = end;
    return {
      start,
      end,
      share: portion,
      isOther: cleaned.length > DONUT_LIMIT && index === used.length - 1,
    };
  });
}

export function productOpenTarget(item: Pick<BayDashboardProduct, "item_kind" | "item_id">): ProductTarget | null {
  if (item.item_kind === "app") return { kind: "app-manage", appId: item.item_id, tab: "feedback" };
  if (item.item_kind === "lesson") return { kind: "lesson", id: item.item_id };
  if (item.item_kind === "bundle") return { kind: "bundle", id: item.item_id };
  if (item.item_kind === "service" && item.item_id !== "other") return { kind: "service", id: item.item_id };
  return null;
}

export function productFeedbackTarget(appId: string): ProductTarget {
  return { kind: "app-manage", appId, tab: "feedback" };
}

export function productErrorsTarget(appId: string): ProductTarget {
  return { kind: "app-manage", appId, tab: "errors" };
}

/**
 * 商品行的「种类」列。种类名是 LeoBay 统一的五个：人工服务 / 现成文件 / 网站与软件服务 / 课程 / 其他。
 * 网关的 `service` 行同时装着人工服务、现成文件和其他；网关带了 `listing_kind` 就按它分，
 * 没带（目前如此）按人工服务。
 */
export function productKindLabel(item: Pick<BayDashboardProduct, "item_kind" | "item_id"> & { listing_kind?: string | null }): string {
  if (item.item_kind === "app") return "网站与软件服务";
  if (item.item_kind === "lesson") return "课程";
  if (item.item_kind === "bundle") return "套餐";
  if (item.item_kind === "service" && item.item_id !== "other") {
    if (item.listing_kind === "digital") return "现成文件";
    if (item.listing_kind === "other") return "其他";
    return "人工服务";
  }
  return "其他订单";
}

/** 收款状态格要的输入：只留三样，免得模型层去依赖取数那一层。 */
export type PayoutTileInput = {
  /** 网关的 `seller_ready`：收款通道是否已对卖家开放。 */
  sellerReady: boolean;
  /** 收款账户已经能收钱（网关的 `ready`）。 */
  payable: boolean;
  /** 账户状态的中文句（词表里已有）。 */
  stateLabel: string;
};

/**
 * 数据面板里「托管中」旁边那一格：值是收款现在处在哪一步，说明是「钱什么时候到账 / 为什么还不能收」。
 * 返回的是中文原句，由组件 tt()；还没取到就只给一个「—」。
 */
export function payoutTileView(status: PayoutTileInput | null): { value: string; hint: string } {
  if (!status) return { value: "—", hint: "" };
  if (!status.sellerReady) {
    return { value: "暂未开放", hint: "平台暂时不代收代付；开放后，订单款验收通过即转入你的收款账户。" };
  }
  if (status.payable) {
    return { value: status.stateLabel, hint: "订单款先托管，验收通过后转入你的收款账户。" };
  }
  return { value: status.stateLabel, hint: "收款账户还不能收款，点开看原因。" };
}

export function productStatusLabel(status: string): string {
  if (status === "published") return "已上架";
  if (status === "offline" || status === "unpublished") return "已下架";
  if (status === "draft") return "草稿";
  if (status === "hidden") return "已被平台隐藏";
  return status || "—";
}

export function productRatingLabel(avg: number, count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "—";
  const score = Number.isFinite(avg) ? avg : 0;
  return `${score.toFixed(1)}（${count}）`;
}

export function sharePercent(share: number): string {
  const value = Number.isFinite(share) ? share : 0;
  return `${Math.round(value * 100)}%`;
}

export function isAppProduct(kind: BayDashboardItemKind): boolean {
  return kind === "app";
}

export function nearestChartIndex(points: ChartPoint[], localX: number): number {
  if (!points.length) return 0;
  let best = 0;
  let bestDist = Infinity;
  for (let index = 0; index < points.length; index += 1) {
    const dist = Math.abs(points[index].x - localX);
    if (dist < bestDist) {
      bestDist = dist;
      best = index;
    }
  }
  return best;
}
