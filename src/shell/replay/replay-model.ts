// ============================================================================
// @oceanleo/ui — agent 回放的纯逻辑层（无 React、无 DOM）
// ----------------------------------------------------------------------------
// 回放页要做到的事：一次分享出去的 agent 会话，别人打开就像看视频——标题在顶上，
// 正文一条条**播**出来，每条是一张能展开的行卡片，底部一条状态栏。
//
// 为什么把顺序 / 节奏 / 跳过 / 重播四件事全放在这里而不是组件里：它们是这页唯一
// 会被人改坏的部分（改快改慢、跳过之后又被定时器补一条、重播没清干净），放进纯
// 函数与 reducer 才能不起 jsdom、不起定时器就逐条钉死。组件只负责「到点了 dispatch
// 一次」和把结果画出来。
//
// 数据来源（合同 §4 I-1 / I-2，2026-08-20）：
//   - 列表来自 `GET /v1/share/<share_id>`（见 ./share-client）；
//   - 每一步的细节来自消息 `meta.args_preview`（≤1024 字符）与
//     `meta.result_preview`（≤2048 字符）。**这两个键是选配**：老任务根本没有，
//     所以缺失一律渲染成「无预览」，绝不抛错。
// ============================================================================

import type { AgentMessage } from "../../lib/agent";

/** 合同 I-1 给的硬上限。后端已经截过一刀，这里再截一刀是防御：分享出去的页面
 *  面向陌生人，不能因为某条历史数据超长就把整页卡死。 */
export const REPLAY_ARGS_PREVIEW_LIMIT = 1024;
export const REPLAY_RESULT_PREVIEW_LIMIT = 2048;

/** 表格预览的显示上限（R5 说后端按 5 行 × 40 列取样，这里按同一量级兜底）。 */
export const REPLAY_TABLE_MAX_ROWS = 20;
export const REPLAY_TABLE_MAX_COLUMNS = 40;

/** 行卡片标题右半（`Execute Terminal | List user skills directories` 的后半截）。 */
const REPLAY_TARGET_MAX_CHARS = 80;

export type UITranslateLike = (
  zh: string,
  vars?: Record<string, string | number>,
) => string;

const identity: UITranslateLike = (zh) => zh;

// ---------------------------------------------------------------------------
// 预览：一段纯文本 → 「无 / 等宽文本 / 真表格」三选一
// ---------------------------------------------------------------------------

export type ReplayPreview =
  | { kind: "none" }
  | { kind: "text"; text: string; truncated: boolean }
  | {
      kind: "table";
      /** 第一行当表头；只有一行数据时为 null。 */
      header: string[] | null;
      rows: string[][];
      /** 超出行/列上限，或原文被截断过。 */
      truncated: boolean;
    };

/** 只有制表符与竖线是「这是表格」的强信号；逗号太常见，单列一条更严的规则。 */
const STRONG_SEPARATORS = ["\t", "|"] as const;

function clampText(raw: string, limit: number): { text: string; truncated: boolean } {
  return raw.length > limit
    ? { text: raw.slice(0, limit), truncated: true }
    : { text: raw, truncated: false };
}

/** markdown 表格的 `|---|:--:|` 分隔行不是数据，画出来是一行破折号。 */
function isRuleRow(line: string): boolean {
  return /-/.test(line) && /^[\s|:+-]+$/.test(line);
}

function splitRow(line: string, separator: string): string[] {
  const cells = line.split(separator).map((cell) => cell.trim());
  if (separator !== "|") return cells;
  // markdown 写法两端各带一根竖线，切出来会多两个空壳。
  if (cells.length > 1 && cells[0] === "") cells.shift();
  if (cells.length > 1 && cells[cells.length - 1] === "") cells.pop();
  return cells;
}

/**
 * 逗号是弱信号：中文正文里「你好，世界」满地都是，按逗号切会把一段话切成假表格。
 * 所以只在**每行至少三格、每格都很短、且没有引号**（引号意味着 CSV 转义，朴素
 * split 会切坏）时才认。
 */
function looksLikeCommaTable(rows: string[][], lines: string[]): boolean {
  if (rows[0].length < 3) return false;
  if (lines.some((line) => line.includes('"'))) return false;
  return rows.every((row) => row.every((cell) => cell.length <= 32));
}

/** 像表格就返回二维数组，不像就返回 null。 */
export function detectPreviewTable(text: string): string[][] | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !isRuleRow(line));
  if (lines.length < 2) return null;

  for (const separator of [...STRONG_SEPARATORS, ","]) {
    if (!lines.every((line) => line.includes(separator))) continue;
    const rows = lines.map((line) => splitRow(line, separator));
    const width = rows[0].length;
    if (width < 2) continue;
    if (!rows.every((row) => row.length === width)) continue;
    if (separator === "," && !looksLikeCommaTable(rows, lines)) continue;
    return rows;
  }
  return null;
}

/**
 * `meta.args_preview` / `meta.result_preview` → 可渲染的预览。
 *
 * 键缺失、不是字符串、只有空白，一律 `{ kind: "none" }`（页面画「无预览」）；
 * 超长先截到上限再判形状；像表格就给表格，否则给等宽文本。
 */
export function parseReplayPreview(raw: unknown, limit: number): ReplayPreview {
  if (typeof raw !== "string") return { kind: "none" };
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "none" };

  const { text, truncated } = clampText(trimmed, limit);
  const table = detectPreviewTable(text);
  if (!table) return { kind: "text", text, truncated };

  const clippedRows = table
    .slice(0, REPLAY_TABLE_MAX_ROWS)
    .map((row) => row.slice(0, REPLAY_TABLE_MAX_COLUMNS));
  const clipped =
    truncated ||
    table.length > REPLAY_TABLE_MAX_ROWS ||
    table.some((row) => row.length > REPLAY_TABLE_MAX_COLUMNS);
  const [first, ...rest] = clippedRows;
  return rest.length > 0
    ? { kind: "table", header: first, rows: rest, truncated: clipped }
    : { kind: "table", header: null, rows: clippedRows, truncated: clipped };
}

/** 预览的「体量」，只用来算节奏（长的多停一会儿）。 */
function previewWeight(preview: ReplayPreview): number {
  if (preview.kind === "text") return preview.text.length;
  if (preview.kind === "table") {
    const cells = [...(preview.header ? [preview.header] : []), ...preview.rows];
    return cells.reduce(
      (sum, row) => sum + row.reduce((width, cell) => width + cell.length, 0),
      0,
    );
  }
  return 0;
}

// ---------------------------------------------------------------------------
// 工具名 → 人话
// ---------------------------------------------------------------------------

/** 键是后端真实工具名（`oceanleo/backend/app/agent_tools.py` 的
 *  `BASE_TOOLSET` / `SITE_BUILDER_TOOLSET` / `WORKSPACE_TOOLSET`）。
 *  表里没有的工具直接显示原名——宁可露出 `foo_bar`，也不要显示一个假名字。 */
const REPLAY_TOOL_LABELS: Record<string, string> = {
  gen_image: "生成图片",
  gen_video: "生成视频",
  gen_music: "生成音乐",
  gen_3d: "生成 3D 模型",
  tts: "合成语音",
  web_search: "搜索",
  read_url: "读网页",
  read_image: "读图",
  search_files: "找文件",
  search_materials: "找素材",
  open_workspace: "打开工作台",
  research_fanout: "并行调研",
  run_python: "运行代码",
  make_material: "制作文件",
  upload_artifact: "保存产出",
  convert_file: "转换格式",
  site_create: "创建站点",
  site_write: "写站点文件",
  site_read: "读站点文件",
  site_status: "查站点状态",
  site_publish: "发布站点",
  supabase_provision: "开通数据库",
  browse: "浏览网页",
};

export function replayToolLabel(tool: string, tt: UITranslateLike = identity): string {
  const label = REPLAY_TOOL_LABELS[tool];
  return label ? tt(label) : tool;
}

// ---------------------------------------------------------------------------
// 消息 → 行卡片
// ---------------------------------------------------------------------------

export interface ReplayStep {
  id: number;
  role: "user" | "assistant";
  kind: string;
  /** 行卡片标题左半：这一步在干什么。 */
  action: string;
  /** 行卡片标题右半：干在谁身上；空串表示没有可说的对象。 */
  target: string;
  /** 消息正文（展开区里没有 result 预览时兜底显示它）。 */
  content: string;
  args: ReplayPreview;
  result: ReplayPreview;
  createdAt: string;
  /** 这一条出现之前要等多久（毫秒）。 */
  delayMs: number;
  /** 最终答案：底部 `Result` 按钮的落点。 */
  final: boolean;
}

/** 想从 `args_preview` 里挑出来当标题的字段，按「最像标题」的顺序排。 */
const TARGET_KEYS = [
  "query",
  "keyword",
  "url",
  "title",
  "name",
  "path",
  "file",
  "filename",
  "target",
  "prompt",
  "text",
  "description",
  "code",
];

function firstLine(value: string): string {
  const line = value.split(/\r?\n/).find((entry) => entry.trim().length > 0) || "";
  return line.trim();
}

function shorten(value: string, limit = REPLAY_TARGET_MAX_CHARS): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}

/**
 * 行卡片标题右半。`args_preview` 按契约是一段 JSON 文本，能解析就挑一个字段当标题，
 * 解析不了就拿第一行——这里不用 `JSON.parse` 的成败当判据去做别的事，
 * 纯粹是「拿一句人看得懂的话」。
 */
export function replayStepTarget(preview: ReplayPreview, fallback: string): string {
  if (preview.kind === "text") {
    let parsed: unknown = undefined;
    try {
      parsed = JSON.parse(preview.text);
    } catch {
      /* 不是 JSON：下面按纯文本处理 */
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      for (const key of TARGET_KEYS) {
        const value = record[key];
        if (typeof value === "string" && value.trim()) return shorten(value);
      }
      for (const value of Object.values(record)) {
        if (typeof value === "string" && value.trim()) return shorten(value);
      }
    } else if (typeof parsed === "string" && parsed.trim()) {
      return shorten(parsed);
    } else {
      return shorten(firstLine(preview.text));
    }
  }
  if (preview.kind === "table") {
    const head = preview.header || preview.rows[0] || [];
    if (head.length) return shorten(head.join(" · "));
  }
  return shorten(fallback);
}

function stepAction(message: AgentMessage, tt: UITranslateLike): string {
  if (message.role === "user") return tt("提问");
  const meta = message.meta || {};
  const tool = typeof meta.tool === "string" ? meta.tool : "";
  if (tool) return replayToolLabel(tool, tt);
  switch (message.kind) {
    case "plan":
      return tt("规划");
    case "step":
      return tt("执行");
    case "analysis":
      return tt("思考");
    case "error":
      return tt("出错");
    case "gate":
      return tt("等待确认");
    case "report":
      return (
        (typeof meta.worker_name === "string" && meta.worker_name) ||
        (typeof meta.worker === "string" && meta.worker) ||
        tt("成员回答")
      );
    case "artifact":
      return tt("产出");
    default:
      return meta.artifact ? tt("产出") : tt("回答");
  }
}

function isFinalMessage(message: AgentMessage): boolean {
  const meta = message.meta || {};
  return (
    message.role === "assistant" &&
    (meta.final === true || meta.done === true) &&
    message.kind !== "step"
  );
}

/** 播放节奏。**不按真实耗时播**：一个跑了十分钟的任务没人愿意看十分钟。 */
export const REPLAY_BASE_STEP_MS = 300;
export const REPLAY_PER_CHAR_MS = 0.6;
export const REPLAY_MAX_STEP_MS = 1100;

export function replayStepDelayMs(
  content: string,
  args: ReplayPreview,
  result: ReplayPreview,
): number {
  const weight = content.length + previewWeight(args) + previewWeight(result);
  const raw = REPLAY_BASE_STEP_MS + weight * REPLAY_PER_CHAR_MS;
  return Math.min(REPLAY_MAX_STEP_MS, Math.max(REPLAY_BASE_STEP_MS, Math.round(raw)));
}

function timeValue(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function idValue(message: AgentMessage): number {
  return typeof message.id === "number" && Number.isFinite(message.id)
    ? message.id
    : Number.MAX_SAFE_INTEGER;
}

/**
 * 分享回来的消息列表 → 按时间排好序的行卡片。
 *
 * 排序：先 `created_at`（两边都能解析出来时），再 `id`，最后原始下标。
 * 后两级不是装饰——老数据的 `created_at` 可能同秒甚至缺失，只按时间排会抖。
 *
 * `ui_action` 不进回放（它是给前端下指令的，不是给人看的，聊天页也不画它）。
 */
export function buildReplaySteps(
  messages: readonly AgentMessage[] | null | undefined,
  tt: UITranslateLike = identity,
): ReplayStep[] {
  const visible = (messages || [])
    .filter((message) => message && message.kind !== "ui_action")
    .map((message, index) => ({ message, index }));

  visible.sort((left, right) => {
    const leftTime = timeValue(left.message.created_at);
    const rightTime = timeValue(right.message.created_at);
    if (leftTime !== null && rightTime !== null && leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    const leftId = idValue(left.message);
    const rightId = idValue(right.message);
    if (leftId !== rightId) return leftId - rightId;
    return left.index - right.index;
  });

  return visible.map(({ message }) => {
    const meta = message.meta || {};
    const args = parseReplayPreview(meta.args_preview, REPLAY_ARGS_PREVIEW_LIMIT);
    const result = parseReplayPreview(meta.result_preview, REPLAY_RESULT_PREVIEW_LIMIT);
    const content = typeof message.content === "string" ? message.content : "";
    return {
      id: idValue(message),
      role: message.role === "user" ? "user" : "assistant",
      kind: message.kind || "text",
      action: stepAction(message, tt),
      target: replayStepTarget(args, content),
      content,
      args,
      result,
      createdAt: message.created_at || "",
      delayMs: replayStepDelayMs(content, args, result),
      final: isFinalMessage(message),
    };
  });
}

/** 每一条**出现的时刻**（从开播算起的累计毫秒）。测节奏用，也给进度条用。 */
export function replayTimeline(steps: readonly ReplayStep[]): number[] {
  let elapsed = 0;
  return steps.map((step) => {
    elapsed += step.delayMs;
    return elapsed;
  });
}

// ---------------------------------------------------------------------------
// 播放状态机
// ---------------------------------------------------------------------------

export type ReplayStatus = "playing" | "completed";

export interface ReplayState {
  total: number;
  /** 已经铺出来的条数。 */
  revealed: number;
  status: ReplayStatus;
}

export type ReplayAction =
  /** 数据到了 / 换了一份数据：从头开始播这 total 条。 */
  | { type: "load"; total: number }
  /** 定时器到点，再露一条。 */
  | { type: "reveal" }
  /** 用户点了跳过（或点了 Result）：一次铺完。 */
  | { type: "skip" }
  /** 播完之后点 Replay。 */
  | { type: "restart" };

export function createReplayState(total: number): ReplayState {
  const safe = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  // 一条都没有就没什么可播的，直接停在完成态（否则底部会永远显示「playing」）。
  return { total: safe, revealed: 0, status: safe > 0 ? "playing" : "completed" };
}

export function replayReducer(state: ReplayState, action: ReplayAction): ReplayState {
  switch (action.type) {
    case "load":
      return createReplayState(action.total);
    case "reveal": {
      if (state.status === "completed") return state;
      const revealed = Math.min(state.total, state.revealed + 1);
      return {
        total: state.total,
        revealed,
        status: revealed >= state.total ? "completed" : "playing",
      };
    }
    case "skip":
      if (state.status === "completed" && state.revealed === state.total) return state;
      return { total: state.total, revealed: state.total, status: "completed" };
    case "restart":
      return createReplayState(state.total);
    default:
      return state;
  }
}

/**
 * 下一条该在多少毫秒之后出现；已经播完就是 `null`（组件据此不再挂定时器）。
 * 跳过之后立刻变 `null`，所以「跳过之后定时器又补一条」这个老坑在这里就被堵死。
 */
export function nextReplayDelayMs(
  state: ReplayState,
  steps: readonly ReplayStep[],
): number | null {
  if (state.status === "completed") return null;
  const next = steps[state.revealed];
  return next ? next.delayMs : null;
}

/** 底部 `Result` 按钮的落点：最终答案；没有就退回最后一条。 */
export function replayResultStepId(steps: readonly ReplayStep[]): number | null {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    if (steps[index].final) return steps[index].id;
  }
  return steps.length ? steps[steps.length - 1].id : null;
}
