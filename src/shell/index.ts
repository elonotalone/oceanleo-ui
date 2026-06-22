export { AppShell, PageTitle } from "./AppShell";
// 工作台 iframe 内嵌「外壳闪屏」pre-paint 杀手（root layout 放一次）。
export { EmbedChrome } from "./EmbedChrome";
export type {
  AppShellProps,
  AppShellBrand,
  AppShellLayout,
  ShellNavItem,
  ShellNavGroup,
} from "./AppShell";
export { ModelPicker } from "./ModelPicker";
export type { ModelPickerProps, ModelCategory } from "./ModelPicker";
// leo 助手（原「助手建议」）+ 标准输入框 + 打开浮窗的助手函数。
export { LeoAssistant, AiAssistant, openLeoAssistant, OPEN_LEO_EVENT } from "./LeoAssistant";
export type { LeoAssistantProps, AiAssistantProps } from "./LeoAssistant";
export { LeoComposer } from "./LeoComposer";
export type { LeoComposerProps } from "./LeoComposer";
// 标准输入卡片（= image 站「① 输入」规范：文字 + 上传/拖拽参考，二合一）。
export { InputCard } from "./InputCard";
export type { InputCardProps, InputAttachment } from "./InputCard";
// 三栏工作台模板（= image 站版式，全站统一）。
export { Studio } from "./Studio";
export type { StudioProps } from "./Studio";
// 单页「操作台」+ 顶部功能按键（OceanLeo 强制版式宗旨，2026-06-18）。
export { OperatorConsole } from "./OperatorConsole";
export type { OperatorConsoleProps, ConsoleFunction } from "./OperatorConsole";
export { StudioSection, CollapsibleSection } from "./StudioSection";
export type { StudioSectionProps } from "./StudioSection";
export { ResultCanvas, CanvasEmpty } from "./ResultCanvas";
export type { ResultCanvasProps, CanvasTab } from "./ResultCanvas";
// 可拖动两栏工作区（「一分为二」：左推导 / 右结果，竖线拖动 + 大屏）。
export { SplitWorkspace } from "./SplitWorkspace";
export type { SplitWorkspaceProps } from "./SplitWorkspace";
// 极简 Markdown 渲染（零依赖）。
export { Markdown } from "./Markdown";
// agent 工作界面（左推导 / 右 artifact 结果，真实调 /v1/agent/tasks）。
export { AgentChat } from "./AgentChat";
export type { AgentChatProps } from "./AgentChat";
// 功能区「操作台 / agent」双形态左栏（doctrine v3：一个功能区=一个操作台=一个 agent）。
export { FunctionAgentChat } from "./FunctionAgentChat";
export type { FunctionAgentChatProps } from "./FunctionAgentChat";
// 宗旨 v4：由 manifest 渲染的通用操作台（可迁移核心）。任何站点同一组件渲染同一份
// manifest → 显示一致、零代码搬迁。
export { AgentConsole } from "./AgentConsole";
export type { AgentConsoleProps } from "./AgentConsole";
// 主站「工作台」母页面壳（iframe 内嵌子站功能区 + 选/加 agent）。
export { WorkspaceShell } from "./WorkspaceShell";
export type { WorkspaceShellProps } from "./WorkspaceShell";
// 站点首页（介绍 + 30% 盈利说明 + 大输入框 → 进入 agent）。
export { HomeIntro } from "./HomeIntro";
export type { HomeIntroProps } from "./HomeIntro";
// 文件库（整合「我的数据库」+ 上传 + 跨站分区）。
export { FileLibrary } from "./FileLibrary";
export type { FileLibraryProps, SiteOption } from "./FileLibrary";
// 历史记录页。
export { HistoryPage } from "./HistoryPage";
export type { HistoryPageProps } from "./HistoryPage";
// 站级四页范式帮助器（首页/工作台/文件库/历史记录 的 nav + 路由）。
export { workspaceNav, pageFromPath } from "./WorkspacePages";
export type { WorkspacePage, WorkspaceNavOptions } from "./WorkspacePages";
export * from "./icons";
