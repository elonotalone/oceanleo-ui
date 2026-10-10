"use client";

// 「在素材库中查看」落到 `/bay?kind=asset&artifactId=<成品号>&revisionId=<版本号>` 时，直接点开那件成品。
// 成品不是素材库里的一件素材（没有素材 id），所以不走素材详情，用全站共用的成品查看器。
// 关掉后把这两个参数从地址上拿掉，刷新不会再弹。
import { Suspense, lazy, useCallback, useEffect, useState, useSyncExternalStore, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { useUI } from "../../../i18n/ui/useUI";
import { getArtifactItem, getCurrentArtifactItem } from "../../artifact-client";
import type { LibraryItem } from "../../library-data";
import { artifactLinkTargetFromSearch, searchWithoutArtifactLink } from "./artifact-link";

// 查看器很重（3D、文档、视频都在里面）：只有真的点开成品链接才去加载，不进每个站 /bay 的首包。
const LibraryItemViewer = lazy(() => import("../../library-viewers").then((m) => ({ default: m.LibraryItemViewer })));

const subscribeNever = () => () => {};

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; item: LibraryItem }
  | { status: "error"; message: string };

export function BayArtifactDeepLink({ accent }: { accent?: string }): ReactElement | null {
  const tt = useUI();
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const [state, setState] = useState<State>({ status: "idle" });

  useEffect(() => {
    const target = artifactLinkTargetFromSearch(window.location.search);
    if (!target) return;
    const controller = new AbortController();
    setState({ status: "loading" });
    const request = target.revisionId
      ? getArtifactItem(target.artifactId, target.revisionId, controller.signal)
      : getCurrentArtifactItem(target.artifactId, controller.signal);
    request
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.ok && result.data) setState({ status: "ready", item: result.data });
        else setState({ status: "error", message: result.error || "素材没读出来，请稍后再试。" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error", message: "素材没读出来，请稍后再试。" });
      });
    return () => controller.abort();
  }, []);

  const close = useCallback(() => {
    setState({ status: "idle" });
    try {
      const url = `${window.location.pathname}${searchWithoutArtifactLink(window.location.search)}${window.location.hash}`;
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* 地址改不了不影响关闭 */
    }
  }, []);

  const open = state.status !== "idle";
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  if (!mounted || state.status === "idle") return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" data-bay-artifact-link={state.status} onClick={close}>
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3">
          <h2 className="truncate pr-4 text-base font-semibold text-stone-800">{state.status === "ready" ? state.item.title : null}</h2>
          <button type="button" onClick={close} className="rounded-full p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label={tt("返回")}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="min-h-[20rem] flex-1 overflow-y-auto p-5">
          {state.status === "loading" ? (
            <p className="py-16 text-center text-[13px] text-stone-500" role="status">
              {tt("正在打开这份素材…")}
            </p>
          ) : state.status === "error" ? (
            <p className="py-16 text-center text-[13px] text-stone-500" role="status" data-bay-artifact-link-error>
              {tt(state.message)}
            </p>
          ) : (
            <div className="h-[70vh] overflow-hidden rounded-xl bg-stone-100">
              <Suspense fallback={<p className="py-16 text-center text-[13px] text-stone-500">{tt("正在打开这份素材…")}</p>}>
                <LibraryItemViewer item={state.item} accent={accent} />
              </Suspense>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
