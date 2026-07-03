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
//
// 2026-07-03 重分类：操作员反馈「agent 分类不对，重新分」。agent（site_id="agent"，
// 143 个专家）的「按内容 / 按行业」映射重做——旧映射多处贴错标签、分布失衡。详见下方
// SKILL_CONTENT / SKILL_INDUSTRY 的注释与逐类理由。app / 站点的媒介类型枚举
// （CONTENTS）与其映射（SITE_CONTENT）不变——那一套对「产出真实媒介」的功能站是对的。
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

// ── agent（LeoAgent，site_id="agent"）专用分类映射（重分类 2026-07-03）───────────
// 全部 143 个 agent 物理上 site_id 都是 "agent"。若按 SITE_INDUSTRY["agent"]="tools"
// 一刀切，则所有 agent 都挤进「通用工具 / 对话」一个桶里——这正是「agent 没有分类好」
// 的根因（playground / 各站 agent 目录全堆一起）。agent 自带一套丰富的 `category`
// （技术工程 / 内容创作 / 营销增长 …18 类，见 agents 表）。这里把这 18 类各自映射到
// 稳定的「行业 / 内容」二维，使 agent 能像 app 一样被正确分桶、筛选。
//
// 2026-07-03 重分类：操作员反馈「agent 分类不对，重新分」。旧「按内容」映射把很多
// 类贴错标签、且分布严重失衡：
//   - 游戏空间→3D（游戏专家产出的是策划/叙事/文案，不是 3D 模型）
//   - 营销增长→数据（营销专家产出的是文案/campaign，按增长指标口径归到「数据」更贴切，
//     但旧值本意是「营销=数据」缺乏解释）
//   - 电商零售→图像、产品设计→图像（多数成员产出文档，只有 UI/主图 是图像）
//   - 生活服务→对话、一人公司→对话、销售商务→对话（行程/BP/标书是文档，不是纯对话）
//   - 腾讯专区→对话（这是「厂商」桶而非内容类型，成员多是云/小程序/安全=技术）
// 重分类原则：按**该类专家最有辨识度的产出物**落到「内容类型」媒介轴上（不是笼统
// 地「都在写字→全塞 doc」），使 6 个内容桶（doc/web/data/video/image/chat）都有量、
// 且每一条映射都能单独讲清楚。MECE：18 个原生类 → 各自唯一内容桶，合计覆盖全部 143。
const SKILL_CAT = "agent"; // agent 的 site_id
const SKILL_INDUSTRY: Record<string, IndustryId> = {
  技术工程: "internet", // 全栈/前后端/运维/安全/AI 工程 → 互联网
  内容创作: "media", // 文案/短视频/播客/翻译 → 自媒体
  营销增长: "media", // SEO/社媒/广告/品牌 → 自媒体
  金融投资: "finance", // 投研/财务/理财/合规 → 金融
  销售商务: "internet", // B2B/大客户/标书/谈判（企业业务）→ 互联网
  运营人力: "tools", // HR/运营/OKR/行政（企业职能）→ 通用工具（旧 life 不贴切）
  产品设计: "internet", // 产品/PRD/UX/交互（产品工程）→ 互联网（旧 media 不贴切）
  数据智能: "internet", // 数据分析/BI/AB/ML → 互联网
  生活服务: "life", // 旅行/健身/膳食/生活百事 → 生活服务
  学术教育: "education", // 论文/学习/留学/学位 → 教育
  电商零售: "life", // 店铺/选品/详情/跨境零售 → 生活服务
  法律行政: "law", // 法律/合同/政策/知产 → 法律
  一人公司: "internet", // 一人创业/BP/IP/副业（数字创业）→ 互联网
  文档办公: "tools", // PPT/报告/表格/邮件/简历 → 通用工具
  腾讯专区: "internet", // 云/小程序/企微/广告/安全（多为技术）→ 互联网
  游戏空间: "film", // 游戏策划/叙事/美术/电竞（泛娱乐）→ 影视
  客户服务: "tools", // 客服/投诉/质检/售后（企业职能）→ 通用工具（旧 life 不贴切）
  项目管理: "tools", // 项目/敏捷/PMO/看板 → 通用工具
};
const SKILL_CONTENT: Record<string, ContentId> = {
  技术工程: "web", // 产出代码/应用/服务 → 网页(应用)
  腾讯专区: "web", // 云/小程序/安全，偏技术实现 → 网页(应用)
  数据智能: "data", // 指标/看板/AB/文本挖掘 → 数据
  金融投资: "data", // 财报解读/估值/风险量化 → 数据
  营销增长: "data", // 增长漏斗/ROI/SEO 收录，以数据驱动 → 数据
  内容创作: "video", // 短视频脚本/播客/漫画/音频后期（多媒体创作）→ 视频
  游戏空间: "video", // 玩法/叙事/美术方向（交互娱乐媒介）→ 视频
  产品设计: "image", // UI/原型/交互/品牌视觉 → 图像
  电商零售: "image", // 主图/详情页/店铺视觉 → 图像
  客户服务: "chat", // 应答话术/工单/质检（对话式）→ 对话
  销售商务: "chat", // 话术/异议处理/谈判（对话式成交）→ 对话
  文档办公: "doc", // 报告/方案/表格/邮件/简历 → 文档
  学术教育: "doc", // 论文/综述/笔记/文书 → 文档
  法律行政: "doc", // 合同/政策/知产文书 → 文档
  运营人力: "doc", // 制度/JD/流程/OKR 文档 → 文档
  项目管理: "doc", // 计划/风险/纪要/看板文档 → 文档
  一人公司: "doc", // BP/商业计划/画布 → 文档
  生活服务: "doc", // 行程/食谱/训练计划（书面方案）→ 文档
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
