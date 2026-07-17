"use client";

export function WorkbenchRouteLoading() {
  return (
    <div
      role="status"
      aria-label="正在加载编辑器"
      aria-live="polite"
      className="grid h-full min-h-[18rem] w-full place-items-center bg-[var(--surface,#f5f5f4)]"
    >
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[var(--border,#e7e5e4)] border-t-[var(--accent,#7c3aed)]" />
        <p className="mt-3 text-[12px] text-[var(--muted,#78716c)]">正在加载编辑器…</p>
      </div>
    </div>
  );
}
