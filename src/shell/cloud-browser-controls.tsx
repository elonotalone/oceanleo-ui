"use client";

import type { Dispatch, SetStateAction } from "react";
import type { CloudBrowserEvent } from "../lib/browser";
import { useUI } from "../i18n/ui/useUI";

export function CloudBrowserLiveControls({
  driving,
  typing,
  setTyping,
  send,
}: {
  driving: boolean;
  typing: string;
  setTyping: Dispatch<SetStateAction<string>>;
  send: (message: Record<string, unknown>) => void;
}) {
  const tt = useUI();
  return (
    <div className="shrink-0 border-t border-stone-200 bg-white px-3 py-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => send({ t: driving ? "release" : "takeover" })}
          className={`rounded-lg px-3 py-1.5 text-[12px] font-medium ${
            driving
              ? "bg-amber-100 text-amber-700"
              : "bg-stone-100 text-stone-700"
          }`}
        >
          {driving ? tt("交还 Agent") : tt("接管")}
        </button>
        <input
          value={typing}
          onChange={(event) => setTyping(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || !driving || !typing) return;
            send({ t: "key", event: "char", text: typing });
            send({ t: "key", event: "press", key: "Enter" });
            setTyping("");
          }}
          disabled={!driving}
          placeholder={driving ? tt("输入文字，回车发送") : tt("接管后可输入")}
          className="min-w-0 flex-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-[12px] outline-none disabled:bg-stone-50"
        />
        <button
          type="button"
          onClick={() => send({ t: "scroll", dy: 560 })}
          disabled={!driving}
          className="rounded-lg border border-stone-200 px-2 py-1.5 text-[12px] text-stone-500 disabled:opacity-40"
        >
          ↓
        </button>
      </div>
    </div>
  );
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
  return (
    <div className="flex shrink-0 gap-1.5 overflow-x-auto border-t border-stone-200 bg-white p-2">
      {events
        .filter((event) => event.has_screenshot)
        .map((event) => (
          <button
            key={event.id}
            type="button"
            onClick={() => onSelect(event.id)}
            className={`max-w-[150px] shrink-0 rounded-lg border px-2.5 py-1.5 text-left text-[10px] ${
              selectedId === event.id
                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                : "border-stone-200 text-stone-500"
            }`}
          >
            <span className="block truncate">
              {event.title || event.action || tt("页面")}
            </span>
            <span className="block text-stone-400">
              {event.created_at
                ? new Date(event.created_at).toLocaleString()
                : ""}
            </span>
          </button>
        ))}
    </div>
  );
}

export function BrowserGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="2.5" y="4" width="19" height="16" rx="2.5" />
      <path d="M3 8h18M6 6h.01M9 6h.01" strokeLinecap="round" />
      <path d="M8 13h8M10 16h4" strokeLinecap="round" />
    </svg>
  );
}
