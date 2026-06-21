// ============================================================================
// @oceanleo/ui — 功能区 agent ↔ 操作台 结构化协议（单一事实源）
// ----------------------------------------------------------------------------
// Doctrine v3: docs/architecture/oceanleo-function-agent-and-app-shell.md
//   一个功能区 = 一个操作台 = 一个 agent.
//
// 每个功能区声明一份 OpsSchema（操作台有哪些可读写字段 + 有哪些可触发动作）。
// agent 后端产出 OpsPatch（对操作台字段的结构化补丁），前端 applyPatch 落到真实
// 操作台 state；右栏随之重渲染。这样「agent 在控制操作台，操作台再渲染结果」。
//
// 省 token 原则（操作员 2026-06-21）：agent「能点生成」不要求前端逐字段回放 —— 能
// 在后端一次出结果就在后端出；OpsPatch 只承载「需要回填到操作台、让用户继续手改」
// 的结构化字段。模板/素材类字段标 userPicksOnly：agent 不替选，必要时只提示用户。
// ============================================================================

export type OpsFieldType =
  | "text"
  | "longtext"
  | "enum"
  | "number"
  | "boolean"
  | "list"
  | "object";

export interface OpsField {
  /** 字段唯一 key（OpsPatch.set 用它；支持点路径，如 "basic.name"）。 */
  key: string;
  /** 人类可读名。 */
  label: string;
  type: OpsFieldType;
  /** type=enum 时的取值。 */
  enumValues?: { value: string; label: string }[];
  /** type=list/object 时的子字段。 */
  itemSchema?: OpsField[];
  /** 给 agent 的填写提示（何时/怎么填）。 */
  hint?: string;
  /** 模板/素材类：agent 不替用户选，只在必要时提示用户「有可选项」。 */
  userPicksOnly?: boolean;
}

export interface OpsAction {
  /** 动作 id，如 "generate" / "export-pdf" / "polish-summary"。 */
  id: string;
  /** 按钮文案。 */
  label: string;
  /**
   * 执行位置：
   *  - "backend"：agent 在网关侧直接调端点出结果（省 token，首选）。
   *  - "frontend"：必须由前端真实点击该站现成生成函数（后端无法复刻时）。
   */
  run: "backend" | "frontend";
  /** run=backend 时网关端点；run=frontend 时为前端 action 名。 */
  endpoint?: string;
}

export interface OpsSchema {
  /** 绑定的功能区 agent（= "<site_id>.<fn_id>"）。 */
  agentId: string;
  /** 操作台标题（= 功能区名）。 */
  title: string;
  fields: OpsField[];
  /** 操作台的可触发动作（生成/导出/润色…），agent 可经 OpsPatch.triggerAction 触发。 */
  actions: OpsAction[];
}

/** agent 回传给前端的「操作台补丁」。 */
export interface OpsPatch {
  /** 字段赋值（key → value，支持点路径）。 */
  set?: Record<string, unknown>;
  /** 往 list 字段追加元素。 */
  appendList?: Record<string, unknown[]>;
  /** 触发某 action（前端据 OpsAction.run 决定怎么执行）。 */
  triggerAction?: string;
  /** 给用户的提示（如「有 5 套模板可在右栏选」）。 */
  notice?: string;
}

/**
 * 把一个 OpsPatch 应用到任意对象状态（不可变）。支持 `set`（含点路径）+
 * `appendList`。各站把自己的操作台 state 用这个工具一致地更新，避免各写一套。
 */
export function applyOpsPatch<T extends Record<string, unknown>>(
  state: T,
  patch: OpsPatch,
): T {
  let next: Record<string, unknown> = { ...state };
  if (patch.set) {
    for (const [path, value] of Object.entries(patch.set)) {
      next = setPath(next, path, value);
    }
  }
  if (patch.appendList) {
    for (const [path, items] of Object.entries(patch.appendList)) {
      const cur = getPath(next, path);
      const arr = Array.isArray(cur) ? [...cur, ...items] : [...items];
      next = setPath(next, path, arr);
    }
  }
  return next as T;
}

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[k];
    return undefined;
  }, obj);
}

function setPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const keys = path.split(".");
  const root = { ...obj };
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    const child = cur[k];
    cur[k] = child && typeof child === "object" ? { ...(child as object) } : {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
  return root;
}

/** 从操作台 state 抽出 agent 关心的精简快照（只取 schema 声明的字段）。 */
export function opsSnapshot(
  schema: OpsSchema,
  state: Record<string, unknown>,
): Record<string, unknown> {
  const snap: Record<string, unknown> = {};
  for (const f of schema.fields) {
    const v = getPath(state, f.key);
    if (v !== undefined && v !== null && v !== "") snap[f.key] = v;
  }
  return snap;
}
