/**
 * 清册与导出链的对账闸。
 *
 * 挡的是一种具体故障：**文档第 8 格写着「能导出成 X」，用户点下去没反应。**
 * 形态清单是 W10 清册从每份工具文档的第 8 格生成的，导出链是另一套代码，
 * 两边各改各的必然会分家。所以这里逐条对账，两个方向都要成立：
 *
 *   1. 清册声明了某个形态 → 导出链必须给出确定结果：要么真的渲得出字节，
 *      要么在 `PLUGIN_EXPORT_FORMS` 里明确写成 `renderable: false` 并带一句
 *      给用户看的原因，`normalizePluginExportRequest()` 把那句话原样退回去。
 *      **静默失败与空文件都算红**——那正是「点下去没反应」。
 *   2. 导出链实现了某个形态 → 清册里必须有人声明它。没人声明的渲染器是
 *      死代码，说明形态表与文档已经对不上了。
 *
 * 声明为 `renderable: false` 的形态还要再核一次「真的没实现」：渲染器若其实
 * 渲得出来，说明形态表写陈旧了，用户被白挡在门外，同样判红。
 *
 * 对账是**真的渲一遍**，不是查表：每一种声明可导出的形态都要当场产出字节。
 * 因此本函数是异步的（pdf 那一档要先取回随包字形子集），与 oceandino 仓那份
 * 派生视图的逐条比对在 `tests/plugin-export.test.mjs` 里。
 */

import {
  PLUGIN_EXPORT_CATALOG,
  PLUGIN_EXPORT_FORMS,
  exportKindsForPlugin,
  normalizePluginExportRequest,
  pluginExportForm,
  type NormalizedPluginExportRequest,
  type PluginExportData,
  type PluginExportFormId,
  type PluginExportRequest,
} from "./plugin-export-contract";
import { renderPluginExport } from "./plugin-export-render";

export type PluginExportAuditCode =
  /** 清册声明了一个形态表里没有的取值。 */
  | "unknown-form"
  /** 清册里这一条一种形态都没声明，导出入口没有可渲染的落点。 */
  | "no-form-declared"
  /** 声明可渲染，实际渲不出字节。 */
  | "declared-not-implemented"
  /** 渲染器在，却没有任何工具声明这个形态。 */
  | "implemented-not-declared"
  /** 声明不可渲染，却没说清缺什么，或者拒绝时不把原因交给用户。 */
  | "silent-rejection"
  /** 声明不可渲染，实际已经渲得出来了：形态表陈旧，用户被白挡。 */
  | "stale-gap";

export interface PluginExportAuditIssue {
  /** 落在具体工具上的问题带 id；形态表整体的问题为空串。 */
  pluginId: string;
  form: string;
  code: PluginExportAuditCode;
  detail: string;
}

/** 对账用的最小载荷：够走完一次真实渲染，不掺任何工具自己的形状。 */
const PROBE_DATA: PluginExportData = {
  columns: [
    { key: "item", label: "条目", type: "text" },
    { key: "value", label: "数值", type: "number" },
  ],
  rows: [
    ["对账样本", 1],
    ["对账样本 <二>", 2],
  ],
  totals: [{ label: "合计", value: 3 }],
  notes: ["清册与导出链的对账样本。"],
};

function probeRequest(
  pluginId: string,
  form: PluginExportFormId,
): PluginExportRequest {
  return {
    sourceId: pluginId,
    sourceLabel: PLUGIN_EXPORT_CATALOG[pluginId]?.label || pluginId,
    sourceKind: "standalone",
    form,
    title: "导出对账",
    siteId: "home",
    exportedAt: "2026-01-01T00:00:00.000Z",
    data: PROBE_DATA,
  };
}

/** 绕过判据直接组一份归一后的请求：用来验「不可渲染」那几种是真的没实现。 */
function forcedNormalized(
  pluginId: string,
  form: PluginExportFormId,
): NormalizedPluginExportRequest | null {
  const resolved = pluginExportForm(form);
  if (!resolved) return null;
  const request = probeRequest(pluginId, form);
  return { ...request, form: resolved, exportedAt: request.exportedAt || "" };
}

async function auditDeclaredForm(
  pluginId: string,
  form: PluginExportFormId,
): Promise<PluginExportAuditIssue[]> {
  const issues: PluginExportAuditIssue[] = [];
  const resolved = pluginExportForm(form);
  if (!resolved) {
    issues.push({
      pluginId,
      form,
      code: "unknown-form",
      detail: `清册声明了 ${form}，形态表里没有这个取值，导出链无从实现。`,
    });
    return issues;
  }
  const normalized = normalizePluginExportRequest(probeRequest(pluginId, form));
  if (resolved.renderable) {
    if (!normalized.ok) {
      issues.push({
        pluginId,
        form,
        code: "declared-not-implemented",
        detail: `声明可导出，判据却拒绝了：${normalized.error}`,
      });
      return issues;
    }
    let byteLength = 0;
    try {
      byteLength = (await renderPluginExport(normalized.request)).bytes.length;
    } catch (error) {
      issues.push({
        pluginId,
        form,
        code: "declared-not-implemented",
        detail: `声明可导出，渲染器抛错：${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      return issues;
    }
    if (byteLength <= 0) {
      issues.push({
        pluginId,
        form,
        code: "declared-not-implemented",
        detail: "声明可导出，渲染器却产出零字节。",
      });
    }
    return issues;
  }
  // 到这里是「清册声明了、本波渲不出」的缺口。缺口本身不判红，
  // 沉默才判红：用户必须当场看到一句说清缺什么的话。
  if (!resolved.unavailableReason.trim()) {
    issues.push({
      pluginId,
      form,
      code: "silent-rejection",
      detail: "形态表把它标成渲不出，却没写缺什么。",
    });
  }
  if (normalized.ok) {
    issues.push({
      pluginId,
      form,
      code: "silent-rejection",
      detail: "形态表把它标成渲不出，判据却放行了，用户会拿到一个空产物。",
    });
  } else if (
    normalized.code !== "form-not-renderable" ||
    normalized.error !== resolved.unavailableReason
  ) {
    issues.push({
      pluginId,
      form,
      code: "silent-rejection",
      detail: `拒绝时没把原因原样交给用户：code=${normalized.code}，文案「${normalized.error}」。`,
    });
  }
  const forced = forcedNormalized(pluginId, form);
  if (forced) {
    try {
      const bytes = (await renderPluginExport(forced)).bytes;
      if (bytes.length > 0) {
        issues.push({
          pluginId,
          form,
          code: "stale-gap",
          detail: `形态表说渲不出，渲染器却产出了 ${bytes.length} 字节：形态表陈旧，用户被白挡在门外。`,
        });
      }
    } catch {
      // 渲染器抛错才是「真的没实现」，与形态表一致。
    }
  }
  return issues;
}

/**
 * 跑一遍全清册。返回空数组即两边对得上；任何一条都足以判红，
 * 机检在 `tests/plugin-export.test.mjs`。
 *
 * 异步是因为它真的把每一种形态都渲一遍，pdf 那一档要先载入字形子集。
 */
export async function auditPluginExportCatalog(): Promise<
  readonly PluginExportAuditIssue[]
> {
  const issues: PluginExportAuditIssue[] = [];
  const declaredForms = new Set<string>();
  for (const pluginId of Object.keys(PLUGIN_EXPORT_CATALOG)) {
    const kinds = exportKindsForPlugin(pluginId);
    if (!kinds.length) {
      issues.push({
        pluginId,
        form: "",
        code: "no-form-declared",
        detail: "清册里这一条一种导出形态都没有声明，导出入口无从渲染。",
      });
      continue;
    }
    for (const form of kinds) {
      declaredForms.add(form);
      issues.push(...(await auditDeclaredForm(pluginId, form)));
    }
  }
  for (const form of PLUGIN_EXPORT_FORMS) {
    if (declaredForms.has(form.id)) continue;
    issues.push({
      pluginId: "",
      form: form.id,
      code: "implemented-not-declared",
      detail: `形态表里有 ${form.id}，清册里没有任何一条声明它，这是一条没人认领的实现。`,
    });
  }
  return issues;
}

/** 一行一条的可读报告，报错信息里直接用。 */
export function formatPluginExportAudit(
  issues: readonly PluginExportAuditIssue[],
): string {
  return issues
    .map(
      (issue) =>
        `${issue.pluginId || "<形态表>"} / ${issue.form || "<无>"} [${
          issue.code
        }] ${issue.detail}`,
    )
    .join("\n");
}
