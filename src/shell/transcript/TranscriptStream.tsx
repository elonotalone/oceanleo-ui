"use client";

import { useCallback, useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { AGENT_CONVERSATION_MAX_WIDTH_CLASS } from "../agent-conversation-layout";
import { OlderHistoryTop, type OlderHistoryState } from "../history/older-history";

export type TranscriptCapabilities = { branch: boolean; regenerate: boolean };
export const CLOUD_TRANSCRIPT_CAPABILITIES: TranscriptCapabilities = { branch: true, regenerate: true };
export const ACP_TRANSCRIPT_CAPABILITIES: TranscriptCapabilities = { branch: false, regenerate: false };
export type TranscriptItem<T> = { key: string; messageId: string; rowId?: number; value: T };

/** One ordered stream for the cloud and ACP adapters. Stable ids also identify reading anchors. */
export function TranscriptStream<T>({ items, capabilities, renderItem }: {
  items: readonly TranscriptItem<T>[];
  capabilities: TranscriptCapabilities;
  renderItem: (item: T, capabilities: TranscriptCapabilities) => ReactNode;
}) {
  return <div data-transcript-stream="" data-stream-branch={capabilities.branch} data-stream-regenerate={capabilities.regenerate} className="space-y-3">
    {items.map((item) => <div key={item.key} data-history-item="" data-history-key={item.key}
      data-stream-message-id={item.messageId} data-stream-row-id={item.rowId}>
      {renderItem(item.value, capabilities)}
    </div>)}
  </div>;
}

export function StreamWaitingLine({ label, retrying = false }: { label: string; retrying?: boolean }) {
  return <div data-stream-waiting="" role="status" className={`flex items-center gap-2 text-[14px] ${retrying ? "text-amber-700" : "text-stone-400"}`}>
    {!retrying && <span className="v-spinner" aria-hidden="true" />}{label}
  </div>;
}

export function StreamLatestButton({ unread, onClick }: { unread: number; onClick: () => void }) {
  const tt = useUI();
  return <button type="button" onClick={onClick} data-stream-latest=""
    className="v-fade-up inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white/95 px-3 py-1.5 text-[12px] font-medium text-stone-600 shadow-lg backdrop-blur hover:bg-white">
    <span aria-hidden="true">↓</span>
    {unread > 0 ? tt("回到最新 · {count} 条新消息", { count: unread }) : tt("回到最新")}
  </button>;
}

export function useMeasuredFooter() {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(0);
  const ref = useCallback((node: HTMLElement | null) => setElement(node), []);
  useLayoutEffect(() => {
    if (!element) { setHeight(0); return; }
    const measure = () => setHeight(element.getBoundingClientRect().height);
    measure();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [element]);
  return { ref, height };
}

/** The composer floats over the stream; its measured height reserves room for the final message. */
export function TranscriptPane({ pane, scrollRef, onScroll, top, empty, items, tail, overlay, footer, after, canView, accessStatus, hasMore, history }: {
  pane: "cloud" | "acp";
  scrollRef: RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
  top: ReactNode; empty: ReactNode; items: ReactNode; tail: ReactNode; overlay: ReactNode; footer: ReactNode; after: ReactNode;
  canView: boolean;
  /** Access decision notices (loading / unavailable / unstable network), rendered in-stream. */
  accessStatus?: ReactNode;
  hasMore: boolean;
  history: OlderHistoryState;
}) {
  const { ref: footerRef, height: footerHeight } = useMeasuredFooter();
  return <div className="relative flex h-full min-h-0 flex-col" data-agent-stream={pane}>
    {top}
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto overflow-x-hidden px-4 py-4"
        style={{ overflowAnchor: "none", paddingBottom: footerHeight + 16 }} data-agent-stream-scroller="">
        <div className={`mx-auto w-full min-w-0 ${AGENT_CONVERSATION_MAX_WIDTH_CLASS} space-y-3 break-words [overflow-wrap:anywhere]`} data-agent-stream-column="">
          {empty}
          {accessStatus}
          {canView && <><OlderHistoryTop hasMore={hasMore} {...history} />{items}{tail}</>}
        </div>
      </div>
      {overlay && <div className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2" style={{ bottom: footerHeight + 12 }}>
        <div className="pointer-events-auto">{overlay}</div>
      </div>}
    </div>
    <div ref={footerRef} data-agent-chat-footer className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-3 pb-3 pt-6"
      style={{ background: "linear-gradient(to bottom, transparent, var(--surface, #faf8f5) 24px)" }}>
      <div className={`pointer-events-auto mx-auto w-full ${AGENT_CONVERSATION_MAX_WIDTH_CLASS} space-y-2`}>{footer}</div>
    </div>
    {after}
  </div>;
}
