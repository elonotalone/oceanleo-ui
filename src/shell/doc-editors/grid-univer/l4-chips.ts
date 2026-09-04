/**
 * L4：表格的 agent 快捷动作（chips）与「agent 改动进审阅」的提案。
 *
 * 两件事都走契约 v2（`signals/W01-interface.md` §2.3 §3），不自造格式：
 * chips 用 `EditorAgentChip` 并过 `validAgentChips`，提案用 `EditorReviewProposal`
 * 并过 `validReviewProposal`。**校验器是宿主那一份，不是我复制的一份**——
 * 复制一份的结果必然是两边慢慢长歪，而歪的那天没人会收到通知。
 *
 * `appliesTo` 里的取值不是我起的名，是 `GridContextToolbar.tsx` 今天真的发出去的
 * `SelectionContext.kind`：`grid-cell` / `grid-range` / `grid-row` / `grid-column` /
 * `grid-sheet`。写错一个字，chip 就永远不出现，而且没有任何报错。
 */
import {
  CHIP_ANY_SELECTION,
  validAgentChips,
  validReviewProposal,
  type EditorAgentChip,
  type EditorReviewObjectChange,
  type EditorReviewProposal,
// 目录 import 在 Node ESM 下是 ERR_UNSUPPORTED_DIR_IMPORT（见 chrome.ts 同处注释）。
} from "../../hosted-editor/index";
import type { SelectionContext } from "../../selection-context-types";

/** 表格会发出的五种选区 kind。 */
export const GRID_SELECTION_KINDS = [
  "grid-cell",
  "grid-range",
  "grid-row",
  "grid-column",
  "grid-sheet",
] as const;

const ANY_RANGE = ["grid-cell", "grid-range", "grid-column", "grid-row"];

/**
 * 八个快捷动作（规范 §3 表格那一行，上限 8）。
 *
 * **与规范原文有一处出入，写在这里而不是藏着**：原文第八个是「透视（Pro）」。
 * 透视表在 Univer 里属于 `@univerjs/preset-sheets-advanced`，那是专有包，
 * 没有 license key 时产品带水印（仲裁 A-13 明令不许 import）。
 * 所以第八个换成「按列汇总成新表」——用 OSS 面就能做到的那部分能力。
 * 这是**缩小承诺**，不是漏做：`_COMMON.md` §3 允许，条件是写清楚为什么。
 */
export const GRID_AGENT_CHIPS: readonly EditorAgentChip[] = [
  {
    id: "grid.chip.chart",
    label: "一键成图",
    kind: "generate",
    appliesTo: ["grid-range", "grid-column", "grid-sheet"],
    prompt:
      "请为这段表格数据推荐最合适的图表类型并生成图表：{selection}。说明你为什么选这种图。",
  },
  {
    id: "grid.chip.summarize-column",
    label: "汇总一列",
    kind: "summarize",
    appliesTo: ["grid-column", "grid-range"],
    prompt: "请汇总这一列的数据（合计/均值/最大最小/空值数）：{selection}。",
  },
  {
    id: "grid.chip.clean",
    label: "清洗数据",
    kind: "cleanup",
    appliesTo: ANY_RANGE,
    prompt:
      "请清洗这段数据：去掉首尾空格、统一日期与数字格式、标出明显异常值。只给改动清单，不要直接改：{selection}。",
  },
  {
    id: "grid.chip.split-columns",
    label: "拆分/合并列",
    kind: "layout",
    appliesTo: ["grid-column", "grid-range"],
    prompt: "请把这一列按合适的分隔符拆成多列，或把多列合成一列：{selection}。",
  },
  {
    id: "grid.chip.translate-header",
    label: "翻译表头",
    kind: "translate",
    appliesTo: ["grid-row", "grid-range", "grid-sheet"],
    prompt: "请把这些表头翻译成英文，保持列的顺序不变：{selection}。",
  },
  {
    id: "grid.chip.formula",
    label: "生成公式",
    kind: "generate",
    appliesTo: [CHIP_ANY_SELECTION],
    prompt:
      "我要在 {selection} 处做这件事，请给出对应的表格公式并解释每一段的含义：",
  },
  {
    id: "grid.chip.duplicates",
    label: "查重",
    kind: "analyze",
    appliesTo: ANY_RANGE,
    prompt: "请找出这段数据里的重复行/重复值，并说明按哪几列判定的：{selection}。",
  },
  {
    id: "grid.chip.rollup",
    label: "按列汇总成新表",
    kind: "summarize",
    appliesTo: ["grid-range", "grid-sheet"],
    prompt:
      "请按我指定的分组列，把这段数据汇总成一张新表（分组列 + 合计/计数）：{selection}。",
  },
];

/**
 * chips 是不是合法的。**跑一次就能知道**，所以模块加载时就跑：
 * 一个写错 kind 的 chip 与一个不存在的 chip，对用户是一样的（都不出现），
 * 但对维护的人差别很大——前者今天就该炸在这里，而不是三周后被人发现少一个按钮。
 */
export function gridAgentChipsAreValid(): boolean {
  return validAgentChips(GRID_AGENT_CHIPS);
}

/** `tools-manifest` v2 的那两个可选字段，表格这一份。 */
export function gridToolsManifestChips(): {
  manifestVersion: 2;
  chips: EditorAgentChip[];
} {
  return { manifestVersion: 2, chips: [...GRID_AGENT_CHIPS] };
}

// ── agent 改动 → L4 审阅 ────────────────────────────────────────────────────

export interface GridCellChange {
  /** A1 表示法，给人看的。 */
  address: string;
  before: string;
  after: string;
}

/**
 * 把 agent 打算写的一批单元格，包成一条**待审阅**的提案。
 *
 * 表格给的是 `objects[]` 而不是文本 `diff`：一格一条，谁变成什么一眼可数。
 * 契约要求两者恰好给一个——两个都给等于两份会互相矛盾的事实源。
 *
 * `revision` 传的是**提案尚未落地时**的那一版。规范 §7 判据 3：接受前 revision
 * 不许前进。所以这个函数只**造消息**，一个字都不写进工作簿；真正调
 * `univerAPI` 落地是在宿主回 `accept` 之后（`GridUniverStage.tsx` 那一侧）。
 */
export function buildGridReviewProposal(input: {
  proposalId: string;
  commandId: string;
  changes: readonly GridCellChange[];
  revision: number;
  targetSelection?: SelectionContext | null;
  summaryBefore?: string;
  summaryAfter?: string;
}): EditorReviewProposal | null {
  const changes = input.changes || [];
  if (changes.length === 0 || changes.length > 200) return null;
  const objects: EditorReviewObjectChange[] = changes.map((change) => ({
    id: change.address,
    op: "update",
    label: `${change.address}`,
    before: change.before,
    after: change.after,
  }));
  const proposal = {
    proposalId: input.proposalId,
    commandId: input.commandId,
    summary: {
      before:
        input.summaryBefore ||
        `${changes.length} 个单元格保持原值`,
      after:
        input.summaryAfter ||
        `${changes.length} 个单元格将被改写（${changes
          .slice(0, 3)
          .map((change) => change.address)
          .join("、")}${changes.length > 3 ? " 等" : ""}）`,
    },
    objects,
    targetSelection: input.targetSelection ?? null,
    revision: input.revision,
  } as EditorReviewProposal;
  return validReviewProposal(proposal) ? proposal : null;
}
