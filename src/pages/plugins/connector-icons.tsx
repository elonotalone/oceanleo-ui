"use client";

import type { ReactNode, SVGProps } from "react";

const LETTER_COLORS = [
  "#4f46e5",
  "#0f766e",
  "#b45309",
  "#be123c",
  "#1d4ed8",
  "#7c3aed",
  "#0369a1",
  "#15803d",
  "#c2410c",
  "#4338ca",
];

/** `icon` 现在是连接器 id slug（github、feishu…），不是 emoji。 */
export function isConnectorIconSlug(value: string | undefined | null): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test((value || "").trim());
}

export function letterFromLabel(label: string): string {
  const ch = [...label.trim()][0];
  return (ch || "?").toUpperCase();
}

function letterColor(key: string): string {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return LETTER_COLORS[h % LETTER_COLORS.length];
}

export function resolveConnectorSlug(icon?: string, id?: string): string {
  const a = (icon || "").trim();
  if (isConnectorIconSlug(a)) return a.toLowerCase();
  const b = (id || "").trim();
  if (isConnectorIconSlug(b)) return b.toLowerCase();
  return "";
}

function Mark({
  className,
  children,
  viewBox = "0 0 24 24",
}: {
  className?: string;
  children: ReactNode;
  viewBox?: string;
}) {
  return (
    <svg viewBox={viewBox} className={className} aria-hidden>
      {children}
    </svg>
  );
}

const BRANDS: Record<string, (props: SVGProps<SVGSVGElement>) => ReactNode> = {
  github: ({ className }) => (
    <Mark className={className}>
      <path
        fill="#181717"
        d="M12 2C6.48 2 2 6.58 2 12.26c0 4.52 2.87 8.36 6.84 9.72.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.9-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.27 2.75 1.05A9.3 9.3 0 0 1 12 6.84c.85 0 1.71.12 2.51.34 1.9-1.32 2.74-1.05 2.74-1.05.56 1.4.21 2.44.1 2.7.65.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.58 5.06.36.32.68.95.68 1.92 0 1.38-.01 2.49-.01 2.83 0 .27.18.6.69.49A10.03 10.03 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z"
      />
    </Mark>
  ),
  slack: ({ className }) => (
    <Mark className={className}>
      <path fill="#E01E5A" d="M8.1 12.8a1.6 1.6 0 1 1-1.6-1.6h1.6v1.6Zm.8 0a1.6 1.6 0 1 1 3.2 0v4a1.6 1.6 0 1 1-3.2 0v-4Z" />
      <path fill="#36C5F0" d="M11.2 8.1a1.6 1.6 0 1 1 1.6-1.6v1.6h-1.6Zm0 .8a1.6 1.6 0 1 1 0 3.2h-4a1.6 1.6 0 1 1 0-3.2h4Z" />
      <path fill="#2EB67D" d="M15.9 11.2a1.6 1.6 0 1 1 1.6 1.6h-1.6v-1.6Zm-.8 0a1.6 1.6 0 1 1-3.2 0v-4a1.6 1.6 0 1 1 3.2 0v4Z" />
      <path fill="#ECB22E" d="M12.8 15.9a1.6 1.6 0 1 1-1.6 1.6v-1.6h1.6Zm0-.8a1.6 1.6 0 1 1 0-3.2h4a1.6 1.6 0 1 1 0 3.2h-4Z" />
    </Mark>
  ),
  gmail: ({ className }) => (
    <Mark className={className}>
      <path fill="#EA4335" d="M3 6.8 12 13l9-6.2V18H3V6.8Z" />
      <path fill="#FBBC05" d="M3 6.8 12 13 3 18V6.8Z" />
      <path fill="#34A853" d="M21 6.8 12 13l9 5.2V6.8Z" />
      <path fill="#C5221F" d="M3 6.8 12 4l9 2.8-9 6.2-9-6.2Z" />
    </Mark>
  ),
  notion: ({ className }) => (
    <Mark className={className}>
      <path
        fill="#000"
        d="M6.2 4.5h9.3c.8 0 1.4.3 2 .9l1.3 1.4v12.2c0 .6-.5 1.1-1.1 1.1H8.4c-.8 0-1.4-.3-2-.9L5.2 18V5.6c0-.6.5-1.1 1-1.1Zm1.6 2.3v10.4l1.3.9h7.2V7.2l-1.2-.9H7.8Zm2.1 1.5h1.3v7.3l2.6-7.3h1.4l-2.8 7.6c-.3.7-.8 1-1.5 1H9.9V8.3Z"
      />
    </Mark>
  ),
  "google-calendar": ({ className }) => (
    <Mark className={className}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" fill="#fff" stroke="#1A73E8" strokeWidth="1.6" />
      <path fill="#1A73E8" d="M3.5 5h17v4.2H3.5z" />
      <text x="12" y="16.2" textAnchor="middle" fontSize="8" fontWeight="700" fill="#1A73E8">
        31
      </text>
    </Mark>
  ),
  "google-drive": ({ className }) => (
    <Mark className={className}>
      <path fill="#0066DA" d="m8.1 16.8 3.9-6.8 3.9 6.8H8.1Z" />
      <path fill="#00AC47" d="M4 16.8 12 3.2l3.9 6.8L8.1 16.8H4Z" />
      <path fill="#EA4335" d="m16 16.8-4-6.8 3.9-6.8L20 16.8h-4Z" />
    </Mark>
  ),
  stripe: ({ className }) => (
    <Mark className={className}>
      <rect width="24" height="24" rx="5" fill="#635BFF" />
      <path
        fill="#fff"
        d="M12.7 9.1c-.7-.3-1.1-.5-1.1-.8 0-.3.3-.5.8-.5.9 0 1.8.4 2.4.8l.7-1.8A5.6 5.6 0 0 0 12.3 6c-2.2 0-3.7 1.2-3.7 3 0 2 1.8 2.7 3 3.2.8.3 1.1.6 1.1.9 0 .4-.5.7-1.2.7-1 0-2.1-.5-2.8-1l-.8 1.8c.9.6 2.1 1 3.6 1 2.4 0 3.9-1.2 3.9-3.1 0-2.2-1.9-2.8-3-3.2Z"
      />
    </Mark>
  ),
  figma: ({ className }) => (
    <Mark className={className}>
      <circle cx="9" cy="6.5" r="3" fill="#F24E1E" />
      <circle cx="15" cy="6.5" r="3" fill="#FF7262" />
      <circle cx="9" cy="12" r="3" fill="#A259FF" />
      <circle cx="15" cy="12" r="3" fill="#1ABCFE" />
      <circle cx="9" cy="17.5" r="3" fill="#0ACF83" />
    </Mark>
  ),
  linear: ({ className }) => (
    <Mark className={className}>
      <rect width="24" height="24" rx="5" fill="#5E6AD2" />
      <path fill="#fff" d="M7 16.5 16.5 7H18v1.5L8.5 18H7v-1.5Z" />
    </Mark>
  ),
  sentry: ({ className }) => (
    <Mark className={className}>
      <path
        fill="#362D59"
        d="M12.2 4.2 20 18.4H4.3L12.2 4.2Zm0 3.3L7.1 16.6h10.1L12.2 7.5Z"
      />
    </Mark>
  ),
  vercel: ({ className }) => (
    <Mark className={className}>
      <path fill="#000" d="M12 4 21 20H3L12 4Z" />
    </Mark>
  ),
  cloudflare: ({ className }) => (
    <Mark className={className}>
      <path fill="#F38020" d="M6.2 15.4h12.1c.9 0 1.6-.7 1.6-1.5 0-.7-.5-1.3-1.2-1.5l-2.2-.5-.8-2.3A3.2 3.2 0 0 0 12.6 7a3.3 3.3 0 0 0-3.2 2.6l-.2.8-1.4.2A2.6 2.6 0 0 0 5 13.2c0 1.2 1 2.2 2.2 2.2h-.1Z" />
      <path fill="#FAAE40" d="M8.4 15.4h11.5a1.8 1.8 0 0 0 0-3.5l-1.5-.3-.4 1.1H8.4v2.7Z" />
    </Mark>
  ),
  supabase: ({ className }) => (
    <Mark className={className}>
      <path fill="#3ECF8E" d="M13.6 3.2v10.2H21L13.6 3.2ZM10.4 20.8V10.6H3l7.4 10.2Z" />
    </Mark>
  ),
  gitlab: ({ className }) => (
    <Mark className={className}>
      <path fill="#E24329" d="M12 20.2 8.7 10.2h6.6L12 20.2Z" />
      <path fill="#FC6D26" d="M12 20.2 8.7 10.2 6.2 17.3a.5.5 0 0 0 .2.6L12 20.2Zm0 0 3.3-10 2.5 7.1a.5.5 0 0 1-.2.6L12 20.2Z" />
      <path fill="#FCA326" d="M4.2 10.2H8.7L6.2 17.3 4 11a.5.5 0 0 1 .2-.8Zm15.6 0H15.3l2.5 7.1 2.2-6.3a.5.5 0 0 0-.2-.8Z" />
    </Mark>
  ),
  openai: ({ className }) => (
    <Mark className={className}>
      <path
        fill="#10A37F"
        d="M11.2 3.2c1.2-.7 2.7-.7 3.9 0l3.4 2c1.2.7 2 2 2 3.4v3.9c0 1.4-.8 2.7-2 3.4l-3.4 2c-1.2.7-2.7.7-3.9 0l-3.4-2c-1.2-.7-2-2-2-3.4V8.6c0-1.4.8-2.7 2-3.4l3.4-2Zm.8 4.3v4.3l3.7 2.1.9-1.5-2.8-1.6V7.5l-1.8 0Z"
      />
    </Mark>
  ),
  anthropic: ({ className }) => (
    <Mark className={className}>
      <path fill="#D4A27F" d="M13.8 5h2.6L20 19h-2.5l-.8-2.6H11.7L10.9 19H8.4L13.8 5Zm.1 4.2-1.6 5.2h3.3l-1.7-5.2ZM4 19l4.2-14h2.7L6.6 19H4Z" />
    </Mark>
  ),
  wecom: ({ className }) => (
    <Mark className={className}>
      <circle cx="12" cy="12" r="9" fill="#2B7BD6" />
      <path fill="#fff" d="M8.2 10.2c0-2 1.7-3.6 3.8-3.6s3.8 1.6 3.8 3.6-1.7 3.6-3.8 3.6c-.4 0-.8 0-1.1-.1L8.6 15l.6-1.8a3.6 3.6 0 0 1-1-3Zm7.7 2.7c1.6.3 2.7 1.4 2.7 2.9 0 1.6-1.4 2.9-3.1 2.9-.3 0-.6 0-.9-.1l-1.8.9.4-1.3a2.8 2.8 0 0 1-1-1.2c1.7-.3 3-1.8 3.2-3.6.1 0 .3 0 .5-.5Z" />
    </Mark>
  ),
  feishu: ({ className }) => (
    <Mark className={className}>
      <rect width="24" height="24" rx="5" fill="#3370FF" />
      <path fill="#fff" d="M7 8.2 12 5l5 3.2v7.6L12 19l-5-3.2V8.2Zm5 1.2-2.4 1.5v3.2L12 15.6l2.4-1.5v-3.2L12 9.4Z" />
    </Mark>
  ),
  dingtalk: ({ className }) => (
    <Mark className={className}>
      <circle cx="12" cy="12" r="9" fill="#0089FF" />
      <path fill="#fff" d="M9.2 8.2h5.8l-1.1 2.4 2.9.6-5.8 6.2 1.2-3.4H8.4L9.2 8.2Z" />
    </Mark>
  ),
};

const SIZE_BOX: Record<"sm" | "md" | "lg", string> = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-12 w-12",
};

const SIZE_MARK: Record<"sm" | "md" | "lg", string> = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-7 w-7",
};

export function ConnectorIcon({
  icon,
  id,
  label,
  size = "md",
}: {
  icon?: string;
  id?: string;
  label?: string;
  size?: "sm" | "md" | "lg";
}) {
  const slug = resolveConnectorSlug(icon, id);
  const Brand = slug ? BRANDS[slug] : undefined;
  const box = SIZE_BOX[size];
  const mark = SIZE_MARK[size];
  if (Brand) {
    return (
      <span
        data-connector-icon={slug}
        data-connector-icon-kind="brand"
        className={`flex ${box} shrink-0 items-center justify-center rounded-lg bg-neutral-100`}
      >
        <Brand className={mark} />
      </span>
    );
  }
  const seed = label || id || icon || "?";
  const letter = letterFromLabel(seed);
  return (
    <span
      data-connector-icon={slug || letter}
      data-connector-icon-kind="letter"
      className={`flex ${box} shrink-0 items-center justify-center rounded-lg text-[13px] font-semibold text-white`}
      style={{ background: letterColor(seed) }}
    >
      {letter}
    </span>
  );
}
