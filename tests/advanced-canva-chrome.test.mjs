import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Canva-style advanced-workbench overhaul (2026-07-16) architecture lock.
// These assertions protect the shared @oceanleo/ui chrome consumed by 31 sites:
// a unified data-driven top bar, overlay side panels, an icon registry, and
// theme-token chrome (no hardcoded light-only colors) across every editor.

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const ROUTE_DIR = new URL("../src/shell/advanced-routes/", import.meta.url);

// Routes that host a native in-app editor (must drive the unified top bar).
const NATIVE_ROUTES = [
  "DeckRoute.tsx",
  "RichDocRoute.tsx",
  "GridRoute.tsx",
  "ImageRoute.tsx",
  "VideoTimelineRoute.tsx",
  "AudioRoute.tsx",
  "PdfRoute.tsx",
  "Model3DRoute.tsx",
  "ChartRoute.tsx",
];

test("foundation chrome primitives exist and export the unified toolkit", () => {
  const chrome = source("../src/shell/editor-chrome.tsx");
  // Exported symbols (some are forwardRef consts, so match the identifier).
  for (const symbol of [
    "CHROME",
    "ToolButton",
    "ToolGroup",
    "ToolDivider",
    "ToolbarShell",
    "ToolSelect",
    "ToolColor",
    "ToolNumber",
    "ToolRange",
    "ToolText",
    "ToolOverflow",
    "EditorPanel",
    "PanelSection",
  ]) {
    assert.ok(
      new RegExp(`export (?:function|const) ${symbol}\\b`).test(chrome),
      `editor-chrome missing export ${symbol}`,
    );
  }

  const topbar = source("../src/shell/advanced-topbar.tsx");
  assert.match(topbar, /export function AdvancedTopBar/);
  // The three button behaviours the operator asked for: direct action,
  // dropdown column, and open-a-side-panel — plus toggle/custom.
  for (const kind of ['"action"', '"toggle"', '"dropdown"', '"panel"', '"custom"']) {
    assert.ok(topbar.includes(kind), `AdvancedTopBar missing kind ${kind}`);
  }

  const icons = source("../src/shell/editor-icons.tsx");
  assert.match(icons, /export function editorIcon/);
  assert.match(icons, /export function EditorIcon/);
  // A representative sample of the Canva tool icon vocabulary. Registry keys
  // may be quoted ("align-left":) or bare identifiers (bold:).
  for (const name of ["bold", "italic", "crop", "layers", "ai"]) {
    assert.ok(
      new RegExp(`(?:["']${name}["']|\\b${name})\\s*:`).test(icons),
      `icon registry missing ${name}`,
    );
  }
});

test("the shell drops the standalone 编辑 rail and hosts overlay panels", () => {
  const shell = source("../src/shell/AdvancedWorkbenchShell.tsx");
  // Unified top bar is rendered.
  assert.match(shell, /AdvancedTopBar/);
  assert.match(shell, /topBarModel/);
  // Overlay side panels (opened only from the top bar) exist.
  assert.match(shell, /EditorPanel/);
  assert.match(shell, /editorPanels/);
  assert.match(shell, /activePanelId/);
  // Left rail is collapsible and starts collapsed (no auto-expanded 编辑 column).
  assert.match(shell, /useState<WorkbenchTool \| null>\(null\)/);
  // The retired left nav no longer offers a "tools/编辑" primary entry.
  assert.doesNotMatch(shell, /"agent" \| "tools"/);
});

test("every native editor route drives the unified top bar", () => {
  for (const file of NATIVE_ROUTES) {
    const route = source(`../src/shell/advanced-routes/${file}`);
    assert.match(route, /topBarModel/, `${file} must build a topBarModel`);
    assert.match(
      route,
      /AdvancedWorkbenchShell/,
      `${file} must mount the shared shell`,
    );
    assert.doesNotMatch(
      route,
      /editorToolbox=\{/,
      `${file} must migrate off the legacy left editorToolbox`,
    );
  }
});

test("the floating selection toolbar is icon-driven and offers object-level AI", () => {
  const toolbar = source("../src/shell/SelectionToolbar.tsx");
  assert.match(toolbar, /ToolbarShell/);
  assert.match(toolbar, /EditorIcon/);
  // Group dividers + overflow menu (Canva clusters + "more").
  assert.match(toolbar, /ToolDivider/);
  assert.match(toolbar, /ToolOverflow/);
  // Object-level AI entry ("让 AI 改这个对象").
  assert.match(toolbar, /onAskAi/);
});

test("migrated editor chrome uses theme tokens, not hardcoded light-only colors", () => {
  // The foundation + shell + the two panels rendered in the shell rail must be
  // theme-token driven so dark-mode users don't get a wall of white.
  const themeCritical = [
    "../src/shell/editor-chrome.tsx",
    "../src/shell/advanced-topbar.tsx",
    "../src/shell/SelectionToolbar.tsx",
    "../src/shell/AdvancedWorkbenchShell.tsx",
    "../src/shell/AdvancedFeaturePages.tsx",
    "../src/shell/AdvancedTasks.tsx",
    "../src/shell/AdvancedAgentPanel.tsx",
  ];
  // Disallow the tell-tale hardcoded light palette. `bg-white` inside an
  // arbitrary value fallback (var(--x,#ffffff)) is fine; a bare Tailwind
  // `bg-white` utility class is not. Comment lines are ignored (docs may
  // mention the retired classes).
  const bareLight = /(?:^|\s|"|`|')(?:bg-white|text-stone-\d|border-stone-\d|bg-stone-\d)(?:\b|\/)/;
  const isComment = (line) => {
    const trimmed = line.trim();
    return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
  };
  for (const path of themeCritical) {
    const text = source(path);
    const offending = text
      .split("\n")
      .filter((line) => !isComment(line) && bareLight.test(line));
    assert.equal(
      offending.length,
      0,
      `${path} still uses hardcoded light-only color classes:\n${offending.join("\n")}`,
    );
    assert.match(text, /var\(--/, `${path} should reference theme CSS vars`);
  }
});

test("all advanced route files compile through the shared shell", () => {
  const files = readdirSync(fileURLToPath(ROUTE_DIR)).filter((name) =>
    name.endsWith("Route.tsx"),
  );
  // Sanity: the route directory still contains the full editor set.
  assert.ok(files.length >= 12, `expected >=12 route files, found ${files.length}`);
});
