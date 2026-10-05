"use client";

// 输入框「+」→ 分享工作回放（W09 挂）。占位，由 W05 实现（work-chat 契约 §8.2）。
import type { ImCard } from "../../../lib/im/types";

export interface ReplayPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onPick: (card: ImCard) => void;
}

export function ReplayPickerDialog(_props: ReplayPickerDialogProps) {
  return null;
}
