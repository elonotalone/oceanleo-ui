/**
 * 工作流 chips / agent 指令的**唯一**写入决策点。
 *
 * 判定写成返回 route 的纯函数，而不是舞台里的一个 `if`（A-53）：
 * 写成 `if` 的话，一句 `if (false && route.kind === "review")` 就能悄悄绕过，
 * 而任何「文件里出现过 routeWorkflowChip」形态的判据照样绿。
 * 绕过本函数必须拆掉整个 `review` 分支，那是闸抓得住的形状。
 *
 * 默认送审。只有信封上显式盖了 `user|human|l1|l2` 才直行（A-49）。
 * 缺章、拼错、大小写、非字符串，一律当 agent。
 */
import { submitRawReviewProposal } from "../agent-review/inbox";
import type { VideoCanvasGraph } from "./video-canvas-schema";
import {
  WORKFLOW_AGENT_CHIPS,
  WORKFLOW_EDITOR_ID,
  buildWorkflowReviewProposal,
  type WorkflowObjectChange,
} from "./l4-chips";
import type { EditorReviewProposal } from "../hosted-editor/index";

export const WORKFLOW_HUMAN_ORIGINS: ReadonlySet<string> = new Set([
  "user",
  "human",
  "l1",
  "l2",
]);

export type WorkflowChipRoute =
  | { kind: "review"; proposal: EditorReviewProposal; chipId: string }
  | { kind: "execute"; chipId: string }
  | { kind: "reject"; reason: string; chipId: string };

export interface WorkflowChipIntent {
  chipId: string;
  /** 出处章。只有闭集里的字符串才算人点的。 */
  origin?: unknown;
  graph: VideoCanvasGraph;
  revision: number;
  /**
   * agent 提议的下一张图。只有 route 是 `execute` 时才会被 `dispatch` 采用。
   * 送审时即使带了也不写——否则「提案里带着图」就等于已经落地。
   */
  proposedGraph?: VideoCanvasGraph;
  changes?: readonly WorkflowObjectChange[];
}

const CHIP_BY_ID = new Map(
  WORKFLOW_AGENT_CHIPS.map((chip) => [chip.id, chip] as const),
);

export function isWorkflowHumanStamp(origin: unknown): boolean {
  return typeof origin === "string" && WORKFLOW_HUMAN_ORIGINS.has(origin);
}

function clip(value: string, max: number): string {
  const text = String(value ?? "");
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function defaultChanges(intent: WorkflowChipIntent): WorkflowObjectChange[] {
  if (intent.changes && intent.changes.length > 0) {
    return [...intent.changes];
  }
  const chip = CHIP_BY_ID.get(intent.chipId);
  const label = chip?.label || intent.chipId;
  const nodes = intent.graph.nodes?.length || 0;
  const edges = intent.graph.edges?.length || 0;
  return [
    {
      id: clip(intent.chipId, 200),
      label: clip(label, 200),
      before: `当前图 ${nodes} 个节点、${edges} 条连线`,
      after: `将执行「${label}」`,
    },
  ];
}

/**
 * 一条 chip / agent 指令该走哪条路。
 *
 * **默认 `review`。** 只有显式人类章才 `execute`。认不出的 id 是 `reject`，
 * 不是「没登记就当成人点的」——那是 V3-red-7 的失败即开放。
 */
export function routeWorkflowChip(intent: WorkflowChipIntent): WorkflowChipRoute {
  const chipId = String(intent.chipId || "");
  const chip = CHIP_BY_ID.get(chipId);
  if (!chip) {
    return {
      kind: "reject",
      chipId,
      reason: `工作流没有「${chipId || "（空）"}」这条快捷动作，图一个节点都没改。`,
    };
  }
  if (isWorkflowHumanStamp(intent.origin)) {
    return { kind: "execute", chipId };
  }
  const proposal = buildWorkflowReviewProposal({
    proposalId: clip(
      `workflow-${chipId}-${intent.revision}-${Date.now().toString(36)}`,
      128,
    ),
    commandId: chipId,
    revision: intent.revision,
    changes: defaultChanges(intent),
  });
  if (!proposal) {
    return {
      kind: "reject",
      chipId,
      reason: "这条改动没法送进审阅（提案没通过契约校验），图一个节点都没改。",
    };
  }
  return { kind: "review", chipId, proposal };
}

export interface WorkflowChipDispatch {
  route: WorkflowChipRoute;
  /** 调度之后的图。送审/拒绝时与入参逐字相同。 */
  graph: VideoCanvasGraph;
  parked: boolean;
}

/**
 * 产品入口：先问 route，再决定写不写。
 *
 * 写图的唯一分岔是 `route.kind === "execute"` 且给了 `proposedGraph`。
 * 把 `if (route.kind === "review")` 改成恒假，闸必须红——图会被偷偷换掉。
 */
export function dispatchWorkflowAgentChip(
  intent: WorkflowChipIntent,
): WorkflowChipDispatch {
  const route = routeWorkflowChip(intent);
  const original = intent.graph;
  if (route.kind === "review") {
    submitRawReviewProposal(route.proposal, {
      liveRevision: intent.revision,
      editorId: WORKFLOW_EDITOR_ID,
    });
    return { route, graph: original, parked: true };
  }
  if (route.kind === "execute" && intent.proposedGraph) {
    return { route, graph: intent.proposedGraph, parked: false };
  }
  return { route, graph: original, parked: false };
}
