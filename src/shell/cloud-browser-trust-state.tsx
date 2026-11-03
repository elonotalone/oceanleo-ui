"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  cloudBrowserTrustApi,
  type BrowserApprovalDecision,
  type BrowserApprovalScope,
  type BrowserSessionTrust,
} from "../lib/browser-trust";

export function useCloudBrowserTrustVisible(ref: RefObject<HTMLDivElement | null>) {
  const [pageVisible, setPageVisible] = useState(() =>
    typeof document !== "undefined" && document.visibilityState !== "hidden");
  const [intersecting, setIntersecting] = useState(true);
  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
    // The empty prompt mount has no height. Observe its viewport, which also
    // detects panels kept mounted inside a hidden sidebar.
    const target = ref.current?.parentElement;
    const observer = typeof IntersectionObserver !== "undefined" && target
      ? new IntersectionObserver(([entry]) => setIntersecting(Boolean(entry?.isIntersecting)))
      : null;
    if (target) observer?.observe(target);
    return () => { document.removeEventListener("visibilitychange", onVisibility); observer?.disconnect(); };
  }, [ref]);
  return pageVisible && intersecting;
}

type TrustState = {
  sessionId: string;
  data: BrowserSessionTrust | null;
  errorStatus: number | null;
  busy: boolean;
};
type Lifetime = { sessionId: string; controller: AbortController; revision: number; busy: boolean };

export function useCloudBrowserTrust({ sessionId, active }: { sessionId: string; active: boolean }) {
  const [state, setState] = useState<TrustState>({ sessionId: "", data: null, errorStatus: null, busy: false });
  const [retryCount, setRetryCount] = useState(0);
  const lifetime = useRef<Lifetime | null>(null);

  useEffect(() => {
    setState({ sessionId, data: null, errorStatus: null, busy: false });
    if (!sessionId || !active) return;
    const current: Lifetime = { sessionId, controller: new AbortController(), revision: 0, busy: false };
    lifetime.current = current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    async function poll() {
      if (current.controller.signal.aborted) return;
      if (!current.busy) {
        const revision = current.revision;
        const result = await cloudBrowserTrustApi.session(sessionId, current.controller.signal);
        if (current.controller.signal.aborted || lifetime.current !== current) return;
        if (revision === current.revision && !current.busy) {
          setState(previous => ({
            ...previous,
            data: result.ok && result.data ? result.data
              : [401, 403, 404].includes(result.status ?? 0) ? null : previous.data,
            errorStatus: result.ok ? null : result.status ?? 0,
          }));
          failures = result.ok ? 0 : failures + 1;
          if (!result.ok && [401, 403, 404].includes(result.status ?? 0)) return;
        }
      }
      timer = setTimeout(() => void poll(), Math.min(15_000, 2_000 * (failures + 1)));
    }
    void poll();
    return () => {
      current.controller.abort();
      clearTimeout(timer);
      if (lifetime.current === current) lifetime.current = null;
    };
  }, [sessionId, active, retryCount]);

  const decide = useCallback(async (
    kind: "login" | "approval", id: string, decision: boolean | BrowserApprovalDecision,
    scope: BrowserApprovalScope = "once",
  ) => {
    const current = lifetime.current;
    if (!active || !current || current.sessionId !== sessionId || current.busy || current.controller.signal.aborted) return;
    current.busy = true;
    current.revision++;
    setState(previous => ({ ...previous, busy: true, errorStatus: null }));
    const result = kind === "login"
      ? await cloudBrowserTrustApi.decideLogin(sessionId, id, decision === true, current.controller.signal)
      : await cloudBrowserTrustApi.decideApproval(sessionId, id, decision === "approve" ? "approve" : "deny", scope, current.controller.signal);
    if (current.controller.signal.aborted || lifetime.current !== current) return;
    current.busy = false;
    current.revision++;
    setState(previous => ({
      ...previous, busy: false, errorStatus: result.ok ? null : result.status ?? 0,
      data: !result.ok || !previous.data ? previous.data : {
        ...previous.data,
        pending_approvals: kind === "approval"
          ? previous.data.pending_approvals.filter(item => item.request_id !== id)
          : previous.data.pending_approvals,
        login_candidates: kind === "login"
          ? previous.data.login_candidates.filter(item => item.id !== id)
          : previous.data.login_candidates,
      },
    }));
  }, [active, sessionId]);

  return {
    data: active && state.sessionId === sessionId ? state.data : null,
    errorStatus: active && state.sessionId === sessionId ? state.errorStatus : null,
    busy: state.sessionId === sessionId && state.busy,
    decide,
    retry: () => setRetryCount(count => count + 1),
  };
}
