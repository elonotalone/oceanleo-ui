// ============================================================================
// 统一编辑栏判据（2026-10-23 操作员裁定 D3 / D9，W03）
// ----------------------------------------------------------------------------
// 任一编辑器、任一选区：可见按钮两两图标不同；规范 id 的顺序与 00-dispatch §4 一致；
// 别名被归一；编辑器特有控件不许借用规范图标；前缀区不再有「编辑工具」触发器。
// 用真 SelectionToolbar + 真 AdvancedEditorIcon 渲染，图标按 data-icon 与 svg 指纹双判。
// ============================================================================
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  EDIT_BAR_CANON,
  EDIT_BAR_CANON_GROUPS,
  canonicalSelectionControls,
  editBarCanonSequence,
  finalizeEditBarIcons,
} from "../src/shell/edit-bar-canon.ts";
import { partitionSelectionInspectorControls } from "../src/shell/selection-inspector-groups.ts";
import { normalizeSelectionContext } from "../src/shell/selection-context.ts";
import { SELECTION_CONTROL_ICONS } from "../src/shell/selection-context-types.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
delete require.cache[canvasEntry];
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  PointerEvent: window.PointerEvent || window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const { AdvancedEditorIcon } = await import(
  await compileModule("src/shell/AdvancedEditorIcon.tsx", {})
);
const { SelectionToolbar } = await import(
  await compileModule("src/shell/SelectionToolbar.tsx", {
    "../i18n/ui/useUI": dataModule("export function useUI() { return globalThis.__w03tt || ((s) => s); }"),
    "./SelectionAnimationGallery": dataModule("export function SelectionAnimationGallery() { return null; }"),
  })
);

/** 一个规范项的假控件：形态取词表推荐的第一种，给齐 select 的选项。 */
function fakeControl(id, entry, overrides = {}) {
  const kind = overrides.kind || entry.kinds[0];
  return {
    id,
    kind,
    label: `editor-${id}`,
    icon: "more",
    ...(kind === "select"
      ? { value: "", options: [{ value: "left", label: "L" }, { value: "center", label: "C" }] }
      : {}),
    ...(kind === "number" || kind === "range" ? { value: 1, min: 0, max: 100 } : {}),
    ...(kind === "color" ? { value: "#336699" } : {}),
    ...(kind === "toggle" ? { value: false } : {}),
    ...(kind === "panel" ? { panelId: `${id}-panel` } : {}),
    ...(kind === "animation-gallery"
      ? { animationGallery: { presets: [{ id: "fade", label: "Fade", applyCommandId: "fade.apply" }] } }
      : {}),
    ...overrides,
  };
}

/** 每组规范 id 全给，几个换成别名，再加一个借用规范图标的特有控件、两个同图标的特有控件。 */
function contextForBar(bar) {
  const aliases = {
    "font-family": { id: "font-panel", kind: "panel" },
    "text-color": { id: "color" },
    strike: { id: "linethrough" },
    "flip-x": { id: "flip-horizontal" },
    "flip-y": { id: "flip-vertical" },
    rotate: { id: "rotate-right" },
  };
  const ids = [
    ...EDIT_BAR_CANON_GROUPS[bar].map((entry) => entry.id),
    ...EDIT_BAR_CANON_GROUPS.object.map((entry) => entry.id).filter((id) => id !== "arrange"),
  ];
  const controls = [];
  for (const id of [...new Set(ids)].reverse()) {
    const alias = aliases[id];
    controls.push(fakeControl(alias?.id || id, EDIT_BAR_CANON[id], alias?.kind ? { kind: alias.kind } : {}));
  }
  controls.push(
    { id: "layer-up", kind: "action", label: "up", icon: "bring-forward" },
    { id: "layer-down", kind: "action", label: "down", icon: "send-backward" },
    { id: "edit-text", kind: "action", label: "编辑文字", icon: "case" },
    { id: "speed", kind: "action", label: "倍速", icon: "timeline" },
    { id: "pace", kind: "action", label: "节奏", icon: "timeline" },
  );
  return { version: 1, kind: `fixture-${bar}`, id: `sel-${bar}`, bar, controls };
}

async function mountToolbar(context) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const commands = [];
  await act(async () => {
    root.render(React.createElement(SelectionToolbar, { context, onCommand: (c) => commands.push(c) }));
  });
  return {
    container,
    commands,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
      document.body.innerHTML = "";
    },
  };
}

/** 栏上与「更多」里所有控件格：[{ id, canon, icon, svg }]。 */
async function allControlCells(mounted) {
  const more = mounted.container.querySelector('button[aria-controls^="selection-more-"]');
  if (more) {
    await act(async () => more.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
  }
  return [...document.body.querySelectorAll("[data-selection-control-id]")]
    .filter((cell) => !cell.closest("[data-selection-toolbar-measurements]"))
    .map((cell) => {
      const svg = cell.querySelector("svg[data-icon]");
      return {
        id: cell.getAttribute("data-selection-control-id"),
        canon: cell.getAttribute("data-edit-bar-canon") || "",
        icon: svg?.getAttribute("data-icon") || "",
        svg: svg ? svg.innerHTML : "",
        text: cell.textContent.trim(),
      };
    });
}

for (const bar of ["text", "image", "shape"]) {
  test(`${bar} bar: pairwise-distinct icons, canonical order, aliases folded, no borrowed icons`, async () => {
    const mounted = await mountToolbar(contextForBar(bar));
    try {
      assert.equal(document.body.querySelector("[data-editor-tools-trigger]"), null, "D3：没有编辑工具触发器");
      assert.equal(
        mounted.container.querySelector("[data-edit-bar-bar]")?.getAttribute("data-edit-bar-bar"),
        bar,
      );
      const cells = await allControlCells(mounted);
      const withIcon = cells.filter((cell) => cell.icon);
      const icons = withIcon.map((cell) => cell.icon);
      assert.deepEqual(
        icons.filter((icon, index) => icons.indexOf(icon) !== index),
        [],
        `同一条栏不许出现两个一样的图标：${icons.join(" ")}`,
      );
      const prints = withIcon.map((cell) => cell.svg);
      assert.equal(new Set(prints).size, prints.length, "svg 指纹也要两两不同");

      // 规范顺序：投影后出现的规范项，按本栏全序排列。
      const sequence = editBarCanonSequence(bar).map((item) => item.id);
      const canons = cells.map((cell) => cell.canon).filter(Boolean);
      const primary = canons.filter((id) => EDIT_BAR_CANON[id].tier === "primary");
      assert.deepEqual(primary, [...primary].sort((a, b) => sequence.indexOf(a) - sequence.indexOf(b)));
      // 别名归一：font-panel / color / linethrough … 都以规范 id 出现，且只出现一次。
      for (const canon of ["font-family", "text-color", "strike", "flip-x", "flip-y", "rotate"]) {
        if (!sequence.includes(canon)) continue;
        if (!EDIT_BAR_CANON_GROUPS[bar].some((entry) => entry.id === canon)) continue;
        assert.equal(canons.filter((id) => id === canon).length, 1, `${canon} 归一后应恰好一个`);
      }
      assert.equal(canons.filter((id) => id === "arrange").length, 1, "layer-up/down 合成一个层级下拉");
      // 规范项图标就是词表里的图标（编辑器写的 icon:"more" 作废）。
      for (const cell of cells.filter((item) => item.canon && item.icon)) {
        const expected = EDIT_BAR_CANON[cell.canon].icon;
        if (cell.canon === "align" || cell.canon === "lock" || cell.canon === "list") continue;
        assert.equal(cell.icon, expected, `${cell.canon} 用规范图标`);
      }
      // 特有控件：借规范图标的（edit-text 借 case）改文字；两个同图标的只留第一个图标。
      const editText = cells.find((cell) => cell.id === "edit-text");
      assert.equal(editText.icon, "", "edit-text 借用了规范 case 图标，应改显示文字");
      assert.match(editText.text, /编辑文字/);
      assert.equal(cells.find((cell) => cell.id === "speed").icon, "timeline");
      assert.equal(cells.find((cell) => cell.id === "pace").icon, "", "撞形的第二个特有控件改文字");
      // 特有控件排在所有规范项之后（看投影顺序；DOM 里「更多」按组分节，不按这个顺序）。
      const projected = canonicalSelectionControls(contextForBar(bar)).controls;
      const firstSpecific = projected.findIndex((control) => !control.canonId && !control.canonPanel);
      assert.ok(firstSpecific > 0);
      assert.ok(projected.slice(firstSpecific).every((control) => !control.canonId && !control.canonPanel));
    } finally {
      await mounted.unmount();
    }
  });
}

test("every selection-control glyph is drawn and pairwise distinct (svg fingerprint)", () => {
  // 规范项 + 编辑器特有控件可选的全部图标：撞形就等于一条栏上两个一样的图标。
  const names = [...SELECTION_CONTROL_ICONS];
  for (const entry of Object.values(EDIT_BAR_CANON)) assert.ok(names.includes(entry.icon), entry.icon);
  const prints = names.map((name) =>
    renderToStaticMarkup(React.createElement(AdvancedEditorIcon, { name })).replace(/ data-icon="[^"]*"/, ""),
  );
  for (const [index, print] of prints.entries()) {
    assert.doesNotMatch(print, /data-icon-fallback/, `${names[index]} 缺字形`);
    const twin = prints.indexOf(print);
    assert.equal(twin, index, `${names[index]} 与 ${names[twin]} 字形相同`);
  }
});

test("synthesized arrange / list translate back to the editor's own ids", () => {
  const projection = canonicalSelectionControls({
    version: 1,
    kind: "slide-text",
    id: "el",
    controls: [
      { id: "bullet-list", kind: "toggle", label: "b", value: true },
      { id: "ordered-list", kind: "toggle", label: "o", value: false },
      { id: "layer-up", kind: "action", label: "u" },
      { id: "layer-down", kind: "action", label: "d" },
      { id: "bring-to-front", kind: "action", label: "f", disabled: true },
    ],
  });
  const list = projection.controls.find((control) => control.canonId === "list");
  assert.equal(list.kind, "select");
  assert.equal(list.value, "bullet");
  assert.deepEqual(list.options.map((option) => option.value), ["none", "bullet", "ordered"]);
  const arrange = projection.controls.find((control) => control.canonId === "arrange");
  assert.deepEqual(arrange.options.map((option) => option.value), ["forward", "backward"], "灰掉的选项不出");
  const base = { requestId: "r", selectionId: "el" };
  assert.deepEqual(projection.translate({ ...base, controlId: "arrange", value: "backward" }), {
    ...base,
    controlId: "layer-down",
  });
  assert.deepEqual(projection.translate({ ...base, controlId: "list", value: "ordered" }), {
    ...base,
    controlId: "ordered-list",
    value: true,
  });
  assert.deepEqual(projection.translate({ ...base, controlId: "list", value: "none" }), {
    ...base,
    controlId: "bullet-list",
    value: false,
  });
  assert.deepEqual(projection.translate({ ...base, controlId: "bold", value: true }), {
    ...base,
    controlId: "bold",
    value: true,
  });
});

test("A-1 canonical panels: children stay inside, launcher id is the canonical id", () => {
  const projection = canonicalSelectionControls({
    version: 1,
    kind: "rect",
    id: "r",
    bar: "shape",
    controls: [
      { id: "stroke-color", kind: "color", label: "c", value: "#000000", slot: "inspector", inspectorGroup: "stroke" },
      { id: "stroke-width", kind: "range", label: "w", value: 1, slot: "inspector", inspectorGroup: "stroke" },
      { id: "position-x", kind: "number", label: "x", value: 1, slot: "inspector", inspectorGroup: "position" },
      { id: "fill", kind: "color", label: "f", value: "#ffffff" },
      { id: "dimmed", kind: "action", label: "d", disabled: true },
    ],
  });
  const { compact, groups } = partitionSelectionInspectorControls(projection.controls);
  const bar = finalizeEditBarIcons(compact);
  assert.deepEqual(bar.map((control) => control.id), ["fill", "stroke", "position"]);
  assert.deepEqual(
    bar.map((control) => control.icon),
    ["fill", "stroke", "position"],
  );
  assert.equal(groups.find((group) => group.panelId === "selection-inspector-stroke").controls.length, 2);
  assert.equal(bar.some((control) => control.id === "stroke-color"), false, "子控件不拉成顶层");
  assert.equal(bar.some((control) => control.id === "dimmed"), false, "灰掉的控件不出");
});

test("view-only selections keep their disabled controls; bar travels through the normalizer", () => {
  const projection = canonicalSelectionControls({
    version: 1,
    kind: "slide-text",
    id: "el",
    controls: [
      { id: "bold", kind: "toggle", label: "b", value: false, disabled: true, unavailableReason: "你只能查看" },
      { id: "italic", kind: "toggle", label: "i", value: false, disabled: true, unavailableReason: "你只能查看" },
    ],
  });
  assert.equal(projection.controls.length, 2);
  const normalized = normalizeSelectionContext({ version: 1, kind: "x", id: "y", bar: "image", controls: [] });
  assert.equal(normalized.bar, "image");
  const unknown = normalizeSelectionContext({ version: 1, kind: "x", id: "y", bar: "table", controls: [] });
  assert.equal(unknown.bar, undefined, "未知栏名丢掉，回到按 kind 推断");
});
