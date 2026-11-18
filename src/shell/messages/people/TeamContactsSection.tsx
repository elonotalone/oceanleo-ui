"use client";

import { PRIMARY } from "../MessageSettingsFrame";

import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { addTeamContacts, listContactTeams, reasonOf, useLoader } from "../../../lib/im/people-api";

export function TeamContactsSection() {
  const tt = useUI();
  const teams = useLoader(listContactTeams, []);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  function toggle(ids: string[], checked: boolean) {
    const next = new Set(selected);
    for (const id of ids) {
      if (checked) next.add(id);
      else next.delete(id);
    }
    if (next.size > 100) {
      setNote(tt("最多选择 100 人。"));
      return;
    }
    setSelected(next);
    setNote(null);
  }

  async function add() {
    setBusy(true);
    setNote(null);
    try {
      const result = await addTeamContacts([...selected]);
      setNote(tt("已添加 {n} 人，跳过 {skipped} 位已有好友。", { n: result.added.length, skipped: result.skipped.length }));
      setSelected(new Set());
      teams.reload();
    } catch (error) {
      setNote(reasonOf(error, tt("没成功，请稍后再试。")));
    } finally {
      setBusy(false);
    }
  }

  return <section data-team-contacts className="mt-4 border-b border-neutral-100 pb-4">
    <h4 className="text-[13px] font-semibold">{tt("来自我的团队")}</h4>
    {teams.loading && <p className="mt-2 text-[12px] text-neutral-500">{tt("加载中…")}</p>}
    {teams.error ? <p role="alert" className="mt-2 text-[12px] text-red-600">{reasonOf(teams.error, tt("没成功，请稍后再试。"))}</p> : null}
    {!teams.loading && !teams.error && !(teams.data ?? []).some((t) => t.members.length) && <p className="mt-2 text-[12px] text-neutral-500">{tt("暂无可添加的团队成员。")}</p>}
    <div className="mt-2 max-h-56 overflow-y-auto">
      {(teams.data ?? []).filter((t) => t.members.length > 0).map((team) => <fieldset key={team.org_id} disabled={busy} data-team={team.org_id} className="mb-3">
        <legend className="text-[12px] font-medium">{team.name}</legend>
        <label className="mt-1 flex items-center gap-2 text-[12px]">
          <input type="checkbox" data-select-team={team.org_id} checked={team.members.every((m) => selected.has(m.user_id))} onChange={(e) => toggle(team.members.map((m) => m.user_id), e.target.checked)} />
          {tt("全选团队")}
        </label>
        {team.members.map((member) => <label key={member.user_id} className="ml-4 mt-1 flex items-center gap-2 text-[13px]">
          <input type="checkbox" data-team-member={member.user_id} checked={selected.has(member.user_id)} onChange={(e) => toggle([member.user_id], e.target.checked)} />
          {member.remark || member.display_name}
        </label>)}
      </fieldset>)}
    </div>
    <button type="button" disabled={busy || selected.size === 0} data-action="add-team-contacts" onClick={() => void add()} className={`${PRIMARY} mt-2`}>{tt("添加 {n} 人", { n: selected.size })}</button>
    {note && <p role="status" className="mt-2 text-[12px] text-neutral-600">{note}</p>}
  </section>;
}
