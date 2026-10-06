"use client";

// 联系人、请求、邀请链接、拉黑名单。

import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { listContactRequests, listGroupInvites, useLoader } from "../../../lib/im/people-api";
import { NewConversationDialog } from "../groups/NewConversationDialog";
import { useImEvent } from "../realtime/hooks";
import { BlockedList } from "./BlockedList";
import { ContactList } from "./ContactList";
import { InviteLinkDialog } from "./InviteLinkDialog";
import { ProfileCard } from "./ProfileCard";
import { RequestsList } from "./RequestsList";

export interface PeopleViewProps {
  onOpenConversation: (conversationId: string) => void;
}

type Tab = "contacts" | "requests" | "blocked";

export function PeopleView({ onOpenConversation }: PeopleViewProps) {
  const tt = useUI();
  const [tab, setTab] = useState<Tab>("contacts");
  const [inviting, setInviting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);

  // 「请求」页签上的待处理数：收到的联系人请求 + 拉群邀请
  const incoming = useLoader(() => listContactRequests("in"), []);
  const invites = useLoader(listGroupInvites, []);
  const refreshCounts = () => {
    incoming.reload();
    invites.reload();
  };
  useImEvent("contact.request", refreshCounts);
  useImEvent("group.invite", refreshCounts);
  const pending = (incoming.data ?? []).filter((r) => r.status === "pending").length + (invites.data?.length ?? 0);

  const tabs: Array<{ id: Tab; label: string; badge?: number }> = [
    { id: "contacts", label: tt("联系人") },
    { id: "requests", label: tt("请求"), badge: pending },
    { id: "blocked", label: tt("已拉黑") },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col" data-people-view>
      <div className="flex items-center gap-2 px-3 py-3">
        <h2 className="flex-1 text-[15px] font-semibold text-neutral-900">{tt("通讯录")}</h2>
        <button type="button" onClick={() => setCreating(true)} data-action="new-conversation" className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[12px] text-neutral-700 hover:bg-neutral-50">
          {tt("新建聊天")}
        </button>
        <button type="button" onClick={() => setInviting(true)} data-action="invite" className="rounded-lg bg-neutral-900 px-2.5 py-1.5 text-[12px] font-medium text-white">
          {tt("邀请别人")}
        </button>
      </div>
      <div role="tablist" className="flex gap-1 px-3 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            data-tab={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] ${tab === t.id ? "bg-neutral-100 font-medium text-neutral-900" : "text-neutral-500 hover:bg-neutral-50"}`}
          >
            {t.label}
            {t.badge ? (
              <span data-tab-badge className="rounded-full bg-red-500 px-1.5 text-[10px] leading-4 text-white">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {tab === "contacts" && <ContactList onOpenProfile={setProfileId} onOpenConversation={onOpenConversation} />}
        {tab === "requests" && (
          <RequestsList onOpenProfile={setProfileId} onOpenConversation={onOpenConversation} onChanged={refreshCounts} />
        )}
        {tab === "blocked" && <BlockedList />}
      </div>
      {inviting && <InviteLinkDialog onClose={() => setInviting(false)} />}
      {creating && (
        <NewConversationDialog
          open
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            onOpenConversation(id);
          }}
        />
      )}
      {profileId && (
        <ProfileCard
          userId={profileId}
          onClose={() => setProfileId(null)}
          onOpenConversation={(id) => {
            setProfileId(null);
            onOpenConversation(id);
          }}
        />
      )}
    </div>
  );
}
