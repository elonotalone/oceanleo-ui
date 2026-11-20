"use client";

import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { createGroup } from "../../../lib/im/groups-api";
import { conversationDisplayTitle, listContactGroups, openDm, useLoader, type PersonCard } from "../../../lib/im/people-api";
import { PRIMARY, QUIET } from "../MessageSettingsFrame";
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
        <p className="text-[13px]">{tt("群已创建。已加入 {n} 人，{m} 人等待同意。", { n: result.added, m: result.pending })}</p>
        {result.refused > 0 && <p className="text-[12px]">{tt("有 {n} 人没能加入（可能已拉黑）。", { n: result.refused })}</p>}
        <button type="button" className={PRIMARY} onClick={() => onCreated(result.id)}>{tt("进入群聊")}</button>
      </div> : <>
        {group && <>
          <label className="block text-[12px]">{tt("群名称")}<input value={title} onChange={e => setTitle(e.target.value)} maxLength={80} className="my-2 w-full rounded-lg border border-neutral-200 px-3 py-2" /></label>
          <div data-picker-chips className="mb-2 flex flex-wrap gap-2">{picked.map(id => <button key={id} type="button" className={QUIET} onClick={() => setPicked(old => old.filter(x => x !== id))}>{known[id]?.name ?? id} ×</button>)}</div>
          <details data-existing-groups className="mb-3"><summary className="text-[13px]">{tt("选择一个已有群")}</summary>
            {groups.loading ? <p role="status">{tt("加载中…")}</p> : groups.error ? <PeopleFailure error={groups.error} /> : groups.data?.length ? <ul>{groups.data.map(item => <li key={item.id}><button type="button" className={QUIET} onClick={() => onCreated(item.id)}>{conversationDisplayTitle(item)}</button></li>)}</ul> : <p className="py-2 text-[12px] text-neutral-500">{tt("还没有已有的群")}</p>}
          </details>
        </>}
        <PeopleSuggestions key={group ? "group" : "chat"} mode={group ? "select" : "chat"} selectedIds={picked} onPick={person => void pick(person)} />
        {group && <button type="button" disabled={!picked.length || busy} className={`${PRIMARY} mt-3`} data-action="create-group" onClick={() => void complete()}>{tt("创建群组")}</button>}
      </>}
    </div>
  </PeoplePage>;
}
