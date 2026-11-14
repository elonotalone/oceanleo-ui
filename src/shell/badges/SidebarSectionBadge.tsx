"use client";

/** Numeric copy needs no locale-specific words; the parent supplies the section label. */
export function SidebarSectionBadge({ count, rail = false }: { count: number; rail?: boolean }) {
  if (!Number.isFinite(count) || count <= 0) return null;
  return <span data-section-badge={count} style={{
    display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    minWidth: 18, height: 18, padding: "0 4px", borderRadius: 9999,
    backgroundColor: "#e11d48", color: "white", fontSize: 10, lineHeight: "18px", fontWeight: 600,
    ...(rail ? { position: "absolute", top: 0, right: 0 } as const : {}),
  }}>{count > 99 ? "99+" : Math.floor(count)}</span>;
}
