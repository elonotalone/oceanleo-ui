"use client";

import { useEffect, useState } from "react";
import {
  cloudBrowserScreenshot,
  type CloudBrowserEvent,
} from "../lib/browser";
import { useUI } from "../i18n/ui/useUI";
import { redactedDisplayUrl } from "./cloud-browser-live";

function CloudBrowserHistoryThumbnail({
  event,
}: {
  event: CloudBrowserEvent;
}) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!event.has_screenshot) return;
    let alive = true;
    let objectUrl = "";
    void cloudBrowserScreenshot(event.id).then((result) => {
      if (!alive || !result.ok || !result.data) return;
      objectUrl = URL.createObjectURL(result.data);
      setUrl(objectUrl);
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [event.has_screenshot, event.id]);

  if (!url) {
    return <div className="h-14 w-full animate-pulse bg-stone-100" />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="h-14 w-full object-cover" />;
}

export function CloudBrowserTimeline({
  events,
  selectedId,
  onSelect,
}: {
  events: CloudBrowserEvent[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const tt = useUI();
  const keyEvents = events
    .filter((event) => event.has_screenshot)
    .slice(-20)
    .reverse();
  return (
    <section
      className="flex shrink-0 gap-2 overflow-x-auto border-t border-stone-200 bg-white p-2"
      aria-label={tt("关键浏览历史")}
      data-cloud-browser-timeline
    >
      {keyEvents.map((event) => {
        const displayUrl = redactedDisplayUrl(
          event.display_url || event.url || "",
        );
        const time = event.captured_at || event.created_at;
        return (
          <button
            key={event.id}
            type="button"
            onClick={() => onSelect(event.id)}
            className={`w-48 shrink-0 overflow-hidden rounded-lg border text-left text-[10px] ${
              selectedId === event.id
                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                : "border-stone-200 bg-white text-stone-600"
            }`}
            data-history-event-id={event.id}
          >
            <CloudBrowserHistoryThumbnail event={event} />
            <span className="block truncate px-2 pt-1.5 font-semibold">
              {event.title || tt("未命名页面")}
            </span>
            <span className="block truncate px-2 text-stone-400">
              {event.tab_title ||
                (event.tab_id
                  ? tt("标签页 {tab}", { tab: event.tab_id.slice(0, 8) })
                  : tt("浏览器标签页"))}
            </span>
            <span
              className="block truncate px-2 text-stone-400"
              title={displayUrl}
            >
              {displayUrl || tt("网址已隐藏")}
            </span>
            <span className="flex items-center justify-between gap-2 px-2 pb-1.5 text-stone-400">
              <span className="truncate">
                {event.reason || event.action || tt("关键节点")}
              </span>
              <time className="shrink-0" dateTime={time || undefined}>
                {time ? new Date(time).toLocaleString() : ""}
              </time>
            </span>
          </button>
        );
      })}
    </section>
  );
}
