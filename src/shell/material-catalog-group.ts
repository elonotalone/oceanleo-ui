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
 * 数据侧一件网站模板会铺成十行——同一个标题、同一个页数，翻下去看到的就是同一个名字
 * 连着出现四五次。这一层把带 `group:` 的那些行收成**一张卡**：卡面是 `groupcover:1`
 * 那一行，同组其余各行挂在卡内当「换一个版本」的切换项。
 *
 * 同组的多行**不是同一件东西的几种配色**：`tpl:` 实测 500 行有 499 个不同值，
 * 且有 15/403 组内部出现重复皮肤，所以它们是同一「行业子类 × 内容形态 × 页数」下
 * 各自独立的模板版本。因此**变体的身份是「行」而不是「皮肤」**——按皮肤去重会把
 * 重复皮肤的那些版本整行丢掉。`skin:` 只继续充当筛选标签。
 *
 * **没有 `group:` 标签的行逐字不变，各自单独成卡。** 本波只重排网站货架；PPT、图片、
 * 音频那几类的货架必须一行一卡、标题一个字不改。这条是回归红线。
 */

export interface MaterialCatalogVariant {
  /** 这一版在组里的稳定身份：模板键 `tpl:` 优先，缺了退回行 id。 */
  key: string;
  /** `skin:<键>` 的机读值。只用于筛选标签，不是这一版的身份。 */
  skin: string;
  /** 这一版是不是 `groupcover:1`（组封面与默认版本）。 */
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
  /** 卡内可切换的版本，组封面排第一。未分组行永远是空数组（卡里不长出切换条）。 */
  variants: MaterialCatalogVariant[];
}

/** 卡面展示哪一版：面板选的是全局标签，卡上点的是这一张卡的偏好。 */
export interface MaterialCatalogVariantChoice {
  /** 筛选面板选中的风格标签：有这张皮的组切过去，没有的组保持组封面。 */
  skin?: string;
  /** 用户在某张卡里点过的那一版，键是 `groupKey`，值是 `MaterialCatalogVariant.key`。 */
  perCard?: Readonly<Record<string, string>>;
}

const SKIN_RANK = new Map<string, number>(
  MATERIAL_SKIN_ORDER.map((skin, index) => [skin, index]),
);

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

function variantKeyOf(record: MaterialFacetRecord): string {
  return (record.facets.tpl || "").trim() || String(record.entry.id);
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
      key: variantKeyOf(record),
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
    // 组封面排第一（它就是「版本 1」），其余保持数据里的行序：这一层不重排版本，
    // 哪一行当封面是数据侧的裁定（`W01` 按实测皮肤分布 → 皮肤键 → position → id 定）。
    const cover = card.variants.filter((variant) => variant.record === card.cover);
    const rest = card.variants.filter((variant) => variant.record !== card.cover);
    card.variants = [...cover, ...rest];
  }
  return cards;
}

/** 这张卡实际有哪几种皮肤（10 种里的子集，去重后按声明序）。未分组行返回空数组。 */
export function materialCatalogCardSkins(card: MaterialCatalogCard): string[] {
  const skins = new Set<string>();
  for (const variant of card.variants) {
    if (variant.skin) skins.add(variant.skin);
  }
  return [...skins].sort((left, right) => {
    const leftRank = SKIN_RANK.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = SKIN_RANK.get(right) ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank || left.localeCompare(right);
  });
}

/**
 * 卡面此刻是哪一版：卡内点过的 > 面板选中的风格（该组有才算） > 组封面。
 *
 * 面板那一路只按 `skin` 找**第一版**匹配的：风格是标签，它回答的是「这一件也能做成
 * 这个风格」，不是「这一件有几版」。
 */
export function materialCatalogActiveVariant(
  card: MaterialCatalogCard,
  choice: MaterialCatalogVariantChoice = {},
): MaterialCatalogVariant | null {
  if (!card.grouped || card.variants.length === 0) return null;
  const picked = choice.perCard?.[card.groupKey];
  const byKey = picked
    ? card.variants.find((variant) => variant.key === picked)
    : undefined;
  if (byKey) return byKey;
  const tagged = choice.skin
    ? card.variants.find((variant) => variant.skin === choice.skin)
    : undefined;
  if (tagged) return tagged;
  return card.variants.find((variant) => variant.cover) || card.variants[0];
}

/** 卡面此刻显示的那张皮肤。筛选面板与计数用它，卡内切换的身份不是它。 */
export function materialCatalogActiveSkin(
  card: MaterialCatalogCard,
  choice: MaterialCatalogVariantChoice = {},
): string {
  const variant = materialCatalogActiveVariant(card, choice);
  return variant ? variant.skin : skinOf(card.cover);
}

/** 卡面此刻代表的那一行（点开、封面图都跟着它走）。 */
export function materialCatalogActiveRecord(
  card: MaterialCatalogCard,
  choice: MaterialCatalogVariantChoice = {},
): MaterialFacetRecord {
  return materialCatalogActiveVariant(card, choice)?.record || card.cover;
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
  choice: MaterialCatalogVariantChoice = {},
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

/**
 * 卡内切换条的一格 =「这一件的第 n 个版本」。
 *
 * 这里**不出中文**：序号交给组件走 i18n 拼成文案，`skinLabel` 只是给读者的一句附注
 * （悬停/无障碍说明里用），既不是这一版的名字，也不代表「换个配色」。
 */
export interface MaterialCatalogVariantChip {
  key: string;
  /** 第几版，从 1 起。 */
  ordinal: number;
  skin: string;
  skinLabel: string;
  selected: boolean;
  cover: boolean;
}

/** 只有一版的组不长切换条：一颗孤零零的按钮只会让人以为还有别的可点。 */
export function materialCatalogVariantChips(
  card: MaterialCatalogCard,
  choice: MaterialCatalogVariantChoice = {},
): MaterialCatalogVariantChip[] {
  if (!card.grouped || card.variants.length < 2) return [];
  const active = materialCatalogActiveVariant(card, choice);
  return card.variants.map((variant, index) => ({
    key: variant.key,
    ordinal: index + 1,
    skin: variant.skin,
    skinLabel: MATERIAL_SKIN_LABELS[variant.skin] || variant.skin,
    selected: variant === active,
    cover: variant.cover,
  }));
}
