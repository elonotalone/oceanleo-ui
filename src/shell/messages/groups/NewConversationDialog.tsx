"use client";

// 新建聊天：左边按名字搜通讯录（A–Z）和已有群，右边发起群聊。选 1 人开私聊，选多人建群。

import { useEffect, useMemo, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { Modal } from "../../../ui";
import { fetchConversations } from "../../../lib/im/inbox-api";
import { createGroup, openProjectConversation, openTeamConversation } from "../../../lib/im/groups-api";
import {
  classifyCandidate,
  conversationDisplayTitle,
  listBlocks,
  openDm,
  reasonOf,
  searchDirectory,
  sectionLetter,
  visiblePersonName,
} from "../../../lib/im/people-api";
import { listMyOrgs, type OrgSummary } from "../../../lib/org-api";
import type { ImConversationSummary, ImProfile } from "../../../lib/im/types";
import { GroupAvatar, PersonAvatar } from "./GroupAvatar";

export interface NewConversationDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
  presetMemberIds?: string[];
  /** 给了就在已有群里多一行「当前项目」 */
  projectId?: string | null;
}

const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"];

export function NewConversationDialog({
  open,
  onClose,
  onCreated,
  presetMemberIds,
  projectId = null,
}: NewConversationDialogProps) {
  const tt = useUI();
  const preset = presetMemberIds ?? [];
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>(preset);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; added: number; pending: number; refused: number } | null>(null);
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [people, setPeople] = useState<ImProfile[]>([]);
  const [groups, setGroups] = useState<ImConversationSummary[]>([]);
  const [blockedIds, setBlockedIds] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [openGroups, setOpenGroups] = useState(true);
  const [openContacts, setOpenContacts] = useState(true);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    listMyOrgs().then(
      (items) => alive && setOrgs(items),
      () => {},
    );
    listBlocks().then(
      (items) => alive && setBlockedIds(new Set(items.map((p) => p.user_id))),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    searchDirectory(query).then(
      (items) => {
        if (!alive) return;
        setPeople(items);
        setFailed(false);
        setLoading(false);
      },
      () => {
        if (!alive) return;
        setFailed(true);
        setLoading(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    Promise.all([
      fetchConversations("group"),
      fetchConversations("team"),
      fetchConversations("project"),
    ]).then(
      (pages) => {
        if (!alive) return;
        const seen = new Set<string>();
        const items: ImConversationSummary[] = [];
        for (const page of pages) {
          for (const item of page.items ?? []) {
            if (seen.has(item.id) || item.kind === "dm" || item.kind === "talent") continue;
            seen.add(item.id);
            items.push(item);
          }
        }
        setGroups(items);
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [open]);

  const known = useMemo(() => {
    const map = new Map<string, ImProfile>();
    for (const p of people) map.set(p.user_id, p);
    return map;
  }, [people]);

  const groupedPeople = useMemo(() => {
    const buckets = new Map<string, ImProfile[]>();
    for (const letter of LETTERS) buckets.set(letter, []);
    for (const p of people) {
      const letter = sectionLetter(visiblePersonName(p));
      buckets.get(letter === "#" ? "#" : letter)?.push(p);
    }
    return LETTERS.map((letter) => ({ letter, items: buckets.get(letter) ?? [] })).filter((row) => row.items.length > 0);
  }, [people]);

  const shownGroups = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return groups.filter((g) => {
      if (!needle) return true;
      const title = conversationDisplayTitle(g).toLocaleLowerCase();
      return title.includes(needle);
    });
  }, [groups, query]);

  if (!open) return null;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setNote(null);
    try {
      await action();
    } catch (e) {
      setNote(reasonOf(e, tt("没成功，请稍后再试。")));
    } finally {
      setBusy(false);
    }
  }

  function toggle(profile: ImProfile) {
    const status = classifyCandidate(profile, { blockedIds });
    if (status === "blocked") return;
    const on = picked.includes(profile.user_id);
    setPicked(on ? picked.filter((id) => id !== profile.user_id) : [...picked, profile.user_id]);
  }

  const complete = () =>
    run(async () => {
      if (picked.length === 1) {
        const id = await openDm(picked[0]!);
        if (id) onCreated(id);
        return;
      }
      if (picked.length < 1) return;
      const r = await createGroup({ title: title.trim(), member_ids: picked });
      const pending = r.pending_invites ?? 0;
      const added = Math.max(0, (r.conversation.member_count ?? 1) - 1);
      setDone({ id: r.conversation.id, added, pending, refused: Math.max(0, picked.length - added - pending) });
    });

  const openTeam = (orgId: string) =>
    run(async () => {
      const id = await openTeamConversation(orgId);
      if (id) onCreated(id);
    });

  const openProject = (id: string) =>
    run(async () => {
      const convId = await openProjectConversation(id);
      if (convId) onCreated(convId);
    });

  const canComplete = picked.length >= 1 && !busy;

  return (
    <Modal onClose={onClose} className="max-w-3xl" labelledBy="im-new-title">
      <div className="flex max-h-[min(720px,86vh)] min-h-[480px] overflow-hidden" data-new-conversation>
        {done ? (
          <div className="flex-1 p-5" data-create-result>
            <h3 id="im-new-title" className="text-[15px] font-semibold text-neutral-900">
              {tt("发起群聊")}
            </h3>
            <p className="mt-4 text-[14px] text-neutral-800">
              {tt("群已创建。已加入 {n} 人，{m} 人等待同意。", { n: done.added, m: done.pending })}
            </p>
            {done.refused > 0 && <p className="mt-1 text-[12px] text-neutral-500">{tt("有 {n} 人没能加入（可能已拉黑）。", { n: done.refused })}</p>}
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={() => onCreated(done.id)} data-action="enter" className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-[13px] font-medium text-white">
                {tt("进入群聊")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <aside className="flex w-[46%] min-w-[240px] shrink-0 flex-col border-r border-neutral-100 bg-neutral-50/70">
              <div className="p-3">
                <input
                  type="search"
                  value={query}
                  autoFocus
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={tt("按名字搜索")}
                  aria-label={tt("搜索")}
                  className="w-full rounded-full border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
                />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pb-4">
                <SectionToggle open={openGroups} onToggle={() => setOpenGroups((v) => !v)} label={tt("选择一个已有群")} />
                {openGroups && (
                  <ul data-existing-groups>
                    {shownGroups.map((g) => (
                      <li key={g.id}>
                        <button
                          type="button"
                          data-existing-group={g.id}
                          disabled={busy}
                          onClick={() => onCreated(g.id)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-white disabled:opacity-50"
                        >
                          <GroupAvatar name={conversationDisplayTitle(g)} src={g.avatar_url} members={g.avatar_members} seed={g.id} size={28} />
                          <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-900">{conversationDisplayTitle(g)}</span>
                        </button>
                      </li>
                    ))}
                    {orgs.map((o) => (
                      <li key={`org-${o.id}`}>
                        <button
                          type="button"
                          data-action="open-team"
                          disabled={busy}
                          onClick={() => openTeam(o.id)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-neutral-800 hover:bg-white disabled:opacity-50"
                        >
                          {o.name}
                          <span className="text-[11px] text-neutral-400">{tt("打开 Team 群")}</span>
                        </button>
                      </li>
                    ))}
                    {projectId && (
                      <li>
                        <button
                          type="button"
                          data-action="open-project"
                          disabled={busy}
                          onClick={() => openProject(projectId)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-neutral-800 hover:bg-white disabled:opacity-50"
                        >
                          {tt("当前项目")}
                          <span className="text-[11px] text-neutral-400">{tt("打开项目群")}</span>
                        </button>
                      </li>
                    )}
                    {shownGroups.length === 0 && orgs.length === 0 && !projectId && (
                      <li className="px-3 py-3 text-[12px] text-neutral-400">{tt("还没有已有的群")}</li>
                    )}
                  </ul>
                )}

                <SectionToggle open={openContacts} onToggle={() => setOpenContacts((v) => !v)} label={tt("联系人")} />
                {openContacts && (
                  <div data-member-picker>
                    {groupedPeople.map((row) => (
                      <div key={row.letter}>
                        <div className="px-3 py-1 text-[11px] font-medium text-neutral-400">{row.letter}</div>
                        <ul role="listbox" aria-multiselectable>
                          {row.items.map((p) => {
                            const status = classifyCandidate(p, { blockedIds });
                            const on = picked.includes(p.user_id);
                            const unavailable = status === "blocked";
                            return (
                              <li key={p.user_id} role="option" aria-selected={on}>
                                <button
                                  type="button"
                                  disabled={unavailable}
                                  data-candidate={p.user_id}
                                  data-status={status}
                                  data-picked={on ? "true" : "false"}
                                  onClick={() => toggle(p)}
                                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <span
                                    aria-hidden="true"
                                    className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? "border-neutral-900 bg-neutral-900" : "border-neutral-300 bg-white"}`}
                                  >
                                    {on ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                                  </span>
                                  <PersonAvatar name={visiblePersonName(p)} src={p.avatar_url} seed={p.user_id} size={28} />
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13px] text-neutral-900">{visiblePersonName(p)}</span>
                                    {p.remark ? <span className="block truncate text-[11px] text-neutral-400">{p.display_name}</span> : null}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                    {people.length === 0 && (
                      <p className="px-3 py-6 text-center text-[12px] text-neutral-400" data-picker-empty>
                        {loading
                          ? tt("加载中…")
                          : failed
                            ? tt("加载失败，请稍后再试。")
                            : query.trim()
                              ? tt("没有找到。只能搜到联系人、同 Team、同项目的人；其他人请发邀请链接。")
                              : tt("这里还没有人。先添加联系人。")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </aside>

            <section className="flex min-w-0 flex-1 flex-col">
              <div className="border-b border-neutral-100 px-5 py-4">
                <h3 id="im-new-title" className="text-[16px] font-semibold text-neutral-900">
                  {tt("发起群聊")}
                </h3>
                {picked.length > 0 && (
                  <p className="mt-1 text-[12px] text-neutral-400">{tt("已选 {n} 人", { n: picked.length })}</p>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {picked.length > 1 && (
                  <label className="mb-4 flex flex-col gap-1 text-[12px] text-neutral-600">
                    {tt("群名称")}
                    <input
                      value={title}
                      maxLength={80}
                      onChange={(e) => setTitle(e.target.value)}
                      data-field="title"
                      placeholder={tt("不填则用成员名字")}
                      className="rounded-lg border border-neutral-200 px-3 py-2 text-[13px] text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
                    />
                  </label>
                )}
                <div className="flex flex-wrap gap-2" data-picker-chips>
                  {picked.map((id) => {
                    const p = known.get(id);
                    const name = p ? visiblePersonName(p) : id.slice(0, 6);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setPicked(picked.filter((x) => x !== id))}
                        className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-[12px] text-neutral-700 hover:bg-neutral-200"
                      >
                        {p ? <PersonAvatar name={name} src={p.avatar_url} seed={p.user_id} size={20} /> : null}
                        <span>{name}</span>
                        <span aria-hidden="true">×</span>
                      </button>
                    );
                  })}
                </div>
                {note && (
                  <p role="alert" className="mt-3 text-[12px] text-red-600" data-new-note>
                    {note}
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 border-t border-neutral-100 px-5 py-3">
                <button type="button" onClick={onClose} className="rounded-lg px-3.5 py-1.5 text-[13px] text-neutral-500 hover:bg-neutral-50">
                  {tt("取消")}
                </button>
                <button
                  type="button"
                  disabled={!canComplete}
                  onClick={complete}
                  data-action={picked.length <= 1 ? "start-dm" : "create-group"}
                  className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
                >
                  {tt("完成")}
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </Modal>
  );
}

function SectionToggle({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-neutral-700 hover:bg-white"
    >
      <span aria-hidden="true" className="text-[11px] text-neutral-400">
        {open ? "▾" : "▸"}
      </span>
      {label}
    </button>
  );
}
