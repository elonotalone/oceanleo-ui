import './helpers/w1-jsdom-window.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
// Contextual shaping can change three digits even when one/two digit advances
// are unchanged. Fabric's pair cache cannot represent this complete run.
window.HTMLCanvasElement.prototype.getContext=function(){
 const state={canvas:this,font:'10px sans-serif'};
 return new Proxy(state,{get(target,key){if(key in target)return target[key];if(key==='measureText')return text=>{
  const size=Number(target.font.match(/(\d+(?:\.\d+)?)px/)?.[1]||10);
  const width=size*(text==='111'?1.2:String(text).length*0.5);
  return {width,actualBoundingBoxLeft:0,actualBoundingBoxRight:width,actualBoundingBoxAscent:size,actualBoundingBoxDescent:0};
 };return ()=>{};},set(target,key,value){target[key]=value;return true;}});
};
const fabric=await import('fabric');
const {installFabricTextLayout}=await import('../src/shell/image-editor/fabric-text-layout.ts');
installFabricTextLayout(fabric);
test('FONT: complete shaped run determines Noto text box width and cursor end',()=>{
 const text=new fabric.IText('111',{fontFamily:'Noto Serif SC',fontSize:40,fontWeight:700});
 assert.equal(text.width,48);
 assert.equal(text.__charBounds[0].at(-1).left,48);
});
test('FONT: explicit tracking, character styles and legacy faces retain their render metrics',()=>{
 assert.equal(new fabric.IText('111',{fontFamily:'Arial',fontSize:40}).width,60);
 assert.equal(new fabric.IText('111',{fontFamily:'Noto Serif SC',fontSize:40,charSpacing:100}).width,68);
 assert.equal(new fabric.IText('111',{fontFamily:'Noto Serif SC',fontSize:40,styles:{0:{1:{fontWeight:900}}}}).width,60);
});
test('FONT: wrapped Noto text uses shaped word advances before choosing a line width',()=>{
 const text=new fabric.Textbox('111',{fontFamily:'Noto Serif SC',fontSize:40,fontWeight:700,width:55});
 assert.equal(text.width,55);
 assert.equal(text.getLineWidth(0),48);
});
