// 新件置顶。列表本身来自网关 `/v1/assets/library/search`
//（按 quality_score → created_at → id），本仓改不了那个顺序。
//
// 每个文档分区最多把 3 件提到网格最前。按标题前缀 / source 钉：
//   - 简历：OLR-0001 / OLR-0002 / OLR-0003
//   - 尽调：`#证监会公告〔2022〕36号` / `35号`
//   - 流程架构图 / 长图海报 / 电商详情：按约定 source 取前三
//   - 合同 / 诉讼 / 律师：不钉具体 id。货还没入库时匹配不到就跳过。
//
// 钉位配置来自 document-zones.ts，避免两处各写一份。

import { DOCUMENT_ZONES } from "./document-zones";

export const SHELF_PIN_LIMIT = 3;

export const WASH_PIN_CATEGORIES = DOCUMENT_ZONES.map((zone) => zone.category);

export type WashPinCategory = (typeof WASH_PIN_CATEGORIES)[number];

export type ShelfPinMatcher = {
  titlePrefix?: string;
  ossKeyIncludes?: string;
  source?: string;
};

export type Pinnable = {
  id: string;
  title?: string;
  source?: string;
  oss_key?: string;
};

export function normalizeLibraryId(id: string): string {
  const raw = (id || "").trim();
  if (!raw) return "";
  return raw.startsWith("library:") ? raw.slice("library:".length) : raw;
}

export function libraryPrefixedId(id: string): string {
  const normalized = normalizeLibraryId(id);
  return normalized ? `library:${normalized}` : "";
}

export function matchersFor(category: string): ShelfPinMatcher[] {
  const zone = DOCUMENT_ZONES.find((item) => item.category === category);
  if (!zone) return [];
  if (zone.pinTitlePrefixes && zone.pinTitlePrefixes.length > 0) {
    return zone.pinTitlePrefixes.slice(0, SHELF_PIN_LIMIT).map((titlePrefix) => ({
      titlePrefix,
    }));
  }
  if (zone.pinSource) {
    return Array.from({ length: SHELF_PIN_LIMIT }, () => ({ source: zone.pinSource }));
  }
  return [];
}

export function itemMatchesPin(item: Pinnable, matcher: ShelfPinMatcher): boolean {
  let any = false;
  if (matcher.titlePrefix) {
    any = true;
    if (!(item.title || "").startsWith(matcher.titlePrefix)) return false;
  }
  if (matcher.ossKeyIncludes) {
    any = true;
    if (!(item.oss_key || "").includes(matcher.ossKeyIncludes)) return false;
  }
  if (matcher.source) {
    any = true;
    if (item.source !== matcher.source) return false;
  }
  return any;
}

/** 纯函数：按 matcher 顺序钉在最前，缺件的槽跳过，其余保持原序。 */
export function applyMatcherPins<T extends Pinnable>(
  items: T[],
  matchers: ShelfPinMatcher[],
  extras: T[] = [],
): T[] {
  if (!matchers.length) return items;
  const pool = [...extras, ...items];
  const used = new Set<string>();
  const head: T[] = [];
  for (const matcher of matchers) {
    if (head.length >= SHELF_PIN_LIMIT) break;
    const hit = pool.find((item) => {
      const id = normalizeLibraryId(item.id);
      return id && !used.has(id) && itemMatchesPin(item, matcher);
    });
    if (!hit) continue;
    used.add(normalizeLibraryId(hit.id));
    head.push(hit);
  }
  const rest = items.filter((item) => !used.has(normalizeLibraryId(item.id)));
  return [...head, ...rest];
}

export async function attachShelfPins<T extends Pinnable>(opts: {
  category: string;
  page: number;
  items: T[];
  searchPinned?: (matcher: ShelfPinMatcher) => Promise<T>;
}): Promise<T[]> {
  const matchers = matchersFor(opts.category);
  if (!matchers.length) return opts.items;
  if (opts.page > 1) {
    // 第 2 页只滤掉「按标题/oss_key 钉死的那几件」，避免它们再次出现。
    // 按 source 整类提前的不在这里滤 —— 那一类可能超过 3 件，后面的还要能翻到。
    const specific = matchers.filter((matcher) => matcher.titlePrefix || matcher.ossKeyIncludes);
    if (!specific.length) return opts.items;
    return opts.items.filter((item) => !specific.some((matcher) => itemMatchesPin(item, matcher)));
  }
  const extras: T[] = [];
  if (opts.searchPinned) {
    for (const matcher of matchers) {
      if (!matcher.titlePrefix && !matcher.ossKeyIncludes) continue;
      if ([...extras, ...opts.items].some((item) => itemMatchesPin(item, matcher))) continue;
      try {
        extras.push(await opts.searchPinned(matcher));
      } catch {
        // 件还没入库或网关暂不可用：这个槽跳过，不许拿别的件顶上。
      }
    }
  }
  return applyMatcherPins(opts.items, matchers, extras);
}

/** 旧的按 id 钉法还留着给纯函数测试用；活配置不再写 uuid。 */
export function applyShelfPins<T extends { id: string }>(
  items: T[],
  pinnedIds: string[],
  extras: T[] = [],
): T[] {
  if (!pinnedIds.length) return items;
  const pinSet = new Set(pinnedIds.map(normalizeLibraryId));
  const byId = new Map<string, T>();
  for (const item of [...extras, ...items]) {
    const normalized = normalizeLibraryId(item.id);
    if (normalized && !byId.has(normalized)) byId.set(normalized, item);
  }
  const head: T[] = [];
  for (const id of pinnedIds.map(normalizeLibraryId)) {
    const item = byId.get(id);
    if (item) head.push(item);
  }
  const rest = items.filter((item) => !pinSet.has(normalizeLibraryId(item.id)));
  return [...head, ...rest];
}
