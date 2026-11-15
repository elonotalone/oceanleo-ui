import "./helpers/w1-jsdom-window.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, FontSize, FontFamily, Color } from "@tiptap/extension-text-style";
import { Highlight } from "@tiptap/extension-highlight";
import { EDITOR_OVERHAUL_W08_COPY } from "../src/i18n/ui/messages/editor-overhaul-copy-w08.ts";
import { EDITOR_PANELS_MESSAGES } from "../src/i18n/ui/messages/editor-panels-copy.ts";
import { attachReviewSidecar, readReviewSidecar } from "../src/shell/doc-editors/richdoc-review/review-types.ts";
import { columnResizingPluginKey } from "@tiptap/pm/tables";
import { TableKit } from "@tiptap/extension-table";
import JSZip from "jszip";
import { RichDocTypography, richDocDocxCellProperties } from "../src/shell/doc-editors/rich-doc-model.ts";
import { RichDocImage, normalizeRichDocImageTransform, richDocImageGeometry, richDocImageSvg } from "../src/shell/doc-editors/rich-doc-image-transform.ts";
import { RichDocImageStyle } from "../src/shell/doc-editors/rich-doc-image-style.ts";
import { tiptapJsonToDocxBlob } from "../src/shell/doc-editors/rich-doc-docx.ts";
import { richDocReviewExtensions } from "../src/shell/doc-editors/richdoc-review/review-marks.ts";
import { clearRichDocFormatting, richDocTrackChangesExtension, listChanges, rejectAllChanges, acceptAllChanges } from "../src/shell/doc-editors/richdoc-review/track-changes.ts";
import { buildRichDocCommandSurface } from "../src/shell/doc-editors/doc-family-commands.ts";
import { canonicalSelectionControls } from "../src/shell/edit-bar-canon-projection.ts";
import { partitionSelectionInspectorControls } from "../src/shell/selection-inspector-groups.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const { createRoot } = await import("react-dom/client");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
for (const name of ["Event", "KeyboardEvent", "MouseEvent", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"]) {
  globalThis[name] = typeof window[name] === "function" && ["getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"].includes(name) ? window[name].bind(window) : window[name];
}
globalThis.innerHeight = window.innerHeight;
window.scrollTo = () => {};
const stub = { "../../i18n/ui/useUI": dataModule("const tt=s=>s;export function useUI(){return tt;}") };
const { resolveSelectionAdapterContext } = await import(await compileModule("src/shell/selection-adapter.ts", stub));
const { useRichDocSelectionAdapter } = await import(await compileModule("src/shell/doc-editors/use-rich-doc-selection-adapter.ts", stub));
const { RichDocControls, RichDocFindReplace, RichDocImageCropControls } = await import(await compileModule("src/shell/doc-editors/RichDocControls.tsx", stub));
const { useRichDocFindShortcut } = await import(await compileModule("src/shell/doc-editors/use-rich-doc-find-shortcut.ts"));
const { RichDocCommentRail } = await import(await compileModule("src/shell/doc-editors/richdoc-review/RichDocCommentRail.tsx", { "../../../i18n/ui/useUI": stub["../../i18n/ui/useUI"] }));
const { useRichDocReview } = await import(await compileModule("src/shell/doc-editors/richdoc-review/use-richdoc-review.ts"));
const { RichDocReviewReadOnlyContext } = await import("../src/shell/doc-editors/richdoc-review/review-readonly-context.ts");
window.HTMLElement.prototype.scrollIntoView = () => {};
const attribution = { author: "tester", authorName: "测试者" };
function engine(content = "<p>Abc def</p>", track = false, getAttribution = () => attribution) {
  return new Editor({ extensions: [StarterKit, TextStyle, FontSize, FontFamily, Color, Highlight.configure({ multicolor: true }),
    RichDocTypography, RichDocImage.configure({ allowBase64: true }), RichDocImageStyle, TableKit.configure({ table: { resizable: true } }),
    ...richDocReviewExtensions(), richDocTrackChangesExtension({ isEnabled: () => track, getAttribution })],
    content, editorProps: { handleScrollToSelection: () => true } });
}
async function mount(element) {
  const node = document.createElement("div"); document.body.append(node); const root = createRoot(node);
  await act(async () => root.render(element));
  return { node, render: element => act(async () => root.render(element)), async close() { await act(async () => root.unmount()); node.remove(); } };
}
async function adapterHost(editor) {
  let adapter, cropOpened = 0;
  const state = { editor, sourceReady: true, loading: false, sourceFailed: false, editRevision: 1 };
  function Host() { adapter = useRichDocSelectionAdapter({ editor: state, onCrop: () => cropOpened++ }); return null; }
  const host = await mount(React.createElement(Host));
  return { ...host, get adapter() { return adapter; }, get cropOpened() { return cropOpened; }, get context() { return adapter.context; }, async send(controlId, value) {
    await act(async () => { adapter.dispatch({ requestId: "test", selectionId: adapter.context.id, selectionRevision: 1, controlId, value }); await new Promise(done => requestAnimationFrame(done)); });
  } };
}
const xmlOf = async blob => (await JSZip.loadAsync(await blob.arrayBuffer())).file("word/document.xml").async("string");
function reopen(editor, format = "json") { return engine(format === "json" ? JSON.parse(JSON.stringify(editor.getJSON())) : editor.getHTML()); }

test("RichDoc text canon exposes real px spacing and case; unsupported vertical layout stays absent", async () => {
  const editor = engine(); editor.commands.setTextSelection({ from: 1, to: 8 });
  const host = await adapterHost(editor);
  try {
    const controls = canonicalSelectionControls(resolveSelectionAdapterContext(host.context)).controls;
    const spacing = controls.find(control => control.id === "letter-spacing");
    assert.deepEqual([spacing.kind, spacing.unit, spacing.suffix, spacing.step, spacing.placement], ["number", "px", "px", 1, "more"]);
    assert.equal(controls.find(control => control.id === "case").kind, "action");
    assert.ok(!controls.some(control => ["vertical-text", "cn-typography", "typography-reset"].includes(control.id)));
    await host.send("letter-spacing", 3);
    assert.match(editor.getHTML(), /letter-spacing: 3px/);
    for (const format of ["json", "html"]) { const next = reopen(editor, format); assert.equal(next.getJSON().content[0].content[0].marks.find(mark => mark.type === "textStyle").attrs.letterSpacing, 3); next.destroy(); }
    const xml = await xmlOf(await tiptapJsonToDocxBlob("Spacing", editor.getJSON()));
    assert.match(xml, /<w:spacing w:val="45"\/>/);
    assert.match(xml, />Abc def<\/w:t>/);
    assert.doesNotMatch(xml, /RICHDOC[a-f0-9]{32}X/);
    await host.send("case", "upper");
    assert.equal(editor.getText(), "ABC DEF");
    const next = reopen(editor); assert.equal(next.getText(), "ABC DEF"); next.destroy();
    assert.match(await xmlOf(await tiptapJsonToDocxBlob("Case", editor.getJSON())), />ABC DEF<\/w:t>/);
    await host.send("case", "lower"); assert.equal(editor.getText(), "abc def");
    await host.send("case"); assert.equal(editor.getText(), "ABC DEF");
    await host.send("case"); assert.equal(editor.getText(), "abc def");
    const literal = "<&$&$`$'>";
    const symbols = engine({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: literal, marks: [{ type: "textStyle", attrs: { letterSpacing: -1 } }] }] }] });
    try {
      const escaped = await xmlOf(await tiptapJsonToDocxBlob("Symbols", symbols.getJSON()));
      const parsed = new DOMParser().parseFromString(escaped, "text/xml");
      assert.ok([...parsed.getElementsByTagName("w:t")].some(node => node.textContent === literal), "DOCX spacing must preserve replacement metacharacters and XML symbols verbatim");
      assert.match(escaped, /<w:spacing w:val="-15"\/>/);
    } finally { symbols.destroy(); }

  } finally { await host.close(); editor.destroy(); }
});

test("caret font/size is storedMarks for subsequent typing; range font changes only selected characters", async () => {
  const editor = engine("<p>ABCD</p>"); editor.commands.setTextSelection(3);
  const host = await adapterHost(editor);
  try {
    await host.send("font-family", "Georgia"); await host.send("font-size", 27);
    assert.equal(editor.getJSON().content[0].content[0].marks, undefined, "caret format must not rewrite existing text");
    assert.equal(editor.state.storedMarks.find(mark => mark.type.name === "textStyle").attrs.fontFamily, "Georgia");
    await act(async () => editor.commands.insertContent("x"));
    assert.equal(editor.getText(), "ABxCD");
    const inserted = editor.getJSON().content[0].content.find(node => node.text === "x");
    assert.equal(inserted.marks[0].attrs.fontFamily, "Georgia"); assert.equal(inserted.marks[0].attrs.fontSize, "27px");
    await act(async () => editor.commands.setTextSelection({ from: 1, to: 3 }));
    await host.send("font-family", "Arial"); await host.send("font-size", 19);
    const next = reopen(editor); const content = next.getJSON().content[0].content;
    assert.equal(content[0].text, "AB"); assert.equal(content[0].marks[0].attrs.fontFamily, "Arial");
    assert.equal(content[0].marks[0].attrs.fontSize, "19px"); assert.equal(content.at(-1).text, "CD"); assert.equal(content.at(-1).marks, undefined); next.destroy();
  } finally { await host.close(); editor.destroy(); }
});

test("toolbar, keyboard and agent inline formatting all become rejectable trackedFormat with reopen/undo", async () => {
  for (const source of ["toolbar", "keyboard", "agent"]) {
    const editor = engine("<p>hello</p>", true); editor.commands.setTextSelection({ from: 1, to: 6 });
    const host = await adapterHost(editor);
    try {
      if (source === "toolbar") await host.send("font-family", "Georgia");
      if (source === "keyboard") await act(async () => editor.commands.keyboardShortcut("Mod-b"));
      if (source === "agent") { const surface = buildRichDocCommandSurface({ editor, sourceReady: true, loading: false, editRevision: 1, item: { id: "test" } }, { download: async () => "" }); await act(async () => assert.equal((await surface.run("richdoc.set-font-size", { size: 24 })).ok, true)); }
      const changes = listChanges(editor.state.doc); assert.equal(changes.length, 1, source); assert.equal(changes[0].kind, "format", source);
      const next = reopen(editor); assert.equal(listChanges(next.state.doc).length, 1); const tr = next.state.tr; rejectAllChanges(tr); next.view.dispatch(tr);
      assert.equal(next.getJSON().content[0].content[0].marks, undefined, `${source} rejection restores original marks`); next.destroy();
      await act(async () => editor.commands.undo()); assert.equal(listChanges(editor.state.doc).length, 0, `${source} undo removes both format and tracking`);
    } finally { await host.close(); editor.destroy(); }
  }
});

test("repeated and mixed formatting records earliest before, supports accept/reject and ignores readonly/load/history", () => {
  const editor = engine("<p><strong>ab</strong>cd</p>", true); editor.commands.setTextSelection({ from: 1, to: 5 });
  try {
    editor.commands.setFontFamily("Georgia"); editor.commands.setFontFamily("Arial");
    assert.equal(listChanges(editor.state.doc).length, 1);
    const tr = editor.state.tr; rejectAllChanges(tr); editor.view.dispatch(tr);
    assert.match(editor.getHTML(), /<strong>ab<\/strong>cd/);
    assert.equal(editor.getHTML().includes("font-family"), false);
    editor.commands.setColor("#123456"); const accept = editor.state.tr; acceptAllChanges(accept); editor.view.dispatch(accept);
    assert.equal(listChanges(editor.state.doc).length, 0); assert.match(editor.getHTML(), /rgb\(18, 52, 86\)/);
    editor.view.dispatch(editor.state.tr.addMark(1, 2, editor.schema.marks.italic.create()).setMeta("addToHistory", false));
    assert.equal(listChanges(editor.state.doc).length, 0);
  } finally { editor.destroy(); }
});

test("embedded image canon transforms persist through JSON and HTML, with the same export geometry", async () => {
  const editor = engine({ type: "doc", content: [{ type: "image", attrs: { src: "https://files.example/image.png", width: 400, height: 240 } }] });
  editor.commands.setNodeSelection(0); const host = await adapterHost(editor);
  try {
    const projected = canonicalSelectionControls(resolveSelectionAdapterContext(host.context));
    const compact = partitionSelectionInspectorControls(projected.controls).compact;
    for (const [id, kind] of [["crop", "action"], ["flip-x", "action"], ["flip-y", "action"], ["rotate", "action"], ["adjust", "panel"], ["image-fit", "select"]]) assert.equal(compact.find(control => control.canonId === id)?.kind, kind, id);
    await host.send("crop"); assert.equal(host.cropOpened, 1);
    const cropPanel = await mount(React.createElement(RichDocImageCropControls, { editor: { editor, editRevision: 1 }, selection: host.adapter }));
    try {
      for (const [label, value] of [["左", "10"], ["顶端", "20"]]) {
        const input = cropPanel.node.querySelector(`[aria-label="${label}"]`);
        await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
      }
    } finally { await cropPanel.close(); }
    for (const [id, value] of [["flip-x"], ["flip-y"], ["rotate"], ["richdoc.brightness", 125], ["richdoc.contrast", 80], ["richdoc.saturation", 60], ["image-fit", "cover"], ["radius", 12], ["border-width", 3], ["opacity", 65]]) await host.send(id, value);
    const expected = normalizeRichDocImageTransform(editor.getJSON().content[0].attrs);
    assert.deepEqual([expected.cropLeft, expected.cropTop, expected.flipX, expected.flipY, expected.rotation, expected.brightness, expected.contrast, expected.saturation, expected.imageFit], [10, 20, true, true, 90, 125, 80, 60, "cover"]);
    assert.match(editor.getHTML(), /overflow:\s*hidden/); assert.match(editor.getHTML(), /object-fit:\s*cover/); assert.match(editor.getHTML(), /rotate\(90deg\) scale\(-1,-1\)/);
    for (const format of ["json", "html"]) { const next = reopen(editor, format); const image = next.getJSON().content.find(node => node.type === "image"); assert.ok(image, format); assert.deepEqual(normalizeRichDocImageTransform(image.attrs), expected, format); assert.deepEqual([image.attrs.radius, image.attrs.borderWidth, image.attrs.opacity], [12, 3, 65]); next.destroy(); }
    const svg = richDocImageSvg(editor.getJSON().content[0].attrs, "data:image/png;base64,AAAA");
    assert.match(svg, /rotate\(90\) scale\(-1 -1\)/); assert.match(svg, /values="0.6"/); assert.match(svg, /preserveAspectRatio="xMidYMid slice"/);
    const geometry = richDocImageGeometry(editor.getJSON().content[0].attrs);
    assert.deepEqual([geometry.cropWidth, geometry.cropHeight, geometry.frameWidth, geometry.frameHeight], [360, 192, 192, 360], "a quarter turn must retain the whole cropped image, not clip it back into the old frame");
    assert.match(svg, /viewBox="0 0 192 360"/);
    assert.match(svg, /<clipPath id="crop"><rect width="360" height="192"/);
    assert.ok(!svg.includes("https://"));
    const filter = new DOMParser().parseFromString(svg, "image/svg+xml").querySelector("filter");
    assert.equal(filter.getAttribute("filterUnits"), "userSpaceOnUse");
    assert.ok(Number(filter.getAttribute("width")) <= 5000, "crop expansion must not allocate a filter surface proportional to the enlarged source");
  } finally { await host.close(); editor.destroy(); }
});

test("DOCX embeds each transformed image separately and keeps engine attributes out of export bookkeeping", async () => {
  const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVioAAAAASUVORK5CYII=", "base64"));
  const previousFetch = globalThis.fetch; globalThis.fetch = async () => new Response(png, { headers: { "content-type": "image/png" } });
  const json = { type: "doc", content: [10, 25].map(cropLeft => ({ type: "image", attrs: { src: "https://files.example/shared.png", cropLeft, width: 400, height: 240, rotation: 90 } })) };
  json.content.push({ type: "image", attrs: { src: "https://files.example/shared.png", opacity: 60, borderWidth: 2, borderColor: "rgb(18, 52, 86)" } });
  const before = JSON.stringify(json), calls = [];
  try {
    const blob = await tiptapJsonToDocxBlob("Images", json, {}, async svg => { calls.push(svg); return new Uint8Array([...png, calls.length]); });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    assert.equal(calls.length, 3); assert.notEqual(calls[0], calls[1]); assert.match(calls[2], /opacity="0.6"/); assert.match(calls[2], /stroke="rgb\(18, 52, 86\)"/);
    assert.equal(Object.keys(zip.files).filter(name => name.startsWith("word/media/richdoc-") && name.endsWith(".png")).length, 3);
    const xml = await zip.file("word/document.xml").async("string"); assert.match(xml, /r:embed="rIdRichDocImage0"/); assert.match(xml, /r:embed="rIdRichDocImage1"/);
    assert.equal(JSON.stringify(json), before);
    await assert.rejects(tiptapJsonToDocxBlob("Blocked", json, {}, async () => { throw new Error("raster failed"); }), /raster failed/);
    globalThis.fetch = async () => new Response("missing", { status: 404 });
    await assert.rejects(tiptapJsonToDocxBlob("Missing", json, {}, async () => png), /文档图片导出失败/);
  } finally { globalThis.fetch = previousFetch; }
});

test("Insert offers content and table dimensions; find shortcut works while both drawers are unmounted", async () => {
  const editor = engine(); let opened = 0;
  function Shortcut({ enabled = true }) { useRichDocFindShortcut(enabled, () => opened++); return null; }
  const host = await mount(React.createElement(Shortcut));
  try {
    const key = new KeyboardEvent("keydown", { key: "f", ctrlKey: true, cancelable: true }); window.dispatchEvent(key); assert.equal(key.defaultPrevented, true); assert.equal(opened, 1);
    await host.render(React.createElement(Shortcut, { enabled: false })); window.dispatchEvent(new KeyboardEvent("keydown", { key: "f", metaKey: true })); assert.equal(opened, 1);
    await host.render(React.createElement(RichDocControls, { editor: { editor } }));
    assert.doesNotMatch(host.node.textContent, /文档来源|导入文档|字体|查找和替换|3×3/);
    await act(async () => [...host.node.querySelectorAll("button")].find(button => button.textContent === "表格").click());
    const rowInput = host.node.querySelector('[aria-label="行数"]'); const colInput = host.node.querySelector('[aria-label="列数"]'); assert.ok(rowInput && colInput);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    await act(async () => { setter.call(rowInput, "2"); rowInput.dispatchEvent(new Event("input", { bubbles: true })); rowInput.dispatchEvent(new Event("change", { bubbles: true })); setter.call(colInput, "4"); colInput.dispatchEvent(new Event("input", { bubbles: true })); colInput.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => [...host.node.querySelectorAll("button")].find(button => button.textContent === "插入表格").click());
    const table = editor.getJSON().content.find(node => node.type === "table"); assert.equal(table.content.length, 2); assert.equal(table.content[0].content.length, 4);
    assert.ok(editor.view.dom.querySelector(".tableWrapper"));
    editor.commands.setCellAttribute("colwidth", [192]);
    let cellPos;
    editor.state.doc.descendants((node, pos) => { if (cellPos === undefined && node.type.name === "tableHeader") cellPos = pos; });
    assert.ok(columnResizingPluginKey.getState(editor.state), "real resizable TableKit plugin is installed");
    editor.view.dispatch(editor.state.tr.setMeta(columnResizingPluginKey, { setHandle: cellPos }));
    assert.ok(editor.view.dom.querySelector(".column-resize-handle"));
    editor.view.dom.dispatchEvent(new MouseEvent("mousedown", { clientX: 100, bubbles: true, cancelable: true }));
    assert.ok(columnResizingPluginKey.getState(editor.state).dragging);
    window.dispatchEvent(new MouseEvent("mouseup", { clientX: 148, bubbles: true }));
    const next = reopen(editor); const firstCell = next.getJSON().content.find(node => node.type === "table").content[0].content[0];
    assert.deepEqual(firstCell.attrs.colwidth, [240]); assert.equal(richDocDocxCellProperties(firstCell.attrs).width.size, 3600); next.destroy();
    assert.match(await xmlOf(await tiptapJsonToDocxBlob("Table", editor.getJSON())), /w:tcW w:type="dxa" w:w="3600"/);
    await host.render(React.createElement(RichDocFindReplace, { editor: { editor } })); assert.equal(document.activeElement, host.node.querySelector('[aria-label="查找内容"]'));
    const beforeReplace = editor.getText();
    await host.render(React.createElement(RichDocFindReplace, { editor: { editor, collabReadOnly: true } }));
    for (const [label, value] of [["查找内容", "Abc"], ["替换为", "Changed"]]) {
      const input = host.node.querySelector(`[aria-label="${label}"]`);
      await act(async () => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
    }
    const replace = [...host.node.querySelectorAll("button")].find(button => button.textContent === "全部替换");
    assert.equal(replace.disabled, true, "readonly readers can search but cannot replace");
    await act(async () => replace.click()); assert.equal(editor.getText(), beforeReplace);
    await host.render(React.createElement(RichDocControls, { editor: { editor, collabReadOnly: true } }));
    assert.equal(host.node.querySelector("fieldset").disabled, true, "readonly readers cannot insert content");

  } finally { await host.close(); editor.destroy(); }
});


test("clear-format retains comment anchors and records inline removal; cross-block deletions remain structural", () => {
  const editor = engine("<p><strong>first</strong></p><p>second</p>", true);
  try {
    editor.view.dispatch(editor.state.tr.addMark(1, 6, editor.schema.marks.richdocComment.create({ commentId: "c-1" })).setMeta("addToHistory", false));
    editor.commands.setTextSelection({ from: 1, to: 6 }); clearRichDocFormatting(editor);
    assert.equal(listChanges(editor.state.doc)[0].kind, "format");
    assert.ok(editor.getJSON().content[0].content[0].marks.some(mark => mark.type === "richdocComment"));
    const reject = editor.state.tr; rejectAllChanges(reject); editor.view.dispatch(reject);
    assert.ok(editor.getJSON().content[0].content[0].marks.some(mark => mark.type === "bold"));
    editor.commands.deleteRange({ from: 3, to: 10 });
    assert.equal(listChanges(editor.state.doc).length, 0, "block boundary deletion is explicitly outside tracked inline changes");
  } finally { editor.destroy(); }
});

test("data URI images use real DOCX media parts without network or raster stubs", async () => {
  const source = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVioAAAAASUVORK5CYII=";
  const blob = await tiptapJsonToDocxBlob("Embedded", { type: "doc", content: [{ type: "image", attrs: { src: `data:image/png;base64,${source}` } }] });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const media = Object.keys(zip.files).find(name => name.startsWith("word/media/richdoc-") && name.endsWith(".png"));
  assert.ok(media); assert.equal(Buffer.from(await zip.file(media).async("uint8array")).toString("base64"), source);
  const xml = await zip.file("word/document.xml").async("string");
  assert.match(xml, /<w:drawing>/); assert.doesNotMatch(xml, /RICHDOC[a-f0-9]{32}X/);
  assert.equal(new DOMParser().parseFromString(xml, "text/xml").querySelector("parsererror"), null);
  const svgSource = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>';
  const vector = await tiptapJsonToDocxBlob("Vector", { type: "doc", content: [{ type: "image", attrs: { src: `data:image/svg+xml;base64,${Buffer.from(svgSource).toString("base64")}` } }] });
  const vectorZip = await JSZip.loadAsync(await vector.arrayBuffer());
  const vectorMedia = Object.keys(vectorZip.files).find(name => name.startsWith("word/media/richdoc-") && name.endsWith(".svg"));
  assert.ok(vectorMedia); assert.equal(await vectorZip.file(vectorMedia).async("string"), svgSource);
  const vectorXml = await vectorZip.file("word/document.xml").async("string");
  assert.equal(new DOMParser().parseFromString(vectorXml, "text/xml").querySelector("parsererror"), null);
  const relations = await vectorZip.file("word/_rels/document.xml.rels").async("string");
  for (const match of vectorXml.matchAll(/r:embed="([^"]+)"/g)) assert.ok(relations.includes(`Id="${match[1]}"`), "SVG and fallback PNG must both resolve to copied media relations");

});


test("Comments panel explains selection, creates a real anchored comment and persists its sidecar", async () => {
  const editor = engine(); editor.commands.setTextSelection({ from: 1, to: 4 }); let api;
  function Comments() {
    const [revision, setRevision] = React.useState(1);
    React.useEffect(() => { const update = () => setRevision(value => value + 1); editor.on("transaction", update); return () => { editor.off("transaction", update); }; }, []);
    api = useRichDocReview({ editor, revision, attribution });
    return React.createElement(RichDocReviewReadOnlyContext.Provider, { value: api.readOnly }, React.createElement(RichDocCommentRail, {
      hasSelection: api.hasSelection, onAddComment: api.addComment, comments: api.comments, changes: api.changes,
      activeCommentId: api.activeCommentId, trackChangesEnabled: api.trackChangesEnabled,
      onFocusComment: api.focusComment, onReply: api.replyToComment, onResolve: api.resolveComment, onRemove: api.removeComment,
      onAcceptChange: api.acceptChange, onRejectChange: api.rejectChange, onAcceptAll: api.acceptAllChanges, onRejectAll: api.rejectAllChanges,
    }));
  }
  const host = await mount(React.createElement(Comments));
  try {
    assert.match(host.node.textContent, /选中一段文字即可插入批注/);
    const textarea = host.node.querySelector('textarea[aria-label="插入批注"]');
    await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set.call(textarea, "Review this"); textarea.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => [...host.node.querySelectorAll("button")].find(button => button.textContent === "插入批注").click());
    assert.equal(api.comments.length, 1); assert.equal(api.comments[0].body, "Review this"); assert.equal(api.comments[0].quotedText, "Abc");
    const saved = attachReviewSidecar(editor.getJSON(), api.getSidecar()); const next = engine(JSON.parse(JSON.stringify(saved)));
    assert.equal(readReviewSidecar(saved).comments[0].body, "Review this"); assert.ok(next.getJSON().content[0].content[0].marks.some(mark => mark.type === "richdocComment")); next.destroy();
    await act(async () => editor.commands.setTextSelection(1)); assert.equal(host.node.querySelector('textarea[aria-label="插入批注"]').disabled, true);
    await act(async () => api.setCollabReadOnly(true)); assert.equal(host.node.querySelector('textarea[aria-label="插入批注"]').disabled, true);
  } finally { await host.close(); editor.destroy(); }
});

test("all 16 translations remove retired source/typesetting copy and provide the Table dimensions and image adjustments", () => {
  assert.equal(Object.keys(EDITOR_OVERHAUL_W08_COPY).length, 16);
  for (const [locale, messages] of Object.entries(EDITOR_OVERHAUL_W08_COPY)) {
    for (const key of ["文档来源", "导入文档", "选中文字后，排版与颜色会直接出现在内容上方。", "3×3 表格"]) assert.equal(key in messages, false, `${locale}:${key}`);
    for (const key of ["表格", "行数", "列数", "插入表格", "亮度", "对比度", "饱和度"]) assert.ok(messages[key], `${locale}:${key}`);
  }
  for (const [locale, messages] of Object.entries(EDITOR_PANELS_MESSAGES)) for (const key of ["中文排版", "恢复默认排版"]) assert.equal(key in messages, false, `${locale}:${key}`);
});


test("first image transform preserves its rendered frame and bounds export bitmap size without changing layout", async () => {
  const editor = engine({ type: "doc", content: [{ type: "image", attrs: { src: "https://files.example/portrait.png" } }] });
  editor.commands.setNodeSelection(0);
  Object.defineProperties(editor.view.dom.querySelector("img"), { clientWidth: { value: 120 }, clientHeight: { value: 1800 } });
  const host = await adapterHost(editor);
  try {
    await host.send("flip-x");
    const attrs = editor.getJSON().content[0].attrs;
    assert.deepEqual([attrs.width, attrs.height, attrs.flipX], [120, 1800, true]);
    assert.match(editor.getHTML(), /padding-top: 1500%/);
    const next = reopen(editor); assert.deepEqual([next.getJSON().content[0].attrs.width, next.getJSON().content[0].attrs.height], [120, 1800]); next.destroy();
    const svg = new DOMParser().parseFromString(richDocImageSvg(attrs, "data:image/png;base64,AAAA"), "image/svg+xml").documentElement;
    assert.equal(svg.getAttribute("viewBox"), "0 0 120 1800");
    assert.equal(svg.getAttribute("height"), "1024"); assert.ok(Number(svg.getAttribute("width")) <= 1024);
    const previousFetch = globalThis.fetch;
    const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVioAAAAASUVORK5CYII=", "base64"));
    try {
      globalThis.fetch = async () => new Response(png, { headers: { "content-type": "image/png" } });
      const xml = await xmlOf(await tiptapJsonToDocxBlob("Portrait", editor.getJSON(), {}, async () => png));
      const extent = new DOMParser().parseFromString(xml, "text/xml").getElementsByTagName("wp:extent")[0];
      const width = Number(extent.getAttribute("cx")), height = Number(extent.getAttribute("cy"));
      assert.ok(height <= 760 * 9525); assert.ok(Math.abs(width / height - 120 / 1800) < 0.00001);
      assert.equal(editor.getJSON().content[0].attrs.height, 1800, "page fitting must not rewrite editable image dimensions");
    } finally { globalThis.fetch = previousFetch; }

  } finally { await host.close(); editor.destroy(); }
});


test("coalesced format revisions retain both authors through JSON/HTML reopen and reject as one pending region", () => {
  let author = { author: "alice", authorName: "Alice" };
  const editor = engine("<p>hello</p>", true, () => author);
  try {
    editor.commands.setTextSelection({ from: 1, to: 6 }); editor.commands.setFontFamily("Georgia");
    author = { author: "bob", authorName: "Bob" }; editor.commands.setFontSize("24px");
    const [change] = listChanges(editor.state.doc);
    assert.equal(listChanges(editor.state.doc).length, 1);
    assert.deepEqual(change.contributors.map(value => value.author), ["alice", "bob"]);
    assert.equal(change.authorName, "Alice, Bob"); assert.equal(change.author, "bob");
    for (const format of ["json", "html"]) {
      const next = reopen(editor, format); const [restored] = listChanges(next.state.doc);
      assert.deepEqual(restored.contributors.map(value => value.author), ["alice", "bob"]);
      const tr = next.state.tr; rejectAllChanges(tr); next.view.dispatch(tr);
      assert.equal(next.getJSON().content[0].content[0].marks, undefined); next.destroy();
    }
  } finally { editor.destroy(); }
});
