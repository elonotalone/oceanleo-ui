"use client";

// agent 抽屉的**唯一**注册工厂。
//
// 为什么要有这个文件：抽屉 id 的字面量早就收在 `agent-drawer.ts` 了，但
// 「这个 id 该配什么内容」此前没有单一出处——`use-inline-advanced-panels.tsx:97-112`
// 手写一份，视频画布又在 chrome 上手写了第二份（`CanvasAgentPanel`）。
// 同一个抽屉长出两种内容、两套上下文来源，正是本轮要消灭的漂移。
// 从这里起，任何外壳都只能通过 `createPluginAgentDrawer()` 拿到这个面板。
//
// 为什么不放进 `agent-drawer.ts`：那个文件被 `SelectionToolbar` import
// （只为取字面量）。一旦它 import `PluginAgentPanel`，edit bar 的模块图就会被
// 拖进整棵 `FunctionAgentChat`。`agent-drawer.ts:1-4` 的注释写的就是这条约束。

import { PLUGIN_AGENT_DRAWER_ID } from "./agent-drawer";
import { PluginAgentPanel } from "./PluginAgentPanel";
import type { PluginChromePanel } from "./types";

/** 中文原文即 i18n key，渲染侧过 `useUI()`。 */
export const PLUGIN_AGENT_DRAWER_LABEL = "AI 助手";

export interface PluginAgentDrawerInput {
  /** 插件 id，作为 agent 会话分区。 */
  editorId: string;
  siteId?: string;
  accent?: string;
  taskId?: string | null;
  onTaskIdChange?: (taskId: string | null) => void;
  width?: number;
  /** 面板内文案要的是译文，面板标题要的是 key，所以两者都得算一遍。 */
  translate: (zh: string) => string;
}

export function createPluginAgentDrawer({
  editorId,
  siteId,
  accent,
  taskId,
  onTaskIdChange,
  width,
  translate,
}: PluginAgentDrawerInput): PluginChromePanel {
  return {
    id: PLUGIN_AGENT_DRAWER_ID,
    label: PLUGIN_AGENT_DRAWER_LABEL,
    icon: "agent",
    width,
    content: (
      <PluginAgentPanel
        editorId={editorId}
        siteId={siteId}
        accent={accent}
        label={translate(PLUGIN_AGENT_DRAWER_LABEL)}
        taskId={taskId}
        onTaskIdChange={onTaskIdChange}
      />
    ),
  };
}
