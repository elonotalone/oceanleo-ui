"use client";

// 联系人、请求、邀请链接、拉黑名单。

import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { listContactRequests, listGroupInvites, useLoader } from "../../../lib/im/people-api";
import { PanelToolbar } from "../../leochat/PanelToolbar";
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
  const [query, setQuery] = useState("");
  const [inviting, setInviting] = useState(false);
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
      <PanelToolbar
        search={query}
        onSearch={setQuery}
        placeholder={tt("按名字搜索")}
        plusLabel={tt("添加联系人")}
        actions={[{ id: "add-contact", label: tt("添加联系人"), onSelect: () => setInviting(true) }]}
      />
      <div role="tablist" data-im-filter-row className="flex flex-wrap gap-0.5 px-2 py-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            data-tab={t.id}
            onClick={() => setTab(t.id)}
            className="inline-flex shrink-0 items-center gap-1.5"
          >
            {t.label}
            {t.badge ? (
              <span data-tab-badge className="rounded-full bg-neutral-900 px-1.5 text-[10px] leading-4 text-white">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {tab === "contacts" && <ContactList query={query} onOpenProfile={setProfileId} onOpenConversation={onOpenConversation} />}
        {tab === "requests" && (
          <RequestsList query={query} onOpenProfile={setProfileId} onOpenConversation={onOpenConversation} onChanged={refreshCounts} />
        )}
        {tab === "blocked" && <BlockedList query={query} />}
      </div>
      {inviting && <InviteLinkDialog onClose={() => setInviting(false)} />}
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
