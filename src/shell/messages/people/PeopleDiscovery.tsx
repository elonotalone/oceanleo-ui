"use client";

import { CheckGlyph } from "../composer/icons";
import { BackButton } from "../../../ui/BackButton";
import { useEffect, useState, type ReactNode } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { useAutoRecovery } from "../../../lib/auto-recovery";
import {
  copyText, errorCodeOf, followPerson, followSuggestions, getUsername, isCompleteEmail, listFollows, openDm,
  peopleMessageError, profileLink, searchPeople, unfollowPerson,
  useLoader, type PersonCard,
} from "../../../lib/im/people-api";
import { getAccountName } from "../../../lib/account/name-api";
import { PersonAvatar } from "../groups/GroupAvatar";
import { PRIMARY, QUIET } from "../MessageSettingsFrame";
import { InviteQrCode } from "./InviteQrCode";

export function PeoplePage({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  const tt = useUI();
  return <section data-people-page className="flex min-h-0 flex-1 flex-col">
    <header className="flex shrink-0 items-center gap-3 border-b border-stone-100 px-3 py-2">
      <BackButton onClick={onBack} label={tt("返回")} /><h2 className="text-[14px] font-semibold">{title}</h2>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
  </section>;
}

export function PeopleFailure({ error, action }: { error: unknown; action?: "follow" | "other" }) {
  const tt = useUI();
  return <p role="alert" className="py-2 text-[12px] text-red-600">{action === "follow" ? tt("关注操作未完成，请稍后再试。") : action === "other" ? peopleMessageError(error, tt) : errorCodeOf(error) === "people_email_rate_limit" ? tt("通过邮箱找人的次数已用完，请稍后再试。") : tt("找人功能暂不可用，正在自动恢复。")}</p>;
}

/** Cursor pages are kept explicit so following lists never silently stop at page one. */
export function useFollowing() {
  const first = useLoader(() => listFollows(), []);
  const [extra, setExtra] = useState<PersonCard[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { setExtra([]); setCursor(first.data?.next_cursor ?? null); setError(null); }, [first.data]);
  useEffect(() => {
    const reload = () => first.reload();
    window.addEventListener("im:following-changed", reload);
    return () => window.removeEventListener("im:following-changed", reload);
  }, [first.reload]);
  async function more() {
    if (!cursor || busy) return;
    setBusy(true);
    try { const page = await listFollows("following", cursor); setExtra((old) => [...old, ...page.people]); setCursor(page.next_cursor); setError(null); }
    catch (e) { setError(e); }
    finally { setBusy(false); }
  }
  useAutoRecovery(error != null, more, cursor);
  const people = [...new Map([...(first.data?.people ?? []), ...extra].map(p => [p.user_id, p])).values()];
  return { ...first, people, cursor, more, busy, moreError: error };
}

export function PersonRow({ person, mode, onPick, selected, disabled }: { person: PersonCard; selected?: boolean; disabled?: boolean; mode: "chat" | "follow" | "select"; onPick?: (person: PersonCard) => void }) {
  const tt = useUI();
  const [following, setFollowing] = useState(person.following);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => setFollowing(person.following), [person.following]);
  async function toggle() {
    setBusy(true); setError(null);
    try {
      if (following) await unfollowPerson(person.user_id); else await followPerson(person.user_id);
      setFollowing(!following);
      window.dispatchEvent(new Event("im:following-changed"));
    } catch (e) { setError(e); } finally { setBusy(false); }
  }
  return <li data-person={person.user_id} className="py-1">
    <div className="flex items-center gap-2">
      <PersonAvatar name={person.name} src={person.avatar_url} seed={person.user_id} size={32} />
      <button type="button" disabled={person.blocked || disabled} aria-pressed={mode === "select" ? !!selected : undefined} onClick={() => onPick?.({ ...person, following })} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[13px] font-medium">{person.name}{mode === "select" && selected ? <span className="inline-flex align-middle"><CheckGlyph /></span> : null}</span>
        {following && person.follows_me && <span className="text-[11px] text-stone-500">{tt("互相关注")}</span>}
      </button>
      {mode === "follow" && <button type="button" disabled={busy || person.blocked} onClick={() => void toggle()} className={QUIET}>{tt(following ? "已关注" : "关注")}</button>}
    </div>
    {error != null && <PeopleFailure error={error} action="follow" />}
  </li>;
}

/** The one people picker (LeoChat, task Collaborate, Share "Send to"). `action` renders under search results. */
export function PeopleSuggestions({ mode, onPick, initialQuery = "", selectedIds = [], existingIds = [], placeholder, action }: { selectedIds?: string[]; existingIds?: string[]; mode: "chat" | "follow" | "select"; onPick: (p: PersonCard) => void; initialQuery?: string; placeholder?: string; action?: (query: string) => ReactNode }) {
  const tt = useUI();
  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  // An address is looked up only when whole, after a longer pause: each lookup counts against a small hourly limit.
  useEffect(() => { const timer = setTimeout(() => setDebounced(query.trim()), query.includes("@") ? 700 : 250); return () => clearTimeout(timer); }, [query]);
  const search = useLoader(() => debounced && (!debounced.includes("@") || isCompleteEmail(debounced)) ? searchPeople(debounced) : Promise.resolve([]), [debounced]);
  const suggestions = useLoader(followSuggestions, []);
  const following = useFollowing();
  const titles = { team: "同团队的人", project: "同项目的人", bay: "在 LeoBay 聊过的人" };
  const rows = (people: PersonCard[]) => <ul>{people.map(p => <PersonRow key={p.user_id} person={p} mode={mode} selected={selectedIds.includes(p.user_id)} disabled={existingIds.includes(p.user_id)} onPick={onPick} />)}</ul>;
  return <div data-people-discovery>
    <input type="search" value={query} onChange={e => setQuery(e.target.value)} aria-label={placeholder ?? tt("按名称搜索用户")} placeholder={placeholder ?? tt("按名称搜索用户")} className="w-full rounded-lg border border-stone-200 px-3 py-2 text-[13px]" />
    {query.trim() ? <section data-people-search>
      {search.loading || query.trim() !== debounced ? <p role="status">{tt("加载中…")}</p> : search.error ? <PeopleFailure error={search.error} /> : search.data?.length ? rows(search.data) : <p className="py-2 text-[12px] text-stone-500">{tt("没有找到。")}</p>}
      {action?.(query.trim())}
    </section> : <>
      <section data-people-suggestions>
        {suggestions.loading ? <p role="status">{tt("加载中…")}</p> : suggestions.error ? <PeopleFailure error={suggestions.error} /> : suggestions.data?.map(group => <section key={group.key}>
          <h3 className="mt-3 text-[12px] font-medium text-stone-500">{tt(titles[group.key])}</h3>
          {rows(group.people)}
          {!group.people.length && <p className="py-2 text-[12px] text-stone-500">{tt("暂时没有推荐的人。")}</p>}
        </section>)}
      </section>
      <section data-people-following><h3 className="mt-3 text-[12px] font-medium text-stone-500">{tt("正在关注")}</h3>
        {following.loading ? <p role="status">{tt("加载中…")}</p> : following.error ? <PeopleFailure error={following.error} /> : following.people.length ? rows(following.people) : <p className="py-2 text-[12px] text-stone-500">{tt("还没有关注任何人。")}</p>}
        {following.moreError != null && <PeopleFailure error={following.moreError} />}
        {following.cursor && <button type="button" disabled={following.busy} className={QUIET} onClick={() => void following.more()}>{tt("加载更多")}</button>}
      </section>
    </>}
  </div>;
}

/** Your share card: the account name people see, plus the link and QR that open your card. */
export function MyProfileCard({ name, username }: { name: string | null; username: string | null }) {
  const tt = useUI();
  const [copied, setCopied] = useState<boolean | null>(null);
  const [qr, setQr] = useState(false);
  return <section data-my-profile-card className="mb-3 border-b border-stone-100 pb-3">
    <h3 className="mb-2 text-[13px] font-medium">{tt("我的名片")}</h3>
    {name && <p data-my-profile-name className="text-[13px]">{name}</p>}
    {username && <>
      <button type="button" className={QUIET} onClick={async () => setCopied(await copyText(profileLink(username)))}>{tt("复制资料链接")}</button>
      <button type="button" className={QUIET} aria-expanded={qr} onClick={() => setQr(!qr)}>{tt(qr ? "隐藏二维码" : "显示二维码")}</button>
      {copied !== null && <p role="status" className="text-[12px]">{tt(copied ? "已复制" : "请手动复制上面的链接。")}</p>}
      {copied === false && <input readOnly aria-label={tt("资料链接")} value={profileLink(username)} className="w-full" />}
      {qr && <InviteQrCode url={profileLink(username)} fileLabel={tt("我的资料二维码")} />}
    </>}
  </section>;
}

export function FindPeople({ onBack, onOpenConversation }: { onBack: () => void; onOpenConversation: (id: string) => void }) {
  const tt = useUI();
  const username = useLoader(getUsername, []);
  const account = useLoader(getAccountName, []);
  const [error, setError] = useState<unknown>(null);
  const name = account.data?.ok ? account.data.state.name : null;
  const initialQuery = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("username") ?? "";
  return <PeoplePage title={tt("找人")} onBack={onBack}>
    {username.loading ? <p role="status">{tt("加载中…")}</p> : username.error ? <PeopleFailure error={username.error} /> : <>
      <MyProfileCard name={name} username={username.data?.username ?? null} />
      <PeopleSuggestions mode="follow" initialQuery={initialQuery} onPick={async person => {
        setError(null);
        try { const id = await openDm(person.user_id); if (id) onOpenConversation(id); } catch (e) { setError(e); }
      }} />
    </>}
    {error != null && <PeopleFailure error={error} action="other" />}
  </PeoplePage>;
}
