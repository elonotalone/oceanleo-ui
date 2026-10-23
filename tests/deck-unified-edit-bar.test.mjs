// 10-23 编辑器整改 W07：演示的统一编辑栏（D9）、整框文字格式与层级。
import assert from "node:assert/strict";
import test from "node:test";
import {
  deckElementBar,
  deckElementSelectionControls,
  deckFontOptions,
} from "../src/shell/doc-editors/deck-edit-bar-controls.ts";
import { applyDeckToolbarCommand } from "../src/shell/doc-editors/deck-toolbar-command.ts";
import { deckArrangedElements } from "../src/shell/doc-editors/deck-arrange.ts";
import {
  deckPptxTextRuns,
  deckSafeLink,
  deckTextDecoration,
  deckTextListLines,
} from "../src/shell/doc-editors/deck-text-format.ts";
import { normalizeDeckDocument } from "../src/shell/doc-editors/deck-schema.ts";
import {
  canonicalSelectionControls,
  EDIT_BAR_CANON,
  editBarCanonSequence,
} from "../src/shell/edit-bar-canon.ts";

const tt = (zh) => zh;
const FONTS = [
  { family: "Inter, Arial, sans-serif", label: "Modern Sans" },
  { family: "Georgia, Times New Roman, serif", label: "Georgia" },
];

function element(type, extra = {}) {
  return {
    id: `${type}-1`,
    type,
    x: 10,
    y: 10,
    width: 30,
    height: 20,
    rotation: 0,
    order: 1,
    ...(type === "text" ? { text: "Hello\nWorld", fontSize: 24 } : {}),
    ...(type === "image" ? { src: "https://example.com/a.png" } : {}),
    ...(type === "shape" ? { shape: "rectangle", fill: "#ff0000" } : {}),
    ...extra,
  };
}

const compact = (controls) =>
  controls.filter((control) => control.slot !== "inspector");

test("text box bar: text group → shape items → object group, canonical ids only", () => {
  const controls = deckElementSelectionControls(element("text"), tt, "", FONTS);
  const ids = compact(controls).map((control) => control.id);
  for (const id of [
    "font-family", "font-size", "bold", "italic", "underline", "strike",
    "text-color", "highlight", "align", "list", "line-height",
    "letter-spacing", "clear-format", "fill", "radius", "shadow",
    "arrange", "lock", "duplicate", "delete",
  ]) {
    assert.ok(ids.includes(id), `missing ${id}`);
  }
  // 旧 id 与「编辑文字」键都不再出现（操作员截图里三个相似的 A、两个十字箭头）。
  for (const old of ["font-panel", "color", "edit-text", "position-panel", "effects-panel", "border-radius", "layer-up", "layer-down"]) {
    assert.ok(!controls.some((control) => control.id === old), `${old} still emitted`);
  }
  const panels = new Set(controls.filter((c) => c.slot === "inspector").map((c) => c.inspectorGroup));
  assert.deepEqual([...panels].sort(), ["animation", "link", "opacity", "position", "stroke"]);
  // 规范顺序：与 editBarCanonSequence("text") 一致。
  const sequence = editBarCanonSequence("text").map((item) => item.id);
  const canonOrder = [...compact(controls).map((c) => c.id), ...panels]
    .filter((id) => sequence.includes(id));
  const ranks = compact(controls)
    .map((c) => c.id)
    .filter((id) => sequence.includes(id))
    .map((id) => sequence.indexOf(id));
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), canonOrder.join(" "));
  assert.equal(deckElementBar(element("text")), "text");
});

test("every canonical control on the deck bar carries the canonical icon; icons never repeat", () => {
  for (const type of ["text", "image", "shape", "table"]) {
    const controls = deckElementSelectionControls(element(type), tt, "", FONTS);
    const visible = compact(controls).filter((c) => c.placement !== "more");
    const icons = visible.map((c) => c.icon).filter(Boolean);
    assert.equal(new Set(icons).size, icons.length, `${type}: ${icons.join(" ")}`);
    for (const control of visible) {
      const entry = EDIT_BAR_CANON[control.id];
      if (entry && control.id !== "lock") assert.equal(control.icon, entry.icon, control.id);
    }
    assert.ok(!controls.some((c) => c.disabled), `${type}: no grey buttons`);
    // 外壳投影也认得全部：没有被降成特有控件的规范项。
    const projected = canonicalSelectionControls({
      version: 1,
      kind: `slide-${type}`,
      id: "x",
      bar: deckElementBar(element(type)),
      controls,
    });
    const projectedIcons = projected.controls
      .filter((c) => c.slot !== "inspector" && c.icon)
      .map((c) => c.icon);
    assert.equal(new Set(projectedIcons).size, projectedIcons.length, `${type} projected: ${projectedIcons.join(" ")}`);
  }
});

test("image bar uses image group + A-1 panels; shape bar uses shape group", () => {
  const image = deckElementSelectionControls(element("image"), tt, "", FONTS);
  const imageIds = compact(image).map((c) => c.id);
  for (const id of ["replace", "flip-x", "flip-y", "rotate", "radius", "image-fit", "shadow", "arrange"]) {
    assert.ok(imageIds.includes(id), id);
  }
  const groups = new Set(image.filter((c) => c.slot === "inspector").map((c) => c.inspectorGroup));
  for (const group of ["border", "opacity", "adjust", "alt", "position", "animation"]) {
    assert.ok(groups.has(group), group);
  }
  const shape = deckElementSelectionControls(element("shape"), tt, "", FONTS);
  assert.deepEqual(
    compact(shape).slice(0, 2).map((c) => c.id),
    ["fill", "radius"],
  );
  assert.ok(shape.some((c) => c.id === "stroke-color" && c.inspectorGroup === "stroke"));
  const line = deckElementSelectionControls(element("shape", { shape: "line" }), tt, "", FONTS);
  assert.ok(!line.some((c) => c.id === "fill"), "lines have no fill");
  assert.ok(line.some((c) => c.id === "stroke-dash" && c.inspectorGroup === "stroke"));
});

test("locked object shows only unlock (plus alt for images), never grey buttons", () => {
  const locked = deckElementSelectionControls(element("text", { locked: true }), tt, "", FONTS);
  assert.deepEqual(locked.map((c) => c.id), ["lock"]);
  assert.equal(locked[0].icon, "unlock");
  const image = deckElementSelectionControls(element("image", { locked: true }), tt, "", FONTS);
  assert.deepEqual(image.map((c) => c.id), ["lock", "alt"]);
});

test("font dropdown shows the current font; unknown fonts are listed by name", () => {
  assert.equal(deckFontOptions("Georgia", "", FONTS).value, "Georgia, Times New Roman, serif");
  const custom = deckFontOptions("Calibri, sans-serif", "", FONTS);
  assert.equal(custom.value, "Calibri, sans-serif");
  assert.equal(custom.options[0].label, "Calibri");
});

function fakeEditor(elements) {
  const calls = [];
  const slide = { id: "s1", elements };
  return {
    calls,
    activeSlide: slide,
    patchElement: (id, patch) => calls.push(["patch", id, patch]),
    patchElementTransient: (id, patch) => calls.push(["transient", id, patch]),
    patchSlide: (patch) => calls.push(["slide", patch]),
    beginGesture() {}, endGesture() {}, cancelGesture() {},
    undo() {}, redo() {},
    duplicateElement: () => calls.push(["duplicate"]),
    deleteElement: () => calls.push(["delete"]),
    toggleElementLock: () => calls.push(["lock"]),
  };
}

const send = (editor, target, controlId, value) =>
  applyDeckToolbarCommand(editor, target, { requestId: "r", selectionId: target.id, controlId, value });

test("canonical commands patch the deck element", () => {
  const text = element("text");
  const editor = fakeEditor([text]);
  send(editor, text, "strike", true);
  send(editor, text, "list", "ordered");
  send(editor, text, "highlight", "#fde047");
  send(editor, text, "text-color", "#123456");
  send(editor, text, "link", "example.com/a");
  send(editor, text, "link", "javascript:alert(1)");
  send(editor, text, "align", "justify");
  send(editor, text, "rotate");
  send(editor, text, "radius", 12);
  send(editor, text, "stroke-color", "#00ff00");
  send(editor, text, "list", "none");
  assert.deepEqual(editor.calls.map((call) => call[2]), [
    { strike: true },
    { list: "ordered" },
    { highlight: "#fde047" },
    { color: "#123456" },
    { link: "https://example.com/a" },
    // javascript: 被拒，不产生补丁
    { align: "justify" },
    { rotation: 90 },
    { borderRadius: 12 },
    { borderColor: "#00ff00" },
    { list: undefined },
  ]);
});

test("arrange reorders the stack in one slide patch with integer orders", () => {
  const a = element("text", { id: "a", order: 1 });
  const b = element("text", { id: "b", order: 2 });
  const c = element("text", { id: "c", order: 3 });
  const order = (list) => Object.fromEntries(list.map((item) => [item.id, item.order]));
  assert.deepEqual(order(deckArrangedElements([a, b, c], "a", "front")), { a: 3, b: 1, c: 2 });
  assert.deepEqual(order(deckArrangedElements([a, b, c], "a", "forward")), { a: 2, b: 1, c: 3 });
  assert.deepEqual(order(deckArrangedElements([a, b, c], "c", "back")), { a: 2, b: 3, c: 1 });
  const editor = fakeEditor([a, b, c]);
  send(editor, b, "arrange", "backward");
  assert.equal(editor.calls.length, 1);
  assert.deepEqual(order(editor.calls[0][1].elements), { a: 2, b: 1, c: 3 });
  const top = fakeEditor([a, b, c]);
  send(top, c, "arrange", "front");
  assert.equal(top.calls.length, 0, "already on top: no history entry");
});

test("text format survives normalization; unsafe links are dropped", () => {
  const deck = normalizeDeckDocument({
    slides: [{ elements: [
      element("text", { strike: true, highlight: "#fde047", list: "bullet", link: "https://a.example/x", align: "justify" }),
      element("text", { id: "t2", link: "javascript:alert(1)", list: "weird" }),
    ] }],
  });
  const [kept, cleaned] = deck.slides[0].elements;
  assert.equal(kept.strike, true);
  assert.equal(kept.highlight, "#fde047");
  assert.equal(kept.list, "bullet");
  assert.equal(kept.link, "https://a.example/x");
  assert.equal(kept.align, "justify");
  assert.equal(cleaned.link, undefined);
  assert.equal(cleaned.list, undefined);
  assert.ok(!("strike" in cleaned), "old documents gain no new keys");
});

test("format helpers: decoration, list markers, links, PPTX runs", () => {
  assert.equal(deckTextDecoration({ underline: true, strike: true }), "underline line-through");
  assert.equal(deckTextDecoration({}), "none");
  assert.deepEqual(
    deckTextListLines("a\n\nb", "ordered").map((line) => line.marker),
    ["1.", "", "2."],
  );
  assert.equal(deckSafeLink("mailto:x@y.com"), "mailto:x@y.com");
  assert.equal(deckSafeLink("data:text/html,x"), "");
  assert.equal(deckSafeLink("not a link"), "");
  const runs = deckPptxTextRuns("a\nb", { list: "bullet", strike: true, highlight: "#ff0", link: "https://x.example" });
  assert.equal(runs.length, 2);
  assert.deepEqual(runs[0].options, {
    strike: "sngStrike",
    highlight: "FFFF00",
    hyperlink: { url: "https://x.example/" },
    bullet: true,
    breakLine: true,
  });
  assert.deepEqual(deckPptxTextRuns("plain", {}), [{ text: "plain", options: {} }]);
});
