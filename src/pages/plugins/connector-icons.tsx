"use client";

import { BRAND_MARKS } from "./brand-marks/generated";

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
  const mark = slug ? BRAND_MARKS[slug] : undefined;
  const box = SIZE_BOX[size];
  const markSize = SIZE_MARK[size];
  if (mark) {
    return (
      <span
        data-connector-icon={slug}
        data-connector-icon-kind="brand"
        data-connector-icon-source={mark.source}
        className={`flex ${box} shrink-0 items-center justify-center rounded-lg bg-neutral-100`}
      >
        <img src={mark.src} alt="" className={`${markSize} object-contain`} />
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
