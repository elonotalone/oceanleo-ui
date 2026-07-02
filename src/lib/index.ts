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
