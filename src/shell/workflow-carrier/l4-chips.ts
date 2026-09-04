/**
 * L4：工作流的 agent 快捷动作 chips。
 *
 * 前六条 id 对齐 W02 catalog 的 fallback（`workflow.chip.gen` … `export`），
 * 再补两条占满上限 8：精简节点、检查连线。校验器只用宿主契约 v2 那一份。
 *
 * 这些 chips **自己不改图**。agent 拿它们当提示词入口；真要改节点/连线，
 * 必须走 `routeWorkflowChip()` 送出的 `review-proposal`（A-49 / A-53）。
 */
import {
  CHIP_ANY_SELECTION,
  validAgentChips,
  validReviewProposal,
  type EditorAgentChip,
  type EditorReviewObjectChange,
  type EditorReviewProposal,
} from "../hosted-editor/index";
import type { SelectionContext } from "../selection-context-types";

export const WORKFLOW_EDITOR_ID = "workflow";
export const WORKFLOW_SELECTION_KIND_NODE = "workflow-node";
export const WORKFLOW_SELECTION_KIND_EDGE = "workflow-edge";

export const WORKFLOW_AGENT_CHIPS: readonly EditorAgentChip[] = [
  {
    id: "workflow.chip.gen",
    label: "生成流程",
    kind: "generate",
    appliesTo: [CHIP_ANY_SELECTION],
    icon: "ai",
    prompt:
      "按用户目标生成一张流程图：列出将新增的节点 kind、端口和连线，不要直接改图。当前图：{document}",
  },
  {
    id: "workflow.chip.explain",
    label: "解释流程",
    kind: "summarize",
    appliesTo: [CHIP_ANY_SELECTION],
    icon: "note",
    prompt:
      "用三到五句话解释这张流程图在做什么、数据从哪进、从哪出。图：{document}",
  },
  {
    id: "workflow.chip.prompt",
    label: "优化提示词",
    kind: "rewrite",
    appliesTo: [WORKFLOW_SELECTION_KIND_NODE, CHIP_ANY_SELECTION],
    icon: "font",
    prompt:
      "优化选中节点里的提示词，只给新旧对照，不要直接写进节点参数：{selection}",
  },
  {
    id: "workflow.chip.errors",
    label: "加错误处理",
    kind: "layout",
    appliesTo: [CHIP_ANY_SELECTION],
    icon: "layers",
    prompt:
      "给这张图加错误处理：哪些节点该有失败分支、失败时接到哪。只给改动清单：{document}",
  },
  {
    id: "workflow.chip.cron",
    label: "转为定时任务",
    kind: "layout",
    appliesTo: [CHIP_ANY_SELECTION],
    icon: "animate",
    prompt:
      "把这张图转成定时任务：建议的 cron、时区和失败重试。不要直接改调度：{document}",
  },
  {
    id: "workflow.chip.export",
    label: "导出 JSON",
    kind: "export",
    appliesTo: [CHIP_ANY_SELECTION],
    icon: "download",
    prompt:
      "把当前流程图导出为 Langflow flow JSON。先复述节点数和边数，等确认再给文件。图：{document}",
  },
  {
    id: "workflow.chip.simplify",
    label: "精简节点",
    kind: "cleanup",
    appliesTo: [CHIP_ANY_SELECTION],
    icon: "delete",
    prompt:
      "标出可以合并或删除的节点，说明每处会丢掉什么。不要直接删：{document}",
  },
  {
    id: "workflow.chip.inspect",
    label: "检查连线",
    kind: "analyze",
    appliesTo: [WORKFLOW_SELECTION_KIND_EDGE, CHIP_ANY_SELECTION],
    icon: "link",
    prompt:
      "检查连线：端口类型是否相容、有没有悬空边、分支条件是否写了。选区：{selection}",
  },
];

export function workflowAgentChipsAreValid(): boolean {
  return validAgentChips(WORKFLOW_AGENT_CHIPS as unknown as EditorAgentChip[]);
}

export function workflowToolsManifestChips(): {
  manifestVersion: 2;
  chips: EditorAgentChip[];
} {
  return {
    manifestVersion: 2,
    chips: WORKFLOW_AGENT_CHIPS.map((chip) => ({ ...chip })),
  };
}

export interface WorkflowObjectChange {
  id: string;
  label: string;
  before: string;
  after: string;
}

/**
 * agent 打算改的节点/连线，包成待审阅提案。只造消息，不写图。
 * 契约要求 `objects` 与 `diff` 恰好给一个——流程图给 objects。
 */
export function buildWorkflowReviewProposal(input: {
  proposalId: string;
  commandId: string;
  changes: readonly WorkflowObjectChange[];
  revision: number;
  targetSelection?: SelectionContext | null;
}): EditorReviewProposal | null {
  const changes = input.changes || [];
  if (changes.length === 0 || changes.length > 200) return null;
  const objects: EditorReviewObjectChange[] = changes.map((change) => ({
    id: change.id,
    op: "update",
    label: change.label,
    before: change.before,
    after: change.after,
  }));
  const proposal = {
    proposalId: input.proposalId,
    commandId: input.commandId,
    summary: {
      before: `${changes.length} 处保持原图`,
      after: `${changes.length} 处将被改写`,
    },
    objects,
    targetSelection: input.targetSelection ?? null,
    revision: input.revision,
  } as EditorReviewProposal;
  return validReviewProposal(proposal) ? proposal : null;
}
