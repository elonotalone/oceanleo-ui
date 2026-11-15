import './helpers/w1-jsdom-window.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import PptxGenJS from 'pptxgenjs';
import { strFromU8, unzipSync } from 'fflate';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
import { cloneDeckDocument, normalizeDeckDocument } from '../src/shell/doc-editors/deck-schema.ts';
import { deckElementSelectionControls } from '../src/shell/doc-editors/deck-edit-bar-controls.ts';
import { applyDeckToolbarCommand } from '../src/shell/doc-editors/deck-toolbar-command.ts';
import { deckCellElement } from '../src/shell/doc-editors/deck-table-format.ts';
import { deckPptxImageStyle, deckPptxTextStyle, deckPptxVisualObjectName, injectDeckPptxVisuals } from '../src/shell/doc-editors/DeckPptxVisuals.ts';
import { deckPptxTextRuns } from '../src/shell/doc-editors/deck-text-format.ts';
const { selectionAdapterContext, resolveSelectionAdapterContext } = await import(await compileModule('src/shell/selection-adapter.ts'));
const { DeckElementContent } = await import(await compileModule('src/shell/doc-editors/DeckElementContent.tsx'));
const { useDeckSelectionAdapter } = await import(await compileModule('src/shell/doc-editors/use-deck-selection-adapter.ts', { '../../i18n/ui/useUI': dataModule('export function useUI(){return s=>s;}') }));
const font = [{ family: 'Georgia', label: 'Georgia' }];
const tt = value => value;
const normalized = element => normalizeDeckDocument({ slides: [{ id: 'slide', elements: [element] }] });
const reopen = element => normalized(JSON.parse(JSON.stringify(element))).slides[0].elements[0];
const element = (type = 'text') => normalized({ id: 'target', type, x: 10, y: 10, width: 60, height: 40, text: 'Hello\nWorld', rows: [['Hello\nWorld', 'Unchanged']], fontSize: 20 }).slides[0].elements[0];
function send(target, id, value) {
  let result = target;
  applyDeckToolbarCommand({ patchElement: (_id, patch) => { result = { ...target, ...patch }; } }, target, { selectionId: target.id, controlId: id, value });
  return result;
}
const additions = [['case', undefined, 'text', 'HELLO\nWORLD'], ['vertical-text', true, 'verticalText', true], ['indent-increase', undefined, 'indent', 24], ['indent-decrease', undefined, 'indent', 0]];
for (const [id, value, field, expected] of additions) test(`Deck text ${id} profile, execution, render and save/reopen`, () => {
  const original = element(); if (id === 'indent-decrease') original.indent = 24;
  const context = resolveSelectionAdapterContext(selectionAdapterContext({ version: 1, id: original.id, kind: 'slide-text', bar: 'text', controls: deckElementSelectionControls(original, tt, 'Georgia', font) }), tt);
  const control = context.controls.find(control => control.id === id);
  assert.ok(control); assert.equal(control.kind, id === 'vertical-text' ? 'toggle' : 'action');
  const copy = reopen(send(original, id, value)); assert.equal(copy[field], expected);
  const html = renderToStaticMarkup(React.createElement(DeckElementContent, { element: copy }));
  if (id === 'vertical-text') assert.match(html, /writing-mode:vertical-rl/);
  if (id.startsWith('indent')) assert.match(html, new RegExp(`padding-inline-start:${expected}px`));
  if (id === 'case') assert.match(html, /HELLO/);
});
const cellCommands = [['font-family', 'Georgia', 'fontFamily', 'Georgia'], ['highlight', '#ffff00', 'highlight', '#ffff00'], ['align', 'right', 'align', 'right'], ['list', 'ordered', 'list', 'ordered'], ['line-height', 32, 'lineHeight', 1.6], ['link', 'example.com', 'link', 'https://example.com/'], ['letter-spacing', 3, 'letterSpacing', 3], ['case', undefined, 'text', 'HELLO\nWORLD'], ['vertical-text', true, 'verticalText', true], ['indent-increase', undefined, 'indent', 24], ['indent-decrease', undefined, 'indent', 0], ['clear-format', undefined, 'fontSize', 18]];
test('Deck capability matrices have positive registration counts', () => {
  assert.equal(additions.length, 4);
  assert.equal(cellCommands.length, 12);
});
for (const [id, value, field, expected] of cellCommands) test(`Deck table cell ${id} uses actual adapter and round-trips without changing sibling cells`, async () => {
  let deck = normalized({ ...element('table'), indent: id === 'indent-decrease' ? 24 : 0, bold: id === 'clear-format', color: '#123456' });
  let adapter, update;
  function Harness() {
    const [state, setState] = React.useState(deck); update = setState;
    const selected = state.slides[0].elements[0];
    adapter = useDeckSelectionAdapter({ editor: { deck: state, selectedElement: selected, activeSlide: state.slides[0], activeMaster: state.masters[0], activeIndex: 0, loading: false, readOnly: false, sourceFailed: false,
      patchElement: (_id, patch) => setState(current => ({ ...current, slides: [{ ...current.slides[0], elements: [{ ...selected, ...patch }] }] })),
    } });
    deck = state;
    return React.createElement('div', { 'data-deck-element': selected.id }, React.createElement(DeckElementContent, { element: selected }));
  }
  const errors = []; const previous = console.error; console.error = (...args) => errors.push(args.map(String).join(' '));
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(Harness)));
    assert.ok(adapter.context.controls.some(control => control.id === id));
    await act(async () => host.querySelector('[data-deck-cell="0:0"]').dispatchEvent(new window.Event('pointerdown', { bubbles: true })));
    await act(async () => adapter.dispatch({ controlId: id, value, selectionId: adapter.context.id }));
    await act(async () => update(normalized(JSON.parse(JSON.stringify(deck.slides[0].elements[0])))));
    const table = deck.slides[0].elements[0], cell = deckCellElement(table, 0, 0);
    assert.equal(cell[field], expected);
    assert.equal(deckCellElement(table, 0, 1).text, 'Unchanged');
    assert.equal(table.cellStyles?.['0:1'], undefined);
    assert.equal(table.color, '#123456');
    if (id === 'clear-format') { assert.equal(cell.bold, false); assert.equal(cell.color, deck.masters[0].textColor); }
    if (id === 'vertical-text') assert.equal(host.querySelector('td').style.writingMode, 'vertical-rl');
    if (id === 'highlight') assert.ok(host.querySelector('td [style*="background-color"]'));
    if (id === 'letter-spacing') assert.equal(host.querySelector('td').style.letterSpacing, '3px');
    if (id.startsWith('indent')) assert.equal(host.querySelector('td').style.paddingInlineStart, `${expected}px`);
  } finally { await act(async () => root.unmount()); host.remove(); console.error = previous; }
  assert.deepEqual(errors, []);
});
test('Deck table declares all 18 text canon entries and the same px metric forms as a text box', () => {
  const expected = ['font-family','font-size','bold','italic','underline','strike','text-color','highlight','align','list','line-height','link','letter-spacing','case','vertical-text','indent-increase','indent-decrease','clear-format'];
  const table = deckElementSelectionControls(element('table'), tt, 'Georgia', font);
  for (const id of expected) assert.ok(table.some(control => control.id === id), id);
  for (const id of ['font-size','line-height','letter-spacing']) assert.equal(table.find(control => control.id === id).kind, 'number');
});
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3MxZ5wAAAABJRU5ErkJggg==';
test('Deck source crop survives JSON, renders its viewport, and reaches real PPTX srcRect', async () => {
  let image = { ...element('image'), src: pixel, imageFit: 'fill' };
  const controls = deckElementSelectionControls(image, tt, 'Georgia', font);
  assert.equal(controls.filter(control => control.inspectorGroup === 'crop').length, 5);
  for (const [id, value] of [['crop-left', 15], ['crop-top', 10], ['crop-right', 20], ['crop-bottom', 5]]) image = reopen(send(image, id, value));
  assert.deepEqual(image.crop, { left: .15, top: .1, right: .2, bottom: .05 });
  const viewport = /viewBox="([^"]+)"/.exec(renderToStaticMarkup(React.createElement(DeckElementContent, { element: image })))[1].split(' ').map(Number);
  for (const [index, expected] of [.15, .1, .65, .85].entries()) assert.ok(Math.abs(viewport[index] - expected) < 1e-9);
  const pptx = new PptxGenJS(), slide = pptx.addSlide();
  slide.addImage({ data: pixel, x: 1, y: 1, w: 4, h: 2, objectName: deckPptxVisualObjectName(image.id) });
  const blob = await injectDeckPptxVisuals(await pptx.write({ outputType: 'blob' }), [{ ...normalized(image).slides[0] }], '16:9');
  const xml = strFromU8(unzipSync(new Uint8Array(await blob.arrayBuffer()))['ppt/slides/slide1.xml']);
  assert.match(xml, /<a:srcRect l="15000" t="10000" r="20000" b="5000"\/>/);
  assert.equal(send(image, 'crop-reset').crop, undefined);
});
test('real editable PPTX table carries every text style including native lists, vertical text and external link relationships', async () => {
  const table = { ...element('table'), opacity: .5, fontFamily: 'Georgia', bold: true, italic: true, underline: true, strike: true, highlight: '#ffff00', color: '#123456', align: 'right', list: 'ordered', lineHeight: 1.6, letterSpacing: 3, indent: 24, verticalText: true, link: 'https://example.com/', cellStyles: { '0:1': { bold: false, list: 'bullet', color: '#abcdef' } } };
  const text = { ...element(), verticalText: true, indent: 24 };
  const pptx = new PptxGenJS(), slide = pptx.addSlide();
  slide.addTable(table.rows.map(row => row.map(value => ({ text: value }))), { x: 1, y: 1, w: 5, h: 2, objectName: deckPptxVisualObjectName(table.id) });
  text.id = 'text';
  slide.addText(deckPptxTextRuns(text.text, text), { x: 1, y: 4, w: 5, h: 1, ...deckPptxTextStyle(text), objectName: deckPptxVisualObjectName(text.id) });
  const blob = await injectDeckPptxVisuals(await pptx.write({ outputType: 'blob' }), [{ ...normalized(table).slides[0], elements: [table, text] }], '16:9');
  const archive = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const xml = strFromU8(archive['ppt/slides/slide1.xml']);
  for (const pattern of [/<a:tbl>/, /typeface="Georgia"/, /<a:highlight><a:srgbClr val="ffff00"/, /algn="r"/, /<a:buAutoNum type="arabicPeriod"/, /<a:buChar char="•"/, /val="160000"/, /spc="225"/, /vert="eaVert"/, /marL="[1-9]\d+"/, /<a:hlinkClick r:id="rIdOceanleoCell/, /<a:srgbClr val="123456"><a:alpha val="50000"/]) assert.match(xml, pattern);
  assert.match(strFromU8(archive['ppt/slides/_rels/slide1.xml.rels']), /Target="https:\/\/example.com\/" TargetMode="External"/);
});

test('table text links are conditional on native editable PPTX capability', () => {
  const controls = deckElementSelectionControls({ ...element('table'), shadow: true }, tt, 'Georgia', font);
  assert.ok(!controls.some(control => control.id === 'link'));
  for (const id of ['font-family','highlight','align','list','line-height','letter-spacing','case','vertical-text','indent-increase','indent-decrease','clear-format']) assert.ok(controls.some(control => control.id === id), id);
});
test('cloning Deck does not share mutable cell styles or crop rectangles', () => {
  const deck = normalized({ ...element('table'), cellStyles: { '0:0': { fontFamily: 'Georgia' } }, crop: { left: .1, right: 0, top: 0, bottom: 0 } });
  const copy = cloneDeckDocument(deck);
  copy.slides[0].elements[0].crop.left = .4;
  copy.slides[0].elements[0].cellStyles['0:0'].fontFamily = 'Arial';
  assert.equal(deck.slides[0].elements[0].crop.left, .1);
  assert.equal(deck.slides[0].elements[0].cellStyles['0:0'].fontFamily, 'Georgia');
});

for (const fit of ['contain', 'cover', 'fill']) test(`PPTX ${fit} fits the cropped source rather than stretching the old viewport`, async () => {
  const image = { ...element('image'), src: pixel, imageFit: fit, crop: { left: .25, right: .25, top: 0, bottom: 0 } };
  const pptx = new PptxGenJS(); pptx.layout = 'LAYOUT_WIDE';
  const slide = pptx.addSlide();
  const box = { x: image.x / 100 * 13.333, y: image.y / 100 * 7.5, w: image.width / 100 * 13.333, h: image.height / 100 * 7.5 };
  slide.addImage({ data: pixel, ...box, ...deckPptxImageStyle(image, box), objectName: deckPptxVisualObjectName(image.id) });
  const blob = await injectDeckPptxVisuals(await pptx.write({ outputType: 'blob' }), [normalized(image).slides[0]], '16:9');
  const xml = strFromU8(unzipSync(new Uint8Array(await blob.arrayBuffer()))['ppt/slides/slide1.xml']);
  const pic = /<p:pic>[\s\S]*?<\/p:pic>/.exec(xml)[0];
  const ext = /<a:ext cx="(\d+)" cy="(\d+)"/.exec(pic).slice(1).map(Number);
  const rect = /<a:srcRect l="(\d+)" t="(\d+)" r="(\d+)" b="(\d+)"/.exec(pic).slice(1).map(Number);
  assert.equal(rect[0], 25000); assert.equal(rect[2], 25000);
  if (fit === 'contain') assert.ok(Math.abs(ext[0] / ext[1] - .5) < 1e-5, JSON.stringify({ ext, rect }));
  else assert.ok(Math.abs(ext[0] / ext[1] - box.w / box.h) < 1e-5);
  if (fit === 'cover') assert.ok(rect[1] > 0 && rect[3] > 0);
  else assert.equal(rect[1] + rect[3], 0);
});

test('real cropped Deck image mounts, loads source dimensions and updates fit without React errors', async () => {
  const errors = [], previous = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const image = { ...element('image'), src: pixel, alt: 'Cropped photo', imageFit: 'contain', crop: { left: .15, top: .1, right: .2, bottom: .05 } };
  try {
    await act(async () => root.render(React.createElement(DeckElementContent, { element: image })));
    const probe = host.querySelector('img');
    Object.defineProperties(probe, { naturalWidth: { value: 200 }, naturalHeight: { value: 100 } });
    await act(async () => probe.dispatchEvent(new window.Event('load')));
    const bounds = host.querySelector('svg').getAttribute('viewBox').split(' ').map(Number);
    for (const [index, value] of [30, 10, 130, 85].entries()) assert.ok(Math.abs(bounds[index] - value) < 1e-9);
    assert.equal(host.querySelector('svg').getAttribute('aria-label'), 'Cropped photo');
    assert.equal(host.querySelector('svg').getAttribute('preserveAspectRatio'), 'xMidYMid meet');
    await act(async () => root.render(React.createElement(DeckElementContent, { element: { ...image, imageFit: 'cover' } })));
    assert.equal(host.querySelector('svg').getAttribute('preserveAspectRatio'), 'xMidYMid slice');
  } finally {
    await act(async () => root.unmount()); host.remove(); console.error = previous;
  }
  assert.deepEqual(errors, []);
});
