import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { W4_SIDEBAR_STUBS } from "./helpers/w4-sidebar-stubs.mjs";
import "./helpers/w1-jsdom-window.mjs";
const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.CustomEvent = window.CustomEvent;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globalThis.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
window.HTMLElement.prototype.scrollTo = function(){};
window.HTMLElement.prototype.scrollIntoView = function(){};
window.matchMedia = () => ({matches:true, addEventListener(){},removeEventListener(){}});
const { createRoot } = await import("react-dom/client");
const uiStub = dataModule("const tt = (v) => v; export function useUI(){ return tt; }\n");

// One shared session context for the provider stub and the hook stub.
const sessionCtxUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export const Ctx = React.createContext(null);
  export function useOptionalWorkspaceSession(){ return React.useContext(Ctx); }
  export function useWorkspaceSession(){ return React.useContext(Ctx); }
`);
const sessionProviderUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  import { Ctx } from ${JSON.stringify(sessionCtxUrl)};
  export function WorkspaceSessionProvider({ children, siteId, appId }) {
    const [taskId, setTaskId] = React.useState(null);
    const value = React.useMemo(() => ({
      siteId, appId, taskId, session: { id: "sess_1" },
      bindTask: async (id) => { (globalThis.__binds ||= []).push(id); setTaskId(id); return { id: "sess_1" }; },
    }), [siteId, appId, taskId]);
    return React.createElement("div", { "data-session-provider": appId },
      React.createElement(Ctx.Provider, { value }, children));
  }
`);
const panelStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  const panel = (name) => jsx("div", { "data-live-panel": name });
  export function NavigatorGuide(){ return panel("template"); }
  export function MaterialLibrary(){ return panel("materials"); }
  export function MyLibrary(){ return panel("mine"); }
  export function CloudBrowserPanel(){ return panel("browser"); }
  export function WorkspaceLibrary({ entries = [], openEntryId, onDetailOpenChange }){
    const entry = entries.find((candidate) => candidate.id === openEntryId) || null;
    if (!entry) return panel("preview");
    return jsx("button", {
      "data-entry-canvas": entry.libraryItem?.id || "",
      "data-entry-url": entry.libraryItem?.url || "",
      onClick: () => onDetailOpenChange?.(false),
    });
  }
  export function workspaceEntryFromLibraryItem(item, extra = {}){ return { id: item.key, title: item.title, libraryItem: item, ...extra }; }
  export function AdvancedContentWorkbench({ item }){
    React.useEffect(() => { globalThis.__editorMounts = (globalThis.__editorMounts || 0) + 1; }, []);
    return jsx("div", { "data-editor": item.id });
  }
  export function WorkspaceEntryCanvas({ entry, onClose }){
    return jsx("button", { "data-entry-canvas": entry.libraryItem?.id || "", "data-entry-url": entry.libraryItem?.url || "", onClick: onClose });
  }
`);
const OVERRIDES = {
  ...W4_SIDEBAR_STUBS,
  "./artifact-client": dataModule("export async function prepareArtifactForAction(action,item){ return globalThis.__w4Prepare ? globalThis.__w4Prepare(action,item) : {ok:true,data:item}; }"),
  "../i18n/ui/useUI": uiStub,
  "./SplitWorkspace": dataModule(
    "export function useRightPaneSlot(){ return null; }\nexport function useWorkspacePane(){ return null; }\nexport function SplitWorkspace(){ return null; }\n",
  ),
  "./guide-context": dataModule("export function useFunctionGuide(){ return null; }\n"),
  "./NavigatorGuide": panelStub,
  "./MaterialLibrary": panelStub,
  "./MyLibrary": panelStub,
  "./CloudBrowserPanel": panelStub,
  "./WorkspaceLibrary": panelStub,
  "./AdvancedContentWorkbench": panelStub,
  "./WorkspaceEntryCanvas": panelStub,
  "./workspace-session-context": sessionCtxUrl,
  "./WorkspaceSession": sessionProviderUrl,
  "./workbench-routes": dataModule(
    "export function editorCapabilityFor(item){ return { available: item?.meta?.editable === true }; }\n",
  ),
  "./advanced-session": dataModule(
    "export function advancedRootItemId(item){ return String(item?.id || 'item'); }\n" +
      "export function inlineEditorItemsFromSession(){ return []; }\n" +
      "export function savedEditorRevisionTransition(){ return { ok: true, durableCommit: true }; }\n",
  ),
  "./workbench-material-provider": dataModule(
    "const actions = [];\nexport function useWorkbenchMaterialActions(){ return { actions, perform(){}, canPerform(){ return false; }, availability: {}, beginMaterialDrag(){}, endMaterialDrag(){} }; }\n",
  ),
  "./legacy-workspace-surface-adapter": dataModule(
    "export function adaptLegacyWorkspaceSurfaceTabs(){ return { groups: { template: [], preview: [], materials: [], mine: [], browser: [] } }; }\n" +
      "export function legacyWorkspaceEntry(tab){ return { id: tab.id, title: tab.label || tab.id, libraryItem: tab.libraryItem }; }\n",
  ),
  "./workspace-surface-model": dataModule(
    "export function buildWorkspaceSurfaceModel(tabs){ return { tabs }; }\n" +
      "export function workspaceSurfaceCallerId(_m, id){ return id; }\n" +
      "export function workspaceSurfacePrimaryTab(){ return null; }\n" +
      "export function workspaceSurfaceSlotForId(_m, id, fallback){ return fallback(id); }\n",
  ),
  "./bay/shell/bay-state": dataModule("export function useBayEnabled(){ return true; }\nexport function attachBayDeepLinks(){ return () => {}; }\n"),
  "./bay/panel": dataModule("export function BayPanel(){ return null; }\n"),
  "./leochat/LeoChatPanel": dataModule("export function LeoChatPanel(){ return null; }\n"),
  "../lib/im/client": dataModule("export function useImEnabled(){ return true; }\n"),
  "./messages/realtime/hooks": dataModule("export function useImUnread(){ return null; }\n"),
  "./bay/shell/bay-icons": dataModule("export function BayIcon(){ return null; }\n"),
};

const hostStub = dataModule(`
 import React from ${JSON.stringify(reactUrl)};
 let state = {view:'inbox', conversationId:null}; const listeners=new Set();
 const update=(next)=>{ state={...state,...next}; for(const listener of listeners)listener(); };
 const host={
   showConversation(id){update({view:'inbox',conversationId:id});},
   setView(view){update({view,conversationId:null});},
   claimSurface(surface){globalThis.__surface=surface;return ()=>{globalThis.__surface=null;};},
   clearInvite(){}
 };
 export function hostState(){return host;}
 export function useMessagesHost(){return React.useSyncExternalStore(fn=>{listeners.add(fn);return ()=>listeners.delete(fn)},()=>state,()=>state);}
 export function isSubView(v){return ['notices','notice-detail','cases'].includes(v);}
 export function tabOfView(v){return v==='people'?'people':'inbox';}
`);
const leaf = dataModule(`import React from ${JSON.stringify(reactUrl)};
export function Inbox(){return React.createElement('input',{'data-inbox-search':true});}
export function PeopleView(){return React.createElement('input',{'data-people-search':true});}
export function ConversationView({onBack}){return React.createElement('button',{'data-conversation':true,onClick:onBack},'Back');}
export function DealConversationView({onBack}){return React.createElement('button',{onClick:onBack},'Back');}
export function MessagesSubView(){return React.createElement('div',{'data-notices':true});}
export function ConversationInfoPanel(){return null;}
export function NewConversationDialog(){return null;}
export function InviteAcceptDialog(){return null;}
`);
const aliases={...OVERRIDES,
 './HistoryMasterDetail':dataModule(`import React from ${JSON.stringify(reactUrl)}; export function HistoryInlineList(){ return React.createElement('div',{'data-shared-task-list':true},'Shared tasks'); }`),
 'next/navigation':dataModule(`export function useRouter(){ return {push(href){(globalThis.__taskRoutes ||= []).push(href);}}; }`),
 './workspace-panels/registry':dataModule('export function getWorkspacePanel(){return function Panel(){return null;};}'),
 './messages/host-state':hostStub,
 './SplitWorkspace': undefined,
 '../lib/auth/client':dataModule('export async function accessToken(){return null;}'),
 '../lib/im/client':dataModule('export function useImEnabled(){return true;} export class ImApiError extends Error{}'),
 './messages/messages-surface':dataModule('export function ensureMessagesSurfaceStyles(){}'),
 './messages/notices/use-notices':dataModule('export function useLeoChatUnread(){return {total:85,requests:0};}'),
 './messages/call/incoming/deep-link':dataModule('export function consumeCallDeepLink(){}'),
 './messages/Inbox':leaf, './messages/people/PeopleView':leaf,
 './messages/conversation/ConversationView':leaf,'./bay/deal':leaf,
 './messages/notices/MessagesSubView':leaf,
 './messages/groups/ConversationInfoPanel':leaf,'./messages/groups/NewConversationDialog':leaf,
 './messages/invite/InviteAcceptDialog':leaf,
 './EditBarDockHost':dataModule('export function EditBarDockHost(){return null;}'),
};
delete aliases['./SplitWorkspace'];
const splitUrl=await compileModule('src/shell/SplitWorkspace.tsx',aliases);
aliases['./SplitWorkspace']=splitUrl;
const canvasUrl=await compileModule('src/shell/ResultCanvas.tsx',aliases);
aliases['./ResultCanvas']=canvasUrl;
const bodyUrl=await compileModule('src/shell/leochat/leochat-body.tsx',{
 '../../i18n/ui/useUI':uiStub,
 '../messages/host-state':hostStub,
 '../bay/deal':leaf,
 '../messages/Inbox':leaf,'../messages/people/PeopleView':leaf,
 '../messages/conversation/ConversationView':leaf,
 '../messages/notices/MessagesSubView':leaf,
 '../messages/groups/ConversationInfoPanel':leaf,'../messages/groups/NewConversationDialog':leaf,
 '../messages/invite/InviteAcceptDialog':leaf,
});
const shellUrl=await compileModule('src/shell/TaskWorkspaceShell.tsx',aliases);
const {LeoChatPage}=await import(await compileModule('src/shell/leochat/LeoChatPage.tsx',{
 '../../i18n/ui/useUI':uiStub,
 '../../lib/auth/client':dataModule('export async function accessToken(){return null;}'),
 '../../lib/im/client':aliases['../lib/im/client'],
 '../messages/host-state':hostStub,
 '../messages/messages-surface':aliases['./messages/messages-surface'],
 '../messages/notices/use-notices':aliases['./messages/notices/use-notices'],
 '../messages/call/incoming/deep-link':aliases['./messages/call/incoming/deep-link'],
 '../bay/shell/bay-state':dataModule('export function setBaySiteKey(){}'),
 '../bay/shell/BayMine':dataModule('export function BaySignInPrompt(){return null;}'),
 '../TaskWorkspaceShell':shellUrl,'../SplitWorkspace':splitUrl,
 './leochat-body':bodyUrl,
}));
const {hostState}=await import(hostStub);
const {dispatchWorkspaceAction,workspaceActionForHref,openWorkspaceHref,WORKSPACE_ACTION_EVENT}=await import('../src/shell/workspace-actions.ts');
const {renderMessageBody}=await import('../src/shell/messages/conversation/message-format.ts');
async function mount(element){
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
 await act(async()=>root.render(element));
 return {container,async close(){await act(()=>root.unmount());container.remove();}};
}
const click=async(el)=>{assert.ok(el);const event=new window.MouseEvent('click',{bubbles:true,cancelable:true});await act(()=>el.dispatchEvent(event));return event;};

test('LeoChat uses the full task board, list title/tabs, and a single chat side while the sidebar is open',async()=>{
 const m=await mount(React.createElement(LeoChatPage,{siteKey:'oceanleo'}));
 assert.equal(globalThis.__surface,'page');
 const board=m.container.querySelector('[data-workspace-split]');assert.ok(board);
 assert.ok(board.className.includes('p-1.5'));assert.ok(board.className.includes('bg-[var(--bg,#faf8f5)]'));
 assert.equal(m.container.querySelector('[data-leochat-page] > header'),null);
 assert.ok(m.container.querySelector('[data-leochat-list] [data-leochat-list-header] h1'));
 assert.ok(m.container.querySelector('[data-leochat-list-header]').textContent.includes('85'));
 const list=m.container.querySelector('[data-leochat-list]');assert.ok(list.querySelector('input'));
 assert.ok(list.querySelector('[data-leochat-list-header]').compareDocumentPosition(list.querySelector('input')) & window.Node.DOCUMENT_POSITION_FOLLOWING);
 assert.ok(m.container.querySelector('[data-leochat-thread]'));
 await click(m.container.querySelector('button[title="展开"]'));
 assert.equal(m.container.querySelector('[data-leochat-body]').dataset.leochatBody,'narrow');
 assert.ok(m.container.querySelector('[data-leochat-list]'));assert.equal(m.container.querySelector('[data-leochat-thread]'),null);
 assert.equal(m.container.querySelector('[data-workspace-home] [data-workspace-card="leochat"]'),null);
 assert.equal(m.container.querySelector('[data-workspace-home]').textContent.includes('LeoChat'),false);
 await act(()=>hostState().showConversation('chat-1'));
 assert.equal(m.container.querySelector('[data-leochat-list]'),null);assert.ok(m.container.querySelector('[data-leochat-thread]'));
 await click(m.container.querySelector('button[aria-label="关闭右侧面板"]'));
 assert.equal(m.container.querySelector('[data-leochat-body]').dataset.leochatBody,'wide');
 assert.ok(m.container.querySelector('[data-leochat-list]'));assert.ok(m.container.querySelector('[data-leochat-thread]'));
 await act(()=>dispatchWorkspaceAction({nonce:'ignored-chat',action:{version:2,tab:'leochat'}}));
 assert.equal(m.container.querySelector('[data-workspace-pane="main"]').dataset.workspacePaneState,'closed');
 assert.equal(m.container.querySelector('[data-workspace-view]').dataset.workspaceView,'home');
 const detail={handled:false};await act(()=>window.dispatchEvent(new window.CustomEvent('oceanleo:leochat-panel-request',{detail})));
 assert.equal(detail.handled,true);assert.equal(m.container.querySelector('[data-workspace-panel="leochat"]'),null);
 await m.close();assert.equal(globalThis.__surface,null);
});

test('message family links open this page sidebar without navigating; outside URLs retain a new tab',async()=>{
 const m=await mount(React.createElement(LeoChatPage,{siteKey:'oceanleo'}));
 const text=await mount(React.createElement('div',null,...renderMessageBody('https://oceanbizs.com/projects/project-1 https://example.org/article')));
 const [own,outside]=text.container.querySelectorAll('a');
 assert.equal(own.getAttribute('target'),null);assert.equal(outside.getAttribute('target'),'_blank');
 const before=window.location.href;const event=await click(own);assert.equal(event.defaultPrevented,true);assert.equal(window.location.href,before);
 assert.equal(m.container.querySelector('[data-workspace-pane="main"]').dataset.workspacePaneState,'open');
 assert.equal(m.container.querySelector('[data-workspace-view]').dataset.workspaceView,'projects');
 await text.close();await m.close();
});

test('destination mapping keeps material/listing/revision, Library and managed-page identities; excludes user content and lookalike hosts',()=>{
 const resolve=(href)=>workspaceActionForHref(href,'https://oceanleo.com');
 assert.deepEqual(resolve('/bay?listingId=seller-1'),{version:1,tab:'bay',url:'https://oceanleo.com/bay?listingId=seller-1',view:'materials',itemId:'listing:seller-1',revisionId:undefined});
 assert.equal(resolve('/bay?asset=library:cover-1').itemId,'library:cover-1');
 assert.equal(resolve('/library?item=art-1&revisionId=rev-2').revisionId,'rev-2');
 assert.equal(resolve('/s/image/library?item=art-1').itemId,'art-1');
 assert.equal(resolve('https://music.oceanleo.cn/settings/privacy').section,'privacy');
 assert.equal(resolve('/devices?deviceId=device-1').deviceId,'device-1');
 for(const href of ['https://oceanleo.app/library?item=evil','https://oceanleo.com.evil.org/library?item=evil','javascript:alert(1)','https://example.org/library?item=x'])assert.equal(resolve(href),null);
});

const {ArtifactCardView}=await import(await compileModule('src/shell/messages/conversation/ArtifactCardView.tsx',{
 '../../../i18n/ui/useUI':uiStub,
 '../../../lib/im/messages-api':dataModule('export const messagesApi={coeditPresence(){throw new Error("network must not run");}};'),
 '../../../lib/im/client':dataModule('export class ImApiError extends Error{}'),
 './AttachmentView':dataModule('export function safeMediaUrl(){return null;}'),
}));
const {BayOrderCard}=await import(await compileModule('src/shell/bay/orders/BayOrderCard.tsx',{
 '../../../i18n/ui/useUI':uiStub,
 './order-store':dataModule('export function useBayOrder(){return {order:null,error:null,loading:false};} export function useBayPaymentsGate(){return {};}'),
 '../shell/bay-state':dataModule('export function openBay(target){globalThis.__bayOrderNavigation=target;}'),
}));

test('artifact cards open the sidebar; order cards use Bay navigation when Bay is omitted',async()=>{
 const page=await mount(React.createElement(LeoChatPage,{siteKey:'oceanleo'}));
 const cards=await mount(React.createElement('div',null,
   React.createElement(ArtifactCardView,{card:{type:'artifact',id:'artifact-1',title:'Report',open_path:'https://music.oceanbizs.com/library?item=artifact-1&revisionId=revision-2'}}),
   React.createElement(BayOrderCard,{contractId:'order-1',compact:true})));
 const received=[];const receive=(event)=>received.push(event.detail.action);
 window.addEventListener(WORKSPACE_ACTION_EVENT,receive);
 const before=window.location.href;const artifact=cards.container.querySelector('a');
 assert.equal(artifact.getAttribute('target'),null);
 assert.equal((await click(artifact)).defaultPrevented,true);
 assert.equal(received.at(-1).tab,'mine');assert.equal(received.at(-1).itemId,'artifact-1');assert.equal(received.at(-1).revisionId,'revision-2');
 assert.equal(page.container.querySelector('[data-workspace-view]').dataset.workspaceView,'mine');
 await click(cards.container.querySelector('[data-bay-order-open]'));
 assert.equal(received.at(-1).tab,'bay');assert.equal(new URL(received.at(-1).url).searchParams.get('bay'),'order:order-1');
 assert.equal(page.container.querySelector('[data-workspace-view]').dataset.workspaceView,'mine');
 assert.deepEqual(globalThis.__bayOrderNavigation,{kind:'order',id:'order-1'});
 assert.equal(page.container.querySelector('[data-workspace-panel="bay"]'),null);
 assert.equal(window.location.href,before);
 window.removeEventListener(WORKSPACE_ACTION_EVENT,receive);
 await cards.close();await page.close();
});

const {TaskWorkspaceShell, useTaskWorkspaceState}=await import(shellUrl);
test('task hosts keep their LeoChat card and can open message content in that same sidebar',async()=>{
 function TaskHost(){const state=useTaskWorkspaceState();return React.createElement(TaskWorkspaceShell,{state,tabs:[],left:'Task',canvas:{siteId:'oceanleo'}});}
 const page=await mount(React.createElement(TaskHost));
 assert.ok(page.container.querySelector('[data-workspace-card="leochat"]'));
 await act(()=>dispatchWorkspaceAction({nonce:'task-chat',action:{version:2,tab:'leochat'}}));
 assert.equal(page.container.querySelector('[data-workspace-pane="main"]').dataset.workspacePaneState,'open');
 assert.equal(page.container.querySelector('[data-workspace-view]').dataset.workspaceView,'leochat');
 const card=await mount(React.createElement(ArtifactCardView,{card:{type:'artifact',id:'task-artifact',title:'Task file',open_path:'/library?item=task-artifact'}}));
 const before=window.location.href;
 assert.equal((await click(card.container.querySelector('a'))).defaultPrevented,true);
 assert.equal(page.container.querySelector('[data-workspace-view]').dataset.workspaceView,'mine');
 assert.equal(window.location.href,before);
 await card.close();await page.close();
});


test('F4: only exact product hosts and default ports route into the workspace',()=>{
 const resolve=(href,origin='https://oceanleo.com')=>workspaceActionForHref(href,origin);
 for(const href of [
   'https://oceanleo.com:443/library?item=x', 'https://slide.oceanleo.com/library?item=x',
   'https://3d.oceanbizs.com/library?item=x','https://e-commerce.oceanleo.cn/library?item=x',
   'https://aitools.oceanleo.com/library?item=x',
 ])assert.equal(resolve(href)?.tab,'mine',href);
 for(const href of [
   'https://unknown.oceanleo.com/library?item=x','https://api.oceanleo.com/library?item=x',
   'https://nested.music.oceanleo.com/library?item=x','https://music-oceanleo.com/library?item=x',
   'https://music.oceanleo.com.evil.org/library?item=x','https://music.oceanleo.com./library?item=x',
   'https://aitools.oceanleo.cn/library?item=x','https://aitools.oceanbizs.com/library?item=x',
   'https://oceanleo.com:444/library?item=x','https://music.oceanleo.com:8443/library?item=x',
   'http://oceanleo.com:8080/library?item=x','http://music.oceanleo.com/library?item=x',
   'https://oceanleo.app/library?item=x','https://ws.oceanleo.app/library?item=x',
   'https://preview.oceanleo.app/library?item=x','https://leoapp.cn/library?item=x',
   'https://person@oceanleo.com/library?item=x',
 ])assert.equal(resolve(href),null,href);
 // Being the caller origin never promotes an unknown/content host or custom port.
 for(const origin of ['https://unknown.oceanleo.com','https://oceanleo.app','https://oceanleo.com:444'])assert.equal(resolve('/library?item=x',origin),null,origin);
 assert.equal(resolve('/library?item=x','http://oceanleo.com:80')?.tab,'mine');
});

test('F4: Library compatibility and merged routes match only their exact supported path shapes',()=>{
 const resolve=(path)=>workspaceActionForHref(path,'https://oceanleo.com');
 for(const path of ['/library/?item=x','/workspace?tab=library&item=x','/workspace/invitation?tab=library&item=x','/s/ppt/library?item=x','/s/threed/bay?listingId=x'])assert.ok(resolve(path),path);
 for(const path of [
   '/unrelated?tab=library&item=x','/?tab=library&item=x','/account/login?tab=library&item=x',
   '/bay/extra?tab=library&item=x','/workspace/app/extra?tab=library&item=x',
   '/workspace/%2F?tab=library&item=x','/library//?item=x','/library/extra?item=x',
   '/history/extra?item=x','/projects/a/extra','/projects/%2F','/projects/a.b',
   '/settings/privacy/extra','/devices/%2F','/browser/extra',
   '/s/unknown/library?item=x','/s/image/s/image/library?item=x','/s/slide/library?item=x',
 ])assert.equal(resolve(path),null,path);
});

test('F4: rejected hosts, ports and unrelated paths remain new-tab links in messages and artifact cards',async()=>{
 const urls=[
   'https://unknown.oceanleo.com/library?item=x',
   'https://oceanleo.com:8443/library?item=x',
   'https://oceanleo.app/library?item=x',
   'https://oceanleo.com/other?tab=library&item=x',
 ];
 const messages=await mount(React.createElement('div',null,...renderMessageBody(urls.join(' '))));
 assert.equal(messages.container.querySelectorAll('a').length,urls.length);
 for(const link of messages.container.querySelectorAll('a'))assert.equal(link.getAttribute('target'),'_blank');
 const cards=await mount(React.createElement('div',null,...[urls[0],urls[1],urls[3]].map((open_path,index)=>React.createElement(ArtifactCardView,{key:index,card:{type:'artifact',id:'x',title:'File',open_path}}))));
 assert.equal(cards.container.querySelectorAll('a').length,3);
 for(const link of cards.container.querySelectorAll('a'))assert.equal(link.getAttribute('target'),'_blank');
 await cards.close();await messages.close();
});


test('F5: a validated LeoDev host routes only its own recognized URLs, retaining all F4 restrictions',()=>{
 const dev='https://p-0123456789abcdef0123456789abcdef.dev.oceanleo.com';
 const other='https://p-abcdef0123456789abcdef0123456789.dev.oceanleo.com';
 for(const href of ['/library?item=owned',`${dev}:443/library?item=owned`])assert.equal(workspaceActionForHref(href,dev)?.tab,'mine',href);
 assert.equal(workspaceActionForHref('/bay?listingId=owned',dev)?.itemId,'listing:owned');
 assert.equal(workspaceActionForHref('/s/ppt/library?item=owned',dev)?.tab,'mine');
 assert.equal(workspaceActionForHref(`${other}/library?item=owned`,dev),null);
 assert.equal(workspaceActionForHref(`${dev}/library?item=owned`,'https://oceanleo.com'),null);
 for(const origin of [
   'https://p-0123456789abcdef0123456789abcde.dev.oceanleo.com',
   'https://p-0123456789abcdef0123456789abcdef0.dev.oceanleo.com',
   'https://p-g123456789abcdef0123456789abcdef.dev.oceanleo.com',
   `${dev}.evil.org`,`${dev}.`,`${dev}:8443`,
   'https://p-0123456789abcdef0123456789abcdef.dev.oceanleo.app',
   'https://nested.p-0123456789abcdef0123456789abcdef.dev.oceanleo.com',
 ])assert.equal(workspaceActionForHref('/library?item=owned',origin),null,origin);
 for(const href of [`${dev}:8443/library?item=owned`,`${dev}/unrelated?tab=library&item=owned`,`${dev}/library/extra?item=owned`])assert.equal(workspaceActionForHref(href,dev),null,href);
});

test('F5: own Library/artifact links open the sidebar; omitted Bay and another preview are not claimed',async()=>{
 const dev='https://p-0123456789abcdef0123456789abcdef.dev.oceanleo.com';
 const other='https://p-abcdef0123456789abcdef0123456789.dev.oceanleo.com';
 const descriptor=Object.getOwnPropertyDescriptor(window,'location');
 Object.defineProperty(window,'location',{configurable:true,value:new URL(`${dev}/leochat`)});
 let page,messages,card;
 try {
   page=await mount(React.createElement(LeoChatPage,{siteKey:'oceanleo'}));
   const before=window.location.href;
   messages=await mount(React.createElement('div',null,...renderMessageBody(`${dev}/library?item=dev-owned ${other}/library?item=other-owned`)));
   const [own,outside]=messages.container.querySelectorAll('a');
   assert.equal(own.getAttribute('target'),null);assert.equal(outside.getAttribute('target'),'_blank');
   assert.equal((await click(own)).defaultPrevented,true);
   assert.equal(page.container.querySelector('[data-workspace-pane="main"]').dataset.workspacePaneState,'open');
   assert.equal(page.container.querySelector('[data-workspace-view]').dataset.workspaceView,'mine');
   card=await mount(React.createElement(ArtifactCardView,{card:{type:'artifact',id:'dev-owned',title:'Dev file',open_path:'/library?item=dev-owned'}}));
   assert.equal(card.container.querySelector('a').getAttribute('target'),null);
   assert.equal((await click(card.container.querySelector('a'))).defaultPrevented,true);
   await act(()=>assert.equal(openWorkspaceHref('/bay?listingId=dev-listing'),false));
   assert.equal(page.container.querySelector('[data-workspace-view]').dataset.workspaceView,'mine');
   const received=[];const record=(event)=>received.push(event.detail);
   window.addEventListener(WORKSPACE_ACTION_EVENT,record);
   try {assert.equal(openWorkspaceHref(`${other}/library?item=other-owned`),false);assert.deepEqual(received,[]);}
   finally {window.removeEventListener(WORKSPACE_ACTION_EVENT,record);}
   assert.equal(window.location.href,before);
 } finally {
   if(card)await card.close();if(messages)await messages.close();if(page)await page.close();
   Object.defineProperty(window,'location',descriptor);
 }
});


test('LS: LeoChat sidebar offers the shared My Tasks list, home creation and return, with no Bay panel',async()=>{
 globalThis.__taskRoutes=[];
 const page=await mount(React.createElement(LeoChatPage,{siteKey:'oceanleo'}));
 try {
   await click(page.container.querySelector('button[title="展开"]'));
   assert.equal(page.container.querySelector('[data-workspace-card="bay"]'),null);
   await click(page.container.querySelector('[data-workspace-card="tasks"]'));
   for(let attempt=0; attempt<30 && !page.container.querySelector('[data-my-tasks-workspace-panel]'); attempt++) {
     await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
   }
   assert.equal(page.container.querySelector('[data-workspace-view]').dataset.workspaceView,'tasks');
   assert.ok(page.container.querySelector('[data-my-tasks-workspace-panel] [data-shared-task-list]'));
   await click(page.container.querySelector('[data-my-tasks-new]'));
   assert.deepEqual(globalThis.__taskRoutes,['/']);
   const locationDescriptor=Object.getOwnPropertyDescriptor(window,'location');
   try {
     Object.defineProperty(window,'location',{configurable:true,value:new URL('https://oceanleo.com/s/image/bay')});
     await click(page.container.querySelector('[data-my-tasks-new]'));
     assert.deepEqual(globalThis.__taskRoutes,['/','/s/image']);
   } finally {Object.defineProperty(window,'location',locationDescriptor);}
   await click(page.container.querySelector('[data-workspace-back]'));
   assert.equal(page.container.querySelector('[data-workspace-view]').dataset.workspaceView,'home');
 } finally {await page.close();}
});

const {LeoBayPage}=await import(await compileModule('src/shell/bay/shell/LeoBayPage.tsx',{
 ...aliases,
 '../../i18n/ui/useUI':uiStub,
 '../../TaskWorkspaceShell':shellUrl,
 '../../SplitWorkspace':splitUrl,
 './bay-state':dataModule(`export function bayEnabledHere(){return true;} export function useBayFilter(){return {kind:'service'};} export function useBaySiteKey(){return 'oceanleo';} export function useBayState(){return {current:{kind:'feed'}};} export function setBaySiteKey(){} export function registerBayPage(){return ()=>{};} export function bayBack(){}`),
 './BayDetail':dataModule('export function BayDetailPane(){return null;} export function bayDetailTitleKey(){return "";}'),
 './BayList':dataModule(`import React from ${JSON.stringify(reactUrl)}; export const BayListingChromeContext=React.createContext({}); export function useBaySearchText(){return {text:'',change(){},commit(){}};} export function openMine(){} export function startPublish(){} export function BayViewSwitch(){return null;} export function BayFeed(){return React.createElement('div',{'data-bay-feed-kept':true});}`),
 '../asset/BayAssetLibrary':dataModule('export function BayAssetLibrary(){return null;}'),
 '../asset/BayArtifactDeepLink':dataModule('export function useBayAssetRoute(){return {target:null};} export function BayArtifactDeepLink(){return null;}'),
 '../needs/LibraryWorkPicker':dataModule('export function LibraryWorkPickerHost(){return null;}'),
 './bay-auth-host':dataModule('export function BayAuthHost(){return null;}'),
 '../apps/BayAppShelf':dataModule('export function BayAppShelf(){return null;}'),
 '../lessons/BayLessonShelf':dataModule('export function BayLessonShelf(){return null;}'),
}));

test('LS: Bay opens the real shared sidebar, browses My Tasks, and keeps its feed mounted',async()=>{
 const page=await mount(React.createElement(LeoBayPage,{siteKey:'oceanleo'}));
 try {
   const feed=page.container.querySelector('[data-bay-feed-kept]');
   assert.ok(feed);
   assert.equal(page.container.querySelector('[data-workspace-pane="main"]').dataset.workspacePaneState,'closed');
   await click(page.container.querySelector('[data-bay-sidebar-toggle]'));
   assert.equal(page.container.querySelector('[data-workspace-pane="main"]').dataset.workspacePaneState,'open');
   assert.equal(page.container.querySelector('[data-workspace-card="bay"]'),null);
   await click(page.container.querySelector('[data-workspace-card="tasks"]'));
   assert.ok(page.container.querySelector('[data-my-tasks-workspace-panel] [data-shared-task-list]'));
   assert.equal(page.container.querySelector('[data-bay-feed-kept]'),feed);
   await click(page.container.querySelector('button[aria-label="关闭右侧面板"]'));
   assert.equal(page.container.querySelector('[data-workspace-pane="main"]').dataset.workspacePaneState,'closed');
   assert.equal(page.container.querySelector('[data-bay-feed-kept]'),feed);
 } finally {await page.close();}
});
