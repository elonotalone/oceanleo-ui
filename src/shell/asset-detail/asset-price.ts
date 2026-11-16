import type { AssetActionContext } from "./types";

/** null stays unavailable; a missing price must never become a free claim. */
export function assetPriceText(context: Pick<AssetActionContext, "commerce">, locale: string, tt: (key: string) => string): string | null {
  const price = context.commerce;
  if (!price) return null;
  if (price.priceFen === null || !Number.isSafeInteger(price.priceFen) || price.priceFen < 0) return tt("价格暂不可用");
  if (price.free && price.priceFen === 0) return tt("免费");
  return new Intl.NumberFormat(locale, { style: "currency", currency: price.currency }).format(price.priceFen / 100);
}

