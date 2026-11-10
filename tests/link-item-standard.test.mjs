import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
const require = createRequire(import.meta.url);
const fr = createRequire(require.resolve('fabric/node'));
const canvas = fr.resolve('canvas');
const old = require.cache[canvas];
require.cache[canvas] = { id: canvas, filename: canvas, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fr.resolve('jsdom')).href);
if (old) require.cache[canvas] = old; else delete require.cache[canvas];
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'https://test.invalid' });
for (const name of ['window','document','navigator','HTMLElement','Element','Node','Event','CustomEvent','MouseEvent','KeyboardEvent','getComputedStyle']) Object.defineProperty(globalThis,name,{ configurable:true,writable:true,value:dom.window[name] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom 20 has no scrollTo or CSS @starting-style support; keep real modal focus/portal behavior.
dom.window.scrollTo = () => {};
const motionStyle = document.createElement('style'); motionStyle.id='leo-overlay-motion'; document.head.append(motionStyle);
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
const { createRoot } = await import('react-dom/client');
const ui = dataModule('export function useUI(){return x=>x;}');
globalThis.__linkCalls = [];
globalThis.__libraryWorks = [{id:"link-1",source_type:"link",title:"Dashboard",updated_at:"2026-11-10T08:00:00Z",link_work:{id:"link-1",links:[{label:"Link",url:"https://example.com/"}],note:"counts"}}];
globalThis.__embeddable = true;
const api = dataModule(`export class WorksApiError extends Error {} export const worksApi = {update:async(id,body)=>{globalThis.__linkCalls.push(['update',id,body]);return {id};},createLink:async(body)=>{globalThis.__linkCalls.push(['create',body]);return {id:'created'};},remove:async(id)=>{globalThis.__linkCalls.push(['delete',id]);}}; export async function embedCheck(){return {embeddable:globalThis.__embeddable};}`);
const overrides = {'../../i18n/ui/useUI':ui,'../../lib/works-api':api};
const { LinkWorkActions, LinkWorkViewer } = await import(await compileModule('src/shell/works/LinkWorkViewer.tsx',overrides));
const { LinkWorkDialog } = await import(await compileModule('src/shell/works/LinkWorkDialog.tsx',overrides));
const { linkWorkLibraryItem, normalizeLinkWork } = await import('../src/shell/works/link-work-item.ts');
const work = normalizeLinkWork({id:'link-1',title:'Dashboard',note:'Site counts',created_at:'2026-11-10T08:00:00Z',links:[{label:'Old first',url:'https://example.com/'},{label:'Old second',url:'https://example.org/'}]});
const item = linkWorkLibraryItem(work);
const reactUrl = pathToFileURL(require.resolve('react')).href;
const viewerUrl = await compileModule('src/shell/works/LinkWorkViewer.tsx',overrides);
const detailUrl = await compileModule('src/shell/asset-detail/AssetDetail.tsx',{
 '../workspace-library-view':dataModule(`import React from ${JSON.stringify(reactUrl)}; import {LinkWorkViewer} from ${JSON.stringify(viewerUrl)}; export function WorkspaceLibraryEntryViewer({entry}){return React.createElement(LinkWorkViewer,{item:entry.libraryItem});}`),
 '../../i18n/ui/useUI':ui,
 'next-intl':dataModule(`export function useLocale(){return 'en';}`),
});
const { AssetDetail } = await import(detailUrl);
const { WorkspaceThumbnail } = await import(await compileModule('src/shell/workspace-library-thumbnail.tsx',{
 '../i18n/ui/useUI':ui,
 '../lib/auth/client':dataModule('export async function accessToken(){return null;}'),
 '../lib/database':dataModule('export async function ensureDatabaseThumbnail(){return null;}'),
 './ArtifactRendition':dataModule('export function useArtifactRendition(){return {url:"",status:"idle"};}'),
}));
globalThis.fetch = async () => new Response('',{status:404});
async function mount(element, run){
 const errors=[];const prior=console.error;console.error=(...args)=>errors.push(args.join(' '));
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(element));await run(host);assert.deepEqual(errors,[]);}finally{await act(async()=>root.unmount());host.remove();console.error=prior;}
}
async function click(text, scope=document.body){const button=[...scope.querySelectorAll('button')].find(x=>x.textContent===text);assert.ok(button,`button ${text}`);await act(async()=>button.click());}
test('link card shows host cover without unavailable-cover errors',async()=>{
 await mount(React.createElement(WorkspaceThumbnail,{item,alt:item.title,kind:'website',accent:'#333',imageClassName:''}),async host=>{assert.match(host.textContent,/example.com/);assert.doesNotMatch(host.textContent,/封面不可用|没有可用 URL/);assert.ok(host.querySelector('[data-link-cover]'));});
});
test('standard detail has one title, edit dialog, one saved link and real row date',async()=>{
 await mount(React.createElement(AssetDetail,{entry:{id:item.key,title:item.title,libraryItem:item},onBack(){},actions:React.createElement(LinkWorkActions,{item})}),async host=>{
 assert.equal(host.querySelectorAll('header').length,1);assert.equal([...host.querySelectorAll('h3')].filter(x=>x.textContent==='Dashboard').length,1);
 assert.doesNotMatch(host.textContent,/Editing is unavailable|1970/);assert.match(host.querySelector('time').dateTime,/2026-11-10/);
 await click('编辑');const dialog=document.querySelector('[role=dialog]');assert.ok(dialog);assert.deepEqual([...dialog.querySelectorAll('label span')].map(x=>x.textContent),['名称','链接','介绍']);
 assert.equal(dialog.querySelectorAll('input').length,2);await act(async()=>dialog.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 assert.deepEqual(globalThis.__linkCalls.at(-1),['update','link-1',{title:'Dashboard',note:'Site counts',links:[{label:'链接',url:'https://example.com/'}]}]);
 });
});
test('delete requires shared confirmation and cancel keeps item',async()=>{
 await mount(React.createElement(LinkWorkActions,{item}),async()=>{const before=globalThis.__linkCalls.length;await click('删除');assert.match(document.querySelector('[role=dialog]').textContent,/确认删除/);await click('取消');assert.equal(globalThis.__linkCalls.length,before);await click('删除');await click('删除',document.querySelector('[role=dialog]'));assert.deepEqual(globalThis.__linkCalls.at(-1),['delete','link-1']);});
});
test('embed denial renders fallback; allowed frame stays isolated',async()=>{
 globalThis.__embeddable=false;await mount(React.createElement(LinkWorkViewer,{item}),async host=>{assert.match(host.textContent,/暂时无法预览/);assert.equal(host.querySelector('iframe'),null);assert.equal(host.querySelector('a').target,'_blank');});
 globalThis.__embeddable=true;await mount(React.createElement(LinkWorkViewer,{item}),async host=>{const frame=host.querySelector('iframe');assert.ok(frame);assert.equal(frame.getAttribute('referrerpolicy'),'no-referrer');assert.doesNotMatch(frame.getAttribute('sandbox'),/allow-same-origin/);assert.equal(host.querySelector('header'),null);});
});
test('missing row date stays absent rather than epoch',()=>{assert.equal(normalizeLinkWork({...work,created_at:undefined,updated_at:undefined}).updated_at,'');});
const libraryOverrides = {
 '../i18n/ui/useUI':ui,
 '../lib/works-api':api,
 './AgentChat':dataModule('export function AgentChat(){return null;}'),
 './library-standalone-editor-host':dataModule('export function MaterialStandaloneEditor(){return null;}'),
 './library-edit-intent':dataModule('export function useLibraryEditIntent(){return null;}'),
 '../lib/auth/client':dataModule('export const AUTH_STATE_EVENT="test-auth"; export function getUserIdSnapshot(){return {available:true,userId:"test-user"};} export async function accessToken(){return null;}'),
 './artifact-client':dataModule(`export * from ${JSON.stringify(pathToFileURL(require.resolve('../src/shell/artifact-client.ts')).href)}; export const ARTIFACT_LIBRARY_CHANGE_EVENT='oceanleo:artifact-library-change'; export async function listMyArtifacts(){return {ok:true,data:{items:[],serverWorks:globalThis.__libraryWorks,nextCursor:null,ownerPrincipalId:"test-user"}};} export async function listFavoriteArtifacts(){return {ok:true,data:{items:[],nextCursor:null,ownerPrincipalId:"test-user"}};}`),
};
const { MyLibrary } = await import(await compileModule('src/shell/MyLibrary.tsx',libraryOverrides));
const { WorkspaceLibrary } = await import(await compileModule('src/shell/WorkspaceLibrary.tsx',libraryOverrides));
test('real MyLibrary Upload opens the same three-field dialog',async()=>{
 await mount(React.createElement(MyLibrary,{siteId:'website',pageTitle:'My Library'}),async host=>{
 assert.match(host.textContent,/Dashboard/);
 const upload=host.querySelector('[data-library-upload-menu] button');assert.ok(upload);await act(async()=>upload.click());await click('添加链接');
 const dialog=document.querySelector('[role=dialog]');assert.ok(dialog);assert.deepEqual([...dialog.querySelectorAll('label span')].map(x=>x.textContent),['名称','链接','介绍']);
 const fields=dialog.querySelectorAll('input');
 await act(async()=>{ for (const [field,value] of [[fields[0],'New panel'],[fields[1],'https://example.net/']]) { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true})); } });
 await act(async()=>dialog.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 assert.deepEqual(globalThis.__linkCalls.at(-1),['create',{title:'New panel',note:'',links:[{label:'链接',url:'https://example.net/'}]}]);
 });
});

test('real WorkspaceLibrary link detail keeps standard actions and no unavailable editor',async()=>{
 await mount(React.createElement(WorkspaceLibrary,{entries:[{id:item.key,title:item.title,libraryItem:item,kind:'website'}],openEntryId:item.key,siteId:'website'}),async host=>{
 assert.equal(host.querySelectorAll('[data-asset-detail] header').length,1);
 assert.equal([...host.querySelectorAll('h3')].filter(x=>x.textContent==='Dashboard').length,1);
 assert.doesNotMatch(host.textContent,/Editing is unavailable|1970/);
 assert.equal([...host.querySelectorAll('button')].filter(x=>x.textContent==='编辑').length,1);
 await click('编辑');assert.ok(document.querySelector('[role=dialog] input'));
 });
});

test('direct link work hydration retains API row timestamp',async()=>{
 const {loadLinkWorkItem}=await import(await compileModule('src/shell/library-project-membership.ts',libraryOverrides));
 const previous=globalThis.fetch;
 globalThis.fetch=async ()=>new Response(JSON.stringify({work:{id:'link-1',title:'Dashboard',updated_at:'2026-11-10T08:00:00Z',links:work.links,note:'counts'}}));
 try{const result=await loadLinkWorkItem('link-1');assert.equal(result.createdAt,'2026-11-10T08:00:00Z');}finally{globalThis.fetch=previous;}
});
