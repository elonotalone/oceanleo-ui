// ============================================================================
// 逐工具的导出形态清单 —— 从 W10 的清册派生视图摘出来的发布副本。
//
// 单一事实源在 oceandino 仓 `scripts/data/oceanleo-plugin-registry.json`，
// 派生视图 `scripts/data/oceanleo-app-plugins.json` 的 `plugins` 目录带
// `exportKinds`。共享包不能在运行时读另一个仓库的文件，而 W11 的
// `scripts/sync-app-plugins.mjs` 目前只同步按钮行（`id/label/runtime/doc`），
// 不带 `exportKinds`，所以这一片先在这里发布。
//
// **键就是 L3 族 id**，与清册、发布副本、`plugin-initial-states/` 的第一屏
// 逐字同一套（R-1 之后短 id 已废除，不保留别名、不保留映射表）。族 id 因此
// 不再单列一个字段：键与字段各存一份就是两个真相，改一处漏一处必然漂移。
//
// 漂移由 `tests/plugin-export.test.mjs` 盯着：只要那份派生视图在本机可读，
// 用例就逐条比对本文件与它，并核对每个键都是第一屏认得的族 id。等
// `sync-app-plugins.mjs` 把 `exportKinds` 一起同步进来（`signals/W15-request.md`
// 已提出），本文件即可删除。
// ============================================================================

import type { PluginExportFormId } from "./plugin-export-contract";

export interface PluginExportCatalogEntry {
  /** 面向用户的中文名。 */
  label: string;
  runtime: "geo-map" | "grid" | "interactive-doc";
  exportKinds: readonly PluginExportFormId[];
}
export const PLUGIN_EXPORT_CATALOG_SOURCE = "scripts/data/oceanleo-plugin-registry.json";
export const PLUGIN_EXPORT_CATALOG_GENERATED_AT = "2026-08-05T06:51:00Z";

export const PLUGIN_EXPORT_CATALOG: Readonly<
  Record<string, PluginExportCatalogEntry>
> = {
  "annotatable-city-map": {
    label: "地图",
    runtime: "geo-map",
    exportKinds: ["long-image", "pdf", "xlsx"],
  },
  "concept-knowledge-graph": {
    label: "概念图谱",
    runtime: "interactive-doc",
    exportKinds: ["long-image", "html", "pdf", "xlsx"],
  },
  "contract-assembly": {
    label: "合同装配",
    runtime: "interactive-doc",
    exportKinds: ["pdf", "html", "docx"],
  },
  "dialogue-branch-script": {
    label: "话术分支",
    runtime: "interactive-doc",
    exportKinds: ["pdf", "long-image", "html", "xlsx"],
  },
  "executable-notebook": {
    label: "可执行笔记",
    runtime: "interactive-doc",
    exportKinds: ["xlsx", "pdf", "long-image"],
  },
  "financial-calculator": {
    label: "金融计算器",
    runtime: "interactive-doc",
    exportKinds: ["xlsx", "pdf", "long-image"],
  },
  "floorplan-annotation": {
    label: "户型标注",
    runtime: "geo-map",
    exportKinds: ["pdf", "xlsx", "long-image"],
  },
  "formula-derivation-walkthrough": {
    label: "公式展开",
    runtime: "interactive-doc",
    exportKinds: ["pdf", "long-image", "xlsx"],
  },
  "interactive-globe": {
    label: "地球仪",
    runtime: "geo-map",
    exportKinds: ["long-image", "pdf", "xlsx"],
  },
  "ledger-register": {
    label: "台账",
    runtime: "grid",
    exportKinds: ["xlsx", "csv", "pdf", "long-image", "html"],
  },
  "legal-calculator": {
    label: "法律计算器",
    runtime: "interactive-doc",
    exportKinds: ["pdf", "xlsx"],
  },
  "literature-matrix": {
    label: "文献矩阵",
    runtime: "grid",
    exportKinds: ["xlsx", "csv", "pdf", "html"],
  },
  "medical-calculator": {
    label: "医疗计算器",
    runtime: "interactive-doc",
    exportKinds: ["pdf", "xlsx", "long-image"],
  },
  "metrics-dashboard": {
    label: "看板",
    runtime: "interactive-doc",
    exportKinds: ["long-image", "pdf", "html", "xlsx"],
  },
  "relationship-graph": {
    label: "关系图",
    runtime: "interactive-doc",
    exportKinds: ["long-image", "html", "pdf", "xlsx"],
  },
  "search-query-builder": {
    label: "检索式构造",
    runtime: "interactive-doc",
    exportKinds: ["pdf", "html", "xlsx"],
  },
  "self-test-quiz": {
    label: "自测卷",
    runtime: "interactive-doc",
    exportKinds: ["xlsx", "pdf", "long-image"],
  },
  "spaced-repetition-scheduler": {
    label: "间隔排程",
    runtime: "interactive-doc",
    exportKinds: ["xlsx", "pdf", "long-image"],
  },
  "three-statement-model": {
    label: "三表模型",
    runtime: "grid",
    exportKinds: ["xlsx", "pdf", "html"],
  },
  "unit-converter": {
    label: "换算器",
    runtime: "interactive-doc",
    exportKinds: ["xlsx", "long-image"],
  },
  "voiceover-script": {
    label: "口播脚本",
    runtime: "interactive-doc",
    exportKinds: ["pdf", "long-image", "html", "xlsx", "srt", "vtt"],
  },
};
