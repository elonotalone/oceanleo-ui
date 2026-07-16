"use client";

import { useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import type { DeckEditorState } from "./use-deck-editor";

const inputClass =
  "w-full rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-3 py-2 text-[11px] text-[var(--fg,#292524)] outline-none focus:border-[var(--accent,#7c3aed)]";

const FONTS = [
  { family: "Aptos", label: "Aptos", category: "现代" },
  { family: "Arial", label: "Arial", category: "无衬线" },
  { family: "Georgia", label: "Georgia", category: "衬线" },
  { family: "Noto Sans SC", label: "思源黑体", category: "中文" },
  { family: "Noto Serif SC", label: "思源宋体", category: "中文" },
  { family: "Microsoft YaHei", label: "微软雅黑", category: "中文" },
  { family: "PingFang SC", label: "苹方", category: "中文" },
] as const;

export function DeckFontPanel({ editor }: { editor: DeckEditorState }) {
  const tt = useUI();
  const [query, setQuery] = useState("");
  const selected = editor.selectedElement;
  const fonts = FONTS.filter((font) =>
    `${font.family} ${font.label} ${font.category}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <section className="min-h-full bg-[var(--card,#fff)] p-4">
      <h3 className="text-[12px] font-semibold text-[var(--fg,#292524)]">
        {tt("字体")}
      </h3>
      <p className="mb-3 mt-1 text-[10px] leading-4 text-[var(--muted,#78716c)]">
        {tt("字体面板只在顶部对象属性栏点击字体时打开。")}
      </p>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={tt("搜索字体")}
        className={inputClass}
      />
      <div className="mt-3 space-y-1.5">
        {fonts.map((font) => {
          const active = selected?.fontFamily === font.family;
          return (
            <button
              key={font.family}
              type="button"
              disabled={!selected || selected.type !== "text"}
              onClick={() =>
                selected &&
                editor.patchElement(selected.id, { fontFamily: font.family })
              }
              className="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:-translate-y-0.5 hover:shadow-sm disabled:opacity-40"
              style={
                active
                  ? {
                      borderColor: "var(--accent,#7c3aed)",
                      background:
                        "color-mix(in srgb,var(--accent,#7c3aed) 9%,transparent)",
                    }
                  : { borderColor: "var(--border,#e7e5e4)" }
              }
            >
              <span
                className="min-w-0 flex-1 truncate text-[18px] text-[var(--fg,#292524)]"
                style={{ fontFamily: font.family }}
              >
                {font.label}
              </span>
              <span className="text-[9px] text-[var(--muted,#78716c)]">
                {tt(font.category)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
