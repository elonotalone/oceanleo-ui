"use client";

// ============================================================================
// @oceanleo/ui — 子站首页两大卡片分区（单一事实源，2026-07-02，对照豆包）
// ----------------------------------------------------------------------------
//   ① HomePromptCards「工作内容」：分类 tab + prompt 卡片网格。点卡片 → 预设文字
//      填进输入框。第一张是「新建」卡片（用户自建、localStorage 持久化、重进仍在）。
//      每张卡片右上角「查看/编辑」按钮 → PromptCardModal（查看 / 编辑 / 保存 / 删除）。
//   ② HomeAgentCards「选择 agent」：agent 卡片网格（本站相关 agent + 用户自己的
//      agent）。点卡片 → 输入框左下角出现该 agent 图标+名称（再点取消）。第一张是
//      「新建 agent」卡片（复用 CreateSkillModal，存服务端，跨站可见）。右上角
//      「查看/编辑」→ 复用 SkillPromptPanel（modal 形态）。
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import {
  promptCardsForSite,
  loadCustomPromptCards,
  saveCustomPromptCards,
  type PromptCard,
} from "./home-cards";
import { listAgents, listMyAgents, type AgentDef } from "../lib/agent";
import { CreateSkillModal } from "./CreateSkillModal";
import { SkillPromptPanel } from "./SkillPromptPanel";
import { Modal } from "../ui";
import { useUI } from "../i18n/ui/useUI";

// ---------------------------------------------------------------------------
// ① 工作内容（prompt 卡片）
// ---------------------------------------------------------------------------

export function HomePromptCards({
  siteId,
  accent = "#4f46e5",
  onPick,
}: {
  siteId: string;
  accent?: string;
  /** 点卡片：把预设 prompt 填进输入框。 */
  onPick: (prompt: string) => void;
}) {
  const tt = useUI();
  const [custom, setCustom] = useState<PromptCard[]>([]);
  const [cat, setCat] = useState<string>("__all__");
  // modal 态：null=关；{card, isNew} 查看/编辑；isNew=新建。
  const [modal, setModal] = useState<{ card: PromptCard; isNew: boolean } | null>(null);

  useEffect(() => {
    setCustom(loadCustomPromptCards(siteId));
  }, [siteId]);

  const builtin = useMemo(() => promptCardsForSite(siteId), [siteId]);
  const all = useMemo(() => [...custom, ...builtin], [custom, builtin]);

  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const c of all) {
      if (c.category && !seen.includes(c.category)) seen.push(c.category);
    }
    return seen;
  }, [all]);

  const shown = cat === "__all__" ? all : all.filter((c) => c.category === cat);

  function persist(next: PromptCard[]) {
    setCustom(next);
    saveCustomPromptCards(siteId, next);
  }

  function handleSave(card: PromptCard, isNew: boolean) {
    if (isNew || !card.custom) {
      // 新建 / 编辑内置卡片 → 存成自己的卡片（内置卡片本体不可变）。
      const mine: PromptCard = {
        ...card,
        id: `custom-${Date.now()}`,
        custom: true,
        category: card.category || tt("我的"),
      };
      persist([mine, ...custom]);
    } else {
      persist(custom.map((c) => (c.id === card.id ? { ...card, custom: true } : c)));
    }
    setModal(null);
  }

  function handleDelete(card: PromptCard) {
    persist(custom.filter((c) => c.id !== card.id));
    setModal(null);
  }

  const emptyCard: PromptCard = {
    id: "",
    icon: "✨",
    title: "",
    desc: "",
    prompt: "",
    category: tt("我的"),
    custom: true,
  };

  return (
    <section className="w-full">
      {/* 分类 tab（工作内容卡片分类显示） */}
      <div className="flex flex-wrap items-center gap-1 border-b border-stone-200/70 pb-0">
        {["__all__", ...categories].map((c) => {
          const on = cat === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={`relative px-3 pb-2 pt-1 text-[13px] transition ${
                on ? "font-semibold text-stone-900" : "text-stone-500 hover:text-stone-700"
              }`}
            >
              {c === "__all__" ? tt("全部") : tt(c)}
              {on && (
                <span
                  className="absolute inset-x-2.5 -bottom-px h-[2px] rounded-full"
                  style={{ background: accent }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {/* 第一张 =「新建」卡片：用户自建，保存后重进网站仍在。 */}
        <button
          type="button"
          onClick={() => setModal({ card: emptyCard, isNew: true })}
          className="flex min-h-[86px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-stone-300 bg-white/60 px-3 py-3 text-stone-400 transition hover:border-stone-400 hover:text-stone-600"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          <span className="text-[12px] font-medium">{tt("新建卡片")}</span>
        </button>

        {shown.map((c) => (
          <div
            key={c.id}
            className="group relative flex min-h-[86px] cursor-pointer flex-col rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow"
            onClick={() => onPick(c.prompt)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter") onPick(c.prompt);
            }}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[15px] leading-none">{c.icon}</span>
              <span className="truncate text-[13px] font-semibold text-stone-800">{tt(c.title)}</span>
              {c.custom && (
                <span className="shrink-0 rounded bg-stone-100 px-1 text-[10px] text-stone-400">
                  {tt("我的")}
                </span>
              )}
            </div>
            <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-stone-500">{tt(c.desc || c.prompt)}</p>
            {/* 右上角：查看 / 编辑 该卡片 prompt 文本 */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setModal({ card: c, isNew: false });
              }}
              title={tt("查看 / 编辑")}
              aria-label={tt("查看 / 编辑")}
              className="absolute right-1.5 top-1.5 rounded-md p-1 text-stone-300 opacity-0 transition hover:bg-stone-100 hover:text-stone-600 group-hover:opacity-100"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {modal && (
        <PromptCardModal
          card={modal.card}
          isNew={modal.isNew}
          accent={accent}
          categories={categories}
          onUse={(text) => {
            onPick(text);
            setModal(null);
          }}
          onSave={(card) => handleSave(card, modal.isNew)}
          onDelete={modal.card.custom && !modal.isNew ? () => handleDelete(modal.card) : undefined}
          onClose={() => setModal(null)}
        />
      )}
    </section>
  );
}

// prompt 卡片查看/编辑弹窗（样式对齐 SkillPromptPanel 的 modal 形态）。
// 2026-07-02 起导出：playground「prompt 专区」也用它（预览 / 编辑 / 保存 / 新建）。
export function PromptCardModal({
  card,
  isNew,
  accent,
  categories,
  onUse,
  onSave,
  onDelete,
  onClose,
  useLabel,
}: {
  card: PromptCard;
  isNew: boolean;
  accent: string;
  categories: string[];
  onUse: (prompt: string) => void;
  onSave: (card: PromptCard) => void;
  onDelete?: () => void;
  onClose: () => void;
  /** 「使用」按钮文字（playground 里是「复制使用」）。 */
  useLabel?: string;
}) {
  const tt = useUI();
  const [editing, setEditing] = useState(isNew);
  const [icon, setIcon] = useState(card.icon || "✨");
  const [title, setTitle] = useState(card.title);
  const [desc, setDesc] = useState(card.desc);
  const [category, setCategory] = useState(card.category || "");
  const [prompt, setPrompt] = useState(card.prompt);
  const [err, setErr] = useState("");

  function save() {
    if (!title.trim() || !prompt.trim()) {
      setErr(tt("请填写标题与 prompt"));
      return;
    }
    onSave({
      ...card,
      icon: icon.trim() || "✨",
      title: title.trim(),
      desc: desc.trim(),
      category: category.trim() || tt("我的"),
      prompt: prompt.trim(),
    });
  }

  return (
    <Modal onClose={onClose} className="max-w-lg">
      <div className="flex flex-col">
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3.5">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-stone-900">
            <span className="text-[17px]">{icon || "✨"}</span>
            {isNew ? tt("新建 prompt 卡片") : title || tt("prompt 卡片")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={tt("关闭")}
            className="rounded-md px-2 py-1 text-[18px] leading-none text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
          >
            ×
          </button>
        </div>

        {/* 卡片本体不整体上下滚动（操作员 2026-07-03）：内容自适应高度，
            仅超长 prompt 文本自身给一个受限滚动区，卡片外壳保持不滚。 */}
        <div className="space-y-3 px-5 py-4">
          {editing ? (
            <>
              <div className="grid grid-cols-[64px_1fr] gap-2">
                <input
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="✨"
                  className="rounded-lg border border-stone-200 px-2 py-2 text-center text-[15px] outline-none focus:border-stone-400"
                />
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={tt("卡片标题（如「周报生成」）")}
                  className="rounded-lg border border-stone-200 px-3 py-2 text-[13px] outline-none focus:border-stone-400"
                />
              </div>
              <input
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder={tt("一句话描述（显示在卡片上）")}
                className="w-full rounded-lg border border-stone-200 px-3 py-2 text-[13px] outline-none focus:border-stone-400"
              />
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                list="home-prompt-cats"
                placeholder={tt("分类（如「工作」）")}
                className="w-full rounded-lg border border-stone-200 px-3 py-2 text-[13px] outline-none focus:border-stone-400"
              />
              <datalist id="home-prompt-cats">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={7}
                placeholder={tt("点击卡片时填进输入框的预设内容。可用 [占位] 提示用户替换。")}
                className="w-full resize-y rounded-lg border border-stone-200 px-3 py-2 font-mono text-[12.5px] leading-relaxed outline-none focus:border-stone-400"
              />
              {err && <p className="text-[12px] text-rose-500">{tt(err)}</p>}
            </>
          ) : (
            <>
              {desc && <p className="text-[13px] text-stone-500">{desc}</p>}
              {category && (
                <span className="inline-block rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-500">
                  {category}
                </span>
              )}
              <pre className="max-h-[46vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-stone-200 bg-stone-50/70 px-4 py-3 font-sans text-[13px] leading-relaxed text-stone-700">
                {prompt}
              </pre>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-stone-100 px-5 py-3">
          <div>
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="rounded-lg px-3 py-1.5 text-[12px] text-rose-500 transition hover:bg-rose-50"
              >
                {tt("删除卡片")}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                {!isNew && (
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="rounded-lg border border-stone-200 px-3.5 py-1.5 text-[12px] text-stone-600 transition hover:bg-stone-50"
                  >
                    {tt("取消")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={save}
                  className="rounded-lg px-3.5 py-1.5 text-[12px] font-medium text-white transition hover:opacity-90"
                  style={{ background: accent }}
                >
                  {card.custom || isNew ? tt("保存") : tt("保存为我的卡片")}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-lg border border-stone-200 px-3.5 py-1.5 text-[12px] text-stone-600 transition hover:bg-stone-50"
                >
                  {tt("编辑")}
                </button>
                <button
                  type="button"
                  onClick={() => onUse(prompt)}
                  className="rounded-lg px-3.5 py-1.5 text-[12px] font-medium text-white transition hover:opacity-90"
                  style={{ background: accent }}
                >
                  {useLabel ?? tt("使用")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// ② 选择 agent（agent 卡片）
// ---------------------------------------------------------------------------

export interface HomeAgentPick {
  agentId: string;
  name: string;
  icon?: string;
}

export function HomeAgentCards({
  siteId,
  accent = "#4f46e5",
  selected,
  onSelect,
}: {
  siteId: string;
  accent?: string;
  /** 当前选中的 agent（受控，由 HomeIntro 持有）。 */
  selected: HomeAgentPick | null;
  /** 点卡片：选中 / 再点取消。 */
  onSelect: (agent: HomeAgentPick | null) => void;
}) {
  const tt = useUI();
  const [items, setItems] = useState<AgentDef[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [viewing, setViewing] = useState<AgentDef | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      // 本站 agents + 我的 agents（跨站），合并去重。本站的排前面。
      const [site, mine] = await Promise.all([listAgents(siteId), listMyAgents()]);
      if (!alive) return;
      const seen = new Set<string>();
      const merged: AgentDef[] = [];
      for (const a of [...(site.data?.items || []), ...(mine.data?.items || [])]) {
        if (!a?.agent_id || seen.has(a.agent_id) || a.enabled === false) continue;
        seen.add(a.agent_id);
        merged.push(a);
      }
      // 本站没配置任何 agent 时，从全站 marketplace 补足几张通用卡。
      if (merged.length < 4) {
        const all = await listAgents();
        if (!alive) return;
        for (const a of all.data?.items || []) {
          if (merged.length >= 8) break;
          if (!a?.agent_id || seen.has(a.agent_id) || a.enabled === false) continue;
          seen.add(a.agent_id);
          merged.push(a);
        }
      }
      setItems(merged.slice(0, 12));
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [siteId, reloadKey]);

  return (
    <section className="w-full">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {/* 第一张 =「新建 agent」卡片（存服务端，重进网站仍在，跨站可用）。 */}
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex min-h-[86px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-stone-300 bg-white/60 px-3 py-3 text-stone-400 transition hover:border-stone-400 hover:text-stone-600"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          <span className="text-[12px] font-medium">{tt("新建 agent")}</span>
        </button>

        {!loaded &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="min-h-[86px] animate-pulse rounded-xl bg-stone-100" />
          ))}

        {items.map((a) => {
          const on = selected?.agentId === a.agent_id;
          return (
            <div
              key={a.agent_id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(on ? null : { agentId: a.agent_id, name: a.name, icon: a.icon })}
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  onSelect(on ? null : { agentId: a.agent_id, name: a.name, icon: a.icon });
              }}
              className={`group relative flex min-h-[86px] cursor-pointer flex-col rounded-xl border bg-white px-3.5 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow ${
                on ? "" : "border-stone-200 hover:border-stone-300"
              }`}
              style={on ? { borderColor: accent, boxShadow: `0 0 0 1px ${accent}` } : undefined}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[15px] leading-none">{a.icon || "🤖"}</span>
                <span className="truncate text-[13px] font-semibold text-stone-800">{a.name}</span>
                {on && (
                  <svg
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: accent }}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                  >
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-stone-500">
                {a.tagline || a.capabilities}
              </p>
              {/* 右上角：查看 / 编辑该 agent 的 prompt（复用共享 SkillPromptPanel） */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewing(a);
                }}
                title={tt("查看 / 编辑")}
                aria-label={tt("查看 / 编辑")}
                className="absolute right-1.5 top-1.5 rounded-md p-1 text-stone-300 opacity-0 transition hover:bg-stone-100 hover:text-stone-600 group-hover:opacity-100"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {showCreate && (
        <CreateSkillModal
          accent={accent}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            setReloadKey((k) => k + 1);
          }}
        />
      )}

      {viewing && (
        <SkillPromptPanel
          variant="modal"
          open
          onClose={() => setViewing(null)}
          agentId={viewing.agent_id}
          name={viewing.name}
          tagline={viewing.tagline}
          icon={viewing.icon}
          category={viewing.category}
          accent={accent}
          onSavedAsSkill={() => {
            setViewing(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </section>
  );
}
