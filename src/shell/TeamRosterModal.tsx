"use client";

// ============================================================================
// @oceanleo/ui — 专家团成员管理弹窗 TeamRosterModal（宗旨 v13，2026-07-02）
// ----------------------------------------------------------------------------
// 使用场景：agent 站聊天输入框里的「专家团」小图标，点开 → 弹本 modal，展示当前
// team 的成员列表；用户可：
//   1) 点某个成员 → 弹 SkillPromptPanel（modal）编辑其 prompt；保存为「我的 agent」
//      成功后，用户点「用替换成员」→ 把该 slot 替换为新 agent。
//   2) 点「+ 添加成员」→ 从 agent 市场里挑一个加入。
//   3) 点某成员的删除图标 → 移出团（本地态；save 后才生效）。
//   4) 点「保存」→ 调 updateTeamMembers：
//        - 若原团 = 自有 → 直接改，回调 onSaved(oldTeamId, forked=false)。
//        - 若原团 = 官方/他人 → 后端 fork，回调 onSaved(newTeamId, forked=true)。
//          消费站据此把当前 team 切到新 id。
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import {
  listAgents,
  listTeams,
  updateTeamMembers,
  type AgentDef,
  type TeamDef,
} from "../lib/agent";
import { brandColorFor, tintOf } from "../lib/brand-color";
import { SkillPromptPanel } from "./SkillPromptPanel";
import { useUI } from "../i18n/ui/useUI";

const DEFAULT_ACCENT = "#7c3aed";

export interface TeamRosterModalProps {
  /** 当前团 id。空值 → 不渲染。 */
  teamId: string;
  /** 显示开关（受控）。 */
  open: boolean;
  onClose: () => void;
  /**
   * 保存成功回调：newTeamId = 后端返回的 team_id（可能与原 id 不同，若发生 fork），
   * forked = 是否发生了 fork。前端用它切换到新 team。
   */
  onSaved?: (newTeamId: string, forked: boolean) => void;
  /** 强调色。 */
  accent?: string;
  /** 站 id（默认 "agent"）——拉 agents 市场时用。 */
  siteId?: string;
}

export function TeamRosterModal({
  teamId,
  open,
  onClose,
  onSaved,
  accent = DEFAULT_ACCENT,
  siteId = "agent",
}: TeamRosterModalProps) {
  const tt = useUI();
  const [team, setTeam] = useState<TeamDef | null>(null);
  const [allAgents, setAllAgents] = useState<AgentDef[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editMember, setEditMember] = useState<AgentDef | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  // 从 SkillPromptPanel「保存为我的 agent」派生的新 agent id → 用来问用户「要不要
  // 用它替换原成员」。
  const [replaceCandidate, setReplaceCandidate] = useState<{
    oldId: string;
    newId: string;
  } | null>(null);

  // 首次打开时加载 team 详情 + agent 市场。
  useEffect(() => {
    if (!open || !teamId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      const [teamsRes, agentsRes] = await Promise.all([
        listTeams(siteId),
        listAgents(siteId),
      ]);
      if (!alive) return;
      if (teamsRes.ok) {
        const t = (teamsRes.data?.items || []).find((x) => x.team_id === teamId);
        if (t) {
          setTeam(t);
          setMemberIds([...(t.member_ids || [])]);
        } else {
          setError(tt("找不到这个专家团"));
        }
      } else {
        setError(tt("加载失败"));
      }
      if (agentsRes.ok) setAllAgents(agentsRes.data?.items || []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [open, teamId, siteId, tt]);

  const agentById = useMemo(() => {
    const m = new Map<string, AgentDef>();
    for (const a of allAgents) m.set(a.agent_id, a);
    return m;
  }, [allAgents]);

  const members = useMemo(
    () => memberIds.map((id) => agentById.get(id)).filter(Boolean) as AgentDef[],
    [memberIds, agentById],
  );

  const remove = (agentId: string) => {
    setMemberIds((cur) => cur.filter((x) => x !== agentId));
  };

  const addFromMarket = (a: AgentDef) => {
    setMemberIds((cur) => (cur.includes(a.agent_id) ? cur : [...cur, a.agent_id]));
    setShowPicker(false);
  };

  const replaceMember = (oldId: string, newId: string) => {
    setMemberIds((cur) => cur.map((x) => (x === oldId ? newId : x)));
    setReplaceCandidate(null);
    setEditMember(null);
  };

  const save = async () => {
    if (!teamId || memberIds.length < 1) return;
    setSaving(true);
    setError(null);
    const r = await updateTeamMembers(teamId, memberIds);
    setSaving(false);
    if (!r.ok) {
      setError(r.status === 401 ? tt("请先登录") : tt("保存失败"));
      return;
    }
    onSaved?.(r.data!.team_id, r.data!.forked);
    onClose();
  };

  if (!open) return null;

  // 候选专家池（尚未在团里 + 与 team.site_id 匹配）。
  const candidatePool = allAgents.filter((a) => !memberIds.includes(a.agent_id));

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[86vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-stone-100 px-6 pb-4 pt-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className="grid h-8 w-8 place-items-center rounded-lg text-[15px]"
                style={{
                  background: tintOf(brandColorFor(teamId), 0.14),
                  color: brandColorFor(teamId),
                }}
              >
                {team?.icon || "🧩"}
              </span>
              <h3 className="truncate text-[16px] font-semibold text-stone-900">
                {team?.name || tt("专家团")}
              </h3>
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-500">
                {tt("{n} 位成员", { n: memberIds.length })}
              </span>
            </div>
            {team?.tagline && (
              <p className="mt-1 line-clamp-2 text-[12px] text-stone-500">{team.tagline}</p>
            )}
            <p className="mt-2 text-[11px] leading-relaxed text-stone-400">
              {tt(
                "点成员查看/改写 prompt，保存后会替换团里那位；对官方专家团做的改动会自动派生成「我的专家团」。",
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-3 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-600"
          >
            ✕
          </button>
        </div>

        {/* Members */}
        <div className="max-h-[52vh] overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="py-10 text-center text-[13px] text-stone-500">{tt("加载中…")}</p>
          ) : members.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-stone-400">
              {tt("这个团还没有成员，点下方「＋ 添加成员」加一个 agent。")}
            </p>
          ) : (
            <ul className="space-y-2">
              {members.map((m) => {
                const c = brandColorFor(m.agent_id);
                return (
                  <li
                    key={m.agent_id}
                    className="group flex items-center gap-3 rounded-xl border border-stone-200 bg-white/85 px-3 py-2.5 shadow-sm transition hover:border-stone-300"
                  >
                    <span
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[15px]"
                      style={{ background: tintOf(c, 0.14), color: c }}
                    >
                      {m.icon || "✦"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditMember(m)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-[13.5px] font-medium text-stone-900">
                        {m.name}
                      </p>
                      {m.tagline && (
                        <p className="truncate text-[12px] text-stone-500">{m.tagline}</p>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditMember(m)}
                      className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[12px] text-stone-600 opacity-0 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 group-hover:opacity-100"
                    >
                      {tt("查看 / 改 prompt")}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(m.agent_id)}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-stone-200 bg-white text-stone-400 opacity-0 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
                      title={tt("移出团")}
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-9 0l1 13a1 1 0 001 1h6a1 1 0 001-1l1-13" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-300 bg-white/60 py-3 text-[13px] text-stone-500 transition hover:border-stone-400 hover:text-stone-700"
            style={{ borderColor: `${accent}44` }}
          >
            <span className="text-[15px]">＋</span>
            <span>{tt("添加成员")}</span>
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-stone-100 bg-stone-50/60 px-6 py-3">
          <p className="min-w-0 flex-1 text-[12px] text-stone-500">
            {error || tt("对官方团的改动会自动保存为「我的专家团」。")}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-stone-200 bg-white px-4 py-1.5 text-[13px] text-stone-600 shadow-sm transition hover:bg-stone-50"
            >
              {tt("取消")}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || memberIds.length < 1}
              className="rounded-lg px-4 py-1.5 text-[13px] font-medium text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: accent }}
            >
              {saving ? tt("保存中…") : tt("保存")}
            </button>
          </div>
        </div>
      </div>

      {/* 编辑单个成员 prompt */}
      {editMember && (
        <SkillPromptPanel
          variant="modal"
          open
          onClose={() => setEditMember(null)}
          agentId={editMember.agent_id}
          name={editMember.name}
          tagline={editMember.tagline}
          icon={editMember.icon}
          category={editMember.category}
          accent={accent}
          onSavedAsSkill={(newId) => {
            // 保存成功后弹「用新 agent 替换原成员」确认。
            setReplaceCandidate({ oldId: editMember.agent_id, newId });
          }}
        />
      )}

      {/* 替换确认 */}
      {replaceCandidate && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setReplaceCandidate(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[15px] font-semibold text-stone-900">
              {tt("用新 agent 替换该成员？")}
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-stone-500">
              {tt(
                "你刚创建了一个自己的 agent（基于修改后的 prompt）。是否用它替换团里原来的这位成员？",
              )}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReplaceCandidate(null)}
                className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[13px] text-stone-600"
              >
                {tt("不替换")}
              </button>
              <button
                type="button"
                onClick={() =>
                  replaceMember(replaceCandidate.oldId, replaceCandidate.newId)
                }
                className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-white"
                style={{ background: accent }}
              >
                {tt("替换")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agent picker */}
      {showPicker && (
        <AgentPickerModal
          agents={candidatePool}
          onClose={() => setShowPicker(false)}
          onPick={addFromMarket}
          accent={accent}
        />
      )}
    </div>
  );
}

function AgentPickerModal({
  agents,
  onClose,
  onPick,
  accent,
}: {
  agents: AgentDef[];
  onClose: () => void;
  onPick: (a: AgentDef) => void;
  accent: string;
}) {
  const tt = useUI();
  const [q, setQ] = useState("");
  const norm = q.trim().toLowerCase();
  const shown = agents.filter((a) => {
    if (!norm) return true;
    return (
      a.name.toLowerCase().includes(norm) ||
      (a.tagline || "").toLowerCase().includes(norm) ||
      (a.capabilities || "").toLowerCase().includes(norm)
    );
  });
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3">
          <h3 className="text-[15px] font-semibold text-stone-900">
            {tt("选一位 agent 加入团")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-lg text-stone-400 hover:bg-stone-100"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-3">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tt("按名称筛选…")}
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-stone-400"
          />
        </div>
        <div className="max-h-[52vh] overflow-y-auto px-2 pb-4">
          {shown.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-stone-400">
              {tt("没有可选的 agent。")}
            </p>
          ) : (
            <ul className="space-y-1">
              {shown.map((a) => {
                const c = brandColorFor(a.agent_id);
                return (
                  <li key={a.agent_id}>
                    <button
                      type="button"
                      onClick={() => onPick(a)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-stone-50"
                    >
                      <span
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[14px]"
                        style={{ background: tintOf(c, 0.14), color: c }}
                      >
                        {a.icon || "✦"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-stone-900">
                          {a.name}
                        </span>
                        {a.tagline && (
                          <span className="block truncate text-[11.5px] text-stone-500">
                            {a.tagline}
                          </span>
                        )}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                        style={{ background: accent }}
                      >
                        {tt("加入")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
