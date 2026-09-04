/**
 * agent 指令面的**唯一**写入决策点：没有审阅令牌，一个字都不进游戏源码。
 *
 * ## 这个文件为什么存在（先读这一段，别照 A-43 之前的写法抄）
 *
 * 本波查出「agent 改动 100% 进审阅」这条承诺在四处被绕过（A-41），其中两处的病根
 * 不是漏了一行 `submit`，而是**取指令面的地方失败即开放**：`A() || 未包闸的原始面`
 * ——闸没装时前者返回 `null`，那个 `||` 就把没包闸的原始面交出去了（A-43 判的
 * `PARENT-red-1` 就是这一处）。
 *
 * 所以这里**不依赖宿主替我包闸**：本文件产出的 surface 自己就是闸。即便有人把它
 * 原样交给 agent（今天的宿主在某些调用点确实会这么做），agent 也写不进去 ——
 * 会改源码的每一条指令都先变成一份 `review-proposal` 交出去，只有宿主接受提案时
 * **原路递回**的一次性能力令牌能换来一次真写入。
 *
 * ## 令牌为什么是「参数里的一次性 nonce」
 *
 * 宿主闸（`agent-review/gate.ts`）有一个模块级 `applyDepth`，但它**没有导出读取口**，
 * 而 `agent-review/*` 不是我的面。实读宿主的接受路径（`AgentConsole.tsx` /
 * `AgentChat.tsx`）：
 *
 * ```
 * applyParkedReview(surface, parked)
 *   → withReviewApply(() => surface.run(parked.proposal.commandId, parked.params))
 * ```
 *
 * ⇒ 接受时调的是**原始 surface**（也就是本文件），且 `params` 逐字就是 park 时那一份。
 * 所以 park 时往 `params` 里放一个随机一次性 nonce，宿主原路递回，凭 nonce 才写。
 *
 * 这是**能力令牌**而不是开关：nonce 只存在本模块的 `liveTokens` 里，agent 那一侧
 * 从头到尾看不到它（审阅面板渲染的是 proposal，不是 params），猜不中就写不了；
 * 用一次就烧掉；令牌与 commandId 绑定，拿「改一段代码」批下来的令牌去调
 * 「换掉整份源码」同样无效。
 *
 * 形状照 W03 的 `grid-univer/agent-write-gate.ts`（A-41 red-3 的修法，`8fff3c8`），
 * 不另发明第二套。
 */
import { submitAgentReviewProposal } from "../agent-review/inbox";
import type { ParkedReview } from "../agent-review/session";
import type {
  PluginCommandResult,
  PluginCommandSpec,
  PluginCommandSurface,
} from "../plugin-command/types";
import {
  validReviewProposal,
  type EditorReviewProposal,
} from "../hosted-editor/index";
import { gameSourceByteLength, inspectGameDraft } from "./game-source";

/** 审阅令牌在 `parked.params` 里的键名。宿主原样转发，不认识它。 */
export const GAME_APPLY_TOKEN_KEY = "__gameReviewApply";

/** 编辑器 id，与编辑栏适配器 id 逐字相同。 */
export const GAME_EDITOR_ID = "game";

/**
 * agent 能调、但**不改源码**的指令。
 *
 * 其余凡是有执行器的一律按「会改源码」处置 —— **默认落在安全的那一侧**，
 * 这样新加一条指令时忘了往白名单里补一行，结果是「多过一道审阅」而不是「漏出去」。
 */
export const GAME_AGENT_READONLY_COMMANDS: readonly string[] = [
  "game.read-source",
  "game.read-params",
];

const READONLY_SET = new Set(GAME_AGENT_READONLY_COMMANDS);

// ── 令牌 ────────────────────────────────────────────────────────────────────

const liveTokens = new Map<string, string>();
const MAX_LIVE_TOKENS = 8;

function randomToken(): string {
  const webCrypto = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (typeof webCrypto?.randomUUID === "function") {
    return `gmt-${webCrypto.randomUUID()}`;
  }
  const bytes = (
    globalThis as {
      crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array };
    }
  ).crypto?.getRandomValues?.(new Uint8Array(16));
  if (bytes) {
    return `gmt-${Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("")}`;
  }
  return `gmt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function mintApplyToken(commandId: string): string {
  const token = randomToken();
  liveTokens.set(token, commandId);
  while (liveTokens.size > MAX_LIVE_TOKENS) {
    const oldest = liveTokens.keys().next().value;
    if (oldest === undefined) break;
    liveTokens.delete(oldest);
  }
  return token;
}

/**
 * 令牌在不在、是不是这条命令的。只看不烧。
 * 去向判定必须是纯函数，副作用（烧掉令牌）发生在 apply 分支里。
 */
export function peekGameApplyToken(
  commandId: string,
  params: Record<string, unknown> | undefined,
): boolean {
  const raw = params?.[GAME_APPLY_TOKEN_KEY];
  if (typeof raw !== "string" || raw.length === 0) return false;
  return liveTokens.get(raw) === commandId;
}

/**
 * 手上这批参数带的令牌，是不是**这条命令**的、且还没用过。
 *
 * 一次性：核过就删。不删的话，agent 只要把上一次接受时那次调用重放一遍，
 * 就能在作者没点头的情况下再改一次代码。
 */
export function consumeGameApplyToken(
  commandId: string,
  params: Record<string, unknown> | undefined,
): boolean {
  if (!peekGameApplyToken(commandId, params)) return false;
  const raw = params?.[GAME_APPLY_TOKEN_KEY];
  if (typeof raw !== "string") return false;
  liveTokens.delete(raw);
  return true;
}

/** agent 一条指令的去向。绕过必须拆掉 `review` 这支，结构上可检测（A-53）。 */
export type GameAgentDisposition =
  | { kind: "unknown"; message: string }
  | { kind: "readonly"; commandId: string }
  | { kind: "apply"; commandId: string }
  | { kind: "review"; commandId: string };

/**
 * 写与不写由本函数一次性决定。
 *
 * **失败即关闭（A-49）**：会改源码的指令，默认送审；只有显式令牌才直行。
 * 拿不到凭据就放行的写法（`tokenOk || true`、缺章即 execute）在这里没有落点。
 */
export function planGameAgentDisposition(input: {
  commandId: string;
  mutates: boolean;
  tokenMatches: boolean;
  known: boolean;
}): GameAgentDisposition {
  if (!input.known) {
    return {
      kind: "unknown",
      message: `游戏编辑器没有「${input.commandId}」这条指令。`,
    };
  }
  if (!input.mutates) {
    return { kind: "readonly", commandId: input.commandId };
  }
  if (input.tokenMatches) {
    return { kind: "apply", commandId: input.commandId };
  }
  return { kind: "review", commandId: input.commandId };
}

/** 只给测试用：清空令牌，让每个用例从零开始。 */
export function resetGameApplyTokens(): void {
  liveTokens.clear();
}

// ── 编辑面要提供的执行能力（由 `GameCodeStage` 注入）────────────────────────

export interface GameAgentEditorPort {
  /** 当前源码。 */
  source: () => string;
  /** 当前编辑修订号，proposal 的 `revision` 取它。 */
  revision: () => number;
  /** 真正把源码写进草稿。**只有持令牌时才会被调用。** */
  writeSource: (next: string) => void;
  /** 当前参数声明（JSON 可序列化），没有就给 null。 */
  params: () => Record<string, unknown> | null;
  /** 真正写参数声明。同样只有持令牌时才被调用。 */
  writeParams?: (next: Record<string, unknown>) => void;
}

// ── 提案 ────────────────────────────────────────────────────────────────────

function clip(value: string, max: number): string {
  const text = String(value ?? "");
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * 源码改动的提案。给的是**文本 diff** 而不是 `objects[]`：
 * 源码是一份连续文本，一格一条的对象改动在这里没有落点，硬塞进去会让审阅面板
 * 显示一条骗人的「对象列表」。契约要求 diff 与 objects 恰好给一个。
 */
export function buildGameSourceProposal(input: {
  proposalId: string;
  commandId: string;
  before: string;
  after: string;
  revision: number;
  label: string;
}): EditorReviewProposal | null {
  const before = String(input.before ?? "");
  const after = String(input.after ?? "");
  if (!after.trim()) return null;
  if (before === after) return null;
  const proposal = {
    proposalId: clip(input.proposalId, 128),
    commandId: input.commandId,
    summary: {
      before: clip(
        `当前源码 ${gameSourceByteLength(before)} 字节`,
        2_000,
      ),
      after: clip(
        `将执行「${input.label}」，源码变成 ${gameSourceByteLength(after)} 字节`,
        2_000,
      ),
    },
    diff: clip(unifiedGameDiff(before, after), 200_000),
    targetSelection: null,
    revision: input.revision,
  } as EditorReviewProposal;
  return validReviewProposal(proposal) ? proposal : null;
}

/**
 * 逐行 diff。
 *
 * 为什么不用 `agent-review/diff.ts` 的 `unifiedDiff`：那一份是给短文本用的
 * （审阅面板里一句话对一句话）。游戏源码动辄上千行，整份逐行比对会把 200KB 的
 * 载荷上限吃满，而作者真正要看的只有变动那几处。这里按「变动块 + 三行上下文」
 * 裁剪，超出上限时**明说被截断**，不静默截掉。
 */
export function unifiedGameDiff(before: string, after: string): string {
  const a = before.split("\n");
  const b = after.split("\n");
  const out: string[] = [];
  let i = 0;
  let j = 0;
  const CONTEXT = 3;
  const MAX_LINES = 2_000;
  while (i < a.length || j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    // 找下一处重新对齐的点，窗口有限，超过就整段当替换。
    let sync = -1;
    const WINDOW = 40;
    for (let k = 1; k <= WINDOW && sync < 0; k += 1) {
      if (a[i + k] !== undefined && a[i + k] === b[j]) sync = k;
    }
    const start = Math.max(0, Math.min(i, j) - CONTEXT);
    for (let c = start; c < Math.min(i, j); c += 1) {
      if (a[c] !== undefined) out.push(`  ${a[c]}`);
    }
    if (sync > 0) {
      for (let k = 0; k < sync; k += 1) out.push(`- ${a[i + k] ?? ""}`);
      i += sync;
      j += 1;
      out.push(`+ ${b[j - 1] ?? ""}`);
    } else {
      if (a[i] !== undefined) out.push(`- ${a[i]}`);
      if (b[j] !== undefined) out.push(`+ ${b[j]}`);
      i += 1;
      j += 1;
    }
    if (out.length > MAX_LINES) {
      out.push(`… diff 超过 ${MAX_LINES} 行，其余未显示（改动仍是整份替换）`);
      break;
    }
  }
  return out.join("\n") || `（源码内容有变化，但逐行比对没有可显示的差异）`;
}

// ── 指令表 ──────────────────────────────────────────────────────────────────

interface GameCommandDef {
  id: string;
  label: string;
  summary: string;
  /** 有执行器 = 会改源码（除非在只读白名单里）。 */
  run?: (
    port: GameAgentEditorPort,
    params: Record<string, unknown>,
  ) => { after: string } | { params: Record<string, unknown> } | { error: string };
}

function paramString(
  params: Record<string, unknown>,
  key: string,
): string | null {
  const value = params[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * 指令表。
 *
 * **刻意不给 agent 的两条**：「运行预览」与「发布」。运行会把字节推到沙箱域上
 * 真跑起来，发布会产生一条用户可见的 revision —— 这两件事该由坐在屏幕前的人按，
 * 而不是由一段对话触发。不给 = 表里没有这条命令，不是「给了但拦着」。
 */
export const GAME_AGENT_COMMANDS: readonly GameCommandDef[] = [
  {
    id: "game.read-source",
    label: "读游戏源码",
    summary: "把当前游戏源码交给 agent 看，不做任何修改。",
  },
  {
    id: "game.read-params",
    label: "读可调参数",
    summary: "读出这一版声明的可调参数，不做任何修改。",
  },
  {
    id: "game.set-source",
    label: "换掉整份源码",
    summary: "用 agent 给的新源码整份替换。改动先进审阅，你点接受之后才写进去。",
    run: (port, params) => {
      const next = paramString(params, "source");
      if (next === null) return { error: "没给新源码（缺 source 参数）。" };
      const checked = inspectGameDraft(next);
      if (!checked.publishable) {
        return {
          error: "新源码不是一份能发布的完整游戏文档，已拒绝。",
        };
      }
      return { after: next };
    },
  },
  {
    id: "game.replace-in-source",
    label: "改源码里的一段",
    summary:
      "把源码里出现的某一段替换成新的一段。改动先进审阅，你点接受之后才写进去。",
    run: (port, params) => {
      const find = paramString(params, "find");
      const replace = typeof params.replace === "string" ? params.replace : null;
      if (find === null || replace === null) {
        return { error: "缺 find 或 replace 参数。" };
      }
      const source = port.source();
      if (!source.includes(find)) {
        return { error: "源码里找不到要替换的那一段，一个字没改。" };
      }
      const after = source.split(find).join(replace);
      const checked = inspectGameDraft(after);
      if (!checked.publishable) {
        return { error: "替换后的源码不再是一份能发布的完整文档，已拒绝。" };
      }
      return { after };
    },
  },
  {
    id: "game.set-params",
    label: "改可调参数声明",
    summary:
      "重写这一版的可调参数声明（3–6 项）。改动先进审阅，你点接受之后才写进去。",
    run: (port, params) => {
      const raw = params.params;
      if (
        typeof raw !== "object" ||
        raw === null ||
        Array.isArray(raw)
      ) {
        return { error: "params 必须是一个对象。" };
      }
      return { params: raw as Record<string, unknown> };
    },
  },
];

const COMMAND_BY_ID = new Map(
  GAME_AGENT_COMMANDS.map((command) => [command.id, command] as const),
);

/** 这条命令会不会改源码。判据是「有没有执行器」，不是白名单。 */
export function gameCommandMutates(command: GameCommandDef): boolean {
  return Boolean(command.run) && !READONLY_SET.has(command.id);
}

/** agent 看得见的指令表。 */
export function gameAgentCommandSpecs(): PluginCommandSpec[] {
  return GAME_AGENT_COMMANDS.map((command) => ({
    id: command.id,
    label: command.label,
    summary: command.summary,
    mutates: gameCommandMutates(command),
  }));
}

/** 会改源码、且 agent 调得到的那批 id。闸门逐条遍历它。 */
export function gameMutatingAgentCommandIds(): string[] {
  return GAME_AGENT_COMMANDS.filter((command) => gameCommandMutates(command)).map(
    (command) => command.id,
  );
}

// ── 唯一写入决策点 ──────────────────────────────────────────────────────────

const PARKED_OK = "改动已送审阅，你点接受之前源码一个字都不会变。";

/**
 * agent 的一条指令。**这是 agent 能碰到游戏源码的唯一入口。**
 *
 * 写与不写在同一个 `if` 上分岔（`consumeGameApplyToken`），所以「有没有哪条分支
 * 忘了判」这个问题在这里只需要看一处，测试也只需要盯一处 —— V3-red-3 的病根正是
 * 「要不要写」这个判断散在 `run()` 的各条分支里。
 */
export async function runGameAgentCommand(
  port: GameAgentEditorPort,
  id: string,
  params: Record<string, unknown> | undefined,
): Promise<PluginCommandResult> {
  const command = COMMAND_BY_ID.get(id);
  const args = { ...(params || {}) };
  const revision = port.revision();
  const route = planGameAgentDisposition({
    commandId: id,
    known: Boolean(command),
    mutates: command ? gameCommandMutates(command) : false,
    tokenMatches: peekGameApplyToken(id, args),
  });

  if (route.kind === "unknown" || !command) {
    return { ok: false, message: route.kind === "unknown" ? route.message : `游戏编辑器没有「${id}」这条指令。` };
  }

  if (route.kind === "readonly") {
    if (id === "game.read-source") {
      return {
        ok: true,
        message: `当前源码 ${gameSourceByteLength(port.source())} 字节。`,
        revision,
      };
    }
    const declared = port.params();
    return {
      ok: true,
      message: declared
        ? `这一版声明了 ${Object.keys(declared).length} 项可调参数。`
        : "这一版没有声明可调参数。",
      revision,
    };
  }

  const outcome = command.run?.(port, args);
  if (!outcome) {
    return { ok: false, message: "这条指令没有执行器，源码一个字没改。" };
  }
  if ("error" in outcome) {
    return { ok: false, message: outcome.error };
  }

  if (route.kind === "apply") {
    if (!consumeGameApplyToken(id, args)) {
      return { ok: false, message: "审阅令牌无效，源码一个字没改。" };
    }
    if ("after" in outcome) {
      port.writeSource(outcome.after);
      return { ok: true, message: "改动已写入草稿。", revision: revision + 1 };
    }
    if (!port.writeParams) {
      return { ok: false, message: "这一版不支持改参数声明。" };
    }
    port.writeParams(outcome.params);
    return { ok: true, message: "参数声明已写入草稿。", revision: revision + 1 };
  }

  if (route.kind !== "review") {
    return { ok: false, message: "这条指令的去向无法处理，源码一个字没改。" };
  }

  // 没令牌 ⇒ 造提案、真交出去。**不写。**
  const before = "after" in outcome ? port.source() : JSON.stringify(port.params() || {});
  const after =
    "after" in outcome ? outcome.after : JSON.stringify(outcome.params);
  const proposal = buildGameSourceProposal({
    proposalId: `game-${id}-${revision}-${Date.now().toString(36)}`,
    commandId: id,
    before,
    after,
    revision,
    label: command.label,
  });
  if (!proposal) {
    return {
      ok: false,
      message: "这条改动没法送进审阅（提案没通过契约校验），源码一个字没改。",
    };
  }
  const token = mintApplyToken(id);
  const parked: ParkedReview = {
    proposal,
    // 令牌只活在 params 里；宿主接受时原路递回，agent 看不到它。
    params: { ...args, [GAME_APPLY_TOKEN_KEY]: token },
    inverseParams: { ...args, source: before, [GAME_APPLY_TOKEN_KEY]: token },
    editorId: GAME_EDITOR_ID,
  };
  const verdict = submitAgentReviewProposal(parked, revision);
  if (verdict === "ok") {
    return { ok: true, message: PARKED_OK, revision };
  }
  liveTokens.delete(token);
  return {
    ok: false,
    message:
      verdict === "stale"
        ? "这条改动是针对旧版本提的，已作废，请重新发起。"
        : "审阅提案不合法，源码一个字没改。",
  };
}

/**
 * 游戏编辑器交给 agent 的指令面。
 *
 * **注意它返回的就是「已包闸」的那一份**：本模块不导出未包闸的形态，
 * 也没有任何 `?? 原始面` 的兜底。调用方拿不到一个能绕过审阅的对象 ——
 * 这是对 A-43 那条「失败即开放」的结构性回答，而不是靠调用方记得包一层。
 */
export function createGameAgentSurface(
  port: GameAgentEditorPort,
): PluginCommandSurface {
  return {
    editorId: GAME_EDITOR_ID,
    describe: () => gameAgentCommandSpecs(),
    state: () => {
      const source = port.source();
      const declared = port.params();
      return {
        revision: port.revision(),
        sourceBytes: gameSourceByteLength(source),
        sourceHead: clip(source, 1_200),
        paramNames: declared ? Object.keys(declared) : [],
      };
    },
    run: (id, params) => runGameAgentCommand(port, id, params),
  };
}
