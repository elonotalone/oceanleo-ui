"use client";

// 控制方交互层（合同 §3.9：props { participantId, videoEl }，W07 挂在放大视图的共享主位上）。
// 本轮未交付：生成这一层的输出两次被安全分类器中止，W09 按要求不再重写；此前提交过的版本
// （oceanleo-ui 04a40605 及其后修正提交）保留在 git 历史里，待父任务/操作员审阅后决定是否恢复。
// 这里只保留签名，组件不渲染任何东西，W07 的挂载照常通过类型检查。
export interface CallControlLayerProps {
  participantId: string;
  videoEl: HTMLVideoElement | null;
}

export function CallControlLayer(_props: CallControlLayerProps): null {
  return null;
}
