import assert from 'node:assert/strict';
import test from 'node:test';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
const requests=[]; let response;
const {gameProjectApi:api}=await import(await compileModule('src/shell/game-editor/game-project-api.ts',{
  '../../lib/agent':dataModule('export const authed = (...args) => globalThis.__gc3Request(...args);'),
  './game-project-storage':dataModule('export const loadGameProject=async()=>globalThis.__gc3Project; export const saveGameProject=async()=>({revisionId:"v2"});'),
  '../artifact-client':dataModule('export const getCurrentArtifactItem = (...args) => globalThis.__gc3Current(...args);'),
}));
globalThis.__gc3Request=async(...args)=>{requests.push(args);return response;};
globalThis.__gc3Current=async id=>({ok:true,data:{artifactId:id,revisionId:'v2'}});
const p={schema:'game-project@1',title:'Game',entrypoint:'index.html',orientation:'both',controls:['touch'],files:[{path:'index.html',sha256:'a'.repeat(64),byteSize:1,mediaType:'text/html',content:'x'}]};
test('project reads use artifact storage and text files remain selectable', async()=>{
  globalThis.__gc3Project=p;
  assert.equal((await api.load('id')).schema,'game-project@1');
  assert.equal(await api.file('id','index.html'),'x');
  await assert.rejects(api.file('id','missing.js'),/无法读取/);
});
test('iteration returns job identity and validates progress phases',async()=>{
  response={ok:true,data:{jobId:'j/1'}}; assert.equal(await api.iterate('id','v1','waves'),'j/1');
  assert.equal(requests.at(-1)[0],'/v1/games/id/iterate');
  assert.deepEqual(JSON.parse(requests.at(-1)[1].body),{brief:'waves',expectedRevisionId:'v1'});
  response={ok:true,data:{phase:'art',progress:25}}; assert.equal((await api.job('j/1')).phase,'art');assert.equal(requests.at(-1)[0],'/v1/games/jobs/j%2F1');
  response={ok:true,data:{phase:'unknown',progress:101}};await assert.rejects(api.job('x'),/状态无效/);
  response={ok:true,data:{}};await assert.rejects(api.iterate('id','v1','x'),/没有创建/);
});
test('UC-1: API rejects trusted-origin play URL and adopts current artifact after jobs',async()=>{
  response={ok:true,data:{url:'https://oceanleo.com/game'}};await assert.rejects(api.play('id'),/隔离域/);
  response={ok:true,data:{url:'https://p-1.oceanleo.app/index.html',orientation:'both'}};assert.equal((await api.play('id')).orientation,'both');
  assert.equal((await api.current('id')).revisionId,'v2');
});
