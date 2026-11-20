import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { ConversationStore } from "../src/shell/messages/conversation/conversation-store.ts";
import { swCsCopy } from "../src/i18n/ui/messages/sw-cs-copy.ts";
import { LOCALES } from "../src/i18n/config.ts";
import { workSendPolicy } from "../src/shell/messages/conversation/work-policy.ts";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.CustomEvent = window.CustomEvent;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
window.HTMLElement.prototype.scrollIntoView = function () {};
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const { createRoot } = await import("react-dom/client");
const flush = () => new Promise((resolve) => setImmediate(resolve));
const no = (...names) => dataModule(names.map((name) => `export function ${name}(){return null}`).join("\n"));
const ui = dataModule(`const copy=${JSON.stringify(swCsCopy("en"))}; export function useUI(){return (key,vars={})=>(copy[key]||key).replace(/\\{(\\w+)\\}/g,(m,k)=>vars[k]??m)}`);
const locale = dataModule('export function useLocale(){return "en"}');
const hostStub = dataModule(`
  export function useMessagesHost(){return globalThis.__csHostState}
  export function hostState(){return globalThis.__csHost}
  export function isSubView(){return false}
  export function tabOfView(v){return v}
  export function closeMessages(){}
  export function openMessages(){}
`);
const threadStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function ConversationView({onOpenInfo}){
    return React.createElement('div',{'data-test-thread':''},React.createElement('textarea',{'data-test-draft':''}),React.createElement('button',{'data-test-info':'',onClick:onOpenInfo},'info'))
  }
`);
const infoStub = dataModule(`import React from ${JSON.stringify(reactUrl)};export function ConversationInfoPanel({onClose}){return React.createElement('section',{'data-info-panel':''},React.createElement('button',{'data-test-close':'',onClick:onClose},'close'))}`);
const baseHostStubs = {
  "../../i18n/ui/useUI": ui,
  "../bay/deal": no("DealConversationView"),
  "../messages/conversation/ConversationView": threadStub,
  "../messages/groups/ConversationInfoPanel": infoStub,
  "../messages/groups/NewConversationDialog": no("NewConversationDialog"),
  "../messages/Inbox": no("Inbox"),
  "../messages/invite/InviteAcceptDialog": no("InviteAcceptDialog"),
  "../messages/host-state": hostStub,
  "../messages/notices/MessagesSubView": no("MessagesSubView"),
  "../messages/people/PeopleView": no("PeopleView"),
};
const { LeoChatBody } = await import(await compileModule("src/shell/leochat/leochat-body.tsx", baseHostStubs));
const { MessagesHost } = await import(await compileModule("src/shell/messages/MessagesHost.tsx", {
  ...baseHostStubs,
  "./conversation/ConversationView": threadStub,
  "./groups/ConversationInfoPanel": infoStub,
  "./groups/NewConversationDialog": no("NewConversationDialog"),
  "./Inbox": no("Inbox"),
  "./invite/InviteAcceptDialog": no("InviteAcceptDialog"),
  "./host-state": hostStub,
  "./notices/MessagesSubView": no("MessagesSubView"),
  "./people/PeopleView": no("PeopleView"),
  "next/navigation": dataModule('const r={push(){}};export function usePathname(){return "/"}export function useRouter(){return r}'),
  "../../lib/im/client": dataModule('export function useImEnabled(){return true}'),
  "../../lib/im/notify-api": dataModule('export function cachedImSettings(){return {}} export function refreshImSettingsInBackground(){}'),
  "../bay/shell/bay-auth-host": no("BayAuthHost"),
  "../bay/shell/bay-state": no("setBayNavigator"),
  "../leochat/LeoChatTabs": no("LeoChatTabs"),
  "../replay/work/WorkReplayHost": no("WorkReplayHost"),
  "./MessagesLayout": dataModule(`import React from ${JSON.stringify(reactUrl)};export function MessagesLayout({detail}){return React.createElement('main',{},detail)}`),
  "./notices/notice-unread": dataModule('export function cleanCount(n){return Number.isFinite(n)?Math.max(0,Math.floor(n)):0}'),
  "./notices/open-notice": no("setNoticeNavigator"),
  "./notices/use-notices": dataModule('const store={refresh:async()=>{},getState:()=>({unread:0}),subscribe:()=>()=>{}};export function noticeStore(){return store} export function useLeoChatUnread(){return {total:0,requests:0}}export function useNoticePolling(){}'),
  "./notify/sound": dataModule("export function attachMessageSound(){return ()=>{}} export function createBrowserMessageSound(){}"),
  "./notify/title-badge": no("attachBrowserTitleBadge"),
  "./call/ui": no("CallHost"),
  "./call/incoming": no("IncomingCallHost"),
  "./call/control": no("CallControlHost"),
  "../realtime-call/RealtimeCallHost": no("RealtimeCallHost"),
  "./PrivacyNotice": no("PrivacyNotice"),
  "./realtime/hooks": dataModule('const store={setForegroundConversation(){},clearConversationUnread(){},subscribe:()=>()=>{}};export function imStore(){return store}export function attachImRealtime(){return ()=>{}} export function publishImDisabled(){}'),
}));

async function mount(element) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  return { host, q: (s) => host.querySelector(s),
    async click(s) { const el=host.querySelector(s); assert.ok(el,s); await act(async()=>el.click()); },
    async unmount() { await act(async()=>root.unmount()); host.remove(); },
  };
}
function state(layout="full") {
  globalThis.__csHostState = { conversationId:"conv", view:"inbox", layout, open:true, surface:"window", expanded:layout==="full" };
  globalThis.__csHost = { setEnabled(){},attach:()=>()=>{},getSnapshot:()=>globalThis.__csHostState,showConversation(){},setView(){} };
}
for (const [name,component,props,layout] of [
  ["page wide",LeoChatBody,{wide:true},"full"], ["page narrow",LeoChatBody,{wide:false},"docked"],
  ["mini expanded",MessagesHost,{},"full"], ["mini docked",MessagesHost,{},"docked"],
]) test(`info replaces the whole pane, preserving DOM draft and scroll: ${name}`, async()=>{
  state(layout);
  const v=await mount(React.createElement(component,props));
  try {
    const thread=v.q('[data-test-thread]'); const draft=v.q('[data-test-draft]');
    draft.value="unsent words"; thread.scrollTop=187;
    await v.click('[data-test-info]');
    assert.equal(v.q('[data-conversation-thread]').hidden,true);
    assert.equal(v.q('[data-conversation-thread]').style.display,"none");
    assert.ok(v.q('[data-conversation-info]').classList.contains('flex-1'));
    assert.ok(!v.q('[data-conversation-info]').className.includes('320'));
    await v.click('[data-test-close]');
    assert.equal(v.q('[data-conversation-thread]').hidden,false);
    assert.equal(v.q('[data-test-thread]'),thread);
    assert.equal(v.q('[data-test-draft]'),draft);
    assert.equal(draft.value,"unsent words"); assert.equal(thread.scrollTop,187);
  } finally {await v.unmount()}
});

const inbox={items:[]};
const rt=dataModule(`export function useImEvent(){}export function useImResync(){}export function usePresence(){return {}} export function useImInbox(){return globalThis.__csInbox}`);
globalThis.__csInbox=inbox;
const apiStub=dataModule(`export const messagesApi={me:async()=>({profile:{user_id:'me'}}),getConversation:async()=>globalThis.__csDetail,profiles:async()=>[],markRead:async()=>{},getDraft:async()=>({body:''}),listDrafts:async()=>[],putDraft:async()=>{}}`);
const searchStub=dataModule(`export function normalizeSearchQuery(q){return q.trim()}export function searchQueryReady(q){return q.trim().length>=2}export const searchApi={search:async(p)=>{globalThis.__csSearchCalls.push(p);return globalThis.__csSearchReply},directory:async()=>[]}`);
const frameStub=dataModule(`import React from ${JSON.stringify(reactUrl)};export const QUIET='';export function MessageSettingsHeader({onBack,title}){return React.createElement('header',{},React.createElement('button',{'data-search-back':'',onClick:onBack},title))}export function MessageConfirmDialog(){return null}`);
const searchStubs={
  "../../../i18n/ui/useUI":ui, "next-intl":locale,
  "../../../lib/im/messages-api":apiStub, "../../../lib/im/search-api":searchStub,
  "../realtime/hooks":rt, "../MessageSettingsFrame":frameStub,
  "../../Markdown":dataModule('export function splitHighlights(text){return [{text,hit:false}]}'),
};
const { SearchView }=await import(await compileModule("src/shell/messages/search/SearchView.tsx",searchStubs));
const composerStub=dataModule(`import React from ${JSON.stringify(reactUrl)};export function Composer(){return React.createElement('textarea',{'data-real-draft':''})}`);
const { ConversationView }=await import(await compileModule("src/shell/messages/conversation/ConversationView.tsx",{
  ...searchStubs,
  "../../../lib/im/client":dataModule('export class ImApiError extends Error{}'),
  "../../../lib/im/people-api":dataModule('export function conversationDisplayTitle(c){return c.title}export function visiblePersonName(p){return p.display_name}'),
  "../../../lib/im/inbox-api":dataModule('export async function fetchConversations(){return {items:[]}}'),
  "./conversation-store":dataModule('export function getConversationStore(){return globalThis.__csStore}export function unreadBoundary(){return null}'),
  "../../nav-source/route-boundary":no("RoutePageSkeleton"),
  "../composer/Composer":composerStub,
  "../host-state":hostStub,
  "../people/ProfileCard":no("ProfileCard"), "../report/ReportDialog":no("ReportDialog"),
  "./MessageList":dataModule(`import React from ${JSON.stringify(reactUrl)};export function useStoreEvents(){}export function MessageList(){return React.createElement('div',{'data-test-messages':''})}`),
  "./MessageItem":dataModule('export function useMessageHandlers(){return {}}'),
  "./PinnedBar":no("PinnedBar"), "./ForwardMessagesDialog":no("ForwardMessagesDialog"),
  "./TypingLine":dataModule('export function TypingLine(){return null}export function useTypingUsers(){return []}'),
  "./WorkConversationHeader":no("WorkConversationHeader"),
  "../call/chat":dataModule(`export function CallButton(){return null}export function CallChatProvider({children}){return children}export function callMetaOf(){return null}export function callMetaUserIds(){return []}export function removalReasonFor(){return null}export function useEndedCallIndex(){return ()=>null}`),
}));
const page={items:[],has_more_before:false,has_more_after:false};
function makeStore(api={}) { return new ConversationStore({conversationId:'conv',viewerId:'me',api:{listMessages:async()=>page,listPins:async()=>[],...api}}); }
function setupConversation(){
  globalThis.__csDetail={id:'conv',title:'Group',kind:'group',members:[],my_role:'member',member_count:1};
  globalThis.__csStore=makeStore(); globalThis.__csSearchCalls=[];
  globalThis.__csSearchReply={items:[],next_cursor:null};
}
test('conversation search hides composer, preserves its draft, and fills available pane',async()=>{
  setupConversation(); await globalThis.__csStore.loadLatest();
  const v=await mount(React.createElement(ConversationView,{conversationId:'conv',layout:'full'}));
  try {
    const draft=v.q('[data-real-draft]'); assert.ok(draft); draft.value='keep this draft';
    assert.match(v.host.textContent,/1 member/);
    await v.click('button[aria-label="搜索消息"]');
    assert.equal(v.q('[data-conversation-composer]').hidden,true);
    assert.equal(v.q('[data-conversation-composer]').style.display,'none');
    assert.ok(v.q('[data-search-view]'));
    assert.ok(v.q('input[type="search"]').classList.contains('w-full'));
    assert.ok(!v.q('[data-search-filters]').classList.contains('flex-wrap'));
    assert.ok(v.q('[data-search-results]').classList.contains('flex-1'));
    assert.equal(v.q('[data-message-settings-frame]'),null);
    await v.click('[data-search-back]');
    assert.equal(v.q('[data-conversation-composer]').hidden,false);
    assert.equal(v.q('[data-real-draft]'),draft); assert.equal(draft.value,'keep this draft');
  }finally{await v.unmount()}
});

test('inbox-wide search with hideInput still filters, renders and opens results',async(t)=>{
  setupConversation();
  globalThis.__csSearchReply={items:[{conversation:{id:'conv',title:'Group'},message:{id:'m1',seq:4,body:'needle',sender_id:'peer',sender_kind:'user',kind:'text',attachments:[],created_at:'2026-11-20T00:00:00Z'},highlights:[[0,6]]}],next_cursor:null};
  const opened=[];
  const v=await mount(React.createElement(SearchView,{query:'needle',hideInput:true,onOpenResult:(...args)=>opened.push(args)}));
  try {
    assert.equal(v.q('input[type="search"]'),null); assert.equal(v.q('[data-search-filters] select').getAttribute('aria-label'),'会话');
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,340))});
    assert.equal(globalThis.__csSearchCalls.length,1);
    await v.click('[data-search-result]'); assert.deepEqual(opened,[['conv',4]]);
  }finally{await v.unmount()}
});

test('reply_limit is preserved and displayed as a plain line above the composer',async()=>{
  setupConversation();
  globalThis.__csStore=makeStore({sendMessage:async()=>{throw Object.assign(new Error('opaque diagnostic'),{code:'reply_limit'})}});
  await globalThis.__csStore.loadLatest();
  await globalThis.__csStore.send({kind:'text',body:'fourth'});
  assert.equal(globalThis.__csStore.getSnapshot().pending[0].error,'reply_limit');
  const v=await mount(React.createElement(ConversationView,{conversationId:'conv',layout:'full'}));
  try {assert.equal(v.q('[data-reply-limit]').textContent,'You can send 3 messages a week until they reply'); assert.ok(v.q('[data-reply-limit]').nextElementSibling.matches('textarea'));}
  finally{await v.unmount()}
});

for(const around of [null,42]) test(`first load auto-retries with backoff and no early error, target ${around}`,async(t)=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:100000});
  let calls=0; let succeed=false;
  const params=[];
  const store=makeStore({listMessages:async(_id,p)=>{calls++;params.push(p);if(!succeed)throw Error('network');return page}});
  const off=store.subscribe(()=>{});
  try{
    await (around===null?store.loadLatest():store.loadAround(around));
    assert.equal(store.getSnapshot().loaded,false);assert.equal(store.getSnapshot().error,null);
    for(const delay of [1000,2000,4000,8000]){
      const before=calls;
      t.mock.timers.tick(delay-1);await flush();assert.equal(calls,before);
      t.mock.timers.tick(1);await flush();assert.equal(calls,before+1);
    }
    assert.equal(calls,5);assert.equal(store.getSnapshot().error,'load_retrying');
    succeed=true;t.mock.timers.tick(16000);await flush();
    assert.equal(store.getSnapshot().loaded,true);assert.equal(store.getSnapshot().error,null);
    assert.equal(params.at(-1).around_seq,around??undefined);
    t.mock.timers.tick(60000);assert.equal(calls,6);
  }finally{off();t.mock.timers.reset()}
});

test('first-load recovery pauses offline/hidden, wakes on online/visibility/focus, and cleans up',async(t)=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:100000});
  let calls=0;
  const store=makeStore({listMessages:async()=>{calls++;throw Error('network')}});
  const off=store.subscribe(()=>{});
  try{
    await store.loadLatest();
    Object.defineProperty(navigator,'onLine',{configurable:true,value:false});window.dispatchEvent(new window.Event('offline'));
    t.mock.timers.tick(60000);await Promise.resolve();assert.equal(calls,1);
    Object.defineProperty(navigator,'onLine',{configurable:true,value:true});window.dispatchEvent(new window.Event('online'));
    await flush();assert.equal(calls,2);
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new window.Event('visibilitychange'));
    t.mock.timers.tick(60000);await Promise.resolve();assert.equal(calls,2);
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new window.Event('visibilitychange'));
    await flush();assert.equal(calls,3);
    window.dispatchEvent(new window.Event('focus'));await flush();assert.equal(calls,4);
    off();window.dispatchEvent(new window.Event('online'));t.mock.timers.tick(60000);assert.equal(calls,4);
  }finally{off();delete navigator.onLine;delete document.visibilityState;t.mock.timers.reset()}
});

test('a replied DM lifts limits, and messages older than seven days do not consume slots',()=>{
  const now=Date.now();
  const conversation={send_policy:{awaiting_reply:true,text_only:true,remaining_messages:3}};
  const own=(ms,extra={})=>({sender_kind:'user',kind:'text',sender_id:'me',seq:1,created_at:new Date(ms).toISOString(),...extra});
  assert.equal(workSendPolicy(conversation,[own(now-8*86400000),own(now-8*86400000),own(now-8*86400000)],'me').remaining_messages,3);
  assert.equal(workSendPolicy(conversation,[own(now),own(now),own(now,{seq:0,status:'sending'})],'me').remaining_messages,0);
  assert.equal(workSendPolicy(conversation,[own(now,{sender_id:'peer'})],'me').awaiting_reply,false);
});

test('CS strings cover every locale with correct English singular and reply-limit wording',()=>{
  for(const locale of LOCALES){const copy=swCsCopy(locale);assert.equal(Object.keys(copy).length,6);for(const text of Object.values(copy))assert.ok(text.trim())}
  assert.equal(swCsCopy('en')['1 位成员'],'1 member');
});

const { MessageItem }=await import(await compileModule('src/shell/messages/conversation/MessageItem.tsx',{
  'next-intl':locale,'../../../i18n/ui/useUI':ui,'../MessageSettingsFrame':frameStub,
  '../../../ui/Toast':dataModule('export function useToast(){return {}}'),
  '../leo/LeoMessageBody':no('LeoMessageBody','LeoNoticeLine'),
  './ArtifactCardView':no('ArtifactCardView'),
  './AttachmentView':dataModule('export function AttachmentView(){return null}export function safeMediaUrl(u){return u}'),
  './MessageActions':dataModule('export function MessageActions(){return null}export function actionPermissions(){return {}}'),
  './MessageBody':no('MessageBody'),'../../bay/orders/BayOrderCard':no('BayOrderCard'),
  './ReplayCardView':no('ReplayCardView'),'./SystemLine':no('SystemLine'),
  '../../../lib/im/people-api':dataModule('export function visiblePersonName(p){return p.display_name}'),
}));
test('via_agent mark sits next to the timestamp on both sides, including grouped messages',async()=>{
  for(const sender of ['me','peer']) for(const grouped of [false,true]){
    const props={message:{id:'agent',seq:1,sender_id:sender,sender_kind:'user',kind:'text',created_at:'2026-11-20T00:00:00Z',body:'hello',attachments:[],meta:{via_agent:true}},viewerId:'me',grouped,profiles:{me:{display_name:'Me'},peer:{display_name:'Peer'}},conversation:{kind:'dm',members:[]},handlers:{onOpenProfile(){}}};
    const v=await mount(React.createElement(MessageItem,props));
    try{assert.equal(v.q('[data-sent-by-agent]').textContent,'sent by agent');assert.equal(v.q('time').nextElementSibling,v.q('[data-sent-by-agent]'));assert.equal(v.q('[data-message-row]').dataset.messageRow,sender==='me'?'own':'incoming')}
    finally{await v.unmount()}
    const plain=await mount(React.createElement(MessageItem,{...props,message:{...props.message,meta:null}}));
    try{assert.equal(plain.q('[data-sent-by-agent]'),null)}finally{await plain.unmount()}
  }
});

const { Composer: RealComposer } = await import(await compileModule('src/shell/messages/composer/Composer.tsx', {
  '../../../i18n/ui/useUI': ui,
  '../../../lib/im/messages-api': apiStub,
  '../../replay/work/ReplayPickerDialog': no('ReplayPickerDialog'),
  '../leo/LeoComposerAddon': no('LeoComposerAddon'),
  '../realtime/hooks': dataModule('export function sendTyping(){}'),
  './ArtifactPickerDialog': no('ArtifactPickerDialog'),
}));
test('composer keeps one card around input and action row; textarea stays transparent on focus',async()=>{
  // Session / sites wave (UM): the frame is styled by its own Tailwind classes only, no data-im-composer CSS.
  const v=await mount(React.createElement(RealComposer,{store:makeStore(),conversationId:'frame-test',conversation:null,viewerId:'me',layout:'full'}));
  try{
    const card=v.q('[data-composer]'); const input=card.querySelector('textarea');
    assert.equal(v.q('[data-im-composer]'),null);
    assert.ok(card.querySelector('[data-composer-actions]'));
    assert.ok(card.classList.contains('rounded-2xl'));
    assert.ok(input.classList.contains('bg-transparent')&&input.classList.contains('focus:outline-none'));
    for(const label of ['发文件或作品','表情','录音']) assert.ok(card.querySelector(`button[aria-label="${label}"]`),label);
  }finally{await v.unmount()}
});

const { MessageList: RealMessageList }=await import(await compileModule('src/shell/messages/conversation/MessageList.tsx',{
  'next-intl':locale,'../../../i18n/ui/useUI':ui,'../realtime/hooks':rt,
  './MessageItem':dataModule(`import React from ${JSON.stringify(reactUrl)};export function MessageItem({message}){return React.createElement('p',{'data-seq':message.seq},message.body)}`),
  '../../ChatTimeSeparator':no('ChatTimeSeparator'),
  '../../history/older-history':dataModule('export function OlderHistoryTop(){return null}export function useOlderHistory(){return {spinnerVisible:false,sentinelRef:null}}'),
}));
test('hidden thread neither changes its reading position nor reports new messages read',async()=>{
  const message=(seq)=>({id:`m${seq}`,conversation_id:'conv',seq,sender_id:'peer',sender_kind:'user',kind:'text',body:`row ${seq}`,created_at:'2026-11-20T00:00:00Z',mentions:[],attachments:[]});
  const store=makeStore({listMessages:async()=>({...page,items:[message(1)]})});await store.loadLatest();
  const reads=[];const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
  const props={store,profiles:{},conversation:{kind:'group'},viewerId:'me',handlers:{},onReachBottom:(seq)=>reads.push(seq)};
  try{
    await act(async()=>root.render(React.createElement(RealMessageList,{...props,snapshot:store.getSnapshot(),active:true})));
    const scroll=container.querySelector('[data-message-list]');
    Object.defineProperty(scroll,'scrollHeight',{configurable:true,value:1000});Object.defineProperty(scroll,'clientHeight',{configurable:true,value:100});
    scroll.scrollTop=250;await act(async()=>scroll.dispatchEvent(new window.Event('scroll',{bubbles:true})));reads.length=0;
    const snapshot={...store.getSnapshot(),messages:[message(1),message(2)],lastSeq:2};
    await act(async()=>root.render(React.createElement(RealMessageList,{...props,snapshot,active:false})));
    assert.equal(scroll.scrollTop,250);assert.deepEqual(reads,[]);
    await act(async()=>root.render(React.createElement(RealMessageList,{...props,snapshot,active:true})));
    assert.equal(scroll.scrollTop,250);assert.deepEqual(reads,[]);
  }finally{await act(async()=>root.unmount());container.remove()}
});
