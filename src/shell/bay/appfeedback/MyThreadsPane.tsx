"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { listMyBayAppThreads, type BayAppThread } from "../../../lib/bay/app-feedback";
import { useBaySignedIn } from "../shell/bay-state";
import { BaySignInPrompt } from "../shell/BayMine";
import { PaneLoading, PaneMessage } from "../supply/parts";
import { ThreadCard } from "./ThreadCard";
import { actionErrorText, isAbort } from "./feedback-model";

const PAGE_SIZE = 20;

export function MyThreadsPane(): ReactElement | null {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const [items, setItems] = useState<BayAppThread[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (offset: number, replace: boolean) => {
      const request = ++requestRef.current;
      if (replace) abortRef.current?.abort();
      const controller = typeof AbortController === "undefined" ? null : new AbortController();
      abortRef.current = controller;
      setLoading(true);
      if (replace) {
        setError("");
        setItems([]);
        setNextOffset(null);
      }
      try {
        const page = await listMyBayAppThreads({ offset, limit: PAGE_SIZE });
        if (request !== requestRef.current) return;
        setItems((prev) => (replace ? page.items : [...prev, ...page.items.filter((row) => !prev.some((item) => item.id === row.id))]));
        setNextOffset(page.next_offset);
        setError("");
      } catch (caught) {
        if (request !== requestRef.current || isAbort(caught) || controller?.signal.aborted) return;
        setError(actionErrorText(caught, tt("留言没读出来，请稍后点「重试」。")));
      } finally {
        if (request === requestRef.current) setLoading(false);
      }
    },
    [tt],
  );

  useEffect(() => {
    if (!signedIn) return;
    void load(0, true);
    return () => abortRef.current?.abort();
  }, [load, signedIn]);

  if (!signedIn) return <BaySignInPrompt text={tt("登录后查看你写过的留言")} />;
  if (loading && items.length === 0 && !error) return <PaneLoading />;
  if (error && items.length === 0) return <PaneMessage text={error} onRetry={() => void load(0, true)} />;

  return (
    <section data-bay-my-threads className="space-y-3 p-4">
      {items.length === 0 ? (
        <p data-bay-my-threads-empty className="rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center text-[13px] text-neutral-500">
          {tt("你还没有给任何作品留过言")}
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((thread) => (
            <ThreadCard key={thread.id} thread={thread} showAppTitle timeField="last_post_at" />
          ))}
        </div>
      )}
      {nextOffset != null ? (
        <button
          type="button"
          data-bay-action="load-more"
          disabled={loading}
          onClick={() => void load(nextOffset, false)}
          className="w-full rounded-lg border border-neutral-200 py-2 text-[13px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
        >
          {tt("加载更多")}
        </button>
      ) : null}
    </section>
  );
}
