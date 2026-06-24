// ============================================================================
// @oceanleo/ui — 全家桶「二元分类器」（单一事实源，doctrine v7 2026-06-24）
// ----------------------------------------------------------------------------
// 操作员要求：网站 / app / skill 的分类太乱、维度不清。统一成**两个正交维度**，
// 任何条目都同时落在两个维度里，由用户在浏览页用「分类方式」切换看法：
//
//   1) 按行业（industry）：自媒体 / 金融 / 法律 / 互联网 / 科研 / 教育 /
//      健康医疗 / 生活服务 / 影视 / 通用工具 / 其它
//   2) 按内容类型（content）：文档 / 表格 / 演示 / 图像 / 视频 / 音频 / 3D /
//      网页 / 数据 / 对话 / 其它
//
// 映射来源：每个条目自带的 `category`（旧分区 id）+ `site_id`（产品站 id）。
// 这里把它们规整到上面两套稳定的枚举上。规则保持「简单、可解释、可扩展」——
// 新站 / 新 app 只需补一行映射，浏览页零改动。
// ============================================================================

export type IndustryId =
  | "all"
  | "media" // 自媒体
  | "finance" // 金融
  | "law" // 法律
  | "internet" // 互联网
  | "research" // 科研
  | "education" // 教育
  | "health" // 健康医疗
  | "life" // 生活服务
  | "film" // 影视
  | "tools" // 通用工具
  | "other"; // 其它

export type ContentId =
  | "all"
  | "doc" // 文档
  | "sheet" // 表格
  | "slide" // 演示
  | "image" // 图像
  | "video" // 视频
  | "audio" // 音频
  | "threed" // 3D
  | "web" // 网页
  | "data" // 数据
  | "chat" // 对话
  | "other"; // 其它

export interface TaxonomyOption {
  id: string;
  label: string;
  icon: string;
}

// 行业维度（含「全部」在最前）。顺序 = 浏览页展示顺序。
export const INDUSTRIES: TaxonomyOption[] = [
  { id: "all", label: "全部", icon: "✦" },
  { id: "media", label: "自媒体", icon: "📣" },
  { id: "finance", label: "金融", icon: "💰" },
  { id: "law", label: "法律", icon: "⚖️" },
  { id: "internet", label: "互联网", icon: "🌐" },
  { id: "research", label: "科研", icon: "🔬" },
  { id: "education", label: "教育", icon: "🎓" },
  { id: "health", label: "健康医疗", icon: "🩺" },
  { id: "life", label: "生活服务", icon: "🛎️" },
  { id: "film", label: "影视", icon: "🎬" },
  { id: "tools", label: "通用工具", icon: "🧰" },
  { id: "other", label: "其它", icon: "🗂️" },
];

// 内容类型维度（含「全部」在最前）。
export const CONTENTS: TaxonomyOption[] = [
  { id: "all", label: "全部", icon: "✦" },
  { id: "doc", label: "文档", icon: "📄" },
  { id: "sheet", label: "表格", icon: "📊" },
  { id: "slide", label: "演示", icon: "📑" },
  { id: "image", label: "图像", icon: "🖼️" },
  { id: "video", label: "视频", icon: "🎞️" },
  { id: "audio", label: "音乐", icon: "🎵" },
  { id: "threed", label: "3D", icon: "🧊" },
  { id: "web", label: "网页", icon: "🧩" },
  { id: "data", label: "数据", icon: "🗃️" },
  { id: "chat", label: "对话", icon: "💬" },
  { id: "other", label: "其它", icon: "🗂️" },
];

// site_id → 行业。覆盖到具体产品站，未列出的回退到 category 推断、再回退 "other"。
const SITE_INDUSTRY: Record<string, IndustryId> = {
  image: "media",
  video: "film",
  music: "film",
  aihuman: "media",
  threed: "film",
  ecommerce: "life",
  design: "media",
  make: "life",
  logo: "media",
  interior: "life",
  ppt: "tools",
  word: "tools",
  excel: "tools",
  converter: "tools",
  resume: "life",
  bizdev: "internet",
  meeting: "tools",
  paper: "research",
  law: "law",
  study: "education",
  novel: "media",
  script: "film",
  money: "finance",
  search: "tools",
  chat: "tools",
  website: "internet",
  agent: "tools",
  crm: "internet",
  asset: "media",
  // 开源行业站（Track F）。
  wiki: "tools",
  helpdesk: "life",
  bi: "finance",
  marketing: "media",
  recruit: "life",
  forms: "tools",
  status: "internet",
  code: "internet",
};

// site_id → 内容类型。
const SITE_CONTENT: Record<string, ContentId> = {
  image: "image",
  video: "video",
  music: "audio",
  aihuman: "video",
  threed: "threed",
  ecommerce: "image",
  design: "image",
  make: "image",
  logo: "image",
  interior: "image",
  ppt: "slide",
  word: "doc",
  excel: "sheet",
  converter: "doc",
  resume: "doc",
  bizdev: "doc",
  meeting: "doc",
  paper: "doc",
  law: "doc",
  study: "doc",
  novel: "doc",
  script: "doc",
  money: "data",
  search: "chat",
  chat: "chat",
  website: "web",
  agent: "chat",
  crm: "data",
  asset: "image",
  // 开源行业站（Track F）。
  wiki: "doc",
  helpdesk: "chat",
  bi: "data",
  marketing: "data",
  recruit: "doc",
  forms: "data",
  status: "data",
  code: "web",
};

// 旧 category（agents 表 / leo_sites 表里的分区 id）→ 行业 / 内容，作为 site 未命中
// 时的二级回退。category 词表见 lib/sites（主站）/ AgentExplorer（旧分区名）。
const CATEGORY_INDUSTRY: Record<string, IndustryId> = {
  media: "media",
  office: "tools",
  design: "media",
  search: "tools",
  audio: "film",
  agent: "internet",
  money: "finance",
  discover: "tools",
};

const CATEGORY_CONTENT: Record<string, ContentId> = {
  media: "image",
  office: "doc",
  design: "image",
  search: "chat",
  audio: "audio",
  agent: "chat",
  money: "data",
  discover: "web",
};

// ── skill（LeoSkill，site_id="agent"）专用分类映射（操作员 2026-06-24）──────────
// 全部 143 个 skill 物理上 site_id 都是 "agent"。若按 SITE_INDUSTRY["agent"]="tools"
// 一刀切，则所有 skill 都挤进「通用工具 / 对话」一个桶里——这正是「skill 没有分类好」
// 的根因（playground / 各站 skill 目录全堆一起）。skill 自带一套丰富的 `category`
// （技术工程 / 内容创作 / 营销增长 …18 类，见 agents 表）。这里把这 18 类各自映射到
// 稳定的「行业 / 内容」二维，使 skill 能像 app 一样被正确分桶、筛选。
const SKILL_CAT = "agent"; // skill 的 site_id
const SKILL_INDUSTRY: Record<string, IndustryId> = {
  技术工程: "internet",
  内容创作: "media",
  营销增长: "media",
  金融投资: "finance",
  销售商务: "internet",
  运营人力: "life",
  产品设计: "media",
  数据智能: "internet",
  生活服务: "life",
  学术教育: "education",
  电商零售: "life",
  法律行政: "law",
  一人公司: "internet",
  文档办公: "tools",
  腾讯专区: "internet",
  游戏空间: "film",
  客户服务: "life",
  项目管理: "tools",
};
const SKILL_CONTENT: Record<string, ContentId> = {
  技术工程: "web",
  内容创作: "doc",
  营销增长: "data",
  金融投资: "data",
  销售商务: "chat",
  运营人力: "doc",
  产品设计: "image",
  数据智能: "data",
  生活服务: "chat",
  学术教育: "doc",
  电商零售: "image",
  法律行政: "doc",
  一人公司: "chat",
  文档办公: "doc",
  腾讯专区: "chat",
  游戏空间: "threed",
  客户服务: "chat",
  项目管理: "data",
};

export interface TaxonomyInput {
  site_id?: string;
  category?: string;
}

/** 把任意条目（带 site_id / category）映射到行业 id。 */
export function industryOf(item: TaxonomyInput): IndustryId {
  const s = (item.site_id || "").trim();
  const c = (item.category || "").trim();
  // skill：优先用它自带的丰富 category（绝不一刀切到 "agent" 的单一行业）。
  if (s === SKILL_CAT && c && SKILL_INDUSTRY[c]) return SKILL_INDUSTRY[c];
  if (s && SITE_INDUSTRY[s]) return SITE_INDUSTRY[s];
  if (c && CATEGORY_INDUSTRY[c]) return CATEGORY_INDUSTRY[c];
  return "other";
}

/** 把任意条目（带 site_id / category）映射到内容类型 id。 */
export function contentOf(item: TaxonomyInput): ContentId {
  const s = (item.site_id || "").trim();
  const c = (item.category || "").trim();
  if (s === SKILL_CAT && c && SKILL_CONTENT[c]) return SKILL_CONTENT[c];
  if (s && SITE_CONTENT[s]) return SITE_CONTENT[s];
  if (c && CATEGORY_CONTENT[c]) return CATEGORY_CONTENT[c];
  return "other";
}

// "native" = 用条目自带的原始 `category`（如 skill 的「技术工程 / 内容创作」18 类）
// 直接分桶，保留作者既定的细粒度分类。skill 目录默认用它（操作员 2026-06-24：
// 「需要按类型分类的，分类本身已完成好，只是没显示好」——就是要回到原生分类）。
export type TaxonomyMode = "industry" | "content" | "native";

/** 按当前分类维度取条目的归属 id。native 直接取原始 category（空→"other"）。 */
export function classify(item: TaxonomyInput, mode: TaxonomyMode): string {
  if (mode === "native") return (item.category || "").trim() || "other";
  return mode === "industry" ? industryOf(item) : contentOf(item);
}

/**
 * 当前维度的可选项（含「全部」）。native 维度的分类是数据驱动的（运行时从条目集合
 * 提取），不是固定枚举，故由 AppDirectory 用 nativeOptions() 现算；这里 native 只
 * 返回「全部」占位，真实 chips 由调用方补齐。
 */
export function optionsFor(mode: TaxonomyMode): TaxonomyOption[] {
  if (mode === "native") return [{ id: "all", label: "全部", icon: "✦" }];
  return mode === "industry" ? INDUSTRIES : CONTENTS;
}

/** 从一组条目里提取 native 分类 chips（按出现顺序，「全部」恒在最前）。 */
export function nativeOptions(items: TaxonomyInput[]): TaxonomyOption[] {
  const seen: string[] = [];
  for (const it of items) {
    const c = (it.category || "").trim() || "其它";
    if (!seen.includes(c)) seen.push(c);
  }
  return [{ id: "all", label: "全部", icon: "✦" }, ...seen.map((c) => ({ id: c, label: c, icon: "▪" }))];
}

/** id → 展示名（找不到回退 id 本身）。 */
export function labelFor(mode: TaxonomyMode, id: string): string {
  if (mode === "native") return id;
  const opt = optionsFor(mode).find((o) => o.id === id);
  return opt?.label || id;
}

// ============================================================================
// 站点 → 相关 skill 分类（操作员 2026-06-24）
// ----------------------------------------------------------------------------
// 「把已有 skill 放到合适的 oceanleo 系列网站里」+「各站也能切 app/skill」。
// 全部 143 个 skill 物理上仍属 LeoSkill（site_id="agent"，单一事实源不破坏），
// 这里只声明**每个产品站该展示哪些 skill 分类**——产品站的工作台多一个「skill」
// 视图，按这张表过滤 LeoSkill 的 skill 列表展示、点开即去 LeoSkill 对应 skill 开聊。
//
// skill 的 category 取值（agents 表，site_id="agent"）：技术工程 / 内容创作 /
// 营销增长 / 金融投资 / 销售商务 / 运营人力 / 产品设计 / 数据智能 / 生活服务 /
// 学术教育 / 电商零售 / 法律行政 / 一人公司 / 文档办公 / 腾讯专区 / 游戏空间 /
// 客户服务 / 项目管理。
//
// 新站只需补一行；未列出的站回退到「按内容类型相近」推断（relatedSkillCategories）。
// ============================================================================
const SITE_SKILL_CATEGORIES: Record<string, string[]> = {
  image: ["内容创作", "产品设计", "营销增长"],
  video: ["内容创作", "营销增长"],
  music: ["内容创作", "游戏空间"],
  aihuman: ["内容创作", "营销增长"],
  threed: ["产品设计", "游戏空间"],
  ecommerce: ["电商零售", "营销增长", "销售商务"],
  design: ["产品设计", "内容创作"],
  make: ["产品设计", "生活服务"],
  logo: ["产品设计", "营销增长"],
  interior: ["产品设计", "生活服务"],
  ppt: ["文档办公", "销售商务", "内容创作"],
  word: ["文档办公", "内容创作"],
  excel: ["文档办公", "数据智能"],
  converter: ["文档办公"],
  resume: ["运营人力", "文档办公"],
  bizdev: ["销售商务", "营销增长", "一人公司"],
  meeting: ["文档办公", "项目管理"],
  paper: ["学术教育", "数据智能"],
  law: ["法律行政"],
  study: ["学术教育"],
  novel: ["内容创作"],
  script: ["内容创作", "游戏空间"],
  money: ["金融投资", "数据智能"],
  search: ["数据智能", "技术工程"],
  chat: ["客户服务", "运营人力"],
  website: ["技术工程", "产品设计"],
  // 主站全家桶聚合站可展示全部，故不在这里限制（传 [] 表示不过滤）。
};

// 内容类型 → 兜底相关 skill 分类（站没在上表时用）。
const CONTENT_SKILL_FALLBACK: Record<string, string[]> = {
  image: ["内容创作", "产品设计"],
  video: ["内容创作"],
  audio: ["内容创作"],
  threed: ["产品设计"],
  doc: ["文档办公", "内容创作"],
  sheet: ["数据智能", "文档办公"],
  slide: ["文档办公", "内容创作"],
  web: ["技术工程"],
  data: ["数据智能"],
  chat: ["客户服务"],
};

/**
 * 一个产品站该展示哪些 skill 分类。返回空数组 = 不过滤（展示全部 skill，主站用）。
 * 返回非空 = 只展示这些 category 的 skill。
 */
export function relatedSkillCategories(siteId?: string): string[] {
  const s = (siteId || "").trim();
  if (!s) return [];
  if (SITE_SKILL_CATEGORIES[s]) return SITE_SKILL_CATEGORIES[s];
  // 兜底：按站的内容类型推断。
  const c = SITE_CONTENT[s];
  if (c && CONTENT_SKILL_FALLBACK[c]) return CONTENT_SKILL_FALLBACK[c];
  return [];
}
