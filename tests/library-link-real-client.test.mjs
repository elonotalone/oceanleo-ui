import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { compileModule, dataModule } from './helpers/module-bench.mjs';

const require = createRequire(import.meta.url);
const fr = createRequire(require.resolve('fabric/node'));
const canvas = fr.resolve('canvas');
const priorCanvas = require.cache[canvas];
require.cache[canvas] = { id: canvas, filename: canvas, loaded: true, exports: {} };
const { JSDOM, VirtualConsole } = await import(pathToFileURL(fr.resolve('jsdom')).href);
if (priorCanvas) require.cache[canvas] = priorCanvas; else delete require.cache[canvas];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => { if (error.type !== 'css parsing') throw error; });
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'https://example.test/library', virtualConsole });
for (const name of ['window','document','navigator','HTMLElement','Element','Node','Event','CustomEvent','MouseEvent','KeyboardEvent','getComputedStyle']) Object.defineProperty(globalThis,name,{ configurable:true,writable:true,value:dom.window[name] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
dom.window.scrollTo = () => {};
const motionStyle = document.createElement('style'); motionStyle.id='leo-overlay-motion'; document.head.append(motionStyle);
const { createRoot } = await import('react-dom/client');
const auth = dataModule(`export * from ${JSON.stringify(new URL('../src/lib/auth/client.ts',import.meta.url).href)};export const AUTH_STATE_EVENT='test-auth'; export async function accessToken(){return 'test-only-token';} export async function getUserIdSnapshot(){return {available:true,userId:'test-owner'};}`);
const ui = dataModule('const tt=value=>value; export function useUI(){return tt;}');
const overrides = {
 '../i18n/ui/useUI':ui,
 '../lib/auth/client':auth,
 './AgentChat':dataModule('export function AgentChat(){return null;}'),
 './library-standalone-editor-host':dataModule('export function MaterialStandaloneEditor(){return null;}'),
 './library-edit-intent':dataModule('export function useLibraryEditIntent(){return null;}'),
};
// Both imports use the same compiler context. The client, list, shelf, cards,
// standard AssetDetail, LinkWorkViewer and embedCheck are all real implementations.
const { listMyArtifacts } = await import(await compileModule('src/shell/artifact-client.ts',overrides));
const { MyLibrary } = await import(await compileModule('src/shell/MyLibrary.tsx',overrides));
const title = 'oceandino · 仪表盘 · 实时：注册 / 在线 / 消费';
const created = '2026-10-01T02:03:04Z';
const updated = '2026-11-10T08:00:00Z';
// Shapes emitted by backend/app/works/service.py::_wire (including creation time).
const link = {id:'link-1',source_type:'link',title,kind:'website',home:{type:'link'},preview:{available:false},links:[{label:'Live',url:'https://example.com/dashboard'}],status:'published',created_at:created,updated_at:updated,link_work:{id:'link-1',kind:'website',links:[{label:'Live',url:'https://example.com/dashboard'}],note:'counts',created_at:created}};
const server = {id:'server-1',source_type:'server',title:'Server website',kind:'website',home:{type:'server',computer_id:'cc1',computer_name:'Mac',path:'/srv/site'},preview:{available:false},links:[],status:'offline',updated_at:updated,server_work:{id:'server-1',computer_id:'cc1',computer_name:'Mac',path:'/srv/site'}};
const json = value => new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const page = (serverWorks=[]) => ({items:[],scope:'mine',ownerPrincipalId:'test-owner',serverWorks,nextCursor:null,total:0});
const pause = () => new Promise(resolve=>setTimeout(resolve,25));
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
async function network(run,{gate,rows=[server,link]}={}) {
 const oldFetch=globalThis.fetch; const calls=[];
 globalThis.fetch=async (url,init={})=>{
  const path=new URL(String(url),'https://example.test'); calls.push(path.pathname+path.search);
  if(path.pathname==='/v1/library/mine'){if(gate)await gate.promise;return json(page(rows));}
  if(path.pathname==='/v1/library/favorites')return json({...page(),scope:'favorites'});
  if(path.pathname==='/v1/library/project-memberships')return json({items:[]});
  if(path.pathname.includes('embed-check'))return json({embeddable:true,reason:'ok'});
  return json({items:[]});
 };
 try{await run(calls);}finally{globalThis.fetch=oldFetch;}
}
test('real listMyArtifacts keeps server and link wire rows without accepting malformed server works',async()=>network(async()=>{
 const result=await listMyArtifacts({limit:100});
 assert.equal(result.ok,true,result.error);
 assert.deepEqual(result.data.serverWorks.map(work=>work.id),['server-1','link-1']);
 assert.equal(result.data.serverWorks[0].server_work.path,'/srv/site');
 assert.equal(result.data.serverWorks[1].link_work.created_at,created);
},{rows:[server,link,{...server,id:'bad-server',home:{type:'server'},server_work:{id:'bad-server'}}]}));
test('real client retains all 48 links and each supported link marker',async()=>{
 const rows=Array.from({length:48},(_,i)=>({...link,id:`link-${i+1}`,link_work:{...link.link_work,id:`link-${i+1}`}}));
 await network(async()=>{
  const result=await listMyArtifacts({limit:100});
  assert.equal(result.data.serverWorks.length,48);
  assert.deepEqual(result.data.serverWorks.map(work=>work.id),rows.map(work=>work.id));
 },{rows});
 for(const marker of ['source_type','home','link_work']){
  const row={...link};
  for(const key of ['source_type','home','link_work'])if(key!==marker)delete row[key];
  await network(async()=>{
   const result=await listMyArtifacts({limit:100});
   assert.deepEqual(result.data.serverWorks.map(work=>work.id),['link-1'],marker);
   assert.equal(result.data.serverWorks[0].created_at,created);
  },{rows:[row]});
 }
});
for(const fullPage of [true,false]) test(`real MyLibrary ${fullPage?'page':'sidebar'} loads link in All and Website then opens standard detail`,async()=>{
 dom.window.localStorage.clear(); dom.window.sessionStorage.clear();
 const gate=deferred(); const errors=[]; const oldError=console.error;
 console.error=(...args)=>errors.push(args.map(String).join(' '));
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await network(async calls=>{
  await act(async()=>root.render(React.createElement(MyLibrary,{...(fullPage?{pageTitle:'My Library'}:{}),siteId:'website'})));
  assert.match(host.textContent,/正在加载/);
  await act(async()=>{gate.resolve();await pause();});
  assert.match(host.textContent,new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(host.textContent,/Server website/);
  if(fullPage){
   const type=host.querySelector('[data-collection-filter="type"]');assert.ok(type,'page type filter');
   await act(async()=>type.click());
   const website=[...document.querySelectorAll('[role="option"]')].find(option=>option.textContent==='网站');assert.ok(website,'page website option');
   await act(async()=>{website.click();await pause();});
  }else{
   const website=[...host.querySelectorAll('button')].find(button=>button.textContent==='网站');assert.ok(website,'sidebar website filter');
   await act(async()=>{website.click();await pause();});
  }
  assert.ok(host.textContent.includes(title),'link visible in Website');
  const card=[...host.querySelectorAll('[role="button"],button')].find(node=>node.textContent.includes(title)&&!node.querySelector('[role="button"],button'));
  assert.ok(card,'link card');await act(async()=>{card.click();await pause();});
  const detail=host.querySelector('[data-asset-detail]');assert.ok(detail,'standard Library detail');
  assert.ok(detail.querySelector('[data-link-work-id="link-1"]'),'real LinkWorkViewer');
  const heading=detail.querySelector('h3');assert.equal(heading.textContent,title);assert.equal(heading.title,title);
  assert.ok(heading.classList.contains('flex-1'));assert.ok(heading.classList.contains('min-w-0'));
  assert.equal(detail.querySelector('time').dateTime,new Date(created).toISOString());
  assert.ok([...detail.querySelectorAll('button')].some(button=>button.textContent==='编辑'));
  assert.ok(calls.some(path=>path.includes('embed-check')),'real viewer called embed check');
  await act(async()=>detail.querySelector('[aria-label="返回列表"]').click());
 },{gate});}finally{gate.resolve();await act(async()=>root.unmount());host.remove();console.error=oldError;}
 assert.deepEqual(errors,[],'no runtime console errors');
});
