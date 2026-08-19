"use client";

import { useEffect, useRef } from "react";
import { registerPluginCommandSurface } from "./registry";
import type {
  PluginCommandSurface,
  PluginCommandSurfaceInput,
} from "./types";

export type {
  PluginCommandParam,
  PluginCommandResult,
  PluginCommandSpec,
  PluginCommandStateSnapshot,
  PluginCommandSurface,
  PluginCommandSurfaceInput,
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
  const latest = useRef(surface);
  latest.current = surface;
  const editorId = String(surface?.editorId || "").trim();
  useEffect(() => {
    if (!editorId) return;
    const delegate: PluginCommandSurface = {
      editorId,
      describe: () => latest.current?.describe() || [],
      state: () => latest.current?.state() || {},
      run: async (id, params) => {
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
  }, [editorId]);
}
