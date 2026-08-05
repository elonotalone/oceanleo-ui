/**
 * 应用内功能件的导出链。契约在 `plugin-export-contract.ts` 的文件头。
 *
 * 注意：接线层 `plugin-export-wiring.ts` 会连带拉起网关客户端，只在真正要
 * 发请求的地方引它；只需要判据（例如「我的库」的准入过滤）时引本文件即可。
 */

export {
  MATERIAL_ARTIFACT_TYPES,
  PLUGIN_EXPORT_CATALOG,
  PLUGIN_EXPORT_CATALOG_GENERATED_AT,
  PLUGIN_EXPORT_CATALOG_SOURCE,
  PLUGIN_EXPORT_FORMS,
  PLUGIN_EXPORT_SCHEMA,
  RUNTIME_STATE_ARTIFACT_TYPES,
  exportKindsForPlugin,
  isMaterialArtifactType,
  pluginSupportsForm,
  renderableExportKindsForPlugin,
  libraryEntryIsDownloadableMaterial,
  libraryEntryIsRuntimeSurface,
  normalizePluginExportRequest,
  pluginExportFilename,
  pluginExportForm,
  pluginExportProvenance,
  pluginExportTitle,
  type NormalizedPluginExportRequest,
  type PluginExportCatalogEntry,
  type PluginExportCell,
  type PluginExportColumn,
  type PluginExportData,
  type PluginExportForm,
  type PluginExportFormId,
  type PluginExportRejection,
  type PluginExportRequest,
  type PluginExportTotal,
  type PluginSurfaceKind,
} from "./plugin-export-contract";

export {
  renderPluginExport,
  type RenderedPluginExport,
} from "./plugin-export-render";

// PDF 的两块零件。站点侧一般用不到它们（走 `renderPluginExport()` 就够了），
// 但 `loadPdfFonts()` 可以在打开导出菜单时先预热，省掉点下去那一刻的等待。
export {
  loadPdfFonts,
  resetPdfFontsForTest,
  type LoadedPdfFont,
  type PdfFontSet,
} from "./pdf-cjk-font";

export { renderPdf } from "./pdf-render";

export {
  parseTrueType,
  subsetTrueType,
  type TrueTypeFont,
  type TrueTypeSubset,
} from "./truetype-subset";

export {
  auditPluginExportCatalog,
  formatPluginExportAudit,
  type PluginExportAuditCode,
  type PluginExportAuditIssue,
} from "./plugin-export-audit";

export {
  exportToLibrary,
  type PluginExportDependencies,
  type PluginExportPath,
  type PluginExportResult,
  type PluginExportSuccess,
} from "./plugin-export-runtime";

export {
  LEDGER_EXPORT_FORMS,
  LEDGER_RENDERABLE_EXPORT_FORMS,
  LEDGER_SOURCE_ID,
  LEDGER_SOURCE_LABEL,
  ledgerExportData,
  ledgerExportRequest,
  type LedgerEntry,
  type LedgerSnapshot,
} from "./ledger-export";
