export { AppShell, PageTitle } from "./AppShell";
// 工作台 iframe 内嵌「外壳闪屏」pre-paint 杀手（root layout 放一次）。
export { EmbedChrome } from "./EmbedChrome";
export type {
  AppShellProps,
  AppShellBrand,
  AppShellLayout,
  ShellNavItem,
  ShellNavGroup,
  ShellSubNav,
} from "./AppShell";
// doctrine v4：覆盖式子栏「选中态」桥（子栏列表 ↔ 主区详情跨树通信）。
export { WorkspaceSelectionProvider, useWorkspaceSelection } from "./WorkspaceSelection";
export type { SelectionNamespace } from "./WorkspaceSelection";
// 完整 App 工作会话：服务端 session + versioned snapshot + revision 冲突显式处理。
export {
  WorkspaceSessionProvider,
  useWorkspaceSession,
  useOptionalWorkspaceSession,
} from "./WorkspaceSession";
export type {
  WorkspaceSessionProviderProps,
  WorkspaceSessionContextValue,
  WorkspaceSessionMode,
  WorkspaceSessionAvailability,
  WorkspaceSessionConflict,
  WorkspaceSnapshotSaveResult,
  EnsureWorkspaceSessionOptions,
  WorkspaceSessionRecordContext,
  WorkspaceRuntime,
} from "./WorkspaceSession";
// 操作员 2026-06-24：外壳「顶栏控制」上下文——主区自带模型选择时，让 AppShell 隐藏
// 它 header 里的模型选择条（消灭子站工作台「两行顶栏」）。
export { ShellChromeProvider, useShellChrome } from "./ShellChrome";
// doctrine v7：工作台 master-detail（主区自带 网站/app/skill 目录 + 内嵌 + 返回）。
export { WorkspaceSubNav, WorkspaceDetail, ConsoleFnSubNav } from "./WorkspaceMasterDetail";
export type { ConsoleFnItem, WorkspaceSiteItem } from "./WorkspaceMasterDetail";
// doctrine v4：历史记录 master-detail（侧栏列表+删除 / 主区回看）。
// 「待处理」（PendingSubNav / PendingDetail）已于 2026-07-01 下线，全部会话进历史记录。
export { HistorySubNav, HistoryDetail } from "./HistoryMasterDetail";
export type {
  HistoryDetailProps,
  HistoryWorkspaceRenderer,
  RestorableAppSession,
} from "./HistoryMasterDetail";
// doctrine v4：文件库 master-detail（侧栏四分区 / 主区受控 FileLibrary）。
export { LibrarySubNav, LibraryDetail } from "./LibraryMasterDetail";
// doctrine v8：Playground（右侧主区：app/agent/organization/workflow 四分区 + 目录 +
// 内嵌 + 返回）。organization/workflow 画布由消费端经 renderBoard 注入。
export { PlaygroundSubNav, PlaygroundDetail, BackButton } from "./Playground";
export type { PlaygroundBoardKind, PlaygroundBoardCtx } from "./Playground";
// doctrine v11：通用 AI 智能推荐输入框（四分区共用）+ 卡片详情弹窗（WorkBuddy 式）。
export { AiRecommendBox } from "./AiRecommendBox";
export type { AiRecommendBoxProps } from "./AiRecommendBox";
export { ItemDetailModal } from "./ItemDetailModal";
export type { ItemDetailModalProps } from "./ItemDetailModal";
export { ModelPicker } from "./ModelPicker";
export type { ModelPickerProps, ModelCategory } from "./ModelPicker";
// Stage C：agent 引擎选择器（OceanLeo 原生 / 4 外部引擎 BYOK）。
// leo 助手（原「助手建议」）+ 标准输入框 + 打开浮窗的助手函数。
export {
  LeoAssistant,
  AiAssistant,
  openLeoAssistant,
  runLeoQuickSuggest,
  OPEN_LEO_EVENT,
  LEO_ENABLED_KEY,
  LEO_ENABLED_EVENT,
  isLeoEnabled,
  setLeoEnabled,
  useLeoEnabled,
} from "./LeoAssistant";
export type { LeoAssistantProps, AiAssistantProps } from "./LeoAssistant";
export { LeoComposer } from "./LeoComposer";
export type {
  LeoComposerProps,
  ComposerRecentFile,
  ComposerAttachment,
  ComposerMenuItem,
} from "./LeoComposer";
// 占位符高亮输入区（宗旨 v12：点 prompt 卡片起手，`[字段]` 上色 + 已填值高亮）。
export { PromptHighlightArea, TemplateFillArea, templateSegments } from "./PromptHighlightArea";
export type {
  PromptHighlightAreaProps,
  PromptHighlightAreaHandle,
  TemplateFillAreaProps,
  TemplateFillAreaHandle,
} from "./PromptHighlightArea";
// 标准输入卡片（= image 站「① 输入」规范：文字 + 上传/拖拽参考，二合一）。
export { InputCard } from "./InputCard";
export type { InputCardProps, InputAttachment } from "./InputCard";
// 三栏工作台模板（= image 站版式，全站统一）。
export { Studio } from "./Studio";
export type { StudioProps } from "./Studio";
// 单页「操作台」+ 顶部功能按键（OceanLeo 强制版式宗旨，2026-06-18）。
export { OperatorConsole } from "./OperatorConsole";
export type { OperatorConsoleProps, ConsoleFunction } from "./OperatorConsole";
// 所有成品 app 共用的补充备注：OperatorConsole 提供 app 级状态，
// FunctionAgentChat 统一渲染；直接生成引擎在最终 prompt 边界读取并追加。
export {
  OperatorRemarkField,
  OperatorRemarkProvider,
  useOperatorRemark,
} from "./OperatorRemark";
export type { OperatorRemarkValue } from "./OperatorRemark";
export {
  appendOperatorRemark,
  OPERATOR_REMARK_MAX_LENGTH,
} from "../lib/operator-remark";
// 宗旨 v14（2026-07-05）：成品 app 目录数据模型 + 统一模板组件（改一次模板全站同步）。
// 宗旨 v19（2026-07-08）：SiteCatalogConsole 目录首张自动插「agent」卡片（AgentCardConfig）。
export { SiteCatalogConsole } from "./SiteCatalogConsole";
export type { SiteCatalogConsoleProps, AgentCardConfig } from "./SiteCatalogConsole";
export { presetToOpsPatch } from "./app-catalog";
export type { GoalApp, GoalAppPreset } from "./app-catalog";
export { StudioSection, CollapsibleSection } from "./StudioSection";
export type { StudioSectionProps } from "./StudioSection";
// 宗旨 v18（2026-07-07）：操作台「选项按键组」（单选点已选=取消；多选切换）。全家桶
// 操作台的比例/画质/风格/数量档等选项统一用它，自动获得「再点一次取消选择」。
export { OptionRow } from "./OptionRow";
export type { OptionRowProps, OptionItem } from "./OptionRow";
export { ResultCanvas, CanvasEmpty, CanvasSubTabs } from "./ResultCanvas";
export type { ResultCanvasProps, CanvasTab } from "./ResultCanvas";
// 宗旨 v17（2026-07-07）：右栏三分区「库」统一版式积木（搜索行 + 分类 chips），
// 供 导航 / 素材库 / 文件库 共用，保证三分区 UI 几乎完全一致。
export { LibraryToolbar, LibraryChips } from "./LibraryLayout";
export type { LibraryToolbarProps, LibraryChipsProps, LibraryChip } from "./LibraryLayout";
// 宗旨 v17（2026-07-07）：素材库 = 启发/参考的成品示例（各 app 自带 materials），点卡片
// 放大铺满库查看，不写回操作台。与导航/文件库同一套版式。
export { MaterialLibrary } from "./MaterialLibrary";
export type { MaterialLibraryProps, MaterialItem } from "./MaterialLibrary";
// 宗旨 v19（2026-07-08）：侧栏「探索」页——整站级素材浏览（asset.oceanleo.com 自囤 OSS
// 正式库，masonry 瀑布流 + 分类 chips）。各站 /explore 路由传本站 ExploreConfig 即可。
export { ExplorePage, exploreCategoryLabel } from "./ExplorePage";
export type { ExplorePageProps, ExploreConfig, ExploreCategory, ExploreAssetType } from "./ExplorePage";
// 宗旨 v12.1（2026-07-04）：功能页「使用指南（navigator）」——右栏（库）默认展开、
// 首屏是导航页（教学文案 + 示例，点示例灌进左栏）。ConsoleFunction.guide 配置。
export { NavigatorGuide } from "./NavigatorGuide";
export type { NavigatorGuideProps, FunctionGuide, GuideExample, GuideSection } from "./NavigatorGuide";
export {
  GuideProvider,
  useFunctionGuide,
  useGuideWorkflows,
  useRegisterOpsFiller,
  useFillNonce,
  FillNonceProvider,
} from "./guide-context";
export type { OpsFiller, SavedWorkflow, WorkflowDraft } from "./guide-context";
// 可拖动两栏工作区（「一分为二」：左推导 / 右结果，竖线拖动 + 大屏）。
// 宗旨 v11：useRightPaneSlot 让右栏内容（ResultCanvas 标签条）接管右栏标题位（去框中框）。
export { SplitWorkspace, useLeftPaneSlot, useRightPaneSlot } from "./SplitWorkspace";
export type { SplitWorkspaceProps, SplitLibraryConfig } from "./SplitWorkspace";
// 极简 Markdown 渲染（零依赖）。
export { Markdown } from "./Markdown";
// agent 工作界面（左推导 / 右 artifact 结果，真实调 /v1/agent/tasks）。
// 宗旨 v19（2026-07-08）：AgentChat 右栏可升级为多标签库（生成结果/素材库/文件库）。
export { AgentChat, orgStatusFromMessages } from "./AgentChat";
export type { AgentChatProps, AgentLibraryTabs } from "./AgentChat";
// doctrine 2026-07-09：组织节点图画布（团队≡组织）的本体 + 类型都在独立子路径
// `@oceanleo/ui/org-canvas`（peer dep @xyflow/react，只主站/agent 站装，其余 29 站不受累）。
// 这里【不】re-export，避免把 xyflow 模块图拉进不用画布的站。
// 首页输入框「＋」上传 / 拖入的附件类型（各站首页把 HomeIntro.onStart 的
// opts.attachments 透传给 AgentChat.initialAttachments 时用它给 state 标注类型）。
export type { AgentAttachment } from "../lib/agent";
// 宗旨 v10（2026-06-28）：功能区左栏「操作台 | agent」同栏双形态（操作台默认且可生成，
// agent 独立带工具，结果共用右栏）。
export { FunctionAgentChat, useFnAgentBridge } from "./FunctionAgentChat";
export type { FunctionAgentChatProps } from "./FunctionAgentChat";
// session-first 操作台自动恢复/保存；旧后端与未登录状态兼容本地草稿。
export { useConsoleDraft } from "./useConsoleDraft";
export type { UseConsoleDraftArgs, UseConsoleDraftReturn } from "./useConsoleDraft";
export { RestartDraftButton } from "./RestartDraftButton";
export type { RestartDraftButtonProps } from "./RestartDraftButton";
// 操作台 run 持久化为 task，并聚合到同一个 AppSession 历史。
export { useConsoleRun } from "./useConsoleRun";
export type {
  UseConsoleRunArgs,
  UseConsoleRunReturn,
  ConsoleRunBeginArgs,
  ConsoleRunFinishArgs,
} from "./useConsoleRun";
// doctrine v6/v7：skill prompt 开源面板（输入框里的 prompt 小图标 + 浮层）。
export { SkillPromptPanel } from "./SkillPromptPanel";
export type { SkillPromptPanelProps } from "./SkillPromptPanel";
// doctrine v7：统一应用目录（二元分类器 + ce335cef 卡片 + 加入工作台）。
export { AppDirectory } from "./AppDirectory";
export type { AppDirectoryProps, DirectoryItem } from "./AppDirectory";
// 操作员 2026-06-24：站内「相关 skill」目录（按 relatedSkillCategories 过滤 LeoSkill）。
export { SiteSkillDirectory } from "./SiteSkillDirectory";
export type { SiteSkillDirectoryProps } from "./SiteSkillDirectory";
// doctrine v6：创建 / 保存 skill 的统一弹窗（「创建 skill」+「保存为我的 skill」共用）。
export { CreateSkillModal, CreateSkillTeamModal } from "./CreateSkillModal";
export type { CreateSkillModalProps, CreateSkillTeamModalProps } from "./CreateSkillModal";
// 宗旨 v4：由 manifest 渲染的通用操作台（可迁移核心）。任何站点同一组件渲染同一份
// manifest → 显示一致、零代码搬迁。
export { AgentConsole } from "./AgentConsole";
export type { AgentConsoleProps, RunCapabilityFn } from "./AgentConsole";
// 主站「工作台」母页面壳（iframe 内嵌子站功能区 + 选/加 agent）。
export { WorkspaceShell } from "./WorkspaceShell";
export type { WorkspaceShellProps } from "./WorkspaceShell";
// 站点首页（介绍 + 30% 盈利说明 + 大输入框 → 进入 agent）。
export { HomeIntro, BillingNotice } from "./HomeIntro";
export type { HomeIntroProps } from "./HomeIntro";
// 首页 prompt 卡片分区（宗旨 v12，2026-07-04）：只留 prompt 卡片（agent 卡片组件保留
// 导出但首页不再渲染）。「添加 prompt」= 预制库选择 + 新建（AddPromptModal）。
export { HomePromptCards, HomeAgentCards, PromptCardModal, AddPromptModal } from "./HomeCards";
export type { HomeAgentPick } from "./HomeCards";
export { promptCardsForSite, loadCustomPromptCards, saveCustomPromptCards, loadAllCustomPromptCards } from "./home-cards";
export type { PromptCard } from "./home-cards";
// 文件库（整合「我的数据库」+ 上传 + 跨站分区）。
export { FileLibrary, LIBRARY_TABS } from "./FileLibrary";
export type { FileLibraryProps, SiteOption, LibraryTab } from "./FileLibrary";
// 统一文件库（2026-07-02）：主站 + 全部子站同一套「全部/图片/文档/幻灯片/视频/
// 音频/3D/收藏」分区，agent_artifacts 全系列打通。
export { ArtifactLibrary, ARTIFACT_FILTERS } from "./ArtifactLibrary";
export type { ArtifactLibraryProps, ArtifactFilter, ArtifactItem } from "./ArtifactLibrary";
// 历史记录页。
export { HistoryPage } from "./HistoryPage";
export type { HistoryPageProps } from "./HistoryPage";
// 站级四页范式帮助器（首页/工作台/文件库/历史记录 的 nav + 路由）。
export { workspaceNav, pageFromPath, useWorkspaceNavLabels } from "./WorkspacePages";
export type { WorkspacePage, WorkspaceNavOptions } from "./WorkspacePages";
export * from "./icons";
// 2026-07-03：全家桶站点几何图标（单一事实源，从主站 SITES 移植）。playground /
// app-directory / 工作台目录 卡片按 site_id 取彩色几何图标 + 品牌色，替代 emoji。
export { SITE_ICONS, SITE_BRAND_COLOR, siteIconFor, siteBrandColorFor } from "./site-icons";
// 宗旨 v13（2026-07-02）：从 shell 也 re-export brand-color，让消费站不用另导 lib。
export { brandColorFor, tintOf, BRAND_PALETTE } from "../lib/brand-color";
// 宗旨 v13：专家团成员管理弹窗（agent 站输入框「专家团」小图标 → 弹本 modal）。
export { TeamRosterModal } from "./TeamRosterModal";
export type { TeamRosterModalProps } from "./TeamRosterModal";
