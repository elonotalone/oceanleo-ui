/**
 * 审阅会话：收下 `review-proposal`，逐条接受/拒绝，接受前 revision 不前进，可回滚。
 *
 * 校验器只用宿主那一份 `validReviewProposal`。本文件不复制契约。
 */
import {
  validReviewProposal,
  type EditorReviewObjectChange,
  type EditorReviewProposal,
} from "../hosted-editor/index";

export type ItemDecision = "pending" | "accept" | "reject";

export type ReviewStatus = "idle" | "open" | "stale" | "applied" | "discarded";

export interface ParkedReview {
  proposal: EditorReviewProposal;
  params: Record<string, unknown>;
  inverseParams: Record<string, unknown>;
  editorId: string;
}

export interface RevisionFrame {
  revisionBefore: number;
  revisionAfter: number;
  proposalId: string;
  inverse: ParkedReview;
}

export interface ReviewSnapshot {
  parked: ParkedReview | null;
  status: ReviewStatus;
  itemDecisions: Record<string, ItemDecision>;
  history: RevisionFrame[];
  currentRevision: number;
  staleReason: string;
}

export function proposalItemIds(proposal: EditorReviewProposal): string[] {
  if (proposal.objects && proposal.objects.length) {
    return proposal.objects.map((item) => item.id);
  }
  return ["__diff__"];
}

function invertObject(change: EditorReviewObjectChange): EditorReviewObjectChange {
  if (change.op === "add") {
    return { ...change, op: "remove", before: change.after, after: change.before };
  }
  if (change.op === "remove") {
    return { ...change, op: "add", before: change.after, after: change.before };
  }
  return {
    ...change,
    op: change.op,
    before: change.after,
    after: change.before,
  };
}

export function invertParked(parked: ParkedReview, revision: number): ParkedReview {
  const proposal = parked.proposal;
  if (proposal.objects) {
    const objects = proposal.objects.map(invertObject);
    return {
      ...parked,
      params: { ...parked.inverseParams },
      inverseParams: { ...parked.params },
      proposal: {
        ...proposal,
        proposalId: `rb-${proposal.proposalId}`.slice(0, 128),
        summary: {
          before: proposal.summary.after,
          after: proposal.summary.before,
        },
        objects,
        revision,
      },
    };
  }
  const diff = proposal.diff || "";
  const swapped = diff
    .split("\n")
    .map((line) =>
      line.startsWith("+")
        ? `-${line.slice(1)}`
        : line.startsWith("-")
          ? `+${line.slice(1)}`
          : line,
    )
    .join("\n");
  return {
    ...parked,
    params: { ...parked.inverseParams },
    inverseParams: { ...parked.params },
    proposal: {
      ...proposal,
      proposalId: `rb-${proposal.proposalId}`.slice(0, 128),
      summary: {
        before: proposal.summary.after,
        after: proposal.summary.before,
      },
      diff: swapped || proposal.diff,
      revision,
    },
  };
}

function emptySnapshot(): ReviewSnapshot {
  return {
    parked: null,
    status: "idle",
    itemDecisions: {},
    history: [],
    currentRevision: 0,
    staleReason: "",
  };
}

export function createReviewSession() {
  let parked: ParkedReview | null = null;
  let status: ReviewStatus = "idle";
  let itemDecisions: Record<string, ItemDecision> = {};
  let history: RevisionFrame[] = [];
  let currentRevision = 0;
  let staleReason = "";
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const snapshot = (): ReviewSnapshot => ({
    parked,
    status,
    itemDecisions: { ...itemDecisions },
    history: history.slice(),
    currentRevision,
    staleReason,
  });

  return {
    snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    receive(next: ParkedReview, liveRevision: number): "ok" | "invalid" | "stale" {
      if (!validReviewProposal(next.proposal)) return "invalid";
      if (liveRevision > next.proposal.revision) {
        parked = next;
        status = "stale";
        staleReason = "提案到达前文档已经前进，编辑器偷跑了，这条改动不能接受。";
        itemDecisions = {};
        emit();
        return "stale";
      }
      parked = next;
      status = "open";
      staleReason = "";
      currentRevision = next.proposal.revision;
      itemDecisions = Object.fromEntries(
        proposalItemIds(next.proposal).map((id) => [id, "pending" as ItemDecision]),
      );
      emit();
      return "ok";
    },
    decideItem(id: string, decision: ItemDecision) {
      if (!parked || status !== "open" || !(id in itemDecisions)) return;
      itemDecisions = { ...itemDecisions, [id]: decision };
      emit();
    },
    acceptAll() {
      if (!parked || status !== "open") return;
      itemDecisions = Object.fromEntries(
        Object.keys(itemDecisions).map((id) => [id, "accept" as ItemDecision]),
      );
      emit();
    },
    rejectAll() {
      if (!parked || status !== "open") return;
      itemDecisions = Object.fromEntries(
        Object.keys(itemDecisions).map((id) => [id, "reject" as ItemDecision]),
      );
      emit();
    },
    acceptedObjectIds(): string[] {
      if (!parked?.proposal.objects) {
        return itemDecisions["__diff__"] === "accept" ? ["__diff__"] : [];
      }
      return parked.proposal.objects
        .map((item) => item.id)
        .filter((id) => itemDecisions[id] === "accept");
    },
    hasAnyAccept(): boolean {
      return Object.values(itemDecisions).some((value) => value === "accept");
    },
    hasPendingItems(): boolean {
      return Object.values(itemDecisions).some((value) => value === "pending");
    },
    markApplied(resultRevision: number) {
      if (!parked) return;
      const inverse = invertParked(parked, currentRevision);
      history = [
        ...history,
        {
          revisionBefore: currentRevision,
          revisionAfter: resultRevision,
          proposalId: parked.proposal.proposalId,
          inverse,
        },
      ];
      currentRevision = resultRevision;
      parked = null;
      status = "applied";
      itemDecisions = {};
      emit();
    },
    markDiscarded() {
      parked = null;
      status = "discarded";
      itemDecisions = {};
      staleReason = "";
      emit();
    },
    rollback(): ParkedReview | null {
      const frame = history[history.length - 1];
      if (!frame) return null;
      history = history.slice(0, -1);
      parked = frame.inverse;
      status = "open";
      currentRevision = frame.revisionBefore;
      itemDecisions = Object.fromEntries(
        proposalItemIds(frame.inverse.proposal).map((id) => [
          id,
          "accept" as ItemDecision,
        ]),
      );
      emit();
      return frame.inverse;
    },
    canRollback(): boolean {
      return history.length > 0;
    },
    reset() {
      parked = null;
      status = "idle";
      itemDecisions = {};
      history = [];
      currentRevision = 0;
      staleReason = "";
      emit();
    },
  };
}

export type ReviewSession = ReturnType<typeof createReviewSession>;

export const hostReviewSession: ReviewSession = createReviewSession();
