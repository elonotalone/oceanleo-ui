"use client";
import { useMemo } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { taskAttachmentRoute } from "../../lib/task-content-path";
import { viewBlocks, type AcpLabels, type AcpBlock } from "../../acp/messages";
import type { AcpView } from "../../acp/types";
import type { TranscriptItem } from "./TranscriptStream";
import { acpTranscriptItems } from "./adapters";

export function useAcpTranscriptAdapter(view: AcpView, taskId?: string, provided?: readonly TranscriptItem<AcpBlock>[]) {
  const tt = useUI();
  const labels: AcpLabels = useMemo(
    () => ({
      gap: (count) => tt("此处省略 {count} 条", { count }),
      oversize: (bytes) => tt("此处一行输出过大（{bytes} 字节），未显示", { bytes }),
      exit: (code, signal) => tt("程序已退出（{detail}）", { detail: signal ? `signal ${signal}` : `code ${code ?? "?"}` }),
      stopReason: (reason) => tt("本轮结束：{reason}", { reason }),
      cancelled: tt("已停止生成"),
      settingRefused: (message) => tt("设置没有生效：{message}", { message }),
      modelRetry: tt("模型连接中断，正在重试"),
      permissionPrompt: tt("请确认后继续。"),
      backgroundTask: (name, state) => {
        const stateText = state === "completed" || state === "complete" ? tt("已完成")
          : state === "failed" ? tt("已失败")
            : state === "stopped" || state === "cancelled" || state === "canceled" ? tt("已停止")
              : tt(state);
        return `${tt("后台任务")} · ${name} · ${stateText}`;
      },
    }),
    [tt],
  );
  const blocks = useMemo(() => provided ? [] : viewBlocks(view, labels).map(block => {
    if (!taskId || block.type !== "bubble" || !block.message.meta?.attachments?.length) return block;
    const attachments = block.message.meta.attachments.map(attachment => {
      const url = taskAttachmentRoute({ taskId, kind: "frames", rowId: block.message.id,
        artifactId: attachment.artifact_id || "", revisionId: attachment.revision_id });
      return url ? { ...attachment, url } : attachment;
    });
    return { ...block, message: { ...block.message, meta: { ...block.message.meta, attachments } } };
  }), [view, labels, taskId, provided]);
  return useMemo(() => provided ?? acpTranscriptItems(blocks), [blocks, provided]);
}
