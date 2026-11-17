// F08（work-chat 第二轮）：PPT / 图表 / 图片「只能看」。
// 只有查看权限的人，或别人正占着编辑时：工具条、浮条里每个改动类按钮 disabled 且带「你只能查看」，
// 查看类照旧；面板整块 fieldset disabled；Leo 的「帮我改」（指令面）、AI 入口、上传入口都不改作品。
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { compileSelectionAdapterHost } from "./helpers/selection-adapter-host.mjs";
import { normalizeDeckDocument } from "../src/shell/doc-editors/deck-schema.ts";
import { viewOnlyContext, viewOnlyUploadHandler, VIEW_ONLY_HINT, VIEW_ONLY_REFUSAL } from "../src/shell/collab/adapters/visual-readonly.ts";
import { readFileSync } from "node:fs";

const tt = (key, vars) => key.replace(/\{(\w+)\}/g, (_m, name) => String(vars?.[name] ?? ""));
const useUiStub = dataModule(
  `export function useUI(){ return (key, vars) => key.replace(/\\{(\\w+)\\}/g, (_m, n) => String(vars?.[n] ?? "")); }`,
);
const toolbarStub = dataModule(
  `export function SelectionToolbar(props){ globalThis.__F08_TOOLBAR = props; return null; }`,
);

/** 记录所有被调用的方法；没列出的方法一律是「会改内容的」假函数。 */
function fakeEditor(base) {
  const calls = [];
  const editor = new Proxy(base, {
    get(target, key) {
      if (key in target) return target[key];
      if (typeof key === "symbol") return undefined;
      return (...args) => {
        calls.push([String(key), ...args]);
      };
    },
  });
  return { editor, calls };
}

function renderToolbar(Component, props) {
  globalThis.__F08_TOOLBAR = null;
  renderToStaticMarkup(React.createElement(Component, props));
  return globalThis.__F08_TOOLBAR;
}

// ---------------------------------------------------------------- 纯函数

test("viewOnlyContext：改动类控件 disabled 并带原因，keepIds 保留，readOnly=false 原样", () => {
  const context = {
    version: 1,
    kind: "x",
    id: "x1",
    label: "x",
    controls: [
      { id: "bold", kind: "toggle", label: "粗体", value: false },
      { id: "series-selector", kind: "select", label: "系列", value: "a", options: [] },
    ],
  };
  assert.equal(viewOnlyContext(context, false, tt), context);
  assert.equal(viewOnlyContext(null, true, tt), null);
  const locked = viewOnlyContext(context, true, tt, ["series-selector"]);
  assert.equal(locked.controls[0].disabled, true);
  assert.equal(locked.controls[0].unavailableReason, VIEW_ONLY_HINT);
  assert.equal(locked.controls[1].disabled, undefined, "查看类控件保留可用");
  assert.equal(context.controls[0].disabled, undefined, "不改入参");
});

test("viewOnlyUploadHandler：只读时文件不交给编辑器", async () => {
  const seen = [];
  const handler = (files) => void seen.push(files.length);
  await viewOnlyUploadHandler(true, handler)([{}, {}]);
  assert.deepEqual(seen, []);
  await viewOnlyUploadHandler(false, handler)([{}, {}]);
  assert.deepEqual(seen, [2]);
});

// ---------------------------------------------------------------- 面板外壳

test("VisualViewOnlyPanel：只读时 fieldset disabled + 「你只能查看」，可写时不多包一层", async () => {
  const { VisualViewOnlyPanel } = await import(
    await compileModule("src/shell/collab/adapters/VisualViewOnlyPanel.tsx", {
      "../../../i18n/ui/useUI": useUiStub,
    })
  );
  const child = React.createElement("button", { type: "button" }, "删除");
  const locked = renderToStaticMarkup(React.createElement(VisualViewOnlyPanel, { readOnly: true }, child));
  assert.match(locked, /<fieldset[^>]*\sdisabled=""/);
  assert.match(locked, /title="你只能查看"/);
  assert.match(locked, /aria-disabled="true"/);
  assert.match(locked, /你只能查看，这里的功能暂时不能用。/);
  const open = renderToStaticMarkup(React.createElement(VisualViewOnlyPanel, { readOnly: false }, child));
  assert.equal(open, "<button type=\"button\">删除</button>");
});

// ---------------------------------------------------------------- PPT 工具条

async function loadDeckToolbar() {
  return (
    await import(
      await compileSelectionAdapterHost("src/shell/doc-editors/use-deck-selection-adapter.ts", "useDeckSelectionAdapter", "DeckContextToolbar", {
        "../../i18n/ui/useUI": useUiStub,
        "../SelectionToolbar": toolbarStub,
      })
    )
  ).DeckContextToolbar;
}

function deckEditorWith(selectedType) {
  const deck = normalizeDeckDocument({
    title: "汇报",
    slides: [
      {
        id: "s1",
        title: "第一页",
        layout: "title-body",
        elements: [
          { id: "e-text", type: "text", x: 5, y: 5, width: 50, height: 10, text: "你好", fontSize: 24 },
          { id: "e-shape", type: "shape", x: 5, y: 30, width: 20, height: 20, shape: "rectangle", fill: "#ff0000" },
          { id: "e-img", type: "image", x: 40, y: 30, width: 20, height: 20, src: "https://example.com/a.png" },
        ],
      },
    ],
  });
  const slide = deck.slides[0];
  const selected = selectedType ? slide.elements.find((el) => el.type === selectedType) : null;
  return fakeEditor({
    deck,
    activeSlide: slide,
    activeIndex: 0,
    activeMaster: deck.masters[0],
    selectedElement: selected || null,
    selectedElementId: selected?.id || "",
    readOnly: false,
    loading: false,
    sourceFailed: false,
  });
}

for (const selectedType of [null, "text", "shape", "image"]) {
  test(`PPT 工具条（选中=${selectedType || "无"}）：只读时每个控件都 disabled 并带「你只能查看」，点命令不改文稿`, async () => {
    const DeckContextToolbar = await loadDeckToolbar();
    const { editor, calls } = deckEditorWith(selectedType);
    const props = renderToolbar(DeckContextToolbar, { editor, readOnly: true });
    assert.ok(props?.context, "工具条应渲染出 context");
    assert.ok(props.context.controls.length > 0);
    for (const control of props.context.controls) {
      assert.equal(control.disabled, true, `${control.id} 应为 disabled`);
      assert.equal(control.unavailableReason, "你只能查看", `${control.id} 应带原因`);
    }
    // 强行发命令（比如键盘或旧事件）也不能改动
    for (const control of props.context.controls) {
      props.onCommand({ selectionId: props.context.id, controlId: control.id, value: "x" });
    }
    assert.deepEqual(calls, [], "只读时不应调用任何编辑器方法");
  });
}

test("PPT 工具条：可写时控件不被只读灰掉（至少有一个可用）；不传 readOnly 时取编辑器自己的只读状态", async () => {
  const DeckContextToolbar = await loadDeckToolbar();
  const open = deckEditorWith("text");
  const openProps = renderToolbar(DeckContextToolbar, { editor: open.editor });
  assert.ok(openProps.context.controls.some((control) => !control.disabled));
  assert.ok(openProps.context.controls.every((control) => control.unavailableReason !== "你只能查看"));
  const locked = deckEditorWith("text");
  locked.editor.readOnly = true;
  const lockedProps = renderToolbar(DeckContextToolbar, { editor: locked.editor });
  assert.ok(lockedProps.context.controls.every((control) => control.disabled === true));
});

// ---------------------------------------------------------------- 图片工具条与指令面

function imageEditorWith() {
  const doc = { width: 800, height: 600 };
  return fakeEditor({
    loading: false,
    cropping: false,
    doc,
    layers: [{ id: "l1", locked: false, selected: true, kind: "text" }],
    // Match the native ImageSelectedInfo text shape; it is not a bare string.
    selected: { id: "l1", kind: "text", locked: false, type: "text",
      text: { value: "你好", fontFamily: "Arial", fontSize: 24, fill: "#111111",
        bold: false, italic: false, underline: false, linethrough: false,
        align: "left", lineHeight: 1.2, charSpacing: 0 },
      fill: "#111111", opacity: 1, shadow: { enabled: false } },
    filterInfo: null,
    transformInfo: null,
    canvasBackground: "#ffffff",
    cropRatio: "free",
    editRevision: 2,
    zoom: 1,
    dirty: false,
    aiAvailable: true,
    aiBusy: false,
    exportFormat: "png",
    exportQuality: 90,
  });
}

test("图片浮条：只读时每个控件 disabled 并带「你只能查看」，命令不改画布", async () => {
  const { FabricImageContextToolbar } = await import(
    await compileSelectionAdapterHost("src/shell/image-editor/use-fabric-image-selection-adapter.ts", "useFabricImageSelectionAdapter", "FabricImageContextToolbar", {
      "../../i18n/ui/useUI": useUiStub,
      "../SelectionToolbar": toolbarStub,
    })
  );
  const { editor, calls } = imageEditorWith();
  const props = renderToolbar(FabricImageContextToolbar, { editor, readOnly: true });
  assert.ok(props?.context, "选中对象时应有浮条");
  assert.ok(props.context.controls.length > 0);
  for (const control of props.context.controls) {
    assert.equal(control.disabled, true, `${control.id} 应为 disabled`);
    assert.equal(control.unavailableReason, "你只能查看");
    props.onCommand({ selectionId: props.context.id, controlId: control.id, value: true });
  }
  assert.deepEqual(calls, []);
  // 编辑器自带的 collab.readOnly 也算只读
  const own = imageEditorWith();
  own.editor.collab = { readOnly: true };
  const ownProps = renderToolbar(FabricImageContextToolbar, { editor: own.editor });
  assert.ok(ownProps.context.controls.every((control) => control.disabled === true));
});

test("DeckRoute 接线：只读上下文与后台任务锁，工具条 / 面板 / 上传 / 撤销受保护", () => {
  const src = readFileSync(new URL("../src/shell/advanced-routes/DeckRoute.tsx", import.meta.url), "utf8");
  assert.match(src, /useEditorContext\(buildDeckContext\(editor\)\)/);
  assert.match(src, /readOnly: collabReadOnly \|\| aiReadOnly/);
