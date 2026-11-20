"use client";

import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { createGroup } from "../../../lib/im/groups-api";
import { conversationDisplayTitle, listContactGroups, openDm, useLoader, type PersonCard } from "../../../lib/im/people-api";
import { PRIMARY, QUIET } from "../MessageSettingsFrame";
import { ImCloseIcon } from "../messages-surface";

const LIST_ROW = "flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-[13px] text-stone-800 transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-200/50";
import { PeopleFailure, PeoplePage, PeopleSuggestions } from "../people/PeopleDiscovery";

export interface NewConversationDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
  presetMemberIds?: string[];
  projectId?: string | null;
}

/** Mount a fresh page on every opening: no previous query, selection, or success state survives. */
export function NewConversationDialog(props: NewConversationDialogProps) {
  return props.open ? <NewChatPage {...props} /> : null;
}

function NewChatPage({ onClose, onCreated, presetMemberIds }: NewConversationDialogProps) {
  const tt = useUI();
  const [group, setGroup] = useState(!!presetMemberIds?.length);
  const [picked, setPicked] = useState<string[]>(presetMemberIds ?? []);
  const [known, setKnown] = useState<Record<string, PersonCard>>({});
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<{ id: string; added: number; pending: number; refused: number } | null>(null);
  const groups = useLoader(listContactGroups, []);
  async function pick(person: PersonCard) {
    if (group) {
      setKnown(old => ({ ...old, [person.user_id]: person }));
      setPicked(old => old.includes(person.user_id) ? old.filter(id => id !== person.user_id) : [...old, person.user_id]);
      return;
    }
    if (busy) return;
    setBusy(true); setError(null);
    try { const id = await openDm(person.user_id); if (id) onCreated(id); }
    catch (e) { setError(e); } finally { setBusy(false); }
  }
  async function complete() {
    if (!picked.length || busy) return;
    setBusy(true); setError(null);
    try {
      const response = await createGroup({ title: title.trim(), member_ids: picked });
      const added = Math.max(0, (response.conversation.member_count ?? 1) - 1);
      const pending = response.pending_invites ?? 0;
      setResult({ id: response.conversation.id, added, pending, refused: Math.max(0, picked.length - added - pending) });
    } catch (e) { setError(e); } finally { setBusy(false); }
  }
  return <PeoplePage title={tt(group ? "新建群组" : "新建聊天")} onBack={() => { if (group) { setGroup(false); setPicked([]); setTitle(""); setResult(null); setError(null); } else onClose(); }}>
    <div data-new-conversation aria-busy={busy}>
      {error != null && <PeopleFailure error={error} action="other" />}
      {!group && <button type="button" className={`${QUIET} mb-3`} data-action="new-group" onClick={() => { setGroup(true); setError(null); }}>{tt("新建群组")}</button>}
      {result ? <div data-create-result>
        <p className="text-[13px] text-stone-800">{tt("群已创建。已加入 {n} 人，{m} 人等待同意。", { n: result.added, m: result.pending })}</p>
        {result.refused > 0 && <p className="mt-1 text-[12px] text-stone-500">{tt("有 {n} 人没能加入（可能已拉黑）。", { n: result.refused })}</p>}
        <button type="button" className={`${PRIMARY} mt-3`} onClick={() => onCreated(result.id)}>{tt("进入群聊")}</button>
      </div> : <>
        {group && <>
          <label className="block text-[12px] text-stone-500">{tt("群名称")}<input value={title} onChange={e => setTitle(e.target.value)} maxLength={80} className="my-2 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-[13px] text-stone-900 outline-none transition focus:border-stone-300" /></label>
          {picked.length > 0 && <div data-picker-chips className="mb-2 flex flex-wrap gap-1.5">{picked.map(id => {
            const name = known[id]?.name ?? id;
            return <button key={id} type="button" aria-label={`${tt("移除")} ${name}`} title={`${tt("移除")} ${name}`} className="inline-flex max-w-[12rem] items-center gap-1 rounded-lg bg-stone-100 py-1 pl-2 pr-1 text-[12px] text-stone-700 transition hover:bg-stone-200" onClick={() => setPicked(old => old.filter(x => x !== id))}>
              <span className="truncate">{name}</span><span className="text-stone-400 [&>svg]:h-3.5 [&>svg]:w-3.5"><ImCloseIcon /></span>
            </button>;
          })}</div>}
          <details data-existing-groups className="group/existing mb-3 rounded-lg border border-stone-200">
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-2.5 py-2 text-[13px] text-stone-700 transition hover:bg-stone-50 [&::-webkit-details-marker]:hidden">
              {tt("选择一个已有群")}
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-stone-400 transition group-open/existing:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </summary>
            <div className="border-t border-stone-200 p-1">
              {groups.loading ? <p role="status" className="px-2.5 py-1.5 text-[12px] text-stone-400">{tt("加载中…")}</p> : groups.error ? <PeopleFailure error={groups.error} /> : groups.data?.length ? <ul className="space-y-0.5">{groups.data.map(item => <li key={item.id}><button type="button" className={LIST_ROW} onClick={() => onCreated(item.id)}><span className="truncate">{conversationDisplayTitle(item)}</span></button></li>)}</ul> : <p className="px-2.5 py-1.5 text-[12px] text-stone-400">{tt("还没有已有的群")}</p>}
            </div>
          </details>
        </>}
        <PeopleSuggestions key={group ? "group" : "chat"} mode={group ? "select" : "chat"} selectedIds={picked} onPick={person => void pick(person)} />
        {group && <button type="button" disabled={!picked.length || busy} className={`${PRIMARY} mt-3`} data-action="create-group" onClick={() => void complete()}>{tt("创建群组")}</button>}
      </>}
    </div>
  </PeoplePage>;
}
