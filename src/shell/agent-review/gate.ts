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

let applyDepth = 0;

export async function withReviewApply<T>(
  fn: () => Promise<T>,
): Promise<T> {
  applyDepth += 1;
  try {
    return await fn();
  } finally {
    applyDepth -= 1;
  }
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
    params: { ...pending.params },
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
    params: { ...(params || {}) },
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
      if (applyDepth > 0) {
        return surface.run(id, params);
      }
      const spec = specOf(surface, id);
      if (spec && spec.mutates === false) {
        return surface.run(id, params);
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
  return withReviewApply(() => surface.run(parked.proposal.commandId, parked.params));
}

export function createReviewGatedReader(
  inner: (() => PluginCommandSurface | null) | null | undefined,
  fallback: () => PluginCommandSurface | null,
  session: ReviewSession = hostReviewSession,
): () => PluginCommandSurface | null {
  return () => {
    const real = (inner ? inner() : null) || fallback();
    if (!real) return null;
    return gateSurfaceForAgent(real, session);
  };
}
