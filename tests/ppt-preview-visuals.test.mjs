import './helpers/w1-jsdom-window.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {compileModule,dataModule} from './helpers/module-bench.mjs';
import {sampleBytes} from './helpers/ppt-style-fixture.mjs';
import * as visuals from '../src/shell/doc-editors/DeckPptxVisuals.ts';

// Bundlers interoperate with lodash's CJS entry; Node's named ESM import does not.
const lodash=import.meta.resolve('lodash');
const {init}=await import(await compileModule('vendor/pptx-preview/pptx-preview.es.js',{
 lodash:dataModule(`import lib from ${JSON.stringify(lodash)};export const get=lib.get,omit=lib.omit;`),
}));

test('preview adapter paints paragraph defaults and shields crop geometry from global image resets',async()=>{
 const bytes=await sampleBytes();
 const host=document.createElement('div');document.body.append(host);
 const reset=document.createElement('style');reset.textContent='img{max-width:100%;height:auto}';document.head.append(reset);
 const preview=init(host,{mode:'slide',width:960,height:540});
 let stop;
 try{
  const model=await preview.load(bytes);
  assert.equal(model.slides.length,1);
  stop=visuals.applyDeckPptxPreviewVisuals?.(preview.wrapper,model,bytes);
  preview.renderSingleSlide(0);
  await new Promise(resolve=>setTimeout(resolve,0));
  const title=[...host.querySelectorAll('span')].find(e=>e.textContent==='赤沙台遗址');
  assert.ok(Boolean(title));
  assert.equal(title.style.fontSize,'37px');
  assert.equal(title.style.color,'rgb(255, 240, 210)');
  assert.match(title.style.fontFamily,/Noto Serif SC.*serif/);
  const picture=host.querySelector('img');assert.ok(Boolean(picture));
  assert.equal(picture.style.maxWidth,'none');
  assert.equal(picture.style.height,`${picture.getAttribute('height')}px`);
  assert.equal(picture.style.width,`${picture.getAttribute('width')}px`);
  assert.ok(Number(picture.getAttribute('width'))>549);
  // New slides/repaints receive the same protection, without rewriting media.
  preview.renderSingleSlide(0);await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(host.querySelector('img').style.maxWidth,'none');
 }finally{stop?.();preview.destroy();host.remove();reset.remove();}
});

test('preview image dimensions override the global height:auto and max-width reset',async()=>{
 const bytes=await sampleBytes();const host=document.createElement('div');document.body.append(host);
 const reset=document.createElement('style');reset.textContent='img{max-width:100%;height:auto}';document.head.append(reset);
 const preview=init(host,{mode:'slide',width:960,height:540});let stop;
 try{
  const model=await preview.load(bytes);
  stop=visuals.applyDeckPptxPreviewVisuals?.(preview.wrapper,model,bytes);
  preview.renderSingleSlide(0);
  visuals.paintDeckPptxPreviewImages?.(preview.wrapper);
  const clone=preview.wrapper.cloneNode(true);
  assert.equal(clone.querySelector('img').style.maxWidth,'none');
  const image=host.querySelector('img');
  assert.ok(Boolean(image));
  assert.equal(window.getComputedStyle(image).maxWidth,'none');
  assert.equal(window.getComputedStyle(image).height,`${image.getAttribute('height')}px`);
 }finally{stop?.();preview.destroy();host.remove();reset.remove();}
});
