import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {compileModule} from './helpers/module-bench.mjs';
const {DeckElementContent}=await import(await compileModule('src/shell/doc-editors/DeckElementContent.tsx'));
import {deckPptxTextStyle} from '../src/shell/doc-editors/DeckPptxVisuals.ts';

for (const [original,web,generic] of [
 ['Noto Sans CJK SC','Noto Sans SC','sans-serif'],
 ['Noto Sans CJK TC','Noto Sans TC','sans-serif'],
 ['Noto Sans CJK JP','Noto Sans JP','sans-serif'],
 ['Noto Sans CJK KR','Noto Sans KR','sans-serif'],
 ['Noto Serif CJK SC','Noto Serif SC','serif'],
 ['Source Han Sans CN','Noto Sans SC','sans-serif'],
 ['Source Han Serif TW','Noto Serif TC','serif'],
 ['Source Han Sans JP','Noto Sans JP','sans-serif'],
 ['Source Han Serif KR','Noto Serif KR','serif'],
 ['Noto Sans SC','Noto Sans SC','sans-serif'],
 ['Noto Serif TC','Noto Serif TC','serif'],
 ['思源黑体','Noto Sans SC','sans-serif'],
 ['思源宋体','Noto Serif SC','serif'],
]) {
 test(`${original} paints with ${web} and keeps the original model face`,()=>{
  const e={id:'t',type:'text',text:'测试',x:1,y:1,width:40,height:10,rotation:0,order:0,fontSize:37,fontFamily:original};
  const html=renderToStaticMarkup(React.createElement(DeckElementContent,{element:e}));
  assert.ok(html.includes(`font-family:${web}`),html.slice(0,240));
  assert.match(html,new RegExp(`font-family:[^;]+${generic}`));
  assert.equal(e.fontFamily,original);
  // Export options never substitute a display font into the model.
  deckPptxTextStyle(e);assert.equal(e.fontFamily,original);
 });
}

test('display aliases do not rewrite the font when normalized and exported',async()=>{
 const {normalizeDeckDocument}=await import('../src/shell/doc-editors/deck-schema.ts');
 const {injectDeckPptxVisuals,deckPptxVisualObjectName}=await import('../src/shell/doc-editors/DeckPptxVisuals.ts');
 const {default:PptxGenJS}=await import('pptxgenjs');
 const {unzipSync,strFromU8}=await import('fflate');
 const doc=normalizeDeckDocument({slides:[{id:'s',title:'Original',elements:[{id:'t',type:'text',x:10,y:10,width:50,height:20,fontFamily:'Noto Serif CJK SC',fontSize:37,text:'原字体',color:'#FFF0D2'}]}]});
 const e=doc.slides[0].elements[0];
 renderToStaticMarkup(React.createElement(DeckElementContent,{element:e}));
 const p=new PptxGenJS();p.addSlide().addText(e.text,{x:1,y:1,w:5,h:2,fontFace:e.fontFamily,objectName:deckPptxVisualObjectName(e.id)});
 const exported=await injectDeckPptxVisuals(await p.write({outputType:'blob'}),doc.slides,'16:9');
 const xml=strFromU8(unzipSync(new Uint8Array(await exported.arrayBuffer()))['ppt/slides/slide1.xml']);
 assert.match(xml,/typeface="Noto Serif CJK SC"/);
 assert.doesNotMatch(xml,/typeface="Noto Serif SC"/);
});
