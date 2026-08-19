/**
 * 指令面注册表。
 *
 * 刻意是**模块级单例 + 订阅回调**，不是 React context：左栏的 agent 要在 React 树
 * 之外读「右栏现在能做什么」，context 够不着它。
 *
 * 同一时刻只有一个 active——右栏同一时刻也只挂着一个编辑器。
 *
 * 这里是**校验的唯一强制点**：对外发出去的 surface 一律是包过一层的，
 * 所以就算调用方绕过 `runPluginCommand()` 直接拿 `currentPluginCommandSurface().run()`，
 * 越界 id、未声明参数、超长参数照样被挡住。不合法一律返回
 * `{ ok:false, message }`，不静默兜底、不猜用户想干什么。
 */

import {
  PLUGIN_COMMAND_PARAM_MAX_BYTES,
  PLUGIN_COMMAND_STATE_MAX_BYTES,
  type PluginCommandParam,
  type PluginCommandResult,
  type PluginCommandSpec,
  type PluginCommandStateSnapshot,
  type PluginCommandSurface,
  type PluginCommandSurfaceInput,
} from "./types";

const encoder = new TextEncoder();

function byteLength(value: string): number {
  return encoder.encode(value).length;
}

function serialize(value: unknown): { ok: true; text: string } | { ok: false } {
  try {
    const text = JSON.stringify(value);
    return typeof text === "string" ? { ok: true, text } : { ok: false };
  } catch {
    return { ok: false };
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function failure(message: string): PluginCommandResult {
  return { ok: false, message };
}

function normalizedParam(value: unknown): PluginCommandParam | null {
  if (!isPlainObject(value)) return null;
  const key = String(value.key || "").trim();
  const type = String(value.type || "").trim();
  if (!key) return null;
  if (!["string", "number", "boolean", "enum"].includes(type)) return null;
  const enumValues = Array.isArray(value.enumValues)
    ? value.enumValues.flatMap((entry) =>
        isPlainObject(entry) && String(entry.value || "").trim()
          ? [
              {
                value: String(entry.value).trim(),
                label: String(entry.label || entry.value).trim(),
              },
            ]
          : [],
      )
    : [];
  if (type === "enum" && enumValues.length === 0) return null;
  return {
    key,
    label: String(value.label || key).trim(),
    type: type as PluginCommandParam["type"],
    ...(enumValues.length ? { enumValues } : {}),
    ...(value.required === true ? { required: true } : {}),
    ...(String(value.hint || "").trim()
      ? { hint: String(value.hint).trim() }
      : {}),
  };
}

/**
 * 一条 spec 站不站得住。
 *
 * `id` 前缀必须逐字等于 `editorId`（合同 §3.1）：agent 看到的每条指令都要能一眼
 * 认出是谁的，前缀对不上就是声明错了，不收。
 */
function normalizedSpec(
  value: unknown,
  editorId: string,
): PluginCommandSpec | null {
  if (!isPlainObject(value)) return null;
  const id = String(value.id || "").trim();
  const label = String(value.label || "").trim();
  const summary = String(value.summary || "").trim();
  if (!id || !label || !summary) return null;
  if (!id.startsWith(`${editorId}.`) || id.length <= editorId.length + 1) {
    return null;
  }
  if (typeof value.mutates !== "boolean") return null;
  const params = Array.isArray(value.params)
    ? value.params.flatMap((entry) => {
        const param = normalizedParam(entry);
        return param ? [param] : [];
      })
    : [];
  const declared = Array.isArray(value.params) ? value.params.length : 0;
  // 一条参数声明歪了就整条指令不收：只收一半参数会让 agent 以为剩下那个不存在，
  // 然后带着它调用、被拒、看不懂为什么。
  if (declared !== params.length) return null;
  const keys = new Set(params.map((param) => param.key));
  if (keys.size !== params.length) return null;
  return {
    id,
    label,
    summary,
    mutates: value.mutates,
    ...(params.length ? { params } : {}),
  };
}

function specsOf(surface: PluginCommandSurfaceInput): PluginCommandSpec[] {
  let raw: unknown;
  try {
    raw = surface.describe();
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const editorId = String(surface.editorId || "").trim();
  if (!editorId) return [];
  const seen = new Set<string>();
  return raw.flatMap((entry) => {
    const spec = normalizedSpec(entry, editorId);
    if (!spec || seen.has(spec.id)) return [];
    seen.add(spec.id);
    return [spec];
  });
}

/**
 * 现状摘要收进 4096 字节以内。
 *
 * 超了就整条整条地丢最大的顶层键——不切字符串：切出来的半个 JSON 值比没有更糟，
 * 读它的是 agent，它会把半截当成真的。丢掉哪些键在 `message` 里说清楚。
 */
function boundedState(
  raw: Record<string, unknown>,
): { state: Record<string, unknown>; byteSize: number; dropped: string[] } {
  const initial = serialize(raw);
  if (initial.ok && byteLength(initial.text) <= PLUGIN_COMMAND_STATE_MAX_BYTES) {
    return { state: raw, byteSize: byteLength(initial.text), dropped: [] };
  }
  const sizes = Object.entries(raw)
    .map(([key, value]) => {
      const entry = serialize(value);
      return {
        key,
        size: entry.ok ? byteLength(entry.text) + byteLength(key) + 4 : -1,
      };
    })
    // 序列化不了的键（循环引用、函数）最先丢：它们本来就进不了 agent 的视野。
    .sort((left, right) => {
      if (left.size < 0 || right.size < 0) return left.size < 0 ? -1 : 1;
      return right.size - left.size;
    });
  const kept: Record<string, unknown> = { ...raw };
  const dropped: string[] = [];
  for (const entry of sizes) {
    const current = serialize(kept);
    if (current.ok && byteLength(current.text) <= PLUGIN_COMMAND_STATE_MAX_BYTES) {
      break;
    }
    delete kept[entry.key];
    dropped.push(entry.key);
  }
  const final = serialize(kept);
  return {
    state: kept,
    byteSize: final.ok ? byteLength(final.text) : 0,
    dropped,
  };
}

function stateSnapshotOf(
  surface: PluginCommandSurfaceInput,
): PluginCommandStateSnapshot {
  const editorId = String(surface.editorId || "").trim();
  let raw: unknown;
  try {
    raw = surface.state();
  } catch {
    return {
      editorId,
      state: {},
      byteSize: 2,
      truncated: true,
      message: "这个编辑器读不出现状摘要，已按空摘要处理。",
    };
  }
  if (!isPlainObject(raw)) {
    return {
      editorId,
      state: {},
      byteSize: 2,
      truncated: true,
      message: "这个编辑器给出的现状摘要不是一组键值，已按空摘要处理。",
    };
  }
  const bounded = boundedState(raw);
  return {
    editorId,
    state: bounded.state,
    byteSize: bounded.byteSize,
    truncated: bounded.dropped.length > 0,
    message: bounded.dropped.length
      ? `现状摘要超过 ${PLUGIN_COMMAND_STATE_MAX_BYTES} 字节，已省略这几项：${bounded.dropped.join("、")}。`
      : "",
  };
}

function paramTypeMismatch(
  param: PluginCommandParam,
  value: unknown,
): string {
  if (param.type === "string") {
    return typeof value === "string"
      ? ""
      : `参数「${param.label}」要的是一段文字。`;
  }
  if (param.type === "number") {
    return typeof value === "number" && Number.isFinite(value)
      ? ""
      : `参数「${param.label}」要的是一个数字。`;
  }
  if (param.type === "boolean") {
    return typeof value === "boolean"
      ? ""
      : `参数「${param.label}」只能是「是」或「否」。`;
  }
  const allowed = param.enumValues || [];
  if (typeof value !== "string" || !allowed.some((entry) => entry.value === value)) {
    return `参数「${param.label}」只能是这几项之一：${allowed
      .map((entry) => entry.label)
      .join("、")}。`;
  }
  return "";
}

function validateParams(
  spec: PluginCommandSpec,
  params: Record<string, unknown>,
): string {
  const declared = new Map(
    (spec.params || []).map((param) => [param.key, param]),
  );
  for (const key of Object.keys(params)) {
    const param = declared.get(key);
    if (!param) {
      return declared.size
        ? `指令「${spec.label}」没有「${key}」这个参数，它只接受：${[...declared.keys()].join("、")}。`
        : `指令「${spec.label}」不接受任何参数，但收到了「${key}」。`;
    }
    const value = params[key];
    const mismatch = paramTypeMismatch(param, value);
    if (mismatch) return mismatch;
    const serialized = serialize(value);
    if (!serialized.ok) {
      return `参数「${param.label}」的内容没法传给编辑器，请换一个值。`;
    }
    if (byteLength(serialized.text) > PLUGIN_COMMAND_PARAM_MAX_BYTES) {
      return `参数「${param.label}」太长了（上限 ${PLUGIN_COMMAND_PARAM_MAX_BYTES} 字节），请拆短后再试。`;
    }
  }
  for (const param of declared.values()) {
    if (param.required && !(param.key in params)) {
      return `指令「${spec.label}」缺少必填参数「${param.label}」。`;
    }
  }
  return "";
}

function normalizedResult(value: unknown): PluginCommandResult {
  if (!isPlainObject(value) || typeof value.ok !== "boolean") {
    return failure("这条指令没有回报执行结果，无法确认它是否生效。");
  }
  const message = String(value.message || "").trim();
  return {
    ok: value.ok,
    message:
      message || (value.ok ? "已完成。" : "这条指令没能执行，原因未知。"),
    ...(typeof value.revision === "number" && Number.isFinite(value.revision)
      ? { revision: value.revision }
      : {}),
  };
}

async function guardedRun(
  surface: PluginCommandSurfaceInput,
  id: string,
  params?: Record<string, unknown>,
): Promise<PluginCommandResult> {
  const wanted = String(id || "").trim();
  if (!wanted) return failure("没有指定要执行哪条指令。");
  const specs = specsOf(surface);
  const spec = specs.find((entry) => entry.id === wanted);
  if (!spec) {
    return failure(
      specs.length
        ? `当前编辑器现在没有「${wanted}」这条指令，能用的是：${specs
            .map((entry) => entry.id)
            .join("、")}。`
        : `当前编辑器现在一条指令都没有，「${wanted}」无法执行。`,
    );
  }
  if (params !== undefined && !isPlainObject(params)) {
    return failure("指令参数必须是一组键值。");
  }
  const invalid = validateParams(spec, params || {});
  if (invalid) return failure(invalid);
  try {
    return normalizedResult(await surface.run(spec.id, params));
  } catch (error) {
    return failure(
      error instanceof Error && error.message.trim()
        ? `这条指令执行时出错了：${error.message.trim()}`
        : "这条指令执行时出错了，请重试。",
    );
  }
}

function guarded(surface: PluginCommandSurfaceInput): PluginCommandSurface {
  return {
    editorId: String(surface.editorId || "").trim(),
    describe: () => specsOf(surface),
    state: () => stateSnapshotOf(surface).state,
    run: (id, params) => guardedRun(surface, id, params),
  };
}

let ACTIVE: PluginCommandSurface | null = null;
let ACTIVE_RAW: PluginCommandSurfaceInput | null = null;
const LISTENERS = new Set<() => void>();

function notify(): void {
  for (const listener of [...LISTENERS]) {
    try {
      listener();
    } catch {
      // 一个订阅者炸了不许连坐其他订阅者，更不许把注册流程打断。
    }
  }
}

/**
 * 挂上一个指令面，返回注销函数。
 *
 * 注销是**按身份**的：卸载的编辑器只能注销自己。React 18 的挂载顺序会出现
 * 「新编辑器先注册、旧编辑器后卸载」，按身份判才不会让旧的把新的清掉。
 */
export function registerPluginCommandSurface(
  surface: PluginCommandSurfaceInput,
): () => void {
  if (!surface || !String(surface.editorId || "").trim()) {
    return () => {};
  }
  const wrapped = guarded(surface);
  ACTIVE = wrapped;
  ACTIVE_RAW = surface;
  notify();
  return () => {
    if (ACTIVE_RAW !== surface) return;
    ACTIVE = null;
    ACTIVE_RAW = null;
    notify();
  };
}

/** 当前挂着的指令面（已包过校验层）；没有编辑器时是 `null`。 */
export function currentPluginCommandSurface(): PluginCommandSurface | null {
  return ACTIVE;
}

/** React 之外的订阅入口：指令面换人或下线时回调。返回退订函数。 */
export function subscribePluginCommandSurface(
  listener: () => void,
): () => void {
  LISTENERS.add(listener);
  return () => {
    LISTENERS.delete(listener);
  };
}

/** 「现在能做什么」。没有编辑器时是空数组。 */
export function describePluginCommands(): PluginCommandSpec[] {
  return ACTIVE ? ACTIVE.describe() : [];
}

/** 「现在是什么样」。没有编辑器时是 `null`；超长会截断并在 `message` 里说明。 */
export function readPluginCommandState(): PluginCommandStateSnapshot | null {
  return ACTIVE_RAW ? stateSnapshotOf(ACTIVE_RAW) : null;
}

/** 下一条指令。没有编辑器、id 越界、参数不合法一律 `{ ok:false }`。 */
export async function runPluginCommand(
  id: string,
  params?: Record<string, unknown>,
): Promise<PluginCommandResult> {
  if (!ACTIVE) {
    return failure("右边现在没有打开的编辑器，没法执行编辑指令。");
  }
  return ACTIVE.run(id, params);
}

/** 测试与登出用：把注册表清空。 */
export function resetPluginCommandSurface(): void {
  if (!ACTIVE && !ACTIVE_RAW) return;
  ACTIVE = null;
  ACTIVE_RAW = null;
  notify();
}
