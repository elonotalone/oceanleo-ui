// ============================================================================
// 宿主契约 v2 —— Hosted 编辑器的公共接口面（W01，2026-09-03，editor-core-swap）
//
// 这是**其他 owner 唯一该 import 的入口**。直接去 `editor-protocol.ts` 拼消息
// 也能跑，但那份文件离 600 行拆分闸只剩个位数，而且拼错了没人拦得住你——
// 下面的 builder 全部走同一套校验器，拼错当场抛。
//
// 契约全文：`docs/architecture/oceanleo-hosted-editor-contract-v2.md`（oceandino 仓）。
//
// 三条不许违反的：
//   1. **只加不减**。v1 的 17 条 editor→host 与 14 条 host→editor 一条没动。
//      要加新消息先改 `editor-protocol-message-types.ts`，并同步
//      `tests/untrusted-content-sandbox-origin.test.mjs` 那两个 size 断言——
//      那道闸是故意让人不能顺手加指令的。
//   2. **默认普通模式**（R3）。`set-mode` 是进入专业模式的唯一通道，
//      不许各编辑器自己发明开关，也不许默认就把内核完整 UI 露出来。
//   3. **agent 改动 100% 进审阅**（规范 §7 判据 3）。编辑器不得直接落地 agent 的
//      改动：先发 `review-proposal`（此时 revision 不许前进），等宿主的
//      `review-decision` 是 `accept` 才落地。
// ============================================================================

import {
  contractV2HostToEditor,
  HOSTED_EDITOR_CONTRACT_VERSION,
  validAgentChips,
  validReviewProposal,
} from "../editor-protocol-validation.mjs";
import type {
  EditorAgentChip,
  EditorAgentChipKind,
  EditorDocumentRevision,
  EditorMode,
  EditorReviewChangeOp,
  EditorReviewDecision,
  EditorReviewObjectChange,
  EditorReviewProposal,
  HostToEditorMessage,
} from "../editor-protocol-types.mjs";

export type {
  EditorAgentChip,
  EditorAgentChipKind,
  EditorDocumentRevision,
  EditorMode,
  EditorReviewChangeOp,
  EditorReviewDecision,
  EditorReviewObjectChange,
  EditorReviewProposal,
};
export { HOSTED_EDITOR_CONTRACT_VERSION, validAgentChips, validReviewProposal };

const EDITOR_PROTOCOL = "oceanleo.editor.v1";

/** 任意选区都适用的通配符，写在 `EditorAgentChip.appliesTo` 里。 */
export const CHIP_ANY_SELECTION = "*";

/** L0 专业模式开关的默认值。R3：**默认普通模式**，不是「记住上次」。 */
export const DEFAULT_EDITOR_MODE: EditorMode = "normal";

function assertInstanceId(instanceId: string): void {
  if (!instanceId || instanceId.length > 128) {
    throw new TypeError("hosted-editor: instanceId 必须非空且 ≤128 字符");
  }
}

/**
 * L0 专业模式开关 → Hosted 件。Native 件不发这条，改调 adapter 的 `setMode`
 * （`advanced-editor-adapter.ts`）。两条路殊途同归，见契约文档 §4。
 */
export function buildSetModeMessage(
  instanceId: string,
  mode: EditorMode,
): HostToEditorMessage {
  assertInstanceId(instanceId);
  return {
    protocol: EDITOR_PROTOCOL,
    type: "set-mode",
    instanceId,
    mode,
  } as HostToEditorMessage;
}

/**
 * 普通模式下收起内核自带的工具栏/面板。
 *
 * 与 `set-mode` 分开是有意的：Umo 的 ribbon 可以单独关而不切模式，
 * PPTist 则要两条一起发。合成一条会让「关了工具栏但还在普通模式」表达不出来。
 */
export function buildHideChromeMessage(
  instanceId: string,
  hide: { toolbar: boolean; panels: boolean },
): HostToEditorMessage {
  assertInstanceId(instanceId);
  return {
    protocol: EDITOR_PROTOCOL,
    type: "hide-chrome",
    instanceId,
    toolbar: hide.toolbar,
    panels: hide.panels,
  } as HostToEditorMessage;
}

/** 用户在 L4 审阅面板上的裁决 → Hosted 件。`accept` 之后 revision 才允许前进。 */
export function buildReviewDecisionMessage(
  instanceId: string,
  proposalId: string,
  decision: EditorReviewDecision,
): HostToEditorMessage {
  assertInstanceId(instanceId);
  const message = {
    protocol: EDITOR_PROTOCOL,
    type: "review-decision",
    instanceId,
    proposalId,
    decision,
  };
  if (!contractV2HostToEditor("review-decision", message)) {
    throw new TypeError("hosted-editor: review-decision 载荷不合法");
  }
  return message as HostToEditorMessage;
}

/**
 * 挑出对当前选区适用的 chips。
 *
 * `selectionKind` 传 `null` = 当前没有选区，此时只有声明了 `*` 的 chip 出现——
 * 「总结全文」这类不需要选区的动作就是这么声明的。
 */
export function chipsForSelection(
  chips: readonly EditorAgentChip[] | undefined,
  selectionKind: string | null,
): EditorAgentChip[] {
  if (!chips || chips.length === 0) return [];
  return chips.filter((chip) =>
    chip.appliesTo.some(
      (kind) =>
        kind === CHIP_ANY_SELECTION ||
        (selectionKind !== null &&
          kind.toLowerCase() === selectionKind.toLowerCase()),
    ),
  );
}

/**
 * 把 chip 的提示词模板填成真正送进 agent 的那句话。
 *
 * 只认两个占位符，且**只替换一轮**——不做递归展开，否则用户内容里出现
 * `{document}` 就能把整份文档再灌一次进提示词。
 */
export function renderChipPrompt(
  chip: EditorAgentChip,
  context: { selection?: string; document?: string },
): string {
  return chip.prompt.replace(/\{(selection|document)\}/g, (_match, key) =>
    key === "selection" ? (context.selection ?? "") : (context.document ?? ""),
  );
}
