"use client";

// 13 个插件共用的 agent 面板。点 edit bar 最右侧的 AI 按钮，左侧操控台就换成它，
// 用户一边和 agent 说话、一边改右边的内容。
//
// 为什么是壳提供而不是每个插件自己接（防漂移的关键）：
// 改造前只有 deck 一个插件写了 `layout.openDrawer("agent")`，而那个抽屉还得由
// deck 的 adapter 自己注册内容。照这个路子走下去，13 个插件会长出 13 份
// 「AI 面板」，各自决定要不要确认卡、要不要带编辑器上下文、要不要只读。
// 所以这里只留一份：agent 形态固定、指令确认固定、上下文来源固定为
// plugin-command 的 `currentPluginCommandSurface()`。
//
// 分工同样固定：本面板**不做生成**（生成走 plugin-ai 的能力契约），
// 它只做「对话 + 通过指令面改文档」。两件事混在一起正是此前漂移的起点。

import { useMemo } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { FunctionAgentChat } from "../FunctionAgentChat";
import type { OpsSchema } from "../../lib/fn-agent";

export interface PluginAgentPanelProps {
  /** 插件 id，用来拼 agentId 并作为会话分区。 */
  editorId: string;
  /** 站点 id；缺省时按插件独立分区，不与别的站串台。 */
  siteId?: string;
  accent?: string;
  /** 面板标题，默认用插件名。 */
  label?: string;
  taskId?: string | null;
  onTaskIdChange?: (taskId: string | null) => void;
}

export function PluginAgentPanel({
  editorId,
  siteId = "",
  accent = "var(--pchrome-accent, #6d5dfc)",
  label,
  taskId,
  onTaskIdChange,
}: PluginAgentPanelProps) {
  const tt = useUI();
  const title = label || tt("AI 助手");
  const agentId = `${siteId || "editor"}.${editorId}`;
  // 没有操作台表单：这个面板只有 agent 一种形态，schema 仅用于标题与计量分区。
  const schema = useMemo<OpsSchema>(
    () => ({ agentId, title, fields: [], actions: [] }),
    [agentId, title],
  );
  return (
    <div
      data-plugin-agent-panel={editorId}
      className="flex h-full min-h-0 flex-col"
    >
      <FunctionAgentChat
        agentId={agentId}
        siteId={siteId}
        schema={schema}
        opsContent={null}
        showOps={false}
        defaultTab="agent"
        accent={accent}
        taskId={taskId}
        onTaskIdChange={onTaskIdChange}
        // 指令面永远开着：这正是「左边说话、右边动手」的那条线。
        enableEditorCommands
      />
    </div>
  );
}
