import type { ReactNode } from "react";

function NavIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      className="shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const ICONS: Record<string, ReactNode> = {
  general: (
    <NavIcon>
      <path d="M2.5 4.5h11" />
      <circle cx="6.5" cy="4.5" r="1.2" fill="currentColor" stroke="none" />
      <path d="M2.5 11.5h11" />
      <circle cx="10" cy="11.5" r="1.2" fill="currentColor" stroke="none" />
    </NavIcon>
  ),
  account: (
    <NavIcon>
      <circle cx="8" cy="5.4" r="2.2" />
      <path d="M3.6 13c.6-2.4 2.2-3.6 4.4-3.6s3.8 1.2 4.4 3.6" />
    </NavIcon>
  ),
  personalization: (
    <NavIcon>
      <path d="M8 2.4 9.1 5.6 12.5 6 10 8.3l.7 3.4L8 10.1 5.3 11.7l.7-3.4L3.5 6l3.4-.4Z" />
    </NavIcon>
  ),
  billing: (
    <NavIcon>
      <path d="M2.5 11.5 5.4 8.2l2.2 2.1 5.9-6.3" />
      <path d="M10.2 4h3.3v3.2" />
    </NavIcon>
  ),
  "ai-models": (
    <NavIcon>
      <path d="M8 2.8v2.2M8 11v2.2M2.8 8h2.2M11 8h2.2" />
      <circle cx="8" cy="8" r="2.4" />
    </NavIcon>
  ),
  plugins: (
    <NavIcon>
      <path d="M6.2 3.2v2.3H4.2A1.2 1.2 0 0 0 3 6.7v2.2c0 .7.5 1.2 1.2 1.2h2v2.7c0 .7.5 1.2 1.2 1.2h1.2c.7 0 1.2-.5 1.2-1.2v-2.7h2c.7 0 1.2-.5 1.2-1.2V6.7c0-.7-.5-1.2-1.2-1.2h-2V3.2A1.2 1.2 0 0 0 8.6 2H7.4c-.7 0-1.2.5-1.2 1.2Z" />
    </NavIcon>
  ),
  mail: (
    <NavIcon>
      <rect x="2.4" y="3.6" width="11.2" height="8.8" rx="1.2" />
      <path d="M3.2 4.6 8 8.4l4.8-3.8" />
    </NavIcon>
  ),
  devices: (
    <NavIcon>
      <rect x="2.4" y="3.2" width="11.2" height="7.4" rx="1.2" />
      <path d="M6 13.2h4M8 10.6v2.6" />
    </NavIcon>
  ),
  org: (
    <NavIcon>
      <path d="M3.2 13.2V5.6L8 2.8l4.8 2.8v7.6" />
      <path d="M6.4 13.2V9.2h3.2v4" />
    </NavIcon>
  ),
  team: (
    <NavIcon>
      <path d="M3.2 13.2V5.6L8 2.8l4.8 2.8v7.6" />
      <path d="M6.4 13.2V9.2h3.2v4" />
    </NavIcon>
  ),
};

const FALLBACK = (
  <NavIcon>
    <rect x="3" y="3" width="4" height="4" rx="0.8" />
    <rect x="9" y="3" width="4" height="4" rx="0.8" />
    <rect x="3" y="9" width="4" height="4" rx="0.8" />
    <rect x="9" y="9" width="4" height="4" rx="0.8" />
  </NavIcon>
);

export function settingsNavIcon(id: string): ReactNode {
  return ICONS[id] ?? FALLBACK;
}
