import './helpers/w1-jsdom-window.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import React, {act} from 'react';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {compileModule, dataModule} from './helpers/module-bench.mjs';

const {createRoot} = await import('react-dom/client');
const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve('react')).href;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.Event = window.Event;
globalThis.CustomEvent = window.CustomEvent;
globalThis.localStorage = window.localStorage;
// Deliberately return a fresh translator on every component render, as a locale
// provider may do. Network effects must follow their data inputs, not this identity.
const ui = dataModule(`
import {createContext, useContext} from ${JSON.stringify(reactUrl)};
export const LocaleContext = createContext('en');
export function useUI(){const locale=useContext(LocaleContext);return source=>locale+':'+source;}
`);
const {LocaleContext} = await import(ui);
const parts = dataModule('export const CARD="", CARD_TITLE="", CARD_DESC="", QUIET="";');
const controls = dataModule(`import {createElement as h} from ${JSON.stringify(reactUrl)};
export function Modal(p){return h('div',{role:'dialog'},p.children);}
export function ConfirmDialog(){return null;}
export function Switch(p){return h('button',{type:'button',role:'switch','aria-label':p.label,'aria-checked':p.checked,disabled:p.disabled,onClick:()=>p.onChange(!p.checked)});}
`);
const {ServerBudgetPanel} = await import(await compileModule('src/pages/settings/ServerBudgetPanel.tsx', {
  '../../i18n/ui/useUI':ui, './personalization/parts':parts, '../../ui':controls,
}));
const {BudgetServerPurchase} = await import(await compileModule('src/pages/settings/BudgetServerPurchase.tsx', {
  '../../i18n/ui/useUI':ui, './personalization/parts':parts,
}));
const {LibraryPurchasedUpdates, LibraryImportDialog} = await import(await compileModule('src/shell/library-import.tsx', {
  '../i18n/ui/useUI':ui, '../ui':controls,
  './StorageCapacityStrip':dataModule('export function StorageCapacityStrip(){return null;}'),
  './library-folder-upload':dataModule('export const LIBRARY_FOLDERS_CHANGE_EVENT="ut:folders";'),
  '../lib/library-uploads':dataModule(`
export function libraryRequest(path,body){return globalThis.__utEffectRequest(path,body);}
export const LIBRARY_UPLOAD_EVENT='ut:upload';
export async function pendingLibraryUploads(){return [];}
export function pauseLibraryUpload(){}
export async function resumeLibraryUpload(){}
`),
}));
const {AttachmentFileViewer} = await import(await compileModule('src/shell/attachment-file-viewer.tsx', {'../i18n/ui/useUI':ui}));
const {ConversationView} = await import(await compileModule('src/shell/messages/conversation/ConversationView.tsx', {
  '../../../i18n/ui/useUI':ui, '../../../ui':controls,
  '../../../lib/im/client':dataModule('export class ImApiError extends Error {}'),
  '../../../lib/im/people-api':dataModule('export function conversationDisplayTitle(c){return c.title;} export function visiblePersonName(p){return p.display_name||"";}'),
  '../../../lib/im/messages-api':dataModule(`export const messagesApi={
    async me(){return {profile:{user_id:'viewer'}};},
    async getConversation(){return {id:'current',kind:'group',title:'Conversation',members:[],member_count:1,my_role:'member',unread_count:0};},
    async profiles(){return [];},async markRead(){},async sendMessage(){}
  };`),
  '../../../lib/im/inbox-api':dataModule('export function fetchConversations(){return globalThis.__utForwardRequest();}'),
  '../../nav-source/route-boundary':dataModule('export function RoutePageSkeleton(){return null;}'),
  '../composer/Composer':dataModule('export function Composer(){return null;}'),
  '../host-state':dataModule('export function openMessages(){}'),
  '../messages-surface':dataModule('export function ImBackIcon(){return null;} export function ImInfoIcon(){return null;} export function ImSearchIcon(){return null;}'),
  '../search/SearchView':dataModule('export function SearchView(){return null;}'),
  '../people/ProfileCard':dataModule('export function ProfileCard(){return null;}'),
  '../report/ReportDialog':dataModule('export function ReportDialog(){return null;}'),
  '../realtime/hooks':dataModule('export function useImEvent(){} export function useImResync(){} export function usePresence(){return {};}'),
  './MessageList':dataModule(`import {createElement as h} from ${JSON.stringify(reactUrl)};
    export function MessageList(p){return h('button',{type:'button','data-ut-forward':'',onClick:()=>p.handlers.onForward({id:'message',kind:'text',body:'hello'})},'Forward message');}
    export function useStoreEvents(){}
  `),
  './MessageItem':dataModule('export function useMessageHandlers(options){return options;}'),
  './PinnedBar':dataModule('export function PinnedBar(){return null;}'),
  './TypingLine':dataModule('export function TypingLine(){return null;} export function useTypingUsers(){return [];}'),
  './conversation-store':dataModule(`
    const snapshot={messages:[],pins:[],loaded:true,hasMoreAfter:false};
    const store={subscribe(){return ()=>{};},getSnapshot(){return snapshot;},loadLatest(){},refreshPins(){},catchUp(){},async loadAround(){},find(){return null;},togglePin(){},recall(){}};
    export function getConversationStore(){return store;} export function unreadBoundary(){return null;}
  `),
  '../call/chat':dataModule(`export function CallButton(){return null;} export function CallChatProvider(p){return p.children;}
    export function callMetaOf(){return null;} export function callMetaUserIds(){return [];}
    export function removalReasonFor(){return null;} export function useEndedCallIndex(){return ()=>undefined;}
  `),
}));
const allowance = {enabled:true,currency:'USD',monthly_cap_minor:10000,max_hourly_minor:null,max_servers:null,committed_minor:1000,remaining_minor:9000};
const catalog = {recommended_region_id:'region-1',regions:[{id:'region-1',label:'Region 1'}],tiers:[{id:'tier-1',label:'Tier 1',available:true}],disk:{min_gb:20,max_gb:500,step_gb:10}};
const offers = {bandwidth_mbps:1,offers:[{billing_mode:'pay_as_you_go',available:true,price:{amount_minor:1,currency:'USD'},commitment_minor:744}]};
const noop = () => {};
async function settle(){for(let i=0;i<4;i++) await act(async()=>{});}
async function mounted(Component,props,run){
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  const errors=[];const oldError=console.error;console.error=(...args)=>errors.push(args.map(String).join(' '));
  const view={host,async render(locale='en'){
    await act(async()=>root.render(React.createElement(LocaleContext.Provider,{value:locale},React.createElement(Component,props))));
    await settle();
  }};
  try {await view.render();await run(view);}
  finally {await act(async()=>root.unmount());host.remove();console.error=oldError;delete globalThis.__utEffectRequest;delete globalThis.__utForwardRequest;}
  assert.deepEqual(errors,[],'mounted components must not emit console.error');
}
async function churn(view){await view.render();await view.render();await view.render('fr');}
async function input(element,value){
  await act(async()=>{
    const proto=element.tagName==='SELECT'?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(element,value);
    element.dispatchEvent(new window.Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));
  });await settle();
}
// A regressed effect can otherwise run forever on resolved promises. Cap only
// the fixture transport; assertions still require the exact intended count.
function bounded(value){let count=0;return {get count(){return count;},async read(){if(++count>8) throw Error('fixture request limit');return typeof value==='function'?value():structuredClone(value);}};}

test('purchased Library items fetch once and translate only the fallback title on a language switch',async()=>{
  const request=bounded({items:[
    {listing_id:'untitled',entitled:true,updateAvailable:false,libraryIdentity:{id:'one',kind:'artifact'}},
    {listing_id:'titled',title:'来自 LeoBay',entitled:true,updateAvailable:false,libraryIdentity:{id:'two',kind:'artifact'}},
  ]});
  globalThis.__utEffectRequest=()=>request.read();
  await mounted(LibraryPurchasedUpdates,{items:[],onUpdated:noop},async view=>{
    assert.equal(request.count,1);
    assert.equal(view.host.querySelector('a').textContent,'en:来自 LeoBay');
    await churn(view);
    assert.equal(request.count,1,'translator identity and locale must not refetch purchases');
    assert.equal(view.host.querySelector('a').textContent,'fr:来自 LeoBay');
    assert.equal(view.host.querySelectorAll('a')[1].textContent,'来自 LeoBay','a seller title is content, even when it matches a translation key');
  });
});

test('computer import loads once and preserves the chosen computer across translator changes',async()=>{
  const request=bounded({items:[{id:'one',name:'Mac'},{id:'two',name:'PC'}]});
  globalThis.__utEffectRequest=()=>request.read();
  await mounted(LibraryImportDialog,{mode:'computer',onClose:noop,onImported:noop},async view=>{
    assert.equal(request.count,1);
    await input(view.host.querySelector('select'),'two');
    await input(view.host.querySelector('input'),'/work/project');
    await churn(view);
    assert.equal(request.count,1,'editing and locale changes must not reload computers');
    assert.equal(view.host.querySelector('select').value,'two');
    assert.equal(view.host.querySelector('input').value,'/work/project');
    assert.match(view.host.querySelector('h2').textContent,/^fr:/);
  });
});

test('GitHub import loads repositories once while typing and changing language',async()=>{
  const request=bounded({connected:true,repositories:[{full_name:'owner/repo',html_url:'https://github.com/owner/repo',private:true}]});
  globalThis.__utEffectRequest=()=>request.read();
  await mounted(LibraryImportDialog,{mode:'github',onClose:noop,onImported:noop},async view=>{
    await input(view.host.querySelector('input'),'https://github.com/owner/another');
    await churn(view);
    assert.equal(request.count,1);
    assert.equal(view.host.querySelector('input').value,'https://github.com/owner/another');
    assert.match(view.host.querySelector('select').textContent,/owner\/repo/);
  });
});

test('import load failure translates at render without retrying on a language switch',async()=>{
  let reads=0;globalThis.__utEffectRequest=async()=>{reads++;throw null;};
  await mounted(LibraryImportDialog,{mode:'computer',onClose:noop,onImported:noop},async view=>{
    assert.match(view.host.querySelector('[role=alert]').textContent,/^en:加载失败，请重试/);
    await churn(view);
    assert.equal(reads,1);
    assert.match(view.host.querySelector('[role=alert]').textContent,/^fr:加载失败，请重试/);
    assert.doesNotMatch(view.host.querySelector('[role=alert]').textContent,/fr:en:/,'errors must not store already translated fallback text');
  });
});

test('server allowance loads once and preserves edited budget across translator changes',async()=>{
  const request=bounded(allowance);const client={getServerAllowance:()=>request.read()};
  await mounted(ServerBudgetPanel,{client,onPurchased:noop},async view=>{
    assert.equal(request.count,1);
    await input(view.host.querySelector('input'),'230.50');
    await churn(view);
    assert.equal(request.count,1,'renders must not reload and overwrite the budget form');
    assert.equal(view.host.querySelector('input').value,'230.50');
    assert.match(view.host.querySelector('h3').textContent,/^fr:/);
  });
});

test('server allowance fallback error changes language without refetching',async()=>{
  let reads=0;const client={getServerAllowance:async()=>{reads++;throw null;}};
  await mounted(ServerBudgetPanel,{client,onPurchased:noop},async view=>{
    assert.equal(view.host.querySelector('[role=alert]').textContent,'en:预算读取失败');
    await churn(view);
    assert.equal(reads,1);
    assert.equal(view.host.querySelector('[role=alert]').textContent,'fr:预算读取失败');
  });
});

test('purchase catalog and offers have bounded loads while fields and language change',async()=>{
  const catalogs=bounded(catalog);const quotes=bounded(offers);
  const client={getCatalog:()=>catalogs.read(),getServerOffers:()=>quotes.read()};
  await mounted(BudgetServerPurchase,{client,allowance,onPurchased:noop},async view=>{
    assert.equal(catalogs.count,2,'initial default region resolution performs one follow-up catalog load');
    assert.equal(quotes.count,1);
    await input(view.host.querySelector('input'),'My server');
    await churn(view);
    assert.equal(catalogs.count,2);
    assert.equal(quotes.count,1);
    assert.equal(view.host.querySelector('input').value,'My server');
    assert.match(view.host.textContent,/fr:预算预留/);
  });
});

for(const failure of ['catalog','offers']) test(`purchase ${failure} fallback error changes language without repeated requests`,async()=>{
  let catalogs=0,quotes=0;
  const client={getCatalog:async()=>{if(++catalogs>8||failure==='catalog') throw null;return structuredClone(catalog);},getServerOffers:async()=>{quotes++;throw null;}};
  await mounted(BudgetServerPurchase,{client,allowance,onPurchased:noop},async view=>{
    assert.equal(view.host.querySelector('[role=alert]').textContent,'en:报价读取失败');
    await churn(view);
    assert.equal(catalogs,failure==='catalog'?1:2);
    assert.equal(quotes,failure==='catalog'?0:1);
    assert.equal(view.host.querySelector('[role=alert]').textContent,'fr:报价读取失败');
  });
});

const attachment={key:'notes',id:'notes',source:'creation',title:'notes.txt',kind:'file',siteId:'oceanleo',favorite:false,url:'https://storage.test/notes.txt',meta:{filename:'notes.txt',mime:'text/plain',attachment_preview:true}};
test('text attachment fetches once across translator changes and keeps signed storage credential isolation',async()=>{
  const oldFetch=globalThis.fetch;const requests=[];
  globalThis.fetch=async(url,init)=>{requests.push({url,init});if(requests.length>8) throw Error('fixture request limit');return new Response('Saved file body');};
  try {await mounted(AttachmentFileViewer,{item:attachment},async view=>{
    assert.equal(view.host.querySelector('pre').textContent,'Saved file body');
    await churn(view);
    assert.equal(requests.length,1);
    assert.equal(requests[0].init.credentials,'omit');
    assert.equal(requests[0].init.referrerPolicy,'no-referrer');
    assert.equal(view.host.querySelector('pre').textContent,'Saved file body');
  });} finally {globalThis.fetch=oldFetch;}
});

test('attachment fallback error changes language without fetching again',async()=>{
  const oldFetch=globalThis.fetch;let reads=0;
  globalThis.fetch=async()=>{reads++;return new Response(null,{status:404});};
  try {await mounted(AttachmentFileViewer,{item:attachment},async view=>{
    assert.match(view.host.textContent,/en:文件读取失败/);
    await churn(view);
    assert.equal(reads,1);
    assert.match(view.host.textContent,/fr:文件读取失败/);
    assert.doesNotMatch(view.host.textContent,/fr:en:/);
  });} finally {globalThis.fetch=oldFetch;}
});

for(const failure of [false,true]) test(`forward target ${failure?'error':'list'} loads once across translator changes`,async()=>{
  const request=bounded(()=>{if(failure) throw Error('offline');return {items:[{id:'target',title:'Target conversation'}]};});
  globalThis.__utForwardRequest=()=>request.read();
  await mounted(ConversationView,{conversationId:'current',layout:'docked'},async view=>{
    assert.equal(request.count,0,'forward targets load only when forwarding is opened');
    await act(async()=>view.host.querySelector('[data-ut-forward]').click());await settle();
    assert.equal(request.count,1);
    if(failure) assert.match(view.host.querySelector('[role=dialog]').textContent,/en:暂时无法加载会话列表。/);
    else assert.match(view.host.querySelector('[role=dialog]').textContent,/Target conversation/);
    await churn(view);
    assert.equal(request.count,1,'locale and render changes must not refetch forward targets');
    if(failure) assert.match(view.host.querySelector('[role=dialog]').textContent,/fr:暂时无法加载会话列表。/);
    assert.match(view.host.querySelector('[role=dialog] h3').textContent,/^fr:/);
  });
});

const recovery=new Map();
globalThis.__utEffectRecovery=recovery;
globalThis.__utEffectToken='test-owner';
const library=await import(await compileModule('src/lib/library-uploads.ts',{
  './auth/client':dataModule('export async function accessToken(){return globalThis.__utEffectToken;}'),
  './auth/config':dataModule('export const GATEWAY_BASE="https://gateway.test";'),
  '../shell/advanced-recovery-store':dataModule(`
export async function readAdvancedRecovery(key){return globalThis.__utEffectRecovery.get(key)||null;}
export async function writeAdvancedRecovery(row){globalThis.__utEffectRecovery.set(row.key,row);}
export async function deleteAdvancedRecovery(key){globalThis.__utEffectRecovery.delete(key);}
`),
}));

test('Library gateway includes credentials, requires a token, and keeps signed storage isolated',async()=>{
  const oldFetch=globalThis.fetch;const requests=[];const signal=new AbortController().signal;
  const json=value=>new Response(JSON.stringify(value),{status:200});
  globalThis.fetch=async(url,init)=>{
    requests.push({url:String(url),init});
    if(String(url)==='https://storage.test/signed') return new Response(null,{status:200,headers:{ETag:'part-1'}});
    if(String(url).endsWith('/v1/library/uploads')) return json({uploadId:'one',method:'PUT',partSize:100,url:'https://storage.test/signed',headers:{'x-signature':'storage-grant'}});
    if(String(url).endsWith('/complete')) return json({file:{id:'artifact',artifact_id:'artifact',url:''}});
    return json({items:[]});
  };
  try {
    await library.libraryRequest('/v1/computers',undefined,signal);
    await library.libraryRequest('/v1/folders',{title:'Folder'},signal);
    assert.equal(requests[0].init.credentials,'include');
    assert.equal(requests[0].init.headers.Authorization,'Bearer test-owner');
    assert.equal(requests[0].init.signal,signal);
    assert.equal(requests[1].init.credentials,'include');
    assert.equal(requests[1].init.method,'POST');
    assert.equal(requests[1].init.body,JSON.stringify({title:'Folder'}));
    globalThis.__utEffectToken=null;
    await assert.rejects(library.libraryRequest('/v1/computers'),error=>error.status===401);
    assert.equal(requests.length,2,'missing account token must fail before fetch');
    globalThis.__utEffectToken='test-owner';
    const file=await library.uploadLibraryFile(new File(['private bytes'],'ut-credentials.txt',{lastModified:1}));
    assert.equal(file.artifact_id,'artifact');
    const storage=requests.find(request=>request.url==='https://storage.test/signed');
    assert.ok(Boolean(storage),'file bytes must go directly to signed storage');
    assert.equal(storage.init.credentials,'omit');
    assert.equal(storage.init.headers.Authorization,undefined);
    assert.equal(storage.init.headers['x-signature'],'storage-grant');
    assert.ok(requests.filter(request=>request.url.startsWith('https://gateway.test')).every(request=>request.init.credentials==='include'));
  } finally {globalThis.fetch=oldFetch;delete globalThis.__utEffectToken;delete globalThis.__utEffectRecovery;localStorage.clear();recovery.clear();}
});
