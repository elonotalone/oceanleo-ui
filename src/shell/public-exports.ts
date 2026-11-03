// Public shell exports kept outside the barrel to keep its compile-time surface small.
// 手机原生桥的公开面。整组挑选过的转出在那一份里，这里只把它接上门面。
export * from "./mobile-bridge-public";
export { CollectionItemCard, CollectionItemRow, CollectionItemList, type CollectionItemProps } from "./collection-items";
// Dev / HMR：`next/dynamic` 拉共享 barrel 时旧 chunk hash 会 404。消费站用
// `dynamic(() => importWithChunkReload(() => import("@oceanleo/ui/shell").then(…)))`。
export { importWithChunkReload } from "../lib/lazy-with-retry";

export { AccountMenu, type AccountMenuProps } from "./AccountMenu";
export * from "./account";
// work-chat（W08）：侧栏「消息」的全局浮层与入口。门户从 `@oceanleo/ui/shell` 引这些。
export { MessagesHost } from "./messages/MessagesHost";
export { openMessages, closeMessages } from "./messages/host-state";
export { MessagesNavIcon } from "./messages/MessagesNavIcon";
export { imEnabledHere, useImEnabled } from "../lib/im/client";

export { ComputerTaskImport } from "./cloud-computer/computer-task-import";
// W6 (2026-10-31): composer uploads go to the private Library only; messages carry
// `{artifact_id, revision_id}`. Display URLs come from `@oceanleo/ui/lib` attachment-url.
export {
  uploadComposerFile,
  composerLibraryItem,
  type ComposerPrivateUpload,
  type ComposerUploadResult,
} from "./composer-upload";
export { originalForPreparedFile, dimensionsForPreparedFile } from "../lib/upload/image-preparation";
export type { PreparedImageDimensions } from "../lib/upload/image-compress";
export { listMyArtifacts } from "./artifact-client";

// 2026-07-03：全家桶站点几何图标（单一事实源，从主站 SITES 移植）。playground /
// app-directory / 工作台目录 卡片按 site_id 取彩色几何图标 + 品牌色，替代 emoji。
export { SITE_ICONS, SITE_BRAND_COLOR, siteIconFor, siteBrandColorFor } from "./site-icons";
// 宗旨 v13（2026-07-02）：从 shell 也 re-export brand-color，让消费站不用另导 lib。
export { brandColorFor, tintOf, BRAND_PALETTE } from "../lib/brand-color";
// 宗旨 v13：专家团成员管理弹窗（agent 站输入框「专家团」小图标 → 弹本 modal）。
export { TeamRosterModal, type TeamRosterModalProps } from "./TeamRosterModal";
// 封面判据三态（2026-07-29 合同 §3.2，W1 产出）。**不再是布尔**：`real` 照常显示、
// `unknown-metadata` 是「元数据没写全的真图」（弱化呈现，**不得**写「封面不可用」）、
// 只有 `proven-placeholder` 才是被证实的占位图。字节数不是质量代理——旧的 4096 字节
// 下限误杀了 5 万份 SVG 与 7,013 份 dimensions 为 null 的健康 webp。
// `isSourceAliasRendition` 回答「这个 purpose 是不是 source 的同 blob 别名」：别名只
// 降级排序，**不判失败**。W2 的库搜索投影按同一口径对齐。
export {
  coverEvidenceOf,
  coverEvidenceReportOf,
  isSourceAliasRendition,
  workspaceCoverPlan,
  workspaceCoverRenditionPurposes,
} from "./workspace-library-cover";
export type {
  CoverEvidence,
  CoverEvidenceReport,
  WorkspaceCoverPlan,
  WorkspaceCoverRenderer,
} from "./workspace-library-cover";
// 探索区可玩分流与「开玩」落点（W8 产出，符号清单见 `W8-marker.md` §A）。
export {
  ARTIFACT_PLAY_ORIGIN,
  ARTIFACT_PLAY_ROUTE_PREFIX,
  EXPLORE_PLAYABLE_MAX_PAGES,
  EXPLORE_PLAYABLE_PAGE_LIMIT,
  artifactPlayHref,
  isPlayableGameLibraryItem,
  isPlayableGameShelfEntry,
  // 「开玩」的独立派发通路：`openArtifactPlay` 是货架/feed 的前置分流（返回 true 即
  // 已按可玩处理完，不得再落到 `isAdvancedEditableShelfItem` 那条编辑器路径），
  // `safeArtifactPlayHref` 是外来 `play_href` 的 fail-closed 校验器，
  // `navigateToArtifactPlay` 的 `navigate` 可注入以便断言落点。
  navigateToArtifactPlay,
  openArtifactPlay,
  safeArtifactPlayHref,
} from "./explore-artifact-class";
export { ExplorePlayableSurface } from "./explore-shelf-dispatch";
export { EXPLORE_FEED_PLAY_LINK_ATTR } from "./ExplorePlayableFeed";

export * from "./public-exports";
