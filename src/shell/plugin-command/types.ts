/**
 * 右栏编辑器的「指令面」类型。
 *
 * 这是编辑器第一次对外声明「我现在能做什么」。左栏的 agent 读 `describe()` 拿到
 * 当前可用的指令，读 `state()` 拿到一份有界的现状摘要，再用 `run()` 下一条指令。
 *
 * 逐字来自 `docs/work-logs/2026-08/office-core-consolidation/00-dispatch-contract.md` §3.1，
 * 任何一方要改字段先改合同。
 */

export interface PluginCommandParam {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "enum";
  enumValues?: readonly { value: string; label: string }[];
  required?: boolean;
  hint?: string;
}

export interface PluginCommandSpec {
  /** `"richdoc.insert-heading"` —— 前缀必须逐字等于 `editorId`。 */
  id: string;
  /** 用户看得懂的中文，不含「插件」二字。 */
  label: string;
  /** 一句话说清这条指令会改什么。 */
  summary: string;
  params?: readonly PluginCommandParam[];
  /** true = 会改文档，执行前必须由用户确认（确认在 agent 侧做）。 */
  mutates: boolean;
}

export interface PluginCommandResult {
  ok: boolean;
  message: string;
  revision?: number;
}

export interface PluginCommandSurface {
  /** 与编辑栏适配器 id 逐字相同（richdoc/grid/deck/pdf/image/…）。 */
  editorId: string;
  /** 随当前状态变化，可以是空数组。 */
  describe(): PluginCommandSpec[];
  /** 有界摘要，序列化后 ≤ 4096 字节。 */
  state(): Record<string, unknown>;
  run(
    id: string,
    params?: Record<string, unknown>,
  ): Promise<PluginCommandResult>;
}

/**
 * 实现方写起来更自然的入参形态：`run()` 允许同步返回。
 *
 * 对外读到的 `PluginCommandSurface` 仍然是严格的 Promise 形态——注册表会把它包一层，
 * 调用方永远 `await` 得到同一种东西。
 */
export interface PluginCommandSurfaceInput {
  editorId: string;
  describe(): PluginCommandSpec[];
  state(): Record<string, unknown>;
  run(
    id: string,
    params?: Record<string, unknown>,
  ): PluginCommandResult | Promise<PluginCommandResult>;
}

/** 单个参数序列化后的字节上限。 */
export const PLUGIN_COMMAND_PARAM_MAX_BYTES = 8 * 1024;

/** `state()` 序列化后的字节上限；超了截断并在返回里说明。 */
export const PLUGIN_COMMAND_STATE_MAX_BYTES = 4096;

/** `readState()` 的返回：截断过就把原因一起带出来，不许静默截断。 */
export interface PluginCommandStateSnapshot {
  editorId: string;
  state: Record<string, unknown>;
  /** 序列化后的字节数（截断后的）。 */
  byteSize: number;
  truncated: boolean;
  /** 截断了才有；一句中文说清截掉了什么。 */
  message: string;
}
