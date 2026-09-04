/**
 * L4：图表的 agent 快捷动作（chips）与审阅提案。
 *
 * 校验器只用宿主契约 v2 那一份（`validAgentChips` / `validReviewProposal`），
 * 不复制。选区 kind 与 `ChartContextToolbar` 发出的 `chart` / `chart-series` 对齐。
 *
 * 八条照抄五层规范 §3 图表那一行，补上「从表格数据成图」凑满 8（规范列了 7 个
 * 短语；上限是 8）。
 */
import {
  CHIP_ANY_SELECTION,
  validAgentChips,
  validReviewProposal,
  type EditorAgentChip,
  type EditorReviewProposal,
} from "../hosted-editor/index";
import type { SelectionContext } from "../selection-context-types";

export const CHART_SELECTION_KINDS = ["chart", "chart-series"] as const;

export const CHART_AGENT_CHIPS: readonly EditorAgentChip[] = [
  {
    id: "chart.chip.advise",
    label: "推荐图型",
    kind: "analyze",
    appliesTo: [CHIP_ANY_SELECTION],
    prompt:
      "请根据当前图表数据推荐最合适的图型，并说明理由。不要自己发明画法，用 AVA 顾问的结论：{document}",
  },
  {
    id: "chart.chip.title",
    label: "改标题与注释",
    kind: "rewrite",
    appliesTo: [CHIP_ANY_SELECTION, "chart"],
    prompt:
      "请改写这张图的标题和注释，让读者一眼看懂在比什么。当前内容：{selection}",
  },
  {
    id: "chart.chip.palette",
    label: "换配色",
    kind: "restyle",
    appliesTo: [CHIP_ANY_SELECTION, "chart", "chart-series"],
    prompt: "请为这张图换一套对比足够、打印也清楚的配色：{document}",
  },
  {
    id: "chart.chip.trend",
    label: "加趋势线",
    kind: "generate",
    appliesTo: ["chart-series", "chart"],
    prompt: "请给当前系列加一条趋势或平均线，并说明它代表什么：{selection}",
  },
  {
    id: "chart.chip.dual-axis",
    label: "双轴",
    kind: "layout",
    appliesTo: ["chart", CHIP_ANY_SELECTION],
    prompt:
      "如果量纲差得很远（例如金额和增长率），请改成双 Y 轴，并把对应系列绑到副轴：{document}",
  },
  {
    id: "chart.chip.export",
    label: "导出 SVG/PNG",
    kind: "export",
    appliesTo: [CHIP_ANY_SELECTION],
    prompt: "请导出这张图的 SVG 和 PNG，并说明各自适合嵌到哪里：{document}",
  },
  {
    id: "chart.chip.caption",
    label: "生成解读文字",
    kind: "summarize",
    appliesTo: [CHIP_ANY_SELECTION],
    prompt:
      "请用三句话解读这张图：比的是什么、最醒目的一点、需要小心的口径。数据：{document}",
  },
  {
    id: "chart.chip.from-range",
    label: "从表格数据成图",
    kind: "generate",
    appliesTo: [CHIP_ANY_SELECTION],
    prompt:
      "这是表格选区快照，请经图表 typed artifact（option + 数据）做成图，不要 import 表格编辑器：{selection}",
  },
];

export function chartAgentChipsAreValid(): boolean {
  return validAgentChips(CHART_AGENT_CHIPS);
}

export function chartToolsManifestChips(): {
  manifestVersion: 2;
  chips: EditorAgentChip[];
} {
  return { manifestVersion: 2, chips: [...CHART_AGENT_CHIPS] };
}

export function buildChartReviewProposal(input: {
  proposalId: string;
  commandId: string;
  before: string;
  after: string;
  revision: number;
  targetSelection?: SelectionContext | null;
}): EditorReviewProposal | null {
  const before = String(input.before || "").slice(0, 2000) || "（空）";
  const after = String(input.after || "").slice(0, 2000) || "（空）";
  const diff = `- ${before.slice(0, 400)}\n+ ${after.slice(0, 400)}`;
  const proposal = {
    proposalId: input.proposalId,
    commandId: input.commandId,
    summary: { before, after },
    diff,
    targetSelection: input.targetSelection ?? null,
    revision: input.revision,
  } as EditorReviewProposal;
  return validReviewProposal(proposal) ? proposal : null;
}
