import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEditorTextFonts, editorFontFamilies } from '../src/shell/image-editor/editor-fonts.ts';
import { richDocFontTexts, followRichDocFonts } from '../src/shell/doc-editors/rich-doc-fonts.ts';

function environment() {
  const faces = [];
  return { faces, fonts: { add(face) { faces.push(face); }, load: async () => [{}], ready: Promise.resolve() },
    FontFace: class { constructor(family, source) { Object.assign(this, { family, source }); } async load() { return this; } } };
}

test('desktop CJK aliases load exact hosted faces under their saved names in every editor', async () => {
  const env = environment();
  await loadEditorTextFonts([{ text: '中文', fontFamily: 'Noto Serif SC' }], env);
  for (const family of ['Noto Serif CJK SC', 'Source Han Serif SC', '思源宋体', 'Noto Sans CJK JP']) {
    await loadEditorTextFonts([{ text: '中文', fontFamily: family }], env);
    const faces = env.faces.filter(face => face.family === family);
    assert.ok(faces.length, family);
    assert.ok(faces.every(face => face.source.includes(/Serif|宋/.test(family) ? 'noto-serif-sc/' : 'noto-sans-jp/')));
    assert.ok(faces.every(face => !/googleapis|gstatic|github/.test(face.source)));
  }
});

test('serif first in a stack retains serif script fallback despite sans-serif at the end', () => {
  assert.deepEqual(editorFontFamilies('中文 ไทย', 'Noto Serif, Noto Sans Arabic, sans-serif'), ['Noto Serif', 'Noto Serif SC', 'Noto Serif Thai']);
});

test('documents load heading, table and inline font marks without changing the stored document', () => {
  const doc = { type: 'doc', content: [
    { type: 'heading', attrs: { fontFamily: 'Noto Serif SC' }, content: [{ type: 'text', text: '中文' }] },
    { type: 'table', content: [{ type: 'tableCell', content: [{ type: 'text', text: 'العربية', marks: [{ type: 'textStyle', attrs: { fontFamily: 'Noto Sans Arabic' } }, { type: 'bold' }] }] }] },
  ] };
  const before = JSON.stringify(doc);
  assert.deepEqual(richDocFontTexts(doc), [
    { text: '中文', fontFamily: 'Noto Serif SC', fontWeight: 700 },
    { text: 'العربية', fontFamily: 'Noto Sans Arabic', fontWeight: 700 },
  ]);
  assert.equal(JSON.stringify(doc), before);
});

test('document loading follows restores and collaboration, batches transactions and cancels on unmount', async () => {
  let handler, current = { text: 'imported' };
  const seen = [];
  const editor = { getJSON: () => current, on(event, callback) { assert.equal(event, 'transaction'); handler = callback; }, off(event, callback) { assert.equal(callback, handler); } };
  const stop = followRichDocFonts(editor, async doc => { seen.push(doc.text); });
  await new Promise(resolve => setImmediate(resolve));
  current = { text: 'restored' }; handler(); handler();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(seen, ['imported', 'restored']);
  handler(); stop();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(seen, ['imported', 'restored']);
});

test('legacy display faces load their own bytes, including actual italic and bold faces', async () => {
  const env = environment();
  for(const family of ['Space Grotesk','Playfair Display','ZCOOL QingKe HuangYou','JetBrains Mono','Smiley Sans','Bebas Neue','EB Garamond','Caveat','LXGW WenKai','Archivo','ZCOOL KuaiLe','Orbitron','Ma Shan Zheng','Noto Sans Mono CJK SC','DejaVu Sans','DejaVu Sans Mono']) {
    await loadEditorTextFonts([{ text:'中文 ABC 123',fontFamily:family,fontWeight:700,fontStyle:'italic' }],env);
    assert.ok(env.faces.some(face=>face.family===family && face.source.includes('assets/fonts/noto/material-legacy-')),family);
  }
});
