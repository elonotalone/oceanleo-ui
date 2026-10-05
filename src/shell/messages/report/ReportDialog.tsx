"use client";

// 举报消息 / 人 / 群（可同时拉黑）。占位，由 W07 实现（work-chat 契约 §8.2）。

export interface ReportDialogProps {
  target: { kind: "message" | "user" | "conversation"; id: string; label?: string };
  onClose: () => void;
}

export function ReportDialog(_props: ReportDialogProps) {
  return null;
}
