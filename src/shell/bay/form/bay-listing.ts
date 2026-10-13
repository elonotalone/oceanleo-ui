export type BayListingIntent = "sell" | "buy";
export type BayOfferKind = "digital" | "service" | "app" | "lesson";

export const BAY_OFFER_OPTIONS: { id: BayOfferKind; label: string }[] = [
  { id: "digital", label: "现成文件" },
  { id: "service", label: "人工服务" },
  { id: "app", label: "作品" },
  { id: "lesson", label: "课程" },
];

/** 买方「交付给你的是什么」里，「作品」那一格换成这个说法。 */
export const BAY_OFFER_BUY_APP_LABEL = "网站与软件服务";

export const LISTING_SECTION_LABELS = {
  product: "产品信息",
  price: "价格",
  audience: "向谁展示",
  offer: "你交付什么",
  offerBuy: "交付给你的是什么",
  terms: "交付条款",
} as const;

export const BAY_CATEGORY_LABEL = "分类";
export const BAY_FILES_LABEL = "放文件";

export function offerKindLabel(kind: BayOfferKind): string {
  return BAY_OFFER_OPTIONS.find((row) => row.id === kind)?.label || "现成文件";
}

export function listingKindForOffer(kind: BayOfferKind): "digital" | "service" {
  return kind === "service" ? "service" : "digital";
}

export function offerFromListing(value: string | null | undefined): BayOfferKind {
  if (value === "service" || value === "app" || value === "lesson") return value;
  return "digital";
}
