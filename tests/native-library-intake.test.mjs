import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const ui = dataModule("export function useUI(){ return (text,vars) => text.replace(/\\{(\\w+)\\}/g,(all,key)=>String(vars?.[key]??all)); }");
const nil = (name) => dataModule(`export function ${name}(){ return null; }`);
const controller = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  const fileOf=id=>globalThis.__nlFiles.get(id);
  export function useAgentDialog(input){
    const [attachments,setAttachments]=React.useState([]);
    const publish=React.useCallback(()=>setAttachments([...globalThis.__nlNative]),[]);
    globalThis.__nlCommit=publish;
    const addAttachments=React.useCallback(files=>{
      globalThis.__nlHandoffs.push(files);
      for(const file of files.slice(0,Math.max(0,20-globalThis.__nlNative.length))){
        const id='native-'+(++globalThis.__nlId);
        const taken=new Set(globalThis.__nlNative.map(item=>item.name));
        let name=file.name;
        if(taken.has(name)){const dot=name.lastIndexOf('.');name=(dot>0?name.slice(0,dot):name)+'-2'+(dot>0?name.slice(dot):'');}
        const kept=name===file.name?file:new File([file],name,{type:file.type,lastModified:file.lastModified});
        globalThis.__nlFiles.set(id,kept);
        globalThis.__nlNative.push({id,name,mime:kept.type,size:kept.size,state:'uploading',percent:0,...(!input.taskSessionId?{deferred:true}:{})});
      }
      if(!globalThis.__nlHoldCommit)publish();
    },[input.taskSessionId,publish]);
    const removeAttachment=React.useCallback(id=>{
      globalThis.__nlRemoved.push(id);globalThis.__nlFiles.delete(id);
      globalThis.__nlNative=globalThis.__nlNative.filter(item=>item.id!==id);publish();
    },[publish]);
    const retryAttachment=React.useCallback(id=>{
      globalThis.__nlRetries.push(id);
      globalThis.__nlNative=globalThis.__nlNative.map(item=>item.id===id?{...item,state:'uploading',error:undefined}:item);publish();
    },[publish]);
    return {program:'codex',activeSession:'native',programs:[],messages:[],models:[],configOptions:[],commands:[],sessions:[],
      attachments,attachmentFile:fileOf,addAttachments,removeAttachment,retryAttachment,
      busy:false,offline:false,occupancyLink:true,occupancyAt:Date.now(),occupancyBusy:[],occupancyPendingAt:null,occupancyPendingSession:null,
      stopState:'idle',sessionLoading:false,historyReplay:{},reattachSeq:0,restoredDraft:null,
      async send(){globalThis.__nlSends++;return true;},setProgram(){},openSession(){},newSession(){},abort(){}};
  }
`);
const { useNativeThread } = await import(await compileModule("src/shell/native-thread/useNativeThread.ts", {
  "../cloud-computer/agent-dialog/useAgentDialogController": controller,
  "../../i18n/ui/useUI": ui,
  "./NativeModelPicker": nil("nativeModelPickerFor"),
  "../../lib/computer-task-api": dataModule("export async function getComputerTaskTranscript(id){ return {frames:[],session:{id,native_session_id:'native'}}; }"),
  "../native-library-source": dataModule("export function nativeLibrarySourceOf(item){return {...item};}export async function readNativeLibraryFile(item,options){ return globalThis.__nlRead(item,options); }"),
}));
const { LeoComposer } = await import(await compileModule("src/shell/LeoComposer.tsx", {
  "../i18n/ui/useUI": ui,
  "./LeoEntryButton": nil("LeoEntryButton"),
  "./PromptHighlightArea": dataModule(`import React from ${JSON.stringify(reactUrl)}; export const TemplateFillArea=React.forwardRef(p=>React.createElement('textarea',{value:p.value,readOnly:true}));`),
  "./guide-context": dataModule("export function useFillNonce(){return 0;}export function useFillTemplate(){return null;}"),
  "./mobile-native-actions": dataModule("export function useNativeAttachActions(){return [];}export function useNativeHandoffEntry(){return {action:null,panel:null};}export function useNativeTaskNotifications(){}export function requestTaskNotificationsOnce(){}"),
  "./AttachmentStrip": nil("AttachmentStrip"),
  "../lib/upload/use-attachment-intake": dataModule("export function useAttachmentIntake(onFiles){return {emit:onFiles,pending:[],inFlight:[],compressing:false,removePending(){},handlePaste(){}};}"),
  "./workspace-runtime-hydration": dataModule("export function useWorkspaceRuntimeHydration(){return null;}"),
  "./ModelPicker": nil("ModelGroupPicker"), "./PluginsPopover": nil("PluginsPopover"),
  "./PayerSelector": nil("PayerSelector"), "./mcp-apps": nil("ComposerAppsBar"),
  "./cloud-computer/ComputerDock": nil("ComputerDock"),
  "./composer-draft": dataModule("export function useComposerDraft(p){return {attachFiles:p.onAttachFiles,markSubmitted(){}};}"),
  "./composer-max-height": dataModule("export function useComposerMaxHeight(h){return h;}"),
  "./ComposerLibraryPicker": nil("ComposerLibraryPicker"),
  "./composer-skill-slash": dataModule("export function composerSlashAdapter(){}export function useComposerSkillSlash(){return {onKeyDown(){return false;},popover:null};}"),
}));
const source = (id = "artifact-one", revisionId = "revision-one", name = "note.txt") => ({ id, artifactId: id, revisionId, name, mime: "text/plain", mediaType: "doc" });
const bytes = (name = "note.txt") => new File(["private source bytes"], name, { type: "text/plain" });
const gate = () => { let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject}; };
async function flush(){for(let i=0;i<5;i++)await act(async()=>{});}
async function until(check){const end=Date.now()+3000;while(!check()&&Date.now()<end)await act(async()=>new Promise(r=>setTimeout(r,5)));assert.ok(check(),"expected intake transition");}
async function mount({text="typed unsent text",draft=false}={}){
  const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
  function Probe({sessionId='task-one'}){
    const thread=useNativeThread({computer:{id:"computer-one",node_online:true},session:draft?null:{id:sessionId,kind:"acp",program:"codex",native_session_id:"native"},program:"codex",enabled:true});
    globalThis.__nlThread=thread;
    React.useLayoutEffect(()=>{globalThis.__nlFrames.push({disabled:host.querySelector('[data-composer-send]')?.disabled,attachments:thread.composerAttachments.map(a=>({id:a.id,name:a.name,uploading:a.uploading,failed:a.failed}))});});
    return React.createElement(LeoComposer,{value:text,onChange(){},onSubmit(){throw Error("no user prompt allowed");},conversation:{kind:"native",program:"codex"},
      attachments:thread.composerAttachments,onRemoveAttachment:thread.onRemoveAttachment,onRetryAttachment:thread.onRetryAttachment,
      showComputerDock:false,showModelPicker:false,showPlugins:false,showAppsBar:false,showPayerSelector:false});
  }
  await act(async()=>root.render(React.createElement(Probe)));await flush();
  return {host,get thread(){return globalThis.__nlThread;},get send(){return host.querySelector('[data-composer-send]');},async update(sessionId){await act(async()=>root.render(React.createElement(Probe,{sessionId})));},async unmount(){await act(async()=>root.unmount());host.remove();}};
}
// Baseline path is exactly the old native AgentChat/Home await-before-attach
// callback. New source uses the thread's shared synchronous-registration API.
function pick(view,items,attach){
  if(view.thread.onAddAttachments)return view.thread.onAddAttachments(items,attach);
  return Promise.all(items.map(item=>globalThis.__nlRead(item,{}).catch(()=>null))).then(files=>{const ok=files.filter(Boolean);if(ok.length)(attach??view.thread.onAttachFiles)?.(ok);return ok.length===items.length;});
}
async function complete(id,state="done",error){await act(async()=>{globalThis.__nlNative=globalThis.__nlNative.map(item=>item.id===id?{...item,state,percent:100,error}:item);globalThis.__nlCommit();});await flush();}
test.beforeEach(()=>{Object.assign(globalThis,{__nlNative:[],__nlFiles:new Map(),__nlHandoffs:[],__nlRemoved:[],__nlRetries:[],__nlId:0,__nlSends:0,__nlHoldCommit:false,__nlFrames:[],__nlRead:async item=>bytes(item.name)});});

for(const text of ["typed unsent text",""])test(`Library selection fences every committed Send frame through lookup, read, inbox registration and receipt (text=${Boolean(text)})`,async()=>{
  // UC-NONE: committed UI/send scheduling; no server authorization or storage quota is asserted.
  const pending=gate(),calls=[];globalThis.__nlRead=(item,options)=>{calls.push({item,options});return pending.promise;};
  globalThis.__nlHoldCommit=true;const view=await mount({text});let selected;
  try{
    const from=globalThis.__nlFrames.length;
    await act(async()=>{selected=pick(view,[source()]);assert.equal(view.thread.queue(text||"files only"),false,"authoritative pending ref blocks a same-turn queue");assert.equal(await view.thread.send(text),false,"same-turn direct send cannot bypass intake");});
    assert.equal(view.thread.composerAttachments.length,1);assert.equal(view.thread.composerAttachments[0].uploading,true);assert.equal(view.send.disabled,true);
    await act(async()=>pending.resolve(bytes()));await flush();
    assert.equal(globalThis.__nlHandoffs.length,1);assert.equal(view.send.disabled,true,"registration commit is still held");
    await act(async()=>globalThis.__nlCommit());await until(()=>view.thread.composerAttachments.some(a=>a.id==='native-1'));
    assert.equal(view.send.disabled,true,"existing native inbox upload still fences Send");
    assert.ok(globalThis.__nlFrames.slice(from).every(frame=>frame.disabled===true),JSON.stringify(globalThis.__nlFrames.slice(from)));
    await complete('native-1');assert.equal(await selected,true);assert.equal(view.send.disabled,false);assert.equal(globalThis.__nlSends,0);
  }finally{pending.resolve(bytes());await view.unmount();}
});

test("read failure stays visible with Retry/Remove; retry pins the exact private reference",async()=>{
  // [UC-5 §8.5](../../oceandino/docs/architecture/oceanleo-untrusted-content-isolation.md#85-uc-5-新表必须同时有-rls-与配额): private-source retry identity is a client companion, not proof of backend RLS/quota.
  const first=gate(),second=gate(),calls=[];globalThis.__nlRead=(item,options)=>{calls.push({item,options});return calls.length===1?first.promise:second.promise;};
  const view=await mount();try{
    let selected;await act(async()=>{selected=pick(view,[source()]);});
    await act(async()=>first.reject(Error("held source 503")));await flush();
    assert.equal(await selected,false);const failed=view.thread.composerAttachments[0];assert.ok(failed?.failed);assert.match(view.host.textContent,/held source 503|附件读取失败/);assert.equal(view.send.disabled,true);
    await act(async()=>view.thread.onRetryAttachment(failed.id));await until(()=>calls.length===2);
    assert.equal(calls[1].item.artifactId,calls[0].item.artifactId);assert.equal(calls[1].item.revisionId,calls[0].item.revisionId);assert.equal(view.send.disabled,true);
    await act(async()=>second.resolve(bytes()));await until(()=>globalThis.__nlNative.length===1);await complete('native-1');
    assert.equal(view.send.disabled,false);assert.equal(view.thread.composerAttachments.length,1);assert.equal(view.thread.composerAttachments[0].failed,undefined);
    await act(async()=>view.thread.onRemoveAttachment('native-1'));assert.equal(view.thread.composerAttachments.length,0);
  }finally{first.resolve(null);second.resolve(bytes());await view.unmount();}
});

for(const action of ['remove','unmount'])test(`${action} during a held source read aborts only this intake and ignores late bytes`,async()=>{
  // UC-NONE: local lifecycle cancellation; server permissions are unchanged and not exercised.
  const pending=gate(),calls=[];globalThis.__nlRead=(item,options)=>{calls.push(options);return pending.promise;};const view=await mount();let removed=false;
  try{
    await act(async()=>{void pick(view,[source()]);});assert.equal(view.thread.composerAttachments.length,1);
    if(action==='remove')await act(async()=>view.thread.onRemoveAttachment(view.thread.composerAttachments[0].id));else{await view.unmount();removed=true;}
    assert.equal(calls[0].signal.aborted,true);await act(async()=>pending.resolve(bytes()));await flush();
    assert.equal(globalThis.__nlHandoffs.length,0);assert.deepEqual(globalThis.__nlRemoved,[]);
    if(!removed){assert.equal(view.thread.composerAttachments.length,0);assert.equal(view.send.disabled,false);}
  }finally{pending.resolve(bytes());if(!removed)await view.unmount();}
});

test("partial success keeps source order, separate identities and the failed sibling's fence",async()=>{
  // UC-NONE: UI order and partial-failure scheduling within one authorized composer.
  const first=gate(),second=gate();globalThis.__nlRead=item=>item.artifactId==='a'?first.promise:second.promise;const view=await mount();
  try{
    let selected;await act(async()=>{selected=pick(view,[source('a','ra','A.txt'),source('b','rb','B.txt')]);});
    assert.deepEqual(view.thread.composerAttachments.map(a=>a.name),['A.txt','B.txt']);
    await act(async()=>second.resolve(bytes('B.txt')));await flush();assert.equal(globalThis.__nlHandoffs.length,0,'later source cannot overtake an earlier held source');
    await act(async()=>first.reject(Error('A unavailable')));await until(()=>globalThis.__nlNative.length===1);await complete('native-1');
    assert.equal(await selected,false);assert.equal(view.send.disabled,true);assert.equal(view.thread.composerAttachments.length,2);
    const failed=view.thread.composerAttachments.find(a=>a.failed);assert.equal(failed.name,'A.txt');
    await act(async()=>view.thread.onRemoveAttachment(failed.id));assert.equal(view.send.disabled,false);assert.equal(view.thread.composerAttachments[0].name,'B.txt');
  }finally{first.resolve(bytes('A.txt'));second.resolve(bytes('B.txt'));await view.unmount();}
});

test("a retained source retry/remove cannot abort another native local file",async()=>{
  // UC-NONE: in-tab cancellation ownership; this does not assert an RLS/cross-user boundary.
  const pending=gate();globalThis.__nlRead=()=>pending.promise;const view=await mount();try{
    await act(async()=>view.thread.onAttachFiles([bytes('local.txt')]));await complete('native-1');
    await act(async()=>{void pick(view,[source()]);});const pendingId=view.thread.composerAttachments.find(a=>a.uploading).id;
    await act(async()=>view.thread.onRemoveAttachment(pendingId));await act(async()=>pending.resolve(bytes()));await flush();
    assert.deepEqual(globalThis.__nlRemoved,[]);assert.equal(view.thread.composerAttachments[0].name,'local.txt');assert.equal(view.send.disabled,false);
  }finally{pending.resolve(bytes());await view.unmount();}
});

test("native inbox failure delegates retry to its existing byte uploader",async()=>{
  // UC-NONE: existing uploader lifecycle delegation, no authorization grant changes.
  const view=await mount();try{
    await act(async()=>{void pick(view,[source()]);});await until(()=>globalThis.__nlNative.length===1);await complete('native-1','error','inbox rejected');
    assert.equal(view.send.disabled,true);await act(async()=>view.thread.onRetryAttachment('native-1'));assert.deepEqual(globalThis.__nlRetries,['native-1']);
    assert.equal(globalThis.__nlHandoffs.length,1);await complete('native-1');assert.equal(view.send.disabled,false);
  }finally{await view.unmount();}
});

test("draft-native file registration retains existing deferred-upload/queued-first-prompt semantics",async()=>{
  // UC-NONE: offline/draft readiness compatibility, no backend permission or quota assertion.
  const view=await mount({text:'',draft:true});try{
    let selected;await act(async()=>{selected=pick(view,[source()]);});await until(()=>globalThis.__nlNative.length===1);await flush();assert.equal(await selected,true);
    assert.equal(globalThis.__nlNative[0].deferred,true);assert.equal(view.send.disabled,false);
    await act(async()=>assert.equal(view.thread.queue(''),true));assert.equal(globalThis.__nlSends,0);
  }finally{await view.unmount();}
});

test("an existing same-name/size file cannot acknowledge a newly held Library handoff",async()=>{
  // [UC-5 §8.5](../../oceandino/docs/architecture/oceanleo-untrusted-content-isolation.md#85-uc-5-新表必须同时有-rls-与配额): private byte identity stays bound to its selected source; client companion only.
  const view=await mount();try{
    const local=bytes('same.txt');await act(async()=>view.thread.onAttachFiles([local]));await complete('native-1');
    globalThis.__nlHoldCommit=true;let selected;await act(async()=>{selected=pick(view,[source('new-source','new-revision','same.txt')]);});await until(()=>globalThis.__nlNative.length===2);
    assert.equal(view.send.disabled,true);assert.equal(view.thread.composerAttachments.length,2);assert.ok(view.thread.composerAttachments.some(a=>a.id!=='native-1'&&a.uploading));
    assert.equal(globalThis.__nlFiles.get('native-1'),local);assert.notEqual(globalThis.__nlFiles.get('native-2').lastModified,local.lastModified);
    await act(async()=>globalThis.__nlCommit());await flush();assert.equal(await selected,true);assert.equal(view.send.disabled,true);
    await complete('native-2');assert.equal(view.send.disabled,false);await act(async()=>view.thread.onRemoveAttachment('native-2'));
    assert.deepEqual(globalThis.__nlRemoved,['native-2']);assert.equal(view.thread.composerAttachments[0].id,'native-1');
  }finally{await view.unmount();}
});

test("19 existing files plus two resolved Library picks reserves the final inbox slot and shows rejection",async()=>{
  // UC-NONE: this 20-tile client capacity is not a database/storage hard quota or RLS proof.
  const view=await mount();try{
    await act(async()=>view.thread.onAttachFiles(Array.from({length:19},(_,n)=>bytes('local-'+n+'.txt'))));
    await act(async()=>{globalThis.__nlNative=globalThis.__nlNative.map(a=>({...a,state:'done'}));globalThis.__nlCommit();});
    globalThis.__nlHoldCommit=true;let selected;await act(async()=>{selected=pick(view,[source('a','ra','A.txt'),source('b','rb','B.txt')]);});await until(()=>view.thread.composerAttachments.some(a=>a.failed));
    assert.equal(globalThis.__nlNative.length,20);assert.equal(globalThis.__nlHandoffs.length,2,'one local batch and one accepted Library file');
    const rejected=view.thread.composerAttachments.find(a=>a.failed);assert.equal(rejected.name,'B.txt');assert.equal(view.send.disabled,true);
    await act(async()=>globalThis.__nlCommit());await complete('native-20');assert.equal(await selected,false);
    globalThis.__nlHoldCommit=false;await act(async()=>view.thread.onRemoveAttachment('native-1'));
    await act(async()=>view.thread.onRetryAttachment(rejected.id));await until(()=>globalThis.__nlNative.some(a=>a.id==='native-21'));await complete('native-21');assert.equal(view.send.disabled,false);
  }finally{await view.unmount();}
});

test("an unavailable host draft handoff becomes a retryable failure and keeps the source identity",async()=>{
  // UC-NONE: host callback failure/readiness handling; no security policy is widened.
  let available=false;const view=await mount();try{
    let selected;await act(async()=>{selected=pick(view,[source()],files=>{if(!available)throw Error('native callback unavailable');view.thread.onAttachFiles(files);});});await until(()=>view.thread.composerAttachments.some(a=>a.failed));
    assert.equal(await selected,false);assert.equal(view.send.disabled,true);assert.equal(globalThis.__nlNative.length,0);
    available=true;await act(async()=>view.thread.onRetryAttachment(view.thread.composerAttachments[0].id));await until(()=>globalThis.__nlNative.length===1);await complete('native-1');assert.equal(view.send.disabled,false);
  }finally{await view.unmount();}
});

test("duplicate private refs share one intake; same-name distinct refs retain unique native identities",async()=>{
  // [UC-5 §8.5](../../oceandino/docs/architecture/oceanleo-untrusted-content-isolation.md#85-uc-5-新表必须同时有-rls-与配额): selected private revision identities remain distinct; not backend ACL/quota validation.
  let reads=0;globalThis.__nlRead=async item=>{reads++;return bytes(item.name);};const view=await mount();try{
    let selected;await act(async()=>{selected=pick(view,[source('a','ra','same.txt'),source('a','ra','same.txt'),source('b','rb','same.txt')]);});await until(()=>globalThis.__nlNative.length===2);await flush();
    assert.equal(await selected,true);assert.equal(reads,2);assert.equal(new Set(view.thread.composerAttachments.map(a=>a.id)).size,2);
    assert.notEqual(globalThis.__nlFiles.get('native-1').lastModified,globalThis.__nlFiles.get('native-2').lastModified);
    assert.deepEqual(globalThis.__nlNative.map(a=>a.name),['same.txt','same-2.txt']);await complete('native-1');assert.equal(view.send.disabled,true);await complete('native-2');assert.equal(view.send.disabled,false);
  }finally{await view.unmount();}
});

test("remove during an uncommitted native registration suppresses and removes only its eventual tile",async()=>{
  // UC-NONE: single-composer handoff cancellation, not a server owner boundary.
  globalThis.__nlHoldCommit=true;const view=await mount();try{
    await act(async()=>{void pick(view,[source()]);});await until(()=>globalThis.__nlNative.length===1);
    const id=view.thread.composerAttachments[0].id;await act(async()=>view.thread.onRemoveAttachment(id));assert.equal(view.thread.composerAttachments.length,0);
    assert.equal(await view.thread.send('text'),false,'removed-but-uncommitted ownership cannot slip into a direct send');
    await act(async()=>globalThis.__nlCommit());await until(()=>globalThis.__nlNative.length===0);
    assert.deepEqual(globalThis.__nlRemoved,['native-1']);assert.equal(view.thread.composerAttachments.length,0);
  }finally{await view.unmount();}
});

test("a scope change discards held old-source bytes without touching the new thread",async()=>{
  // UC-NONE: UI conversation lifecycle isolation; server authorization is independently enforced.
  const pending=gate(),signals=[];globalThis.__nlRead=(_item,{signal})=>{signals.push(signal);return pending.promise;};const view=await mount();try{
    await act(async()=>{void pick(view,[source()]);});await view.update('task-two');assert.equal(signals[0].aborted,true);
    await act(async()=>pending.resolve(bytes()));await flush();assert.equal(globalThis.__nlHandoffs.length,0);assert.equal(view.thread.composerAttachments.length,0);
  }finally{pending.resolve(bytes());await view.unmount();}
});

test("a concurrent local add can consume slot20 before its commit; a fresh full snapshot visibly rejects Library",async()=>{
  // UC-NONE: client capacity/receipt race, not the UC-5 database quota boundary.
  const held=gate();globalThis.__nlRead=()=>held.promise;const view=await mount();try{
    await act(async()=>view.thread.onAttachFiles(Array.from({length:19},(_,n)=>bytes('local-'+n+'.txt'))));
    await act(async()=>{globalThis.__nlNative=globalThis.__nlNative.map(a=>({...a,state:'done'}));globalThis.__nlCommit();});
    globalThis.__nlHoldCommit=true;let selected;await act(async()=>{selected=pick(view,[source('selected','revision','selected.txt')]);});
    await act(async()=>view.thread.onAttachFiles([bytes('concurrent-local.txt')]));assert.equal(globalThis.__nlNative.length,20);
    await act(async()=>held.resolve(bytes('selected.txt')));await flush();assert.equal(view.send.disabled,true);
    assert.equal(view.thread.composerAttachments.some(a=>a.failed),false,'stale snapshot alone cannot decide rejection');
    await act(async()=>globalThis.__nlCommit());await until(()=>view.thread.composerAttachments.some(a=>a.failed));
    assert.equal(await selected,false);const failed=view.thread.composerAttachments.find(a=>a.failed);assert.equal(failed.name,'selected.txt');
    assert.equal(globalThis.__nlNative.length,20);assert.deepEqual(globalThis.__nlRemoved,[],'no foreign local file is revoked');
    globalThis.__nlHoldCommit=false;await act(async()=>view.thread.onRemoveAttachment('native-20'));
    await act(async()=>view.thread.onRetryAttachment(failed.id));await until(()=>globalThis.__nlNative.some(a=>a.id==='native-21'));await complete('native-21');
    assert.equal(view.send.disabled,false);assert.deepEqual(globalThis.__nlRemoved,['native-20']);
  }finally{held.resolve(bytes('selected.txt'));await view.unmount();}
});
