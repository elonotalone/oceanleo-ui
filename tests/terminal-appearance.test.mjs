import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TERMINAL_APPEARANCE,
  normalizeTerminalAppearance,
  parseTerminalAppearance,
  readTerminalAppearance,
  subscribeTerminalAppearance,
  TERMINAL_APPEARANCE_STORAGE_KEY,
  writeTerminalAppearance,
} from "../src/shell/cloud-computer/terminal-card/appearance.ts";
import {
  DARK_TERMINAL_THEME,
  LIGHT_TERMINAL_THEME,
  observeSiteTheme,
  resolveTerminalThemeMode,
  siteThemeIsDark,
  terminalOptionsFromAppearance,
} from "../src/shell/cloud-computer/terminal-card/xterm-themes.ts";

function memoryStorage(initial = null) {
  let value = initial;
  return {
    getItem(key) {
      return key === TERMINAL_APPEARANCE_STORAGE_KEY ? value : null;
    },
    setItem(key, next) {
      assert.equal(key, TERMINAL_APPEARANCE_STORAGE_KEY);
      value = String(next);
    },
    value() {
      return value;
    },
  };
}

test("外观默认值完整，回滚行数固定为 10000", () => {
  assert.deepEqual(parseTerminalAppearance(null), DEFAULT_TERMINAL_APPEARANCE);
  assert.equal(DEFAULT_TERMINAL_APPEARANCE.theme, "system");
  assert.equal(DEFAULT_TERMINAL_APPEARANCE.scrollback, 10_000);
  assert.equal(DEFAULT_TERMINAL_APPEARANCE.fontSize, 13);
  assert.equal(DEFAULT_TERMINAL_APPEARANCE.copyOnSelect, false);
  assert.equal(DEFAULT_TERMINAL_APPEARANCE.cursorBlink, true);
  assert.equal(DEFAULT_TERMINAL_APPEARANCE.cursorStyle, "block");
});

test("坏 JSON 和坏字段逐项回默认，不抹掉仍合法的偏好", () => {
  assert.deepEqual(parseTerminalAppearance("not-json"), DEFAULT_TERMINAL_APPEARANCE);
  const normalized = normalizeTerminalAppearance({
    theme: "sepia",
    fontFamily: "  JetBrains Mono  ",
    fontSize: 99,
    fontWeight: "950",
    fontWeightBold: "600",
    letterSpacing: 0.5,
    lineHeight: 1.5,
    scrollback: -1,
    copyOnSelect: true,
    cursorBlink: "yes",
    cursorStyle: "beam",
  });
  assert.equal(normalized.theme, "system");
  assert.equal(normalized.fontFamily, "JetBrains Mono");
  assert.equal(normalized.fontSize, 13);
  assert.equal(normalized.fontWeight, "400");
  assert.equal(normalized.fontWeightBold, "600");
  assert.equal(normalized.letterSpacing, 0);
  assert.equal(normalized.lineHeight, 1.5);
  assert.equal(normalized.scrollback, 10_000);
  assert.equal(normalized.copyOnSelect, true);
  assert.equal(normalized.cursorBlink, true);
  assert.equal(normalized.cursorStyle, "block");
});

test("边界值校验：字号 9–32、字间距 -2–10、行高 1–2、回滚 100–100000", () => {
  const min = normalizeTerminalAppearance({
    fontSize: 9,
    letterSpacing: -2,
    lineHeight: 1,
    scrollback: 100,
  });
  assert.equal(min.fontSize, 9);
  assert.equal(min.letterSpacing, -2);
  assert.equal(min.lineHeight, 1);
  assert.equal(min.scrollback, 100);

  const max = normalizeTerminalAppearance({
    fontSize: 32,
    letterSpacing: 10,
    lineHeight: 2,
    scrollback: 100_000,
  });
  assert.equal(max.fontSize, 32);
  assert.equal(max.letterSpacing, 10);
  assert.equal(max.lineHeight, 2);
  assert.equal(max.scrollback, 100_000);
});

test("写入固定 localStorage 键并通知同页订阅者", () => {
  const storage = memoryStorage();
  let notifications = 0;
  const unsubscribe = subscribeTerminalAppearance(() => {
    notifications += 1;
  });
  const written = writeTerminalAppearance(
    { ...DEFAULT_TERMINAL_APPEARANCE, theme: "dark", fontSize: 16 },
    storage,
  );
  unsubscribe();
  assert.equal(notifications, 1);
  assert.equal(written.theme, "dark");
  assert.equal(readTerminalAppearance(storage).fontSize, 16);
  assert.deepEqual(JSON.parse(storage.value()), written);
});

test("外观逐项映射到 xterm options，不遗漏粗细、回滚或光标", () => {
  const appearance = normalizeTerminalAppearance({
    theme: "light",
    fontFamily: "Fira Code",
    fontSize: 15,
    fontWeight: "500",
    fontWeightBold: "800",
    letterSpacing: 1,
    lineHeight: 1.4,
    scrollback: 24_000,
    copyOnSelect: true,
    cursorBlink: false,
    cursorStyle: "bar",
  });
  assert.deepEqual(terminalOptionsFromAppearance(appearance, true), {
    fontFamily: "Fira Code",
    fontSize: 15,
    fontWeight: "500",
    fontWeightBold: "800",
    letterSpacing: 1,
    lineHeight: 1.4,
    scrollback: 24_000,
    cursorBlink: false,
    cursorStyle: "bar",
    theme: LIGHT_TERMINAL_THEME,
  });
});

test("明暗主题都有 ANSI 16 色，跟随网站 dark class", () => {
  const ansi = [
    "black",
    "red",
    "green",
    "yellow",
    "blue",
    "magenta",
    "cyan",
    "white",
    "brightBlack",
    "brightRed",
    "brightGreen",
    "brightYellow",
    "brightBlue",
    "brightMagenta",
    "brightCyan",
    "brightWhite",
  ];
  for (const palette of [LIGHT_TERMINAL_THEME, DARK_TERMINAL_THEME]) {
    for (const color of ansi) assert.match(palette[color], /^#[0-9a-f]{6}$/i);
  }
  assert.equal(resolveTerminalThemeMode("system", false), "light");
  assert.equal(resolveTerminalThemeMode("system", true), "dark");
  assert.equal(resolveTerminalThemeMode("light", true), "light");
  assert.equal(resolveTerminalThemeMode("dark", false), "dark");
  assert.equal(
    siteThemeIsDark({ classList: { contains: (name) => name === "dark" } }),
    true,
  );
});

test("MutationObserver 只观察 html class，并在切换时回调", () => {
  const previous = globalThis.MutationObserver;
  let callback = null;
  let observed = null;
  let disconnected = false;
  globalThis.MutationObserver = class {
    constructor(next) {
      callback = next;
    }
    observe(root, options) {
      observed = { root, options };
    }
    disconnect() {
      disconnected = true;
    }
  };
  let dark = false;
  const root = { classList: { contains: () => dark } };
  const values = [];
  const stop = observeSiteTheme((value) => values.push(value), root);
  assert.deepEqual(observed.options, {
    attributes: true,
    attributeFilter: ["class"],
  });
  dark = true;
  callback();
  assert.deepEqual(values, [true]);
  stop();
  assert.equal(disconnected, true);
  globalThis.MutationObserver = previous;
});

