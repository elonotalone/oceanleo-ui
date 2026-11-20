"use client";

import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { conversationDisplayTitle, listMessageRequests, nameQueryHit, useLoader } from "../../../lib/im/people-api";
import type { ImConversationSummary } from "../../../lib/im/types";
import { useImEvent } from "../realtime/hooks";
import { PersonAvatar } from "../groups/GroupAvatar";
import { PeopleFailure } from "./PeopleDiscovery";
import { QUIET } from "../MessageSettingsFrame";

export interface RequestsListProps {
  query?: string;
  onBack?: () => void;
  onOpenProfile?: (userId: string) => void;
  onOpenConversation?: (conversationId: string) => void;
  onChanged?: () => void;
}

/** The parent owns the only New friends heading; requests expand inline. */
export function RequestsList({ query = "", onOpenConversation }: RequestsListProps) {
  const tt = useUI();
  const requests = useLoader(() => listMessageRequests(), []);
  const [extra, setExtra] = useState<ImConversationSummary[]>([]);
  const [next, setNext] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const reload = () => { setExtra([]); setNext(undefined); requests.reload(); };
  useImEvent("message.created", reload);
  useImEvent("conversation.updated", reload);
  const cursor = next === undefined ? requests.data?.next_cursor : next;
  const items = [...new Map([...(requests.data?.items ?? []), ...extra].map(item => [item.id, item])).values()].filter(item => nameQueryHit({ display_name: conversationDisplayTitle(item) }, query));
  return <div data-message-requests className="max-h-64 overflow-y-auto px-3 py-2">
    {requests.loading ? <p role="status">{tt("加载中…")}</p> : requests.error ? <PeopleFailure error={requests.error} /> : <>
      {items.length ? <ul>{items.map(item => <li key={item.id}><button type="button" data-request-conversation={item.id} className="flex w-full items-center gap-3 py-2 text-left" onClick={() => onOpenConversation?.(item.id)}>
        <PersonAvatar name={conversationDisplayTitle(item)} src={item.peer?.avatar_url} seed={item.id} size={32} /><span className="truncate text-[13px]">{conversationDisplayTitle(item)}</span>
      </button></li>)}</ul> : <p className="py-2 text-[12px] text-stone-500">{tt("没有消息请求。")}</p>}
      {error != null && <PeopleFailure error={error} />}
      {cursor && <button type="button" className={QUIET} disabled={busy} onClick={async () => {
        setBusy(true); setError(null);
        try { const page = await listMessageRequests(cursor); setExtra(old => [...old, ...page.items]); setNext(page.next_cursor); } catch (e) { setError(e); } finally { setBusy(false); }
      }}>{tt("加载更多")}</button>}
    </>}
  </div>;
}
