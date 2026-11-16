"use client";

import { useMemo, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import { EDITOR_FONT_OPTIONS, EDITOR_FONT_WEIGHTS, loadEditorTextFonts } from "./image-editor/editor-fonts";

export interface AdvancedFontOption {
  family: string;
  label: string;
  category: "推荐" | "中文" | "经典" | "手写";
  preview: string;
}

export const ADVANCED_EDITOR_FONTS: readonly AdvancedFontOption[] = EDITOR_FONT_OPTIONS;

export function AdvancedFontPicker({
  selectedFamily,
  selectedWeight = 400,
  text,
  onWeightSelect,
  disabled = false,
  onSelect,
}: {
  selectedFamily?: string;
  selectedWeight?: number;
  text?: string;
  onWeightSelect?: (weight: number) => void;
  disabled?: boolean;
  onSelect: (family: string) => void;
}) {
  const tt = useUI();
  const [query, setQuery] = useState("");
  const [fontError, setFontError] = useState("");
  const [loadingFont, setLoadingFont] = useState(false);
  const fonts = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle
      ? ADVANCED_EDITOR_FONTS.filter((font) =>
          `${font.label} ${font.category} ${font.preview}`
            .toLocaleLowerCase()
            .includes(needle),
        )
      : ADVANCED_EDITOR_FONTS;
  }, [query]);

  return (
    <section className="bg-[var(--card,#fff)] px-3 py-4">
      <div className="px-1">
        <h3 className="text-[15px] font-semibold tracking-tight text-[var(--fg,#1e293b)]">
          {tt("字体")}
        </h3>
        <p className="mt-1 text-[11px] leading-5 text-[var(--muted,#64748b)]">
          {tt("选择字体后立即应用到当前文字。")}
        </p>
      </div>
      <label className="mt-3 flex h-10 items-center gap-2 rounded-xl border border-[var(--border,#dfe3ea)] bg-[var(--surface,#f8fafc)] px-3 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] focus-within:border-[var(--awb-accent,#7c3aed)] focus-within:bg-[var(--card,#fff)] focus-within:ring-2 focus-within:ring-[var(--awb-accent,#7c3aed)]/10">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="h-4 w-4 shrink-0 text-[var(--muted,#94a3b8)]"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m16 16 5 5" />
        </svg>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={tt("搜索字体")}
          className="min-w-0 flex-1 border-0 bg-transparent text-[12px] text-[var(--fg,#1e293b)] outline-none placeholder:text-[var(--muted,#94a3b8)] focus-visible:ring-2 focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))]/45"
        />
      </label>
      {onWeightSelect && <label className="mt-3 flex items-center gap-2 text-[12px]">
        {tt("字重")}
        <select aria-label={tt("字重")} value={selectedWeight} disabled={disabled || loadingFont}
          onChange={async event => {
            const weight = Number(event.target.value);
            setLoadingFont(true); setFontError("");
            try { await loadEditorTextFonts([{ text: text || tt(EDITOR_FONT_OPTIONS[0].preview), fontFamily: selectedFamily, fontWeight: weight }]); }
            catch { setFontError("字体加载失败，请检查网络后重试。"); }
            finally { onWeightSelect(weight); setLoadingFont(false); }
          }}>
          {EDITOR_FONT_WEIGHTS.map(weight => <option key={weight} value={weight}>{weight}</option>)}
        </select>
      </label>}
      {fontError && <p role="alert">{tt(fontError)}</p>}
      <div className="mt-4 space-y-1">
        {fonts.map((font) => {
          const active =
            selectedFamily === font.family ||
            Boolean(
              selectedFamily &&
                font.family
                  .split(",")[0]
                  .trim()
                  .replaceAll("\"", "") ===
                  selectedFamily.split(",")[0]?.trim().replaceAll("\"", ""),
            );
          return (
            <button
              key={font.family}
              type="button"
              disabled={disabled || loadingFont}
              onClick={async () => {
                setLoadingFont(true); setFontError("");
                try {
                  await loadEditorTextFonts([{ text: text || tt(font.preview), fontFamily: font.family, fontWeight: selectedWeight }]);
                } catch { setFontError("字体加载失败，请检查网络后重试。"); }
                finally { onSelect(font.family); setLoadingFont(false); }
              }}
              className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] disabled:opacity-40 ${
 active
 ? "bg-[color-mix(in_srgb,var(--awb-accent,#7c3aed)_10%,transparent)]"
 : "hover:bg-[var(--surface-hover,#f1f5f9)]"
 }`}
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <strong className="truncate text-[12px] font-semibold text-[var(--fg,#1e293b)]">
                    {tt(font.label)}
                  </strong>
                  <small className="rounded-full bg-[var(--surface,#f1f5f9)] px-1.5 py-0.5 text-[8px] font-medium text-[var(--muted,#64748b)]">
                    {tt(font.category)}
                  </small>
                </span>
                <span
                  className="mt-1 block truncate text-[17px] leading-6 text-[var(--fg-2,#334155)]"
                  style={{ fontFamily: font.family }}
                >
                  {tt(font.preview)}
                </span>
              </span>
              {active && (
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--awb-accent,#7c3aed)] text-[11px] font-bold text-[var(--awb-on-accent,#fff)]">
                  ✓
                </span>
              )}
            </button>
          );
        })}
        {!fonts.length && (
          <p className="rounded-xl border border-dashed border-[var(--border,#dfe3ea)] px-3 py-8 text-center text-[11px] text-[var(--muted,#64748b)]">
            {tt("没有找到匹配字体")}
          </p>
        )}
      </div>
    </section>
  );
}
