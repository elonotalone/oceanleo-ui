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

import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
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

function TeamRosterModalInner({
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
    // teamId 为空时不加载（渲染阶段会显示「空专家团」友好态，见下）；避免带空 id
    // 去请求 / 报错。
    if (!open || !teamId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [teamsRes, agentsRes] = await Promise.all([
          listTeams(siteId),
          listAgents(siteId),
        ]);
        if (!alive) return;
        if (teamsRes.ok) {
          // items 可能缺失 / 非数组（后端异常 / 空体）——一律兜成 []，再 find。
          const items = Array.isArray(teamsRes.data?.items) ? teamsRes.data!.items : [];
          const t = items.find((x) => x?.team_id === teamId);
          if (t) {
            setTeam(t);
            // member_ids 可能 undefined / 非数组；过滤掉空 id，避免下游 Map/渲染出错。
            const ids = Array.isArray(t.member_ids) ? t.member_ids : [];
            setMemberIds(ids.filter((id): id is string => typeof id === "string" && !!id));
          } else {
            setError(tt("找不到这个专家团"));
          }
        } else {
          setError(tt("加载失败"));
        }
        if (agentsRes.ok) {
          setAllAgents(Array.isArray(agentsRes.data?.items) ? agentsRes.data!.items : []);
        }
      } catch {
        // listTeams/listAgents 内部已吞掉 fetch 错误，这里兜住任何意料外的抛出
        //（如 accessToken 抛错），保证不会卡在「加载中…」永远转圈，也不冒泡崩页。
        if (alive) setError(tt("加载失败"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, teamId, siteId, tt]);

  const agentById = useMemo(() => {
    const m = new Map<string, AgentDef>();
    for (const a of allAgents) {
      if (a && typeof a.agent_id === "string" && a.agent_id) m.set(a.agent_id, a);
    }
    return m;
  }, [allAgents]);

  // 已解析出实体的成员（某成员 id 若已从市场下架 / 被删 → agentById.get 返回 undefined，
  // 这里过滤掉，绝不把 undefined 传进渲染，避免 `.name` 之类崩溃）。
  const members = useMemo(
    () =>
      memberIds
        .map((id) => agentById.get(id))
        .filter((a): a is AgentDef => Boolean(a && a.agent_id)),
    [memberIds, agentById],
  );

  const remove = (agentId: string) => {
    setMemberIds((cur) => cur.filter((x) => x !== agentId));
  };

  const addFromMarket = (a: AgentDef) => {
    if (!a || !a.agent_id) {
      setShowPicker(false);
      return;
    }
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
    if (!r.ok || !r.data) {
      // r.ok 但 data 为空（200 空体 / 非 JSON）也算失败——绝不 `r.data!.xxx` 硬解引用崩页。
      setError(r.status === 401 ? tt("请先登录") : tt("保存失败"));
      return;
    }
    // team_id 兜回原 teamId（后端理应回传，缺失时不至于把当前团切成空）。
    onSaved?.(r.data.team_id || teamId, Boolean(r.data.forked));
    onClose();
  };

  if (!open) return null;

  // teamId 为空却被打开（消费站误传 teamId="" / 团还没选好）：给一个友好的空态弹窗，
  // 而不是拿空 id 去请求、渲染出半残的头部、或让「保存」走到 404。
  if (!teamId) {
    return <EmptyTeamModal onClose={onClose} accent={accent} />;
  }

  // 候选专家池（尚未在团里 + 与 team.site_id 匹配）。有效 agent_id 才纳入。
  const candidatePool = allAgents.filter(
    (a) => a && a.agent_id && !memberIds.includes(a.agent_id),
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      // ⚠ 只在【直接点到背景本身】时关闭。绝不能用 onClick={onClose}：本弹窗里嵌的
      // SkillPromptPanel / CreateSkillModal 都用 createPortal 挂到 document.body，
      // 但 React 事件沿【React 树】冒泡（不是 DOM 树）——portal 子树里任意按钮的点击
      // 都会冒泡到这个背景 div。若这里是 onClick={onClose}，点面板里「编辑 / 保存为
      // 我的 agent」会连带把整个 roster 关掉、退回空白对话（操作员反馈的「点这个板块
      // 就闪退」真因，2026-07-04 用 Playwright 复现坐实）。`e.target===e.currentTarget`
      // 保证只有真正点在背景层（而非任何子元素 / portal 子树）才触发关闭。
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="max-h-[86vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
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
                        {m.name || tt("未命名 agent")}
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

      {/* 编辑单个成员 prompt。agent_id 必存在（members 已按 agent_id 过滤）；其余字段
          用 `|| undefined` 兜底，避免把 null 传进 string|undefined 形参。 */}
      {editMember && editMember.agent_id && (
        <SkillPromptPanel
          variant="modal"
          open
          onClose={() => setEditMember(null)}
          agentId={editMember.agent_id}
          name={editMember.name || undefined}
          tagline={editMember.tagline || undefined}
          icon={editMember.icon || undefined}
          category={editMember.category || undefined}
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
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setReplaceCandidate(null);
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
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

// ============================================================================
// 对外导出：把整个弹窗包在错误边界里。
// ----------------------------------------------------------------------------
// 操作员反馈「专家团弹窗一点就退出（整页闪退）」：只要弹窗内任一处渲染抛错（脏数据、
// 缺字段…），异常会一路冒泡把整棵 React 树打崩 → 白屏。逐点加 null-guard 之外，这里
// 再兜一层 error boundary：万一还有没料到的抛出，也只是这个弹窗降级成「出错了，请关闭
// 重试」，而不是整站崩溃。open=false 时不渲染任何东西（含边界），零副作用。
// ============================================================================
export function TeamRosterModal(props: TeamRosterModalProps) {
  if (!props.open) return null;
  return (
    <RosterErrorBoundary onClose={props.onClose} accent={props.accent}>
      <TeamRosterModalInner {...props} />
    </RosterErrorBoundary>
  );
}

class RosterErrorBoundary extends Component<
  { children: ReactNode; onClose: () => void; accent?: string },
  { failed: boolean }
> {
  constructor(props: { children: ReactNode; onClose: () => void; accent?: string }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // 仅记录，便于排障；不再向上冒泡（阻断整页崩溃）。
    if (typeof console !== "undefined") {
      console.error("[TeamRosterModal] render crashed, contained by boundary:", error);
    }
  }

  render() {
    if (this.state.failed) {
      return <RosterErrorFallback onClose={this.props.onClose} accent={this.props.accent} />;
    }
    return this.props.children;
  }
}

function RosterErrorFallback({ onClose, accent = DEFAULT_ACCENT }: { onClose: () => void; accent?: string }) {
  const tt = useUI();
  return (
    <ModalShell onClose={onClose}>
      <div className="px-6 py-8 text-center">
        <p className="text-[15px] font-semibold text-stone-900">{tt("专家团加载出错了")}</p>
        <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-stone-500">
          {tt("这个专家团的数据有点问题，暂时打不开。你可以关闭后重试，或换一个专家团。")}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 rounded-lg px-4 py-1.5 text-[13px] font-medium text-white shadow-sm transition"
          style={{ background: accent }}
        >
          {tt("关闭")}
        </button>
      </div>
    </ModalShell>
  );
}

// teamId 为空时的友好空态弹窗（消费站误传 teamId="" 时不崩、不发空请求）。
function EmptyTeamModal({ onClose, accent = DEFAULT_ACCENT }: { onClose: () => void; accent?: string }) {
  const tt = useUI();
  return (
    <ModalShell onClose={onClose}>
      <div className="px-6 py-8 text-center">
        <p className="text-[15px] font-semibold text-stone-900">{tt("还没有选专家团")}</p>
        <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-stone-500">
          {tt("先在左侧选择或创建一个专家团，再来这里管理它的成员。")}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 rounded-lg px-4 py-1.5 text-[13px] font-medium text-white shadow-sm transition"
          style={{ background: accent }}
        >
          {tt("知道了")}
        </button>
      </div>
    </ModalShell>
  );
}

// 遮罩 + 居中卡片外壳（错误态 / 空态复用，与主弹窗视觉一致）。
function ModalShell({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
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
  // 只保留有效条目，且所有字段筛选都走 `|| ""` 兜底——某 agent 的 name 若为
  // null（后端未 COALESCE + 脏数据），`a.name.toLowerCase()` 会抛错、直接崩掉整页。
  const shown = agents.filter((a) => {
    if (!a || !a.agent_id) return false;
    if (!norm) return true;
    return (
      (a.name || "").toLowerCase().includes(norm) ||
      (a.tagline || "").toLowerCase().includes(norm) ||
      (a.capabilities || "").toLowerCase().includes(norm)
    );
  });
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
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
                          {a.name || tt("未命名 agent")}
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
