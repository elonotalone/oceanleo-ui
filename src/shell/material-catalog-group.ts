import {
  MATERIAL_INDUSTRY_SUB_LABELS,
  MATERIAL_SKIN_LABELS,
  MATERIAL_SKIN_ORDER,
  materialFacetCardEntry,
  materialFacetOptions,
  sortMaterialFacetOptions,
  type MaterialFacetOption,
  type MaterialFacetRecord,
  type MaterialFacetSelection,
} from "./material-library-facets";
import type { WorkspaceLibraryEntry } from "./workspace-library-model";

/**
 * 货架的轴是「行业 × 内容」，风格是标签。
 *
 * 数据侧一件网站模板会铺成十行——同一个标题、同一套页面，只是配色不同。翻下去看到的
 * 就是同一个名字连着出现四五次。这一层把带 `group:` 的那些行收成**一张卡**：卡面是
 * `groupcover:1` 那一行，同组其余皮肤挂在卡内当切换项。
 *
 * **没有 `group:` 标签的行逐字不变，各自单独成卡。** 本波只重排网站货架；PPT、图片、
 * 音频那几类的货架必须一行一卡、标题一个字不改。这条是回归红线。
 */

export interface MaterialCatalogVariant {
  /** `skin:<键>` 的机读值。 */
  skin: string;
  /** 这一张是不是 `groupcover:1`（组封面与默认皮肤）。 */
  cover: boolean;
  record: MaterialFacetRecord;
}

export interface MaterialCatalogCard {
  /** 货架上的稳定卡键：分组卡用组键，未分组行用它自己的行身份。 */
  key: string;
  /** `group:` 的值；未分组行是空串。 */
  groupKey: string;
  grouped: boolean;
  /** 卡面默认展示的那一行。分组卡 = `groupcover:1`，未分组行 = 它自己。 */
  cover: MaterialFacetRecord;
  /** 卡内可切换的皮肤。未分组行永远是空数组（卡里不长出切换条）。 */
  variants: MaterialCatalogVariant[];
}

/** 卡内选了哪张皮肤：面板选的是全局标签，卡上点的是这一张卡的偏好。 */
export interface MaterialCatalogSkinChoice {
  /** 筛选面板选中的风格标签：有这张皮的组切过去，没有的组保持组封面。 */
  skin?: string;
  /** 用户在某张卡里点过的皮肤，键是 `groupKey`。 */
  perCard?: Readonly<Record<string, string>>;
}

const SKIN_RANK = new Map(MATERIAL_SKIN_ORDER.map((skin, index) => [skin, index]));

function groupKeyOf(record: MaterialFacetRecord): string {
  return (record.facets.group || "").trim();
}

function isGroupCover(record: MaterialFacetRecord): boolean {
  const flag = (record.facets.groupcover || "").trim();
  return flag !== "" && flag !== "0" && flag !== "false";
}

function skinOf(record: MaterialFacetRecord): string {
  return (record.facets.skin || "").trim();
}

/**
 * 一批行 → 一批卡，顺序按每组**第一次出现**的位置，因此货架的既有排序不被打乱。
 *
 * 组封面缺失（数据没写 `groupcover:1`，或写了两行）时不抛错，退回组内第一行当封面：
 * 货架宁可少一次高亮，也不能因为一行标签写歪就整屏空掉。
 */
export function materialCatalogCards(
  records: readonly MaterialFacetRecord[],
): MaterialCatalogCard[] {
  const cards: MaterialCatalogCard[] = [];
  const groupIndex = new Map<string, number>();
  records.forEach((record, index) => {
    const groupKey = groupKeyOf(record);
    if (!groupKey) {
      cards.push({
        key: `row:${index}:${record.entry.id}`,
        groupKey: "",
        grouped: false,
        cover: record,
        variants: [],
      });
      return;
    }
    const seen = groupIndex.get(groupKey);
    const variant: MaterialCatalogVariant = {
      skin: skinOf(record),
      cover: isGroupCover(record),
      record,
    };
    if (seen === undefined) {
      groupIndex.set(groupKey, cards.length);
      cards.push({
        key: `group:${groupKey}`,
        groupKey,
        grouped: true,
        cover: record,
        variants: [variant],
      });
      return;
    }
    const card = cards[seen];
    card.variants.push(variant);
    if (variant.cover && !isGroupCover(card.cover)) card.cover = record;
  });
  for (const card of cards) {
    if (!card.grouped) continue;
    const bySkin = new Map<string, MaterialCatalogVariant>();
    for (const variant of card.variants) {
      if (!variant.skin || bySkin.has(variant.skin)) continue;
      bySkin.set(variant.skin, variant);
    }
    card.variants = [...bySkin.values()].sort((left, right) => {
      const leftRank = SKIN_RANK.get(left.skin) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = SKIN_RANK.get(right.skin) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank || left.skin.localeCompare(right.skin);
    });
  }
  return cards;
}

/** 这张卡实际有哪几种皮肤（10 种里的子集）。未分组行返回空数组。 */
export function materialCatalogCardSkins(card: MaterialCatalogCard): string[] {
  return card.variants.map((variant) => variant.skin);
}

/** 卡面此刻该显示哪张皮肤：卡内点过的 > 面板选的（该组有才算） > 组封面。 */
export function materialCatalogActiveSkin(
  card: MaterialCatalogCard,
  choice: MaterialCatalogSkinChoice = {},
): string {
  if (!card.grouped) return skinOf(card.cover);
  const skins = new Set(materialCatalogCardSkins(card));
  const picked = choice.perCard?.[card.groupKey];
  if (picked && skins.has(picked)) return picked;
  const tagged = choice.skin;
  if (tagged && skins.has(tagged)) return tagged;
  return skinOf(card.cover);
}

/** 卡面此刻代表的那一行（点开、封面图都跟着它走）。 */
export function materialCatalogActiveRecord(
  card: MaterialCatalogCard,
  choice: MaterialCatalogSkinChoice = {},
): MaterialFacetRecord {
  if (!card.grouped) return card.cover;
  const skin = materialCatalogActiveSkin(card, choice);
  return (
    card.variants.find((variant) => variant.skin === skin)?.record || card.cover
  );
}

/**
 * 风格是**标签不是分类**：面板选中一种风格时，不把没有这张皮的组筛掉，而是把有这张
 * 皮的组切过去。所以这里的 `skin` 只对**未分组的旧行**生效——那些行今天就是靠
 * `skin` 筛的，行为必须逐字不变。
 */
export function materialCatalogCardMatches(
  card: MaterialCatalogCard,
  selection: MaterialFacetSelection,
): boolean {
  const facets = card.cover.facets;
  if (selection.industry && facets.industry !== selection.industry) return false;
  if (selection.sub && facets.sub !== selection.sub) return false;
  if (selection.shape && facets.shape !== selection.shape) return false;
  if (selection.skin && !card.grouped && facets.skin !== selection.skin) {
    return false;
  }
  return true;
}

/**
 * 筛选项的数字按**组数**，不是行数。「行业：专业服务 (24)」说的是 24 张卡，
 * 分组之前它是 120 行——那个数字把用户骗到一个根本翻不完的屏。
 */
export function materialCatalogFacetOptions(
  cards: readonly MaterialCatalogCard[],
  key: "industry" | "sub" | "shape" | "skin",
  labels: Readonly<Record<string, string>>,
  order: readonly string[] = [],
): MaterialFacetOption[] {
  if (key !== "skin") {
    return materialFacetOptions(
      cards.map((card) => card.cover),
      key,
      labels,
      order,
    );
  }
  // 一张卡带 10 张皮肤时，10 个风格标签各 +1：这个数字回答的是「有多少件东西能做成
  // 这个风格」，而不是「有多少行是这个风格」。
  const counts = new Map<string, number>();
  for (const card of cards) {
    const skins = card.grouped
      ? materialCatalogCardSkins(card)
      : [skinOf(card.cover)].filter(Boolean);
    for (const skin of new Set(skins)) {
      counts.set(skin, (counts.get(skin) || 0) + 1);
    }
  }
  return sortMaterialFacetOptions(
    [...counts].map(([value, count]) => ({
      value,
      label: labels[value] || value,
      count,
    })),
    order,
  );
}

function disambiguated(title: string, suffix: string): string {
  if (!suffix || title.includes(suffix)) return title;
  return `${title} · ${suffix}`;
}

/**
 * 卡片列表 → 货架条目。**同一个标题不许在货架上出现两次**：这是这一波要消掉的毛病
 * 本身，所以它是这里的硬约束而不是「顺带的好事」。
 *
 * 撞名时只改分组卡（未分组行逐字不变是回归红线）：先补子类名，仍然撞就补组键——
 * 组键天然唯一，所以这个链条一定收敛。
 */
export function materialCatalogEntries(
  cards: readonly MaterialCatalogCard[],
  choice: MaterialCatalogSkinChoice = {},
): WorkspaceLibraryEntry[] {
  const entries = cards.map((card) =>
    materialFacetCardEntry(materialCatalogActiveRecord(card, choice), {
      grouped: card.grouped,
    }),
  );
  const titles = entries.map((entry) => entry.title);
  const collide = (values: readonly string[]) => {
    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
    return counts;
  };
  let counts = collide(titles);
  cards.forEach((card, index) => {
    if (!card.grouped || (counts.get(titles[index]) || 0) < 2) return;
    const sub = card.cover.facets.sub || "";
    titles[index] = disambiguated(
      titles[index],
      MATERIAL_INDUSTRY_SUB_LABELS[sub] || sub,
    );
  });
  counts = collide(titles);
  cards.forEach((card, index) => {
    if (!card.grouped || (counts.get(titles[index]) || 0) < 2) return;
    titles[index] = disambiguated(titles[index], card.groupKey);
  });
  return entries.map((entry, index) =>
    entry.title === titles[index] ? entry : { ...entry, title: titles[index] },
  );
}

/** 卡内切换条的一格。展示词走 `MATERIAL_SKIN_LABELS`，不在组件里硬编中文。 */
export interface MaterialCatalogSkinChip {
  skin: string;
  label: string;
  selected: boolean;
  cover: boolean;
}

export function materialCatalogSkinChips(
  card: MaterialCatalogCard,
  choice: MaterialCatalogSkinChoice = {},
): MaterialCatalogSkinChip[] {
  if (!card.grouped || card.variants.length < 2) return [];
  const active = materialCatalogActiveSkin(card, choice);
  return card.variants.map((variant) => ({
    skin: variant.skin,
    label: MATERIAL_SKIN_LABELS[variant.skin] || variant.skin,
    selected: variant.skin === active,
    cover: variant.cover,
  }));
}
