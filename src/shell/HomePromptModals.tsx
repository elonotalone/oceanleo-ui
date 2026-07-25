"use client";

// ============================================================================
// @oceanleo/ui — 首页 prompt 卡片的两个弹窗（2026-07-25 从 HomeCards.tsx 拆出）
// ----------------------------------------------------------------------------
// 拆分原因：HomeCards.tsx 曾 832 行，超工作区 800 行硬顶。首页卡片本体（网格 + tab）、
// 两个弹窗、agent 卡片三块彼此独立，按职责各占一个文件（每个 ≤600 行）。
//   - AddPromptModal   ：「添加 prompt」= ① 从预制库选择 ② 新建（二合一）
//   - PromptCardModal  ：查看 / 编辑 / 保存 / 删除 单张 prompt 卡
// 两者同时服务「prompt 卡片首页」（HomePromptCards / HomeAppCards）与 playground
// 的 prompt 专区，故是共享组件而非某个网格的私有实现。
// ============================================================================

import { useMemo, useState } from "react";
import { type PromptCard } from "./home-cards";
import { brandColorFor, tintOf } from "../lib/brand-color";
import { Modal } from "../ui";
import { useUI } from "../i18n/ui/useUI";

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
