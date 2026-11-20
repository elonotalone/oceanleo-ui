"use client";

// Following and groups; old contacts remain readable while the people API is unavailable.

import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  conversationDisplayTitle,
  errorCodeOf,
  listContacts,
  listUserRemarks,
  listContactGroups,
  openDm,
  reasonOf,
  sortContacts,
  useLoader,
  visiblePersonName,
} from "../../../lib/im/people-api";
import type { ImContact, ImConversationSummary, ImPresence, ImProfile } from "../../../lib/im/types";
import { PeopleFailure, useFollowing } from "./PeopleDiscovery";
import { GroupAvatar, PersonAvatar, PresenceDot } from "../groups/GroupAvatar";
import { useImEvent, usePresence } from "../realtime/hooks";

export interface ContactListProps {
  query: string;
  onOpenProfile?: (userId: string) => void;
  onOpenConversation: (conversationId: string) => void;
}

const PRESENCE_COPY: Record<ImPresence, string> = { online: "在线", away: "离开", offline: "离线" };
/** 联系人、群组行：与收件箱同一种圆角行（侧栏的悬停底色）。 */
const CONTACT_ROW = "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-200/50";
const SECTION_TITLE = "px-3 pb-1 pt-2 text-[11px] font-medium text-stone-400";

export function ContactList({ query, onOpenConversation, onOpenProfile }: ContactListProps) {
  const tt = useUI();
  const [note, setNote] = useState<string | null>(null);
  const contacts = useLoader(listContacts, []);
  const following = useFollowing();
  const remarks = useLoader(listUserRemarks, []);
  const unavailable = errorCodeOf(following.error).endsWith("unavailable") || [404, 503].includes((following.error as { status?: number } | null)?.status ?? 0);
  const shownContacts: Pick<ImContact, "user_id" | "profile">[] = unavailable ? contacts.data ?? [] : following.people.map(person => ({
    user_id: person.user_id,
    profile: { ...contacts.data?.find(c => c.user_id === person.user_id)?.profile, user_id: person.user_id, display_name: person.name, avatar_url: person.avatar_url, remark: remarks.data?.find(r => r.user_id === person.user_id)?.remark ?? contacts.data?.find(c => c.user_id === person.user_id)?.profile.remark },
  }));
  const groups = useLoader(listContactGroups, []);
  useImEvent("contact.changed", () => {
    contacts.reload();
  });
  useImEvent("conversation.updated", groups.reload);
  useImEvent("conversation.removed", groups.reload);

  const contactIds = shownContacts.map(c => c.user_id);
  const presenceIds = contactIds;
  const presence = usePresence(presenceIds);

  const sorted = sortContacts(shownContacts, presence, query);
  const needle = query.trim().toLocaleLowerCase();
  const shownGroups = (groups.data ?? []).filter((g) => {
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
      <li key={p.user_id} data-contact={p.user_id} data-presence={state} className={`group ${CONTACT_ROW}`}>
        <button type="button" aria-label={tt("查看资料")} title={tt("查看资料")} onClick={() => onOpenProfile?.(p.user_id)} className="shrink-0 rounded-full transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300"><PersonAvatar name={shown} src={p.avatar_url} seed={p.user_id} size={36} /></button>
        <button type="button" onClick={() => void chat(p.user_id)} className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-stone-900">{shown}</span>
            <span className="flex items-center gap-1.5 text-[12px] text-stone-500">
              <PresenceDot presence={state} />
              {tt(PRESENCE_COPY[state])}
              {p.remark ? <span className="text-stone-400">· {p.display_name}</span> : null}
              {subtitle ? <span className="text-stone-400">· {subtitle}</span> : null}
            </span>
          </span>
        </button>
      </li>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-contact-list>
      {note && (
        <p role="status" className="px-3 pb-2 text-[12px] text-red-600">
          {note}
        </p>
      )}
      {following.error != null && <PeopleFailure error={following.error} />}
      {remarks.error != null && <PeopleFailure error={remarks.error} />}
      {contacts.error != null && unavailable && <PeopleFailure error={contacts.error} />}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <h4 className={SECTION_TITLE}>{tt("正在关注")}</h4>
        {(following.error && !unavailable) || (unavailable && contacts.error) ? null : sorted.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] text-stone-400" data-contacts-empty>
            {(unavailable ? contacts.loading : following.loading)
              ? tt("加载中…")
              : query.trim()
                ? tt("没有找到。")
                : tt("还没有关注任何人。")}
          </p>
        ) : (
          <ul data-contacts>{sorted.map((c) => row({ ...c.profile, user_id: c.user_id }, unavailable || following.people.find(p => p.user_id === c.user_id)?.follows_me ? tt("互相关注") : ""))}</ul>
        )}
        {following.moreError != null && <PeopleFailure error={following.moreError} />}
        {!unavailable && following.cursor && <button type="button" disabled={following.busy} onClick={() => void following.more()} className="mt-1 block w-full rounded-lg px-3 py-1.5 text-center text-[12px] text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 disabled:opacity-50">{following.busy ? tt("正在加载…") : tt("加载更多")}</button>}
        <section data-contact-groups>
          <h4 className={`${SECTION_TITLE} mt-2`}>
              {tt("群组")}
            </h4>
            <ul data-saved-groups>
              {shownGroups.map((g) => (
                <SavedGroupRow key={g.id} item={g} onOpen={onOpenConversation} />
              ))}
            </ul>
          {groups.error != null && <PeopleFailure error={groups.error} />}
          {!groups.error && shownGroups.length === 0 && <p className="px-3 py-6 text-center text-[12px] text-stone-400">{groups.loading ? tt("加载中…") : query.trim() ? tt("没有找到。") : tt("还没有加入任何群组。")}</p>}
        </section>
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
        className={CONTACT_ROW}
      >
        <GroupAvatar name={title} src={item.avatar_url} members={item.avatar_members} seed={item.id} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-stone-900">{title}</span>
          {item.remark ? <span className="block truncate text-[12px] text-stone-400">{item.title}</span> : null}
        </span>
      </button>
    </li>
  );
}
