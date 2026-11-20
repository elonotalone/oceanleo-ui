"use client";

// 联系人、请求、邀请链接、拉黑名单。

import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { PanelToolbar } from "../../leochat/PanelToolbar";
import { ContactList } from "./ContactList";
import { BlockedList } from "./BlockedList";
import { FindPeople } from "./PeopleDiscovery";
import { ProfileCard } from "./ProfileCard";
import { RequestsList } from "./RequestsList";

export interface PeopleViewProps {
  onOpenConversation: (conversationId: string) => void;
}

type Tab = "contacts" | "requests";

const ENTRY_ROW = "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-stone-800 transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-stone-400 transition ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function PeopleView({ onOpenConversation }: PeopleViewProps) {
  const tt = useUI();
  const [tab, setTab] = useState<Tab>("contacts");
  const [query, setQuery] = useState("");
  const [inviting, setInviting] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("find") === "1");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [showBlocked, setShowBlocked] = useState(false);

  if (inviting) return <FindPeople onBack={() => setInviting(false)} onOpenConversation={onOpenConversation} />;

  return (
    <div className="flex h-full min-h-0 flex-col" data-people-view>
      <PanelToolbar
        search={query}
        onSearch={setQuery}
        placeholder={tt("按名字或备注搜索")}
        plusLabel={tt("找人")}
        actions={[{ id: "find-people", label: tt("找人"), onSelect: () => setInviting(true) }]}
      />
      <div className="shrink-0 px-2 pt-1">
        <button type="button" data-new-friends-entry onClick={() => setTab(tab === "requests" ? "contacts" : "requests")} aria-expanded={tab === "requests"} className={`${ENTRY_ROW} ${tab === "requests" ? "bg-neutral-200/80" : "hover:bg-neutral-200/50"}`}>
          <Chevron open={tab === "requests"} />{tt("新的朋友")}
        </button>
        <button type="button" data-blocked-entry aria-expanded={showBlocked} onClick={() => setShowBlocked(!showBlocked)} className={`${ENTRY_ROW} ${showBlocked ? "bg-neutral-200/80" : "hover:bg-neutral-200/50"}`}>
          <Chevron open={showBlocked} />{tt("已拉黑")}
        </button>
      </div>
      {tab === "requests" && !showBlocked && <RequestsList query={query} onOpenConversation={onOpenConversation} />}
      <div className="min-h-0 flex-1">
        {showBlocked ? <BlockedList query={query} onBack={() => setShowBlocked(false)} /> : <ContactList query={query} onOpenProfile={setProfileId} onOpenConversation={onOpenConversation} />}
      </div>
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
