/**
 * W12 源码门禁：编辑栏 58 px → 38 px。
 * 控件 28、内边距 4、边框 1+1、总高 38；停靠带 min-h-10；条上不再写 h-11。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import * as surface from "../src/shell/edit-bar-surface.ts";

const SLOT_FILES = [
  "src/shell/edit-bar-surface.ts",
  "src/shell/EditBarDockHost.tsx",
  "src/shell/EditBarDockControls.tsx",
  "src/shell/SelectionToolbar.tsx",
  "src/shell/SelectionToolbarControl.tsx",
  "src/shell/SelectionToolbarButtonControl.tsx",
  "src/shell/SelectionToolbarSelectControl.tsx",
  "src/shell/SelectionToolbarNumberControl.tsx",
  "src/shell/selection-toolbar-layout.ts",
  "src/shell/selection-toolbar-chrome.tsx",
  "src/shell/floating-toolbar-geometry.ts",
  "src/shell/plugin-chrome/tokens.ts",
  "src/shell/plugin-chrome/PluginChromeEditBarButton.tsx",
];

/** Compact-bar tokens only. `min-h-11` in the More popover is a menu row, not the bar. */
const COMPACT_H11 = /(?<![-\w])h-11(?![-\w])/;
const COMPACT_W11 = /(?<![-\w])w-11(?![-\w])/;

function slotSource(rel) {
  return readFileSync(resolve(rel), "utf8");
}

test("edit-bar constants are the 38 px recipe", () => {
  assert.equal(surface.EDIT_BAR_CONTROL_SIZE_PX, 28);
  assert.equal(surface.EDIT_BAR_PILL_PADDING_PX, 4);
  assert.equal(surface.EDIT_BAR_BORDER_PX, 1);
  assert.equal(surface.EDIT_BAR_COLLAPSED_SIZE_PX, 32);
  assert.equal(surface.EDIT_BAR_HEIGHT_PX, 38);
  assert.equal(
    surface.EDIT_BAR_CONTROL_SIZE_PX +
      surface.EDIT_BAR_PILL_PADDING_PX * 2 +
      surface.EDIT_BAR_BORDER_PX * 2,
    surface.EDIT_BAR_HEIGHT_PX,
  );
  const layout = slotSource("src/shell/selection-toolbar-layout.ts");
  const more = /SELECTION_TOOLBAR_MORE_BUTTON_WIDTH\s*=\s*(\d+)/.exec(layout);
  assert.ok(more, "More width constant missing");
  assert.equal(Number(more[1]), 28);
  const tokens = slotSource("src/shell/plugin-chrome/tokens.ts");
  assert.match(tokens, /PLUGIN_CHROME_EDITBAR_MIN_H\s*=\s*"min-h-10"/);
});

test("pill style plus compact class derive the measured 38 px bar root", () => {
  const pill = surface.editBarPillStyle();
  assert.equal(pill.padding, surface.EDIT_BAR_PILL_PADDING_PX);
  assert.equal(pill.borderWidth, `${surface.EDIT_BAR_BORDER_PX}px`);
  assert.equal(pill.borderStyle, "solid");
  const derived =
    surface.EDIT_BAR_CONTROL_SIZE_PX +
    Number(pill.padding) * 2 +
    Number.parseFloat(String(pill.borderWidth)) * 2;
  assert.equal(derived, surface.EDIT_BAR_HEIGHT_PX);
  assert.match(surface.EDIT_BAR_BUTTON_CLASS, /\bh-7\b/);
  assert.match(surface.EDIT_BAR_BUTTON_CLASS, /\bw-7\b/);
  assert.doesNotMatch(surface.EDIT_BAR_BUTTON_CLASS, COMPACT_H11);
  assert.match(surface.EDIT_BAR_DIVIDER_CLASS, /\bh-4\b/);
  assert.match(surface.EDIT_BAR_BUTTON_CLASS, /pointer:coarse/);
});

test("dock band reserves min-h-10 / h-10, not the old 64 px strip", () => {
  const host = slotSource("src/shell/EditBarDockHost.tsx");
  assert.match(host, /\bmin-h-10\b/);
  assert.match(host, /\bh-10\b/);
  assert.doesNotMatch(host, /\bmin-h-16\b/);
  assert.doesNotMatch(host, /(?<![-\w])h-16(?![-\w])/);
});

test("edit-bar slot files no longer pin compact h-11 / w-11", () => {
  const leftovers = [];
  for (const file of SLOT_FILES) {
    const src = slotSource(file);
    if (COMPACT_H11.test(src)) leftovers.push(`${file} still has compact h-11`);
    if (COMPACT_W11.test(src)) leftovers.push(`${file} still has compact w-11`);
  }
  assert.deepEqual(leftovers, []);
});
