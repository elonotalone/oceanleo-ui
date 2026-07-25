"use client";

// ============================================================================
// @oceanleo/ui — 子站首页 prompt 卡片分区（单一事实源；宗旨 v12，2026-07-04）
// ----------------------------------------------------------------------------
//   HomePromptCards「工作内容」：分类 tab + prompt 卡片网格。点卡片 → 预设文字填进
//   输入框（并触发占位符高亮）。第一张是「添加 prompt」卡片：点它弹 AddPromptModal
//   （① 从预制库选择 ② 新建 二合一），加进来的卡用户自建、localStorage 持久化、
//   重进网站仍在。每张卡右上角「查看/编辑」→ PromptCardModal（查看/编辑/保存/删除）。
//
// 2026-07-25 拆分（800 行硬顶）：两个弹窗移到 `HomePromptModals.tsx`，agent 卡片移到
// `HomeAgentCards.tsx`；本文件只留 prompt 卡片网格，并按原名 re-export 两者，旧
// import（`./HomeCards`）零改动。
//
// 2026-07-25（合同 §0）：站点传 `apps` 时首页改渲染 `HomeAppCards`（一卡 = 一个
// GoalApp）；本组件是【未迁移站】的既有路径，30 站分批迁移期间两条路径并存。
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import {
  promptCardsForSite,
  loadCustomPromptCards,
  saveCustomPromptCards,
  type PromptCard,
} from "./home-cards";
import { AddPromptModal, PromptCardModal } from "./HomePromptModals";
import { useUI } from "../i18n/ui/useUI";

export { AddPromptModal, PromptCardModal } from "./HomePromptModals";
export { HomeAgentCards } from "./HomeAgentCards";
export type { HomeAgentPick } from "./HomeAgentCards";

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
