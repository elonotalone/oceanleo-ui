import assert from 'node:assert/strict';
import test from 'node:test';
import {zipSync,strToU8} from 'fflate';
import * as ooxml from '../src/shell/doc-editors/deck-pptx-ooxml.ts';
import * as importer from '../src/shell/doc-editors/pptx-deck-import.ts';
import {sampleBytes} from './helpers/ppt-style-fixture.mjs';


test('sample paragraph default keeps 37pt, pale text, original face and paragraph breaks',async()=>{
 const d=await importer.importPptxDeck(await sampleBytes(),'sample');
 const t=d.slides[0].elements.find(e=>e.label==='TextBox 9');
 assert.equal(t.fontSize,37);assert.equal(t.color,'#FFF0D2');
 assert.equal(t.fontFamily,'Noto Serif CJK SC');
 assert.equal(t.text,'赤沙台遗址\n地层中的生活');
 assert.equal(t.lineHeight,1.15);
});

test('sample picture fills its original frame and retains the 17.584% side crop',async()=>{
 const d=await importer.importPptxDeck(await sampleBytes(),'sample');
 const p=d.slides[0].elements.find(e=>e.type==='image');
 assert.ok(Math.abs(p.x-5212080/12191695*100)<0.001);
 assert.ok(Math.abs(p.y-2.4)<0.001);
 assert.ok(Math.abs(p.width-6976872/12191695*100)<0.001);
 assert.ok(Math.abs(p.height-88.2666666667)<0.001);
 assert.equal(p.imageFit,'fill');
 assert.deepEqual(p.crop,{left:0.17584,right:0.17584,top:0,bottom:0});
});

test('OOXML cascade fills missing run properties across paragraph, list, placeholder and master defaults',()=>{
 const sp=(name,ph,style,props,run)=>`<p:sp><p:nvSpPr><p:cNvPr name="${name}"/><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>${style}<a:p>${props}<a:r>${run}<a:t>中文</a:t></a:r></a:p></p:txBody></p:sp>`;
 const ph='<p:ph type="body" idx="2"/>';
 const slide=sp('Inherited',ph,'<a:lstStyle><a:lvl1pPr algn="r"><a:defRPr i="1"/></a:lvl1pPr></a:lstStyle>','<a:pPr><a:defRPr sz="3700"><a:solidFill><a:srgbClr val="FFF0D2"/></a:solidFill></a:defRPr></a:pPr>','<a:rPr b="0"><a:ea typeface="Noto Serif CJK SC"/></a:rPr>');
 const layout=sp('Layout',ph,'<a:lstStyle/>','<a:pPr><a:defRPr sz="2800" b="1"/></a:pPr>','');
 const master=sp('Master',ph,'<a:lstStyle><a:lvl1pPr><a:defRPr sz="2400" u="sng"/></a:lvl1pPr></a:lstStyle>','','');
 const pack={
  'ppt/presentation.xml':'<p:presentation><p:sldIdLst><p:sldId r:id="s1"/></p:sldIdLst><p:defaultTextStyle><a:lvl1pPr><a:defRPr sz="1800" spc="100"/></a:lvl1pPr></p:defaultTextStyle></p:presentation>',
  'ppt/_rels/presentation.xml.rels':'<Relationships><Relationship Id="s1" Type="r/slide" Target="slides/custom.xml"/></Relationships>',
  'ppt/slides/custom.xml':`<p:sld><p:cSld><p:spTree>${slide}</p:spTree></p:cSld></p:sld>`,
  'ppt/slides/_rels/custom.xml.rels':'<Relationships><Relationship Type="r/slideLayout" Target="../slideLayouts/l.xml"/></Relationships>',
  'ppt/slideLayouts/l.xml':`<p:sldLayout><p:cSld><p:spTree>${layout}</p:spTree></p:cSld></p:sldLayout>`,
  'ppt/slideLayouts/_rels/l.xml.rels':'<Relationships><Relationship Type="r/slideMaster" Target="../slideMasters/m.xml"/></Relationships>',
  'ppt/slideMasters/m.xml':`<p:sldMaster><p:cSld><p:spTree>${master}</p:spTree></p:cSld><p:txStyles><p:bodyStyle><a:lvl1pPr><a:defRPr strike="sngStrike"/></a:lvl1pPr></p:bodyStyle></p:txStyles></p:sldMaster>`,
 };
 const read=()=>ooxml.readDeckPptxTextInheritance(zipSync(Object.fromEntries(Object.entries(pack).map(([p,s])=>[p,strToU8(s)]))).buffer)[0][0].paragraphs[0][0].style;
 const style=read();
 assert.equal(style.fontSize,37);assert.equal(style.color,'#FFF0D2');assert.equal(style.fontFamily,'Noto Serif CJK SC');
 assert.equal(style.bold,false);assert.equal(style.italic,true);assert.equal(style.align,'right');
 assert.equal(style.underline,true);assert.equal(style.strike,true);assert.equal(style.letterSpacing,4/3);
 pack['ppt/slides/custom.xml']=pack['ppt/slides/custom.xml'].replace('sz="3700"','');
 assert.equal(read().fontSize,28);
 pack['ppt/slideLayouts/l.xml']=pack['ppt/slideLayouts/l.xml'].replace('sz="2800"','');
 assert.equal(read().fontSize,24);
 pack['ppt/slideMasters/m.xml']=pack['ppt/slideMasters/m.xml'].replace('sz="2400"','');
 assert.equal(read().fontSize,18);
});

test('a background color is not mistaken for the text color',()=>{
 const d=importer.mapPptxPresentationToDeck({size:{width:960,height:540},slides:[{elements:[{type:'text',name:'highlight',left:0,top:0,width:400,height:80,content:'<p><span style="background-color:#00FF00;color:#FFF0D2;font-size:37pt">标题</span></p>'}]}]},'highlight');
 assert.equal(d.slides[0].elements[0].color,'#FFF0D2');
 assert.equal(d.slides[0].elements[0].highlight,'#00FF00');
});
