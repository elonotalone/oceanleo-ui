"use client";

// 入群申请（owner / admin）：批准或拒绝。

import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { decideJoinRequest, listJoinRequests } from "../../../lib/im/groups-api";
import { reasonOf, useLoader } from "../../../lib/im/people-api";
import { useImEvent } from "../realtime/hooks";
import { PersonAvatar } from "./GroupAvatar";

export interface JoinRequestsListProps {
  conversationId: string;
  /** 批准后成员变了，让上层重新拉详情 */
  onChanged: () => void;
}

export function JoinRequestsList({ conversationId, onChanged }: JoinRequestsListProps) {
  const tt = useUI();
  const requests = useLoader(() => listJoinRequests(conversationId), [conversationId]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useImEvent("join.request", (e) => {
    if (e.conversation_id === conversationId) requests.reload();
  });

  const items = requests.data ?? [];
  if (items.length === 0 && !note) return null;

  async function decide(id: string, action: "approve" | "reject") {
    setBusy(id);
    setNote(null);
    try {
      await decideJoinRequest(conversationId, id, action);
      requests.reload();
      if (action === "approve") onChanged();
    } catch (e) {
      setNote(reasonOf(e, tt("没成功，请稍后再试。")));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div data-join-requests>
      <ul>
        {items.map((r) => (
          <li key={r.id} data-join-request={r.id} className="flex items-center gap-3 px-3 py-2">
            <PersonAvatar name={r.user.display_name} src={r.user.avatar_url} seed={r.user.user_id} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-neutral-900">{r.user.display_name}</span>
              {r.message && <span className="block truncate text-[12px] text-neutral-500">{r.message}</span>}
            </span>
            <button type="button" disabled={busy === r.id} data-action="approve" onClick={() => decide(r.id, "approve")} className="rounded-lg bg-neutral-900 px-2.5 py-1 text-[12px] font-medium text-white disabled:opacity-50">
              {tt("同意")}
            </button>
            <button type="button" disabled={busy === r.id} data-action="reject" onClick={() => decide(r.id, "reject")} className="rounded-lg border border-neutral-200 px-2.5 py-1 text-[12px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
              {tt("拒绝")}
            </button>
          </li>
        ))}
      </ul>
      {note && (
        <p role="alert" className="px-3 py-1 text-[12px] text-red-600">
          {note}
        </p>
      )}
    </div>
  );
}
