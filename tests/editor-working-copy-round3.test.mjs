import './helpers/w1-jsdom-window.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {Doc} from 'yjs';
import {compileModule, dataModule} from './helpers/module-bench.mjs';
import {resetUserEditSession,recordUserMutation} from '../src/shell/user-edit-session.ts';
import {resetBackgroundSaverForTests} from '../src/shell/advanced-background-saver.ts';
const stubs={
 '../lib/auth/client':dataModule('export async function accessToken(){globalThis.__r3AuthCalls++;if(globalThis.__r3AuthDelay)await new Promise(r=>setTimeout(r,globalThis.__r3AuthDelay));return globalThis.__r3Token;}export function cachedAccessToken(){return globalThis.__r3Token;}'),
 '../lib/auth/config':dataModule('export const GATEWAY_BASE="https://gateway.invalid";'),
};
const {useAdvancedAutoSave}=await import(await compileModule('src/shell/use-advanced-autosave.ts',stubs));
const {WorkingCopySaver,workingCopyTransport}=await import(await compileModule('src/shell/editor-working-copy.ts',stubs));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const settle=async()=>{for(let n=0;n<60;n++)await Promise.resolve();};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
let copy,puts,reads,readBarrier,putDelay,doc;
const originalFetch=globalThis.fetch,originalError=console.error,errors=[];
console.error=(...args)=>errors.push(args.map(String).join(' '));
globalThis.fetch=async(_url,init)=>{
 if(init.method==='GET'){reads++;if(readBarrier)await readBarrier;return copy?Response.json(copy):new Response('',{status:404});}
 if(init.method==='PUT'){
  const data=JSON.parse(init.body);if(data.if_seq!==(copy?.seq??null))return Response.json({ok:false,code:'stale'},{status:409});
  puts.push(data);if(putDelay)await delay(putDelay);copy={...data,seq:(copy?.seq??0)+1,published_seq:0,saved_at:new Date().toISOString()};return Response.json({ok:true,seq:copy.seq,server_ms:30});
 }
 return Response.json({ok:true});
};
const spec=()=>({key:'root',item:{id:'root',artifactId:'root',revisionId:'r1',meta:{}},editorId:'richdoc',dirty:false,revision:0,session:null,recovery:{key:'root',draftSchema:'test',ready:true,capture:()=>doc,restore:value=>{doc=value;return true;}},preparePublish:()=>async()=>({ok:true})});
async function mount(initial){let input=initial,current;const node=document.createElement('div');document.body.append(node);const root=createRoot(node);function Probe(){current=useAdvancedAutoSave(input);return React.createElement('span',{'data-save':current.state},current.errorMessage);}
 const render=async()=>act(async()=>{root.render(React.createElement(Probe));await settle();});await render();return {get current(){return current;},update:async(next)=>{input={...input,...next};await render();},close:async()=>{await act(async()=>{root.unmount();await settle();await delay(5);});node.remove();}};
}
test.beforeEach(()=>{copy=null;puts=[];reads=0;readBarrier=null;putDelay=0;doc={value:57};errors.length=0;resetUserEditSession();globalThis.__r3AuthCalls=0;globalThis.__r3AuthDelay=0;globalThis.__r3Token='fixture-token';});
test.afterEach(()=>{resetBackgroundSaverForTests();assert.deepEqual(errors,[]);});
test.after(()=>{globalThis.fetch=originalFetch;console.error=originalError;});
const existing=()=>({schema:'test',seq:77,published_seq:0,base_revision_id:'r1',saved_at:new Date().toISOString(),doc:{value:58}});

test('VS13: opening existing copy with hydration dirtiness restores seq before observing edits',async()=>{
 copy=existing();const view=await mount({...spec(),dirty:true,revision:7});
 try{assert.equal(view.current.state,'saved');assert.equal(view.current.conflict,false);assert.equal(puts.length,0);assert.equal(doc.value,58);doc={value:59};await view.update({revision:8});assert.equal(puts.length,1);assert.equal(puts[0].if_seq,77);assert.equal(view.current.state,'saved');}finally{await view.close();}
});

test('VS13: readiness, room seed and asynchronous restore never become a competing local edit',async()=>{
 copy=existing();const pending=deferred();readBarrier=pending.promise;const room={doc:new Doc(),isSaver:true};const initial=spec();const view=await mount({...initial,room,recovery:{...initial.recovery,ready:false}});
 try{await view.update({dirty:true,revision:1,recovery:initial.recovery});await act(async()=>{room.doc.transact(()=>room.doc.getMap('seed').set('loaded',true),room);await settle();});await act(async()=>{pending.resolve();await settle();});assert.equal(view.current.state,'saved');assert.equal(view.current.conflict,false);assert.equal(puts.length,0);assert.equal(doc.value,58);doc={value:59};await view.update({revision:2});assert.equal(puts[0].if_seq,77);}finally{await view.close();room.doc.destroy();}
});

test('VS4: non-writer local Yjs update remains unsaved even without a user-edit feed notification',async()=>{
 const room={doc:new Doc(),isSaver:false,status:'synced'};const view=await mount({...spec(),writer:false,shared:true,room,recovery:undefined,sharedSaveState:'saved'});
 try{await act(async()=>{room.doc.getText('body').insert(0,'VS-R2-check-93');await settle();});await view.update({revision:1,dirty:false});assert.equal(puts.length,0);assert.equal(view.current.state,'error');assert.equal(view.current.pending,true);assert.equal(view.current.conflict,true);}finally{await view.close();room.doc.destroy();}
});

test('VS4: peer revision change cannot fall through to room-sync Saved without PUT',async()=>{
 const view=await mount({...spec(),writer:false,shared:true,recovery:undefined,sharedSaveState:'saved'});
 try{await view.update({revision:1});assert.equal(view.current.state,'error');assert.equal(view.current.pending,true);}finally{await view.close();}
});

test('VS1: warm authentication does not wait on SDK session work for GET or PUT',async()=>{
 globalThis.__r3AuthDelay=80;const transport=workingCopyTransport('root','test','r1');await transport.get();await transport.put(doc,null);assert.equal(globalThis.__r3AuthCalls,0);
 globalThis.__r3Token='refreshed-fixture-token';await transport.put({value:59},1);assert.equal(globalThis.__r3AuthCalls,0);globalThis.__r3Token=null;await assert.rejects(transport.put({},2),/登录/);assert.equal(puts.length,2,'sign-out must not reuse the old token');
});

test('VS1: 3D-size bursts at 150ms RTT wait only for the preceding PUT, without per-PUT auth waits',async()=>{
 globalThis.__r3AuthDelay=110;putDelay=180;doc={value:57,padding:'x'.repeat(2850)};const transport=workingCopyTransport('root','test','r1');const saver=new WorkingCopySaver({schema:'test',baseRevision:'r1',transport,capture:()=>doc,restore:()=>true});
 try{await saver.initialize();const began=performance.now();saver.edit();await delay(20);doc={value:58,padding:'x'.repeat(2850)};saver.edit();await saver.flush();const ms=performance.now()-began;assert.equal(saver.snapshot().state,'saved');assert.equal(puts.length,2);assert.ok(ms<=500,`covering ack took ${ms.toFixed(1)}ms`);assert.equal(globalThis.__r3AuthCalls,0);console.log(`Round 3 burst: ${ms.toFixed(1)}ms, auth calls ${globalThis.__r3AuthCalls}, PUT bytes ${JSON.stringify(puts.at(-1)).length}`);}finally{saver.dispose();}
});

test('VS13: remote room hydration in a non-writer does not falsely conflict on open',async()=>{
 const room={doc:new Doc(),isSaver:false,status:'synced'};const view=await mount({...spec(),writer:false,shared:true,room,recovery:undefined,sharedSaveState:'saved'});
 try{await act(async()=>{room.doc.transact(()=>room.doc.getMap('body').set('loaded',true),room);await settle();});await view.update({revision:1});assert.equal(view.current.conflict,false);assert.equal(view.current.state,'saved');assert.equal(puts.length,0);}finally{await view.close();room.doc.destroy();}
});

test('opening GET 404: a real input remains pending until its first conditional PUT acknowledges',async()=>{
 const pending=deferred();readBarrier=pending.promise;const view=await mount(spec());
 try{doc={value:59};await act(async()=>recordUserMutation('root'));await view.update({revision:1,dirty:true});assert.equal(view.current.pending,true);assert.equal(view.current.state,'saving');assert.equal(puts.length,0);await act(async()=>{pending.resolve();await settle();});assert.equal(puts.length,1);assert.equal(puts[0].if_seq,null);assert.equal(puts[0].doc.value,59);assert.equal(view.current.state,'saved');}finally{await view.close();}
});

test('opening existing GET: a real concurrent local input is protected instead of overwritten by restore',async()=>{
 copy=existing();const pending=deferred();readBarrier=pending.promise;const view=await mount(spec());
 try{doc={value:59};await act(async()=>recordUserMutation('root'));await view.update({revision:1,dirty:true});await act(async()=>{pending.resolve();await settle();});assert.equal(doc.value,59);assert.equal(puts.length,0);assert.equal(view.current.conflict,true);assert.equal(view.current.pending,true);}finally{await view.close();}
});

test('VS3: reopened existing-copy offline PUT resumes with the restored seq on online',async()=>{
 copy=existing();const view=await mount(spec()),onlineFetch=globalThis.fetch;
 try{globalThis.fetch=async(url,init)=>{if(init.method==='PUT')throw new TypeError('Failed to fetch');return onlineFetch(url,init);};doc={value:59};await view.update({revision:1,dirty:true});assert.equal(view.current.state,'error');globalThis.fetch=onlineFetch;await act(async()=>{window.dispatchEvent(new window.Event('online'));await settle();});assert.equal(view.current.state,'saved');assert.equal(puts[0].if_seq,77);assert.equal(puts[0].doc.value,59);}finally{globalThis.fetch=onlineFetch;await view.close();}
});

test('opening GET failure retains backoff and online recovery instead of immediately spinning reads',async()=>{
 copy=existing();const onlineFetch=globalThis.fetch;let offline=true;globalThis.fetch=async(...args)=>{if(offline){reads++;throw new TypeError('Failed to fetch');}return onlineFetch(...args);};const view=await mount(spec());
 try{await act(async()=>{await delay(20);});assert.equal(reads,1);assert.equal(view.current.state,'error');offline=false;await act(async()=>{window.dispatchEvent(new window.Event('online'));await settle();});assert.equal(view.current.state,'saved');doc={value:59};await view.update({revision:1,dirty:true});assert.equal(puts[0].if_seq,77);assert.equal(view.current.state,'saved');}finally{globalThis.fetch=onlineFetch;await view.close();}
});
