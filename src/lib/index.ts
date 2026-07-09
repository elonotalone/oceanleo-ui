export * from "./auth";
export * from "./database";
export * from "./agent";
export * from "./organization";
// doctrine v11：通用 AI 智能推荐（app/agent/org/workflow 四分区共用）。
export * from "./recommend";
export * from "./fn-agent";
export * from "./embed";
// 宗旨 v4：Agent Manifest（可迁移操作台）+ 能力 SDK + manifest 拉取/上架。
export * from "./manifest";
export * from "./capabilities";
export * from "./manifest-fetch";
// 全家桶二元分类器（行业 / 内容类型）的单一事实源。
export * from "./taxonomy";
// 在线心跳（admin 网站管理「在线人数」曲线的数据源）。AppShell 已内置。
export * from "./presence";
// 宗旨 v13（2026-07-02）：卡片图标品牌色（去蓝紫同底 + 每张卡自己的彩色 logo）。
export * from "./brand-color";
// 宗旨 v15（2026-07-05）：asset.oceanleo.com 素材缩略图直链（图示卡片示意图）。
export * from "./asset-thumb";
// 宗旨 v16 补充（2026-07-06）：「我的工作流」存取（操作台输入快照 → 右栏导航「我的」复用）。
export * from "./workflows";
export * from "./console-draft";
