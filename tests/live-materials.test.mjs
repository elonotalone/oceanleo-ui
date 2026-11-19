import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import React, { act } from 'react';
import './helpers/w1-jsdom-window.mjs';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
import { LOCALES } from '../src/i18n/config.ts';
import { LIVE_MATERIAL_MESSAGES } from '../src/i18n/ui/messages/live-material-copy.ts';
import { loadUiMessages } from '../src/i18n/ui/messages/load.ts';

const { createRoot } = await import('react-dom/client');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;
const tt = dataModule('export function useUI(){return (key,vars={})=>key.replace(/\\{(\\w+)\\}/g,(_,k)=>vars[k]??k);}');
const calls = [];
let request;
globalThis.__liveRequest = async (method, path, body, options) => {
  calls.push({ method, path, body, options });
  return request(method, path, body, options);
};
const http = dataModule('export const bayGet=(path,options)=>globalThis.__liveRequest("GET",path,undefined,options); export const bayPost=(path,body)=>globalThis.__liveRequest("POST",path,body); export const bayDelete=path=>globalThis.__liveRequest("DELETE",path);');
const clientUrl = await compileModule('src/lib/live-materials.ts', { './bay/http': http });
const client = await import(clientUrl);
const connectionUrl = await compileModule('src/pages/settings/SketchfabConnection.tsx', {
  '../../i18n/ui/useUI': tt, '../../lib/live-materials': clientUrl,
});
const liveUrl = await compileModule('src/shell/bay/asset/LiveMaterialSearch.tsx', {
  '../../../i18n/ui/useUI': tt, '../../../lib/live-materials': clientUrl,
  '../../../pages/settings/SketchfabConnection': connectionUrl,
});
const { LiveMaterialSearch } = await import(liveUrl);
const { SketchfabConnection } = await import(connectionUrl);
const { InlineEditorMaterialPanel } = await import(await compileModule('src/shell/InlineEditorMaterialPanel.tsx', {
  '../i18n/ui/useUI': tt, '../lib/live-materials': clientUrl, './bay/asset/LiveMaterialSearch': liveUrl,
  './MaterialLibrary': dataModule('export function MaterialLibrary(){return null;}'),
  './InlineInsertableMaterialShelf': dataModule(`import React from ${JSON.stringify(import.meta.resolve('react'))};export function InlineInsertableMaterialShelf(){return React.createElement('div',{'data-own-library':true});}`),
}));
const asset = (overrides={}) => ({ id:'pexels:image/77', provider:'pexels', type:'image', title:'Sunset', author:'Maya',
  source_url:'https://www.pexels.com/photo/77', thumb_url:'https://images.pexels.com/77.jpg', preview_url:'', formats:['jpg'],
  license:{code:'Pexels', url:'https://www.pexels.com/license/', attributionRequired:true, attributionText:'Maya / Pexels'}, ...overrides });
const projection = (overrides={}) => ({ schema:'oceanleo.artifact.v1', artifactId:'private-copy', revisionId:'r7', artifactType:'single_file_image', title:'Sunset',
  roles:['user_upload'], owner:{principalId:'user-1',visibility:'private',originSiteKey:'oceanleo',originAppId:''},
  access:{read:true,preview:true,edit:false,fork:false,insert:true,replace:true,favorite:true,bind:true,export_source:true}, editability:'view_only', sourceFormat:'jpg',
  provenance:{id:'provenance-7', sourceKind:'approved_provider', provider:'pexels', providerAssetId:'image/77', sourceUrl:'https://www.pexels.com/photo/77', author:'Maya',licenseCode:'Pexels',licenseUrl:'https://www.pexels.com/license/',attributionText:'Maya / Pexels'},
  integrity:{ok:true,code:'ok',reason:''}, renditions:{source:{purpose:'source',revisionId:'r7',url:'https://private.test/copy.jpg'},full:{purpose:'full',revisionId:'r7',url:'https://private.test/copy.jpg'}}, ...overrides });
function reset(items=[asset()]) {
  calls.length=0;
  request=async(method,path)=> {
    if(path.startsWith('/v1/assets/search?')) return {items,has_more:false};
    if(path==='/v1/assets/use') return projection();
    if(path==='/v1/assets/connections') return {connections:[{provider:'sketchfab',status:'disconnected'}]};
    throw new Error(`Unexpected ${method} ${path}`);
  };
}
async function mount(element) {
  const host=document.createElement('div'); document.body.append(host); const root=createRoot(host);
  await act(async()=>root.render(element));
  return {host,root,async close(){await act(async()=>root.unmount());host.remove();}};
}
async function click(node) { assert.ok(node, 'click target exists'); await act(async()=>node.click()); }
const buttons=host=>[...host.querySelectorAll('button')];
const button=(host,text)=>buttons(host).find(node=>node.textContent===text);

test('each editor gets compatible online types; no live audio or old stock types',()=>{
  assert.deepEqual(client.liveTypesForEditor('image'),['image','icon','texture']);
  for(const kind of ['ppt','document','pdf','sheet']) assert.deepEqual(client.liveTypesForEditor(kind),['image','icon']);
  assert.deepEqual(client.liveTypesForEditor('video',['image','video','audio']),['video','image']);
  assert.deepEqual(client.liveTypesForEditor('website'),['image','video','3d','texture','hdri','icon','font']);
  assert.deepEqual(client.liveTypesForEditor('audio'),[]);
});

test('live search preserves provider, author, licences and uses paginated external API',async()=>{
  reset([asset({license:{code:'CC-BY-4.0',url:'https://creativecommons.org/licenses/by/4.0/',attribution_required:true,attribution_text:'Maya'}})]);
  const result=await client.searchLiveMaterials({q:'sun & sky',type:'image',page:2,pageSize:12});
  const params=new URL(calls[0].path,'https://test.invalid').searchParams;
  assert.equal(params.get('q'),'sun & sky'); assert.equal(params.get('page'),'2'); assert.equal(params.get('page_size'),'12');
  assert.equal(params.get('license'),'commercial'); assert.equal(result.items[0].author,'Maya');
  assert.equal(result.items[0].license.attributionRequired,true); assert.equal(result.items[0].license.attributionText,'Maya');
  assert.equal(calls.some(call=>call.path.includes('/library/search')),false);
});

test('use creates durable Library copies and preserves provenance; rejects transient responses',async()=>{
  reset(); const item=await client.useLiveMaterial({id:'pexels:image/77',variant:'jpg'});
  assert.equal(item.artifactId,'private-copy'); assert.equal(item.revisionId,'r7');
  assert.equal(item.artifact.provenance.provider,'pexels'); assert.equal(item.artifact.provenance.author,'Maya');
  assert.deepEqual(calls[0].body,{id:'pexels:image/77',variant:'jpg'});
  request=async()=>({id:'pexels:image/77',full_url:'https://external.test/77.jpg'});
  await assert.rejects(client.useLiveMaterial({id:'pexels:image/77'}),/素材未能存入我的库/);
});

test('download-only provider packages keep real private folder identity, without a fabricated artifact',async()=>{
  reset();request=async()=>({kind:'folder',folderId:'folder-1',title:'Texture pack',visibility:'private',folder:{id:'folder-1'},provenance:{provider:'ambientcg',licenseCode:'CC0'}});
  const item=await client.useLiveMaterial({id:'ambientcg:rocks'});
  assert.equal(item.kind,'file');assert.equal(item.meta.library_folder_id,'folder-1');assert.equal(item.artifactId,undefined);
  assert.equal(item.meta.provenance.provider,'ambientcg');
});


test('editor online tab uses a private copy through the existing insert action',async()=>{
  reset(); const inserted=[];
  const view=await mount(h(InlineEditorMaterialPanel,{item:{kind:'image',meta:{}},siteId:'image',accent:'#000',primaryMaterialAction:'insert',
    materials:{materialTypes:['image'],actions:['insert'],entries:[],appId:'image',perform:async(...args)=>{inserted.push(args);return {ok:true};},canPerform:()=>true}}));
  try {
    assert.ok(view.host.querySelector('[data-own-library]'));
    await click(button(view.host,'在线素材'));
    assert.equal(button(view.host,'材质贴图').getAttribute('aria-pressed'),'false');
    assert.match(view.host.textContent,/Maya.*Pexels/s);
    assert.ok(view.host.querySelector('a[href="https://www.pexels.com"]'));
    await click(button(view.host,'使用'));
    assert.equal(calls.filter(call=>call.path==='/v1/assets/use').length,1);
    assert.equal(inserted[0][0],'insert'); assert.equal(inserted[0][1].artifactId,'private-copy');
    assert.equal(inserted[0][1].url,'https://private.test/copy.jpg'); assert.deepEqual(inserted[0][2],{source:'click'});
    assert.match(view.host.textContent,/已插入/);
  } finally {await view.close();}
});

test('failed insert retries the saved copy without duplicating a Library item; variant reaches use API',async()=>{
  reset([asset({formats:['jpg','png']})]); let count=0;
  const view=await mount(h(LiveMaterialSearch,{types:['image'],onUse:async()=>{if(++count===1)throw new Error('editor busy');}}));
  try {
    await act(async()=>{const select=view.host.querySelector('select');select.value='png';select.dispatchEvent(new window.Event('change',{bubbles:true}));});
    await click(button(view.host,'存到我的库')); assert.match(view.host.textContent,/素材未能使用/);
    await click(view.host.querySelector('[data-live-material] button'));
    assert.equal(count,2); assert.equal(calls.filter(call=>call.path==='/v1/assets/use').length,1);
    assert.equal(calls.find(call=>call.path==='/v1/assets/use').body.variant,'png'); assert.match(view.host.textContent,/已使用素材/);
  } finally {await view.close();}
});

test('Sketchfab needs per-user connection before use, refreshes after authorisation and disconnects in Settings',async()=>{
  let connected=false; reset();
  request=async(method,path)=>{
    if(path.startsWith('/v1/assets/search?'))return {items:[asset({provider:'sketchfab',id:'sketchfab:model',type:'3d',needs_connection:'sketchfab'})]};
    if(path==='/v1/assets/connections')return {connections:[{provider:'sketchfab',status:connected?'connected':'disconnected'}]};
    if(path.endsWith('/start'))return {url:'https://sketchfab.com/oauth2/authorize/?client_id=public-app-id'};
    if(method==='DELETE'){connected=false;return {ok:true};}
    if(path==='/v1/assets/use')return projection();
    throw new Error(path);
  };
  const originalOpen=window.open;const opened=[];window.open=(...args)=>{opened.push(args);return null;};
  const view=await mount(h(LiveMaterialSearch,{types:['3d']}));
  try {
    assert.ok(button(view.host,'连接 Sketchfab'));assert.equal(button(view.host,'存到我的库'),undefined);
    await click(button(view.host,'连接 Sketchfab'));assert.equal(opened.length,1); assert.equal(calls.some(call=>call.path==='/v1/assets/use'),false);
    connected=true; await act(async()=>window.dispatchEvent(new window.Event('focus')));
    assert.ok(button(view.host,'存到我的库'));await click(button(view.host,'存到我的库'));
    assert.equal(calls.filter(call=>call.path==='/v1/assets/use').length,1);
    assert.match(view.host.textContent,/已存到我的库/);
  } finally {await view.close();window.open=originalOpen;}
  const settings=await mount(h(SketchfabConnection));
  try {await click(button(settings.host,'断开连接'));assert.ok(button(settings.host,'连接 Sketchfab'));assert.equal(connected,false);}
  finally {await settings.close();}
});

test('search failure is recoverable and partial sources are visible',async()=>{
  reset();let fail=true;
  request=async()=>{if(fail)throw new Error('network');return {items:[asset()],partial:true};};
  const view=await mount(h(LiveMaterialSearch,{types:['image']}));
  try {assert.match(view.host.textContent,/图片搜索正在加载/);assert.equal(button(view.host,'重试'),undefined);fail=false;await act(async()=>window.dispatchEvent(new window.Event('online')));
    assert.ok(view.host.querySelector('[data-live-material]'));assert.match(view.host.textContent,/内容暂时无法加载，正在自动恢复/);assert.ok(view.host.querySelector('[data-live-material]'));assert.equal(button(view.host,'重试'),undefined);}
  finally {await view.close();}
});

test('superseded searches cannot overwrite a newer query',async()=>{
  reset();let late;
  request=async(method,path)=>new URL(path,'https://test.invalid').searchParams.get('q')==='old'
    ? await new Promise(resolve=>{late=resolve;}) : {items:[asset({title:'Newest'})]};
  const view=await mount(h(LiveMaterialSearch,{types:['image'],initialQuery:'old'}));
  try {
    await act(async()=>view.root.render(h(LiveMaterialSearch,{types:['image'],initialQuery:'new'})));
    assert.match(view.host.textContent,/Newest/);
    await act(async()=>late({items:[asset({title:'Stale'})]}));
    assert.doesNotMatch(view.host.textContent,/Stale/);
  }finally{await view.close();}
});

test('untrusted media links and OAuth redirects reject executable schemes and other hosts',async()=>{
  for(const value of ['javascript:alert(1)','data:text/html,test','file:///tmp/file','https://user:pass@example.test'])assert.equal(client.materialHttpUrl(value),'');
  reset();request=async()=>({url:'https://attacker.test/oauth'});await assert.rejects(client.startSketchfabConnection());
});

test('old live variants, stock origin code and collection snapshots are gone; official shelf and chat mount share live search',()=>{
  for(const file of ['BayAssetLive.tsx','BayAssetSeries.tsx','origin-index.ts'])assert.equal(existsSync(new URL('../src/shell/bay/asset/'+file,import.meta.url)),false);
  const bay=readFileSync(new URL('../src/shell/bay/asset/BayAssetLibrary.tsx',import.meta.url),'utf8');
  assert.match(bay,/LiveMaterialSearch/);assert.match(bay,/ReadyMaterialCatalog/);
  const chat=readFileSync(new URL('../src/shell/ResultCanvas.tsx',import.meta.url),'utf8');assert.match(chat,/LiveMaterialSearch key=\{bayRequest.nonce\}/);
  assert.match(chat,/workspaceEntryFromLibraryItem\(item\)/);
});

test('all 17 locale dictionaries cover the new copy and runtime loader includes it',async()=>{
  const expected=Object.keys(LIVE_MATERIAL_MESSAGES.zh).sort();
  for(const locale of LOCALES){
    assert.deepEqual(Object.keys(LIVE_MATERIAL_MESSAGES[locale]).sort(),expected,locale);
    const runtime=await loadUiMessages(locale);
    for(const key of expected){assert.ok(LIVE_MATERIAL_MESSAGES[locale][key],`${locale}:${key}`);if(locale!=='zh')assert.equal(runtime[key],LIVE_MATERIAL_MESSAGES[locale][key]);}
  }
});


test('Iconify cards show the original icon set and its licence, rather than only the API provider',async()=>{
 reset([asset({provider:'iconify',id:'iconify:tabler:home',type:'icon',author:'Paweł Kuna',license:{code:'MIT',url:'https://example.test/LICENSE'}})]);
 const view=await mount(h(LiveMaterialSearch,{types:['icon']}));
 try {assert.match(view.host.textContent,/tabler/);assert.match(view.host.textContent,/MIT/);assert.match(view.host.textContent,/Paweł Kuna/);}
 finally{await view.close();}
});

test('pagination retains earlier results and a search submit resets the page',async()=>{
 reset();request=async(method,path)=>{const params=new URL(path,'https://test.invalid').searchParams;const page=Number(params.get('page'));return {items:[asset({id:'pexels:image/'+page,title:params.get('q')||'Page '+page})],has_more:page===1};};
 const view=await mount(h(LiveMaterialSearch,{types:['image']}));
 try {
  await click(button(view.host,'加载更多'));assert.equal(view.host.querySelectorAll('[data-live-material]').length,2);
  await act(async()=>view.host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(view.host.querySelectorAll('[data-live-material]').length,1);
  assert.equal(new URL(calls.at(-1).path,'https://test.invalid').searchParams.get('page'),'1');
 }finally{await view.close();}
});


test('package saves succeed without sending a folder through the editor insert path',async()=>{
 reset();let inserted=0;request=async(method,path)=>path.startsWith('/v1/assets/search?')?{items:[asset({provider:'ambientcg',id:'ambientcg:rocks',type:'texture'})]}:{kind:'folder',folderId:'pack',title:'Rocks',visibility:'private',folder:{id:'pack'},provenance:{licenseCode:'CC0'}};
 const view=await mount(h(LiveMaterialSearch,{types:['texture'],actionLabel:'使用',onUse:()=>{inserted++;}}));
 try {await click(button(view.host,'存到我的库'));assert.match(view.host.textContent,/已存到我的库/);assert.equal(inserted,0);}
 finally{await view.close();}
});


test('successful acquisition refreshes already-mounted typed and folder Library shelves',async()=>{
 reset();const events=[];const typed=event=>events.push(event.detail.artifactId);const folder=event=>events.push(event.detail.folder.id);
 window.addEventListener('oceanleo:artifact-library-change',typed);window.addEventListener('oceanleo:library-folders-change',folder);
 try {
  await client.useLiveMaterial({id:'pexels:image/77'});
  request=async()=>({kind:'folder',folderId:'folder-event',title:'Font',visibility:'private',folder:{id:'folder-event'},provenance:{licenseCode:'OFL'}});
  await client.useLiveMaterial({id:'fontsource:noto-sans'});assert.deepEqual(events,['private-copy','folder-event']);
 }finally{window.removeEventListener('oceanleo:artifact-library-change',typed);window.removeEventListener('oceanleo:library-folders-change',folder);}
});


test('agent-requested type initializes the live picker instead of silently searching images',async()=>{
 reset();const view=await mount(h(LiveMaterialSearch,{initialQuery:'rock',initialType:'3d'}));
 try {assert.equal(new URL(calls[0].path,'https://test.invalid').searchParams.get('type'),'3d');assert.equal(button(view.host,'3D 模型').getAttribute('aria-pressed'),'true');}
 finally{await view.close();}
});

async function fastPoll(run) {
  const original = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...args) => original(fn, Math.min(ms, 2), ...args);
  try { await run(); } finally { globalThis.setTimeout = original; }
}
const flush = () => new Promise(resolve => setTimeout(resolve, 5));
const pending = {acquisitionId:'acquisition-1',state:'pending',materialId:'pexels:image/77'};

test('background acquisition polls with progress and only yields the durable completed copy', async()=>fastPoll(async()=>{
  reset();let polls=0;const states=[];
  request=async(method,path)=> {
    if(path==='/v1/assets/use')return pending;
    assert.equal(path,'/v1/assets/acquisitions/acquisition-1');
    if(++polls===1)throw new Error('temporary connection loss');
    return polls===2 ? pending : {...pending,state:'done',item:projection()};
  };
  const result=await client.useLiveMaterial({id:'pexels:image/77'},{onProgress:s=>states.push(s.state)});
  assert.equal(result.artifactId,'private-copy'); assert.equal(polls,3);
  assert.equal(states.at(-1),'done');assert.equal(states[0],'pending');
  assert.equal(calls.filter(c=>c.method==='POST').length,1);
}));

test('background picker keeps other cards usable and inserts only after completion',async()=>fastPoll(async()=>{
  reset([asset(),asset({id:'pexels:image/88',title:'Other photo'})]);let complete;
  request=async(method,path)=> {
    if(path.startsWith('/v1/assets/search?'))return {items:[asset(),asset({id:'pexels:image/88',title:'Other photo'})]};
    if(path==='/v1/assets/use')return pending;
    if(path.includes('/acquisitions/'))return await new Promise(resolve=>{complete=resolve;});
    throw Error(path);
  };
  const inserted=[];const view=await mount(h(LiveMaterialSearch,{types:['image'],onUse:item=>inserted.push(item)}));
  try{
    const cards=view.host.querySelectorAll('[data-live-material]');
    await click(cards[0].querySelector('button'));
    await act(flush);
    assert.match(cards[0].textContent,/正在存入我的库/);
    assert.equal(cards[0].querySelector('button').disabled,true);
    assert.equal(cards[1].querySelector('button').disabled,false);
    assert.equal(inserted.length,0);
    await act(async()=>{complete({...pending,state:'done',item:projection()});await flush();});
    assert.equal(inserted.length,1); assert.equal(inserted[0].artifactId,'private-copy');
    assert.match(cards[0].textContent,/已存到我的库/);
  }finally{await view.close();}
}));

test('failed background acquisition shows a per-card retry that really retries the save',async()=>fastPoll(async()=>{
  reset();let posts=0;
  request=async(method,path)=> {
    if(path.startsWith('/v1/assets/search?'))return {items:[asset()]};
    if(path==='/v1/assets/use')return ++posts===1 ? pending : projection();
    return {...pending,state:'failed',error:{code:'material_storage_unavailable',message:'素材未能存入我的库，请重试'}};
  };
  const view=await mount(h(LiveMaterialSearch,{types:['image']}));
  try{
    await click(button(view.host,'存到我的库'));await act(flush);
    const card=view.host.querySelector('[data-live-material]');assert.match(card.textContent,/素材未能存入我的库/);
    await click(card.querySelector('button'));assert.equal(posts,2);assert.match(card.textContent,/已存到我的库/);
  }finally{await view.close();}
}));

test('leaving the picker stops insertion while the acquisition remains server-owned',async()=>fastPoll(async()=>{
  reset();let complete;
  request=async(method,path)=> {
    if(path.startsWith('/v1/assets/search?'))return {items:[asset()]};
    if(path==='/v1/assets/use')return pending;
    return await new Promise(resolve=>{complete=resolve;});
  };
  const inserted=[];const view=await mount(h(LiveMaterialSearch,{types:['image'],onUse:item=>inserted.push(item)}));
  await click(button(view.host,'存到我的库'));await act(flush);await view.close();
  await act(async()=>{complete({...pending,state:'done',item:projection()});await flush();});
  assert.equal(inserted.length,0);
}));

test('saving progress is translated in every interface locale',()=>{
  for(const locale of LOCALES)assert.ok(LIVE_MATERIAL_MESSAGES[locale]['正在存入我的库…'],locale);
});

test('background failure reasons are translated for all locales and shown on the affected card',async()=>fastPoll(async()=>{
  for(const locale of LOCALES)for(const key of ['保存已中断，请重试','库空间不足，请清理后重试','存储服务暂不可用，请重试','素材来源暂不可用，请重试'])assert.ok(LIVE_MATERIAL_MESSAGES[locale][key],`${locale}: ${key}`);
  reset();request=async(method,path)=>path.startsWith('/v1/assets/search?')?{items:[asset()]}:path==='/v1/assets/use'?pending:{...pending,state:'failed',error:{code:'storage-quota-exceeded',message:'库空间不足，请清理后重试'}};
  const view=await mount(h(LiveMaterialSearch,{types:['image']}));
  try {await click(button(view.host,'存到我的库'));await act(flush);assert.match(view.host.querySelector('[data-live-material]').textContent,/库空间不足/);}
  finally {await view.close();}
}));
