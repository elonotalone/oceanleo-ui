"use client";

// 联系人、请求、邀请链接、拉黑名单。

import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { listContactRequests, listGroupInvites, useLoader } from "../../../lib/im/people-api";
import { PanelToolbar } from "../../leochat/PanelToolbar";
import { useImEvent } from "../realtime/hooks";
import { ContactList } from "./ContactList";
import { BlockedList } from "./BlockedList";
import { InviteLinkDialog } from "./InviteLinkDialog";
import { ProfileCard } from "./ProfileCard";
import { RequestsList } from "./RequestsList";

export interface PeopleViewProps {
  onOpenConversation: (conversationId: string) => void;
}

type Tab = "contacts" | "requests";

export function PeopleView({ onOpenConversation }: PeopleViewProps) {
  const tt = useUI();
  const [tab, setTab] = useState<Tab>("contacts");
  const [query, setQuery] = useState("");
  const [inviting, setInviting] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [showBlocked, setShowBlocked] = useState(false);

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

  return (
    <div className="flex h-full min-h-0 flex-col" data-people-view>
      <PanelToolbar
        search={query}
        onSearch={setQuery}
        placeholder={tt("按名字或备注搜索")}
        plusLabel={tt("添加联系人")}
        actions={[{ id: "add-contact", label: tt("添加联系人"), onSelect: () => setInviting(true) }, { id: "blocked", label: tt("已拉黑"), onSelect: () => setShowBlocked(!showBlocked) }]}
      />
      <button type="button" data-new-friends-entry onClick={() => setTab(tab === "requests" ? "contacts" : "requests")} className="flex w-full items-center gap-3 border-b border-neutral-100 px-3 py-4 text-left text-[14px]">
        <span aria-hidden>{tab === "requests" ? "⌄" : "›"}</span>{tt("新的朋友")}
        {pending > 0 && <span className="rounded-full bg-red-500 px-1.5 text-[11px] text-white">{pending}</span>}
      </button>
      <div className="min-h-0 flex-1">
        {showBlocked ? <><button type="button" className="px-3 py-2 text-[12px]" onClick={() => setShowBlocked(false)}>{tt("返回")}</button><BlockedList query={query} /></> : tab === "contacts" ? <ContactList query={query} onOpenProfile={setProfileId} onOpenConversation={onOpenConversation} /> : (
          <RequestsList query={query} onOpenProfile={setProfileId} onOpenConversation={onOpenConversation} onChanged={refreshCounts} />
        )}
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
