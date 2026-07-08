"use client";

// ============================================================================
// @oceanleo/ui — 子站首页 prompt 卡片分区（单一事实源；宗旨 v12，2026-07-04）
// ----------------------------------------------------------------------------
//   HomePromptCards「工作内容」：分类 tab + prompt 卡片网格。点卡片 → 预设文字填进
//   输入框（并触发占位符高亮）。第一张是「添加 prompt」卡片：点它弹 AddPromptModal
//   （① 从预制库选择 ② 新建 二合一），加进来的卡用户自建、localStorage 持久化、
//   重进网站仍在。每张卡右上角「查看/编辑」→ PromptCardModal（查看/编辑/保存/删除）。
//
//   HomeAgentCards「选择 agent」保留导出（agent.oceanleo.com 等旧引用不破坏），但
//   宗旨 v12 起【首页不再渲染 agent 卡片】——HomeIntro/主站首页都不挂它。
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
import { brandColorFor, tintOf } from "../lib/brand-color";
import { Modal } from "../ui";
import { useUI } from "../i18n/ui/useUI";

// ---------------------------------------------------------------------------
// 工作内容（prompt 卡片）
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
  // 查看/编辑弹窗态：null=关；{card, isNew} 查看/编辑现有卡。
  const [modal, setModal] = useState<{ card: PromptCard; isNew: boolean } | null>(null);
  // 「添加 prompt」弹窗（预制库选择 + 新建 二合一）。
  const [adding, setAdding] = useState(false);

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

  // 保存「新建 / 从内置卡另存」为我的卡（内置卡本体不可变）；编辑我的卡则就地更新。
  function saveAsMine(card: PromptCard) {
    if (!card.custom || !card.id.startsWith("custom-")) {
      const mine: PromptCard = {
        ...card,
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        custom: true,
        category: card.category || tt("我的"),
      };
      persist([mine, ...custom]);
    } else {
      persist(custom.map((c) => (c.id === card.id ? { ...card, custom: true } : c)));
    }
  }

  function handleDelete(card: PromptCard) {
    persist(custom.filter((c) => c.id !== card.id));
    setModal(null);
  }

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
        {/* 第一张 =「添加 prompt」卡片：点它从预制库选或新建，保存后重进网站仍在。 */}
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex min-h-[86px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-stone-300 bg-white/60 px-3 py-3 text-stone-400 transition hover:border-stone-400 hover:text-stone-600"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          <span className="text-[13px] font-medium">{tt("添加 prompt")}</span>
        </button>

        {shown.map((c) => (
          <div
            key={c.id}
            className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-stone-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow"
            onClick={() => onPick(c.prompt)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter") onPick(c.prompt);
            }}
          >
            {/* 宗旨 v15：图示卡片顶部大图（AI 风格素材）；无 thumb 回退无图紧凑版。 */}
            {c.thumb && (
              <span className="relative block w-full overflow-hidden" style={{ aspectRatio: "16 / 10" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.thumb}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </span>
            )}
            {/* 宗旨 v19（操作员 2026-07-08，截图 5d5c0957）：首页 prompt 卡片文字偏小 → 标题
                text-[15px]、描述 text-[13px]（卡片尺寸不变：仍 min-h-[86px]、同 padding）。 */}
            <div className={`flex min-h-0 flex-col ${c.thumb ? "px-3 py-2.5" : "min-h-[86px] px-3.5 py-3"}`}>
              <div className="flex items-center gap-1.5">
                {!c.thumb && <span className="text-[17px] leading-none">{c.icon}</span>}
                <span className="truncate text-[15px] font-semibold text-stone-800">{tt(c.title)}</span>
                {c.custom && (
                  <span className="shrink-0 rounded bg-stone-100 px-1 text-[10px] text-stone-400">
                    {tt("我的")}
                  </span>
                )}
              </div>
              <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-stone-500">{tt(c.desc || c.prompt)}</p>
            </div>
            {/* 右上角：查看 / 编辑 该卡片 prompt 文本 */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setModal({ card: c, isNew: false });
              }}
              title={tt("查看 / 编辑")}
              aria-label={tt("查看 / 编辑")}
              className="absolute right-1.5 top-1.5 rounded-md bg-white/80 p-1 text-stone-400 opacity-0 shadow-sm backdrop-blur-sm transition hover:bg-white hover:text-stone-600 group-hover:opacity-100"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* 「添加 prompt」：从预制库选 or 新建（二合一），加进来即持久化为「我的卡」。 */}
      {adding && (
        <AddPromptModal
          accent={accent}
          presets={builtin}
          existing={custom}
          categories={categories}
          onAdd={(card) => {
            saveAsMine(card);
          }}
          onClose={() => setAdding(false)}
        />
      )}

      {/* 查看 / 编辑现有卡（点右上角笔）。 */}
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
          onSave={(card) => {
            saveAsMine(card);
            setModal(null);
          }}
          onDelete={modal.card.custom && !modal.isNew ? () => handleDelete(modal.card) : undefined}
          onClose={() => setModal(null)}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 「添加 prompt」弹窗（宗旨 v12）：① 从预制库选择 ② 新建 —— 二合一。
//   预制库 = 本站内置 + 通用兜底（promptCardsForSite）。选一条即存成「我的卡」持久化。
//   新建 = 复用 PromptCardModal 的编辑表单能力，这里内联一份精简表单。
// ---------------------------------------------------------------------------
export function AddPromptModal({
  accent,
  presets,
  existing,
  categories,
  onAdd,
  onClose,
}: {
  accent: string;
  /** 可供挑选的预制 prompt（内置库）。 */
  presets: PromptCard[];
  /** 已添加的「我的卡」（用于标注哪些已加入）。 */
  existing: PromptCard[];
  categories: string[];
  /** 选中预制 / 新建完成 → 交给调用方持久化。 */
  onAdd: (card: PromptCard) => void;
  onClose: () => void;
}) {
  const tt = useUI();
  const [tab, setTab] = useState<"library" | "new">("library");
  const [filter, setFilter] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());

  // 新建表单态。
  const [icon, setIcon] = useState("✨");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState("");
  const [prompt, setPrompt] = useState("");
  const [err, setErr] = useState("");

  const existingTitles = useMemo(
    () => new Set(existing.map((c) => `${c.title}|${c.prompt}`)),
    [existing],
  );

  // 新建时统计 [占位] 数量（去重），提示 ≤3。
  const fieldCount = useMemo(() => {
    const m = prompt.match(/\[[^\]\n]+\]/g);
    return m ? new Set(m).size : 0;
  }, [prompt]);

  const norm = filter.trim().toLowerCase();
  const shownPresets = useMemo(
    () =>
      presets.filter((c) => {
        if (!norm) return true;
        return (
          c.title.toLowerCase().includes(norm) ||
          (c.desc || "").toLowerCase().includes(norm) ||
          c.prompt.toLowerCase().includes(norm)
        );
      }),
    [presets, norm],
  );

  function addPreset(c: PromptCard) {
    onAdd({ ...c });
    setAdded((s) => new Set(s).add(c.id));
  }

  function createNew() {
    if (!title.trim() || !prompt.trim()) {
      setErr(tt("请填写标题与 prompt"));
      return;
    }
    onAdd({
      id: "",
      icon: icon.trim() || "✨",
      title: title.trim(),
      desc: desc.trim(),
      category: category.trim() || tt("我的"),
      prompt: prompt.trim(),
      custom: true,
    });
    onClose();
  }

  return (
    <Modal onClose={onClose} className="max-w-2xl">
      <div className="flex max-h-[80vh] flex-col">
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3.5">
          <h3 className="text-[15px] font-semibold text-stone-900">{tt("添加 prompt")}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={tt("关闭")}
            className="rounded-md px-2 py-1 text-[18px] leading-none text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
          >
            ×
          </button>
        </div>

        {/* 两页签：从预制库选择 | 新建 */}
        <div className="flex gap-1 px-5 pt-3">
          {([
            ["library", tt("从预制库选择")],
            ["new", tt("新建")],
          ] as const).map(([id, label]) => {
            const on = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition ${
                  on ? "text-white shadow-sm" : "text-stone-600 hover:bg-stone-100"
                }`}
                style={on ? { background: accent } : undefined}
              >
                {label}
              </button>
            );
          })}
        </div>

        {tab === "library" ? (
          <div className="flex min-h-0 flex-1 flex-col px-5 py-3">
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-stone-200/90 bg-white/80 px-3 py-1.5">
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0 text-stone-400">
                <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
                <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={tt("搜索预制 prompt…")}
                className="w-full bg-transparent text-[13px] text-stone-800 outline-none placeholder:text-stone-400"
              />
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              {shownPresets.map((c) => {
                const already = added.has(c.id) || existingTitles.has(`${c.title}|${c.prompt}`);
                const cColor = brandColorFor(c.id || c.title);
                return (
                  <div
                    key={c.id}
                    className="flex items-start gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-left shadow-sm"
                  >
                    <span
                      className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[14px]"
                      style={{ background: tintOf(cColor, 0.14), color: cColor }}
                    >
                      {c.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-stone-800">{tt(c.title)}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-stone-500">
                        {tt(c.desc || c.prompt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={already}
                      onClick={() => addPreset(c)}
                      className={`mt-0.5 shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-medium transition ${
                        already
                          ? "cursor-default bg-stone-100 text-stone-400"
                          : "text-white hover:opacity-90"
                      }`}
                      style={already ? undefined : { background: accent }}
                    >
                      {already ? tt("已添加") : tt("添加")}
                    </button>
                  </div>
                );
              })}
              {shownPresets.length === 0 && (
                <p className="col-span-full py-10 text-center text-[13px] text-stone-400">
                  {tt("没有匹配的 prompt。")}
                </p>
              )}
            </div>
            <p className="mt-3 text-[11.5px] text-stone-400">
              {tt("添加后会成为你的卡片，重新打开网站仍在；也会显示在 oceanleo.com/playground。")}
            </p>
          </div>
        ) : (
          <div className="space-y-3 px-5 py-4">
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
              list="add-prompt-cats"
              placeholder={tt("分类（如「工作」）")}
              className="w-full rounded-lg border border-stone-200 px-3 py-2 text-[13px] outline-none focus:border-stone-400"
            />
            <datalist id="add-prompt-cats">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={6}
              placeholder={tt("点击卡片时填进输入框的预设内容。可用 [占位] 提示用户替换。")}
              className="w-full resize-y rounded-lg border border-stone-200 px-3 py-2 font-mono text-[12.5px] leading-relaxed outline-none focus:border-stone-400"
            />
            <p className={`text-[11.5px] ${fieldCount > 3 ? "text-amber-600" : "text-stone-400"}`}>
              {tt("用 [方括号] 标出让用户替换的字段，如 [职业]；建议不超过 3 个。")}
              {fieldCount > 0 && `（${tt("当前")} ${fieldCount}）`}
            </p>
            {err && <p className="text-[12px] text-rose-500">{tt(err)}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-stone-200 px-3.5 py-1.5 text-[12px] text-stone-600 transition hover:bg-stone-50"
              >
                {tt("取消")}
              </button>
              <button
                type="button"
                onClick={createNew}
                className="rounded-lg px-3.5 py-1.5 text-[12px] font-medium text-white transition hover:opacity-90"
                style={{ background: accent }}
              >
                {tt("保存")}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
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
