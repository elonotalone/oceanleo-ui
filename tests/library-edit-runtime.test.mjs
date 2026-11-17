import assert from 'node:assert/strict';
import test from 'node:test';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
const agent = dataModule(`export const createTask=(...args)=>globalThis.__UAI_API.create(...args);export const getTask=(...args)=>globalThis.__UAI_API.get(...args);export const stopTask=(...args)=>globalThis.__UAI_API.stop(...args);`);
const artifact = dataModule(`export const getArtifactItem=(...args)=>globalThis.__UAI_API.item(...args);export const getCurrentArtifactItem=(...args)=>globalThis.__UAI_API.head(...args);export const createArtifactRevision=(...args)=>globalThis.__UAI_API.revision(...args);`);
const runtime=await import(await compileModule('src/shell/plugin-command/library-edit-runtime.ts', {'../../lib/agent':agent,'../artifact-client':artifact}));
const previous={id:'a',artifactId:'a',revisionId:'r1',artifact:{artifactType:'composite_image',owner:{visibility:'private'},sourceFormat:'json',provenance:{licenseCode:'CC-BY-4.0'},renditions:{source:{purpose:'source',url:'/source/r1',digest:'sha256:source'},full:{purpose:'full',url:'/full/r1',digest:'sha256:full'},editor_manifest:{purpose:'editor_manifest',url:'/project/r1',digest:'sha256:project'}},scene:{schema:'scene.v1',closureDigest:'closure',dependencyRevisionIds:['dep-r1']}}};
test('ordinary task transport includes item context, attachments, payer, session and selected execution target',async()=>{
 let sent;globalThis.__UAI_API={create:async body=>{sent=body;return{ok:true,data:{task_id:'task-1'}}}};
 const result=await runtime.createLibraryEditPorts('site','session').create('Change it','structured context',{attachments:[{artifact_id:'extra',url:''}],orgId:'org',sessionId:'saved-session',executionTarget:{kind:'cloud'}});
 assert.equal(result,'task-1');assert.equal(sent.mode,'agent');assert.equal(sent.hiddenContext,'structured context');assert.equal(sent.sessionId,'saved-session');assert.equal(sent.orgId,'org');assert.equal(sent.attachments[0].artifact_id,'extra');
});
test('failed task with a revision conflict is reported as conflict rather than success',async()=>{
 globalThis.__UAI_API={get:async()=>({ok:true,data:{task:{status:'failed'},messages:[{role:'assistant',kind:'text',content:'version changed'},{role:'assistant',kind:'step',content:'revision_conflict'}]}})};
 const status=await runtime.createLibraryEditPorts().status('task-1');assert.equal(status.conflict,true);assert.equal(status.status,'failed');assert.equal(status.note,'version changed');
});
test('restore reuses previous delivery, editor project and dependency closure with current CAS; no new item is created',async()=>{
 let commit,read;globalThis.__UAI_API={item:async(...args)=>{read=args;return{ok:true,data:previous}},revision:async(id,body)=>{commit={id,body};return{ok:true,data:{...previous,revisionId:'r3'}}}};
 const result=await runtime.createLibraryEditPorts().restore(previous,'r2');assert.deepEqual(read,['a','r1']);assert.equal(commit.id,'a');assert.equal(commit.body.expectedRevisionId,'r2');assert.equal(commit.body.source.url,'/source/r1');assert.equal(commit.body.renditions.find(r=>r.purpose==='editor_manifest').url,'/project/r1');assert.deepEqual(commit.body.scene.dependencyRevisionIds,['dep-r1']);assert.equal(commit.body.provenance.licenseCode,'CC-BY-4.0');assert.equal(result.artifactId,'a');
});
test('Library detail uses whole file context and verifies the pinned revision without an editor',async()=>{
 globalThis.__UAI_API={head:async()=>({ok:true,data:previous})};const binding=runtime.libraryDetailBinding(previous);assert.ok(binding.writable());assert.deepEqual(binding.context().selection,{kind:'whole-file'});assert.equal((await binding.save()).revisionId,'r1');
 globalThis.__UAI_API.head=async()=>({ok:true,data:{...previous,revisionId:'other'}});await assert.rejects(()=>binding.save(),/revision_conflict/);
});
test('binding unmount is identity-aware and running task state is retained across drawer remounts',()=>{
 const flow=runtime.libraryEditFlow('scope',previous);assert.equal(runtime.libraryEditFlow('scope',previous),flow);assert.notEqual(runtime.libraryEditFlow('other-scope',previous),flow);
});
test('an unconfirmed task receipt with a task id resumes that exact task without dispatching again',async()=>{
 let creates=0;globalThis.__UAI_API={create:async()=>{creates++;return{ok:false,status:503,error:'LOCAL_AGENT_DISPATCH_UNCONFIRMED',detail:{code:'LOCAL_AGENT_DISPATCH_UNCONFIRMED',task_id:'task-accepted'},executionTarget:{kind:'device'}}}};
 assert.equal(await runtime.createLibraryEditPorts().create('Edit','context'),'task-accepted');assert.equal(creates,1);
});
test('a computer task with an open turn remains running even when its task row has finished',async()=>{
 globalThis.__UAI_API={get:async()=>({ok:true,data:{task:{status:'done',open_turn:true},messages:[]}})};assert.equal((await runtime.createLibraryEditPorts().status('t1')).status,'running');
});
