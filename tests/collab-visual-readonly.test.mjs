// F08（work-chat 第二轮）：PPT / 图表 / 图片「只能看」。
// 只有查看权限的人，或别人正占着编辑时：工具条、浮条里每个改动类按钮 disabled 且带「你只能查看」，
// 查看类照旧；面板整块 fieldset disabled；Leo 的「帮我改」（指令面）、AI 入口、上传入口都不改作品。
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { normalizeDeckDocument } from "../src/shell/doc-editors/deck-schema.ts";
import { normalizeChartDocument } from "../src/shell/chart-editor/chart-schema.ts";
import {
  guardPluginSurface,
  guardVisualCommands,
  viewOnlyContext,
  viewOnlyUploadHandler,
  VIEW_ONLY_HINT,
  VIEW_ONLY_REFUSAL,
} from "../src/shell/collab/adapters/visual-readonly.ts";
import { createChartCommandSurface } from "../src/shell/chart-editor/chart-command-surface.ts";
import { createImageCommandSurface } from "../src/shell/image-editor/image-command-surface.ts";
import { buildDeckCommandSurface } from "../src/shell/doc-editors/doc-family-commands.ts";
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

test("guardVisualCommands / guardPluginSurface：mutates 的指令拒绝，查看类照跑", async () => {
  let ran = [];
  const definitions = [
    { spec: { id: "e.edit", label: "改", summary: "", mutates: true }, run: () => (ran.push("edit"), { ok: true, message: "改了" }) },
    { spec: { id: "e.export", label: "导", summary: "", mutates: false }, run: () => (ran.push("export"), { ok: true, message: "导了" }) },
  ];
  const open = guardVisualCommands(definitions, false);
  assert.equal(open, definitions);
  const locked = guardVisualCommands(definitions, true);
  assert.deepEqual(await locked[0].run({}), { ok: false, message: VIEW_ONLY_REFUSAL });
  assert.equal((await locked[1].run({})).ok, true);
  assert.deepEqual(ran, ["export"]);

  const surface = {
    editorId: "e",
    describe: () => definitions.map((d) => d.spec),
    state: () => ({ a: 1 }),
    run: (id) => definitions.find((d) => d.spec.id === id).run({}),
  };
  ran = [];
  const guarded = guardPluginSurface(surface, true);
  assert.equal(guardPluginSurface(surface, false), surface);
  assert.equal((await guarded.run("e.edit")).ok, false);
  assert.equal((await guarded.run("e.export")).ok, true);
  assert.deepEqual(guarded.state(), { a: 1 });
  assert.deepEqual(ran, ["export"]);
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
      await compileModule("src/shell/doc-editors/DeckContextToolbar.tsx", {
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

// ---------------------------------------------------------------- 图表工具条与指令面

function chartDocument() {
  return normalizeChartDocument({
    schema: "oceanleo.chart.v1",
    version: 1,
    title: "销量",
    option: {
      title: { text: "季度销量" },
      xAxis: { type: "category", data: ["Q1", "Q2", "Q3"] },
      yAxis: { type: "value" },
      series: [
        { id: "a", name: "A", type: "bar", data: [1, 2, 3] },
        { id: "b", name: "B", type: "line", data: [3, 2, 1] },
      ],
    },
  });
}

function chartEditorWith(readOnly) {
  return fakeEditor({
    document: chartDocument(),
    activeSeriesId: "a",
    editRevision: 3,
    loading: false,
    sourceReady: true,
    carrierState: "ready",
    dirty: false,
    readOnly,
  });
}

test("图表工具条：只读时改动类全灰，只有「切换当前系列」可用；命令不改图表", async () => {
  const { ChartContextToolbar } = await import(
    await compileModule("src/shell/chart-editor/ChartContextToolbar.tsx", {
      "../../i18n/ui/useUI": useUiStub,
      "../SelectionToolbar": toolbarStub,
    })
  );
  const { editor, calls } = chartEditorWith(false);
  const props = renderToolbar(ChartContextToolbar, { editor, readOnly: true });
  assert.ok(props?.context);
  const enabled = props.context.controls.filter((control) => !control.disabled).map((control) => control.id);
  assert.deepEqual(enabled, ["series-selector"]);
  for (const control of props.context.controls.filter((c) => c.disabled)) {
    assert.equal(control.unavailableReason, "你只能查看");
  }
  for (const control of props.context.controls) {
    if (control.id === "series-selector") continue;
    props.onCommand({
      selectionId: props.context.id,
      selectionRevision: 3,
      controlId: control.id,
      value: control.kind === "toggle" ? true : "新值",
    });
  }
  assert.deepEqual(calls, [], "只读时不应调用任何编辑器方法");
  // 可写时同样的命令是会生效的（证明上面的 [] 不是因为命令本身无效）
  const writable = chartEditorWith(false);
  const writableProps = renderToolbar(ChartContextToolbar, { editor: writable.editor, readOnly: false });
  writableProps.onCommand({
    selectionId: writableProps.context.id,
    selectionRevision: 3,
    controlId: "title",
    value: "新标题",
  });
  assert.ok(writable.calls.length > 0, "可写时改标题应调用编辑器");
});

test("图表指令面（Leo 帮我改）：只读时 mutates 指令拒绝且不碰编辑器，导出照常；可写时照改", async () => {
  const deliveries = [];
  const locked = chartEditorWith(true);
  const surface = createChartCommandSurface({ editor: locked.editor, deliver: async (format) => void deliveries.push(format) });
  const denied = await surface.run("chart-editor@1.set-title", { title: "偷改" });
  assert.equal(denied.ok, false);
  assert.equal(denied.message, VIEW_ONLY_REFUSAL);
  assert.deepEqual(locked.calls, []);
  const exported = await surface.run("chart-editor@1.export", { format: "png" });
  assert.equal(exported.ok, true);
  assert.deepEqual(deliveries, ["png"]);

  const open = chartEditorWith(false);
  const openSurface = createChartCommandSurface({ editor: open.editor, deliver: async () => undefined });
  const allowed = await openSurface.run("chart-editor@1.set-title", { title: "新标题" });
  assert.equal(allowed.ok, true);
  assert.deepEqual(open.calls[0], ["setTitle", "新标题"]);
});

// ---------------------------------------------------------------- 图片工具条与指令面

function imageEditorWith() {
  const doc = { width: 800, height: 600 };
  return fakeEditor({
    loading: false,
    cropping: false,
    doc,
    layers: [{ id: "l1", locked: false, selected: true, kind: "text" }],
    selected: { id: "l1", kind: "text", locked: false, type: "text", text: "你好", fill: "#111111", opacity: 1, shadow: { enabled: false } },
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
    await compileModule("src/shell/image-editor/FabricImageContextToolbar.tsx", {
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

test("图片指令面（Leo 帮我改，含 AI 能力）：只读时全部 mutates 指令拒绝，导出照常", async () => {
  const ranAi = [];
  const { editor, calls } = imageEditorWith();
  editor.collab = { readOnly: true };
  const surface = createImageCommandSurface({
    editor,
    deliver: async () => undefined,
    runAi: async (request) => (ranAi.push(request.id), { ok: true, message: "排上了" }),
  });
  const mutating = surface.describe().filter((spec) => spec.mutates);
  assert.ok(mutating.length >= 5, "应当同时列出基础编辑与 AI 指令");
  for (const spec of mutating) {
    const params = Object.fromEntries(
      (spec.params || []).map((param) => [
        param.key,
        param.type === "enum" ? param.enumValues[0].value : param.type === "number" ? 10 : "x",
      ]),
    );
    const result = await surface.run(spec.id, params);
    assert.equal(result.ok, false, `${spec.id} 只读时应拒绝`);
    assert.equal(result.message, VIEW_ONLY_REFUSAL, spec.id);
  }
  assert.deepEqual(calls, []);
  assert.deepEqual(ranAi, []);
  const exported = await surface.run("image.export", { format: "png" });
  assert.equal(exported.ok, true);
});

// ---------------------------------------------------------------- PPT 指令面（Leo 帮我改）

test("PPT 指令面：只读时（经 DeckRoute 的闸）mutates 指令全部拒绝且不碰文稿，导出类照常", async () => {
  const { editor, calls } = deckEditorWith(null);
  Object.assign(editor, { loading: false, dirty: false, editRevision: 5, error: "" });
  const downloads = [];
  const raw = buildDeckCommandSurface(editor, { download: async (ext) => (downloads.push(ext), "") });
  const guarded = guardPluginSurface(raw, true);
  const specs = guarded.describe();
  const mutating = specs.filter((spec) => spec.mutates);
  assert.ok(mutating.length >= 3, "PPT 应当有多条会改文稿的指令");
  for (const spec of mutating) {
    const params = Object.fromEntries(
      (spec.params || []).map((param) => [
        param.key,
        param.type === "enum" ? param.enumValues[0].value : param.type === "number" ? 1 : "x",
      ]),
    );
    const result = await guarded.run(spec.id, params);
    assert.equal(result.ok, false, `${spec.id} 只读时应拒绝`);
    assert.equal(result.message, VIEW_ONLY_REFUSAL);
  }
  assert.deepEqual(calls, []);
  const viewSpec = specs.find((spec) => !spec.mutates);
  assert.ok(viewSpec, "应保留查看类指令");
});

test("DeckRoute 接线：指令面经只读闸、工具条 / 面板 / 上传 / 撤销都吃同一个 viewOnly", () => {
  const src = readFileSync(new URL("../src/shell/advanced-routes/DeckRoute.tsx", import.meta.url), "utf8");
  assert.match(src, /usePluginCommandSurface\(\s*buildDeckCommandSurface\(editor, \{ download: downloadAs \}, viewOnly\)/);
  assert.match(src, /guardPluginSurface\(buildRawDeckCommandSurface\(editor, deps\), readOnly\)/);
  assert.match(src, /<DeckContextToolbar[\s\S]*?readOnly=\{viewOnly\}/);
  assert.match(src, /viewOnlyUploadHandler\(viewOnly, addLocalFiles\)/);
  assert.match(src, /canUndo: editor\.canUndo && !viewOnly/);
  assert.equal((src.match(/<VisualViewOnlyPanel readOnly=\{viewOnly\}>/g) || []).length, 12, "十二个面板都包了只读外壳");
});

test("ChartRoute / ImageRoute 接线：工具条、面板、上传、撤销都吃同一个 viewOnly；图片素材与 AI 入口各挡一次", () => {
  const chart = readFileSync(new URL("../src/shell/advanced-routes/ChartRoute.tsx", import.meta.url), "utf8");
  assert.match(chart, /<ChartContextToolbar editor=\{editor\} accent=\{accent\} readOnly=\{viewOnly\} \/>/);
  assert.match(chart, /<VisualViewOnlyPanel readOnly=\{viewOnly\}>\s*<ChartControls/);
  assert.match(chart, /viewOnlyUploadHandler\(viewOnly, importLocalData\)/);
  assert.match(chart, /canUndo: editor\.canUndo && !viewOnly/);
  const image = readFileSync(new URL("../src/shell/advanced-routes/ImageRoute.tsx", import.meta.url), "utf8");
  assert.match(image, /<FabricImageContextToolbar editor=\{editor\} accent=\{accent\} readOnly=\{viewOnly\} \/>/);
  assert.match(image, /viewOnlyUploadHandler\(viewOnly, addLocalImages\)/);
  assert.match(image, /if \(viewOnly\) return \{ ok: false, message: VIEW_ONLY_REFUSAL \};/);
  assert.match(image, /if \(viewOnly\) throw new Error\(VIEW_ONLY_REFUSAL\);/);
  assert.match(image, /<VisualViewOnlyPanel readOnly=\{viewOnly\}><FabricImageAiPanel/);
  // 导出面板是查看类，不包
  assert.doesNotMatch(image, /<VisualViewOnlyPanel[^>]*><FabricImageExportPanel/);
  // 内核入口：AI 改图在导出画布、调模型之前就挡住
  const hook = readFileSync(new URL("../src/shell/image-editor/use-fabric-image-editor.ts", import.meta.url), "utf8");
  const start = hook.indexOf("const runAiEdit = useCallback");
  assert.ok(start > 0);
  const body = hook.slice(start, start + 700);
  assert.ok(body.indexOf("optionsRef.current.collab?.readOnly") > 0 && body.indexOf("optionsRef.current.collab?.readOnly") < body.indexOf("makeExportBlob"));
});

test("PPT 「新建一页」按钮（舞台栏与页面栏）只读时 disabled 且提示「你只能查看」；快捷键只读时只留翻页", () => {
  for (const path of ["src/shell/doc-editors/DeckStage.tsx", "src/shell/doc-editors/DeckSlideRail.tsx"]) {
    const src = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(src, /onClick=\{editor\.addSlide\}\s*disabled=\{editor\.readOnly\}/, path);
    assert.match(src, /title=\{editor\.readOnly \? tt\("你只能查看"\) : tt\("新建一页"\)\}/, path);
  }
  const shortcuts = readFileSync(new URL("../src/shell/doc-editors/use-deck-stage-shortcuts.ts", import.meta.url), "utf8");
  const gate = shortcuts.indexOf("if (currentEditor.readOnly) {");
  assert.ok(gate > 0, "只读分支存在");
  assert.ok(gate < shortcuts.indexOf("currentEditor.undo()"), "只读分支在撤销 / 复制 / 删除 / 挪动之前就返回");
  assert.ok(gate < shortcuts.indexOf("currentEditor.deleteElement()"));
  assert.ok(gate < shortcuts.indexOf("patchElementTransient"));
});

test("PPT 「新建一页」按钮（舞台栏与页面栏）只读时 disabled 且提示「你只能查看」；快捷键只读时只留翻页", () => {
  for (const path of ["src/shell/doc-editors/DeckStage.tsx", "src/shell/doc-editors/DeckSlideRail.tsx"]) {
    const src = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(src, /onClick=\{editor\.addSlide\}\s*disabled=\{editor\.readOnly\}/, path);
    assert.match(src, /title=\{editor\.readOnly \? tt\("你只能查看"\) : tt\("新建一页"\)\}/, path);
  }
  const shortcuts = readFileSync(new URL("../src/shell/doc-editors/use-deck-stage-shortcuts.ts", import.meta.url), "utf8");
  const gate = shortcuts.indexOf("if (currentEditor.readOnly) {");
  assert.ok(gate > 0, "只读分支存在");
  assert.ok(gate < shortcuts.indexOf("currentEditor.undo()"), "只读分支在撤销 / 复制 / 删除 / 挪动之前就返回");
  assert.ok(gate < shortcuts.indexOf("currentEditor.deleteElement()"));
  assert.ok(gate < shortcuts.indexOf("patchElementTransient"));
});

// ---------------------------------------------------------------- 真渲染：用真的 SelectionToolbar 画出来看按钮

/** 渲染结果里「还能点」的改动类控件：没 disabled 的、不是「打开面板」的 button / select / input。 */
function enabledMutatingTags(html, allowLabels = []) {
  const tags = html.match(/<(?:button|select|input|textarea)\b[^>]*>/g) || [];
  return tags.filter((tag) => {
    if (/\sdisabled=""/.test(tag)) return false;
    if (/tabindex="-1"/.test(tag)) return false; // 量宽用的隐藏副本，用户点不到
    if (/aria-haspopup="dialog"/.test(tag)) return false; // 打开面板的入口：面板里的控件另有 disabled
    if (/data-edit-bar-interactive/.test(tag)) return false; // 「更多属性」入口
    if (allowLabels.some((label) => tag.includes(`aria-label="${label}"`))) return false;
    return true;
  });
}

test("真渲染：图表浮条只读时，除「切换当前系列」与打开面板的入口外没有可点的改动按钮；可写时有", async () => {
  const { ChartContextToolbar } = await import(
    await compileModule("src/shell/chart-editor/ChartContextToolbar.tsx", { "../../i18n/ui/useUI": useUiStub })
  );
  const locked = renderToStaticMarkup(
    React.createElement(ChartContextToolbar, { editor: chartEditorWith(false).editor, readOnly: true }),
  );
  assert.match(locked, /disabled=""/);
  assert.match(locked, /title="图例：你只能查看"/);
  assert.deepEqual(enabledMutatingTags(locked, ["当前系列（单选）"]), []);
  assert.match(locked, /aria-label="当前系列（单选）"/, "查看类控件仍在");
  const open = renderToStaticMarkup(
    React.createElement(ChartContextToolbar, { editor: chartEditorWith(false).editor, readOnly: false }),
  );
  assert.ok(enabledMutatingTags(open, ["当前系列（单选）"]).length > 0, "可写时应有可点的改动按钮（证明上面的空数组不是渲染不出东西）");
  assert.doesNotMatch(open, /你只能查看/);
});

for (const selectedType of ["text", "shape", "image"]) {
  test(`真渲染：PPT 浮条（选中${selectedType}）只读时没有可点的改动按钮；可写时有`, async () => {
    const { DeckContextToolbar } = await import(
      await compileModule("src/shell/doc-editors/DeckContextToolbar.tsx", { "../../i18n/ui/useUI": useUiStub })
    );
    const locked = renderToStaticMarkup(
      React.createElement(DeckContextToolbar, { editor: deckEditorWith(selectedType).editor, readOnly: true }),
    );
    assert.match(locked, /你只能查看/);
    assert.deepEqual(enabledMutatingTags(locked), []);
    const open = renderToStaticMarkup(
      React.createElement(DeckContextToolbar, { editor: deckEditorWith(selectedType).editor, readOnly: false }),
    );
    assert.ok(enabledMutatingTags(open).length > 0);
  });
}

test("真渲染：图片浮条只读时没有可点的改动按钮；可写时有", async () => {
  const { FabricImageContextToolbar } = await import(
    await compileModule("src/shell/image-editor/FabricImageContextToolbar.tsx", { "../../i18n/ui/useUI": useUiStub })
  );
  const locked = renderToStaticMarkup(
    React.createElement(FabricImageContextToolbar, { editor: imageEditorWith().editor, readOnly: true }),
  );
  assert.match(locked, /你只能查看/);
  assert.deepEqual(enabledMutatingTags(locked), []);
  const open = renderToStaticMarkup(
    React.createElement(FabricImageContextToolbar, { editor: imageEditorWith().editor, readOnly: false }),
  );
  assert.ok(enabledMutatingTags(open).length > 0);
});
