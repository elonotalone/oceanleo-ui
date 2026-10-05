"use client";

// 编辑器动作栏上的「生成回放」（W11 挂）。占位，由 W05 实现（work-chat 契约 §8.2）。
import type { ImEditorKind } from "../../../lib/im/types";

export interface GenerateReplayButtonProps {
  resource: { kind: "artifact"; id: string; title: string; editorKind: ImEditorKind };
}

export function GenerateReplayButton(_props: GenerateReplayButtonProps) {
  return null;
}
