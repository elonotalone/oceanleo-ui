/**
 * agent 取指令面的**唯一**入口，语义是失败即关闭。
 *
 * 为什么要有这个函数（`PARENT-red-1`，2026-09-04）：
 * 调用点原来写的是
 *
 *     readEditorCommandSurface(surfaceReader) || currentPluginCommandSurface()
 *
 * 而 `currentPluginCommandSurface()` 交出来的是 `guarded(surface)` —— 只有参数校验层，
 * **没有审阅闸**。于是「闸没装上」不是兜到「右边没开编辑器」，而是兜到一份能当场写文档
 * 的原始面：失败即开放。`PluginAgentPanel`（13 件编辑器共用的「AI 助手」抽屉）既不传
 * reader、也不调 `installAgentReviewGate()`，正好落在那条回落上。
 *
 * 所以取面这件事只有两种结果：**拿到包过闸的面，或者拿不到面**。
 * 不需要谁先把闸装好——闸就在取面处就地包上，`installAgentReviewGate()` 只是让别的
 * 调用方（直接读 `readEditorCommandSurface` 的宿主）也能拿到同一份包法。
 */
import {
  readEditorCommandSurface,
  type EditorCommandSurfaceReader,
} from "../../lib/fn-agent";
import { currentPluginCommandSurface } from "../plugin-command/registry";
import type { PluginCommandSurface } from "../plugin-command/types";
import { gateSurfaceForAgent } from "./gate";
import { hostReviewSession, type ReviewSession } from "./session";

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
  const real = readEditorCommandSurface(explicit) || currentPluginCommandSurface();
  if (!real) return null;
  return gateSurfaceForAgent(real, session);
}
