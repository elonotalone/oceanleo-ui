import './helpers/w1-jsdom-window.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
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
const { CollectionItemCard, CollectionItemRow } = await import(await compileModule("src/shell/collection-items.tsx"));

async function bench(missing = false, collection = {}) {
  let id=0, failures=0, retries=0;
  const timers=new Map(), originalSet=globalThis.setTimeout, originalClear=globalThis.clearTimeout;
  globalThis.setTimeout=(fn,ms)=>{ const key=++id;timers.set(key,{fn,ms});return key; };
  globalThis.clearTimeout=key=>timers.delete(key);
  globalThis.__retryRendition={url:'',version:0,loading:false,error:'',rendition:null,
    resourceFailed(){failures++;if(collection.terminal) this.error='连不上素材服务，请检查网络后重试。';},
    retry(){retries++;this.error='';},
  };
  const host=document.createElement('div');
  document.body.appendChild(host);
  let root, opened=0, starred=0;
  const item={key:'cover',id:'cover',source:'creation',kind:'website',title:'Site',siteId:'',favorite:false,meta:{},thumbUrl:missing ? undefined : 'https://files.test/small.webp'};
  const thumbnail = React.createElement(WorkspaceThumbnail,{url:missing ? undefined : 'https://files.test/full.png',item,alt:'Site',kind:'website',accent:'#333333',imageClassName:'cover'});
  const content = collection.Item ? React.createElement(collection.Item, {
    cover:thumbnail, title:'Site', openHref:collection.href,
    onOpen(event){event?.preventDefault();opened++;},
    actions:React.createElement('button',{type:'button',onClick(){starred++;}},'Favorite'),
  }) : thumbnail;
  await act(async()=>{
    if(collection.Item){
      host.innerHTML=renderToString(content);
      root=hydrateRoot(host,content,{onRecoverableError(error){collection.errors.push(error);}});
    }else{root=createRoot(host);root.render(content);}
  });
  await act(async()=>observer.emit(true));
  return {host,get opened(){return opened;},get starred(){return starred;},hasTimer(ms){return [...timers.values()].some(t=>t.ms===ms);},get failures(){return failures;},get retries(){return retries;},
    async tick(ms){const entry=[...timers.entries()].find(([,t])=>t.ms===ms);assert.ok(entry,`timer ${ms}`);timers.delete(entry[0]);await act(async()=>entry[1].fn());},
    async close(){await act(async()=>root.unmount());host.remove();globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;}
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
    assert.equal(b.host.querySelector('button[aria-label="重试"]'),null,'no retry when there is no cover resource');
  }finally{await b.close();}
});

for (const Item of [CollectionItemCard, CollectionItemRow]) {
  for (const href of [undefined, '/library/site']) {
    test(`${Item.name}: terminal cover failure retains a working independent retry with ${href ? 'link' : 'button'} primary action`, async(t)=>{
      const errors=[];
      t.mock.method(console,'error',(...args)=>errors.push(args));
      const b=await bench(false,{Item,href,errors,terminal:true});
      try{
        for(const delay of [1000,2000,4000]){
          await act(async()=>b.host.querySelector('img').dispatchEvent(new window.Event('error',{bubbles:true})));
          await b.tick(delay);
        }
        await act(async()=>b.host.querySelector('img').dispatchEvent(new window.Event('error',{bubbles:true})));
        assert.equal(b.failures,1);
        assert.equal(b.host.querySelector('[data-cover-state]').dataset.coverState,'error');
        assert.match(b.host.querySelector('[role="alert"]').textContent,/封面不可用.*连不上素材服务，请检查网络后重试。/);
        const image=b.host.querySelector('img');
        const retry=b.host.querySelector('button[aria-label="重试"]');
        assert.ok(retry,'terminal failure still offers the promised retry');
        assert.equal(retry.parentElement.closest('button, a'),null);
        await act(async()=>retry.click());
        assert.equal(b.retries,1);assert.equal(b.opened,0);
        assert.equal(b.host.querySelector('[role="alert"]'),null,'retry clears terminal error');
        assert.notEqual(b.host.querySelector('img'),image,'retry remounts the actual cover resource');
        await act(async()=>b.host.querySelector('img').dispatchEvent(new window.Event('error',{bubbles:true})));
        await b.tick(1000);
        await act(async()=>b.host.querySelector('img').dispatchEvent(new window.Event('load',{bubbles:true})));
        assert.equal(b.host.querySelector('[data-cover-state]').dataset.coverState,'ready');
        assert.equal(b.host.querySelector('button[aria-label="重试"]'),null);
        assert.equal(b.host.querySelector('button button, button a, a button, a a'),null);
      }finally{await b.close();}
      assert.deepEqual(errors,[],'no console.error or recoverable hydration error');
    });

    test(`${Item.name}: failed real cover hydrates with independent retry and ${href ? 'link' : 'button'} primary action`, async(t)=>{
      const errors=[];
      t.mock.method(console,'error',(...args)=>errors.push(args));
      const b=await bench(false,{Item,href,errors});
      try{
        await act(async()=>b.host.querySelector('img').dispatchEvent(new window.Event('error',{bubbles:true})));
        const retry=b.host.querySelector('button[aria-label="重试"]');
        assert.ok(retry,'failed real cover exposes retry');
        assert.equal(retry.closest('button, a'),retry);
        assert.equal(retry.parentElement.closest('button, a'),null,'retry is outside the primary action');
        const primary=b.host.querySelector('.leo-collection-open');
        assert.equal(primary.tagName,href ? 'A' : 'BUTTON');
        if(href) assert.equal(primary.getAttribute('href'),href);
        assert.equal(document.getElementById(primary.getAttribute('aria-labelledby')).textContent,'Site');
        primary.focus();assert.equal(document.activeElement,primary);
        retry.focus();assert.equal(document.activeElement,retry);
        await act(async()=>retry.click());
        assert.equal(b.retries,1);assert.equal(b.opened,0);
        await act(async()=>[...b.host.querySelectorAll('button')].find(button=>button.textContent==='Favorite').click());
        assert.equal(b.starred,1);assert.equal(b.opened,0);
        await act(async()=>primary.click());
        assert.equal(b.opened,1);
        assert.equal(b.host.querySelector('button button, button a, a button, a a'),null);
      }finally{await b.close();}
      assert.deepEqual(errors,[],'no console.error or recoverable hydration error');
    });
  }
}
