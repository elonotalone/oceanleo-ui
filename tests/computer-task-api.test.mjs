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
