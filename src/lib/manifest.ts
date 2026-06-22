// ============================================================================
// @oceanleo/ui — Agent Manifest（可迁移操作台的单一事实源）
// ----------------------------------------------------------------------------
// 宗旨 v4：docs/architecture/oceanleo-agent-manifest-and-portable-console.md
//   一个 agent = 一份可迁移的 manifest（agent.json + prompt.md + console.json），
//   存在 elonotalone/oceanleo-agents repo + oceanleo 生产库，由通用渲染器
//   <AgentConsole> 在任何站点用完全一致的 UI 渲染，统一经「能力 SDK」调网关。
//
// 本文件定义 console.json 的 TypeScript 形状（ConsoleManifest）+ 模板渲染 +
// 由 manifest 推导出 doctrine v3 的 OpsSchema（让 manifest 渲染出的操作台能直接
// 复用 FunctionAgentChat 的「操作台/agent」双形态）。
// ============================================================================

import type { OpsField, OpsSchema } from "./fn-agent";

// --------------------------------------------------------------------------- //
// 控件词表（前端控件库，AgentConsole 据此渲染）。员工只能从词表里选。
// --------------------------------------------------------------------------- //
export type FieldControl =
  | "text"
  | "longtext"
  | "enum"
  | "number"
  | "boolean"
  | "image-upload";

export type ResultRender =
  | "editable-text" // 可编辑长文（textarea）
  | "markdown" // markdown 渲染
  | "image-grid" // 图片网格
  | "3d-preview" // 3D 模型预览（glb）
  | "video-player" // 视频
  | "audio-player"; // 音频

// --------------------------------------------------------------------------- //
// 能力词表（capability → 网关接口，由 lib/capabilities.ts 映射）。
// --------------------------------------------------------------------------- //
export type Capability =
  | "chat"
  | "image"
  | "threed"
  | "video"
  | "audio"
  | "tts"
  | "music"
  | "search"
  | "convert"
  | "agent";

export interface ManifestField {
  key: string;
  label: string;
  control: FieldControl;
  placeholder?: string;
  required?: boolean;
  /** control=enum 的取值（字符串或 {value,label}）。 */
  options?: (string | { value: string; label: string })[];
  default?: unknown;
  /** 给 agent 的填写提示（透传到 OpsField.hint）。 */
  hint?: string;
  /** 模板/素材类：agent 不替用户选（透传 OpsField.userPicksOnly）。 */
  userPicksOnly?: boolean;
}

export interface ManifestSection {
  id: string;
  title: string;
  fields: ManifestField[];
}

export interface ManifestAction {
  label: string;
  /** 点了调哪个原子能力。 */
  capability: Capability;
  /** chat 类：system 提示词（可含 {{field}} 模板）。 */
  systemTemplate?: string;
  /** chat 类：user 提示词模板（{{field}} 用操作台 state 填充）。 */
  userTemplate?: string;
  /** 非 chat 能力（image/threed/...）：直接把这些字段作为请求参数（值可含模板）。 */
  params?: Record<string, string>;
  /** 结果落到哪个字段 + 用什么控件展示。 */
  output: { key: string; control: ResultRender };
}

export interface ManifestCanvasTab {
  id: string;
  label: string;
  render: ResultRender;
  /** 渲染哪个字段的值（= action.output.key 或其它）。 */
  from: string;
  emptyTitle?: string;
  emptyHint?: string;
}

export interface ConsoleManifest {
  title: string;
  accent?: string;
  sections: ManifestSection[];
  action: ManifestAction;
  canvas: { tabs: ManifestCanvasTab[] };
  /** false = 平台维护、员工不可改（重交互特例，如画布/3D 编辑）。默认 true。 */
  editableByStaff?: boolean;
}

const DEFAULT_ACTION: ManifestAction = {
  label: "生成",
  capability: "chat",
  systemTemplate: "",
  userTemplate: "",
  output: { key: "result", control: "editable-text" },
};

const DEFAULT_CANVAS_TABS: ManifestCanvasTab[] = [
  {
    id: "result",
    label: "结果",
    render: "editable-text",
    from: "result",
    emptyTitle: "结果会显示在这里",
  },
];

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function normalizeField(raw: unknown, index: number): ManifestField | null {
  const f = asObject(raw);
  const key = String(f.key || "").trim();
  if (!key) return null;
  const control = String(f.control || "text") as FieldControl;
  const options = Array.isArray(f.options) ? f.options : undefined;
  return {
    key,
    label: String(f.label || key),
    control,
    placeholder: f.placeholder != null ? String(f.placeholder) : undefined,
    required: Boolean(f.required),
    options: options as ManifestField["options"],
    default: f.default,
    hint: f.hint != null ? String(f.hint) : undefined,
    userPicksOnly: f.userPicksOnly === true,
  };
}

function normalizeSection(raw: unknown, index: number): ManifestSection {
  const sec = asObject(raw);
  const fieldsRaw = Array.isArray(sec.fields) ? sec.fields : [];
  const fields = fieldsRaw
    .map((f, i) => normalizeField(f, i))
    .filter((f): f is ManifestField => Boolean(f));
  return {
    id: String(sec.id || `section-${index + 1}`),
    title: String(sec.title || `区块 ${index + 1}`),
    fields,
  };
}

/** 把网关/草稿里残缺或空的 console 规范成 AgentConsole 可安全渲染的形状。 */
export function normalizeConsoleManifest(raw: unknown): ConsoleManifest {
  const c = asObject(raw);
  const sections = Array.isArray(c.sections)
    ? c.sections.map((sec, i) => normalizeSection(sec, i))
    : [];

  const actionRaw = asObject(c.action);
  const outputRaw = asObject(actionRaw.output);
  const action: ManifestAction = {
    ...DEFAULT_ACTION,
    label: String(actionRaw.label || DEFAULT_ACTION.label),
    capability: (String(actionRaw.capability || DEFAULT_ACTION.capability) as Capability),
    systemTemplate:
      actionRaw.systemTemplate != null ? String(actionRaw.systemTemplate) : DEFAULT_ACTION.systemTemplate,
    userTemplate:
      actionRaw.userTemplate != null ? String(actionRaw.userTemplate) : DEFAULT_ACTION.userTemplate,
    params:
      actionRaw.params && typeof actionRaw.params === "object" && !Array.isArray(actionRaw.params)
        ? (actionRaw.params as Record<string, string>)
        : undefined,
    output: {
      key: String(outputRaw.key || DEFAULT_ACTION.output.key),
      control: (String(outputRaw.control || DEFAULT_ACTION.output.control) as ResultRender),
    },
  };

  const canvasRaw = asObject(c.canvas);
  const tabs = Array.isArray(canvasRaw.tabs)
    ? canvasRaw.tabs
        .map((tab, i) => {
          const t = asObject(tab);
          const from = String(t.from || action.output.key);
          return {
            id: String(t.id || `tab-${i + 1}`),
            label: String(t.label || `结果 ${i + 1}`),
            render: (String(t.render || "editable-text") as ResultRender),
            from,
            emptyTitle: t.emptyTitle != null ? String(t.emptyTitle) : undefined,
            emptyHint: t.emptyHint != null ? String(t.emptyHint) : undefined,
          } satisfies ManifestCanvasTab;
        })
        .filter((t) => t.from)
    : DEFAULT_CANVAS_TABS.map((t) => ({ ...t, from: action.output.key }));

  return {
    title: String(c.title || "操作台"),
    accent: c.accent != null ? String(c.accent) : undefined,
    sections,
    action,
    canvas: { tabs: tabs.length ? tabs : DEFAULT_CANVAS_TABS },
    editableByStaff: c.editableByStaff === false ? false : true,
  };
}

/** 规范化完整 AgentManifest（重点修复 console.sections 非数组导致的崩溃）。 */
export function normalizeAgentManifest(raw: AgentManifest): AgentManifest {
  return {
    ...raw,
    console: normalizeConsoleManifest(raw.console),
  };
}

// 完整 manifest（注册 + prompt + console），网关 /v1/agents/{id}/manifest 返回。
export interface AgentManifest {
  agent_id: string;
  site_id: string;
  fn_id: string;
  name: string;
  tagline: string;
  icon: string;
  category: string;
  capabilities: string;
  prompt: string;
  console: ConsoleManifest;
  enabled: boolean;
  sort_order: number;
  channel?: "draft" | "live";
}

// --------------------------------------------------------------------------- //
// 模板渲染：{{field}} → 操作台 state 里的值。未填的占位渲染成空串并清掉残留行。
// --------------------------------------------------------------------------- //
export function renderTemplate(
  tpl: string,
  state: Record<string, unknown>,
): string {
  if (!tpl) return "";
  const out = tpl.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => {
    const v = state[key];
    return v == null ? "" : String(v);
  });
  // 行尾留下「标签：」但值为空的行（如「职位 JD：」无内容）整行去掉，避免脏提示词。
  return out
    .split("\n")
    .filter((line) => !/^[^:：]{1,12}[：:]\s*$/.test(line.trim()))
    .join("\n")
    .trim();
}

// --------------------------------------------------------------------------- //
// 由 ConsoleManifest 推导 doctrine v3 的 OpsSchema（给 FunctionAgentChat 用）。
// agent 经 OpsPatch.set 写这些 key → AgentConsole 落进操作台 state → 右栏重渲染。
// --------------------------------------------------------------------------- //
export function manifestToOpsSchema(
  agentId: string,
  m: ConsoleManifest,
): OpsSchema {
  const fields: OpsField[] = [];
  for (const sec of m.sections) {
    for (const f of sec.fields) {
      fields.push({
        key: f.key,
        label: f.label,
        type: f.control === "longtext" ? "longtext"
          : f.control === "enum" ? "enum"
          : f.control === "number" ? "number"
          : f.control === "boolean" ? "boolean"
          : "text",
        enumValues: f.options?.map((o) =>
          typeof o === "string" ? { value: o, label: o } : o,
        ),
        hint: f.hint,
        userPicksOnly: f.userPicksOnly,
      });
    }
  }
  // 结果字段也声明进 schema，agent 可直接产出结果文本写进 output.key。
  fields.push({
    key: m.action.output.key,
    label: m.title + "结果",
    type: "longtext",
  });
  return {
    agentId,
    title: m.title,
    fields,
    actions: [{ id: "generate", label: m.action.label, run: "frontend" }],
  };
}

/** 操作台初始 state：每个字段取 default（或空）。 */
export function initialState(m: ConsoleManifest): Record<string, unknown> {
  const st: Record<string, unknown> = {};
  for (const sec of m.sections) {
    for (const f of sec.fields) {
      st[f.key] = f.default ?? (f.control === "boolean" ? false : "");
    }
  }
  st[m.action.output.key] = "";
  return st;
}
