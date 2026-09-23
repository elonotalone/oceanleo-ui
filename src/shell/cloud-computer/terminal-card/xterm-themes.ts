import type { ITheme, ITerminalOptions } from "@xterm/xterm";
import type {
  TerminalAppearance,
  TerminalThemePreference,
} from "./appearance";

/** Complete light palette: neutral dashboard canvas with readable ANSI colors. */
export const LIGHT_TERMINAL_THEME: Readonly<ITheme> = {
  background: "#ffffff",
  foreground: "#27272a",
  cursor: "#4f46e5",
  cursorAccent: "#ffffff",
  selectionBackground: "#c7d2fe",
  selectionForeground: "#18181b",
  selectionInactiveBackground: "#e0e7ff",
  black: "#18181b",
  red: "#dc2626",
  green: "#15803d",
  yellow: "#a16207",
  blue: "#2563eb",
  magenta: "#9333ea",
  cyan: "#0e7490",
  white: "#d4d4d8",
  brightBlack: "#71717a",
  brightRed: "#ef4444",
  brightGreen: "#16a34a",
  brightYellow: "#ca8a04",
  brightBlue: "#3b82f6",
  brightMagenta: "#a855f7",
  brightCyan: "#0891b2",
  brightWhite: "#fafafa",
};

/** Complete dark palette, retaining the existing near-black terminal surface. */
export const DARK_TERMINAL_THEME: Readonly<ITheme> = {
  background: "#0a0a0a",
  foreground: "#e5e5e5",
  cursor: "#a5b4fc",
  cursorAccent: "#0a0a0a",
  selectionBackground: "#3730a3",
  selectionForeground: "#fafafa",
  selectionInactiveBackground: "#27272a",
  black: "#171717",
  red: "#f87171",
  green: "#4ade80",
  yellow: "#facc15",
  blue: "#60a5fa",
  magenta: "#c084fc",
  cyan: "#22d3ee",
  white: "#d4d4d4",
  brightBlack: "#737373",
  brightRed: "#fca5a5",
  brightGreen: "#86efac",
  brightYellow: "#fde047",
  brightBlue: "#93c5fd",
  brightMagenta: "#d8b4fe",
  brightCyan: "#67e8f9",
  brightWhite: "#ffffff",
};

export type ResolvedTerminalTheme = "light" | "dark";

export function siteThemeIsDark(
  root: Pick<Element, "classList"> | null =
    typeof document === "undefined" ? null : document.documentElement,
): boolean {
  return root?.classList.contains("dark") === true;
}

export function resolveTerminalThemeMode(
  preference: TerminalThemePreference,
  siteDark: boolean,
): ResolvedTerminalTheme {
  if (preference === "light" || preference === "dark") return preference;
  return siteDark ? "dark" : "light";
}

export function terminalThemeFor(
  preference: TerminalThemePreference,
  siteDark: boolean,
): Readonly<ITheme> {
  return resolveTerminalThemeMode(preference, siteDark) === "dark"
    ? DARK_TERMINAL_THEME
    : LIGHT_TERMINAL_THEME;
}

export type AppearanceTerminalOptions = Pick<
  ITerminalOptions,
  | "fontFamily"
  | "fontSize"
  | "fontWeight"
  | "fontWeightBold"
  | "letterSpacing"
  | "lineHeight"
  | "scrollback"
  | "cursorBlink"
  | "cursorStyle"
  | "theme"
>;

export function terminalOptionsFromAppearance(
  appearance: TerminalAppearance,
  siteDark: boolean,
): AppearanceTerminalOptions {
  return {
    fontFamily: appearance.fontFamily,
    fontSize: appearance.fontSize,
    fontWeight: appearance.fontWeight,
    fontWeightBold: appearance.fontWeightBold,
    letterSpacing: appearance.letterSpacing,
    lineHeight: appearance.lineHeight,
    scrollback: appearance.scrollback,
    cursorBlink: appearance.cursorBlink,
    cursorStyle: appearance.cursorStyle,
    theme: terminalThemeFor(appearance.theme, siteDark),
  };
}

/** Observe only `<html class>`; callers can apply the new theme without reconnecting. */
export function observeSiteTheme(
  onChange: (dark: boolean) => void,
  root: HTMLElement | null =
    typeof document === "undefined" ? null : document.documentElement,
): () => void {
  if (!root || typeof MutationObserver === "undefined") return () => {};
  const observer = new MutationObserver(() => onChange(siteThemeIsDark(root)));
  observer.observe(root, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

