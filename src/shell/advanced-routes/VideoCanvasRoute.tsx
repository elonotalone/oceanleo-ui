"use client";

/**
 * 工作流件的工作台路由（A-65）。
 *
 * 用户打开一张流程图时，工作台走这里——不是只在测试里直接挂舞台。
 * 普通模式仍是 LangflowProStage 里的画布槽（video 站 React Flow 经
 * EmbedEditorPane 注入）；专业模式才挂 Langflow iframe。
 *
 * 这一层必须静态 import 舞台：写成 next/dynamic 或 React.lazy 的话 jsdom 挂不上，
 * 闸就又会退化成「只锁组件」（A-55 / A-65）。
 */
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { LangflowProStage } from "../workflow-carrier/langflow-pro-stage";

export function VideoCanvasRoute(props: AdvancedContentWorkbenchProps) {
  return <LangflowProStage {...props} />;
}
