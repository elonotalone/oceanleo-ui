import type { WorkspaceLibraryEntry } from "./workspace-library-model";

/**
 * Website 官方模板写进 `tags[]` 的稳定机读维度。标签前部的中文展示词不参与解析；
 * 它们可以改文案，而这里的键值是货架筛选合同。
 */
export const MATERIAL_FACET_KEYS = [
  "industry",
  "sub",
  "color",
  "layout",
  "tpl",
  "shape",
  "skin",
] as const;

export type MaterialFacetKey = (typeof MATERIAL_FACET_KEYS)[number];
export type MaterialFacets = Record<MaterialFacetKey, string | null>;

export interface MaterialFacetSelection {
  industry: string;
  sub: string;
  shape: string;
  skin: string;
}

export interface MaterialFacetOption {
  value: string;
  label: string;
  count: number;
}

export interface MaterialFacetRecord {
  entry: WorkspaceLibraryEntry;
  facets: MaterialFacets;
}

export const EMPTY_MATERIAL_FACET_SELECTION: MaterialFacetSelection = {
  industry: "",
  sub: "",
  shape: "",
  skin: "",
};

const FACET_KEY_SET = new Set<string>(MATERIAL_FACET_KEYS);

export const MATERIAL_INDUSTRY_ORDER = [
  "media",
  "business",
  "fashion",
  "org",
  "tech",
  "life",
  "food",
  "industry",
  "home",
  "grocery",
  "hardware",
  "logistics",
  "general",
] as const;

export const MATERIAL_SHAPE_ORDER = ["s3", "s4", "s5", "s6"] as const;

export const MATERIAL_SKIN_ORDER = [
  "paper",
  "editorial",
  "bento",
  "brutalist",
  "neon",
  "fullscreen",
  "nature",
  "sand",
  "navy",
  "glass",
] as const;

/**
 * 行业与 105 个子类的中文名来自 asset 的模板分类单一事实源。这里只复制展示名，
 * 匹配仍只认 facet value；绝不拿响应里会变化的中文标签反推机器键。
 */
export const MATERIAL_INDUSTRY_SUB_LABELS: Readonly<Record<string, string>> = {
  media: "传媒/广告/营销策划",
  "culture-media": "文化传媒",
  "ad-design": "广告设计",
  "pr-consulting": "公关顾问",
  "brand-planning": "品牌策划",
  "gift-custom": "礼品定制",
  exhibition: "展会服务",
  printing: "印刷包装",
  business: "金融/地产/商业服务",
  finance: "金融服务",
  investment: "投资咨询",
  loan: "理财贷款",
  realestate: "房地产开发",
  registration: "工商注册",
  accounting: "财务会计",
  trademark: "商标专利",
  law: "法律/律师",
  guarantee: "投资担保",
  pawn: "典当拍卖",
  fashion: "服装/饰品/美容护肤",
  womenswear: "女装",
  menswear: "男装",
  kidswear: "童装",
  maternity: "母婴用品",
  shoes: "鞋靴",
  bags: "箱包",
  jewelry: "珠宝",
  glasses: "眼镜",
  watches: "钟表",
  hairsalon: "美容美发",
  nails: "美甲美睫",
  makeup: "美妆彩妆",
  slimming: "纤体瘦身",
  "medical-beauty": "医学美容",
  org: "教育/政府/组织机构",
  school: "学校",
  training: "培训机构",
  government: "政府机关单位",
  association: "协会",
  chamber: "商会",
  tech: "IT/互联网/科技行业",
  "web-build": "网站建设",
  internet: "互联网行业",
  "tech-company": "科技公司",
  life: "婚庆/摄影/生活服务",
  wedding: "婚庆公司",
  bridal: "婚纱",
  photography: "写真",
  cleaning: "家庭保洁",
  "car-care": "汽车保养",
  "photo-print": "快照冲印",
  moving: "搬家公司",
  pets: "宠物",
  flowers: "鲜花",
  food: "餐饮/酒店/旅游服务",
  fastfood: "小吃快餐",
  hotpot: "火锅",
  western: "西餐",
  "japanese-korean": "日韩料理",
  bakery: "面包甜点",
  bbq: "烧烤/海鲜自助",
  farmstay: "农家乐",
  resort: "休闲度假",
  hotel: "宾馆酒店",
  "travel-agency": "旅行社",
  "local-tour": "周边游",
  visa: "出境游/签证服务",
  industry: "化工/环保/农林牧渔",
  "chem-material": "建筑/化工材料",
  textile: "纺织辅料",
  "rubber-plastic": "橡胶塑料",
  metallurgy: "冶金矿产",
  recycling: "环保回收",
  farming: "农作物种植",
  feed: "畜禽饲料",
  garden: "园林花卉",
  home: "数码/家具/家居百货",
  digital: "电脑及数码",
  appliance: "生活电器",
  phone: "手机及配件",
  furniture: "家私家具",
  kitchenware: "餐饮/厨房用品",
  decor: "家居软饰",
  bedding: "床上用品",
  towel: "毛巾巾类",
  lighting: "灯具灯饰",
  grocery: "食品/茶酒/医药保健",
  "fruit-veg": "蔬果",
  snacks: "零食",
  specialty: "特产",
  tea: "茶叶",
  baijiu: "酒类（白酒）",
  wine: "红酒",
  hospital: "医院",
  pharmacy: "药店",
  dental: "口腔齿科",
  hardware: "五金/设备/汽车服务",
  handles: "拉手类",
  windows: "门窗类",
  bathroom: "卫浴类",
  machinery: "机械设备",
  instruments: "仪器器材",
  firesafety: "消防防盗",
  electrical: "电气配件",
  surveillance: "监控器材",
  auto: "汽车",
  logistics: "物流/租赁/商业贸易",
  freight: "货运物流",
  express: "快递",
  "house-rent": "房屋租赁",
  "car-rent": "汽车租赁",
  "export-trade": "出口贸易",
  general: "通用行业",
  enterprise: "通用企业",
  mall: "通用商城",
  personal: "个人主页",
  landing: "活动单页",
  others: "其它",
};

export const MATERIAL_SHAPE_LABELS: Readonly<Record<string, string>> = {
  s3: "3页",
  s4: "4页",
  s5: "5页",
  s6: "6页",
};

export const MATERIAL_SKIN_LABELS: Readonly<Record<string, string>> = {
  paper: "素白",
  editorial: "杂志",
  bento: "便当",
  brutalist: "粗野",
  neon: "霓虹",
  fullscreen: "全屏叙事",
  nature: "自然",
  sand: "暖砂",
  navy: "深蓝",
  glass: "玻璃",
};

function emptyMaterialFacets(): MaterialFacets {
  return {
    industry: null,
    sub: null,
    color: null,
    layout: null,
    tpl: null,
    shape: null,
    skin: null,
  };
}

/** 与上架解析器一致：只认第一个合法键前缀，不看中文展示词。 */
export function parseMaterialFacets(tags: readonly unknown[] | undefined): MaterialFacets {
  const facets = emptyMaterialFacets();
  for (const raw of tags || []) {
    const tag = String(raw);
    const at = tag.indexOf(":");
    if (at <= 0) continue;
    const key = tag.slice(0, at);
    if (!FACET_KEY_SET.has(key)) continue;
    const facetKey = key as MaterialFacetKey;
    if (facets[facetKey] === null) facets[facetKey] = tag.slice(at + 1);
  }
  return facets;
}

export function materialFacetRecords(
  entries: readonly WorkspaceLibraryEntry[],
): MaterialFacetRecord[] {
  return entries.map((entry) => ({
    entry,
    facets: parseMaterialFacets(entry.keywords),
  }));
}

export function materialFacetSelectionActive(
  selection: MaterialFacetSelection,
): boolean {
  return Boolean(
    selection.industry || selection.sub || selection.shape || selection.skin,
  );
}

export function materialFacetRecordMatches(
  record: MaterialFacetRecord,
  selection: MaterialFacetSelection,
): boolean {
  return (Object.keys(selection) as (keyof MaterialFacetSelection)[]).every(
    (key) => !selection[key] || record.facets[key] === selection[key],
  );
}

export function materialFacetOptions(
  records: readonly MaterialFacetRecord[],
  key: "industry" | "sub" | "shape" | "skin",
  labels: Readonly<Record<string, string>>,
  order: readonly string[] = [],
): MaterialFacetOption[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    const value = record.facets[key];
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  }
  const rank = new Map(order.map((value, index) => [value, index]));
  return [...counts].map(([value, count]) => ({
    value,
    label: labels[value] || value,
    count,
  })).sort((left, right) => {
    const leftRank = rank.get(left.value) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = rank.get(right.value) ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank || left.label.localeCompare(right.label, "zh-CN");
  });
}

/** 页数与外观直接进入网格卡标题；无新 facet 的旧行逐字不变。 */
export function materialFacetCardEntry(
  record: MaterialFacetRecord,
): WorkspaceLibraryEntry {
  const shape = record.facets.shape
    ? MATERIAL_SHAPE_LABELS[record.facets.shape] || record.facets.shape
    : "";
  const skin = record.facets.skin
    ? MATERIAL_SKIN_LABELS[record.facets.skin] || record.facets.skin
    : "";
  const detail = [shape, skin].filter(Boolean).join(" · ");
  return detail
    ? { ...record.entry, title: `${record.entry.title} · ${detail}` }
    : record.entry;
}
