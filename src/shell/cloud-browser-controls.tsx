"use client";

export function BrowserGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="2.5" y="4" width="19" height="16" rx="2.5" />
      <path d="M3 8h18M6 6h.01M9 6h.01" strokeLinecap="round" />
      <path d="M8 13h8M10 16h4" strokeLinecap="round" />
    </svg>
  );
}
