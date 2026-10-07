"use client";

// 新建私聊 / 群组；也能直接打开自己所在 Team 的 Team 群、项目群。

import { useEffect, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { Modal, Switch } from "../../../ui";
import { createGroup, openProjectConversation, openTeamConversation } from "../../../lib/im/groups-api";
import { openDm, reasonOf } from "../../../lib/im/people-api";
import { listMyOrgs, type OrgSummary } from "../../../lib/org-api";
import { MemberPicker } from "../people/MemberPicker";

export interface NewConversationDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
  presetMemberIds?: string[];
  /** 给了就在「Team / 项目」页签里直接打开这个项目群 */
  projectId?: string | null;
}

type Tab = "dm" | "group" | "team";

export function NewConversationDialog({ open, onClose, onCreated, presetMemberIds, projectId = null }: NewConversationDialogProps) {
  const tt = useUI();
  const preset = presetMemberIds ?? [];
  const [tab, setTab] = useState<Tab>(preset.length > 1 ? "group" : "dm");
  const [picked, setPicked] = useState<string[]>(preset);
  const [title, setTitle] = useState("");
  const [approval, setApproval] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; added: number; pending: number; refused: number } | null>(null);
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    listMyOrgs().then(
      (items) => alive && setOrgs(items),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [open]);

  if (!open) return null;

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "dm", label: tt("私聊") },
    { id: "group", label: tt("群聊") },
    ...(orgs.length > 0 || projectId ? [{ id: "team" as const, label: tt("Team / 项目") }] : []),
  ];

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

  const startDm = () =>
    run(async () => {
      const id = await openDm(picked[0]!);
      if (id) onCreated(id);
    });

  const createNewGroup = () =>
    run(async () => {
      const r = await createGroup({ title: title.trim(), member_ids: picked, join_approval: approval });
      const pending = r.pending_invites ?? 0;
      // 创建者自己不算「已加入 N 人」里的被拉人
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

  return (
    <Modal onClose={onClose} className="max-w-md" labelledBy="im-new-title">
      <div className="p-5" data-new-conversation>
        <h3 id="im-new-title" className="text-[15px] font-semibold text-neutral-900">
          {tt("新建聊天")}
        </h3>

        {done ? (
          <div className="mt-4" data-create-result>
            <p className="text-[14px] text-neutral-800">
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
            <div role="tablist" className="mt-3 flex gap-1">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  data-tab={t.id}
                  onClick={() => {
                    setTab(t.id);
                    setPicked((p) => (t.id === "dm" ? p.slice(0, 1) : p));
                    setNote(null);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-[13px] ${tab === t.id ? "bg-neutral-100 font-medium text-neutral-900" : "text-neutral-500 hover:bg-neutral-50"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "dm" && (
              <div className="mt-3">
                <MemberPicker mode="single" directOnly selected={picked.slice(0, 1)} onChange={setPicked} extraIds={preset} autoFocus />
                <div className="mt-4 flex justify-end">
                  <button type="button" disabled={busy || picked.length !== 1} onClick={startDm} data-action="start-dm" className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-[13px] font-medium text-white disabled:opacity-50">
                    {tt("开始私聊")}
                  </button>
                </div>
              </div>
            )}

            {tab === "group" && (
              <div className="mt-3 flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-[12px] text-neutral-600">
                  {tt("群名称")}
                  <input
                    value={title}
                    maxLength={80}
                    onChange={(e) => setTitle(e.target.value)}
                    data-field="title"
                    placeholder={tt("必填，最多 80 字")}
                    className="rounded-lg border border-neutral-200 px-3 py-2 text-[13px] text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
                  />
                </label>
                <MemberPicker selected={picked} onChange={setPicked} extraIds={preset} />
                <div className="flex items-center justify-between text-[13px] text-neutral-700">
                  <span>{tt("进群需要管理员审批")}</span>
                  <Switch checked={approval} onChange={setApproval} label={tt("进群需要管理员审批")} />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={busy || !title.trim()}
                    onClick={createNewGroup}
                    data-action="create-group"
                    className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
                  >
                    {tt("创建群组")}
                  </button>
                </div>
              </div>
            )}

            {tab === "team" && (
              <ul className="mt-3 divide-y divide-neutral-100" data-team-list>
                {orgs.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-[14px] text-neutral-900">{o.name}</span>
                    <button type="button" disabled={busy} onClick={() => openTeam(o.id)} data-action="open-team" className="rounded-lg border border-neutral-200 px-2.5 py-1 text-[12px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
                      {tt("打开 Team 群")}
                    </button>
                  </li>
                ))}
                {projectId && (
                  <li className="flex items-center gap-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-[14px] text-neutral-900">{tt("当前项目")}</span>
                    <button type="button" disabled={busy} onClick={() => openProject(projectId)} data-action="open-project" className="rounded-lg border border-neutral-200 px-2.5 py-1 text-[12px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
                      {tt("打开项目群")}
                    </button>
                  </li>
                )}
              </ul>
            )}

            {note && (
              <p role="alert" className="mt-3 text-[12px] text-red-600" data-new-note>
                {note}
              </p>
            )}
            <div className="mt-2 flex justify-start">
              <button type="button" onClick={onClose} className="rounded-lg px-1 py-1.5 text-[13px] text-neutral-500 hover:text-neutral-800">
                {tt("取消")}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
