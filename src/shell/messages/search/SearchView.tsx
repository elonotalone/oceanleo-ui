"use client";

// 消息搜索。B1 版：输入 ≥2 字能搜，点结果跳转。
import { useEffect, useState } from "react";
import { searchApi, searchQueryReady } from "../../../lib/im/search-api";
import type { ImSearchHit } from "../../../lib/im/types";

export interface SearchViewProps {
  initialQuery?: string;
  conversationId?: string | null;
  onOpenResult: (conversationId: string, seq: number) => void;
}

export function SearchView({ initialQuery = "", conversationId = null, onOpenResult }: SearchViewProps) {
  const [query, setQuery] = useState(initialQuery);
  const [hits, setHits] = useState<ImSearchHit[]>([]);
  useEffect(() => {
    if (!searchQueryReady(query)) {
      setHits([]);
      return;
    }
    const handle = setTimeout(() => {
      void searchApi
        .search({ q: query, conversation_id: conversationId })
        .then((page) => setHits(page.items))
        .catch(() => setHits([]));
    }, 300);
    return () => clearTimeout(handle);
  }, [query, conversationId]);
  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="rounded-lg border border-neutral-200 px-3 py-2 text-sm"
      />
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {hits.map((hit) => (
          <li key={hit.message.id}>
            <button
              type="button"
              className="w-full px-2 py-1.5 text-left text-sm hover:bg-neutral-50"
              onClick={() => onOpenResult(hit.conversation.id, hit.message.seq)}
            >
              {hit.message.body}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
