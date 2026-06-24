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

export interface TaxonomyInput {
  site_id?: string;
  category?: string;
}

/** 把任意条目（带 site_id / category）映射到行业 id。 */
export function industryOf(item: TaxonomyInput): IndustryId {
  const s = (item.site_id || "").trim();
  if (s && SITE_INDUSTRY[s]) return SITE_INDUSTRY[s];
  const c = (item.category || "").trim();
  if (c && CATEGORY_INDUSTRY[c]) return CATEGORY_INDUSTRY[c];
  return "other";
}

/** 把任意条目（带 site_id / category）映射到内容类型 id。 */
export function contentOf(item: TaxonomyInput): ContentId {
  const s = (item.site_id || "").trim();
  if (s && SITE_CONTENT[s]) return SITE_CONTENT[s];
  const c = (item.category || "").trim();
  if (c && CATEGORY_CONTENT[c]) return CATEGORY_CONTENT[c];
  return "other";
}

export type TaxonomyMode = "industry" | "content";

/** 按当前分类维度取条目的归属 id。 */
export function classify(item: TaxonomyInput, mode: TaxonomyMode): string {
  return mode === "industry" ? industryOf(item) : contentOf(item);
}

/** 当前维度的可选项（含「全部」）。 */
export function optionsFor(mode: TaxonomyMode): TaxonomyOption[] {
  return mode === "industry" ? INDUSTRIES : CONTENTS;
}

/** id → 展示名（找不到回退 id 本身）。 */
export function labelFor(mode: TaxonomyMode, id: string): string {
  const opt = optionsFor(mode).find((o) => o.id === id);
  return opt?.label || id;
}
