import './helpers/w1-jsdom-window.mjs';
import assert from 'node:assert/strict';
import test, {beforeEach, afterEach} from 'node:test';
import React, {act} from 'react';
const {createRoot} = await import('react-dom/client');
import {compileModule, dataModule} from './helpers/module-bench.mjs';
import {createNoticeStore} from '../src/shell/messages/notices/notice-store.ts';
import {leoChatUnread} from '../src/shell/messages/notices/notice-unread.ts';
import {swNuCopy} from '../src/i18n/ui/messages/sw-nu-copy.ts';
import {LOCALES} from '../src/i18n/config.ts';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.Event = window.Event;
const state = globalThis.__nu = {};
const ui = dataModule('export function useUI(){return (s,v)=>s.replace(/\\{(\\w+)\\}/g,(_,k)=>v?.[k]??k)}');
const api = dataModule(`
 export async function listNotifications(limit, section){
   const s=globalThis.__nu;s.calls.push(['list',limit,section]);
   return s.failList?{ok:false}:{ok:true,data:{items:s.items.filter(i=>!section||i.section===section),unread_count:s.items.filter(i=>!i.read_at).length}};
 }
 export async function markNotificationsRead(ids,section){
   const s=globalThis.__nu;s.calls.push(['read',ids,section]);
   s.items=s.items.map(i=>(!section||i.section===section)&&(!ids||ids.includes(i.id))?{...i,read_at:'2026-11-20T00:00:00Z'}:i);
   for(const group of s.sections)group.unread=s.items.filter(i=>i.section===group.key&&!i.read_at).length;
   return {ok:true,data:{updated:1,unread_count:s.items.filter(i=>!i.read_at).length}};
 }
 export async function listNotificationSections(){return globalThis.__nu.sectionResult??{ok:true,data:{sections:globalThis.__nu.sections}};}
 export async function officialNotificationPermission(){return {ok:true,data:{can_send:globalThis.__nu.canSend}};}
 export async function sendOfficialNotification(value){globalThis.__nu.sent.push(value);return {ok:!globalThis.__nu.sendFails};}
 export async function notificationBadges(){return {ok:true,data:{sections:globalThis.__nu.badges}};}
`);
const stubs = {
 '../../../api/notifications': api,
 '../../../i18n/ui/useUI': ui, '../../i18n/ui/useUI': ui,
 '../../lib/im/client': dataModule('export function useImEnabled(){return globalThis.__nu.enabled;}'),
 '../realtime/hooks': dataModule('export function useImUnread(){return {total:88,requests:2}}'),
 '../bay/shell/bay-state': dataModule('export function useBayEnabled(){return false} export function attachBayDeepLinks(){}'),
 '../messages/messages-surface': dataModule('export const LEOCHAT_ICON_BUTTON=""; export function ImCloseIcon(){return null;} export function ImPlusIcon(){return null;} export function ImSearchIcon(){return null;} export function ImMoreIcon(){return null;} export function ensureMessagesSurfaceStyles(){}'),
 '../messages/host-state': dataModule(`export function useMessagesHost(){return globalThis.__nu.host??{open:false,surface:'window'}} export function openMessages(target){globalThis.__nu.opened.push(target)}`),
 '../workspace-actions': dataModule('export function dispatchWorkspaceAction(){}'),
 '../cases/use-owner-cases': dataModule('export function useOwnerCases(){return {phase:"ready",cases:[]}}'),
 '../messages-surface': dataModule('export const LEOCHAT_ICON_BUTTON=""; export function ImCloseIcon(){return null;} export function ImPlusIcon(){return null;} export function ImSearchIcon(){return null;} export function ImMoreIcon(){return null;} export function ImBackIcon(){return null}'),
 './open-notice': dataModule(`export function noticeTargetOf(){return {kind:"none"}} export function browserNoticeActions(){return {}} export function runNoticeTarget(){} export function noticeActionable(){return false} export function openNoticeDetail(item,store){globalThis.__nu.detail=item;void store.markRead([item.id])}`),
};
const {NoticesView} = await import(await compileModule('src/shell/messages/notices/NoticesView.tsx', stubs));
const {NoticeDetailView} = await import(await compileModule('src/shell/messages/notices/NoticeDetailView.tsx', stubs));
const {LeoChatButton,LEOCHAT_PANEL_REQUEST_EVENT} = await import(await compileModule('src/shell/leochat/LeoChatButton.tsx', stubs));
const {LeoChatTabs} = await import(await compileModule('src/shell/leochat/LeoChatTabs.tsx', stubs));
const {SidebarSectionBadge} = await import(await compileModule('src/shell/badges/SidebarSectionBadge.tsx', stubs));
const {readBadgeSnapshot,badgeSectionForHref} = await import(await compileModule('src/shell/badges/section-badges.ts', {
 '../../lib/auth/client': dataModule('export async function accessToken(){return null}'),
 '../../lib/auth/config': dataModule('export function gatewayBase(){return ""}'),
}));
const stores = await import(await compileModule('src/shell/messages/notices/use-notices.ts', stubs));
let roots;
beforeEach(() => {
 roots=[];
 Object.assign(state,{enabled:true,host:null,canSend:false,sendFails:false,failList:false,sectionResult:null,opened:[],sent:[],calls:[],badges:{chat:7,notices:3},
   sections:[{key:'system',title:'System',builtin:true,unread:1},{key:'agent',title:'Agent',builtin:true,unread:0},{key:'official',title:'Official',builtin:true,unread:0},{key:'leobay',title:'LeoBay',builtin:true,unread:1},{key:'custom',title:'My alerts',builtin:false,unread:1}],
   items:['leobay','system','custom'].map((section,i)=>({id:'n'+i,section,kind:'agent.notice',title:section+' title',body:'body',read_at:null,link:'',meta:{},created_at:'2026-11-20T00:00:00Z'}))});
 stores.selectNoticeSection(undefined);
});
afterEach(async () => { for(const root of roots)await act(async()=>root.unmount());document.body.replaceChildren(); });
async function flush(){await act(async()=>{for(let i=0;i<12;i++)await Promise.resolve();});}
async function mount(Component,props={}){
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);roots.push(root);
 await act(async()=>root.render(React.createElement(Component,props)));await flush();
 return {host, async click(selector){const node=host.querySelector(selector);assert.ok(node,selector);await act(async()=>node.click());await flush();},async render(){await act(async()=>root.render(React.createElement(Component,props)));await flush();}};
}

test('independent badges read chat and notices from /v1/badges; bottom bell opens Notifications even on LeoChat',async()=>{
 const counts=readBadgeSnapshot({sections:state.badges});
 assert.equal(counts.total,7,'activity total excludes notifications');
 const nav=await mount(SidebarSectionBadge,{count:counts.sections[badgeSectionForHref('/leochat')]});
 const bottom=await mount(LeoChatButton);
 assert.equal(nav.host.textContent,'7');
 assert.equal(bottom.host.querySelector('[data-leochat-badge]').textContent,'3');
 assert.equal(bottom.host.querySelector('button').getAttribute('aria-label'),'通知：3 条未读');
 assert.match(bottom.host.querySelector('svg path').getAttribute('d'),/M18 8a6/);
 await bottom.click('button');assert.deepEqual(state.opened.at(-1),{view:'notices'});
 window.history.replaceState({},'', '/leochat');await bottom.click('button');assert.deepEqual(state.opened.at(-1),{view:'notices'});
 window.history.replaceState({},'', '/workspace');
 state.badges={chat:0,notices:9};await act(async()=>window.dispatchEvent(new Event('focus')));await flush();
 assert.equal(bottom.host.querySelector('[data-leochat-badge]').textContent,'9');
 assert.deepEqual(leoChatUnread({total:7,requests:2},3),{chat:7,notices:3,requests:2});
 const tabs=await mount(LeoChatTabs,{active:'inbox',onSelect(){},badges:{inbox:7}});
 assert.equal(tabs.host.querySelector('[data-segmented-badge]').textContent,'7');
 assert.match(tabs.host.textContent,/消息7/);
 let panelRequests=0;const receive=()=>panelRequests++;
 window.addEventListener(LEOCHAT_PANEL_REQUEST_EVENT,receive);
 try{state.host={open:true,surface:'panel'};await bottom.render();await bottom.click('button');assert.equal(panelRequests,0,'opening Notifications must keep an existing panel open');}
 finally{window.removeEventListener(LEOCHAT_PANEL_REQUEST_EVENT,receive);}

});

test('section tabs are ordered, show counts, request filtered lists and mark only the selected section read',async()=>{
 const view=await mount(NoticesView,{onBack(){}});
 assert.deepEqual([...view.host.querySelectorAll('[data-notice-section]')].map(n=>n.dataset.noticeSection),['leobay','agent','official','system','custom']);
 assert.equal(view.host.querySelector('[data-notice-section="leobay"] [data-notice-section-unread]').textContent,'1');
 assert.equal(view.host.querySelectorAll('[data-notice-row]').length,1);assert.match(view.host.textContent,/leobay title/);
 await view.click('[data-notice-section="system"]');
 assert.match(view.host.textContent,/system title/);assert.doesNotMatch(view.host.textContent,/leobay title/);
 assert.ok(state.calls.some(c=>c[0]==='list'&&c[2]==='system'));
 await view.click('[data-notices-read-all]');
 assert.ok(state.calls.some(c=>c[0]==='read'&&c[1]===undefined&&c[2]==='system'));
 assert.equal(state.items.find(i=>i.section==='leobay').read_at,null);
 await view.click('[data-notice-section="custom"]');assert.match(view.host.textContent,/My alerts/);
 await view.click('[data-notice-row]');assert.equal(state.detail.section,'custom');
 assert.equal(stores.activeNoticeSection(),'custom');
 const detail=await mount(NoticeDetailView,{noticeId:'n2',onBack(){}});assert.match(detail.host.textContent,/custom title/);
});

test('Official compose is hidden unless can-send is true; sends exact draft, keeps failed draft and only clears on success',async()=>{
 const view=await mount(NoticesView,{onBack(){}});await view.click('[data-notice-section="official"]');
 assert.equal(view.host.querySelector('[data-official-compose]'),null);
 state.canSend=true;await act(async()=>window.dispatchEvent(new Event('focus')));await flush();
 assert.ok(view.host.querySelector('[data-official-compose]'));
 const set=async(name,value)=>{const node=view.host.querySelector(`[name="${name}"]`);const prototype=name==='body'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;
   await act(async()=>{Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});};
 await set('title','News');await set('body','Actual announcement');await set('link','https://example.test/news');
 state.sendFails=true;await act(async()=>view.host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await flush();
 assert.match(view.host.querySelector('[role="alert"]').textContent,/草稿已保留/);assert.equal(view.host.querySelector('[name="title"]').value,'News');
 state.sendFails=false;await act(async()=>view.host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await flush();
 assert.deepEqual(state.sent.at(-1),{title:'News',body:'Actual announcement',link:'https://example.test/news'});
 assert.equal(view.host.querySelector('[name="title"]').value,'');assert.match(view.host.querySelector('[role="status"]').textContent,/通知已发布/);
});

test('missing sections endpoint shows the real flat list; endpoint recovers on focus',async()=>{
 state.sectionResult={ok:false,status:404};const view=await mount(NoticesView,{onBack(){}});
 assert.equal(view.host.querySelector('[data-notice-section]'),null);assert.equal(view.host.querySelectorAll('[data-notice-row]').length,3);
 state.sectionResult=null;await act(async()=>window.dispatchEvent(new Event('focus')));await flush();
 assert.equal(view.host.querySelectorAll('[data-notice-section]').length,5);
});

test('failed first load keeps loading; online recovery refreshes automatically without Retry',async()=>{
 state.failList=true;state.sectionResult={ok:false,status:503};stores.noticeStore().reset();
 const view=await mount(NoticesView,{onBack(){}});assert.ok(view.host.querySelector('[data-notices-loading]'));
 assert.doesNotMatch(view.host.textContent,/重试|通知暂时打不开/);
 state.failList=false;await act(async()=>window.dispatchEvent(new Event('online')));await flush();
 assert.equal(view.host.querySelectorAll('[data-notice-row]').length,3);
});

test('store retries with exponential backoff and stops after final release',async()=>{
 let fail=true;let calls=0;let next=0;const timers=new Map();
 const store=createNoticeStore({list:async()=>{calls++;return fail?{ok:false}:{ok:true,data:{items:[],unread_count:0}}},markRead:async()=>({ok:true}),now:()=>0,isHidden:()=>false,onVisible:()=>()=>{},
 setTimer(fn,ms){const id=++next;timers.set(id,{fn,ms});return id},clearTimer(id){timers.delete(id)}});
 const release=store.acquire();await Promise.resolve();await Promise.resolve();
 assert.equal([...timers.values()][0].ms,1000);
 for(const wait of [2000,4000]){const task=[...timers.values()][0];task.fn();await Promise.resolve();await Promise.resolve();assert.equal([...timers.values()][0].ms,wait);}
 fail=false;[...timers.values()][0].fn();await Promise.resolve();await Promise.resolve();assert.equal([...timers.values()][0].ms,60000);assert.equal(calls,4);
 release();assert.equal(timers.size,0);
});

test('NU copy covers every locale and keeps count substitution',()=>{
 const keys=Object.keys(swNuCopy('zh'));for(const locale of LOCALES){const copy=swNuCopy(locale);assert.deepEqual(Object.keys(copy),keys);for(const value of Object.values(copy))assert.ok(value?.trim());assert.match(copy[keys[0]],/\{n\}/);}
});

test('HTTP client encodes section filters, scopes read-all, checks permission and posts Official JSON',async()=>{
 const client=await import(await compileModule('src/api/notifications.ts',{
 '../lib/auth/client':dataModule('export async function accessToken(){return "test-only"}'),
 '../lib/auth/config':dataModule('export const GATEWAY_BASE="https://gateway.invalid"'),
 }));
 const previous=globalThis.fetch;const requests=[];
 globalThis.fetch=async(url,init)=>{requests.push({url,init});return {ok:true,status:200,json:async()=>({sections:[],can_send:false})}};
 try{
  await client.listNotifications(30,'custom & 1');await client.markNotificationsRead(undefined,'official');await client.listNotificationSections();await client.officialNotificationPermission();await client.sendOfficialNotification({title:'Title',body:'Text'});
  assert.match(requests[0].url,/limit=30&section=custom%20%26%201$/);
  assert.deepEqual(JSON.parse(requests[1].init.body),{section:'official'});
  assert.match(requests[2].url,/\/notifications\/sections$/);assert.match(requests[3].url,/\/official\/can-send$/);
  assert.equal(requests[4].init.method,'POST');assert.deepEqual(JSON.parse(requests[4].init.body),{title:'Title',body:'Text'});
  globalThis.fetch=async()=>({ok:false,status:404});assert.deepEqual(await client.listNotificationSections(),{ok:false,status:404});
 }finally{globalThis.fetch=previous;}
});
