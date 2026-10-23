"use client";

/**
 * 视频画布件的工作台路由。
 *
 * 用户打开一张视频画布时，工作台走这里。编辑面只有本仓 @xyflow/react 本地画布：
 * - 库里的 v2 工程（`oceanleo.video.project.v2`，库里在用的全是它）→ `VideoProjectStage`，
 *   直接编辑 v2 文档并保存成新的 typed revision；
 * - 其余（未入库的 v1 本地草稿图）→ `VideoCanvasStage`。
 * 没有专业编辑页。
 *
 * 这一层必须静态 import 舞台：写成 next/dynamic 或 React.lazy 的话 jsdom 挂不上。
 */
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { VideoCanvasStage } from "../workflow-carrier/VideoCanvasStage";
import { VideoProjectStage } from "../workflow-carrier/VideoProjectStage";
import { isNativeVideoProjectItem } from "../workflow-carrier/workflow-graph-source";

export {
  VIDEO_CANVAS_DUAL_ENGINE_HANDOFF,
  flushVideoCanvasGraph,
  videoCanvasLeavePolicy,
} from "../workflow-carrier/video-canvas-leave";

export function VideoCanvasRoute(props: AdvancedContentWorkbenchProps) {
  return isNativeVideoProjectItem(props.item) ? (
    <VideoProjectStage {...props} />
  ) : (
    <VideoCanvasStage {...props} />
  );
}
