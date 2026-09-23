"use client";

import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

export const TERMINAL_APPEARANCE_STORAGE_KEY =
  "oceanleo.terminal.appearance.v1";

export type TerminalThemePreference = "system" | "light" | "dark";
export type TerminalCursorStyle = "block" | "underline" | "bar";
export type TerminalFontWeight =
  | "100"
  | "200"
  | "300"
  | "400"
  | "500"
  | "600"
  | "700"
  | "800"
  | "900";

export type TerminalAppearance = {
  theme: TerminalThemePreference;
  fontFamily: string;
  fontSize: number;
  fontWeight: TerminalFontWeight;
  fontWeightBold: TerminalFontWeight;
  letterSpacing: number;
  lineHeight: number;
  scrollback: number;
  copyOnSelect: boolean;
  cursorBlink: boolean;
  cursorStyle: TerminalCursorStyle;
};

export const DEFAULT_TERMINAL_APPEARANCE: Readonly<TerminalAppearance> = {
  theme: "system",
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  fontSize: 13,
  fontWeight: "400",
  fontWeightBold: "700",
  letterSpacing: 0,
  lineHeight: 1.2,
  scrollback: 10_000,
  copyOnSelect: false,
  cursorBlink: true,
  cursorStyle: "block",
};

const FONT_WEIGHTS: readonly TerminalFontWeight[] = [
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
];

const THEME_VALUES: readonly TerminalThemePreference[] = [
  "system",
  "light",
  "dark",
];

const CURSOR_STYLES: readonly TerminalCursorStyle[] = [
  "block",
  "underline",
  "bar",
];

type AppearanceStorage = Pick<Storage, "getItem" | "setItem">;

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function enumValue<T extends string>(
  value: unknown,
  values: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && values.includes(value as T)
    ? (value as T)
    : fallback;
}

function numberValue(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  integer = false,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  if (value < min || value > max) return fallback;
  if (integer && !Number.isInteger(value)) return fallback;
  return value;
}

/**
 * Treat every field as untrusted. A corrupt or stale field falls back on its
 * own, so one bad slider value does not erase the user's other preferences.
 */
export function normalizeTerminalAppearance(value: unknown): TerminalAppearance {
  const raw = objectValue(value);
  const family =
    typeof raw.fontFamily === "string" ? raw.fontFamily.trim() : "";
  return {
    theme: enumValue(
      raw.theme,
      THEME_VALUES,
      DEFAULT_TERMINAL_APPEARANCE.theme,
    ),
    fontFamily:
      family && family.length <= 240
        ? family
        : DEFAULT_TERMINAL_APPEARANCE.fontFamily,
    fontSize: numberValue(
      raw.fontSize,
      DEFAULT_TERMINAL_APPEARANCE.fontSize,
      9,
      32,
    ),
    fontWeight: enumValue(
      raw.fontWeight,
      FONT_WEIGHTS,
      DEFAULT_TERMINAL_APPEARANCE.fontWeight,
    ),
    fontWeightBold: enumValue(
      raw.fontWeightBold,
      FONT_WEIGHTS,
      DEFAULT_TERMINAL_APPEARANCE.fontWeightBold,
    ),
    letterSpacing: numberValue(
      raw.letterSpacing,
      DEFAULT_TERMINAL_APPEARANCE.letterSpacing,
      -2,
      10,
      true,
    ),
    lineHeight: numberValue(
      raw.lineHeight,
      DEFAULT_TERMINAL_APPEARANCE.lineHeight,
      1,
      2,
    ),
    scrollback: numberValue(
      raw.scrollback,
      DEFAULT_TERMINAL_APPEARANCE.scrollback,
      100,
      100_000,
      true,
    ),
    copyOnSelect:
      typeof raw.copyOnSelect === "boolean"
        ? raw.copyOnSelect
        : DEFAULT_TERMINAL_APPEARANCE.copyOnSelect,
    cursorBlink:
      typeof raw.cursorBlink === "boolean"
        ? raw.cursorBlink
        : DEFAULT_TERMINAL_APPEARANCE.cursorBlink,
    cursorStyle: enumValue(
      raw.cursorStyle,
      CURSOR_STYLES,
      DEFAULT_TERMINAL_APPEARANCE.cursorStyle,
    ),
  };
}

export function parseTerminalAppearance(raw: string | null): TerminalAppearance {
  if (!raw) return { ...DEFAULT_TERMINAL_APPEARANCE };
  try {
    return normalizeTerminalAppearance(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_TERMINAL_APPEARANCE };
  }
}

function browserStorage(): AppearanceStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readTerminalAppearance(
  storage: Pick<Storage, "getItem"> | null = browserStorage(),
): TerminalAppearance {
  if (!storage) return { ...DEFAULT_TERMINAL_APPEARANCE };
  try {
    return parseTerminalAppearance(storage.getItem(TERMINAL_APPEARANCE_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_TERMINAL_APPEARANCE };
  }
}

const listeners = new Set<() => void>();

function publishAppearanceChange(): void {
  for (const listener of listeners) listener();
}

/** Persist a normalized value and notify every terminal in this tab. */
export function writeTerminalAppearance(
  value: TerminalAppearance,
  storage: AppearanceStorage | null = browserStorage(),
): TerminalAppearance {
  const normalized = normalizeTerminalAppearance(value);
  if (!storage) return normalized;
  try {
    storage.setItem(
      TERMINAL_APPEARANCE_STORAGE_KEY,
      JSON.stringify(normalized),
    );
  } catch {
    return normalized;
  }
  publishAppearanceChange();
  return normalized;
}

export function subscribeTerminalAppearance(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === TERMINAL_APPEARANCE_STORAGE_KEY || event.key === null) {
      listener();
    }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

export type SetTerminalAppearance = Dispatch<SetStateAction<TerminalAppearance>>;

/** Same-tab writes and cross-tab `storage` events both update every consumer. */
export function useTerminalAppearance(): readonly [
  TerminalAppearance,
  SetTerminalAppearance,
] {
  const [appearance, setAppearanceState] = useState<TerminalAppearance>(() =>
    readTerminalAppearance(),
  );

  useEffect(
    () =>
      subscribeTerminalAppearance(() => {
        setAppearanceState(readTerminalAppearance());
      }),
    [],
  );

  const setAppearance = useCallback<SetTerminalAppearance>((next) => {
    const current = readTerminalAppearance();
    const value = typeof next === "function" ? next(current) : next;
    const normalized = writeTerminalAppearance(value);
    setAppearanceState(normalized);
  }, []);

  return [appearance, setAppearance] as const;
}

