import './helpers/w1-jsdom-window.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { compileModule, dataModule } from './helpers/module-bench.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let observer;
globalThis.IntersectionObserver = class {
  constructor(callback) { this.callback = callback; observer = this; }
  observe() {} disconnect() {}
  emit(value) { this.callback([{ isIntersecting: value }]); }
};
const { WorkspaceThumbnail } = await import(await compileModule('src/shell/workspace-library-thumbnail.tsx', {
  '../i18n/ui/useUI': dataModule('export const useUI=()=>s=>s;'),
  '../lib/auth/client': dataModule('export const accessToken=async()=>null;'),
  '../lib/auth/config': dataModule('export const gatewayBase=()=>"https://gateway.test";'),
  '../lib/database': dataModule('export const ensureDatabaseThumbnail=async()=>({ok:false});'),
  './advanced-features': dataModule('export const advancedLibraryReferenceFor=()=>null;'),
  './ArtifactRendition': dataModule('export const useArtifactRendition=()=>globalThis.__retryRendition;'),
  './library-data': dataModule('export const isDurableLibraryItem=()=>false; export const cacheableRenditionTwin=()=>null;'),
  './document-shelf-cover': dataModule('export const itemUsesDocumentShelfCover=()=>false; export const DocumentShelfCover=()=>null;'),
  './document-cover-excerpt': dataModule('export const itemUsesTextDocumentCard=()=>false;'),
  './workspace-library-model': dataModule('export const WORKSPACE_KIND_LABELS={website:"网站"};'),
  './library-editor-category': dataModule('export const libraryEditorLabel=()=>"网站";export const translateLibraryTypeLabel=(tt,s)=>tt(s);'),
  './works/link-work-item': dataModule('export const linkWorkFromLibraryItem=()=>null;'),
}));
async function bench(missing = false) {
  let id=0, failures=0, retries=0;
  const timers=new Map(), originalSet=globalThis.setTimeout, originalClear=globalThis.clearTimeout;
  globalThis.setTimeout=(fn,ms)=>{ const key=++id;timers.set(key,{fn,ms});return key; };
  globalThis.clearTimeout=key=>timers.delete(key);
  globalThis.__retryRendition={url:'',version:0,loading:false,error:'',rendition:null,resourceFailed(){failures++;},retry(){retries++;}};
  const host=document.createElement('div'),root=createRoot(host);
  const item={key:'cover',id:'cover',source:'creation',kind:'website',title:'Site',siteId:'',favorite:false,meta:{},thumbUrl:missing ? undefined : 'https://files.test/small.webp'};
  await act(async()=>root.render(React.createElement(WorkspaceThumbnail,{url:missing ? undefined : 'https://files.test/full.png',item,alt:'Site',kind:'website',accent:'#333333',imageClassName:'cover'})));
  await act(async()=>observer.emit(true));
  return {host,hasTimer(ms){return [...timers.values()].some(t=>t.ms===ms);},get failures(){return failures;},get retries(){return retries;},
    async tick(ms){const entry=[...timers.entries()].find(([,t])=>t.ms===ms);assert.ok(entry,`timer ${ms}`);timers.delete(entry[0]);await act(async()=>entry[1].fn());},
    async close(){await act(async()=>root.unmount());globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;}
  };
}
test('cover timeout preserves image and a late 200 load recovers',async()=>{
  const b=await bench();try{
    const image=b.host.querySelector('img');assert.equal(image.getAttribute('src'),'https://files.test/small.webp');
    await b.tick(15000);assert.equal(b.host.querySelector('img'),image);assert.doesNotMatch(b.host.textContent,/封面不可用/);
    await act(async()=>image.dispatchEvent(new window.Event('load',{bubbles:true})));
    assert.equal(b.host.querySelector('[data-cover-state]').dataset.coverState,'ready');
  }finally{await b.close();}
});
test('cover retries three times with backoff then resets when it re-enters viewport',async()=>{
  const b=await bench();try{
    for(const delay of [1000,2000,4000]){
      await act(async()=>b.host.querySelector('img').dispatchEvent(new window.Event('error',{bubbles:true})));
      assert.ok(b.host.querySelector('img'));await b.tick(delay);
    }
    await act(async()=>b.host.querySelector('img').dispatchEvent(new window.Event('error',{bubbles:true})));
    assert.equal(b.failures,1);
    await act(async()=>observer.emit(false));await act(async()=>observer.emit(true));
    assert.equal(b.retries,1);
    await act(async()=>b.host.querySelector('img').dispatchEvent(new window.Event('error',{bubbles:true})));
    await b.tick(1000);assert.ok(b.host.querySelector('img'));
  }finally{await b.close();}
});

test('an actually missing cover keeps its explanation instead of timing out to a blank card',async()=>{
  const b=await bench(true);try{
    assert.ok(b.host.querySelector('[role="alert"]'));
    assert.equal(b.hasTimer(15000),false);
  }finally{await b.close();}
});
