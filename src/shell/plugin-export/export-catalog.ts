// ============================================================================
// 逐工具的导出形态清单 —— 从 W10 的清册派生视图摘出来的发布副本。
//
// 单一事实源在 oceandino 仓 `scripts/data/oceanleo-plugin-registry.json`，
// 派生视图 `scripts/data/oceanleo-app-plugins.json` 的 `plugins` 目录带
// `exportKinds`。共享包不能在运行时读另一个仓库的文件，而 W11 的
// `scripts/sync-app-plugins.mjs` 目前只同步按钮行（`id/label/runtime/doc`），
// 不带 `exportKinds`，所以这一片先在这里发布。
//
// 漂移由 `tests/plugin-export.test.mjs` 盯着：只要那份派生视图在本机可读，
// 用例就逐条比对本文件与它。等 `sync-app-plugins.mjs` 把 `exportKinds` 一起
// 同步进来（`signals/W15-request.md` 已提出），本文件即可删除。
// ============================================================================

import type { PluginExportFormId } from "./plugin-export-contract";

export interface PluginExportCatalogEntry {
  /** 面向用户的中文名。 */
  label: string;
  runtime: "geo-map" | "grid" | "interactive-doc";
  /** 旧 L3 族 id，回查旧规格时用。 */
  family: string;
  exportKinds: readonly PluginExportFormId[];
}
export const PLUGIN_EXPORT_CATALOG_SOURCE = "scripts/data/oceanleo-plugin-registry.json";
export const PLUGIN_EXPORT_CATALOG_GENERATED_AT = "2026-08-05T06:03:26Z";

export const PLUGIN_EXPORT_CATALOG: Readonly<
  Record<string, PluginExportCatalogEntry>
> = {
  "city-map": {
    label: "地图",
    runtime: "geo-map",
    family: "annotatable-city-map",
    exportKinds: ["long-image", "pdf", "xlsx"],
  },
  "concept-graph": {
    label: "概念图谱",
    runtime: "interactive-doc",
    family: "concept-knowledge-graph",
    exportKinds: ["long-image", "html", "pdf", "xlsx"],
  },
  "contract-assembly": {
    label: "合同装配",
    runtime: "interactive-doc",
    family: "contract-assembly",
    exportKinds: ["pdf", "html", "docx"],
  },
  "dialogue-branch": {
    label: "话术分支",
    runtime: "interactive-doc",
    family: "dialogue-branch-script",
    exportKinds: ["pdf", "long-image", "html", "xlsx"],
  },
  "executable-notebook": {
    label: "可执行笔记",
    runtime: "interactive-doc",
    family: "executable-notebook",
    exportKinds: ["xlsx", "pdf", "long-image"],
  },
  "financial-calculator": {
    label: "金融计算器",
    runtime: "interactive-doc",
    family: "financial-calculator",
    exportKinds: ["xlsx", "pdf", "long-image"],
  },
  "floorplan": {
    label: "户型标注",
    runtime: "geo-map",
    family: "floorplan-annotation",
    exportKinds: ["pdf", "xlsx", "long-image"],
  },
  "formula-walkthrough": {
    label: "公式展开",
    runtime: "interactive-doc",
    family: "formula-derivation-walkthrough",
    exportKinds: ["pdf", "long-image", "xlsx"],
  },
  "interactive-globe": {
    label: "地球仪",
    runtime: "geo-map",
    family: "interactive-globe",
    exportKinds: ["long-image", "pdf", "xlsx"],
  },
  "ledger": {
    label: "台账",
    runtime: "grid",
    family: "ledger-register",
    exportKinds: ["xlsx", "csv", "pdf", "long-image", "html"],
  },
  "legal-calculator": {
    label: "法律计算器",
    runtime: "interactive-doc",
    family: "legal-calculator",
    exportKinds: ["pdf", "xlsx"],
  },
  "literature-matrix": {
    label: "文献矩阵",
    runtime: "grid",
    family: "literature-matrix",
    exportKinds: ["xlsx", "csv", "pdf", "html"],
  },
  "medical-calculator": {
    label: "医疗计算器",
    runtime: "interactive-doc",
    family: "medical-calculator",
    exportKinds: ["pdf", "xlsx", "long-image"],
  },
  "metrics-dashboard": {
    label: "看板",
    runtime: "interactive-doc",
    family: "metrics-dashboard",
    exportKinds: ["long-image", "pdf", "html", "xlsx"],
  },
  "relationship-graph": {
    label: "关系图",
    runtime: "interactive-doc",
    family: "relationship-graph",
    exportKinds: ["long-image", "html", "pdf", "xlsx"],
  },
  "search-query-builder": {
    label: "检索式构造",
    runtime: "interactive-doc",
    family: "search-query-builder",
    exportKinds: ["pdf", "html", "xlsx"],
  },
  "self-test-quiz": {
    label: "自测卷",
    runtime: "interactive-doc",
    family: "self-test-quiz",
    exportKinds: ["xlsx", "pdf", "long-image"],
  },
  "spaced-repetition": {
    label: "间隔排程",
    runtime: "interactive-doc",
    family: "spaced-repetition-scheduler",
    exportKinds: ["xlsx", "pdf", "long-image"],
  },
  "three-statement-model": {
    label: "三表模型",
    runtime: "grid",
    family: "three-statement-model",
    exportKinds: ["xlsx", "pdf", "html"],
  },
  "unit-converter": {
    label: "换算器",
    runtime: "interactive-doc",
    family: "unit-converter",
    exportKinds: ["xlsx", "long-image"],
  },
  "voiceover-script": {
    label: "口播脚本",
    runtime: "interactive-doc",
    family: "voiceover-script",
    exportKinds: ["pdf", "long-image", "html", "xlsx", "srt", "vtt"],
  },
};
