"use client";

import { useEffect, useState } from "react";
import { useUI } from "../i18n/ui/useUI";

export interface ApprovalCardPayload {
  approval_id: string;
  connector_id: string;
  connector_label: string;
  tool: string;
  summary: string;
  args_preview: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Same rules as `parseApprovalMessage` in `src/api/approvals.ts`. Kept local so this card does not statically import the API module (that module pulls auth/client; existing AgentTranscriptBubble compile-bench tests would otherwise load it). */
export function parseApprovalMessage(content: string): ApprovalCardPayload | null {
  if (typeof content !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (typeof parsed.approval_id !== "string" || parsed.approval_id.trim() === "") {
    return null;
  }
  for (const key of ["connector_id", "connector_label", "tool", "summary"] as const) {
    if (typeof parsed[key] !== "string") return null;
  }
  if (parsed.args_preview !== undefined && typeof parsed.args_preview !== "string") {
    return null;
  }
  return {
    approval_id: parsed.approval_id,
    connector_id: parsed.connector_id as string,
    connector_label: parsed.connector_label as string,
    tool: parsed.tool as string,
    summary: parsed.summary as string,
    args_preview: typeof parsed.args_preview === "string" ? parsed.args_preview : "",
  };
}

export type ApprovalCardViewState = {
  remoteStatus: string;
  decidedHere: boolean;
  submitting: boolean;
  error: string;
};

export type ApprovalCardViewEvent =
  | { type: "loaded"; status: string }
  | { type: "submit" }
  | { type: "succeed"; decision: "approve" | "deny"; status?: string }
  | { type: "conflict"; status: string }
  | { type: "fail" };

export function nextCardState(
  state: ApprovalCardViewState,
  event: ApprovalCardViewEvent,
): ApprovalCardViewState {
  switch (event.type) {
    case "loaded":
      return { ...state, remoteStatus: event.status, error: "" };
    case "submit":
      return { ...state, submitting: true, error: "" };
    case "succeed":
      return {
        ...state,
        submitting: false,
        error: "",
        decidedHere: true,
        remoteStatus:
          event.status ?? (event.decision === "approve" ? "approved" : "denied"),
      };
    case "conflict":
      return {
        ...state,
        submitting: false,
        error: "",
        decidedHere: false,
        remoteStatus: event.status,
      };
    case "fail":
      return { ...state, submitting: false, error: "没能提交，请重试" };
    default:
      return state;
  }
}

export function resultCopyKey(state: ApprovalCardViewState): string | null {
  if (!state.remoteStatus || state.remoteStatus === "pending") return null;
  if (state.remoteStatus === "expired") return "已过期";
  if (
    state.decidedHere &&
    (state.remoteStatus === "approved" || state.remoteStatus === "used")
  ) {
    return "已允许";
  }
  if (state.decidedHere && state.remoteStatus === "denied") return "已拒绝";
  return "已处理";
}

export function shouldContinueAfterApprove(
  taskRunning: boolean,
  event: ApprovalCardViewEvent,
): boolean {
  return event.type === "succeed" && event.decision === "approve" && !taskRunning;
}

const INITIAL_STATE: ApprovalCardViewState = {
  remoteStatus: "",
  decidedHere: false,
  submitting: false,
  error: "",
};

export function ApprovalCard({
  payload,
  content,
  taskRunning = false,
  onContinue,
}: {
  payload?: ApprovalCardPayload | null;
  content?: string;
  taskRunning?: boolean;
  onContinue?: () => void;
}) {
  const tt = useUI();
  const resolved = payload ?? (content ? parseApprovalMessage(content) : null);
  const [state, setState] = useState(INITIAL_STATE);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const apply = (event: ApprovalCardViewEvent) => {
    setState((current) => nextCardState(current, event));
  };

  useEffect(() => {
    if (!resolved) return;
    let cancelled = false;
    void import("../api/approvals").then(({ getApproval }) =>
      getApproval(resolved.approval_id).then((result) => {
        if (cancelled) return;
        if (result.ok && result.data) {
          apply({ type: "loaded", status: String(result.data.status || "pending") });
        } else {
          apply({ type: "loaded", status: "pending" });
        }
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [resolved?.approval_id]);

  const pending = state.remoteStatus === "pending";

  useEffect(() => {
    if (!resolved || !pending) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    const pull = () => {
      void import("../api/approvals").then(({ getApproval }) =>
        getApproval(resolved.approval_id).then((result) => {
          if (cancelled || !result.ok || !result.data) return;
          apply({ type: "loaded", status: String(result.data.status || "pending") });
        }),
      );
    };
    const start = () => {
      if (interval !== undefined) return;
      interval = setInterval(pull, 3000);
    };
    const stop = () => {
      if (interval === undefined) return;
      clearInterval(interval);
      interval = undefined;
    };
    const onVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        stop();
        return;
      }
      start();
    };
    if (typeof document === "undefined" || document.visibilityState !== "hidden") {
      start();
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    return () => {
      cancelled = true;
      stop();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [pending, resolved?.approval_id]);

  if (!resolved) return null;

  const resultKey = resultCopyKey(state);
  const disabled = state.submitting;
  const showActions = pending;

  const decide = async (decision: "approve" | "deny", scope?: "once" | "task" | "always") => {
    apply({ type: "submit" });
    const { decideApproval, getApproval } = await import("../api/approvals");
    const result = await decideApproval(resolved.approval_id, decision, scope);
    if (result.ok && result.data) {
      const event: ApprovalCardViewEvent = {
        type: "succeed",
        decision,
        status: String(result.data.status || (decision === "approve" ? "approved" : "denied")),
      };
      apply(event);
      if (shouldContinueAfterApprove(taskRunning, event)) onContinue?.();
      return;
    }
    if (result.status === 409) {
      const fresh = await getApproval(resolved.approval_id);
      if (fresh.ok && fresh.data) {
        apply({ type: "conflict", status: String(fresh.data.status || "pending") });
        return;
      }
    }
    apply({ type: "fail" });
  };

  return (
    <div className="max-w-full min-w-0 rounded-xl border border-stone-200 bg-white px-3.5 py-3">
      <p className="text-[12px] font-semibold text-stone-700">{tt("需要你确认")}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-stone-800">{resolved.summary}</p>
      {(resolved.connector_label || resolved.tool) && (
        <p className="mt-1 text-[12px] text-stone-500">
          {resolved.connector_label}
          {resolved.connector_label && resolved.tool ? " · " : ""}
          {resolved.tool}
        </p>
      )}
      {resolved.args_preview ? (
        <div className="mt-2 min-w-0">
          <button
            type="button"
            className="text-[12px] font-medium text-stone-500 hover:text-stone-800"
            onClick={() => setDetailsOpen((open) => !open)}
          >
            {detailsOpen ? tt("收起详情") : tt("查看详情")}
          </button>
          {detailsOpen && (
            <pre className="mt-2 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-stone-50 px-3 py-2 text-[11px] leading-relaxed text-stone-600">
              {resolved.args_preview}
            </pre>
          )}
        </div>
      ) : null}
      {showActions && (
        <div className="mt-3 flex flex-wrap items-start gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => void decide("approve", "once")}
            className="rounded-lg bg-stone-900 px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
          >
            {tt("允许这一次")}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => void decide("approve", "task")}
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[12px] font-medium text-stone-700 disabled:opacity-50"
          >
            {tt("这个任务里都允许")}
          </button>
          <div className="flex min-w-0 max-w-full flex-col gap-1">
            <button
              type="button"
              disabled={disabled}
              onClick={() => void decide("approve", "always")}
              className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[12px] font-medium text-stone-700 disabled:opacity-50"
            >
              {tt("以后都允许")}
            </button>
            <p className="max-w-full text-[11px] leading-relaxed text-stone-400">
              {tt("以后「{app}」执行这个动作时不再询问", {
                app: resolved.connector_label,
              })}
            </p>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => void decide("deny")}
            className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-stone-500 hover:text-stone-800 disabled:opacity-50"
          >
            {tt("拒绝")}
          </button>
        </div>
      )}
      <p aria-live="polite" className="mt-2 min-h-[1.25rem] text-[12px] text-rose-600">
        {state.error ? tt("没能提交，请重试") : resultKey ? (
          <span className="text-stone-500">{tt(resultKey)}</span>
        ) : (
          ""
        )}
      </p>
    </div>
  );
}
