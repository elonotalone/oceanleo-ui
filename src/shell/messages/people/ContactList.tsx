"use client";

// 联系人：在线 → 离开 → 离线，按名字搜；下面是不用加就能私聊的同 Team / 同项目的人。

import { useMemo, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  conversationDisplayTitle,
  listContacts,
  listSavedGroups,
  nameQueryHit,
  openDm,
  reasonOf,
  searchDirectory,
  sortContacts,
  useLoader,
  visiblePersonName,
} from "../../../lib/im/people-api";
import type { ImConversationSummary, ImPresence, ImProfile } from "../../../lib/im/types";
import { GroupAvatar, PersonAvatar, PresenceDot } from "../groups/GroupAvatar";
import { useImEvent, usePresence } from "../realtime/hooks";

export interface ContactListProps {
  query: string;
  onOpenProfile?: (userId: string) => void;
  onOpenConversation: (conversationId: string) => void;
}

const PRESENCE_COPY: Record<ImPresence, string> = { online: "在线", away: "离开", offline: "离线" };

export function ContactList({ query, onOpenConversation, onOpenProfile }: ContactListProps) {
  const tt = useUI();
  const [note, setNote] = useState<string | null>(null);
  const contacts = useLoader(listContacts, []);
  const directory = useLoader(() => searchDirectory(""), []);
  const savedGroups = useLoader(listSavedGroups, []);
  useImEvent("contact.changed", () => {
    contacts.reload();
    directory.reload();
  });
  useImEvent("conversation.updated", () => {
    savedGroups.reload();
  });

  const contactIds = useMemo(() => (contacts.data ?? []).map((c) => c.user_id), [contacts.data]);
  const others = useMemo(() => {
    const have = new Set(contactIds);
    return (directory.data ?? []).filter(
      (p) => !have.has(p.user_id) && (p.relation === "teammate" || p.relation === "project"),
    );
  }, [directory.data, contactIds]);
  const presenceIds = useMemo(() => [...contactIds, ...others.map((p) => p.user_id)], [contactIds, others]);
  const presence = usePresence(presenceIds);

  const sorted = useMemo(() => sortContacts(contacts.data ?? [], presence, query), [contacts.data, presence, query]);
  const needle = query.trim().toLocaleLowerCase();
  const shownOthers = others.filter((p) => nameQueryHit(p, query));
  const shownGroups = (savedGroups.data ?? []).filter((g) => {
    if (!needle) return true;
    return conversationDisplayTitle(g).toLocaleLowerCase().includes(needle);
  });

  async function chat(userId: string) {
    setNote(null);
    try {
      const id = await openDm(userId);
      if (id) onOpenConversation(id);
    } catch (e) {
      setNote(reasonOf(e, tt("没成功，请稍后再试。")));
    }
  }

  function row(p: ImProfile, subtitle: string) {
    const state = presence[p.user_id] ?? "offline";
    const shown = visiblePersonName(p);
    return (
      <li key={p.user_id} data-contact={p.user_id} data-presence={state} className="group flex items-center gap-3 px-3 py-2 hover:bg-neutral-50">
        <button type="button" aria-label={tt("查看资料")} onClick={() => onOpenProfile?.(p.user_id)}><PersonAvatar name={shown} src={p.avatar_url} seed={p.user_id} size={36} /></button>
        <button type="button" onClick={() => void chat(p.user_id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold tracking-tight">{shown}</span>
            <span className="flex items-center gap-1.5 text-[12px] text-neutral-500">
              <PresenceDot presence={state} />
              {tt(PRESENCE_COPY[state])}
              {p.remark ? <span className="text-neutral-400">· {p.display_name}</span> : null}
              {subtitle ? <span className="text-neutral-400">· {subtitle}</span> : null}
            </span>
          </span>
        </button>
      </li>
    );
  }

  return (
    <div className="flex min-h-0 flex-col" data-contact-list>
      {note && (
        <p role="status" className="px-3 pb-2 text-[12px] text-red-600">
          {note}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <h4 className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">{tt("联系人")}</h4>
        {sorted.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] text-neutral-400" data-contacts-empty>
            {contacts.loading
              ? tt("加载中…")
              : query.trim()
                ? tt("没有找到。")
                : tt("还没有联系人。点右上角的 + 添加。")}
          </p>
        ) : (
          <ul data-contacts>{sorted.map((c) => row({ ...c.profile, user_id: c.user_id }, ""))}</ul>
        )}
        {shownGroups.length > 0 && (
          <>
            <h4 className="mt-3 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
              {tt("保存的群聊")}
            </h4>
            <ul data-saved-groups>
              {shownGroups.map((g) => (
                <SavedGroupRow key={g.id} item={g} onOpen={onOpenConversation} />
              ))}
            </ul>
          </>
        )}
        {shownOthers.length > 0 && (
          <>
            <h4 className="mt-3 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
              {tt("Team 与项目")}
            </h4>
            <ul data-contacts-others>
              {shownOthers.map((p) => row(p, p.relation === "teammate" ? tt("同 Team") : tt("同项目")))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function SavedGroupRow({ item, onOpen }: { item: ImConversationSummary; onOpen: (id: string) => void }) {
  const title = conversationDisplayTitle(item);
  return (
    <li data-saved-group={item.id}>
      <button
        type="button"
        onClick={() => onOpen(item.id)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-neutral-50"
      >
        <GroupAvatar name={title} src={item.avatar_url} members={item.avatar_members} seed={item.id} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold tracking-tight">{title}</span>
          {item.remark ? <span className="block truncate text-[12px] text-neutral-400">{item.title}</span> : null}
        </span>
      </button>
    </li>
  );
}
