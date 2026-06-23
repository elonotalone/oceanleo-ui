"use client";

// ============================================================================
// @oceanleo/ui — skill prompt 开源面板（单一事实源）
// ----------------------------------------------------------------------------
// Doctrine v6（2026-06-23，操作员）：每个 skill 的 prompt 都「开源」——用户能在
// 「leo 建议」旁边看到、展开/收起、编辑这段 prompt，并且：
//   ① 编辑后「用这段 prompt 直接干活」：把编辑后的 prompt 作为本次会话的临时
//      system 覆盖（onUseOverride），后端 createTask 带 prompt_override，只对
//      本次会话生效，不写回 manifest。
//   ② 「保存为我的 skill」：打开共享的 CreateSkillModal，预填名字 + 当前（可能
//      编辑过的）prompt，存成用户自己的 skill。
//
// 复用处：
//   - 普通 oceanleo 站功能区（FunctionAgentChat 的 agent / skill tab）。
//   - skill 站（agent.oceanleo.com）的对话栏。
//
// prompt 源：manifest.prompt（fetchManifest(agentId)）。这是 agent 与 skill 共用
// 的人设事实源（见 agent_engine._fn_capability_brief / _skill_brief）。
// ============================================================================

import { useEffect, useState } from "react";
import { fetchManifest } from "../lib/manifest-fetch";
import { CreateSkillModal } from "./CreateSkillModal";

export interface SkillPromptPanelProps {
  /** 绑定的 skill / 功能区 agent id（"<site_id>.<fn_id>"）。空 → 不渲染。 */
  agentId: string;
  /** skill 名称（展示 + 预填「保存为我的 skill」）。 */
  name?: string;
  tagline?: string;
  icon?: string;
  category?: string;
  /** 直接提供 prompt（skill 站已拿到时传入，省一次拉取）。 */
  prompt?: string;
  accent?: string;
  /** 可选分类下拉（透传给 CreateSkillModal）。 */
  categories?: { id: string; label: string }[];
  /**
   * 用户点「用这段 prompt 直接干活」时回调：把编辑后的 prompt 作为本次会话覆盖。
   * 传空串表示「恢复用官方 prompt」。父组件据此在 createTask 时带 promptOverride。
   */
  onUseOverride?: (prompt: string) => void;
  /** 当前是否已应用了一段覆盖 prompt（父组件持有的状态，用于按钮态）。 */
  overrideActive?: boolean;
  /** 保存为我的 skill 成功后的回调（可用于刷新列表 / 跳转）。 */
  onSavedAsSkill?: (agentId: string) => void;
}

export function SkillPromptPanel({
  agentId,
  name,
  tagline,
  icon,
  category,
  prompt: promptProp,
  accent = "#7c3aed",
  categories = [],
  onUseOverride,
  overrideActive = false,
  onSavedAsSkill,
}: SkillPromptPanelProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  // 官方 prompt（manifest.prompt）与「正在编辑的草稿」。
  const [basePrompt, setBasePrompt] = useState(promptProp || "");
  const [draft, setDraft] = useState(promptProp || "");
  const [showSave, setShowSave] = useState(false);

  // 拉取 manifest prompt（未直接提供时）。换 agent 时重置。
  useEffect(() => {
    setOpen(false);
    setEditing(false);
    setBasePrompt(promptProp || "");
    setDraft(promptProp || "");
    if (!agentId || promptProp) return;
    let alive = true;
    setLoading(true);
    void fetchManifest(agentId).then((m) => {
      if (!alive) return;
      const p = (m?.prompt || "").trim();
      setBasePrompt(p);
      setDraft(p);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [agentId, promptProp]);

  if (!agentId) return null;

  const dirty = draft.trim() !== basePrompt.trim();

  return (
    <div className="rounded-xl border border-stone-200/80 bg-white/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-stone-600 hover:bg-stone-50"
      >
        <PromptIcon />
        <span className="min-w-0 flex-1 truncate font-medium text-stone-700">
          {name ? `${name} 的 prompt` : "skill 设定（prompt）"}
        </span>
        {overrideActive && (
          <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700">
            已用自定义
          </span>
        )}
        <span className="shrink-0 text-stone-400">{open ? "收起" : "展开"}</span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-stone-100 p-3">
          {loading ? (
            <p className="py-4 text-center text-[12px] text-stone-400">加载 prompt…</p>
          ) : editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={10}
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-[12px] leading-relaxed text-stone-700 outline-none focus:border-violet-300"
              placeholder="编辑这个 skill 的设定（人设 / 专业领域 / 回答风格 / 能力边界）…"
            />
          ) : (
            <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-stone-50 p-3 font-sans text-[12px] leading-relaxed text-stone-600">
              {basePrompt || "（这个 skill 暂未填写 prompt）"}
            </pre>
          )}

          {!loading && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {!editing ? (
                <PanelBtn onClick={() => setEditing(true)}>编辑</PanelBtn>
              ) : (
                <PanelBtn
                  onClick={() => {
                    setDraft(basePrompt);
                    setEditing(false);
                  }}
                >
                  取消编辑
                </PanelBtn>
              )}

              {onUseOverride && (
                <PanelBtn
                  primary
                  accent={accent}
                  disabled={editing && !draft.trim()}
                  onClick={() => {
                    onUseOverride(dirty ? draft.trim() : "");
                    setEditing(false);
                  }}
                  title="用当前（可能编辑过的）prompt 直接在本页面对话办事，只对本次会话生效"
                >
                  用这段 prompt 直接干活
                </PanelBtn>
              )}

              {overrideActive && onUseOverride && (
                <PanelBtn onClick={() => onUseOverride("")}>恢复官方 prompt</PanelBtn>
              )}

              <PanelBtn onClick={() => setShowSave(true)} title="把当前 prompt 存成你自己的 skill">
                保存为我的 skill
              </PanelBtn>
            </div>
          )}
        </div>
      )}

      {showSave && (
        <CreateSkillModal
          accent={accent}
          title="保存为我的 skill"
          submitLabel="保存为我的 skill"
          categories={categories}
          initial={{
            name: name ? `${name}（我的）` : "",
            tagline,
            icon,
            category,
            prompt: (dirty ? draft : basePrompt).trim(),
          }}
          onClose={() => setShowSave(false)}
          onCreated={(id) => {
            setShowSave(false);
            onSavedAsSkill?.(id);
          }}
        />
      )}
    </div>
  );
}

function PanelBtn({
  children,
  onClick,
  primary,
  accent,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  accent?: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-lg px-2.5 py-1 text-[12px] font-medium transition disabled:opacity-50 ${
        primary
          ? "text-white"
          : "border border-stone-200 text-stone-600 hover:bg-stone-100"
      }`}
      style={primary ? { background: accent || "#7c3aed" } : undefined}
    >
      {children}
    </button>
  );
}

function PromptIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 shrink-0 text-stone-400" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16M4 12h10M4 18h7" strokeLinecap="round" />
    </svg>
  );
}
