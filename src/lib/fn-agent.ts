// ============================================================================
// @oceanleo/ui — 功能区操作台结构化类型（单一事实源）
// ----------------------------------------------------------------------------
// 宗旨 v10: docs/architecture/oceanleo-pro-site-console-agent-coplane.md
//   一个功能页 = 一个功能 = 一个操作台。操作台与 agent 在左栏「操作台 | agent」同栏
//   双形态切换，但**彼此独立**：agent 不读、不写操作台 state（不再产 OpsPatch 回填）。
//
// 这里保留 OpsSchema / OpsField / OpsAction / OpsPatch 类型 + applyOpsPatch /
// opsSnapshot 工具——它们仍是各站描述操作台字段、内部更新 state 的通用类型/工具；
// agent 工具能力 / 历史数据形态也可能引用。v9 的「灵感台→输入框单向传递」工具
// （mergeOpsBlock / opsStateToPromptText / OPS_BLOCK_*）已随操作台不再进浮窗而移除。
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

/** 从操作台 state 抽出精简快照（只取 schema 声明的字段）。供各站内部需要时使用。 */
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

// ============================================================================
// 右边编辑器的指令面 · agent 侧调用桥（左边说话，右边动手）
// ----------------------------------------------------------------------------
// 上面的 Ops 三件套是【36 站共用的操作台表单契约】，与右栏编辑器无关，一个字不动。
// 这里另并一条只服务「agent 调用右边编辑器」的通道：
//   下行：buildEditorCommandContext() 把「现在开着哪个编辑器 + 它能做什么」拼成一段
//         只给模型看的上下文（走 createTask/followUp 的 hiddenContext，不进用户可见对话）。
//   上行：模型在回答里附一段 ```oceanleo-editor-command 代码块 →
//         parseEditorCommandRequests() 解析 → createEditorCommandSession() 校验、
//         按需请用户确认、执行一次、把结果用人话回写。
//
// 会改内容的指令（mutates:true）**执行前必须由用户点确认**；用户可选「以后这类不用问我」，
// 该授权只活在当前会话的内存里，刷新即失效（不落库、不进快照）。
// ============================================================================

/** 指令面参数声明（形状 = `src/shell/plugin-command/types.ts`，派活合同 §3.1）。 */
export interface PluginCommandParam {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "enum";
  enumValues?: readonly { value: string; label: string }[];
  required?: boolean;
  hint?: string;
}

/** 一条指令的声明（形状 = 派活合同 §3.1）。 */
export interface PluginCommandSpec {
  /** "richdoc.insert-heading"——前缀必须等于 editorId。 */
  id: string;
  /** 用户看得懂的中文名。 */
  label: string;
  /** 一句话说清这条指令会改什么。 */
  summary: string;
  params?: readonly PluginCommandParam[];
  /** true = 会改文档，执行前必须由用户确认。 */
  mutates: boolean;
}

export interface PluginCommandResult {
  ok: boolean;
  message: string;
  revision?: number;
}

/** 右栏编辑器对外的指令面（形状 = 派活合同 §3.1）。 */
export interface PluginCommandSurface {
  /** 与适配器 id 逐字相同（richdoc/grid/deck/pdf/image/…）。 */
  editorId: string;
  describe(): PluginCommandSpec[];
  state(): Record<string, unknown>;
  run(
    id: string,
    params?: Record<string, unknown>,
  ): Promise<PluginCommandResult>;
}

/** 取「当前 active 指令面」的读取器（合同 §3.1 的 `currentPluginCommandSurface`）。 */
export type EditorCommandSurfaceReader = () => PluginCommandSurface | null;

/** 一次给模型列出的指令条数上限（超过按相关性截断并注明）。 */
export const EDITOR_COMMAND_LIST_LIMIT = 30;
/** 状态摘要字节上限（与合同 §3.1 一致；超了就不给模型看，不截半个 JSON）。 */
export const EDITOR_COMMAND_STATE_LIMIT = 4096;
/** 单个字符串参数的长度上限（超长即拒，不静默截断）。 */
export const EDITOR_COMMAND_TEXT_LIMIT = 4096;
/** 模型下指令用的代码块语言标记。 */
export const EDITOR_COMMAND_FENCE = "oceanleo-editor-command";

// 工作台不直接渲染对话组件（AgentChat 的宿主是 WorkspaceShell / 历史页），所以指令面
// 只能按合同 §3.1 走模块级单例。W1 的 plugin-command 模块落盘后调用这里注册一次即可，
// 对话组件也可以用 prop 直接注入（prop 优先）。
let registeredSurfaceReader: EditorCommandSurfaceReader | null = null;

/** 注册「当前 active 指令面」的读取器；传 null 注销。 */
export function registerEditorCommandSurfaceReader(
  reader: EditorCommandSurfaceReader | null,
): void {
  registeredSurfaceReader = reader;
}

/** 读当前指令面：prop 注入优先，其次模块级注册。读不到就是「右边没开编辑器」。 */
export function readEditorCommandSurface(
  explicit?: EditorCommandSurfaceReader | null,
): PluginCommandSurface | null {
  const reader = explicit || registeredSurfaceReader;
  if (!reader) return null;
  try {
    return reader() || null;
  } catch {
    return null;
  }
}

/** 会话级授权的键（同一个编辑器的同一条指令算「这类」）。 */
export function editorCommandKey(editorId: string, id: string): string {
  return `${editorId}:${id}`;
}

// 编辑器的中文名——确认卡上只出现这个，不出现 editorId。认不出的编辑器就叫「编辑器」，
// 不编造一个名字。
const EDITOR_LABELS: Record<string, string> = {
  richdoc: "文档",
  doc: "文档",
  grid: "表格",
  sheet: "表格",
  deck: "演示文稿",
  pdf: "PDF",
  image: "图片",
  video: "视频",
  "video-canvas": "视频",
  audio: "音频",
  chart: "图表",
  model3d: "3D 模型",
  website: "网站",
  "design-canvas": "设计画布",
  game: "游戏",
};

/** 编辑器的用户可见名称。 */
export function editorDisplayName(editorId: string): string {
  return EDITOR_LABELS[String(editorId || "").trim()] || "编辑器";
}

function validSpec(value: unknown): PluginCommandSpec | null {
  if (!value || typeof value !== "object") return null;
  const s = value as Record<string, unknown>;
  const id = typeof s.id === "string" ? s.id.trim() : "";
  const label = typeof s.label === "string" ? s.label.trim() : "";
  if (!id || !label) return null;
  const params = Array.isArray(s.params)
    ? (s.params.filter(
        (p) =>
          p &&
          typeof p === "object" &&
          typeof (p as PluginCommandParam).key === "string" &&
          (p as PluginCommandParam).key.trim() !== "",
      ) as PluginCommandParam[])
    : undefined;
  return {
    id,
    label,
    summary: typeof s.summary === "string" ? s.summary : "",
    mutates: s.mutates === true,
    ...(params && params.length ? { params } : {}),
  };
}

function surfaceSpecs(surface: PluginCommandSurface): PluginCommandSpec[] {
  let raw: unknown;
  try {
    raw = surface.describe();
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: PluginCommandSpec[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const spec = validSpec(item);
    if (!spec || seen.has(spec.id)) continue;
    seen.add(spec.id);
    out.push(spec);
  }
  return out;
}

// 相关性：把用户这句话切成词（中文按字，西文按词），命中 id/名称/说明/参数名越多越靠前。
function queryTokens(query: string): string[] {
  const text = String(query || "").toLowerCase();
  const latin = text.match(/[a-z0-9]{2,}/g) || [];
  const cjk = text.match(/[\u4e00-\u9fff]/g) || [];
  return Array.from(new Set([...latin, ...cjk]));
}

function specSearchText(spec: PluginCommandSpec): string {
  const params = (spec.params || [])
    .map((p) => `${p.key} ${p.label} ${p.hint || ""}`)
    .join(" ");
  return `${spec.id} ${spec.label} ${spec.summary} ${params}`.toLowerCase();
}

/** 按与用户这句话的相关性排序（同分保持声明顺序）。 */
export function rankEditorCommands(
  specs: PluginCommandSpec[],
  query?: string,
): PluginCommandSpec[] {
  const tokens = queryTokens(query || "");
  if (!tokens.length) return specs.slice();
  return specs
    .map((spec, index) => {
      const text = specSearchText(spec);
      let score = 0;
      for (const t of tokens) if (text.includes(t)) score += 1;
      return { spec, index, score };
    })
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .map((entry) => entry.spec);
}

function paramLine(p: PluginCommandParam): string {
  const bits = [p.label || p.key];
  if (p.required) bits.push("必填");
  if (p.type === "enum" && p.enumValues?.length) {
    bits.push(`只能填：${p.enumValues.map((v) => v.value).join(" / ")}`);
  } else if (p.type !== "string") {
    bits.push(p.type === "number" ? "数字" : "是或否");
  }
  if (p.hint) bits.push(p.hint);
  return `${p.key}（${bits.join("；")}）`;
}

/**
 * 拼一段「当前编辑器 + 它现在能做什么」的上下文，只给模型看（走 hiddenContext）。
 * 右边没开编辑器 → 返回空串，绝不编造。
 */
export function buildEditorCommandContext(
  surface: PluginCommandSurface | null | undefined,
  opts?: { query?: string; limit?: number },
): string {
  if (!surface) return "";
  const editorId = String(surface.editorId || "").trim();
  if (!editorId) return "";
  const specs = surfaceSpecs(surface);
  const limit = Math.max(
    1,
    Math.min(opts?.limit ?? EDITOR_COMMAND_LIST_LIMIT, EDITOR_COMMAND_LIST_LIMIT),
  );
  const ranked = rankEditorCommands(specs, opts?.query);
  const shown = ranked.slice(0, limit);
  const lines: string[] = [
    `〔右边编辑器〕现在打开的是${editorDisplayName(editorId)}编辑器（editorId=${editorId}）。`,
  ];
  if (!shown.length) {
    lines.push("它现在没有可执行的指令，请只用文字回答，不要发指令块。");
    return lines.join("\n");
  }
  lines.push(
    specs.length > shown.length
      ? `它现在能做 ${specs.length} 件事，下面按与用户这句话的相关性列出最相关的 ${shown.length} 条（其余 ${specs.length - shown.length} 条未列出；需要时请先问用户要做什么）：`
      : `它现在能做这 ${shown.length} 件事：`,
  );
  for (const spec of shown) {
    const parts = [`- ${spec.id}：${spec.label}`];
    if (spec.summary) parts.push(`——${spec.summary}`);
    parts.push(spec.mutates ? "（会改内容，需用户确认）" : "（只读）");
    const params = spec.params || [];
    if (params.length) {
      parts.push(`参数：${params.map(paramLine).join("，")}`);
    } else {
      parts.push("无参数");
    }
    lines.push(parts.join(" "));
  }
  let state = "";
  try {
    state = JSON.stringify(surface.state() ?? {});
  } catch {
    state = "";
  }
  if (state && state !== "{}" && state.length <= EDITOR_COMMAND_STATE_LIMIT) {
    lines.push(`它当前的状态摘要：${state}`);
  }
  lines.push(
    "要动手时，在回答里附一段这样的块，一次只写一条指令：",
    "```" + EDITOR_COMMAND_FENCE,
    '{"id":"上面列出的 id","params":{"参数名":"值"}}',
    "```",
    "清单以外的 id 一律不要发；参数不确定时先问用户，不要自己编。会改内容的指令要等用户点确认才会执行。",
  );
  return lines.join("\n");
}

/** 模型下的一条指令。 */
export interface EditorCommandRequest {
  id: string;
  params?: Record<string, unknown>;
}

export interface EditorCommandParseResult {
  requests: EditorCommandRequest[];
  /** 出现过指令块但内容无法当指令用的条数（坏 JSON / 没有 id）。 */
  invalidCount: number;
  /** 去掉指令块后的正文（对话里显示这个，不把代码块糊给用户看）。 */
  cleaned: string;
}

const FENCE_RE = new RegExp(
  "```[ \\t]*" + EDITOR_COMMAND_FENCE + "[ \\t]*\\r?\\n([\\s\\S]*?)```",
  "gi",
);

/** 从 assistant 的回答里取出指令块。 */
export function parseEditorCommandRequests(
  text: string,
): EditorCommandParseResult {
  const source = typeof text === "string" ? text : "";
  const requests: EditorCommandRequest[] = [];
  let invalidCount = 0;
  const cleaned = source.replace(FENCE_RE, (_all, body: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(body).trim());
    } catch {
      invalidCount += 1;
      return "";
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      invalidCount += 1;
      return "";
    }
    const raw = parsed as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (!id) {
      invalidCount += 1;
      return "";
    }
    const params =
      raw.params && typeof raw.params === "object" && !Array.isArray(raw.params)
        ? (raw.params as Record<string, unknown>)
        : undefined;
    requests.push({ id, ...(params ? { params } : {}) });
    return "";
  });
  return { requests, invalidCount, cleaned: cleaned.trim() };
}

function commandMenu(specs: PluginCommandSpec[]): string {
  if (!specs.length) return "";
  const labels = specs.slice(0, 8).map((s) => s.label);
  const rest = specs.length - labels.length;
  return labels.join("、") + (rest > 0 ? `，等 ${specs.length} 件事` : "");
}

type ParamCheck =
  | { ok: true; params: Record<string, unknown> }
  | { ok: false; reason: string };

function checkParams(
  spec: PluginCommandSpec,
  raw: Record<string, unknown> | undefined,
): ParamCheck {
  const declared = spec.params || [];
  const given = raw || {};
  const allowed = new Set(declared.map((p) => p.key));
  for (const key of Object.keys(given)) {
    if (allowed.has(key)) continue;
    return {
      ok: false,
      reason: declared.length
        ? `「${spec.label}」不需要「${key}」这一项，它能填的是：${declared
            .map((p) => p.label || p.key)
            .join("、")}。`
        : `「${spec.label}」不需要填任何内容，但收到了「${key}」。`,
    };
  }
  const params: Record<string, unknown> = {};
  for (const p of declared) {
    const value = given[p.key];
    const missing =
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "");
    if (missing) {
      if (!p.required) continue;
      return {
        ok: false,
        reason: `还差「${p.label || p.key}」没告诉我${
          p.hint ? `（${p.hint}）` : ""
        }，这个我不替你猜，你说一句我再动手。`,
      };
    }
    if (p.type === "number") {
      const num =
        typeof value === "number"
          ? value
          : typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())
            ? Number(value.trim())
            : NaN;
      if (!Number.isFinite(num)) {
        return {
          ok: false,
          reason: `「${p.label || p.key}」要填一个数字，收到的不是数字。`,
        };
      }
      params[p.key] = num;
      continue;
    }
    if (p.type === "boolean") {
      const bool =
        typeof value === "boolean"
          ? value
          : value === "true"
            ? true
            : value === "false"
              ? false
              : null;
      if (bool === null) {
        return {
          ok: false,
          reason: `「${p.label || p.key}」只能是「是」或「否」。`,
        };
      }
      params[p.key] = bool;
      continue;
    }
    if (p.type === "enum") {
      const allowedValues = (p.enumValues || []).map((v) => v.value);
      if (typeof value !== "string" || (allowedValues.length && !allowedValues.includes(value))) {
        return {
          ok: false,
          reason: allowedValues.length
            ? `「${p.label || p.key}」只能填：${allowedValues.join(" / ")}。`
            : `「${p.label || p.key}」的取值不对。`,
        };
      }
      params[p.key] = value;
      continue;
    }
    if (typeof value !== "string") {
      return {
        ok: false,
        reason: `「${p.label || p.key}」要填一段文字。`,
      };
    }
    if (value.length > EDITOR_COMMAND_TEXT_LIMIT) {
      return {
        ok: false,
        reason: `「${p.label || p.key}」的内容太长了（超过 ${EDITOR_COMMAND_TEXT_LIMIT} 字），先精简一下。`,
      };
    }
    params[p.key] = value;
  }
  return { ok: true, params };
}

/** 一条待用户确认的改动。 */
export interface EditorCommandPending {
  editorId: string;
  spec: PluginCommandSpec;
  params: Record<string, unknown>;
  /** 确认卡上的人话：要做什么、改哪里、填了什么。 */
  prompt: string;
  /** 「以后这类不用问我」的键。 */
  approvalKey: string;
}

export type EditorCommandPlan =
  | { kind: "reject"; reason: string }
  | { kind: "confirm"; pending: EditorCommandPending }
  | {
      kind: "run";
      editorId: string;
      spec: PluginCommandSpec;
      params: Record<string, unknown>;
    };

/** 确认卡文案：只说人话，不出现 id、不出现 JSON。 */
export function describeEditorCommand(
  editorId: string,
  spec: PluginCommandSpec,
  params: Record<string, unknown>,
): string {
  const where = editorDisplayName(editorId);
  const declared = spec.params || [];
  const filled = declared
    .filter((p) => params[p.key] !== undefined)
    .map((p) => {
      const value = params[p.key];
      const shown =
        p.type === "boolean"
          ? value
            ? "是"
            : "否"
          : p.type === "enum"
            ? (p.enumValues || []).find((v) => v.value === value)?.label ||
              String(value)
            : String(value);
      const brief = shown.length > 60 ? `${shown.slice(0, 60)}…` : shown;
      return `${p.label || p.key}：${brief}`;
    });
  const head = `要我在${where}里「${spec.label}」吗？`;
  const what = spec.summary ? `这会${spec.summary}` : `这会改动当前${where}的内容`;
  const detail = filled.length ? `填的内容——${filled.join("；")}。` : "";
  return `${head}${what}。${detail}`;
}

/** 执行结果回写进对话的一句人话。 */
export function editorCommandResultNote(
  spec: PluginCommandSpec,
  result: PluginCommandResult,
): string {
  const message = String(result?.message || "").trim();
  if (result?.ok) {
    return `已完成「${spec.label}」。${message || "编辑器没有给出更多说明。"}`;
  }
  return `没能完成「${spec.label}」：${message || "编辑器没有说明原因。"}`;
}

/**
 * 判定一条指令该怎么办：拒掉 / 请用户确认 / 直接执行。
 * 越界 id、越界或缺失参数一律 `reject`，**绝不调用 `run()`**。
 */
export function planEditorCommand(
  surface: PluginCommandSurface | null | undefined,
  request: EditorCommandRequest,
  opts?: { approved?: ReadonlySet<string> },
): EditorCommandPlan {
  if (!surface) {
    return {
      kind: "reject",
      reason: "右边现在没有打开编辑器，这件事我做不了。你先打开一个文件，我再动手。",
    };
  }
  const editorId = String(surface.editorId || "").trim();
  const specs = surfaceSpecs(surface);
  const spec = specs.find((s) => s.id === request.id);
  if (!spec) {
    const menu = commandMenu(specs);
    return {
      kind: "reject",
      reason: menu
        ? `这个${editorDisplayName(editorId)}编辑器现在做不了这件事。它现在能做的是：${menu}。`
        : `这个${editorDisplayName(editorId)}编辑器现在没有可执行的指令。`,
    };
  }
  const checked = checkParams(spec, request.params);
  if (!checked.ok) return { kind: "reject", reason: checked.reason };
  const approvalKey = editorCommandKey(editorId, spec.id);
  if (spec.mutates && !opts?.approved?.has(approvalKey)) {
    return {
      kind: "confirm",
      pending: {
        editorId,
        spec,
        params: checked.params,
        prompt: describeEditorCommand(editorId, spec, checked.params),
        approvalKey,
      },
    };
  }
  return { kind: "run", editorId, spec, params: checked.params };
}

/** 真正调 `run()`；抛错也翻成一句人话，不让异常穿到界面上。 */
export async function runEditorCommand(
  surface: PluginCommandSurface,
  spec: PluginCommandSpec,
  params: Record<string, unknown>,
): Promise<PluginCommandResult> {
  try {
    const result = await surface.run(
      spec.id,
      Object.keys(params).length ? params : undefined,
    );
    if (!result || typeof result !== "object") {
      return { ok: false, message: "编辑器没有回应这条指令。" };
    }
    return {
      ok: result.ok === true,
      message: typeof result.message === "string" ? result.message : "",
      ...(typeof result.revision === "number"
        ? { revision: result.revision }
        : {}),
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error && e.message ? e.message : "编辑器执行时出错了。",
    };
  }
}

export interface EditorCommandOutcome {
  editorId: string;
  spec: PluginCommandSpec;
  params: Record<string, unknown>;
  result: PluginCommandResult;
  /** 回写进对话的一句人话。 */
  note: string;
}

export type EditorCommandOffer =
  | { kind: "none" }
  /** 拒了：note 是要回写进对话的一句人话，`run()` 没有被调用。 */
  | { kind: "reject"; note: string }
  /** 等用户点确认。 */
  | { kind: "confirm"; pending: EditorCommandPending; note?: string }
  /** 只读指令 / 用户已授权「以后这类不用问我」→ 已执行。 */
  | { kind: "ran"; outcome: EditorCommandOutcome };

export interface EditorCommandSession {
  /** 收下一条 assistant 消息里的指令。同一条消息只会被处理一次。 */
  offer(input: {
    messageId: number;
    content: string;
    surface: PluginCommandSurface | null;
  }): Promise<EditorCommandOffer>;
  /** 用户点了「就这么改」。返回 null = 没有待确认的事 / 正在执行。 */
  confirm(): Promise<EditorCommandOutcome | null>;
  /** 用户点了「先别改」。同一轮里后面的指令一并停掉。 */
  decline(): { note: string } | null;
  /** 用户勾了「以后这类不用问我」（只活在本会话内存里）。 */
  allowAlways(): void;
  pending(): EditorCommandPending | null;
  /** 用户又说话了 → 解除「被拒就停」。 */
  resume(): void;
  /** 会话级授权是否已给（测试与界面提示用）。 */
  isAllowed(editorId: string, id: string): boolean;
  /** 已真正调用 `run()` 的次数（自测用）。 */
  runCount(): number;
}

/**
 * 一次对话里的指令执行器。硬规则都在这里：
 *   - 同一条 assistant 消息只处理一次；**一次只执行一条**（正在执行时不接新的）。
 *   - `mutates:true` 未确认绝不执行；用户拒一条，这一轮后面的都停。
 *   - 一条消息里给了多条指令，只做第一条，其余明确告诉用户被忽略了。
 */
export function createEditorCommandSession(): EditorCommandSession {
  const handled = new Set<number>();
  const approved = new Set<string>();
  let waiting: {
    pending: EditorCommandPending;
    surface: PluginCommandSurface;
  } | null = null;
  let halted = false;
  let busy = false;
  let runs = 0;

  async function execute(
    surface: PluginCommandSurface,
    editorId: string,
    spec: PluginCommandSpec,
    params: Record<string, unknown>,
  ): Promise<EditorCommandOutcome> {
    busy = true;
    runs += 1;
    try {
      const result = await runEditorCommand(surface, spec, params);
      return {
        editorId,
        spec,
        params,
        result,
        note: editorCommandResultNote(spec, result),
      };
    } finally {
      busy = false;
    }
  }

  return {
    async offer({ messageId, content, surface }) {
      if (handled.has(messageId)) return { kind: "none" };
      const parsed = parseEditorCommandRequests(content);
      if (!parsed.requests.length && !parsed.invalidCount) return { kind: "none" };
      handled.add(messageId);
      if (halted) {
        return {
          kind: "reject",
          note: "上一步你说先别改，我就停在这里了。要继续的话跟我说一声。",
        };
      }
      if (busy || waiting) return { kind: "none" };
      if (!parsed.requests.length) {
        return {
          kind: "reject",
          note: "我刚才那条指令写坏了，没有执行任何改动。我重说一遍。",
        };
      }
      const extra = parsed.requests.length - 1;
      const suffix =
        extra > 0
          ? `（我一次只做一件事，先做这一件，其余 ${extra} 件等这件完成再说。）`
          : "";
      const plan = planEditorCommand(surface, parsed.requests[0], { approved });
      if (plan.kind === "reject") {
        return { kind: "reject", note: `${plan.reason}${suffix}` };
      }
      if (plan.kind === "confirm") {
        waiting = { pending: plan.pending, surface: surface! };
        return {
          kind: "confirm",
          pending: plan.pending,
          ...(suffix ? { note: suffix } : {}),
        };
      }
      const outcome = await execute(
        surface!,
        plan.editorId,
        plan.spec,
        plan.params,
      );
      return {
        kind: "ran",
        outcome: suffix
          ? { ...outcome, note: `${outcome.note}${suffix}` }
          : outcome,
      };
    },
    async confirm() {
      if (!waiting || busy) return null;
      const { pending, surface } = waiting;
      waiting = null;
      return execute(surface, pending.editorId, pending.spec, pending.params);
    },
    decline() {
      if (!waiting) return null;
      const { pending } = waiting;
      waiting = null;
      halted = true;
      return {
        note: `好，「${pending.spec.label}」没有执行，文件一个字没改。`,
      };
    },
    allowAlways() {
      if (waiting) approved.add(waiting.pending.approvalKey);
    },
    pending() {
      return waiting?.pending || null;
    },
    resume() {
      halted = false;
    },
    isAllowed(editorId, id) {
      return approved.has(editorCommandKey(editorId, id));
    },
    runCount() {
      return runs;
    },
  };
}
