// Bay 外壳用到的图标。类目图标的键跟着网关目录走（`talent_categories.icon`），认不出回落成 dots。
import type { ReactNode } from "react";

const stroke = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** Bay 的标志：海湾里的一面帆。 */
export function BayIcon({ className = "h-5 w-5", strokeWidth = 2 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg {...stroke} strokeWidth={strokeWidth} className={className}>
      <path d="M12 3.5v10.5" />
      <path d="M12 4.5 18 13h-6" />
      <path d="M12 6.5 7.5 13H12" />
      <path d="M3 17c1.5 0 2.25-1.2 4.5-1.2S10.5 17 12 17s2.25-1.2 4.5-1.2S19.5 17 21 17" />
      <path d="M5.5 20.5c1.2 0 1.8-.9 3.25-.9s2.05.9 3.25.9 1.8-.9 3.25-.9 2.05.9 3.25.9" />
    </svg>
  );
}

/** 叫真人：一个人加一个举手的气泡。 */
export function CallHumanIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg {...stroke} strokeWidth={1.8} className={className}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5c.6-3.3 2.9-5 5.5-5s4.9 1.7 5.5 5" />
      <path d="M16.5 4.5h3.5a1.5 1.5 0 0 1 1.5 1.5v2.5a1.5 1.5 0 0 1-1.5 1.5h-1.2l-1.8 1.5V10h-.5A1.5 1.5 0 0 1 15 8.5V6a1.5 1.5 0 0 1 1.5-1.5Z" />
    </svg>
  );
}

export function BayGlyph({ name, className = "h-4 w-4" }: { name: "plus" | "search" | "back" | "mine" | "close" | "expand" | "service"; className?: string }) {
  const paths: Record<typeof name, ReactNode> = {
    plus: <path d="M12 5v14M5 12h14" />,
    search: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M20 20l-4.2-4.2" />
      </>
    ),
    back: <path d="M15 18l-6-6 6-6" />,
    mine: (
      <>
        <rect x="3.5" y="7" width="17" height="12.5" rx="2" />
        <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17" />
      </>
    ),
    close: <path d="M6 6l12 12M18 6 6 18" />,
    expand: <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />,
    service: (
      <>
        <path d="M4 9.5 12 4l8 5.5v9A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5z" />
        <path d="M9.5 20v-5.5h5V20" />
      </>
    ),
  };
  return (
    <svg {...stroke} strokeWidth={2} className={className}>
      {paths[name]}
    </svg>
  );
}

const CATEGORY_PATHS: Record<string, ReactNode> = {
  palette: (
    <>
      <path d="M12 3a9 9 0 100 18h1.2a1.8 1.8 0 001.4-3l-.4-.5a1.8 1.8 0 011.4-3h2.1A3.3 3.3 0 0021 11.2 8.2 8.2 0 0012 3z" />
      <circle cx="7.5" cy="11" r="1" />
      <circle cx="10" cy="7.5" r="1" />
      <circle cx="14.2" cy="7.2" r="1" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="M4 16l4.5-4 3.5 3.5L15.5 12l4.5 4.5" />
    </>
  ),
  film: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 5v14M17 5v14M3 9h4M17 9h4M3 15h4M17 15h4" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="16" cy="16" r="3" />
    </>
  ),
  "file-text": (
    <>
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </>
  ),
  pen: (
    <>
      <path d="M5 19l1-4L16.8 4.2a2 2 0 012.8 2.8L8.8 17.8 5 19z" />
      <path d="M14.8 6.2l3 3M5 19h6" />
    </>
  ),
  "id-card": (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M5.8 16c.6-1.5 1.8-2.2 3.2-2.2s2.6.7 3.2 2.2M15 10h4M15 13.5h3" />
    </>
  ),
  layout: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M9 9v11" />
    </>
  ),
  code: <path d="M8.5 8L5 12l3.5 4M15.5 8l3.5 4-3.5 4M13.5 5l-3 14" />,
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7.5" ry="3" />
      <path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" />
    </>
  ),
  cube: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
    </>
  ),
  gamepad: (
    <>
      <rect x="2.5" y="7" width="19" height="10" rx="4" />
      <path d="M7 10.5v3M5.5 12h3M15.5 11.2h.01M18 13.2h.01" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
      <path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0014 0M12 18v3M9 21h6" />
    </>
  ),
  map: (
    <>
      <path d="M9 4L3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  dots: (
    <>
      <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
};

export function BayCategoryIcon({ name, className = "h-5 w-5" }: { name: string | null | undefined; className?: string }) {
  return (
    <svg {...stroke} strokeWidth={1.6} className={className}>
      {(name && CATEGORY_PATHS[name]) || CATEGORY_PATHS.dots}
    </svg>
  );
}
