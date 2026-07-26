export * from "./auth";
export * from "./database";
export * from "./agent";
export * from "./agent-progress";
// 完整 app 工作会话（版本化 snapshot + 乐观并发）。
export * from "./app-session";
export * from "./organization";
// doctrine v11：通用 AI 智能推荐（app/agent/org/workflow 四分区共用）。
export * from "./recommend";
export * from "./fn-agent";
export * from "./operator-remark";
export * from "./model-tier";
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
// 2026-07-25（合同 §3）：每个 app 一张封面图的 OSS key / URL 约定（30 站 catalog 的
// `thumb` 用它拼）。W5 产出 app-cover.ts 但不编辑本 barrel，导出由 W1 统一补。
export * from "./app-cover";
// 2026-07-26（合同 §0.4，W5）：功能图（`cap-app/*`）的 key/URL 约定。取代上一轮被判错的
// `cover-app/*` 占位封面；`capabilityImageThumbSrc()` 是渲染层唯一的 key→URL 拼接入口。
export * from "./app-capability-image";
export * from "./media-proxy";
export * from "./image-ai-edit";
// 宗旨 v16 补充（2026-07-06）：「我的工作流」存取（操作台输入快照 → 右栏导航「我的」复用）。
export * from "./workflows";
export * from "./console-draft";
