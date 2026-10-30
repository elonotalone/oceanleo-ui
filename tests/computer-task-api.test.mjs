import assert from 'node:assert/strict';
import test from 'node:test';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
const calls=[];
globalThis.__computerTaskCalls=calls;
const api=await import(await compileModule('src/lib/computer-task-api.ts',{'./cloud-computer-api':dataModule(`export async function cloudComputerRequest(path,init){globalThis.__computerTaskCalls.push({path,init});return {task_id:'task',session:{id:'s'},sessions:[],frames:[]};}`)}));
test('managed create passes task binding, idempotency and native import without execution fields',async()=>{
 const input={kind:'acp',program:'codex',task_id:'task',native_session_id:'native',request_id:'retry'};
 const result=await api.createComputerTaskSession('cc /',input);
 assert.equal(result.task_id,'task');assert.equal(calls.at(-1).path,'/v1/computers/cc%20%2F/task-sessions');assert.deepEqual(JSON.parse(calls.at(-1).init.body),input);
});
test('offline discovery, bounded transcript and one-time native binding use stable managed identifiers',async()=>{
 const controller=new AbortController();await api.listComputerTaskSessions('t /',{signal:controller.signal});assert.equal(calls.at(-1).path,'/v1/computer-task-sessions?task_id=t+%2F');
 await api.getComputerTaskTranscript('s/',{before:12,limit:100,signal:controller.signal});assert.equal(calls.at(-1).path,'/v1/computer-task-sessions/s%2F/transcript?before=12&limit=100');assert.equal(calls.at(-1).init.signal,controller.signal);
 await api.bindComputerTaskSession('s/','native');assert.equal(calls.at(-1).init.method,'PATCH');assert.deepEqual(JSON.parse(calls.at(-1).init.body),{native_session_id:'native'});
});
const realCloud=await compileModule('src/lib/cloud-computer-api.ts',{'./auth/client':dataModule('export async function accessToken(){return "owner-token"}'),'./auth/config':dataModule('export const GATEWAY_BASE="https://gateway.example";')});
const realApi=await import(await compileModule('src/lib/computer-task-api.ts',{'./cloud-computer-api':realCloud}));
test('actual authenticated gateway client sends managed HTTP and surfaces storage errors',async()=>{
 const old=globalThis.fetch;const fetched=[];
 globalThis.fetch=async(url,init)=>{fetched.push({url,init});return {ok:true,status:200,json:async()=>({task_id:'durable',session:{id:'s'}})}};
 try{
 const result=await realApi.createComputerTaskSession('cc',{kind:'terminal',request_id:'stable'});assert.equal(result.task_id,'durable');assert.equal(fetched[0].url,'https://gateway.example/v1/computers/cc/task-sessions');assert.equal(fetched[0].init.headers.Authorization,'Bearer owner-token');assert.equal(fetched[0].init.credentials,'include');assert.equal(fetched[0].init.cache,'no-store');
 globalThis.fetch=async()=>({ok:false,status:503,json:async()=>({detail:{code:'task_storage_failed',message:'保存会话失败，请重试'}})});
 await assert.rejects(()=>realApi.createComputerTaskSession('cc',{kind:'terminal',request_id:'stable'}),error=>error.status===503&&error.message==='保存会话失败，请重试');
 }finally{globalThis.fetch=old;}
});
const sharedCalls=[];globalThis.__sharedCalls=sharedCalls;
const shared=await import(await compileModule('src/lib/computer-task-api.ts',{'./cloud-computer-api':dataModule(`export async function cloudComputerRequest(path,init){globalThis.__sharedCalls.push(path);await new Promise(r=>setTimeout(r,5));
 if(path.startsWith('/v1/computers/')&&!path.includes('/task-sessions'))return {id:decodeURIComponent(path.split('/')[3]),name:'elon',node_online:globalThis.__sharedOnline!==false};
 if(path.startsWith('/v1/computer-task-sessions?'))return {sessions:[{id:'listed',task_id:'t',computer_id:'cc',native_session_id:null}]};
 return {task_id:'t',session:{id:'created',task_id:'t',computer_id:'cc',native_session_id:null}};}`)}));
test('concurrent list reads share one request and remember the rows; created and bound rows are remembered',async()=>{
 sharedCalls.length=0;
 const [a,b]=await Promise.all([shared.listComputerTaskSessions('t'),shared.listComputerTaskSessions('t')]);
 assert.equal(sharedCalls.filter(p=>p.startsWith('/v1/computer-task-sessions?')).length,1,'one request for two readers');assert.equal(a,b);
 assert.equal(shared.knownComputerTaskSession('listed').task_id,'t');
 await shared.createComputerTaskSession('cc',{kind:'acp',program:'codex',request_id:'r'});
 assert.equal(shared.knownComputerTaskSession('created').computer_id,'cc','a session created in this tab is known at once');
 shared.rememberComputerTaskSession({id:'created',task_id:'t',computer_id:'cc',native_session_id:'nat'});
 shared.rememberComputerTaskSession({id:'created',task_id:'t',computer_id:'cc',native_session_id:null});
 assert.equal(shared.knownComputerTaskSession('created').native_session_id,'nat','an older copy never drops a bound native id');
 assert.equal(shared.knownComputerTaskSession(''),null);
});
test('computers: one shared read, remembered for the next page, watchers see newer reads',async()=>{
 sharedCalls.length=0;
 assert.equal(shared.knownComputer('cc_w'),null);
 const seen=[];const stop=shared.watchComputer('cc_w',row=>seen.push(row.node_online));
 const [x,y]=await Promise.all([shared.loadComputer('cc_w'),shared.loadComputer('cc_w')]);
 assert.equal(sharedCalls.filter(p=>p==='/v1/computers/cc_w').length,1);assert.equal(x,y);
 assert.equal(shared.knownComputer('cc_w').id,'cc_w');
 globalThis.__sharedOnline=false;await shared.loadComputer('cc_w');globalThis.__sharedOnline=true;
 assert.deepEqual(seen,[true,false]);
 stop();shared.rememberComputer({id:'cc_w',name:'elon',node_online:true});
 assert.deepEqual(seen,[true,false],'unsubscribed');
});
