import './helpers/w1-jsdom-window.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { docxFontImport } from '../src/shell/doc-editors/rich-doc-import-fonts.ts';

test('DOCX default, based-on paragraph, and character fonts survive semantic conversion', async () => {
  const zip = new JSZip();
  zip.file('word/styles.xml', `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Noto Sans SC"/></w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:styleId="Serif"><w:rPr><w:rFonts w:ascii="Noto Serif CJK SC"/></w:rPr></w:style>
  <w:style w:styleId="Heading"><w:basedOn w:val="Serif"/></w:style>
  <w:style w:styleId="Mono"><w:rPr><w:rFonts w:ascii="JetBrains Mono"/></w:rPr></w:style></w:styles>`);
  const fonts = await docxFontImport(await zip.generateAsync({type:'arraybuffer'}));
  const source = {type:'document',children:[{type:'paragraph',styleId:'Heading',children:[
    {type:'run',children:[]},{type:'run',styleId:'Mono',children:[]},
  ]},{type:'paragraph',children:[{type:'run',children:[]}]}]};
  const before = JSON.stringify(source);
  const transformed=fonts.transformDocument(source);
  const names=transformed.children.flatMap(p=>p.children).map(run=>{
    const rule=fonts.styleMap.find(rule=>rule.includes(`'${run.styleName}'`));
    return fonts.apply(`<span class="${rule.split('span.')[1]}">text</span>`);
  });
  assert.match(names[0],/font-family: Noto Serif SC/);
  assert.match(names[1],/font-family: JetBrains Mono/);
  assert.match(names[2],/font-family: Noto Sans SC/);
  assert.equal(JSON.stringify(source),before);
});

test('unknown or hostile DOCX family strings never become CSS', async () => {
  const zip=new JSZip();
  const fonts=await docxFontImport(await zip.generateAsync({type:'arraybuffer'}));
  const transformed=fonts.transformDocument({type:'run',font:'x; background:url(https://evil.invalid)'});
  assert.equal(transformed.styleName,undefined);
  assert.equal(fonts.apply('<span class="oleo-import-font-999999">text</span>'),'<span class="oleo-import-font-999999">text</span>');
});

test('real DOCX import preserves default and explicit fonts through Mammoth and sanitization', async () => {
  const { Document, Paragraph, TextRun, Packer } = await import('docx');
  const { loadRichDocFile } = await import('../src/shell/doc-editors/rich-doc-model.ts');
  const doc = new Document({ styles:{ default:{document:{run:{font:'Noto Serif SC'}}} },
    sections:[{children:[new Paragraph({children:[new TextRun('宋体正文'),new TextRun({text:'黑体备注',font:'Noto Sans SC'})]})]}] });
  const file = new File([await Packer.toBuffer(doc)],'fonts.docx',{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
  const loaded = await loadRichDocFile(file);
  assert.equal(loaded.error,'');
  assert.match(loaded.html,/font-family: Noto Serif SC[^>]*>宋体正文/);
  assert.match(loaded.html,/font-family: Noto Sans SC[^>]*>黑体备注/);
});
