// Skills overhaul 2026-10-24 — owned by W09A. Contract: oceanleo/docs/work-logs/2026-10-24-skills-overhaul/00-contract.md §3.4
export type {
  FileContent,
  Folder,
  FolderApiResult,
  FolderErrorCode,
  FolderSkillInfo,
  FolderSource,
  OfficialSkill,
  OfficialSkillCategory,
  TreeEntry,
  TreeEntryKind,
} from "./types";
export {
  FOLDER_ERROR_FALLBACKS,
  addOfficialSkill,
  copyFolderToProject,
  createSkill,
  deleteFolder,
  downloadFromGateway,
  folderApi,
  folderApiError,
  folderDownloadUrl,
  gatewayAbsoluteUrl,
  getFolder,
  getFolderFile,
  getOfficialSkill,
  getOfficialSkillFile,
  importFolderFromGithub,
  importFolderZip,
  isGatewayUrl,
  listFolders,
  listOfficialSkills,
  officialSkillCoverUrl,
  officialSkillDownloadUrl,
  officialSkillShareUrl,
  updateFolder,
  type FolderApi,
} from "./folder-api";
export {
  ConfigDialogLink,
  ConfigDialogShell,
  CONFIG_DIALOG_WIDTH,
  type ConfigDialogCloseReason,
  type ConfigDialogShellProps,
} from "./ConfigDialogShell";
export {
  ConfigToolbar,
  CONFIG_PRIMARY_BUTTON_CLASS,
  CONFIG_TOOLBAR_BUTTON_CLASS,
  CONFIG_TOOLBAR_ICON_BUTTON_CLASS,
  type ConfigToolbarProps,
} from "./ConfigToolbar";
export { AddMenu, type AddMenuItem, type AddMenuProps } from "./AddMenu";
export { ConfigEmptyState, type ConfigEmptyStateProps } from "./ConfigEmptyState";
export {
  ConfigItemCard,
  ConfigToggle,
  CONFIG_CARD_GRID_CLASS,
  type ConfigItemCardProps,
} from "./ConfigItemCard";
export { SkillCover, type SkillCoverProps } from "./SkillCover";
export { CodeBlock, FolderTreeViewer, safeImageDataUrl, type FolderTreeViewerProps } from "./FolderTreeViewer";
export {
  buildFolderTree,
  formatBytes as formatFolderBytes,
  pickInitialFile,
  splitFrontmatter,
  type TreeNode,
} from "./tree-model";
export {
  KitIconAlert,
  KitIconCheck,
  KitIconChevronDown,
  KitIconChevronLeft,
  KitIconChevronRight,
  KitIconClose,
  KitIconCode,
  KitIconCopy,
  KitIconDownload,
  KitIconFile,
  KitIconFileText,
  KitIconFilter,
  KitIconFolder,
  KitIconFolderOpen,
  KitIconImage,
  KitIconMore,
  KitIconPlus,
  KitIconPuzzle,
  KitIconSearch,
  KitIconShare,
  KitIconShield,
} from "./kit-icons";
