/**
 * agent 指令面闸：会改文档的 `run()` 在未持 apply token 时一律停写成审阅提案。
 *
 * 只包 agent 桥拿到的那份 surface，L1 按钮仍走未包的 `runPluginCommand()`。
 * `allowAlways()` 仍会调 `run()`——但进的是这份闸，所以旁路写不进文档。
 */
import type {
  PluginCommandResult,
  PluginCommandSpec,
  PluginCommandSurface,
} from "../plugin-command/types";
import {
  validReviewProposal,
  type EditorReviewProposal,
} from "../hosted-editor/index";
import type { EditorCommandPending } from "../../lib/fn-agent";
import { unifiedDiff } from "./diff";
import { readAgentSelection } from "./inbox";
import { refreshAgentSelectionFromDom } from "./selection-live";
import {
  hostReviewSession,
  revisionNumber,
  type ParkedReview,
  type ReviewSession,
} from "./session";

const STATE_BUDGET = 4_096;

function stateForAgent(
  surface: PluginCommandSurface,
): Record<string, unknown> {
  refreshAgentSelectionFromDom();
  let raw: Record<string, unknown> = {};
  try {
    raw = (surface.state() || {}) as Record<string, unknown>;
  } catch {
    raw = {};
  }
  const sel = readAgentSelection();
  if (!sel) return raw;
  const extra = {
    agentSelection: {
      kind: sel.kind,
      id: sel.id,
      summary: sel.summary.slice(0, 200),
    },
  };
  const merged = { ...raw, ...extra };
  try {
    if (JSON.stringify(merged).length <= STATE_BUDGET) return merged;
  } catch {
    /* 宁可选区、不要一份会被上下文整段丢掉的大摘要 */
  }
  return extra;
}

/**
 * 正在落地的「用户已点头」凭据。按 **proposalId** 持有。
 *
 * `V3-red-6` 原告的是跨编辑器泄漏（接受表格放行图片）；按 editorId 已经把它
 * 关掉。同一编辑器里两条待审提案时，按件持有仍会让接受 #1 的窗口放行 #2。
 * 所以判定必须对上这一份提案（或它绑着的一次性令牌），对不上就送审。
 *
 * `editorId: "*"` 只给旧调用 `withReviewApply(fn)`（没说是哪件、哪份提案）用：
 * `reviewApplyHeld("grid")` 会认它，但 `routeAgentCommandRun` **不**把它当成
 * 放行 —— 否则又变回失败即开放。
 */
export type ReviewApplyHold = {
  editorId: string;
  commandId?: string;
  proposalId?: string;
};

const holds: ReviewApplyHold[] = [];

/** 审阅令牌在 `parked.params` 里的键名。宿主原样转发，agent 看不见。 */
export const REVIEW_APPLY_TOKEN_KEY = "__reviewApply";

type ReviewApplyToken = { proposalId: string; commandId: string };

const liveTokens = new Map<string, ReviewApplyToken>();
const MAX_LIVE_TOKENS = 8;

function randomApplyToken(): string {
  const webCrypto = (
    globalThis as { crypto?: { randomUUID?: () => string } }
  ).crypto;
  if (typeof webCrypto?.randomUUID === "function") {
    return `rat-${webCrypto.randomUUID()}`;
  }
  const bytes = (
    globalThis as {
      crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array };
    }
  ).crypto?.getRandomValues?.(new Uint8Array(16));
  if (bytes) {
    return `rat-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  return `rat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function mintReviewApplyToken(proposalId: string, commandId: string): string {
  const token = randomApplyToken();
  liveTokens.set(token, { proposalId, commandId });
  while (liveTokens.size > MAX_LIVE_TOKENS) {
    const oldest = liveTokens.keys().next().value;
    if (oldest === undefined) break;
    liveTokens.delete(oldest);
  }
  return token;
}

function proposalIdFromApplyToken(
  params: Record<string, unknown> | undefined,
): string | undefined {
  const raw = params?.[REVIEW_APPLY_TOKEN_KEY];
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  return liveTokens.get(raw)?.proposalId;
}

function consumeReviewApplyToken(
  commandId: string,
  params: Record<string, unknown> | undefined,
): boolean {
  const raw = params?.[REVIEW_APPLY_TOKEN_KEY];
  if (typeof raw !== "string" || raw.length === 0) return false;
  const bound = liveTokens.get(raw);
  if (!bound || bound.commandId !== commandId) return false;
  liveTokens.delete(raw);
  return true;
}

function stripReviewApplyToken(
  params: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!params || !(REVIEW_APPLY_TOKEN_KEY in params)) return params;
  const next = { ...params };
  delete next[REVIEW_APPLY_TOKEN_KEY];
  return next;
}

function withApplyToken(
  params: Record<string, unknown>,
  proposalId: string,
  commandId: string,
): Record<string, unknown> {
  return {
    ...params,
    [REVIEW_APPLY_TOKEN_KEY]: mintReviewApplyToken(proposalId, commandId),
  };
}

export async function withReviewApply<T>(
  fn: () => Promise<T>,
  hold?: ReviewApplyHold | null,
): Promise<T> {
  holds.push(hold ?? { editorId: "*" });
  try {
    return await fn();
  } finally {
    holds.pop();
  }
}

/**
 * 宿主此刻是不是正在把一条**用户已接受**的审阅落地。
 *
 * 不传 `editorId`：只要有持有就为真（W03 要的三行读取口）。
 * 传了：只认这件编辑器，或旧的未指明持有（`*`）。
 */
export function reviewApplyHeld(editorId?: string): boolean {
  if (holds.length === 0) return false;
  if (!editorId) return true;
  return holds.some((h) => h.editorId === "*" || h.editorId === editorId);
}

export function resetReviewApplyHolds(): void {
  holds.length = 0;
  liveTokens.clear();
}

export type AgentCommandRunRoute =
  | { kind: "execute"; reason: "accepted-apply" | "readonly" }
  | {
      kind: "review";
      reason: "foreign-apply" | "untrusted-agent" | "sibling-apply";
    };

/**
 * 一条 agent `run` 该走哪条路。
 *
 * 刻意不写在 `gateSurfaceForAgent` 的 `if` 里（A-53 / W07 样板）：写成 `if`
 * 的话，一句 `if (false && route.kind === "review")` 就能悄悄绕过，而任何
 * 「文件里出现过 gateSurfaceForAgent」形态的判据照样绿。绕过必须拆掉整支
 * `review` 分支，那是判据抓得住的形状。
 *
 * 判定顺序照 A-59 的 `embedEditorFrameSandbox()`：
 * 1. 别人的 apply 先判 —— 送审（不可信）。顺序反过来、改成「有持有就放行」
 *    就是 `V3-red-6`：接受 A，B 跟着被放行。
 * 2. 这件编辑器自己的 apply，还得对上**这一份提案**才执行。只对上 editorId
 *    或只对上 commandId，同一件里的另一条待审提案会写穿。缺 proposalId
 *    或对不上 → 送审（`sibling-apply`）。两条兜底都指向安全。
 * 3. 明确只读 → 执行。
 * 4. 其余一律送审（失败即关闭）。
 */
export function routeAgentCommandRun(input: {
  surfaceEditorId: string;
  commandId: string;
  mutates: boolean | undefined;
  proposalId?: string;
  holds?: readonly ReviewApplyHold[];
}): AgentCommandRunRoute {
  const live = input.holds ?? holds;
  const own = live.filter((h) => h.editorId === input.surfaceEditorId);
  const foreign = live.some(
    (h) => h.editorId !== "*" && h.editorId !== input.surfaceEditorId,
  );
  if (foreign && own.length === 0) {
    return { kind: "review", reason: "foreign-apply" };
  }
  if (own.length > 0) {
    const presented =
      typeof input.proposalId === "string" && input.proposalId.length > 0
        ? input.proposalId
        : "";
    const bound = own.some(
      (h) =>
        Boolean(h.proposalId) &&
        h.proposalId === presented &&
        (!h.commandId || h.commandId === input.commandId),
    );
    if (bound) return { kind: "execute", reason: "accepted-apply" };
    return { kind: "review", reason: "sibling-apply" };
  }
  // spec.mutates === false 才立刻执行；缺 spec 当会改文档（失败即关闭）。
  if (input.mutates === false) return { kind: "execute", reason: "readonly" };
  return { kind: "review", reason: "untrusted-agent" };
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function liveRevisionOf(surface: PluginCommandSurface): number {
  try {
    const state = surface.state() || {};
    const revision = state.revision;
    return typeof revision === "number" && Number.isFinite(revision)
      ? revision
      : 0;
  } catch {
    return 0;
  }
}

function specOf(
  surface: PluginCommandSurface,
  id: string,
): PluginCommandSpec | undefined {
  try {
    return surface.describe().find((item) => item.id === id);
  } catch {
    return undefined;
  }
}

export function parkedFromPending(
  pending: EditorCommandPending,
  liveRevision: number,
): ParkedReview | null {
  const before = pending.prompt || pending.spec.summary || pending.spec.label;
  const after = clip(
    `将执行「${pending.spec.label}」${
      Object.keys(pending.params).length
        ? `：${JSON.stringify(pending.params)}`
        : ""
    }`,
    2_000,
  );
  const proposal = {
    proposalId: clip(`pending-${pending.spec.id}-${liveRevision}`, 128),
    commandId: pending.spec.id,
    summary: { before: clip(before, 2_000), after },
    diff: unifiedDiff(before, after),
    targetSelection: null,
    revision: liveRevision,
  } as EditorReviewProposal;
  if (!validReviewProposal(proposal)) return null;
  const inverseValue =
    typeof pending.params.value === "string" ? "" : pending.params.value;
  return {
    proposal,
    params: withApplyToken({ ...pending.params }, proposal.proposalId, pending.spec.id),
    inverseParams: { ...pending.params, value: inverseValue },
    editorId: pending.editorId,
  };
}

export function parkedFromMutatingRun(
  surface: PluginCommandSurface,
  id: string,
  params: Record<string, unknown> | undefined,
): ParkedReview | null {
  const spec = specOf(surface, id);
  const revision = liveRevisionOf(surface);
  const label = spec?.label || id;
  let before = "";
  try {
    before = clip(JSON.stringify(surface.state() || {}), 2_000);
  } catch {
    before = label;
  }
  const after = clip(
    `将执行「${label}」${params && Object.keys(params).length ? `：${JSON.stringify(params)}` : ""}`,
    2_000,
  );
  const objects = [
    {
      id: clip(id, 200),
      op: "update" as const,
      label: clip(label, 200),
      before: clip(before, 4_000),
      after: clip(after, 4_000),
    },
  ];
  const proposal = {
    proposalId: clip(`run-${id}-${revision}-${Date.now()}`, 128),
    commandId: id,
    summary: {
      before: clip(`执行前：${label}`, 2_000),
      after,
    },
    objects,
    targetSelection: null,
    revision,
  } as EditorReviewProposal;
  if (!validReviewProposal(proposal)) return null;
  return {
    proposal,
    params: withApplyToken({ ...(params || {}) }, proposal.proposalId, id),
    inverseParams: { ...(params || {}) },
    editorId: surface.editorId,
  };
}

const PARKED_OK: PluginCommandResult = {
  ok: true,
  message: "改动已送审阅，接受前不会写入文档。",
};

// 哪些面已经包过闸、包给了哪个会话。取面处就地包闸（`surface.ts`）之后，同一份面
// 可能既被宿主的 reader 包过、又走一次就地包闸；套两层会让一条改动产出两份提案。
const GATED_BY = new WeakMap<PluginCommandSurface, ReviewSession>();

/** 这份面是否已经包给了这个审阅会话（包闸的幂等判据）。 */
export function isAgentGatedSurface(
  surface: PluginCommandSurface,
  session: ReviewSession = hostReviewSession,
): boolean {
  return GATED_BY.get(surface) === session;
}

export function gateSurfaceForAgent(
  surface: PluginCommandSurface,
  session: ReviewSession = hostReviewSession,
): PluginCommandSurface {
  if (isAgentGatedSurface(surface, session)) return surface;
  const gated: PluginCommandSurface = {
    editorId: surface.editorId,
    describe: () => surface.describe(),
    state: () => stateForAgent(surface),
    async run(id, params) {
      const spec = specOf(surface, id);
      const route = routeAgentCommandRun({
        surfaceEditorId: surface.editorId,
        commandId: id,
        mutates: spec ? spec.mutates : undefined,
        proposalId: proposalIdFromApplyToken(params),
      });
      if (route.kind === "execute") {
        if (route.reason === "accepted-apply") {
          consumeReviewApplyToken(id, params);
        }
        return surface.run(id, stripReviewApplyToken(params));
      }
      const parked = parkedFromMutatingRun(surface, id, params);
      if (!parked) {
        return {
          ok: false,
          message: "这条改动没法送进审阅（提案没通过契约校验），文档一个字没改。",
        };
      }
      const outcome = session.receive(parked, liveRevisionOf(surface));
      if (outcome === "invalid") {
        return {
          ok: false,
          message: "审阅提案不合法，文档一个字没改。",
        };
      }
      return {
        ...PARKED_OK,
        revision: revisionNumber(parked.proposal.revision),
      };
    },
  };
  GATED_BY.set(gated, session);
  return gated;
}

export async function applyParkedReview(
  surface: PluginCommandSurface,
  parked: ParkedReview,
): Promise<PluginCommandResult> {
  const hold: ReviewApplyHold = {
    editorId: parked.editorId,
    commandId: parked.proposal.commandId,
    proposalId: parked.proposal.proposalId,
  };
  return withReviewApply(async () => {
    if (isAgentGatedSurface(surface)) {
      return surface.run(parked.proposal.commandId, parked.params);
    }
    consumeReviewApplyToken(parked.proposal.commandId, parked.params);
    return surface.run(
      parked.proposal.commandId,
      stripReviewApplyToken(parked.params),
    );
  }, hold);
}

export function createReviewGatedReader(
  inner: (() => PluginCommandSurface | null) | null | undefined,
  fallback: () => PluginCommandSurface | null,
  session: ReviewSession = hostReviewSession,
): () => PluginCommandSurface | null {
  return () => {
    const fromInner = inner ? inner() : null;
    if (fromInner) return gateSurfaceForAgent(fromInner, session);
    const fromFallback = fallback();
    if (fromFallback) return gateSurfaceForAgent(fromFallback, session);
    return null;
  };
}
