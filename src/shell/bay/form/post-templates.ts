// 发帖页「模板 / 我的post显示」：预制样例 + 本机保存的模板。
// 选模板只帮填写的人看成品、套进表单，不改买家端那张统一详情页。

export type BayPostKind = "digital" | "service" | "consult" | "app" | "lesson" | "need";
export type BayBilling = "delivery" | "session" | "hour";
export const DIGITAL_MATERIAL_KINDS = [
  "image",
  "poster",
  "vector",
  "ppt",
  "document",
  "pdf",
  "sheet",
  "website",
  "video",
  "audio",
  "threed",
  "game",
  "chart",
  "workflow",
] as const;
export type DigitalMaterialKind = (typeof DIGITAL_MATERIAL_KINDS)[number];

export const DIGITAL_MATERIAL_LABEL: Record<DigitalMaterialKind, string> = {
  image: "图片",
  poster: "海报",
  vector: "矢量图",
  ppt: "PPT",
  document: "文档",
  pdf: "PDF",
  sheet: "表格",
  website: "网站",
  video: "视频",
  audio: "音频",
  threed: "3D 模型",
  game: "游戏",
  chart: "图表",
  workflow: "工作流",
};

export type BayPostSnapshot = {
  id?: string;
  kind: BayPostKind;
  title: string;
  summary?: string;
  description?: string;
  coverUrl?: string;
  coverUrls?: string[];
  previewArtifactId?: string;
  previewWorkTitle?: string;
  sampleArtifactId?: string;
  materialKind?: DigitalMaterialKind;
  categoryLabel?: string;
  priceFen?: number;
  billing?: BayBilling;
  deliveryDays?: number | null;
  license?: "personal" | "commercial" | "";
  scopeNote?: string;
  consultRounds?: number | null;
  consultMinutes?: number | null;
  responseWindow?: string;
  skills?: string[];
  budgetFen?: number | null;
  deadlineLabel?: string;
  customTerms?: string;
  extras?: { label: string; value: string }[];
};

export type SavedPostTemplate = {
  id: string;
  kind: BayPostKind;
  title: string;
  savedAt: number;
  snapshot: BayPostSnapshot;
};

export const POST_TEMPLATE_STORAGE_KEY = "oceanleo.bay.post-templates.v1";

const OSS = "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com";

function ossCover(path: string): string {
  const raw = path.trim();
  if (raw.startsWith("https://")) return raw;
  return `${OSS}/${raw.replace(/^\/+/, "")}`;
}

function digitalPreset(row: {
  kind: DigitalMaterialKind;
  title: string;
  description: string;
  cover: string;
  artifactId: string;
  priceFen: number;
  license: "personal" | "commercial";
  categoryLabel: string;
}): BayPostSnapshot {
  const coverUrl = ossCover(row.cover);
  return {
    id: `preset:digital:${row.kind}`,
    kind: "digital",
    title: row.title,
    description: row.description,
    coverUrl,
    coverUrls: [coverUrl],
    sampleArtifactId: row.artifactId,
    previewWorkTitle: row.title,
    materialKind: row.kind,
    priceFen: row.priceFen,
    license: row.license,
    categoryLabel: row.categoryLabel,
  };
}

const PRESETS: BayPostSnapshot[] = [
  digitalPreset({
    kind: "image",
    title: "街头美食封面",
    description: "一张可商用的美食照片，付款后立刻下载。",
    cover: "assets/image/food/chinese-dish-pexels-34170981.webp",
    artifactId: "53d69575-dcb4-48a0-8991-be0e2af16672",
    priceFen: 0,
    license: "commercial",
    categoryLabel: "设计与视觉",
  }),
  digitalPreset({
    kind: "poster",
    title: "长图·换季护肤指南",
    description: "一篇可直接发的长图，改字就能上架。",
    cover: "assets/image/tpl-material/image-detail-image-1.webp",
    artifactId: "7d2444a9-112c-439a-addb-3dbeb75b3575",
    priceFen: 2900,
    license: "personal",
    categoryLabel: "设计与视觉",
  }),
  digitalPreset({
    kind: "vector",
    title: "叶片无缝纹样",
    description: "矢量花纹，可平铺做底纹和包装。",
    cover: "assets/image/tpl-material/image-svg-pattern-1.webp",
    artifactId: "4069a608-4307-4c68-a3bc-788e9536fa99",
    priceFen: 1900,
    license: "commercial",
    categoryLabel: "设计与视觉",
  }),
  digitalPreset({
    kind: "ppt",
    title: "商业计划书 PPT",
    description: "一套可改的路演页，付款后立刻打开。",
    cover: "assets/image/tpl-material/wo-deck-first-batch-business-plan-0.webp",
    artifactId: "61f12f90-4987-44ae-9d38-62422064a5a6",
    priceFen: 9900,
    license: "personal",
    categoryLabel: "文档与表格",
  }),
  digitalPreset({
    kind: "document",
    title: "名著速览手册",
    description: "Word 文档，改完就能发给学生。",
    cover: "assets/image/tpl-material/study-reading-guide-4.webp",
    artifactId: "bdfe9d8a-83cc-4e6c-bc50-8694acd64443",
    priceFen: 4900,
    license: "personal",
    categoryLabel: "文档与表格",
  }),
  digitalPreset({
    kind: "pdf",
    title: "阅读笔记 PDF",
    description: "排好版的 PDF，打开就能读、能印。",
    cover: "assets/image/tpl-material/WO-V2E-pdf-embed-0.webp",
    artifactId: "5a6c3108-a234-41d3-9f0d-741ac53fc3ec",
    priceFen: 3900,
    license: "personal",
    categoryLabel: "文档与表格",
  }),
  digitalPreset({
    kind: "sheet",
    title: "固定资产台账",
    description: "Excel 表格，按列填就能用。",
    cover: "assets/image/tpl-material/WO-G-W10-grid-excel-chart-maker-0.webp",
    artifactId: "e1a86aab-95e7-4fa4-a1e8-71cc0aedf764",
    priceFen: 5900,
    license: "commercial",
    categoryLabel: "文档与表格",
  }),
  digitalPreset({
    kind: "website",
    title: "专业服务站网页",
    description: "五页网站，改字改色就能上线。",
    cover: "assets/image/tpl-material/website-agency-1.webp",
    artifactId: "0fb3a8f6-11eb-4c41-8ba3-8cc96af31b17",
    priceFen: 19900,
    license: "personal",
    categoryLabel: "网站与前端",
  }),
  digitalPreset({
    kind: "video",
    title: "城市节奏短片",
    description: "成片视频，可做封面或广告。",
    cover: "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/assets/video/vid-city/pexels-9671000.poster.webp",
    artifactId: "93c9f9bf-ae3b-4b74-98a2-872f32cc06d9",
    priceFen: 8900,
    license: "personal",
    categoryLabel: "视频与动画",
  }),
  digitalPreset({
    kind: "audio",
    title: "广告配乐",
    description: "一段可商用的配乐，下载就能压进片子。",
    cover: "assets/image/tpl-material/music-ad-jingle-3.webp",
    artifactId: "148d3699-8e9b-4993-9135-52bf1da2b204",
    priceFen: 3900,
    license: "commercial",
    categoryLabel: "视频与动画",
  }),
  digitalPreset({
    kind: "threed",
    title: "建筑沙盘白模",
    description: "三维模型，可进渲染和展示。",
    cover: "assets/image/tpl-material/threed-architecture-model-2.webp",
    artifactId: "aa6f7f8d-92a0-41b8-b379-1cbe64d04b55",
    priceFen: 12900,
    license: "commercial",
    categoryLabel: "设计与视觉",
  }),
  digitalPreset({
    kind: "game",
    title: "九宫灯阵",
    description: "可玩的小游戏，打开就能试。",
    cover: "assets/image/tpl-material/game-logic-puzzle-1.webp",
    artifactId: "57940e74-db9f-43d1-b435-fe5637ec9966",
    priceFen: 0,
    license: "personal",
    categoryLabel: "网站与前端",
  }),
  digitalPreset({
    kind: "chart",
    title: "预期寿命对比图",
    description: "图表成品，换数据就能用。",
    cover: "assets/image/tpl-material/WO-G-W10-chart-excel-chart-maker-0.webp",
    artifactId: "c26793b2-c129-45c5-841d-90a795f23bac",
    priceFen: 4900,
    license: "commercial",
    categoryLabel: "文档与表格",
  }),
  digitalPreset({
    kind: "workflow",
    title: "视频工作流",
    description: "分镜和择优流程，按这个跑就能出片。",
    cover: "assets/image/tpl-material/video-canvas-flow-1.webp",
    artifactId: "99604479-d42e-497c-bf96-3f12b6f332c7",
    priceFen: 15900,
    license: "personal",
    categoryLabel: "视频与动画",
  }),
  {
    id: "preset:service:logo",
    kind: "service",
    title: "品牌 Logo 设计",
    description: "根据你的品牌一句话，5 天内交初稿，含两次改稿。",
    priceFen: 19900,
    billing: "delivery",
    deliveryDays: 5,
    categoryLabel: "设计与视觉",
  },
  {
    id: "preset:service:edit",
    kind: "service",
    title: "短视频剪辑",
    description: "把素材剪成 15 到 60 秒成片，按约定时间交付。",
    priceFen: 8900,
    billing: "delivery",
    deliveryDays: 3,
    categoryLabel: "视频与动画",
  },
  {
    id: "preset:consult:tax",
    kind: "consult",
    title: "报表和申报怎么填",
    description: "把你手头的表格问清楚再填。一次含三轮问答。",
    priceFen: 9900,
    billing: "session",
    consultRounds: 3,
    scopeNote: "只讲怎么填、哪些数字从哪来。不代报、不审计。",
    responseWindow: "24 小时内回复",
    categoryLabel: "税务",
  },
  {
    id: "preset:consult:career",
    kind: "consult",
    title: "转行前怎么选方向",
    description: "按小时聊现状和可选路径，不代写材料。",
    priceFen: 14900,
    billing: "hour",
    consultMinutes: 50,
    scopeNote: "职业方向和作品集怎么准备。不代投、不内推。",
    responseWindow: "当日回复",
    categoryLabel: "职业发展",
  },
  {
    id: "preset:app:invoice",
    kind: "app",
    title: "发票整理",
    description: "把发票拍照归类，导出给会计。",
    summary: "拍照、归类、导出。",
    categoryLabel: "文档与表格",
  },
  {
    id: "preset:app:weekly",
    kind: "app",
    title: "团队周报",
    description: "每人填三件事，自动汇总成一页。",
    summary: "三人一分钟写完周报。",
    categoryLabel: "文档与表格",
  },
  {
    id: "preset:lesson:figma",
    kind: "lesson",
    title: "Figma 接到第一单",
    description: "从空白文件到可交付的界面稿。",
    summary: "接单用的界面稿怎么做。",
    priceFen: 12900,
    categoryLabel: "设计与视觉",
  },
  {
    id: "preset:lesson:script",
    kind: "lesson",
    title: "口播短视频怎么写",
    description: "开头、要点、收束，按这个结构写稿。",
    summary: "口播稿的三种结构。",
    priceFen: 4900,
    categoryLabel: "视频与动画",
  },
  {
    id: "preset:need:kv",
    kind: "need",
    title: "需要一套活动主视觉",
    description: "主KV、海报、头图，要能印也能发网上。预算按整套，两周内要初稿。",
    budgetFen: 500000,
    deadlineLabel: "两周内",
    skills: ["主视觉", "海报"],
    categoryLabel: "设计与视觉",
  },
  {
    id: "preset:need:home",
    kind: "need",
    title: "找人改首页",
    description: "现有网站首页信息太挤，要改清楚、能在手机上看。",
    budgetFen: 200000,
    deadlineLabel: "十天内",
    skills: ["网页", "排版"],
    categoryLabel: "网站与前端",
  },
];

export function builtinTemplates(kind: BayPostKind): BayPostSnapshot[] {
  return PRESETS.filter((row) => row.kind === kind);
}

export function emptySnapshot(kind: BayPostKind): BayPostSnapshot {
  return { kind, title: "" };
}

export function snapshotDisplayTitle(snapshot: BayPostSnapshot): string {
  return snapshot.title.trim() || "未命名";
}

function readStore(): SavedPostTemplate[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(POST_TEMPLATE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedRow);
  } catch {
    return [];
  }
}

function writeStore(rows: SavedPostTemplate[]): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.setItem(POST_TEMPLATE_STORAGE_KEY, JSON.stringify(rows));
}

function isSavedRow(value: unknown): value is SavedPostTemplate {
  if (!value || typeof value !== "object") return false;
  const row = value as SavedPostTemplate;
  return Boolean(row.id && row.kind && row.snapshot && typeof row.snapshot === "object");
}

export function loadSavedTemplates(kind: BayPostKind): SavedPostTemplate[] {
  return readStore()
    .filter((row) => row.kind === kind)
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function saveTemplateFromSnapshot(snapshot: BayPostSnapshot): SavedPostTemplate {
  const row: SavedPostTemplate = {
    id: `mine:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
    kind: snapshot.kind,
    title: snapshotDisplayTitle(snapshot),
    savedAt: Date.now(),
    snapshot: { ...snapshot, id: undefined },
  };
  writeStore([row, ...readStore()].slice(0, 40));
  return row;
}

export function deleteSavedTemplate(id: string): void {
  writeStore(readStore().filter((row) => row.id !== id));
}

export function yuanLabel(fen: number | null | undefined): string {
  if (fen == null || !Number.isFinite(fen)) return "";
  if (fen <= 0) return "免费";
  const yuan = fen / 100;
  return Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
}
