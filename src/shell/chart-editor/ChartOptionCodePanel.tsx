"use client";

/**
 * L3：option JSON 代码面板。只在专业模式由 ChartNextStage 挂上。
 * 不用新的代码编辑器依赖，textarea + 校验足够让人改 option 并立刻看到预览。
 */
export function ChartOptionCodePanel({
  value,
  error,
  notices,
  onChange,
  onApply,
}: {
  value: string;
  error: string;
  notices: string[];
  onChange: (next: string) => void;
  onApply: () => void;
}) {
  return (
    <aside
      data-chart-option-code=""
      className="flex h-full min-h-[280px] w-full max-w-md shrink-0 flex-col border-l border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)]"
    >
      <header className="flex items-center justify-between gap-2 border-b border-[var(--border,#e7e5e4)] px-3 py-2">
        <p className="text-xs font-semibold text-[var(--fg,#292524)]">
          option JSON
        </p>
        <button
          type="button"
          onClick={onApply}
          className="rounded-lg border border-[var(--border,#e7e5e4)] px-2 py-1 text-[11px] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))]"
        >
          应用到图表
        </button>
      </header>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        aria-label="ECharts option JSON"
        className="min-h-0 flex-1 resize-none bg-[var(--card,#fff)] p-3 font-mono text-[11px] leading-relaxed text-[var(--fg,#292524)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))]/45"
      />
      {error ? (
        <p role="alert" className="px-3 py-2 text-[11px] text-[var(--awb-danger,#be123c)]">
          {error}
        </p>
      ) : null}
      {notices.length ? (
        <ul className="space-y-1 px-3 py-2 text-[11px] text-[var(--awb-muted,#57534e)]">
          {notices.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}
