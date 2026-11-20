import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import React, { act } from 'react';
import './helpers/w1-jsdom-window.mjs';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve('react')).href;
const { createRoot } = await import('react-dom/client');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__LC2React = React;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
const uiHook = dataModule('export function useUI(){return (s,v)=>s.replace(/\\{(\\w+)\\}/g,(_,k)=>v?.[k]??"{"+k+"}");}');
const primitive = dataModule(`import React from ${JSON.stringify(reactUrl)}; export function Modal({children,className,labelledBy}){return React.createElement('div',{role:'dialog',className,'aria-labelledby':labelledBy},children);}`);
const framePath = path.resolve('src/shell/messages/MessageSettingsFrame.tsx');
const frameUrl = await compileModule(framePath, { '../../i18n/ui/useUI': uiHook, '../../ui': primitive });
const frame = await import(frameUrl);
const people = [{user_id:'u1',display_name:'Alice',avatar_url:null},{user_id:'u2',display_name:'Bob',avatar_url:null}];
const detail = {id:'c1',kind:'group',title:'Group',members:[],member_count:1,my_role:'owner',notify_level:'all'};
const special = {
 useUI:'()=>((s,v)=>s.replace(/\\{(\\w+)\\}/g,(_,k)=>v?.[k]??"{"+k+"}"))',
 useLocale:'()=>"en"',
 useLoader:`(load)=>({data:/getConversationDetail/.test(String(load))?${JSON.stringify(detail)}:/getProfile/.test(String(load))?{...${JSON.stringify(people[0])},relation:'contact'}:/getMe/.test(String(load))?{user_id:'self'}:[],loading:false,error:null,reload(){}})`,
 useImInbox:'()=>({items:[],loaded:true})', usePresence:'()=>({})', useImEvent:'(type,fn)=>{(globalThis.__LC2Events??={})[type]=fn;}',
 useNoticeState:'()=>({items:[],loaded:true,unread:0})',
 noticeStore:'()=>({refresh:async()=>{},markAllRead:async()=>{}})',
 useOwnerCases:'()=>({phase:"ready",cases:[],reload:async()=>{},apply(){}})',
 conversationCaps:'()=>({isGroupLike:true,canEditSettings:true,isManual:true,canAddMembers:true})',
 conversationDisplayTitle:'(c)=>c.title', visiblePersonName:'(p)=>p.display_name', sectionLetter:'(s)=>s[0].toUpperCase()',
 listBlocks:'async()=>[]', listMyOrgs:'async()=>[]',
 fetchConversations:'async()=>({items:[]})',
 searchQueryReady:'()=>false', normalizeSearchQuery:'s=>s', filtersToParams:'()=>({})',
 accessToken:'()=>new Promise(()=>{})',
 useCall:'()=>({phase:"active",callId:"call1",me:{audioOnly:false},limits:{},issues:[]})',
 useNetworkHealth:'()=>({stats:{}})', useIssueEnvironment:'()=>({})',
 listMediaDevices:'async()=>({microphones:[],speakers:[],cameras:[]})', queryPermission:'async()=>"unknown"',
 startMicMeter:'()=>new Promise(()=>{})', startMicProbe:'()=>new Promise(()=>{})',
 supportsSinkSelection:'()=>false', lockBodyScroll:'()=>()=>{}', trapTabWithin:'()=>false',
};
Object.assign(special, {
 useControlNotices:'()=>[]', useSelfUserId:'()=>"self"', callIsLive:'()=>true',
 currentBridge:'()=>null', participantName:'()=>"Chris"', decideControlRequest:'()=>({action:"browser_card"})',
 antiFraudSeen:'()=>true', useImResync:'()=>{}',
 collectIssues:'()=>[{id:"network_poor",kind:"network_poor",text:"Network issue",vars:{},help:[],action:{kind:"open_test",label:"Open test"}}]',
 pruneDismissed:'(set)=>set',
});
Object.assign(special, {
 openDm:'async(id)=>{globalThis.__LC2Created={kind:"dm",id};return "dm-fixture";}',
 createGroup:'async(input)=>{globalThis.__LC2Created={kind:"group",input};return {conversation:{id:"group-fixture",member_count:3},pending_invites:0};}',
});
const constants = {
 EMPTY_FILTERS:'{}', NOTIFY_CHOICES:'[]', INVITE_EXPIRY_CHOICES:'[]', INVITE_USES_CHOICES:'[]',
 DEFAULT_IM_SETTINGS:'{}', SERVER_NOTICE_KIND:'"server"',
 searchApi:'{directory:async()=>[]}',
 controlStore:'{snapshot:()=>({sessions:[]}),addRequest(){},subscribe:()=>()=>{},expireOverdue(){},get:()=>({state:"pending"})}',
};
// Mock each surface's collaborators; the actual frame, cards and surface JSX are always rendered.
async function surface(rel, name) {
 const file=path.resolve(rel), source=fs.readFileSync(file,'utf8');
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const stubs={};
 for(const stmt of ast.statements) {
  if(!ts.isImportDeclaration(stmt)||!stmt.importClause||stmt.importClause.isTypeOnly)continue;
  const spec=stmt.moduleSpecifier.text;
  if(spec==='react'||spec==='react-dom'||spec==='./styles')continue;
  if(spec.endsWith('MessageSettingsFrame')){stubs[spec]=frameUrl;continue;}
  if(spec.endsWith('useUI')){stubs[spec]=uiHook;continue;}
  const imports=stmt.importClause.namedBindings;
  if(!imports||!ts.isNamedImports(imports))continue;
  const lines=[];
  for(const el of imports.elements) {
   if(el.isTypeOnly)continue;
   const n=(el.propertyName??el.name).text;
   if(special[n])lines.push(`export const ${n}=${special[n]};`);
   else if(constants[n])lines.push(`export const ${n}=${constants[n]};`);
   else if(/^[A-Z_]+$/.test(n))lines.push(`export const ${n}=[];`);
   else if(n==="AnchoredPopover")lines.push(`export function AnchoredPopover({open,children,style,attributes}){return open?globalThis.__LC2React.createElement("div",{...attributes,style},children):null;}`);
   else if(n==="DiagDialog")lines.push(`export function DiagDialog({children}){return children;}`);
   else if(/^[A-Z]/.test(n))lines.push(`export function ${n}(){return null;}`);
   else if(n.endsWith('Api')||n.endsWith('Actions'))lines.push(`export const ${n}={};`);
   else lines.push(`export function ${n}(){return Promise.resolve([]);}`);
  }
  stubs[spec]=dataModule(lines.join('\n'));
 }
 return (await import(await compileModule(file,stubs)))[name];
}
async function mount(Component,props={}) {
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 await act(async()=>{root.render(React.createElement(Component,props));});
 return {host,async close(){await act(async()=>root.unmount());host.remove();}};
}
function hasClasses(root,classes){return [...root.querySelectorAll('*')].some(el=>classes.split(' ').every(c=>el.classList.contains(c)));}
const fixtures=[
 ['groups/ConversationInfoPanel','ConversationInfoPanel',{conversationId:'c1',onClose(){},onOpenConversation(){}}],
 ['groups/TeamInviteDialog','TeamInviteDialog',{orgId:'o1',onClose(){}}],
 ['groups/UpgradeToTeamDialog','UpgradeToTeamDialog',{conversationId:'c1',onClose(){},onDone(){}}],
 ['people/InviteLinkDialog','InviteLinkDialog',{onClose(){},conversationId:'c1'}],
 ['invite/InviteAcceptDialog','InviteAcceptDialog',{code:'fixture',onClose(){},onDone(){}}],
 ['people/ProfileCard','ProfileCard',{userId:'u1',onClose(){},onOpenConversation(){}}],
 ['people/BlockedList','BlockedList',{onBack(){}}],
 ['search/SearchView','SearchView',{onOpenResult(){},onBack(){}}],
 ['SettingsView','SettingsView',{onOpenBlocks(){}}],
 ['report/ReportDialog','ReportDialog',{target:{kind:'user',id:'u1'},onClose(){}}],
 ['composer/ArtifactPickerDialog','ArtifactPickerDialog',{open:true,onClose(){},onPick(){}}],
 ['notices/NoticesView','NoticesView',{onBack(){}}],
 ['notices/NoticeDetailView','NoticeDetailView',{noticeId:'n1',onBack(){}}],
 ['cases/MessagesContentCases','MessagesContentCases',{onBack(){}}],
 ['call/diagnostics/CallTestPanel','CallTestPanel',{open:true,onClose(){}}],
];
test('fixtures inventory stays complete',()=>assert.equal(fixtures.length,15));
for(const [rel,name,props] of fixtures) test(`${name} uses its assigned frame and size`,async()=>{
 const Component=await surface(`src/shell/messages/${rel}.tsx`,name), view=await mount(Component,props);
 try {
  if(name==='SearchView'){
   const panel=view.host.querySelector('[data-search-view]');assert.ok(panel);
   assert.ok(panel.classList.contains('flex-1'));assert.ok(panel.classList.contains('min-h-0'));
   assert.ok(panel.querySelector('[data-message-settings-header]'));
   assert.ok(panel.querySelector('[data-search-controls]'));
   assert.ok(panel.querySelector('[data-search-results]').classList.contains('overflow-y-auto'));
   assert.equal(panel.querySelector('[data-message-settings-frame]'),null);
   return;
  }
  const compact=['UpgradeToTeamDialog','InviteAcceptDialog','ProfileCard'].includes(name);
  const panel=document.querySelector(compact?'[data-message-prompt]':'[data-message-settings-frame]');assert.ok(panel,name);
  if(compact){
   assert.equal(document.querySelector('[data-message-settings-frame]'),null);
   assert.ok(panel.closest('[role=dialog]').classList.contains('max-w-md'));
  }else{
   const column=panel.querySelector('[data-message-settings-content]');assert.ok(column.classList.contains('max-w-[800px]'));assert.ok(column.classList.contains('mx-auto'));
   if(['ReportDialog'].includes(name)){
    assert.ok(panel.parentElement.classList.contains(frame.MESSAGE_SETTINGS_HEIGHT),`${name}: exact Settings height`);
    assert.ok(panel.parentElement.classList.contains('!w-[min(1040px,94vw)]'),`${name}: exact Settings width`);
   }
   // Session / sites wave (UL): pickers and short dialogs are a normal-size Modal, not the 1040×760 Settings frame.
   if(['TeamInviteDialog','ArtifactPickerDialog','InviteLinkDialog'].includes(name)){
    assert.ok(panel.parentElement.classList.contains('max-w-lg'),`${name}: normal-size modal`);
    assert.equal(panel.parentElement.classList.contains(frame.MESSAGE_SETTINGS_HEIGHT),false,`${name}: not the Settings height`);
    assert.equal(panel.parentElement.classList.contains('!w-[min(1040px,94vw)]'),false,`${name}: not the Settings width`);
   }
   if(['NewConversationDialog'].includes(name)){
    assert.equal(panel.parentElement.classList.contains(frame.MESSAGE_SETTINGS_HEIGHT),false,`${name}: follows content height`);
    assert.ok(panel.parentElement.classList.contains('max-h-[min(760px,88vh)]'));
   }
  }
  assert.ok(panel.querySelector('[data-message-settings-header]'),`${name}: title row`);
  // Some settings pages contain child settings cards; isolated collaborators are replaced above.
  if(!['ConversationInfoPanel','SettingsView','CallTestPanel','MessagesContentCases'].includes(name))assert.ok(hasClasses(panel,frame.CARD),`${name}: Settings CARD`);
  if (['BlockedList','NoticesView','NoticeDetailView'].includes(name)) {
   const back=panel.querySelector('[data-back-button]');assert.ok(back,`${name}: Library back button`);
   for(const value of ['h-8','w-8','rounded-lg','border'])assert.ok(back.classList.contains(value));
   assert.equal(back.textContent,'');assert.ok(back.getAttribute('aria-label'));
  } else assert.ok(hasClasses(panel,frame.QUIET)||panel.querySelector('[data-action="close-panel"]'),`${name}: Settings button`);
  // Close is an icon button (no "×" text), with a label.
  for(const close of panel.querySelectorAll('[data-action="close-panel"]')){assert.equal(close.textContent,'',`${name}: icon close`);assert.ok(close.getAttribute('aria-label'));assert.ok(close.querySelector('svg'));}
  assert.ok(hasClasses(panel,frame.CARD_TITLE),`${name}: Settings title`);
 } finally {await view.close();}
});
test('replay picker uses shared settings frame',async()=>{
 const Component=await surface('src/shell/replay/work/ReplayPickerDialog.tsx','ReplayPickerDialog');
 const view=await mount(Component,{open:true,onClose(){},onPick(){}});
 try{const panel=view.host.querySelector('[data-message-settings-frame]');assert.ok(panel);assert.ok(panel.parentElement.classList.contains('max-w-lg'));assert.equal(panel.parentElement.classList.contains(frame.MESSAGE_SETTINGS_HEIGHT),false);assert.ok(panel.querySelector('[data-message-settings-content]').classList.contains('max-w-[800px]'));assert.ok(hasClasses(view.host,frame.CARD));}finally{await view.close();}
});
test('shared confirmation uses Settings controls and unlocks after completion',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r);let calls=0;
 const view=await mount(frame.MessageConfirmDialog,{title:'确认',body:'说明',danger:true,onCancel(){},onConfirm(){calls++;return pending;}});
 try{
  assert.equal(view.host.querySelector('[data-message-settings-frame]'),null);assert.ok(view.host.querySelector('[role=dialog]').classList.contains('max-w-md'));
  assert.ok(hasClasses(view.host,frame.CARD));assert.ok(hasClasses(view.host,frame.DANGER),'danger confirm is rose');assert.ok(hasClasses(view.host,frame.QUIET));
  const button=view.host.querySelector('[data-confirm-ok]');await act(async()=>button.click());assert.equal(button.disabled,true);assert.equal(calls,1);
  await act(async()=>resolve());assert.equal(button.disabled,false);
 }finally{await view.close();}
});
test('modal width follows the non-expanded Settings modal and panels fit their host',()=>{
 const source=fs.readFileSync('src/pages/settings/SettingsModal.tsx','utf8');assert.match(source,/w-\[min\(1040px,94vw\)\]/);
 assert.match(frame.MESSAGE_SETTINGS_WIDTH,/!w-\[min\(1040px,94vw\)\]/);
 assert.equal(frame.MESSAGE_SETTINGS_HEIGHT,'h-[min(760px,88vh)]');
});
test('LeoChat has no injected surface CSS, no private accent, no gradients',async()=>{
 const surface=await import(await compileModule('src/shell/messages/messages-surface.tsx'));
 assert.equal(surface.MESSAGES_SURFACE_CSS,undefined);assert.equal(surface.ensureMessagesSurfaceStyles,undefined);
 const source=fs.readFileSync('src/shell/messages/messages-surface.tsx','utf8');
 assert.doesNotMatch(source,/--im-accent|createElement\(["']style|gradient|#(?:5b5bf6|3b82f6|7c5cff|a5b4fc|fafaff|262626)/i);
 const avatar=fs.readFileSync('src/shell/messages/notices/notice-icons.tsx','utf8');assert.doesNotMatch(avatar,/gradient|from-amber|to-orange/);
});
test('both discarded add-contact explanation keys are absent in every locale',()=>{
 const copy=fs.readFileSync('src/i18n/ui/messages/im-people-copy.ts','utf8');assert.doesNotMatch(copy,/\b(?:m174|ic13):|Send the link or QR code|Share the link or QR code/);
 const dialog=fs.readFileSync('src/shell/messages/people/InviteLinkDialog.tsx','utf8');assert.doesNotMatch(dialog,/把链接或二维码发给对方/);
});

test('emoji stays a 248px anchored picker, selects an emoji, and closes on outside click / Escape',async()=>{
 const Component=await surface('src/shell/messages/composer/EmojiPicker.tsx','EmojiPicker');let closed=0,picked;
 const view=await mount(Component,{onClose(){closed++;},onPick(v){picked=v;}});
 try{
  const popover=view.host.querySelector('[role=dialog]');assert.ok(popover.classList.contains('w-[248px]'));assert.equal(view.host.querySelector('[data-message-settings-frame]'),null);
  await act(async()=>popover.querySelector('button').click());assert.equal(picked,'👍');
  await act(async()=>popover.querySelector('button').dispatchEvent(new window.Event('pointerdown',{bubbles:true})));assert.equal(closed,0);
  await act(async()=>document.body.dispatchEvent(new window.Event('pointerdown',{bubbles:true})));assert.equal(closed,1);
  await act(async()=>document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(closed,2);
 }finally{await view.close();}
});
test('control request retains the original 360px non-modal card and refusal behavior',async()=>{
 const Component=await surface('src/shell/messages/call/control/CallControlHost.tsx','CallControlHost');
 const view=await mount(Component);
 try{
  await act(async()=>globalThis.__LC2Events.call_control_request({call_id:'call1',session_id:'session1',controller_id:'other'}));
  const card=view.host.querySelector('[data-call-control-host-card]');assert.match(fs.readFileSync('src/shell/messages/call/control/CallControlHost.tsx','utf8'),/width: "min\(360px, calc\(100vw - 32px\)\)"/);assert.equal(card.getAttribute('aria-modal'),'false');assert.equal(card.style.top,'16px');assert.equal(view.host.querySelector('[data-message-settings-frame]'),null);assert.ok(hasClasses(view.host,frame.PRIMARY));
  await act(async()=>view.host.querySelector('[data-call-control-action=decline]').click());assert.equal(view.host.querySelector('[data-call-control-host-card]'),null);
 }finally{await view.close();}
});
test('call issue details stay a 320px anchored popover',async()=>{
 const Component=await surface('src/shell/messages/call/diagnostics/CallIssueButton.tsx','CallIssueButton');
 const view=await mount(Component);
 try{await act(async()=>view.host.querySelector('[data-call-issue-button]').click());assert.equal(view.host.querySelector('[data-call-issue-panel]').style.width,'320px');assert.equal(view.host.querySelector('[data-message-settings-frame]'),null);assert.ok(hasClasses(view.host,frame.QUIET));}finally{await view.close();}
});

test('diagnostic dialog portal has the exact collapsed Settings size',async()=>{
 const {DiagDialog}=await import(await compileModule('src/shell/messages/call/diagnostics/layer.tsx',{
  '../../MessageSettingsFrame':frameUrl,
  '../../../anchored-popover':dataModule('export function ensureOverlayMotionStyles(){} export function lockBodyScroll(){return ()=>{};} export function trapTabWithin(){}'),
 }));
 const view=await mount(DiagDialog,{onClose(){},labelledBy:'diagnostic-title',children:React.createElement('h2',{id:'diagnostic-title'},'Diagnostics')});
 try{const dialog=document.querySelector('[data-call-diagnostics-dialog] [role=dialog]');assert.ok(dialog.classList.contains(frame.MESSAGE_SETTINGS_HEIGHT));assert.ok(dialog.classList.contains('!w-[min(1040px,94vw)]'));}finally{await view.close();}
});
test('conversation remark editor is a compact one-field prompt',async()=>{
 const Component=await surface('src/shell/messages/groups/ConversationInfoPanel.tsx','ConversationInfoPanel');
 const view=await mount(Component,{conversationId:'c1',onClose(){},onOpenConversation(){}});
 try{
  await act(async()=>view.host.querySelector('[data-edit-setting=remark]').click());
  const prompt=view.host.querySelector('[data-message-prompt]');assert.ok(prompt);assert.ok(prompt.closest('[role=dialog]').classList.contains('max-w-md'));assert.equal(prompt.querySelector('[data-message-settings-frame]'),null);assert.equal(prompt.querySelectorAll('input').length,1);assert.ok(hasClasses(prompt,frame.PRIMARY));
  await act(async()=>prompt.querySelector('[data-action=close-panel]').click());assert.equal(view.host.querySelector('[data-message-prompt]'),null);
 }finally{await view.close();}
});

test('group invite link is a normal-size dialog',async()=>{
 const Component=await surface('src/shell/messages/people/InviteLinkDialog.tsx','InviteLinkDialog');
 const view=await mount(Component,{onClose(){},conversationId:'group1'});
 try{const panel=view.host.querySelector('[data-message-settings-frame]');assert.ok(panel);assert.ok(panel.parentElement.classList.contains('max-w-lg'));assert.ok(panel.querySelector('[data-message-settings-content]').classList.contains('max-w-[800px]'));}finally{await view.close();}
});

test('personal invite entry delegates to Find people instead of a contact invite sheet',async()=>{
 const Component=(await import(await compileModule('src/shell/messages/people/InviteLinkDialog.tsx',{
  '../MessageSettingsFrame': frameUrl,
  '../../../i18n/ui/useUI': uiHook,
  './PeopleDiscovery': dataModule('export function FindPeople(props){globalThis.__LC2FindPeople=props;return null;}'),
  '../host-state': dataModule('export function hostState(){return {showConversation(id){globalThis.__LC2Opened=id;}}}'),
 }))).InviteLinkDialog;
 let closed=0;
 const view=await mount(Component,{onClose(){closed++;}});
 try{
  assert.equal(view.host.querySelector('[data-invite-link-dialog]'),null);
  assert.equal(typeof globalThis.__LC2FindPeople.onBack,'function');
  globalThis.__LC2FindPeople.onOpenConversation('dm-person');
  assert.equal(globalThis.__LC2Opened,'dm-person');assert.equal(closed,1);
  globalThis.__LC2FindPeople.onBack();assert.equal(closed,2);
 }finally{await view.close();delete globalThis.__LC2FindPeople;delete globalThis.__LC2Opened;}
});
