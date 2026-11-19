import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
import { workSendPolicy, WORK_REPLY_NOTICE } from '../src/shell/messages/conversation/work-policy.ts';
import { swCsCopy } from '../src/i18n/ui/messages/sw-cs-copy.ts';
import { IM_WORK_CONVERSATION_MESSAGES } from '../src/i18n/ui/messages/im-work-conversation-copy.ts';
import { LOCALES } from '../src/i18n/config.ts';
const useUI = dataModule('export function useUI(){return (s)=>s}');
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const { WorkConversationHeader } = await import(await compileModule('src/shell/messages/conversation/WorkConversationHeader.tsx', {
  '../../../i18n/ui/useUI': useUI,
  '../../../lib/im/people-api': dataModule('export async function blockUser(id){globalThis.__iwActs.push(["block",id])}; export async function sendContactRequest(id){globalThis.__iwActs.push(["friend",id])}'),
  '../people/ProfileCard': dataModule('export function ProfileCard(){return "profile-open"}'),
  '../report/ReportDialog': dataModule('export function ReportDialog(){return "report-open"}'),
}));
const { InboxRow } = await import(await compileModule('src/shell/messages/InboxRow.tsx', { '../../i18n/ui/useUI': useUI }));
const { Composer } = await import(await compileModule('src/shell/messages/composer/Composer.tsx', {
  '../../../i18n/ui/useUI': useUI,
  '../../../lib/im/messages-api': dataModule('export const messagesApi={}'),
  '../../replay/work/ReplayPickerDialog': dataModule('export function ReplayPickerDialog(){return null}'),
  '../leo/LeoComposerAddon': dataModule('export function LeoComposerAddon(){return null}'),
  '../realtime/hooks': dataModule('export function sendTyping(){}'),
  './ArtifactPickerDialog': dataModule('export function ArtifactPickerDialog(){return null}'),
}));
const { TalentComposer } = await import(await compileModule('src/shell/messages/talent/TalentComposer.tsx', { '../../../i18n/ui/useUI': useUI }));
const item = { id:'conversation', kind:'dm', title:'Seller', peer:{user_id:'seller',display_name:'Seller'}, work:{kind:'bay_listing',id:'listing',label:'Logo design'}, member_count:2, last_activity_at:'2026-11-18T12:00:00Z', unread_count:0, mention_count:0, last_message:null };
const policy = { awaiting_reply:true, text_only:true, remaining_messages:3 };

test('work header has a subject and profile/block/report controls; friends omit it',()=>{
  const html=render(WorkConversationHeader,{conversation:item});
  for(const text of ['Logo design','查看资料','拉黑','举报']) assert.ok(html.includes(text));
  assert.equal(render(WorkConversationHeader,{conversation:{...item,work:null}}),'');
});
test('inbox row shows subject alongside peer name',()=>{
  const html=render(InboxRow,{item,active:false,onOpen(){}});
  assert.match(html,/data-work-label/); assert.ok(html.includes('Logo design')&&html.includes('Seller'));
});
test('normal composer explains rule and disables attachments and voice until reply',()=>{
  const props={store:{},conversationId:item.id,conversation:{...item,members:[],send_policy:policy},viewerId:'me',layout:'full'};
  const before=render(Composer,props);
  assert.ok(before.includes(WORK_REPLY_NOTICE));
  assert.match(before,/<button[^>]*aria-label="发文件或作品"[^>]*disabled/);
  const after=render(Composer,{...props,workPolicy:{awaiting_reply:false,text_only:false,remaining_messages:null}});
  assert.ok(!after.includes('data-await-reply'));
  assert.doesNotMatch(after,/<button[^>]*aria-label="发文件或作品"[^>]*disabled/);
});
test('canonical Bay composer explains same server policy and removes it after reply',()=>{
  assert.ok(render(TalentComposer,{onSend:async()=>{},workPolicy:policy}).includes(WORK_REPLY_NOTICE));
  assert.ok(!render(TalentComposer,{onSend:async()=>{},workPolicy:{awaiting_reply:false,text_only:false,remaining_messages:null}}).includes('data-await-reply'));
});
test('only user messages count; reply unlocks immediately and pending sends reserve slots',()=>{
  const message=(sender_id,seq,extra={})=>({sender_id,seq,sender_kind:'user',kind:'text',created_at:new Date().toISOString(),...extra});
  const conversation={...item,send_policy:policy};
  assert.equal(workSendPolicy(conversation,[message('me',1),message('me',2),message('me',0,{status:'sending'})],'me').remaining_messages,0);
  assert.equal(workSendPolicy(conversation,[message('other',1,{sender_kind:'system',kind:'system'})],'me').text_only,true);
  assert.equal(workSendPolicy(conversation,[message('other',2)],'me').awaiting_reply,false);
  assert.equal(workSendPolicy(conversation,[message('me',0,{status:'failed'})],'me').remaining_messages,3);
});
test('every configured locale has the work-conversation copy',()=>{
  for(const locale of LOCALES) assert.ok(swCsCopy(locale)[WORK_REPLY_NOTICE]);
  for(const locale of LOCALES) for(const source of ['添加好友','请求已发送','你们之间有拉黑关系，不能发送消息','联系买家']) assert.ok(IM_WORK_CONVERSATION_MESSAGES[locale][source],`${locale}: ${source}`);
});


test('header actions open profile, block and report without contact requests',async()=>{
  const require=createRequire(import.meta.url);
  const fabricRequire=createRequire(require.resolve('fabric/node'));
  const canvas=fabricRequire.resolve('canvas');
  const oldCanvas=require.cache[canvas];
  require.cache[canvas]={id:canvas,filename:canvas,loaded:true,exports:{}};
  const { JSDOM }=await import(pathToFileURL(fabricRequire.resolve('jsdom')).href);
  if(oldCanvas) require.cache[canvas]=oldCanvas; else delete require.cache[canvas];
  const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/'});
  const previous={};
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})) {
    previous[key]=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  }
  globalThis.__iwActs=[];
  const {createRoot}=await import('react-dom/client');
  const container=document.createElement('div'); document.body.append(container);
  const root=createRoot(container); let blocked=false;
  try {
    await act(async()=>root.render(React.createElement(WorkConversationHeader,{conversation:item,onBlocked(){blocked=true}})));
    const click=async(text)=>act(async()=>{const btn=[...container.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(Boolean(btn));btn.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});
    await click('查看资料'); assert.ok(container.textContent.includes('profile-open')); assert.deepEqual(globalThis.__iwActs,[]);
    await click('拉黑'); assert.equal(blocked,true); assert.deepEqual(globalThis.__iwActs[0],['block','seller']);
    await click('举报'); assert.ok(container.textContent.includes('report-open'));
  } finally {
    await act(async()=>root.unmount()); dom.window.close(); delete globalThis.__iwActs;
    for(const [key,descriptor] of Object.entries(previous)) { if(descriptor) Object.defineProperty(globalThis,key,descriptor); else delete globalThis[key]; }
  }
});
