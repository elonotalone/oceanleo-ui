"use client";

// ============================================================================
// @oceanleo/ui — 创建 / 保存 skill 的统一弹窗（单一事实源）
// ----------------------------------------------------------------------------
// Doctrine v6（2026-06-23，操作员）：以下两处复用同一套 UI：
//   1. skill 站「+ 创建 skill」：从空白起手填名称 / 定位 / 分类 / prompt。
//   2. 任意 oceanleo 站 prompt 面板「保存为我的 skill」：把（可能编辑过的）
//      skill prompt 预填进来，用户改个名字 / 分类即可存成自己的 skill。
//
// 两者都调 createCustomSkill（POST /v1/agents/custom，user-owned）。本组件只管
// 表单 + 提交，成功后回调 onCreated(agent_id)；列表刷新由各消费端负责。
//
// 另含一个「创建 skill 团队」变体（CreateSkillTeamModal），供 skill 站复用。
// ============================================================================

import { useState, type ReactNode } from "react";
import { createCustomSkill, createCustomSkillTeam, type AgentDef } from "../lib/agent";

const DEFAULT_ACCENT = "#7c3aed";

export interface CreateSkillModalProps {
  /** 强调色（按钮 / 选中态）。 */
  accent?: string;
  /** 弹窗标题，默认「创建 skill」。「保存为我的 skill」时传不同标题。 */
  title?: string;
  /** 提交按钮文案，默认「创建」。 */
  submitLabel?: string;
  /** 预填字段（「保存为我的 skill」时把当前 skill 的名字/定位/prompt 带进来）。 */
  initial?: { name?: string; tagline?: string; icon?: string; category?: string; prompt?: string };
  /** 可选分类下拉（来自当前站的分类）。 */
  categories?: { id: string; label: string }[];
  onClose: () => void;
  onCreated: (agentId: string) => void;
}

export function CreateSkillModal({
  accent = DEFAULT_ACCENT,
  title = "创建 skill",
  submitLabel = "创建",
  initial,
  categories = [],
  onClose,
  onCreated,
}: CreateSkillModalProps) {
  const [name, setName] = useState(initial?.name || "");
  const [tagline, setTagline] = useState(initial?.tagline || "");
  const [icon, setIcon] = useState(initial?.icon || "");
  const [category, setCategory] = useState(initial?.category || categories[0]?.label || "我的 skill");
  const [prompt, setPrompt] = useState(initial?.prompt || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!name.trim() || !prompt.trim()) {
      setErr("请填写名称与 prompt");
      return;
    }
    setBusy(true);
    const r = await createCustomSkill({
      name: name.trim(),
      tagline: tagline.trim(),
      icon: icon.trim() || undefined,
      category,
      prompt: prompt.trim(),
    });
    setBusy(false);
    if (!r.ok || !r.data) {
      setErr(r.status === 401 ? "登录后即可保存为我的 skill。" : r.error || "创建失败");
      return;
    }
    onCreated(r.data.agent_id);
  }

  return (
    <Modal title={title} onClose={onClose}>
      <Field label="名称" value={name} onChange={setName} placeholder="例如：小红书爆款文案专家" />
      <Field label="一句话定位" value={tagline} onChange={setTagline} placeholder="它擅长什么、为谁服务" />
      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="col-span-1">
          <Field label="图标（emoji）" value={icon} onChange={setIcon} placeholder="✦" />
        </div>
        <label className="col-span-2 block text-[12px] text-stone-600">
          分类
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-[13px]"
          >
            <option value="我的 skill">我的 skill</option>
            {categories.map((c) => (
              <option key={c.id} value={c.label}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mb-4 block text-[12px] text-stone-600">
        完整设定（prompt）
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={8}
          placeholder="描述这个 skill 的人设、专业领域、回答风格、能力边界…"
          className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-[13px] leading-relaxed"
        />
      </label>
      {err && <p className="mb-2 text-[13px] text-rose-500">{err}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={submit}
        className="w-full rounded-xl py-2.5 text-[14px] font-medium text-white disabled:opacity-60"
        style={{ background: accent }}
      >
        {busy ? "保存中…" : submitLabel}
      </button>
    </Modal>
  );
}

export interface CreateSkillTeamModalProps {
  accent?: string;
  /** 候选成员（本站所有 skill）。 */
  skills: AgentDef[];
  onClose: () => void;
  onCreated: (teamId: string) => void;
}

export function CreateSkillTeamModal({
  accent = "#d97706",
  skills,
  onClose,
  onCreated,
}: CreateSkillTeamModalProps) {
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [prompt, setPrompt] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [leader, setLeader] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function toggle(id: string) {
    setPicked((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (!next.includes(leader)) setLeader(next[0] || "");
      return next;
    });
  }

  async function submit() {
    if (!name.trim() || picked.length < 2) {
      setErr("请填写团队名称并至少选 2 个 skill 成员");
      return;
    }
    setBusy(true);
    const r = await createCustomSkillTeam({
      name: name.trim(),
      tagline: tagline.trim(),
      prompt: prompt.trim(),
      member_agent_ids: picked,
      leader_agent_id: leader || picked[0],
    });
    setBusy(false);
    if (!r.ok || !r.data) {
      setErr(r.status === 401 ? "登录后即可创建 skill 团队。" : r.error || "创建失败");
      return;
    }
    onCreated(r.data.team_id);
  }

  return (
    <Modal title="创建 skill 团队" onClose={onClose}>
      <Field label="团队名称" value={name} onChange={setName} />
      <Field label="一句话定位" value={tagline} onChange={setTagline} />
      <label className="mb-2 block text-[12px] font-medium text-stone-600">选择成员（≥2）</label>
      <div className="mb-3 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-stone-200 p-2">
        {skills.map((e) => (
          <label key={e.agent_id} className="flex cursor-pointer items-center gap-2 text-[12px]">
            <input type="checkbox" checked={picked.includes(e.agent_id)} onChange={() => toggle(e.agent_id)} />
            <span>{e.icon} {e.name}</span>
          </label>
        ))}
      </div>
      {picked.length > 0 && (
        <label className="mb-3 block text-[12px] text-stone-600">
          负责人
          <select
            value={leader || picked[0]}
            onChange={(e) => setLeader(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-[13px]"
          >
            {picked.map((id) => {
              const e = skills.find((x) => x.agent_id === id);
              return (
                <option key={id} value={id}>
                  {e?.name || id}
                </option>
              );
            })}
          </select>
        </label>
      )}
      <label className="mb-4 block text-[12px] text-stone-600">
        协作规程（负责人专用，不合并成员 prompt）
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="描述负责人如何调度成员、如何向用户汇报…"
          className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-[13px]"
        />
      </label>
      {err && <p className="mb-2 text-[13px] text-rose-500">{err}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={submit}
        className="w-full rounded-xl py-2.5 text-[14px] font-medium text-white disabled:opacity-60"
        style={{ background: accent }}
      >
        {busy ? "创建中…" : "创建 skill 团队"}
      </button>
    </Modal>
  );
}

// --------------------------------------------------------------------------- //
// 共用小件
// --------------------------------------------------------------------------- //
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[16px] font-semibold text-stone-900">{title}</h3>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-stone-600">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="mb-3 block text-[12px] text-stone-600">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-[13px]"
      />
    </label>
  );
}
