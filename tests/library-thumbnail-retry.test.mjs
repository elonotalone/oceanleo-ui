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
const { WorkspaceThumbnail, coverPreviewFallback } = await import(await compileModule('src/shell/workspace-library-thumbnail.tsx', {
  '../i18n/ui/useUI': dataModule('export const useUI=()=>s=>s;'),
  '../lib/auth/client': dataModule('export const accessToken=async()=>null;'),
  '../lib/auth/config': dataModule('export const GATEWAY_BASE="https://gateway.test"; export const gatewayBase=()=>GATEWAY_BASE;'),
  '../lib/database': dataModule('export const ensureDatabaseThumbnail=async()=>({ok:false});'),
  './advanced-features': dataModule('export const advancedLibraryReferenceFor=()=>null;'),
  './ArtifactRendition': dataModule('export const useArtifactRendition=(item,purposes)=>{globalThis.__coverPurposes=purposes;const state=globalThis.__retryRendition;if(item?.artifact){const selected=item.artifact.renditions[purposes[0]];state.rendition=selected;state.url=selected?.url||"";}return state;}'),
  './library-data': dataModule('export const isDurableLibraryItem=item=>Boolean(item?.artifact); export const cacheableRenditionTwin=()=>null;'),
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
  const item={key:'cover',id:'cover',source:'creation',kind:'website',title:'Site',siteId:'',favorite:false,meta:{},previewUrl:'https://files.test/full.webp',thumbUrl:missing ? undefined : 'https://files.test/small.thumb.webp'};
  if(collection.typed) {
    item.kind='image';item.artifactId='root';item.revisionId='r1';
    item.artifact={revisionId:'r1',renditions:Object.fromEntries(['thumbnail','preview'].map(purpose=>[purpose,{purpose,revisionId:'r1',url:purpose==='thumbnail'?item.thumbUrl:item.previewUrl,mediaType:'image/webp',width:200,height:100,format:'webp'}]))};
  }
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
test('cover fallback chooses full preview once and preserves signed URLs', () => {
  assert.equal(coverPreviewFallback('https://files.test/small.thumb.webp'), 'https://files.test/small.webp');
  assert.equal(coverPreviewFallback('https://files.test/small.thumb.webp', 'https://files.test/full.webp'), 'https://files.test/full.webp');
  assert.equal(coverPreviewFallback('https://files.test/image.webp?signature=abc'), 'https://files.test/image.webp?signature=abc');
  assert.equal(coverPreviewFallback('https://files.test/image.thumb.webp?signature=abc'), 'https://files.test/image.thumb.webp?signature=abc');
});

test('loading, failed and timeout covers never render a retry control', async () => {
  const b=await bench(); try {
    assert.equal(b.host.querySelector('button'), null);
    const first=b.host.querySelector('img');
    await act(async()=>first.dispatchEvent(new window.Event('error',{bubbles:true})));
    assert.equal(b.host.querySelector('button'), null);
    await b.tick(1000);
    assert.equal(b.host.querySelector('img').getAttribute('src'), 'https://files.test/full.webp');
    await b.tick(15000);
    assert.equal(b.host.querySelector('button'), null);
    assert.equal(b.host.querySelector('[data-cover-timeout]'), null);
    await b.tick(2000);
    await act(async()=>b.host.querySelector('img').dispatchEvent(new window.Event('load',{bubbles:true})));
    assert.equal(b.host.querySelector('[data-cover-state]').dataset.coverState,'ready');
  } finally { await b.close(); }
});

test('a timed-out thumbnail falls back and a late successful load removes the loading look', async () => {
  const b=await bench(); try {
    await b.tick(15000);
    assert.equal(b.host.querySelector('button'), null);
    await b.tick(1000);
    assert.equal(b.host.querySelector('img').getAttribute('src'), 'https://files.test/full.webp');
    await act(async()=>b.host.querySelector('img').dispatchEvent(new window.Event('load',{bubbles:true})));
    assert.equal(b.host.querySelector('[data-cover-state]').dataset.coverState, 'ready');
    assert.equal(b.host.querySelector('[role="status"]'),null);
  } finally { await b.close(); }
});

test('known absent cover keeps its explicit explanation without a manual retry',async()=>{
  const b=await bench(true); try {
    assert.equal(b.host.querySelector('button'),null);
    assert.equal(b.hasTimer(15000),false);
  } finally { await b.close(); }
});

for (const Item of [CollectionItemCard, CollectionItemRow]) {
  for (const href of [undefined, '/library/site']) {
    test(`${Item.name}: recovering cover hydrates and leaves primary and Favorite actions usable (${href ?? 'button'})`,async(t)=>{
      const errors=[]; t.mock.method(console,'error',(...args)=>errors.push(args));
      const b=await bench(false,{Item,href,errors}); try {
        for(const delay of [1000,2000,4000,8000,15000,30000,30000]) {
          await act(async()=>b.host.querySelector('img').dispatchEvent(new window.Event('error',{bubbles:true})));
          assert.equal(b.host.querySelector('button[aria-label="重试"]'),null);
          await b.tick(delay);
        }
        const primary=b.host.querySelector('.leo-collection-open');
        await act(async()=>[...b.host.querySelectorAll('button')].find(button=>button.textContent==='Favorite').click());
        assert.equal(b.starred,1); assert.equal(b.opened,0);
        await act(async()=>primary.click()); assert.equal(b.opened,1);
        assert.equal(b.host.querySelector('button button, button a, a button, a a'),null);
      } finally { await b.close(); }
      assert.deepEqual(errors,[]);
    });
  }
}

test('durable covers switch the rendition purpose from thumbnail to preview once',async()=>{
  const b=await bench(false,{typed:true});try{
    assert.equal(globalThis.__coverPurposes[0],'thumbnail');
    assert.equal(b.host.querySelector('img').getAttribute('src'),'https://files.test/small.thumb.webp');
    await act(async()=>b.host.querySelector('img').dispatchEvent(new window.Event('error',{bubbles:true})));
    await b.tick(1000);
    assert.equal(globalThis.__coverPurposes[0],'preview');
    assert.equal(b.host.querySelector('img').getAttribute('src'),'https://files.test/full.webp');
    await act(async()=>b.host.querySelector('img').dispatchEvent(new window.Event('load',{bubbles:true})));
    assert.equal(b.host.querySelector('[data-cover-state]').dataset.coverState,'ready');
  }finally{await b.close();}
});
