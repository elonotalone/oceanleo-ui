"use client";

import { BackButton } from "../../../ui/BackButton";
import { useEffect, useState, type ReactNode } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  copyText, errorCodeOf, followPerson, followSuggestions, getUsername, listFollows, openDm,
  peopleMessageError, profileLink, searchPeople, setUsername, unfollowPerson,
  useLoader, usernameAvailability, usernameValid, type PersonCard,
} from "../../../lib/im/people-api";
import { PersonAvatar } from "../groups/GroupAvatar";
import { PRIMARY, QUIET } from "../MessageSettingsFrame";
import { InviteQrCode } from "./InviteQrCode";

export function PeoplePage({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  const tt = useUI();
  return <section data-people-page className="flex min-h-0 flex-1 flex-col">
    <header className="flex shrink-0 items-center gap-3 border-b border-neutral-100 px-3 py-2">
      <BackButton onClick={onBack} label={tt("返回")} /><h2 className="text-[14px] font-semibold">{title}</h2>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
  </section>;
}

export function PeopleFailure({ error }: { error: unknown }) {
  const tt = useUI();
  return <p role="alert" className="py-2 text-[12px] text-red-600">{peopleMessageError(error, tt)}</p>;
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
    setBusy(true); setError(null);
    try { const page = await listFollows("following", cursor); setExtra((old) => [...old, ...page.people]); setCursor(page.next_cursor); }
    catch (e) { setError(e); }
    finally { setBusy(false); }
  }
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
        <span className="block truncate text-[13px] font-medium">{person.name}{mode === "select" && selected ? " ✓" : ""}</span>
        {person.username && <span className="block truncate text-[12px] text-neutral-500">@{person.username}</span>}
        {following && person.follows_me && <span className="text-[11px] text-neutral-500">{tt("互相关注")}</span>}
      </button>
      {mode === "follow" && <button type="button" disabled={busy || person.blocked} onClick={() => void toggle()} className={QUIET}>{tt(following ? "已关注" : "关注")}</button>}
    </div>
    {error != null && <PeopleFailure error={error} />}
  </li>;
}

export function PeopleSuggestions({ mode, onPick, initialQuery = "", selectedIds = [], existingIds = [] }: { selectedIds?: string[]; existingIds?: string[]; mode: "chat" | "follow" | "select"; onPick: (p: PersonCard) => void; initialQuery?: string }) {
  const tt = useUI();
  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  useEffect(() => { const timer = setTimeout(() => setDebounced(query.trim()), 250); return () => clearTimeout(timer); }, [query]);
  const search = useLoader(() => debounced ? searchPeople(debounced) : Promise.resolve([]), [debounced]);
  const suggestions = useLoader(followSuggestions, []);
  const following = useFollowing();
  const titles = { team: "同团队的人", project: "同项目的人", bay: "在 LeoBay 聊过的人" };
  const rows = (people: PersonCard[]) => <ul>{people.map(p => <PersonRow key={p.user_id} person={p} mode={mode} selected={selectedIds.includes(p.user_id)} disabled={existingIds.includes(p.user_id)} onPick={onPick} />)}</ul>;
  return <div data-people-discovery>
    <input type="search" value={query} onChange={e => setQuery(e.target.value)} aria-label={tt("搜索用户名或名字")} placeholder={tt("搜索用户名或名字")} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px]" />
    {query.trim() ? <section data-people-search>
      {search.loading || query.trim() !== debounced ? <p role="status">{tt("加载中…")}</p> : search.error ? <PeopleFailure error={search.error} /> : search.data?.length ? rows(search.data) : <p className="py-2 text-[12px] text-neutral-500">{tt("没有找到。")}</p>}
    </section> : <>
      <section data-people-suggestions>
        {suggestions.loading ? <p role="status">{tt("加载中…")}</p> : suggestions.error ? <PeopleFailure error={suggestions.error} /> : suggestions.data?.map(group => <section key={group.key}>
          <h3 className="mt-3 text-[12px] font-medium text-neutral-500">{tt(titles[group.key])}</h3>
          {rows(group.people)}
          {!group.people.length && <p className="py-2 text-[12px] text-neutral-500">{tt("暂时没有推荐的人。")}</p>}
        </section>)}
      </section>
      <section data-people-following><h3 className="mt-3 text-[12px] font-medium text-neutral-500">{tt("正在关注")}</h3>
        {following.loading ? <p role="status">{tt("加载中…")}</p> : following.error ? <PeopleFailure error={following.error} /> : following.people.length ? rows(following.people) : <p className="py-2 text-[12px] text-neutral-500">{tt("还没有关注任何人。")}</p>}
        {following.moreError != null && <PeopleFailure error={following.moreError} />}
        {following.cursor && <button type="button" disabled={following.busy} className={QUIET} onClick={() => void following.more()}>{tt("加载更多")}</button>}
      </section>
    </>}
  </div>;
}

export function MyUsername({ value, suggested, onSaved }: { value: string | null; suggested: string; onSaved: (username: string) => void }) {
  const tt = useUI();
  const [draft, setDraft] = useState(value ?? suggested);
  const [editing, setEditing] = useState(!value);
  const [availability, setAvailability] = useState<"checking" | "available" | "taken" | "invalid" | "error">("checking");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<boolean | null>(null);
  const [qr, setQr] = useState(false);
  useEffect(() => {
    if (!editing) return;
    let alive = true;
    setError(null);
    if (!usernameValid(draft)) { setAvailability("invalid"); return; }
    if (draft === value) { setAvailability("available"); return; }
    setAvailability("checking");
    const timer = setTimeout(() => {
      usernameAvailability(draft).then(r => { if (alive) setAvailability(r.available ? "available" : "taken"); }, e => { if (alive) { setError(e); setAvailability("error"); } });
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [draft, editing, value]);
  async function save() {
    if (busy || availability !== "available") return;
    setBusy(true); setError(null);
    try { const result = await setUsername(draft); onSaved(result.username); setDraft(result.username); setEditing(false); setQr(false); setCopied(null); }
    catch (e) {
      setError(e);
      if (errorCodeOf(e) === "username_taken") setAvailability("taken");
      if (errorCodeOf(e) === "username_invalid") setAvailability("invalid");
    } finally { setBusy(false); }
  }
  return <section data-my-username className="mb-3 border-b border-neutral-100 pb-3">
    <h3 className="mb-2 text-[13px] font-medium">{tt("我的用户名")}</h3>
    {editing ? <form onSubmit={e => { e.preventDefault(); void save(); }}>
      {!value && <p className="mb-2 text-[12px] text-neutral-500">{tt("先设置用户名，方便别人找到你。")}</p>}
      <label className="block text-[12px]">{tt("用户名")}<input value={draft} maxLength={32} autoComplete="off" spellCheck={false} onChange={e => setDraft(e.target.value)} className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px]" /></label>
      <p role="status" className="py-2 text-[12px] text-neutral-500">{tt(({ checking: "正在检查用户名…", available: "这个用户名可以使用。", taken: "这个用户名已被使用。", invalid: "用户名需为 3–32 位小写字母、数字、下划线或连字符，并以字母或数字开头。", error: "无法检查用户名。" })[availability])}</p>
      <button type="submit" disabled={busy || availability !== "available"} className={PRIMARY}>{tt("保存")}</button>
      {value && <button type="button" className={QUIET} onClick={() => { setEditing(false); setDraft(value); setError(null); }}>{tt("取消")}</button>}
    </form> : <>
      <p className="text-[13px]">@{value}</p>
      <button type="button" className={QUIET} onClick={() => setEditing(true)}>{tt("修改")}</button>
      <button type="button" className={QUIET} onClick={async () => setCopied(await copyText(profileLink(value!)))}>{tt("复制资料链接")}</button>
      <button type="button" className={QUIET} aria-expanded={qr} onClick={() => setQr(!qr)}>{tt(qr ? "隐藏二维码" : "显示二维码")}</button>
      {copied !== null && <p role="status" className="text-[12px]">{tt(copied ? "已复制" : "请手动复制上面的链接。")}</p>}
      {copied === false && <input readOnly aria-label={tt("资料链接")} value={profileLink(value!)} className="w-full" />}
      {qr && <InviteQrCode url={profileLink(value!)} fileLabel={tt("我的资料二维码")} />}
    </>}
    {error != null && <PeopleFailure error={error} />}
  </section>;
}

export function FindPeople({ onBack, onOpenConversation }: { onBack: () => void; onOpenConversation: (id: string) => void }) {
  const tt = useUI();
  const username = useLoader(getUsername, []);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const value = saved ?? username.data?.username ?? null;
  const initialQuery = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("username") ?? "";
  return <PeoplePage title={tt("找人")} onBack={onBack}>
    {username.loading ? <p role="status">{tt("加载中…")}</p> : username.error ? <PeopleFailure error={username.error} /> : <>
      <MyUsername value={value} suggested={username.data?.suggested ?? ""} onSaved={setSaved} />
      {value && <PeopleSuggestions mode="follow" initialQuery={initialQuery} onPick={async person => {
        setError(null);
        try { const id = await openDm(person.user_id); if (id) onOpenConversation(id); } catch (e) { setError(e); }
      }} />}
    </>}
    {error != null && <PeopleFailure error={error} />}
  </PeoplePage>;
}
