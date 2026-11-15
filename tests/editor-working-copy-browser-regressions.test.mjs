import './helpers/w1-jsdom-window.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {compileModule,dataModule} from './helpers/module-bench.mjs';
import {recordUserMutation,resetUserEditSession} from '../src/shell/user-edit-session.ts';
import {createBackgroundPublisher,resetBackgroundSaverForTests} from '../src/shell/advanced-background-saver.ts';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const stubs={'../lib/auth/client':dataModule('export const accessToken=async()=>"test-token";'),'../lib/auth/config':dataModule('export const GATEWAY_BASE="https://gateway.invalid";')};
const {WorkingCopySaver}=await import(await compileModule('src/shell/editor-working-copy.ts',stubs));
const {useAdvancedAutoSave}=await import(await compileModule('src/shell/use-advanced-autosave.ts',stubs));
const settle=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const errors=[];const originalError=console.error;console.error=(...args)=>{errors.push(args.map(String).join(' '));};
test.after(()=>{console.error=originalError;});
let seq=0,puts=[],doc={value:57};
const originalFetch=globalThis.fetch;
globalThis.fetch=async(_url,init)=>{
 if(init.method==='GET')return seq?Response.json({schema:'test',seq,published_seq:0,base_revision_id:'r1',saved_at:new Date().toISOString(),doc:puts.at(-1)?.doc}):new Response('',{status:404});
 if(init.method==='PUT'){const data=JSON.parse(init.body);if(data.if_seq!==(seq||null))return Response.json({ok:false,code:'stale',seq},{status:409});puts.push(data);return Response.json({ok:true,seq:++seq,server_ms:20});}
 return Response.json({ok:true});
};
test.after(()=>{globalThis.fetch=originalFetch;});
async function mount(initial){let input=initial,current;const node=document.createElement('div');document.body.append(node);const root=createRoot(node);function Probe(){current=useAdvancedAutoSave(input);return React.createElement('span',{'data-save':current.state},current.errorMessage);}
 await act(async()=>{root.render(React.createElement(Probe));await settle();});return {get current(){return current;},node,update:async(next)=>{input={...input,...next};await act(async()=>{root.render(React.createElement(Probe));await settle();});},close:async()=>{await act(async()=>{root.unmount();await settle();await delay(5);});node.remove();}};
}
const input=()=>({key:'root',item:{id:'root',artifactId:'root',revisionId:'r1',meta:{}},editorId:'deck',dirty:false,revision:0,session:null,recovery:{key:'root',draftSchema:'test',ready:true,capture:()=>doc,restore:()=>true},preparePublish:()=>async()=>({ok:true})});
test.beforeEach(()=>{puts=[];seq=0;doc={value:57};resetUserEditSession();errors.length=0;});
test.afterEach(()=>{resetBackgroundSaverForTests();assert.deepEqual(errors,[]);});

test('VS3: browser-branded timers retain their receiver on failure and retry cancellation',async()=>{
 const oldSet=globalThis.setTimeout,oldClear=globalThis.clearTimeout;
 function strictSet(...args){if(this!==globalThis)throw new TypeError('Illegal invocation');return oldSet(...args);}
 function strictClear(...args){if(this!==globalThis)throw new TypeError('Illegal invocation');return oldClear(...args);}
 globalThis.setTimeout=strictSet;globalThis.clearTimeout=strictClear;
 const saver=new WorkingCopySaver({schema:'test',baseRevision:'r1',capture:()=>doc,restore:()=>{},transport:{get:async()=>null,put:async()=>({ok:true,seq:1}),published:async()=>{}}});
 try{await saver.initialize();assert.doesNotThrow(()=>saver.fail(new TypeError('Failed to fetch')));assert.equal(saver.snapshot().state,'error');assert.doesNotThrow(()=>saver.edit());await saver.flush();assert.equal(saver.snapshot().state,'saved');}
 finally{globalThis.setTimeout=oldSet;globalThis.clearTimeout=oldClear;saver.dispose();}
});

test('VS4: a room tab waits for its own PUT acknowledgement even without a local mutation-feed event',async()=>{
 const {Doc}=await import('yjs');const room={doc:new Doc()};const oldFetch=globalThis.fetch;let release;
 globalThis.fetch=async(...args)=>{const response=await oldFetch(...args);if(args[1].method==='PUT')await new Promise(r=>release=r);return response;};
 const view=await mount({...input(),room});
 try{doc={value:58};await act(async()=>{room.doc.getMap('test').set('value',58);await settle();});assert.equal(puts.length,1);assert.equal(view.current.state,'saving');assert.equal(view.current.pending,true);await act(async()=>{release();await settle();});assert.equal(view.current.state,'saved');assert.equal(view.current.pending,false);}
 finally{globalThis.fetch=oldFetch;await view.close();room.doc.destroy();}
});

test('VS4: observing revision before dirty becomes true cannot consume the edit without PUT',async()=>{
 const view=await mount(input());try{doc={value:58};await view.update({revision:1,dirty:false});await view.update({dirty:true});assert.equal(puts.length,1);assert.equal(puts[0].doc.value,58);assert.equal(view.current.state,'saved');}finally{await view.close();}
});

test('VS1: background publication yields pending input before capture/file building',async()=>{
 const order=[];const saver={flush:async()=>true,snapshot:()=>({seq:1,pending:false}),freeze(){},dispose(){}};
 const pub=createBackgroundPublisher({saver,transport:{published:async()=>{}},record:async()=>{},prepare:()=>{order.push('publication');const until=performance.now()+50;while(performance.now()<until){}return async()=>({ok:true});}});
 pub.saved();setTimeout(()=>order.push('input'),0);await pub.publish();await delay(5);assert.equal(order[0],'input');
});

test('VS3/VS6: a temporary recovery.ready change never recreates a saver or conflicts with its own acknowledged copy',async()=>{
 const spec=input(),view=await mount(spec);
 try{doc={value:58};await view.update({dirty:true,revision:1});assert.equal(puts.length,1);await view.update({recovery:{...spec.recovery,ready:false}});await view.update({recovery:{...spec.recovery,ready:true}});assert.equal(puts.length,1,'readiness must not resend an already acknowledged edit');doc={value:59};await view.update({revision:2});assert.equal(puts.length,2);assert.equal(puts[1].if_seq,1);assert.equal(view.current.state,'saved');}finally{await view.close();}
});

test('VS1: long DOCX publication processes pending input before all paragraph construction finishes',async()=>{
 const {createRequire}=await import('node:module');const {pathToFileURL}=await import('node:url');const require=createRequire(import.meta.url);
 const packers=new Set([(await import('docx')).Packer,(await import(pathToFileURL(require.resolve('docx')).href)).Packer]);
 const {tiptapJsonToDocxBlob}=await import(await compileModule('src/shell/doc-editors/docx-export.ts',{}));
 const originals=new Map([...packers].map(p=>[p,p.toBlob]));let inputRan=false,inputAtPack=false,packed=0;
 for(const packer of packers)packer.toBlob=async()=>{packed++;inputAtPack=inputRan;return new Blob(['docx']);};
 try{setTimeout(()=>{inputRan=true;},0);await tiptapJsonToDocxBlob('Long document',{type:'doc',content:Array.from({length:1500},(_,i)=>({type:'paragraph',content:[{type:'text',text:`Paragraph ${i} `+'coastal review '.repeat(15)}]}))});assert.equal(packed,1);assert.equal(inputAtPack,true,'building the DOCX must yield to editing before ZIP packaging');}finally{for(const [packer,original] of originals)packer.toBlob=original;}
});

test('VS4: every room tab persists a remote edit even though hydration does not increment its local revision',async()=>{
 const {Doc}=await import('yjs');const room={doc:new Doc(),isSaver:true};const view=await mount({...input(),room});
 try{doc={value:58};await act(async()=>{room.doc.transact(()=>room.doc.getMap('test').set('value',58),room);await settle();});assert.equal(puts.length,1);assert.equal(puts[0].doc.value,58);assert.equal(view.current.state,'saved');}finally{await view.close();room.doc.destroy();}
});

test('VS3: a real Window online event recovers an offline PUT with branded fetch/timers',async()=>{
 const oldSet=globalThis.setTimeout,oldClear=globalThis.clearTimeout,oldFetch=globalThis.fetch;let offline=false;
 globalThis.setTimeout=function(...args){if(this!==globalThis)throw TypeError('Illegal invocation');return oldSet(...args);};
 globalThis.clearTimeout=function(...args){if(this!==globalThis)throw TypeError('Illegal invocation');return oldClear(...args);};
 globalThis.fetch=async function(...args){if(this!==globalThis)throw TypeError('Illegal invocation');if(offline)throw TypeError('Failed to fetch');return oldFetch(...args);};
 const {workingCopyTransport}=await import(await compileModule('src/shell/editor-working-copy.ts',stubs));
 const saver=new WorkingCopySaver({schema:'test',baseRevision:'r1',capture:()=>doc,restore:()=>true,events:window,transport:workingCopyTransport('root','test','r1')});
 try{await saver.initialize();offline=true;saver.edit();await saver.flush();assert.equal(saver.snapshot().state,'error');offline=false;window.dispatchEvent(new window.Event('online'));await settle();assert.equal(saver.snapshot().state,'saved');saver.dispose();}finally{globalThis.setTimeout=oldSet;globalThis.clearTimeout=oldClear;globalThis.fetch=oldFetch;saver.dispose();}
});

test('VS4: independent writers with stale sequences show conflict, never Saved for the losing tab',async()=>{
 const first=await mount(input()),second=await mount(input());
 try{doc={value:58};await first.update({dirty:true,revision:1});assert.equal(first.current.state,'saved');doc={value:59};await second.update({dirty:true,revision:1});assert.equal(second.current.state,'error');assert.equal(second.current.conflict,true);assert.equal(second.current.pending,true);assert.equal(puts.length,1);assert.equal(puts[0].doc.value,58);}finally{await first.close();await second.close();}
});

test('VS1: edit timing retains the trusted input timestamp before React/model work',async()=>{
 const {userMutationAt}=await import('../src/shell/user-edit-session.ts');const descriptor=Object.getOwnPropertyDescriptor(window,'event');const at=performance.now()-20;
 Object.defineProperty(window,'event',{configurable:true,value:{isTrusted:true,timeStamp:at}});
 try{recordUserMutation('timestamp');assert.equal(userMutationAt('timestamp'),at);}finally{if(descriptor)Object.defineProperty(window,'event',descriptor);else delete window.event;}
});
