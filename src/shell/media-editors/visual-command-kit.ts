/**
 * 视觉影音家族五类编辑器共用的指令面装配件。
 *
 * 合同 §3.1 的校验（id 前缀、未声明参数、类型、枚举、超长）由
 * `plugin-command/registry.ts` 统一强制，这里**不重复**做，只补它管不到的那一层：
 * 每条指令自己的数值区间与文字长度。越界一律 `{ ok:false }` 并说清楚界在哪，
 * 不许夹到边界上悄悄执行——agent 会把「已完成」当成「照我说的做了」。
 *
 * 纯模块：不碰 DOM、不引 React、不发请求，能被 node --test 直接读。
 */

import type {
  PluginCommandResult,
  PluginCommandSpec,
  PluginCommandSurfaceInput,
} from "../plugin-command/types";

export interface VisualParamBound {
  min?: number;
  max?: number;
  /** 只收整数。 */
  integer?: boolean;
  /** 文字参数的字符数上限。 */
  maxLength?: number;
  /** 文字参数不许是空白。 */
  nonEmpty?: boolean;
}

export interface VisualCommandDefinition {
  spec: PluginCommandSpec;
  /** 按参数 key 声明区间；没声明的参数只受注册表的通用校验。 */
  bounds?: Readonly<Record<string, VisualParamBound>>;
  run: (
    params: Record<string, unknown>,
  ) => PluginCommandResult | Promise<PluginCommandResult>;
}

export function ok(message: string, revision?: number): PluginCommandResult {
  return {
    ok: true,
    message,
    ...(typeof revision === "number" && Number.isFinite(revision)
      ? { revision }
      : {}),
  };
}

export function fail(message: string): PluginCommandResult {
  return { ok: false, message };
}

function labelOf(spec: PluginCommandSpec, key: string): string {
  return (spec.params || []).find((param) => param.key === key)?.label || key;
}

/** 返回第一条越界说明；全都合法时返回空串。 */
export function visualBoundsError(
  definition: VisualCommandDefinition,
  params: Record<string, unknown>,
): string {
  const bounds = definition.bounds || {};
  for (const [key, bound] of Object.entries(bounds)) {
    if (!(key in params)) continue;
    const value = params[key];
    const label = labelOf(definition.spec, key);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        return `参数「${label}」不是一个有效数字。`;
      }
      if (bound.integer && !Number.isInteger(value)) {
        return `参数「${label}」只能是整数，收到的是 ${value}。`;
      }
      if (typeof bound.min === "number" && value < bound.min) {
        return `参数「${label}」不能小于 ${bound.min}，收到的是 ${value}。`;
      }
      if (typeof bound.max === "number" && value > bound.max) {
        return `参数「${label}」不能大于 ${bound.max}，收到的是 ${value}。`;
      }
      continue;
    }
    if (typeof value === "string") {
      if (bound.nonEmpty && !value.trim()) {
        return `参数「${label}」不能是空的。`;
      }
      if (
        typeof bound.maxLength === "number" &&
        value.length > bound.maxLength
      ) {
        return `参数「${label}」最多 ${bound.maxLength} 个字，收到的是 ${value.length} 个。`;
      }
    }
  }
  return "";
}

export interface VisualCommandSurfaceOptions {
  editorId: string;
  /** 随当前状态变化：不能干的事就别列出来。 */
  commands: () => VisualCommandDefinition[];
  state: () => Record<string, unknown>;
}

/**
 * 把一组指令定义装成合同 §3.1 的指令面。
 *
 * `run()` 只认此刻 `commands()` 列出来的 id：编辑器状态变了、这条指令消失了，
 * 再调它就是 `{ ok:false }`，不许按「刚才还能做」放行。
 */
export function createVisualCommandSurface(
  options: VisualCommandSurfaceOptions,
): PluginCommandSurfaceInput {
  const editorId = options.editorId;
  return {
    editorId,
    describe: () => options.commands().map((entry) => entry.spec),
    state: () => options.state(),
    run: async (id, params) => {
      const wanted = String(id || "").trim();
      const available = options.commands();
      const definition = available.find((entry) => entry.spec.id === wanted);
      if (!definition) {
        return fail(
          available.length
            ? `这个编辑器现在没有「${wanted}」这条指令，能用的是：${available
                .map((entry) => entry.spec.id)
                .join("、")}。`
            : `这个编辑器现在一条指令都没有，「${wanted}」无法执行。`,
        );
      }
      const given = params && typeof params === "object" ? params : {};
      const outOfRange = visualBoundsError(definition, given);
      if (outOfRange) return fail(outOfRange);
      return definition.run(given);
    },
  };
}

/**
 * 所有 spec 的 id 前缀都对得上 editorId 吗。
 *
 * 注册表会静默丢掉前缀不对的 spec（对 agent 是安全的），但对写指令面的人是哑火，
 * 所以自测直接判这一条。
 */
export function visualCommandIdErrors(
  editorId: string,
  specs: readonly PluginCommandSpec[],
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const spec of specs) {
    if (!spec.id.startsWith(`${editorId}.`)) {
      errors.push(`${spec.id} 的前缀不是 ${editorId}.`);
    }
    if (spec.id.length <= editorId.length + 1) {
      errors.push(`${spec.id} 前缀之后没有指令名`);
    }
    if (seen.has(spec.id)) errors.push(`${spec.id} 重复声明`);
    seen.add(spec.id);
    if (!spec.label.trim()) errors.push(`${spec.id} 没有中文名`);
    if (spec.label.includes("插件")) errors.push(`${spec.id} 的名字里有「插件」`);
    if (!spec.summary.trim()) errors.push(`${spec.id} 没有一句话说明`);
  }
  return errors;
}
