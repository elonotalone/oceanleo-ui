/**
 * L1「问 AI」：把当前选区编进一句指令。挂点在 AgentChat 输入区；
 * 浮条上的入口要动 SelectionToolbar，已写入 request。
 */
import { formatSelectionContext, type AgentSelection } from "../agent-review/selection-bridge";

export function askAiPrompt(question: string, selection: AgentSelection | null): string {
  const q = String(question || "").trim();
  const block = formatSelectionContext(selection);
  if (!q) return block;
  if (!block) return q;
  return `${q}\n\n${block}`;
}
