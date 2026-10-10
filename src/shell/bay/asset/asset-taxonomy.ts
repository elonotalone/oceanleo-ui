// 素材库目录树：面板键 = platform_assets.category，二级 tab ∈ scene_tags。
// 面板以后端 /library/categories 的真实目录为准，手写表只补中文名 / 图标 / 二级 tab。
// 从 asset 站 lib/assets.ts 原样搬来，类型改成 BayAssetType。

import type { BayAssetType } from "./library-client";

export interface CategorySub {
  /** 机器键（= scene_tags 里的二级 tab 键） */
  key: string;
  /** 中文 tab 名 */
  label: string;
}

export interface CategoryPanel {
  /** 面板机器键（= platform_assets.category） */
  key: string;
  /** 面板中文名 */
  label: string;
  /** 面板图标 emoji（纯装饰） */
  icon: string;
  type: BayAssetType;
  /** 二级 tab；首项恒为「全部」(key="") 表示该面板不按二级 tab 过滤 */
  subs: CategorySub[];
}

const ALL_SUB: CategorySub = { key: "", label: "全部" };

export const PPT_INDUSTRIES: CategorySub[] = [
  { key: "ind-edu", label: "教育培训" },
  { key: "ind-academic", label: "学术科研" },
  { key: "ind-medical", label: "医疗健康" },
  { key: "ind-finance", label: "金融投资" },
  { key: "ind-tech", label: "科技互联网" },
  { key: "ind-biz", label: "商务通用" },
  { key: "ind-marketing", label: "市场营销" },
  { key: "ind-food", label: "餐饮美食" },
  { key: "ind-travel", label: "文旅酒店" },
  { key: "ind-estate", label: "地产建筑" },
  { key: "ind-mfg", label: "制造工业" },
  { key: "ind-agri", label: "农业环保" },
  { key: "ind-law", label: "法律政务" },
  { key: "ind-media", label: "媒体创意" },
  { key: "ind-retail", label: "零售电商" },
  { key: "ind-life", label: "生活服务" },
  { key: "ind-culture", label: "文化艺术" },
  { key: "ind-hr", label: "人力组织" },
];

export const CATEGORY_PANELS: CategoryPanel[] = [
  {
    key: "hot", label: "热门", icon: "🔥", type: "sticker",
    subs: [ALL_SUB, { key: "heart", label: "爱心" }, { key: "star", label: "星星" },
      { key: "megaphone", label: "喇叭" }, { key: "magnifier", label: "放大镜" },
      { key: "number", label: "数字" }, { key: "money", label: "钱" },
      { key: "phone", label: "手机电话" }],
  },
  {
    key: "xhs", label: "小红书", icon: "📕", type: "sticker",
    subs: [ALL_SUB, { key: "featured", label: "精选" }, { key: "emoji", label: "emoji符号" },
      { key: "metoo-pet", label: "猫狗梗图" }, { key: "memo", label: "手帐备忘录" }],
  },
  {
    key: "symbol", label: "符号", icon: "✓", type: "sticker",
    subs: [ALL_SUB, { key: "check-cross", label: "圈叉勾" },
      { key: "punctuation", label: "标点符号" }, { key: "arrow", label: "箭头" }],
  },
  {
    key: "festival", label: "节日", icon: "🎉", type: "sticker",
    subs: [ALL_SUB, { key: "jieqi", label: "二十四节气" }, { key: "summer", label: "夏日" },
      { key: "qixi", label: "七夕" }, { key: "teacher", label: "教师节" },
      { key: "national", label: "国庆节" }, { key: "midautumn", label: "中秋节" },
      { key: "double11", label: "双11" }, { key: "christmas", label: "圣诞节" },
      { key: "newyear", label: "元旦节" }],
  },
  {
    key: "industry", label: "行业", icon: "🏢", type: "sticker",
    subs: [ALL_SUB, { key: "education", label: "教育" }, { key: "ecommerce", label: "电商" },
      { key: "travel", label: "旅游" }, { key: "baby", label: "母婴" },
      { key: "home", label: "家居" }, { key: "finance", label: "金融" },
      { key: "medical", label: "医疗" }],
  },
  {
    key: "flat-illust", label: "扁平插画", icon: "🖼", type: "vector",
    subs: [ALL_SUB, { key: "featured", label: "精选" }, { key: "people", label: "人物" },
      { key: "animal-plant", label: "动植物" }, { key: "transport", label: "交通" },
      { key: "building", label: "建筑" }, { key: "furniture", label: "家具" },
      { key: "chart", label: "图表" }, { key: "entertainment", label: "文娱" },
      { key: "life", label: "生活" }, { key: "prop", label: "道具" },
      { key: "scene", label: "场景" }],
  },
  { key: "element-3d", label: "3D元素", icon: "🧊", type: "sticker", subs: [ALL_SUB] },
  {
    key: "guofeng", label: "国风水墨", icon: "🀄", type: "sticker",
    subs: [ALL_SUB, { key: "ink-element", label: "水墨元素" },
      { key: "guochao-element", label: "国潮元素" }, { key: "ink-bg", label: "水墨背景" }],
  },
  {
    key: "texture-style", label: "肌理风格", icon: "🎨", type: "sticker",
    subs: [ALL_SUB, { key: "inflate", label: "膨胀风" }, { key: "clay", label: "粘土风" },
      { key: "glass", label: "玻璃风" }, { key: "fluffy", label: "毛绒风" },
      { key: "gilt", label: "鎏金风" }, { key: "particle", label: "粒子风" },
      { key: "torn-paper", label: "撕纸风" }, { key: "crayon", label: "蜡笔风" }],
  },
  {
    key: "sticker-dyn", label: "动态贴纸", icon: "✨", type: "sticker",
    subs: [ALL_SUB, { key: "featured", label: "精选" }, { key: "emoji-pack", label: "表情包" },
      { key: "fruit", label: "水果" }, { key: "promo-text", label: "促销文字" },
      { key: "simple-deco", label: "简约装饰" }, { key: "people", label: "人物" },
      { key: "action", label: "动作" }, { key: "animal", label: "动物" }],
  },
  { key: "art-text", label: "艺术字", icon: "🅰", type: "font", subs: [ALL_SUB] },
  {
    key: "nature", label: "自然", icon: "🌿", type: "sticker",
    subs: [ALL_SUB, { key: "moon-star", label: "星月" }, { key: "sun", label: "太阳" },
      { key: "cloud", label: "云朵" }, { key: "flower", label: "花" },
      { key: "grass", label: "草" }, { key: "tree", label: "树" },
      { key: "mountain-river", label: "山河" }, { key: "lake-sea", label: "湖海" }],
  },
  {
    key: "people", label: "人物", icon: "🧑", type: "sticker",
    subs: [ALL_SUB, { key: "child", label: "儿童" }, { key: "elder", label: "老人" },
      { key: "woman", label: "女士" }, { key: "man", label: "男士" },
      { key: "occupation", label: "职业" }],
  },
  {
    key: "animal", label: "动物", icon: "🐾", type: "sticker",
    subs: [ALL_SUB, { key: "cat", label: "猫" }, { key: "dog", label: "狗" },
      { key: "snake", label: "蛇" }, { key: "horse", label: "马" },
      { key: "sheep", label: "羊" }, { key: "monkey", label: "猴" },
      { key: "chicken", label: "鸡" }, { key: "pig", label: "猪" },
      { key: "mouse", label: "鼠" }, { key: "ox", label: "牛" }, { key: "tiger", label: "虎" }],
  },
  {
    key: "food", label: "美食", icon: "🍔", type: "image",
    subs: [ALL_SUB, { key: "fruit", label: "水果" }, { key: "vegetable", label: "蔬菜" },
      { key: "chinese-dish", label: "中式料理" }, { key: "foreign-dish", label: "外国料理" },
      { key: "drink", label: "饮料酒水" }, { key: "dessert", label: "蛋糕甜品" },
      { key: "meat-egg", label: "肉类蛋禽" }, { key: "seasoning", label: "调味蘸料" }],
  },
  { key: "city", label: "城市建筑", icon: "🏙", type: "image", subs: [ALL_SUB] },
  {
    key: "transport", label: "交通工具", icon: "🚗", type: "sticker",
    subs: [ALL_SUB, { key: "element", label: "立体交通" }, { key: "photo", label: "交通摄影" }],
  },
  { key: "brush", label: "色块笔刷", icon: "🖌", type: "sticker", subs: [ALL_SUB] },
  { key: "life-photo", label: "生活晒照", icon: "📸", type: "sticker", subs: [ALL_SUB] },
  { key: "face-cover", label: "挡脸元素", icon: "🙈", type: "sticker", subs: [ALL_SUB] },
  { key: "gesture", label: "热门手势", icon: "👍", type: "sticker", subs: [ALL_SUB] },
  {
    key: "icon", label: "icon图标", icon: "🔧", type: "vector",
    subs: [ALL_SUB, { key: "featured", label: "精选" }, { key: "people", label: "人物" },
      { key: "ecommerce", label: "电商" }, { key: "app", label: "手机App" },
      { key: "internet", label: "互联网" }, { key: "gesture", label: "手势" },
      { key: "animal", label: "动物" }, { key: "weather", label: "天气" },
      { key: "food", label: "美食" }, { key: "daily", label: "日用品" },
      { key: "biz-finance", label: "商务金融" }, { key: "baby", label: "母婴育儿" },
      { key: "entertainment", label: "娱乐" }, { key: "beauty", label: "美妆" },
      { key: "fashion", label: "服饰箱包" }, { key: "appliance", label: "电器" },
      { key: "tool", label: "工具" }, { key: "device", label: "电子产品" },
      { key: "sport", label: "运动" }, { key: "medical", label: "医疗" },
      { key: "transport", label: "交通" }, { key: "eco", label: "环保" },
      { key: "building", label: "建筑" }, { key: "edu", label: "教培" },
      { key: "line", label: "线性" }, { key: "color", label: "彩色" },
      { key: "justice", label: "司法" }, { key: "safety", label: "消防安全" },
      { key: "charity", label: "慈善公益" }],
  },
  {
    key: "background", label: "背景", icon: "🎴", type: "image",
    subs: [ALL_SUB, { key: "gradient", label: "渐变背景" }, { key: "texture", label: "纹理背景" },
      { key: "festive", label: "节日背景" }, { key: "fresh", label: "清新背景" }],
  },
  { key: "portrait", label: "人像", icon: "🧑", type: "prompt", subs: [ALL_SUB] },
  { key: "landscape", label: "风景", icon: "🏞", type: "prompt", subs: [ALL_SUB] },
  { key: "fantasy", label: "奇幻", icon: "🧙", type: "prompt", subs: [ALL_SUB] },
  { key: "anime", label: "二次元", icon: "🎌", type: "prompt", subs: [ALL_SUB] },
  { key: "architecture", label: "建筑", icon: "🏛", type: "prompt", subs: [ALL_SUB] },
  { key: "product", label: "静物产品", icon: "📦", type: "prompt", subs: [ALL_SUB] },
  { key: "animal", label: "动物", icon: "🐾", type: "prompt", subs: [ALL_SUB] },
  { key: "abstract", label: "抽象艺术", icon: "🎨", type: "prompt", subs: [ALL_SUB] },
  { key: "interior", label: "室内", icon: "🛋", type: "prompt", subs: [ALL_SUB] },
  { key: "vehicle", label: "载具", icon: "🚗", type: "prompt", subs: [ALL_SUB] },
  { key: "legal-contract-model", label: "合同区", icon: "📜", type: "document", subs: [ALL_SUB] },
  { key: "legal-diligence", label: "尽职调查区", icon: "🔎", type: "document", subs: [ALL_SUB] },
  { key: "legal-litigation-form", label: "诉讼文书区", icon: "⚖", type: "document", subs: [ALL_SUB] },
  { key: "legal-lawyer-template", label: "律师文书区", icon: "📝", type: "document", subs: [ALL_SUB] },
  { key: "resume-template", label: "简历区", icon: "👤", type: "document", subs: [ALL_SUB] },
  { key: "document-template", label: "通用模板", icon: "📄", type: "document", subs: [ALL_SUB] },
  { key: "flowchart-diagram", label: "流程架构图区", icon: "🔀", type: "ppt", subs: [ALL_SUB] },
  { key: "longform-poster", label: "长图海报区", icon: "🖼", type: "image", subs: [ALL_SUB] },
  { key: "ecommerce-detail", label: "电商详情区", icon: "🛒", type: "image", subs: [ALL_SUB] },
];

export function panelByKey(key: string): CategoryPanel | undefined {
  return CATEGORY_PANELS.find((panel) => panel.key === key);
}

const CATEGORY_LABELS: Record<string, string> = {
  model: "3D 模型",
  hdri: "HDRI 环境",
  texture: "材质纹理",
  "mus-festive": "节日音乐",
  "mus-upbeat": "欢快音乐",
  "mus-relax": "轻松音乐",
  "mus-emotional": "情感音乐",
  "mus-electronic": "电子音乐",
  "mus-corporate": "商务音乐",
  "sfx-transition": "转场音效",
  "sfx-applause": "掌声欢呼",
  "sfx-ui": "界面音效",
  "sfx-nature": "自然音效",
  "sfx-coin": "金币音效",
  abstract: "抽象",
  fitness: "健身",
  clouds: "云朵",
  flowers: "花卉",
  flowers2: "花卉",
  food: "美食",
  light: "光效",
  nature: "自然",
  "vid-nature": "自然",
  city: "城市",
  "vid-city": "城市",
  festival: "节日",
  "vid-festive": "节日",
  ocean: "海洋",
  business: "商务",
  "vid-business": "商务",
  water: "水",
  "vid-tech": "科技",
  tech: "科技",
  particles: "粒子",
  "vid-particle": "粒子",
  smoke: "烟雾",
  travel2: "旅行",
  celebration: "庆祝",
  background: "背景",
  wedding: "婚礼",
  beauty: "美妆",
  ecommerce: "电商",
  finance: "金融",
  pet: "宠物",
  medical: "医疗",
  fashion: "服饰",
  education: "教育",
  travel: "旅行",
  realestate: "房产",
  kids: "儿童",
  music: "音乐现场",
  office: "办公",
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬",
  gaming: "电竞",
  coffee: "咖啡",
  icon: "icon 图标",
  "flat-illust": "扁平插画",
  symbol: "符号",
  "sticker-dyn": "动态贴纸",
  shape: "形状",
  ornament: "装饰花纹",
  "ecommerce-svg": "电商矢量",
  "party-vec": "派对庆祝",
  "medal-svg": "奖牌徽章",
  home: "家居",
  baby: "母婴",
  emoji: "emoji 贴纸",
  hot: "热门",
  xhs: "小红书",
  guofeng: "国风水墨",
  "art-text": "艺术字",
  pie: "饼图",
  bar: "柱状图",
  line: "折线图",
  area: "面积图",
  scatter: "散点图",
  radar: "雷达图",
  funnel: "漏斗图",
  gauge: "仪表盘",
  "legal-contract-model": "合同区",
  "legal-diligence": "尽职调查区",
  "legal-litigation-form": "诉讼文书区",
  "legal-lawyer-template": "律师文书区",
  "resume-template": "简历区",
  "document-template": "通用模板",
  "flowchart-diagram": "流程架构图区",
  "longform-poster": "长图海报区",
  "ecommerce-detail": "电商详情区",
  etching: "蚀刻编辑风",
  editorial: "杂志编辑风",
  pixel: "像素复古风",
  vellum: "水墨留白风",
  dossier: "档案复古风",
  whiteboard: "白板手绘风",
  sketch: "手账涂鸦风",
  glamour: "奢华金黑风",
  amber: "暖调剪纸风",
  arctic: "极简科技风",
  cerulean: "天空极简风",
  cobalt: "商务3D风",
  emerald: "自然环保风",
  basalt: "日式极简风",
  mist: "灰雾建筑风",
  onyx: "暗黑哲思风",
  sand: "医疗插画风",
  neon: "赛博霓虹风",
  linen: "铅笔淡彩风",
  alabaster: "黑白商务风",
  patina: "岩画原始风",
  quartz: "航天留白风",
  mahogany: "竞速光影风",
  ginkgo: "金箔典雅风",
  sunset: "落日剪影风",
  lavender: "暮紫柔和风",
  bauhaus: "包豪斯几何风",
  blueprint: "工程蓝图风",
  terrazzo: "水磨石生活风",
  aurora: "极光深空风",
  riso: "孔版印刷风",
  ukiyo: "浮世绘和风",
  gazette: "旧报纸网点风",
  botany: "古典博物风",
  memphis: "孟菲斯撞色风",
  noir: "黑色电影风",
  meridian: "古典航海图风",
  portrait: "人像",
  landscape: "风景",
  fantasy: "奇幻",
  anime: "二次元",
  architecture: "建筑",
  product: "静物产品",
  animal: "动物",
  interior: "室内",
  vehicle: "载具",
};

export function categoryLabel(key: string): string {
  const panel = panelByKey(key);
  if (panel) return panel.label;
  if (CATEGORY_LABELS[key]) return CATEGORY_LABELS[key];
  const stripped = key.replace(/^(ind|bg|ph|vid|mus|sfx)-/, "");
  return CATEGORY_LABELS[stripped] || stripped;
}

export function buildPanelsFromCategories(
  type: BayAssetType,
  categories: string[],
): CategoryPanel[] {
  const present = new Set(categories);
  const toPanel = (key: string): CategoryPanel => {
    const cfg = panelByKey(key);
    const matched = Boolean(cfg && cfg.type === type);
    return {
      key,
      label: categoryLabel(key),
      icon: matched && cfg ? cfg.icon : "",
      type,
      subs: matched && cfg && cfg.subs.length > 1 ? cfg.subs : [ALL_SUB],
    };
  };
  const curatedKeys = CATEGORY_PANELS.filter(
    (panel) => panel.type === type && present.has(panel.key),
  ).map((panel) => panel.key);
  const seen = new Set(curatedKeys);
  const restKeys = categories.filter((key) => !seen.has(key));
  return [...curatedKeys, ...restKeys].map(toPanel);
}
