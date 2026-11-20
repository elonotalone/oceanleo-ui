// LeoChat / session composer glyphs. Same stroke style as the task composer (`LeoComposer.tsx`): 24-unit
// view box, currentColor, round caps. Kept here so the composer does not depend on messages-surface.
import type { ReactNode } from "react";

function Glyph({ size = 16, width = 1.8, children }: { size?: number; width?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function PlusGlyph() {
  return <Glyph width={2}><path d="M12 5v14M5 12h14" /></Glyph>;
}

export function ArrowUpGlyph() {
  return <Glyph width={2}><path d="M12 19V5M5 12l7-7 7 7" /></Glyph>;
}

export function CheckGlyph() {
  return <Glyph width={2.2}><path d="M5 12.5l4.5 4.5L19 7.5" /></Glyph>;
}

export function EmojiGlyph() {
  return (
    <Glyph size={18}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
      <path d="M9 9.5h.01M15 9.5h.01" strokeWidth={2.6} />
    </Glyph>
  );
}

export function AtGlyph() {
  return (
    <Glyph size={18}>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M15.5 12v1.5a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.4 6.8" />
    </Glyph>
  );
}

export function MicGlyph() {
  return (
    <Glyph size={18}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </Glyph>
  );
}

export function CloseGlyph() {
  return <Glyph size={14} width={2}><path d="M6 6l12 12M18 6L6 18" /></Glyph>;
}

export function UploadGlyph() {
  return <Glyph><path d="M12 16V4m0 0l-4 4m4-4l4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></Glyph>;
}

export function ArtifactGlyph() {
  return (
    <Glyph>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M3.5 15l4.5-4.5 4 4 3-3 5.5 5.5" />
    </Glyph>
  );
}

export function ReplayGlyph() {
  return (
    <Glyph>
      <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" />
      <path d="M10.5 9.5v5l4-2.5z" />
    </Glyph>
  );
}

export function TaskGlyph() {
  return (
    <Glyph>
      <rect x="4" y="3.5" width="16" height="17" rx="3" />
      <path d="M8 9l1.5 1.5L12 8M8 15h8" />
    </Glyph>
  );
}

export function ChevronLeftGlyph() {
  return <Glyph><path d="M15 6l-6 6 6 6" /></Glyph>;
}

export function ChevronRightGlyph() {
  return <Glyph size={14}><path d="M9 6l6 6-6 6" /></Glyph>;
}

export function SearchGlyph() {
  return (
    <Glyph size={14}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </Glyph>
  );
}
