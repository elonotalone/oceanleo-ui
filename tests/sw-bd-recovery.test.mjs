import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import React, { act } from 'react';
import './helpers/w1-jsdom-window.mjs';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
import { createRoot } from 'react-dom/client';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const ui = dataModule('export const useUI=()=>key=>key;');
const stubs = { '../../../i18n/ui/useUI': ui };
const { useBayAutoRetry, bayFailureKind } = await import(await compileModule('src/shell/bay/shell/use-bay-auto-retry.ts', stubs));
const { BayRecovery } = await import(await compileModule('src/shell/bay/shell/BayRecovery.tsx', stubs));
function host() { const el=document.createElement('div');document.body.append(el);return {el,root:createRoot(el)}; }
const flush=async()=>{await act(async()=>{await Promise.resolve();await Promise.resolve();});};

test('Bay controls scan rejects manual retry labels in every Bay TSX source', () => {
  const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(join(dir,entry.name)):[join(dir,entry.name)]);
  const files=walk('src/shell/bay').filter(file=>/\.tsx?$/.test(file));
  if(process.env.SW_BD_SCAN_PROBE) files.push('<deliberate-retry-fixture>');
  const failures=[];
  for(const file of files){
    const text=file.startsWith('<')?'<button>{tt("重试")}</button>':readFileSync(file,'utf8');
    const source=ts.createSourceFile(file,text,99,true,ts.ScriptKind.TSX);
    const scan=node=>{
      if(ts.isJsxElement(node)&&/^(button|a)$/.test(node.openingElement.tagName.getText(source))){
        for(const child of node.children){
          const labels=n=>{ if((ts.isStringLiteral(n)||ts.isJsxText(n))&&/^(重试|重新加载|再试一次|Retry|Reload|Try again)$/i.test(n.text.trim()))failures.push(file);ts.forEachChild(n,labels); };
          labels(child);
        }
      }
      ts.forEachChild(node,scan);
    };scan(source);
  }
  assert.deepEqual(failures,[]);
});

test('hook backs off, pauses hidden/offline, wakes once, and cleans up', async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  let visible=true,online=true,calls=0;
  Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>visible?'visible':'hidden'});
  Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>online});
  function Probe({enabled=true}){useBayAutoRetry(enabled,()=>{calls++;});return null;}
  const {root,el}=host();
  await act(async()=>root.render(React.createElement(Probe)));
  await act(async()=>t.mock.timers.tick(999));assert.equal(calls,0);
  await act(async()=>t.mock.timers.tick(1));assert.equal(calls,1);
  await act(async()=>t.mock.timers.tick(1999));assert.equal(calls,1);
  await act(async()=>t.mock.timers.tick(1));assert.equal(calls,2);
  visible=false;
  await act(async()=>document.dispatchEvent(new window.Event('visibilitychange')));
  await act(async()=>t.mock.timers.tick(60_000));assert.equal(calls,2);
  visible=true;online=false;
  await act(async()=>window.dispatchEvent(new window.Event('focus')));assert.equal(calls,2);
  online=true;
  await act(async()=>window.dispatchEvent(new window.Event('online')));assert.equal(calls,3);
  await act(async()=>root.render(React.createElement(Probe,{enabled:false})));
  await act(async()=>t.mock.timers.tick(60_000));assert.equal(calls,3);
  await act(async()=>root.unmount());
  await act(async()=>window.dispatchEvent(new window.Event('focus')));assert.equal(calls,3);
  el.remove();t.mock.timers.reset();
});

test('temporary failures keep loading; missing/no access are sentences without actions',async()=>{
  assert.equal(bayFailureKind({status:503}),'temporary');
  assert.equal(bayFailureKind({kind:'not-found'}),'missing');
  assert.equal(bayFailureKind({kind:'no-access'}),'denied');
  for(const [error,kind] of [[{status:503},'temporary'],[{status:404},'missing'],[{status:403},'denied']]){
    const {root,el}=host();await act(async()=>root.render(React.createElement(BayRecovery,{error,scope:'states',reload:()=>{}})));
    assert.equal(el.querySelector('[data-bay-recovery]').dataset.bayRecovery,kind);
    assert.equal(el.querySelectorAll('button').length,0);
    assert.equal(el.querySelector('[aria-busy]').getAttribute('aria-busy'),String(kind==='temporary'));
    await act(async()=>root.unmount());el.remove();
  }
});

const taxonomy = { shelves:[{id:'deck',labels:{zh:'演示',en:'Presentations'},artifactTypes:['deck'],categories:[{id:'business',labels:{zh:'商业计划',en:'Business planning'},contentTypes:[]}]}],tagVocabularies:{} };
const materialStub=dataModule(`export const fetchMaterialTaxonomy=async()=>globalThis.__bdTaxonomy; export const fetchMaterialShelf=async()=>({items:[],categoryCounts:{business:1},categoryCovers:{},categoryFacets:{},contentTypePreviews:{},nextOfficial:null,nextSeller:null,unavailable:false});`);
const catalogStubs={...stubs,'next-intl':dataModule('export const useLocale=()=>"en";'),'./material-shelf-client':materialStub,
 '../../site-icons':dataModule('export const siteIconFor=()=>null;'),
 '../asset/BayAssetCard':dataModule('export const BayAssetCard=()=>null;'),
 '../../collection-chrome':dataModule('import React from "react"; export const COLLECTION_ACTION_BTN_GHOST=""; export const CollectionCardGrid=({children})=>React.createElement("div",null,children); export const CollectionInfiniteSentinel=()=>null;'),
 '../../collection-items':dataModule('export const CollectionItemList=()=>null;'),
 './BayFilterSelect':dataModule('export const BayFilterSelect=()=>null;')};
// data modules cannot resolve bare React: use simple element-free stubs.
catalogStubs['../../collection-chrome']=dataModule('export const COLLECTION_ACTION_BTN_GHOST=""; export const CollectionCardGrid=()=>null; export const CollectionInfiniteSentinel=()=>null;');
const {ReadyMaterialCatalog}=await import(await compileModule('src/shell/bay/shell/ReadyMaterialCatalog.tsx',catalogStubs));
test('category parent/current names share a bold row and back keeps shelf',async()=>{
  globalThis.__bdTaxonomy=taxonomy;
  window.history.replaceState({},'', '/bay?type=deck&cat=business');
  const {root,el}=host();
  await act(async()=>root.render(React.createElement(ReadyMaterialCatalog,{siteKey:'oceanleo',query:'',view:'grid',sellers:false,online:false,onOnlineChange:()=>{},onOpen:()=>{},children:null})));
  await flush();
  const row=el.querySelector('[data-bay-category-title]');assert.ok(row);
  assert.match(row.className,/flex/);assert.match(row.className,/justify-between/);
  assert.match(row.querySelector('a').className,/text-lg font-semibold/);
  assert.equal(row.querySelector('a').textContent,'‹ Presentations');
  assert.equal(row.querySelector('h2').textContent,'Business planning');
  await act(async()=>row.querySelector('a').dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true})));
  assert.equal(new URLSearchParams(window.location.search).get('type'),'deck');
  assert.equal(new URLSearchParams(window.location.search).has('cat'),false);
  await act(async()=>root.unmount());el.remove();
});

const httpStub=dataModule(`export class BayApiError extends Error {constructor(status,code){super(code);this.status=status;this.code=code;}}`);
const followingStubs={...stubs,
 '../../../lib/bay/http':httpStub,
 '../../../lib/bay/following':dataModule('export async function getBayFollowing(cursor,signal){return globalThis.__bdFollowing(cursor,signal);}'),
 '../shell/bay-state':dataModule('export const useBaySignedIn=()=>globalThis.__bdSignedIn;export const requireBayLogin=()=>true;'),
 './BayFollowButton':dataModule('export const BayFollowButton=()=>null;')};
const {BayFollowing}=await import(await compileModule('src/shell/bay/following/BayFollowing.tsx',followingStubs));
const {BayApiError}=await import(httpStub);
test('Following renders empty/find people, cards, unavailable, and loading recovery states',async()=>{
  globalThis.__bdSignedIn=true;
  for(const state of ['empty','cards','unavailable','temporary']){
    globalThis.__bdFollowing=async()=>{
      if(state==='unavailable')throw new BayApiError(404,'not_found');
      if(state==='temporary')throw new Error('network');
      return {items:state==='cards'?[{kind:'asset',id:'a1',title:'A real post',cover_url:'https://assets.invalid/cover.webp',author:{user_id:'u1',username:'mira',name:'Mira',following:true},created_at:'2026-11-20T00:00:00Z',href:'/bay?asset=a1'}]:[],next_cursor:null};
    };
    const {root,el}=host();await act(async()=>root.render(React.createElement(BayFollowing)));await flush();
    if(state==='empty'){assert.match(el.textContent,/你还没有关注任何人/);assert.equal(el.querySelector('a').getAttribute('href'),'/leochat?find=1');}
    if(state==='cards'){assert.match(el.textContent,/A real post/);assert.match(el.textContent,/Mira @mira/);assert.ok(el.querySelector('time'));assert.ok(el.querySelector('img'));}
    if(state==='unavailable')assert.match(el.textContent,/关注动态暂不可用/);
    if(state==='temporary'){assert.ok(el.querySelector('[aria-busy="true"]'));assert.doesNotMatch(el.textContent,/你还没有关注/);}
    await act(async()=>root.unmount());el.remove();
  }
});

const followHttp=dataModule(`export async function getBayFollowPerson(userId){return {user_id:userId,following:false,blocked:false};} export async function setBayFollowing(userId,following){globalThis.__bdFollowCalls.push({userId,following});if(globalThis.__bdFollowFail)throw new Error('offline');return {following};}`);
const followButtonStubs={...stubs,'../../../lib/auth/client':dataModule('export const getUserId=async()=>"viewer";'),
 '../../../lib/bay/following':followHttp,'../shell/bay-state':dataModule('export const useBaySignedIn=()=>true;export const requireBayLogin=()=>true;')};
const {BayFollowButton}=await import(await compileModule('src/shell/bay/following/BayFollowButton.tsx',followButtonStubs));
test('follow toggles server state; failure preserves state and reason; own profile hides it',async()=>{
  globalThis.__bdFollowCalls=[];globalThis.__bdFollowFail=false;
  const {root,el}=host();await act(async()=>root.render(React.createElement(BayFollowButton,{userId:'other',username:'mira'})));await flush();
  assert.equal(el.querySelector('button').disabled,false);
  await act(async()=>el.querySelector('button').click());assert.equal(el.querySelector('button').getAttribute('aria-pressed'),'true');
  globalThis.__bdFollowFail=true;
  await act(async()=>el.querySelector('button').click());assert.equal(el.querySelector('button').getAttribute('aria-pressed'),'true');assert.match(el.textContent,/关注操作未完成/);
  globalThis.__bdFollowFail=false;
  await act(async()=>el.querySelector('button').click());assert.equal(el.querySelector('button').getAttribute('aria-pressed'),'false');
  assert.deepEqual(globalThis.__bdFollowCalls.map(call=>call.following),[true,false,false]);
  await act(async()=>root.render(React.createElement(BayFollowButton,{userId:'viewer',username:'me'})));await flush();assert.equal(el.querySelector('button'),null);
  await act(async()=>root.unmount());el.remove();
});

const {AppEmbedFrame}=await import(await compileModule('src/shell/bay/apps/AppEmbedFrame.tsx',stubs));
test('embedded site remounts itself after timeout and still accepts a late load',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const {root,el}=host();await act(async()=>root.render(React.createElement(AppEmbedFrame,{src:'https://works.invalid',host:'works.invalid',title:'A work',onOpenExternal:()=>{}})));
  const first=el.querySelector('iframe');
  await act(async()=>t.mock.timers.tick(10_000));assert.ok(el.querySelector('[role="status"]'));assert.equal(el.querySelector('iframe'),first);
  await act(async()=>t.mock.timers.tick(1000));assert.notEqual(el.querySelector('iframe'),first);
  await act(async()=>el.querySelector('iframe').dispatchEvent(new window.Event('load')));assert.equal(el.querySelector('[role="status"]'),null);
  assert.doesNotMatch(el.textContent,/重试|重新加载|再试一次/);
  await act(async()=>root.unmount());el.remove();t.mock.timers.reset();
});

test('Following pagination appends posts and signed out state is explicit',async()=>{
  globalThis.__bdSignedIn=true; // This feed stub stays signed in; network requests remain stubbed.
  const calls=[];
  const row=id=>({kind:'asset',id,title:`Post ${id}`,cover_url:null,author:{user_id:'u1',username:'mira',name:'Mira',following:true},created_at:'2026-11-20T00:00:00Z',href:`/bay?asset=${id}`});
  globalThis.__bdFollowingRequests=async cursor=>{calls.push(cursor);return {items:[row(cursor?'2':'1')],next_cursor:cursor?null:'page-2'};};
  const paged={...followingStubs,'../../../lib/bay/following':dataModule('export const getBayFollowing=(cursor)=>globalThis.__bdFollowingRequests(cursor);'),
    '../shell/bay-state':dataModule('export const useBaySignedIn=()=>globalThis.__bdSignedIn;export const requireBayLogin=()=>true;')};
  const {BayFollowing:Paged}=await import(await compileModule('src/shell/bay/following/BayFollowing.tsx',paged));
  const {root,el}=host();await act(async()=>root.render(React.createElement(Paged)));await flush();
  await act(async()=>el.querySelector('button').click());await flush();assert.deepEqual(calls,[null,'page-2']);assert.equal(el.querySelectorAll('li').length,2);
  await act(async()=>root.unmount());el.remove();
  globalThis.__bdSignedIn=false;
  const signedOut=host();await act(async()=>signedOut.root.render(React.createElement(Paged)));assert.match(signedOut.el.textContent,/登录后查看关注动态/);
  await act(async()=>signedOut.root.unmount());signedOut.el.remove();
});

const detailStubs={...stubs,'../../asset-detail/AssetDetail':dataModule('export const AssetDetail=()=>null;'),
 '../../asset-detail/BayAssetActions':dataModule('export const BayAssetActions=()=>null;'),
 '../../asset-detail/resolve':dataModule('export const resolveAssetDetail=()=>globalThis.__bdResolve();'),
 '../../library-edit-landing':dataModule('export const libraryStandaloneEditorBinding=()=>({});'),
 '../../../lib/lazy-with-retry':dataModule('export const importWithChunkReload=fn=>fn();')};
const {BayArtifactDeepLink}=await import(await compileModule('src/shell/bay/asset/BayArtifactDeepLink.tsx',detailStubs));
test('deep link recovers temporary resolve failures and preserves permanent failures with Back to list',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  let calls=0;
  const resolver=async()=>{calls++;if(calls===1)throw {status:503};return {entry:{},actionContext:{}};};
  const {root,el}=host();await act(async()=>root.render(React.createElement(BayArtifactDeepLink,{target:{kind:'template',id:'real'},resolve:resolver,onBack:()=>{}})));await flush();
  assert.equal(el.querySelector('[data-bay-artifact-link]').dataset.bayArtifactLink,'loading');
  await act(async()=>t.mock.timers.tick(1000));await flush();assert.equal(calls,2);assert.equal(el.querySelector('[data-bay-artifact-link]').dataset.bayArtifactLink,'ready');
  for(const [status,text] of [[404,'这项内容不存在或已下架。'],[403,'你没有权限查看这项内容。']]){
    const resolve=async()=>{throw {status};};
    await act(async()=>root.render(React.createElement(BayArtifactDeepLink,{target:{kind:'template',id:String(status)},resolve,onBack:()=>{}})));await flush();
    assert.match(el.textContent,new RegExp(text));assert.equal(el.querySelectorAll('button').length,1);assert.equal(el.querySelector('button').textContent,'返回列表');
  }
  await act(async()=>root.unmount());el.remove();t.mock.timers.reset();
});

test('BD copy has every key in all 17 neighbouring locales',async()=>{
  const {swBdCopy}=await import('../src/i18n/ui/messages/sw-bd-copy.ts');
  const {LOCALES}=await import('../src/i18n/config.ts');
  const keys=Object.keys(swBdCopy('en'));
  for(const locale of LOCALES){const copy=swBdCopy(locale);assert.deepEqual(Object.keys(copy),keys);for(const value of Object.values(copy))assert.ok(value?.trim());}
  assert.equal(swBdCopy('en')['关注动态'],'Following');assert.equal(swBdCopy('zh')['关注动态'],'关注动态');
});

test('Following client uses the contracted feed/search/follow endpoints and encodes identifiers',async()=>{
  globalThis.__bdApiCalls=[];
  const http=dataModule(`const call=async(method,path,body)=>{globalThis.__bdApiCalls.push({method,path,body});return {people:[{user_id:'u/1',following:true}]};};export const bayGet=(p)=>call('GET',p);export const bayPost=(p,b)=>call('POST',p,b);export const bayDelete=(p)=>call('DELETE',p);`);
  const api=await import(await compileModule('src/lib/bay/following.ts',{'./http':http}));
  await api.getBayFollowing('next cursor');
  assert.equal((await api.getBayFollowPerson('u/1','mira')).following,true);
  await api.setBayFollowing('u/1',true);await api.setBayFollowing('u/1',false);
  const [feed,search,follow,unfollow]=globalThis.__bdApiCalls;
  assert.equal(feed.path,'/v1/bay/following?limit=20&cursor=next+cursor');
  assert.equal(search.path,'/v1/im/users/search?q=mira&limit=20');
  assert.deepEqual(follow,{method:'POST',path:'/v1/im/follows',body:{user_id:'u/1'}});
  assert.equal(unfollow.method,'DELETE');assert.equal(unfollow.path,'/v1/im/follows/u%2F1');
});
