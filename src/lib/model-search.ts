/** Strip set for §11 step 5: whitespace plus `. - _ · ( ) （ ） [ ]`. */
const STRIP_CHARS = /[\s.\-_·()（）[\]]/g;

export const PROVIDER_DISPLAY_ORDER: readonly string[] = [
  "bailian",
  "volcano",
  "tencent",
  "baidu",
  "alibaba_intl",
  "deepinfra",
  "openrouter",
  "azure",
  "tripo",
  "stability",
  "openai",
  "anthropic",
];

export type CheckedAgoUnit = "minute" | "hour" | "day";

export interface CheckedAgo {
  n: number;
  unit: CheckedAgoUnit;
}

export interface SearchableModel {
  id?: string;
  label?: string;
  provider_label?: string;
}

export interface OfferModel extends SearchableModel {
  key: string;
  id: string;
  provider: string;
  label: string;
  category?: string;
  status?: string;
  selectable?: boolean;
}

export interface OfferGroup<T extends OfferModel = OfferModel> {
  canonical: string;
  label: string;
  category: string;
  offers: T[];
}

export interface SelectableModel {
  provider?: string;
  status?: string;
  selectable?: boolean;
}

/** §11 `canonical(name)` — must stay byte-equivalent with the backend helper. */
export function canonical(name: string): string {
  let value = String(name ?? "").toLowerCase().trim();
  if (value.startsWith("~")) value = value.slice(1);
  const slash = value.lastIndexOf("/");
  if (slash >= 0) value = value.slice(slash + 1);
  const colon = value.indexOf(":");
  if (colon >= 0) value = value.slice(0, colon);
  return value.replace(STRIP_CHARS, "");
}

/** §11 `squash(text)`: lowercase, trim, then the same strip set. */
export function squash(text: string): string {
  return String(text ?? "").toLowerCase().trim().replace(STRIP_CHARS, "");
}

/** Hit iff `canonical(query)` is a substring of any of the four §11 haystacks. */
export function matchesModel(query: string, model: SearchableModel): boolean {
  const needle = canonical(query);
  if (!needle) return false;
  return [
    canonical(model.id || ""),
    canonical(model.label || ""),
    squash(model.id || ""),
    squash(model.provider_label || ""),
  ].some((haystack) => haystack.includes(needle));
}

function providerRank(provider: string, providerOrder: readonly string[]): number {
  const index = providerOrder.indexOf(provider);
  return index < 0 ? providerOrder.length : index;
}

/**
 * Merge offers that share `canonical(id)`. Group label is the first vendor
 * after sorting by the fixed §1 display order.
 */
export function groupOffers<T extends OfferModel>(
  models: T[],
  providerOrder: readonly string[] = PROVIDER_DISPLAY_ORDER,
): OfferGroup<T>[] {
  const groups = new Map<string, OfferGroup<T>>();
  for (const model of models) {
    const key = canonical(model.id);
    const existing = groups.get(key);
    if (existing) {
      existing.offers.push(model);
      continue;
    }
    groups.set(key, {
      canonical: key,
      label: model.label,
      category: model.category || "",
      offers: [model],
    });
  }
  const result: OfferGroup<T>[] = [];
  for (const group of groups.values()) {
    group.offers.sort((left, right) => {
      const delta =
        providerRank(left.provider, providerOrder)
        - providerRank(right.provider, providerOrder);
      if (delta !== 0) return delta;
      return left.key.localeCompare(right.key);
    });
    const first = group.offers[0];
    if (first) {
      group.label = first.label;
      if (!group.category) group.category = first.category || "";
    }
    result.push(group);
  }
  return result;
}

/**
 * §7 front-end rule: selectable, or BYOK-only when this user already stored
 * that vendor's key. Missing fields (old gateway) stay selectable.
 */
export function canSelect(
  model: SelectableModel,
  byokProviders: readonly string[] = [],
): boolean {
  if (model.status === "byok_only") {
    return byokProviders.includes(model.provider || "");
  }
  if (model.selectable === true) return true;
  if (model.selectable === false) return false;
  return !model.status || model.status === "available";
}

export function checkedAgo(
  iso: string,
  now: Date | number | string = new Date(),
): CheckedAgo {
  const then = new Date(iso).getTime();
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(then) || !Number.isFinite(nowMs)) {
    return { n: 0, unit: "minute" };
  }
  const minutes = Math.max(0, Math.floor((nowMs - then) / 60_000));
  if (minutes < 60) return { n: minutes, unit: "minute" };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { n: hours, unit: "hour" };
  return { n: Math.floor(hours / 24), unit: "day" };
}
