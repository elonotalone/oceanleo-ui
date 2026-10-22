"use client";

/**
 * 工作流件的工作台路由。
 *
 * 用户打开一张流程图时，工作台走这里。编辑面只有 React Flow 画布
 * （本仓 @xyflow/react 本地画布）。
 * 没有专业编辑页。
 *
 * 这一层必须静态 import 舞台：写成 next/dynamic 或 React.lazy 的话 jsdom 挂不上。
 */
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { VideoCanvasStage } from "../workflow-carrier/VideoCanvasStage";

export {
  VIDEO_CANVAS_DUAL_ENGINE_HANDOFF,
  flushVideoCanvasGraph,
  videoCanvasLeavePolicy,
} from "../workflow-carrier/video-canvas-leave";

export function VideoCanvasRoute(props: AdvancedContentWorkbenchProps) {
  return <VideoCanvasStage {...props} />;
}
