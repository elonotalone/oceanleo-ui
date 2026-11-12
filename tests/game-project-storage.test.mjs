import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
const hash = content => createHash('sha256').update(content).digest('hex');
const source='<!doctype html><html>海岸</html>';const image=Buffer.from([1,2,3,4]);
const project={schema:'game-project@1',entrypoint:'index.html',title:'海岸',orientation:'both',controls:['touch'],files:[
  {path:'index.html',sha256:hash(source),byteSize:Buffer.byteLength(source),mediaType:'text/html',content:source},
  {path:'art/a.webp',sha256:hash(image),byteSize:4,mediaType:'image/webp'},
],blobs:{[hash(source)]:Buffer.from(source).toString('base64'),[hash(image)]:image.toString('base64')}};
const artifact={artifactId:'id',revisionId:'v1',access:{canEdit:true},renditions:{source:{url:'https://signed.test/source'},preview:{url:'https://signed.test/cover',digest:'c'.repeat(64)}}};
let current, staged, committed, failStage, failCommit, fetched;
const {loadGameProject,saveGameProject,serializeGameProject}=await import(await compileModule('src/shell/game-editor/game-project-storage.ts',{
  '../artifact-client':dataModule(`export const getCurrentArtifactItem=async()=>globalThis.__storageCurrent();export const stageArtifactBlob=(...args)=>globalThis.__storageStage(...args);export const createArtifactRevision=(...args)=>globalThis.__storageCommit(...args);`),
  '../../lib/media-proxy':dataModule(`export const fetchMediaBlob=(...args)=>globalThis.__storageFetch(...args);`),
}));
test.beforeEach(()=>{
 current={ok:true,data:{artifact}};staged=[];committed=[];failStage=false;failCommit=false;fetched=[];
 globalThis.__storageCurrent=()=>current;
 globalThis.__storageFetch=(...args)=>{fetched.push(args);return new Blob([JSON.stringify(project)]);};
 globalThis.__storageStage=async(id,file)=>{staged.push({id,text:await file.text()});return failStage?{ok:false,error:'staging failed'}:{ok:true,data:{blobId:'private:blob',digest:'d'.repeat(64)}};};
 globalThis.__storageCommit=(...args)=>{committed.push(args);return failCommit?{ok:false,error:'conflict'}:{ok:true,data:{artifact:{...artifact,revisionId:'v2'}}};};
});
test('loads the current signed artifact source and remembers the exact revision',async()=>{
 const read=await loadGameProject('id');assert.equal(read.loadedRevisionId,'v1');assert.equal(read.files[0].content,source);
 assert.equal(fetched[0][0],'https://signed.test/source');assert.equal(fetched[0][1].maxBytes,85*1024*1024);
});
test('serialization rehashes UTF-8 edits and retains every unchanged asset',async()=>{
 const json=JSON.parse(await serializeGameProject(project,{'index.html':'<html>新游戏</html>'}));
 assert.equal(json.files[0].sha256,hash('<html>新游戏</html>'));
 assert.equal(Buffer.from(json.blobs[json.files[0].sha256],'base64').toString(),'<html>新游戏</html>');
 assert.equal(json.blobs[hash(image)],image.toString('base64'));
 assert.equal(json.blobs[hash(source)],undefined);
});
test('private staging commits one CAS revision with complete project and stale-cover notice',async()=>{
 const saved=await saveGameProject('id','v1',project,{'index.html':'<html>new</html>'});assert.equal(saved.revisionId,'v2');
 assert.equal(staged.length,2);assert.equal(committed.length,1);
 const body=committed[0][1];assert.equal(body.expectedRevisionId,'v1');assert.equal(body.source.format,'game-project@1');assert.equal(body.source.blobId,'private:blob');
 assert.deepEqual(body.renditions.map(x=>x.purpose),['full','preview','editor_manifest']);assert.equal(body.metadata.cover_stale,true);
 assert.deepEqual(JSON.parse(staged[0].text).files.map(x=>x.path),['index.html','art/a.webp']);
});
test('conflicts, read-only legacy, missing closure bytes and staging failures never commit',async()=>{
 await assert.rejects(saveGameProject('id','old',project,{}),/新版本/);assert.equal(staged.length,0);
 await assert.rejects(saveGameProject('id','v1',{...project,readOnly:true},{}),/只读/);
 await assert.rejects(saveGameProject('id','v1',{...project,blobs:{}},{}),/素材缺失/);
 failStage=true;await assert.rejects(saveGameProject('id','v1',project,{}),/staging failed/);assert.equal(committed.length,0);
});
test('commit failure is surfaced and abort stops before staging',async()=>{
 failCommit=true;await assert.rejects(saveGameProject('id','v1',project,{}),/conflict/);
 staged=[];const controller=new AbortController();controller.abort();await assert.rejects(saveGameProject('id','v1',project,{},controller.signal));assert.equal(staged.length,0);
});
