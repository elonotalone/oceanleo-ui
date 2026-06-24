"use client";

// ============================================================================
// @oceanleo/ui — skill prompt 开源面板（单一事实源）
// ----------------------------------------------------------------------------
// Doctrine v7（2026-06-24，操作员）：每个 skill 的 prompt 都「开源」，但入口从
// 「leo 建议」上方的一整块面板，收进**输入框里**——在「leo 建议」旁边放一个 prompt
// 小图标（<SkillPromptButton>），点开浮层即可看到 / 展开 / 编辑这段 prompt，并：
//   ① 编辑后「用这段 prompt 直接干活」：把编辑后的 prompt 作为本次会话的临时
//      system 覆盖（onUseOverride），后端 createTask 带 prompt_override，只对
//      本次会话生效，不写回 manifest。
//   ② 「保存为我的 skill」：打开共享的 CreateSkillModal，预填名字 + 当前（可能
//      编辑过的）prompt，存成用户自己的 skill。
//
// prompt 源：manifest.prompt（fetchManifest(agentId)）。这是 agent 与 skill 共用
// 的人设事实源（见 agent_engine._fn_capability_brief / _skill_brief）。manifest.prompt
// 为空时（很多功能区 agent 的人设在后端由 capabilities 合成、并不落库），退回展示
// 由 name / tagline / capabilities 合成的「身份说明」——绝不再显示「暂未填写 prompt」。
//
// 复用处：
//   - 普通 oceanleo 站功能区（FunctionAgentChat 的 skill tab，输入框里）。
//   - skill 站（agent.oceanleo.com）的对话栏。
// ============================================================================

import { useEffect, useRef, useState } from "react";
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
  /**
   * 渲染形态：
   *   - "inline"（默认）：一个 prompt 小图标按钮，点开浮层（放进输入框「leo 建议」旁）。
   *   - "panel"：一整块可折叠面板（旧版式，skill 站对话栏等仍可用）。 */
  variant?: "inline" | "panel";
}

// manifest.prompt 为空时，由身份信息合成一段「人设说明」，作为开源 prompt 的兜底。
function synthIdentity(name?: string, tagline?: string, capabilities?: string): string {
  const lines: string[] = [];
  if (name) lines.push(`你是「${name}」。`);
  if (tagline) lines.push(tagline);
  if (capabilities) lines.push(`\n你的能力：${capabilities}`);
  return lines.join("\n").trim();
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
  variant = "inline",
}: SkillPromptPanelProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  // 官方 prompt（manifest.prompt，空时退合成身份）与「正在编辑的草稿」。
  const [basePrompt, setBasePrompt] = useState(promptProp || "");
  const [draft, setDraft] = useState(promptProp || "");
  const [showSave, setShowSave] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 拉取 manifest prompt（未直接提供时）。换 agent 时重置。
  useEffect(() => {
    setOpen(false);
    setEditing(false);
    setBasePrompt(promptProp || "");
    setDraft(promptProp || "");
    // 已直接拿到 prompt（promptProp）或无 agent → 不必拉取。务必把 loading 复位，
    // 否则若上一轮（promptProp 还没到时）已 setLoading(true)，这一轮 early-return
    // 不复位就会卡在「加载 prompt…」永远转圈（操作员 2026-06-24 反馈的 bug）。
    if (!agentId || promptProp) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    void fetchManifest(agentId)
      .then((m) => {
        if (!alive) return;
        // manifest.prompt 优先；为空则用身份信息合成（绝不显示「暂未填写」）。
        const p =
          (m?.prompt || "").trim() ||
          synthIdentity(m?.name || name, m?.tagline || tagline, m?.capabilities);
        setBasePrompt(p);
        setDraft(p);
      })
      .catch(() => {
        // 拉取异常也要落地一段兜底 prompt，绝不空白。
        if (!alive) return;
        const p = synthIdentity(name, tagline);
        setBasePrompt(p);
        setDraft(p);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [agentId, promptProp, name, tagline]);

  // inline 浮层：点外面关闭。
  useEffect(() => {
    if (!open || variant !== "inline") return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, variant]);

  if (!agentId) return null;

  const dirty = draft.trim() !== basePrompt.trim();

  const body = (
    <div className="space-y-2 p-3">
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
          {basePrompt}
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
                setOpen(false);
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
  );

  const saveModal = showSave ? (
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
  ) : null;

  // ── inline 形态：输入框里的 prompt 小图标 + 上弹浮层 ──────────────────────
  if (variant === "inline") {
    return (
      <div ref={wrapRef} className="relative inline-flex">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] transition-all duration-200 active:scale-95 ${
            overrideActive
              ? "bg-violet-50 text-violet-700"
              : "text-neutral-600 hover:bg-neutral-100"
          }`}
          title="查看 / 编辑这个 skill 的 prompt（开源）"
        >
          <PromptIcon />
          prompt
          {overrideActive && (
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
          )}
        </button>

        {open && (
          <div className="absolute bottom-full left-0 z-30 mb-2 w-[min(22rem,80vw)] overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl">
            <div className="flex items-center gap-2 border-b border-stone-100 px-3 py-2 text-[12px] font-medium text-stone-700">
              <PromptIcon />
              <span className="min-w-0 flex-1 truncate">
                {name ? `${name} 的 prompt` : "skill 设定（prompt）"}
              </span>
              {overrideActive && (
                <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700">
                  已用自定义
                </span>
              )}
            </div>
            {body}
          </div>
        )}
        {saveModal}
      </div>
    );
  }

  // ── panel 形态：一整块可折叠面板（旧版式） ──────────────────────────────
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
      {open && <div className="border-t border-stone-100">{body}</div>}
      {saveModal}
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
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 shrink-0" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16M4 12h10M4 18h7" strokeLinecap="round" />
    </svg>
  );
}
