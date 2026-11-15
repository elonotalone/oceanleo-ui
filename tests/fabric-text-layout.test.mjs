import "./helpers/w1-jsdom-window.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { compileModule } from "./helpers/module-bench.mjs";
// Deterministic canvas measurements; Canvas rendering, SVG serialization,
// class restoration and command implementations are the real Fabric engine.
let drawn = [];
window.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({ canvas: this, measureText: value => ({ width: String(value).length * 10, actualBoundingBoxAscent: 12, actualBoundingBoxDescent: 3 }),
    fillText: (...args) => drawn.push(args), fillRect: (...args) => drawn.push(['rect', ...args]),
  }, { get: (target, key) => key in target ? target[key] : () => undefined, set: (target, key, value) => (target[key] = value, true) });
};
const fabric = await import('fabric');
const { dispatchFabricImageCommand } = await import('../src/shell/image-editor/fabric-image-commands.ts');
const { installFabricTextLayout, decodeFabricTextMetadata } = await import('../src/shell/image-editor/fabric-text-layout.ts');
const { SNAPSHOT_PROPS, buildSelectedSnapshot } = await import('../src/shell/image-editor/editor-objects.ts');
const { buildFabricImageToolbarControls } = await import('../src/shell/image-editor/fabric-image-toolbar-controls.ts');
const { vectorSvgToSnapshot, exportVectorSvg } = await import('../src/shell/image-editor/vector-svg-scene.ts');
const { createFabricImageProject, parseFabricImageProject } = await import('../src/shell/image-editor/editor-persistence.ts');
const policy = await compileModule('src/shell/image-editor/image-mutation-policy.ts');
const core = await compileModule('src/shell/image-editor/fabric-controller-core.ts', { './image-mutation-policy': policy });
const { FabricEditorController } = await import(await compileModule('src/shell/image-editor/fabric-controller.ts', { './fabric-controller-core': core }));
installFabricTextLayout(fabric);
function scene(text) {
  text.oceanleoId = 'text';
  const context = { fabric, canvas: { getActiveObject: () => text }, textCaseRestore: new Map(), mutateSelected: mutate => mutate(text) };
  for (const name of ['setSelectedText', 'setSelectedTextList', 'toggleSelectedTextList', 'clearSelectedTextFormat']) context[name] = (...args) => FabricEditorController.prototype[name].apply(context, args);
  return context;
}
const controls = text => buildFabricImageToolbarControls({ selected: buildSelectedSnapshot(fabric, text), cropping: false, cropRatio: 'free', loading: false, sourceReady: true, saving: false, transformInfo: null, filters: null, layers: [], fonts: [], tt: value => value });
const reopen = async text => (await fabric.util.enlivenObjects([text.toObject(SNAPSHOT_PROPS)]))[0];

test('Fabric profiles declare vertical/indent and keep unsupported link/alt/background removal absent', () => {
  const text = new fabric.Textbox('文字', { width: 180, fontSize: 20 });
  const ids = controls(text).map(control => control.id);
  for (const id of ['vertical-text', 'indent-increase', 'indent-decrease', 'list', 'clear-format']) assert.ok(ids.includes(id), id);
  for (const id of ['link', 'alt', 'remove-background']) assert.ok(!ids.includes(id), id);
});
for (const mode of ['bullet', 'ordered', 'none']) test(`structured ${mode} list preserves literal prefixes, blank lines and save/reopen`, async () => {
  const source = '1. 原文\n\n• 原文\n新项目';
  const text = new fabric.Textbox(source, { width: 180, fontSize: 20 });
  scene(text).setSelectedTextList(mode);
  assert.equal(text.text, source);
  assert.equal(buildSelectedSnapshot(fabric, text).text.list, mode);
  const copy = await reopen(text);
  assert.equal(copy.text, source);
  assert.equal(copy.oceanleoList, mode);
  assert.equal(controls(copy).find(control => control.id === 'list').value, mode);
  const project = createFabricImageProject({ json: { objects: [text.toObject(SNAPSHOT_PROPS)] }, doc: { width: 300, height: 300 }, canvasBackground: '#fff' });
  const parsed = parseFabricImageProject(JSON.parse(JSON.stringify(project)));
  assert.equal(parsed.snapshot.json.objects[0].oceanleoList, mode);
  const svg = copy.toSVG();
  assert.match(svg, /data-oceanleo-text=/);
  const canvas = new fabric.StaticCanvas(undefined, { width: 300, height: 300 }); canvas.add(copy);
  const standalone = await vectorSvgToSnapshot(fabric, exportVectorSvg(canvas, { width: 300, height: 300 }));
  assert.equal(standalone.snapshot.json.objects[1].text, source, 'removing a list preserves literal prefixes and blank lines in standalone SVG');
  assert.equal(standalone.snapshot.json.objects[1].oceanleoList, mode);
  await canvas.dispose();
});
for (const [name, patch] of [['indent-increase', { indent: 48 }], ['indent-decrease', { indent: 0 }], ['vertical-text', { verticalText: true }]]) test(`${name} changes actual rendering, survives repeated measurements, JSON and SVG reopen`, async () => {
  const text = new fabric.Textbox('中文\nAB', { width: 180, fontSize: 20, left: 40, top: 40 });
  const controller = scene(text);
  controller.setSelectedTextList('ordered');
  controller.setSelectedText({ indent: 24 });
  dispatchFabricImageCommand({ selected: buildSelectedSnapshot(fabric, text), layers: [{ id: 'text', locked: false }], selectLayer() {}, setSelectedText: controller.setSelectedText }, { controlId: name, selectionId: 'text', value: patch.verticalText });
  const dimensions = [text.width, text.height];
  text.initDimensions(); text.initDimensions();
  assert.deepEqual([text.width, text.height], dimensions);
  drawn = []; text._render(document.createElement('canvas').getContext('2d'));
  assert.ok(drawn.some(args => args[0] === '1.'), 'list markers are painted separately');
  assert.ok(!text.text.includes('1.'));
  if (patch.verticalText) {
    const cjk = drawn.filter(args => args[0] === '中' || args[0] === '文');
    assert.equal(cjk.length, 2); assert.equal(cjk[0][1], cjk[1][1]); assert.ok(cjk[1][2] > cjk[0][2]);
  }
  const copy = await reopen(text);
  assert.deepEqual([copy.width, copy.height], dimensions);
  assert.equal(copy.oceanleoIndent, patch.indent ?? 24);
  assert.equal(copy.oceanleoVerticalText, patch.verticalText);
  const canvas = new fabric.StaticCanvas(undefined, { width: 300, height: 300 }); canvas.add(copy);
  const svg = exportVectorSvg(canvas, { width: 300, height: 300 });
  const result = await vectorSvgToSnapshot(fabric, svg);
  assert.equal(result.snapshot.json.objects.length, 2, 'visual glyphs reopen as one editable source text');
  const restored = result.snapshot.json.objects[1];
  assert.equal(restored.text, text.text); assert.equal(restored.oceanleoList, 'ordered');
  assert.equal(restored.oceanleoIndent, text.oceanleoIndent);
  assert.equal(Boolean(restored.oceanleoVerticalText), Boolean(text.oceanleoVerticalText));
  await canvas.dispose();
});
test('clear-format follows ED-B2 while preserving structured paragraphs and object position', async () => {
  const text = new fabric.Textbox('Keep content', { left: 31, top: 52, width: 200, fontSize: 30, fontFamily: 'Georgia', fill: '#aabbcc', fontWeight: 'bold', textBackgroundColor: '#ffff00', styles: { 0: { 0: { fill: '#ff0000', fontSize: 42 } } } });
  const controller = scene(text);
  controller.setSelectedText({ list: 'bullet', indent: 24, verticalText: true });
  controller.clearSelectedTextFormat();
  const copy = await reopen(text);
  assert.equal(copy.text, 'Keep content'); assert.equal(copy.fontSize, 16); assert.equal(copy.fontFamily, 'sans-serif');
  assert.equal(copy.fill, '#1c1917'); assert.deepEqual(copy.styles, {}); assert.equal(copy.textBackgroundColor, '');
  assert.deepEqual([copy.left, copy.top], [31, 52]);
  assert.deepEqual([copy.oceanleoList, copy.oceanleoIndent, copy.oceanleoVerticalText], ['bullet', 24, true]);
});
test('SVG metadata rejects arbitrary classes, oversized content and executable text fields', () => {
  const encode = value => btoa(JSON.stringify(value));
  assert.equal(decodeFabricTextMetadata(encode({ type: 'Image', src: 'https://example.com' })), null);
  assert.equal(decodeFabricTextMetadata(encode({ type: 'IText', text: 'x'.repeat(2001) })), null);
  const value = decodeFabricTextMetadata(encode({ type: 'IText', text: '<script>literal text</script>', fontFamily: '<script>', src: 'javascript:1', oceanleoIndent: Infinity }));
  assert.equal(value.text, '<script>literal text</script>'); assert.equal(value.src, undefined); assert.equal(value.fontFamily, undefined);
});

test('structured SVG preserves styled characters and grouped text transforms', async () => {
  const text = new fabric.Textbox('Mixed 字', { width: 150, fontSize: 20, left: 20, top: 30, styles: { 0: { 0: { fill: '#ff0000', fontSize: 25, fontWeight: 700 } } } });
  scene(text).setSelectedTextList('bullet');
  const group = new fabric.Group([text], { left: 45, top: 55, angle: 20, scaleX: 1.3, scaleY: 1.1 });
  const before = text.calcTransformMatrix();
  const canvas = new fabric.StaticCanvas(undefined, { width: 400, height: 400 }); canvas.add(group);
  const svg = exportVectorSvg(canvas, { width: 400, height: 400 });
  const result = await vectorSvgToSnapshot(fabric, svg);
  const [copy] = await fabric.util.enlivenObjects([result.snapshot.json.objects[1]]);
  assert.deepEqual(copy.styles, text.styles);
  for (const [index, value] of copy.calcTransformMatrix().entries()) assert.ok(Math.abs(value - before[index]) < 1e-6);
  await canvas.dispose();
});

test('image capability profile does not claim alt or background removal', () => {
  const image = document.createElement('img'); image.width = 30; image.height = 20;
  const selected = buildSelectedSnapshot(fabric, new fabric.FabricImage(image, { width: 30, height: 20 }));
  const ids = buildFabricImageToolbarControls({ selected, cropping: false, sourceReady: true, tt: value => value }).map(control => control.id);
  assert.ok(!ids.includes('alt')); assert.ok(!ids.includes('remove-background'));
});
test('vertical text reflows for native IME editing and toggles back without width drift', () => {
  const text = new fabric.Textbox('中文 ABC', { width: 180, fontSize: 20 });
  const controller = scene(text);
  controller.setSelectedTextList('bullet');
  const horizontal = [text.width, text.height];
  for (let index = 0; index < 3; index++) {
    controller.setSelectedText({ verticalText: true });
    assert.ok(text.oceanleoVerticalText);
    text.isEditing = true; text.initDimensions();
    assert.deepEqual([text.width, text.height], horizontal);
    text.isEditing = false; text.initDimensions();
    controller.setSelectedText({ verticalText: false });
    assert.deepEqual([text.width, text.height], horizontal);
  }
});

test('vertical SVG preserves opacity, background and the Canvas decoration rectangles', async () => {
  const text = new fabric.Textbox('AB', { width: 180, fontSize: 20, opacity: .4, backgroundColor: '#ffff00', underline: true, linethrough: true, textAlign: 'center' });
  scene(text).setSelectedText({ verticalText: true });
  assert.equal(text.height, 180, 'vertical alignment retains the available column length');
  drawn = []; text._render(document.createElement('canvas').getContext('2d'));
  const canvasRects = drawn.filter(args => args[0] === 'rect').map(args => args.slice(1));
  assert.equal(canvasRects.length, 4);
  const canvas = new fabric.StaticCanvas(undefined, { width: 300, height: 300 }); canvas.add(text);
  const svg = exportVectorSvg(canvas, { width: 300, height: 300 });
  const svgDocument = new window.DOMParser().parseFromString(svg, 'image/svg+xml');
  const owner = svgDocument.querySelector('[data-oceanleo-text]');
  assert.equal(owner.firstElementChild.getAttribute('opacity'), '0.4');
  const rectangles = [...owner.querySelectorAll('rect')];
  assert.equal(rectangles[0].getAttribute('fill'), '#ffff00');
  const decorations = rectangles.slice(1).map(rect => ['x','y','width','height'].map(key => Number(rect.getAttribute(key))));
  assert.deepEqual(decorations, canvasRects);
  assert.ok([...owner.querySelectorAll('text')].every(node => !node.hasAttribute('text-decoration')));
  await canvas.dispose();
});
test('horizontal structured-list markers carry the native object opacity into SVG', () => {
  const text = new fabric.Textbox('Item', { width: 160, fontSize: 20, opacity: .35 });
  scene(text).setSelectedTextList('bullet');
  assert.match(text.toSVG(), /opacity="0.35"[^>]*>•<\/text>/);
});
