"use client";

import { useEffect, useRef } from "react";
import { registerPluginCommandSurface } from "./registry";
import { useOptionalWorkspaceSession } from "../workspace-session-context";
import { useWorkspacePane } from "../SplitWorkspace";
import type {
  PluginCommandSurface,
  PluginCommandSurfaceInput,
  PluginAgentContext,
  PluginCommandTarget,
} from "./types";

let surfaceSequence = 0;

function createSurfaceInstanceId(): string {
  surfaceSequence += 1;
  return `editor-surface-${surfaceSequence}-${Math.random().toString(36).slice(2, 9)}`;
}

export type {
  PluginCommandParam,
  PluginCommandResult,
  PluginCommandSpec,
  PluginCommandStateSnapshot,
  PluginCommandSurface,
  PluginCommandSurfaceInput,
  PluginAgentContext,
  PluginCommandTarget,
} from "./types";
export {
  PLUGIN_COMMAND_PARAM_MAX_BYTES,
  PLUGIN_COMMAND_STATE_MAX_BYTES,
} from "./types";
export {
  currentPluginCommandSurface,
  describePluginCommands,
  readPluginCommandState,
  registerPluginCommandSurface,
  resetPluginCommandSurface,
  runPluginCommand,
  subscribePluginCommandSurface,
} from "./registry";

/**
 * 编辑器挂载期把自己的指令面挂上去，卸载时摘下来。
 *
 * 传进来的 `surface` 通常是每次渲染新建的对象（它要读组件里的最新状态），所以这里
 * 注册的是一个**稳定的代理**：注册只在 `editorId` 变化时发生一次，代理每次转发到
 * 最新的那个实现。不这么做的话，编辑器每敲一个字就注册/注销一轮，左栏的订阅者会
 * 被无意义的通知刷屏。
 */
export function usePluginCommandSurface(
  surface: PluginCommandSurfaceInput | null | undefined,
): void {
  const workspace = useOptionalWorkspaceSession();
  const workspaceScopeId = workspace?.activeFileScopeId || "";
  // Some Task workspaces keep the right editor mounted behind the left/chat
  // panel. It is not the active Library target while that pane is closed.
  const workspacePane = useWorkspacePane();
  const libraryOpen = workspacePane?.libraryOpen !== false;
  const libraryOpenRef = useRef(libraryOpen);
  libraryOpenRef.current = libraryOpen;
  const latest = useRef(surface);
  latest.current = surface;
  const editorId = String(surface?.editorId || "").trim();
  useEffect(() => {
    if (!editorId || !libraryOpen) return;
    const surfaceInstanceId = createSurfaceInstanceId();
    const delegate: PluginCommandSurface = {
      editorId,
      workspaceScopeId,
      describe: () => libraryOpenRef.current ? latest.current?.describe() || [] : [],
      state: () => libraryOpenRef.current ? latest.current?.state() || {} : {},
      target: () => {
        if (!libraryOpenRef.current) return null;
        const target = latest.current?.target?.();
        if (!target || !workspaceScopeId) return null;
        return { ...target, workspaceScopeId, editorId, surfaceInstanceId };
      },
      agentContext: () =>
        !libraryOpenRef.current
          ? { ready: false, reason: "右侧 Library 已关闭；隐藏保留的编辑器不是当前目标文件。" }
          :
        latest.current?.agentContext?.() || {
          ready: false,
          reason: "这个编辑器没有提供可读取的当前文件内容。",
        },
      run: async (id, params) => {
        if (!libraryOpenRef.current) {
          return { ok: false, message: "右侧 Library 已关闭；隐藏编辑器不会接收 Agent 指令。" };
        }
        const current = latest.current;
        if (!current) {
          return {
            ok: false,
            message: "这个编辑器已经关掉了，指令没有执行。",
          };
        }
        return current.run(id, params);
      },
    };
    return registerPluginCommandSurface(delegate);
  }, [editorId, libraryOpen, workspaceScopeId]);
}
