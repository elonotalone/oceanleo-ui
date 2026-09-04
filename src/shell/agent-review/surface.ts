/**
 * agent 取指令面的**唯一**入口，语义是失败即关闭。
 *
 * 形状照 A-59 的 `embedEditorFrameSandbox()`：两条来源都先包审阅闸再交出去，
 * 判定顺序本身有闸。`readEditorCommandSurface` 读不到时，旧写法用
 * `|| currentPluginCommandSurface()` 兜到**没包闸**的原始面 —— 那是
 * `PARENT-red-1` 的失败即开放。
 *
 * 两条 if 的顺序是命门：显式 reader（AgentChat 传下来的那份）必须优先于
 * 注册表。对调之后，PluginAgentPanel 那种「不传 reader」不受影响，但
 * AgentChat 传进来的面会被注册表顶掉，用户在全局对话里点头会作用到
 * 另一件编辑器。
 */
import {
  readEditorCommandSurface,
  type EditorCommandSurfaceReader,
} from "../../lib/fn-agent";
import { currentPluginCommandSurface } from "../plugin-command/registry";
import type { PluginCommandSurface } from "../plugin-command/types";
import { gateSurfaceForAgent } from "./gate";
import { hostReviewSession, type ReviewSession } from "./session";

export type AgentSurfaceSourceKind = "reader" | "registry" | "none";

export type AgentSurfaceSource = {
  source: AgentSurfaceSourceKind;
  raw: PluginCommandSurface | null;
};

/**
 * 取面来源。两条非空路径的 `raw` 都还没包闸 —— 调用方必须再走
 * `gateSurfaceForAgent`。本函数不负责包闸，好让顺序闸能单独打「对调 if」那一刀。
 */
export function resolveAgentSurfaceSource(
  explicit?: EditorCommandSurfaceReader | null,
): AgentSurfaceSource {
  const fromReader = readEditorCommandSurface(explicit);
  if (fromReader) return { source: "reader", raw: fromReader };
  const fromRegistry = currentPluginCommandSurface();
  if (fromRegistry) return { source: "registry", raw: fromRegistry };
  return { source: "none", raw: null };
}

/**
 * 读「agent 现在能操作的指令面」。
 *
 * 读不到就是右边没开编辑器（`null`），调用方据此告诉用户做不了；
 * 读到了一定是包过审阅闸的那份 —— 包闸是幂等的，宿主已经包过就不会再套一层。
 */
export function readAgentCommandSurface(
  explicit?: EditorCommandSurfaceReader | null,
  session: ReviewSession = hostReviewSession,
): PluginCommandSurface | null {
  const resolved = resolveAgentSurfaceSource(explicit);
  if (!resolved.raw) return null;
  return gateSurfaceForAgent(resolved.raw, session);
}
