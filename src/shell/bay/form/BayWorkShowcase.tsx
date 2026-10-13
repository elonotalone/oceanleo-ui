"use client";

import { Suspense, lazy, useCallback, useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { useUI } from "../../../i18n/ui/useUI";
import { getCurrentArtifactItem } from "../../artifact-client";
import type { LibraryItem } from "../../library-data";
import { kindFromUrl, type PreviewFileKind } from "./bay-typed-preview";
import type { DigitalWorkRef } from "./bay-digital-works";

const LibraryItemViewer = lazy(() => import("../../library-viewers").then((m) => ({ default: m.LibraryItemViewer })));

const subscribeNever = () => () => {};

const KIND_LABEL: Record<PreviewFileKind, string> = {
  image: "图片",
  video: "视频",
  audio: "音频",
  ppt: "PPT",
  sheet: "表格",
  document: "文档",
  website: "网站",
  file: "文件",
};

const RAIL: CSSProperties = {
  display: "flex",
  flexDirection: "row",
  gap: 8,
  overflowX: "auto",
  overflowY: "hidden",
  padding: "12px 20px 16px",
};

const THUMB: CSSProperties = {
  position: "relative",
  width: 56,
  height: 56,
  padding: 0,
  borderRadius: 8,
  overflow: "hidden",
  background: "#f5f5f5",
  flexShrink: 0,
  cursor: "pointer",
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; item: LibraryItem }
  | { status: "error"; message: string };

export function BayWorkShowcase(props: {
  works: DigitalWorkRef[];
  index: number;
  onClose: () => void;
  onIndex?: (index: number) => void;
  accent?: string;
}): ReactElement | null {
  const tt = useUI();
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const works = props.works.filter((work) => work && work.id);
  const clamped = works.length ? Math.min(Math.max(props.index, 0), works.length - 1) : 0;
  const current = works[clamped];
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const close = useCallback(() => {
    props.onClose();
  }, [props]);

  useEffect(() => {
    if (!current?.id) return;
    const controller = new AbortController();
    setState({ status: "loading" });
    void getCurrentArtifactItem(current.id, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.ok && result.data) setState({ status: "ready", item: result.data });
        else setState({ status: "error", message: "素材没读出来，请稍后再试。" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error", message: "素材没读出来，请稍后再试。" });
      });
    return () => controller.abort();
  }, [current?.id]);

  useEffect(() => {
    if (!mounted) return;
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
  }, [mounted, close]);

  if (!mounted || !current) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
      data-bay-work-showcase=""
      onClick={close}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3">
          <h2 className="truncate pr-4 text-base font-semibold text-stone-800">{current.title || current.id}</h2>
          <button type="button" onClick={close} className="rounded-full p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label={tt("关闭")}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden p-5">
          {state.status === "loading" ? (
            <p className="py-16 text-center text-[13px] text-stone-500" role="status">
              {tt("正在打开这份素材…")}
            </p>
          ) : state.status === "error" ? (
            <p className="py-16 text-center text-[13px] text-stone-500" role="status" data-bay-work-showcase-error>
              {tt(state.message)}
            </p>
          ) : (
            <div className="h-[70vh] overflow-hidden rounded-xl bg-stone-100">
              <Suspense fallback={<p className="py-16 text-center text-[13px] text-stone-500">{tt("正在打开这份素材…")}</p>}>
                <LibraryItemViewer item={state.item} accent={props.accent} />
              </Suspense>
            </div>
          )}
        </div>
        {works.length > 1 ? (
          <div data-bay-work-showcase-rail="" style={RAIL}>
            {works.map((work, index) => {
              const thumb = work.thumbUrl;
              const active = index === clamped;
              return (
                <button
                  key={work.id}
                  type="button"
                  data-bay-work-showcase-thumb={index}
                  aria-pressed={active}
                  aria-label={work.title || work.id}
                  onClick={() => props.onIndex?.(index)}
                  style={{ ...THUMB, border: active ? "2px solid #171717" : "1px solid #e5e5e5" }}
                >
                  {thumb ? (
                    <img src={thumb} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full w-full place-items-center px-1 text-center text-[9px] leading-tight text-neutral-500">
                      {tt(KIND_LABEL[kindFromUrl(work.url || work.title || "")])}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
