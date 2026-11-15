import assert from 'node:assert/strict';
import test from 'node:test';
import React, {act} from 'react';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {compileModule,dataModule} from './helpers/module-bench.mjs';
import {resetBackgroundSaverForTests} from '../src/shell/advanced-background-saver.ts';
import {createCollabProvider} from '../src/shell/collab/provider.ts';
const require=createRequire(import.meta.url),fabricRequire=createRequire(require.resolve('fabric/node'));
const canvas=fabricRequire.resolve('canvas'),previous=require.cache[canvas];
require.cache[canvas]={id:canvas,filename:canvas,loaded:true,exports:{}};
const {JSDOM}=await import(pathToFileURL(fabricRequire.resolve('jsdom')).href);
if(previous)require.cache[canvas]=previous;else delete require.cache[canvas];
const dom=new JSDOM('<!doctype html><html><body></body></html>',{pretendToBeVisual:true,url:'https://test.dev.oceanleo.com'});
for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,MutationObserver:dom.window.MutationObserver,DOMParser:dom.window.DOMParser,getComputedStyle:dom.window.getComputedStyle.bind(dom.window),requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window)}))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
globalThis.innerHeight=768;globalThis.innerWidth=1024;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const reactUrl=pathToFileURL(require.resolve('react')).href;
const translation=dataModule(`const tt=(text,vars={})=>text.replace(/\{(\w+)\}/g,(m,k)=>vars[k]??m);export const useUI=()=>tt;`);
const auth=dataModule('export async function accessToken(){return "test-token"}');
const config=dataModule('export const GATEWAY_BASE="https://gateway.invalid",SUPABASE_URL="https://database.invalid"');
const hookUrl=await compileModule('src/shell/use-advanced-autosave.ts',{'../lib/auth/client':auth,'../lib/auth/config':config});
const statusUrl=await compileModule('src/shell/plugin-chrome/PluginChromeStatus.tsx',{'../../i18n/ui/useUI':translation});
const realRoomHooks=await compileModule('src/shell/collab/use-collab-room.ts',{'../../lib/auth/client':auth,'../../lib/auth/config':config});
const collab=dataModule(`import React from ${JSON.stringify(reactUrl)};export {useCollabSaveGate,useCollabReadOnly} from ${JSON.stringify(realRoomHooks)};export const RoomContext=React.createContext(null);export const useCollabRoom=()=>React.useContext(RoomContext)??globalThis.__wcRoom??null;`);
const {RoomContext}=await import(collab);
const host=dataModule(`import React from ${JSON.stringify(reactUrl)};import {useAdvancedAutoSave} from ${JSON.stringify(hookUrl)};import {PluginChromeStatus} from ${JSON.stringify(statusUrl)};import {RoomContext} from ${JSON.stringify(collab)};
export function AdvancedWorkbenchShell({adapter,item}){globalThis.__wcAdapter=adapter;const p=adapter.persistence;const save=useAdvancedAutoSave({key:item.artifactId,enabled:p.autoSave!==false,room:adapter.collab?.room,dirty:p.dirty,revision:p.editRevision,flush:p.flush,preparePublish:p.preparePublish,recovery:p.recovery,item,editorId:'richdoc',session:null});globalThis.__wcSave=save;const room=React.useContext(RoomContext);if(room)globalThis.__wcTabs[room.self.id].save=save;return React.createElement('div',null,React.createElement(PluginChromeStatus,{state:{kind:save.state,message:save.errorMessage}}),adapter.stage);}`);
const docio=dataModule(`
export const downloadBlob=()=>{},downloadText=()=>{};
export async function loadEditorProject(){return globalThis.__wcPublishedDocument??null;}
export async function saveFileToLibrary(input){
 if(globalThis.__wcVerifyPin&&globalThis.__wcPublishedItem&&input.item.revisionId!==globalThis.__wcPublishedItem.revisionId)return {ok:false,error:'publication CAS pin was not adopted'};
 globalThis.__wcPublications.push(input.project.data);await globalThis.__wcPublishBarrier;
 const revisionId='r'+(globalThis.__wcPublications.length+1),previousRevisionId=input.item.revisionId;
 const projectUrl='https://files.invalid/'+revisionId+'.project.json';
 globalThis.__wcPublishedDocument=structuredClone(input.project.data);
 globalThis.__wcPublishedItem={...input.item,revisionId,artifact:{...input.item.artifact,revisionId},meta:{...input.item.meta,editor_project_url:projectUrl}};
 return {ok:true,url:'https://files.invalid/'+revisionId+'.docx',versionId:revisionId,artifactId:'root',revisionId,previousRevisionId,projectUrl,projectSchema:'tiptap-json@1',item:globalThis.__wcPublishedItem};
}`);
const artifactClient=dataModule(`export * from ${JSON.stringify(pathToFileURL(require.resolve('../src/shell/artifact-client.ts')).href)};export async function getArtifactItem(){return {ok:true,data:globalThis.__wcPublishedItem??{id:"root",artifactId:"root",revisionId:"r1",meta:{}}};}export const getCurrentArtifactItem=getArtifactItem;`);
const editorModelUrl=await compileModule('src/shell/doc-editors/rich-doc-model.ts',{});
const model=dataModule(`export * from ${JSON.stringify(editorModelUrl)};export async function loadRichDocSource(){return {source:'inline',json:globalThis.__wcInitialDocument??{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Original'}]}]},html:'<p>Original</p>'};}export const preloadRichDocDeliveryWriters=()=>{};`);
const noComponent=dataModule('export const RichDocControls=()=>null,RichDocCommentRail=()=>null,RichDocContextToolbar=()=>null;');
const pmStubs=Object.fromEntries(['state','model','view','transform'].map(name=>{const key='@tiptap/pm/'+name;const entry=require.resolve(key);const keys=Object.keys(require(key));return [key,dataModule(`import pkg from ${JSON.stringify(pathToFileURL(entry).href)};${keys.filter(k=>/^[a-zA-Z_$][\w$]*$/.test(k)&&k!=='default').map(k=>`export const ${k}=pkg.${k};`).join('')}`)];}));
const routeUrl=await compileModule('src/shell/advanced-routes/RichDocRoute.tsx',{
 ...pmStubs,
 ...Object.fromEntries(['@tiptap/starter-kit','@tiptap/extension-collaboration','@tiptap/extension-collaboration-caret'].map(key=>[key,dataModule(`import pkg from ${JSON.stringify(pathToFileURL(require.resolve(key)).href)};export default pkg.default;`)])),
 '../AdvancedWorkbenchShell':host,'../../i18n/ui/useUI':translation,
 '../office-editor':dataModule('export const useOfficeArtifactSource=item=>({item,loading:false,resourceFailed:false,error:""});'),
 '../collab':collab,'../doc-editors/doc-io':docio,'../artifact-client':artifactClient,
 '../doc-editors/rich-doc-model':model,
 '../doc-editors/rich-doc-text-delivery':dataModule(`export const preloadRichDocDeliveryWriters=()=>{},richDocRendersPreviewBitmap=()=>false,richDocTextExcerpt=()=>'';`),
 '../doc-editors/RichDocControls':noComponent,'../doc-editors/RichDocContextToolbar':noComponent,
 '../doc-editors/richdoc-review/RichDocCommentRail':noComponent,
 '../doc-editors/richdoc-review/use-richdoc-review-collab':dataModule('export const useRichDocReviewCollab=()=>{};'),
 '../doc-editors/RichDocStage':dataModule(`import React from ${JSON.stringify(reactUrl)};import {RoomContext} from ${JSON.stringify(collab)};import {EditorContent} from ${JSON.stringify(pathToFileURL(require.resolve('@tiptap/react')).href)};export const RichDocStage=({editor})=>{globalThis.__wcEditor=editor;const room=React.useContext(RoomContext);if(room)globalThis.__wcTabs[room.self.id].editor=editor;return React.createElement('div',{'data-richdoc-stage':true},React.createElement(EditorContent,{editor:editor.editor}));};`),
 '../../lib/im/client':dataModule('export const imEnabledHere=()=>false;'),
 '../useAdvancedSession':dataModule('export const useAdvancedSession=()=>null;'),
 '../workbench-material-provider':dataModule('export const useWorkbenchMaterialAdapter=()=>{};'),
 '../plugin-command':dataModule('export const usePluginCommandSurface=()=>{};'),
 '../../lib/auth/client':auth,'../../lib/auth/config':config,
});
const {RichDocRoute}=await import(routeUrl);
const {createRoot}=await import('react-dom/client');
const item={id:'root',key:'root:r1',artifactId:'root',revisionId:'r1',source:'upload',kind:'document',title:'Test',siteId:'word',url:'https://files.invalid/source.docx',meta:{mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',source_format:'docx'},artifact:{id:'root',artifactId:'root',revisionId:'r1',artifactType:'document',renditions:{}}};
const settle=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let copy=null,requests=[],putAck;
const originalFetch=globalThis.fetch;
globalThis.__wcPublications=[];
globalThis.fetch=async(url,init={})=>{
 if(String(url).includes('/v1/editor-working-copies/')){
  requests.push([url,init.method]);
  if(init.method==='GET')return copy?Response.json(copy):new Response('',{status:404});
  if(init.method==='PUT'){
   const data=init.headers['Content-Encoding']==='gzip'
    ? await new Response(new Blob([init.body]).stream().pipeThrough(new DecompressionStream('gzip'))).json()
    : JSON.parse(init.body);if(data.if_seq!==(copy?.seq??null))return Response.json({ok:false,code:'stale',seq:copy?.seq??0},{status:409});copy={...data,seq:(copy?.seq??0)+1,published_seq:0,saved_at:new Date().toISOString()};
   const receiptSeq=copy.seq;if(putAck)await putAck;
   if(globalThis.__wcRequestDelay)await delay(globalThis.__wcRequestDelay);
   globalThis.__wcAckObserver?.(data.doc,performance.now());
   return Response.json({ok:true,seq:receiptSeq,saved_at:copy.saved_at,server_ms:20});
  }
  if(init.method==='POST'&&String(url).endsWith('/published')&&copy){const data=JSON.parse(init.body);copy.published_seq=Math.max(copy.published_seq??0,data.seq);copy.base_revision_id=data.revision_id;}
  return Response.json({ok:true});
 }
 return new Response('',{status:404});
};
const errors=[];const oldError=console.error;console.error=(...args)=>{errors.push(args.map(String).join(' '));};
async function mount(){const container=document.createElement('div');document.body.append(container);const root=createRoot(container);await act(async()=>{root.render(React.createElement(RichDocRoute,{item,onClose:()=>{}}));await delay(30);});await act(async()=>{await delay(30);});return {container,unmount:async()=>{await act(async()=>{root.unmount();await delay(20);await settle();});container.remove();}};}
test.after(()=>{resetBackgroundSaverForTests();console.error=oldError;globalThis.fetch=originalFetch;dom.window.close();});
test('REAL RichDoc route/editor: open → edit → Saving → gateway ack → Saved, background publish never changes icon, reopen restores native copy',async()=>{
 let resolve;putAck=new Promise(r=>resolve=r);const view=await mount();assert.equal(Boolean(globalThis.__wcEditor?.editor),true);assert.equal(globalThis.__wcEditor.loading,false);
 const before=performance.now();await act(async()=>{globalThis.__wcEditor.editor.commands.insertContent('Changed');await settle();});
 assert.equal(view.container.querySelector('[data-plugin-chrome-status]').dataset.pluginChromeStatus,'saving');assert.equal(requests.filter(r=>r[1]==='PUT').length,1);assert.equal(globalThis.__wcPublications.length,0);
 await act(async()=>{resolve();putAck=null;await settle();});const latency=performance.now()-before;assert.equal(view.container.querySelector('[data-plugin-chrome-status]').dataset.pluginChromeStatus,'saved');assert.ok(latency<=500,`edit-to-ack ${latency}ms`);
 let release;globalThis.__wcPublishBarrier=new Promise(r=>release=r);let publishing;await act(async()=>{publishing=globalThis.__wcSave.flushLatest();await delay(15);await settle();});assert.equal(globalThis.__wcPublications.length,1);assert.equal(view.container.querySelector('[data-plugin-chrome-status]').dataset.pluginChromeStatus,'saved');await act(async()=>{release();await publishing;});
 // Leave unpublished copy for the reopen scenario.
 copy.published_seq=0;const expected=copy.doc;await view.unmount();const reopened=await mount();assert.deepEqual(JSON.parse(JSON.stringify(globalThis.__wcEditor.captureRecovery())),expected);assert.equal(requests.filter(r=>r[1]==='PUT').length,1);await reopened.unmount();assert.deepEqual(errors,[]);console.log(`RichDoc edit-to-ack measured ${latency.toFixed(1)}ms (fake gateway)`);
});

test('local-device edit calls host save and Saved without any cloud working-copy or Library request',async()=>{
 const {useAdvancedAutoSave}=await import(hookUrl);let calls=0,resolve;const ack=new Promise(r=>resolve=r);let revision=0,dirty=false;
 function LocalEditor(){const state=useAdvancedAutoSave({key:'local',item:{id:'local',meta:{}},editorId:'image',destination:'local-device',dirty,revision,session:null,flush:async()=>{calls++;await ack;return {ok:true};}});return React.createElement('span',{'data-local-state':state.state},state.state);}
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container),start=requests.length,publications=globalThis.__wcPublications.length;
 try{await act(async()=>{root.render(React.createElement(LocalEditor));await settle();});dirty=true;revision=1;await act(async()=>{root.render(React.createElement(LocalEditor));await settle();});assert.equal(container.textContent,'saving');assert.equal(calls,1);await act(async()=>{resolve();await settle();});assert.equal(container.textContent,'saved');assert.equal(requests.length,start);assert.equal(globalThis.__wcPublications.length,publications);}finally{await act(async()=>{root.unmount();await settle();});container.remove();}assert.deepEqual(errors,[]);
});

test('RichDoc comment replies and paragraph formatting survive working-copy restore and publish after unmount',async()=>{
 copy=null;globalThis.__wcPublishBarrier=undefined;putAck=null;const view=await mount();let commentId;
 await act(async()=>{const editor=globalThis.__wcEditor.editor;editor.commands.updateAttributes('paragraph',{lineHeight:'2',indentLeft:'24px'});editor.commands.setTextSelection({from:1,to:4});commentId=globalThis.__wcEditor.review.addComment('Review this');await settle();});assert.ok(commentId);
 const before=requests.filter(r=>r[1]==='PUT').length;
 await act(async()=>{globalThis.__wcEditor.review.replyToComment(commentId,'Reply saved');await settle();});
 assert.ok(requests.filter(r=>r[1]==='PUT').length>before);assert.equal(copy.doc.review.comments[0].replies[0].body,'Reply saved');assert.equal(copy.doc.content[0].attrs.lineHeight,'2');
 const expected=structuredClone(copy.doc),previous=globalThis.__wcPublications.length;await view.unmount();assert.equal(globalThis.__wcPublications.length,previous+1);assert.deepEqual(JSON.parse(JSON.stringify(globalThis.__wcPublications.at(-1))).review,expected.review);assert.deepEqual(errors,[]);
});

test('VS1 document matrix: 20 isolated edits + 3 bursts, small/40-page native models at 0/150ms RTT',async()=>{
 const {registerTelemetrySink}=await import('../src/lib/telemetry/index.ts');
 const measurements=[];const off=registerTelemetrySink({id:'s2-vs-repair',receive:event=>{if(event.name==='editor_save')measurements.push(event);}});
 const summaries=[];
 try{
  for(const pages of [1,40])for(const rtt of [0,150]){
   globalThis.__wcInitialDocument={type:'doc',content:Array.from({length:pages*20},(_,n)=>({type:'paragraph',content:[{type:'text',text:`Page ${Math.floor(n/20)+1}. Coastal review: safe access and clean water. `.repeat(2)}]}))};
   globalThis.__wcRequestDelay=rtt;globalThis.__wcPublishBarrier=undefined;copy=null;putAck=null;const view=await mount();const isolated=[],burstInputs=[],latestSaved=[],measurementStart=measurements.length;
   const acknowledgements=[];const lengthOf=d=>JSON.stringify(d).length;
   globalThis.__wcAckObserver=(data,at)=>acknowledgements.push({length:lengthOf(data),at});
   const waitSaved=async()=>{const until=performance.now()+2000;while(globalThis.__wcSave.state!=='saved'&&performance.now()<until)await act(async()=>{await delay(5);});assert.equal(globalThis.__wcSave.state,'saved');};
   try{
    for(let n=0;n<20;n++){const at=performance.now();await act(async()=>{globalThis.__wcEditor.editor.commands.insertContent('x');await settle();});await waitSaved();isolated.push(performance.now()-at);}
    for(let burst=0;burst<3;burst++){const starts=[];for(let n=0;n<10;n++){const at=performance.now();await act(async()=>{globalThis.__wcEditor.editor.commands.insertContent('b');starts.push({at,length:lengthOf(globalThis.__wcEditor.captureRecovery())});await delay(10);});}await waitSaved();const ack=performance.now();latestSaved.push(ack-starts.at(-1).at);burstInputs.push(...starts.map(input=>{const receipt=acknowledgements.find(a=>a.at>=input.at&&a.length>=input.length);assert.ok(receipt,"every burst edit must have a covering server acknowledgement");return receipt.at-input.at;}));}
    assert.ok(isolated.every(ms=>ms<=500),`${pages} pages/${rtt}ms isolated max ${Math.max(...isolated)}`);
    assert.ok(burstInputs.every(ms=>ms<=500),`${pages} pages/${rtt}ms burst input max ${Math.max(...burstInputs)}`);
    const phaseP95=Object.fromEntries(['render_ms','queue_ms','capture_ms','encode_ms','gzip_ms','request_ms'].map(key=>{const values=measurements.slice(measurementStart).map(e=>e.detail[key]).sort((a,b)=>a-b);return [key,Number(values[Math.ceil(values.length*.95)-1].toFixed(2))];}));
    summaries.push({pages,rtt,isolated:20,bursts:3,phase_p95:phaseP95,max_edit_to_ack_ms:Number(Math.max(...isolated,...burstInputs).toFixed(1)),max_latest_input_to_saved_ms:Number(Math.max(...latestSaved).toFixed(1))});
   }finally{await view.unmount();}
  }
  assert.ok(measurements.length>=80);
  for(const event of measurements){for(const field of ['render_ms','queue_ms','capture_ms','auth_ms','encode_ms','gzip_ms','request_ms','bytes'])assert.equal(typeof event.detail[field],'number',field);}
  console.log('VS1 jsdom document matrix',JSON.stringify(summaries));assert.deepEqual(errors,[]);
 }finally{off();delete globalThis.__wcInitialDocument;delete globalThis.__wcRequestDelay;delete globalThis.__wcAckObserver;}
});


for(const pages of [1,40]) for(const existing of [false,true]) test(`VS4 round 5 two real Tiptap editors on ONE Y.Doc: ${pages} pages, ${existing ? "existing" : "fresh"} copy, both tabs PUT their merged state`,async()=>{
 const Y=require('yjs'),sharedDoc=new Y.Doc();
 const room=id=>{const provider=createCollabProvider({manual:true,doc:sharedDoc,roomKey:'artifact:root',fetchTicket:async()=>{throw Error('test transport only');},wsUrl:()=>''});provider.status='synced';provider.role='editor';provider.needsSeed=id==='a';provider.self={id,name:id,color:'#6366f1',avatar_url:null};return provider;};
 const a=room('a'),b=room('b');
 assert.equal(a.doc,b.doc,'both real editor bindings must use exactly one Y.Doc');
 globalThis.__wcTabs={a:{},b:{}};globalThis.__wcInitialDocument={type:'doc',content:Array.from({length:pages*20},(_,n)=>({type:'paragraph',content:[{type:'text',text:`Page ${n}: original document. `}]}))};
 globalThis.__wcPublishedItem=undefined;globalThis.__wcPublishedDocument=undefined;globalThis.__wcVerifyPin=true;
 copy=existing?{schema:'oceanleo.richdoc.edit.v1',seq:17,published_seq:0,base_revision_id:'r1',saved_at:new Date().toISOString(),doc:structuredClone(globalThis.__wcInitialDocument)}:null;putAck=null;globalThis.__wcPublishBarrier=undefined;const views=[];
 const open=async(room)=>{const node=document.createElement('div');document.body.append(node);const root=createRoot(node);views.push({node,root});await act(async()=>{root.render(React.createElement(RoomContext.Provider,{value:room},React.createElement(RichDocRoute,{item,onClose(){}})));await delay(30);});await act(async()=>{await delay(30);});return globalThis.__wcTabs[room.self.id];};
 try{const first=await open(a),second=await open(b);assert.equal(first.editor.loading,false);assert.equal(second.editor.loading,false);assert.equal(first.editor.editor.getText(),second.editor.editor.getText());assert.equal(document.querySelectorAll('[data-richdoc-stage] .ProseMirror').length,2,'both real editor views must be mounted');
  const before=requests.length;let release;putAck=new Promise(r=>release=r);
  await act(async()=>{second.editor.editor.commands.insertContent('VS-R3-check-93');await settle();await delay(20);});
  assert.ok(second.editor.editor.getText().includes('VS-R3-check-93'));assert.ok(first.editor.editor.getText().includes('VS-R3-check-93'));assert.ok(views.every(view=>view.node.querySelector('.ProseMirror').textContent.includes('VS-R3-check-93')));
  await act(async()=>{first.editor.editor.commands.insertContent('VS-R3-check-92');await settle();});
  assert.equal(first.save.state,'saving');
  assert.equal(second.save.state,'saving','peer must await its own working-copy acknowledgement');assert.equal(second.save.pending,true);assert.equal(second.save.conflict,false);
  assert.ok(requests.slice(before).filter(r=>r[1]==='PUT').length>=2,'both room adapters own a PUT, including the formerly non-elected tab');
  await act(async()=>{release();putAck=null;await delay(30);await settle();});
  const until=performance.now()+2000;while((first.save.state!=='saved'||second.save.state!=='saved')&&performance.now()<until)await act(async()=>{await delay(5);});
  assert.equal(first.save.state,'saved');assert.equal(second.save.state,'saved');assert.ok(JSON.stringify(copy.doc).includes('VS-R3-check-93'));
  assert.ok(JSON.stringify(copy.doc).includes('VS-R3-check-92'));assert.ok(JSON.stringify(copy.doc).includes('VS-R3-check-93'));
  const beforePublish=globalThis.__wcPublications.length;let receipts;
  await act(async()=>{receipts=await Promise.all([first.save.flushLatest(),second.save.flushLatest()]);});
  assert.ok(receipts.every(result=>result.ok));assert.equal(globalThis.__wcPublications.length-beforePublish,1,'the same merged document creates one Library revision');assert.equal(copy.published_seq,copy.seq);
  await act(async()=>{await Promise.all([first.save.flushLatest(),second.save.flushLatest()]);});assert.equal(globalThis.__wcPublications.length-beforePublish,1,'repeated gates reuse the same revision');
  const equalSeq=copy.seq;copy.published_seq=0;copy.base_revision_id='r1';
  await act(async()=>{const original=first.editor.editor.getJSON();first.editor.editor.commands.insertContent('temporary');first.editor.editor.commands.setContent(original,{emitUpdate:true});await delay(30);await settle();});
  const equalUntil=performance.now()+2000;while((first.save.state!=='saved'||second.save.state!=='saved')&&performance.now()<equalUntil)await act(async()=>{await delay(5);});
  assert.ok(copy.seq>equalSeq,'identical content was acknowledged at a new sequence');
  await act(async()=>{const reused=await Promise.all([first.save.flushLatest(),second.save.flushLatest()]);assert.ok(reused.every(result=>result.ok));});assert.equal(globalThis.__wcPublications.length-beforePublish,1,'current native head also dedupes when publication-marker completion was delayed');
  const closed=views.shift();await act(async()=>{closed.root.unmount();await delay(20);});closed.node.remove();
  await act(async()=>{second.editor.editor.commands.insertContent('VS-R3-check-94');await delay(30);await settle();});
  const closingUntil=performance.now()+2000;while(second.save.state!=='saved'&&performance.now()<closingUntil)await act(async()=>{await delay(5);});
  assert.equal(second.save.state,'saved');assert.ok(JSON.stringify(copy.doc).includes('VS-R3-check-94'));
  let changed;await act(async()=>{changed=await second.save.flushLatest();});assert.equal(changed.ok,true);assert.equal(globalThis.__wcPublications.length-beforePublish,2,'a later genuine edit creates exactly one new revision from the adopted pin');assert.deepEqual(errors,[]);
 }finally{putAck=null;for(const view of views){await act(async()=>{view.root.unmount();await delay(20);});view.node.remove();}resetBackgroundSaverForTests();a.destroy();b.destroy();sharedDoc.destroy();delete globalThis.__wcTabs;delete globalThis.__wcInitialDocument;delete globalThis.__wcVerifyPin;}
});
