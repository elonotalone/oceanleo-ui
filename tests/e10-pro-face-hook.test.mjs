import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
const gate = await import(await compileModule('src/shell/advanced-routes/editor-handoff.ts', {
  '../office-editor/useOfficeArtifactSource':dataModule('export const useOfficeArtifactSource=()=>({});'),
}));
// Actual hook with a deterministic React lifecycle, including effect cleanup on key changes.
function mount() {
  const slots=[];let cursor=0;let effects=[];
  const react={
    useMemo(fn,deps){const i=cursor++;if(!slots[i]||deps.some((d,j)=>d!==slots[i].deps[j]))slots[i]={deps,value:fn()};return slots[i].value;},
    useEffect(fn,deps){const i=cursor++;if(!slots[i]||deps.some((d,j)=>d!==slots[i].deps[j])){slots[i]?.cleanup?.();slots[i]={deps};effects.push(()=>{slots[i].cleanup=fn()})}},
  };
  const exports={};
  vm.runInNewContext(ts.transpileModule(readFileSync('src/shell/advanced-routes/use-pro-face-save.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>n==='react'?react:gate});
  return {render(key,dirty,rev,save){cursor=0;const flush=exports.useProFaceSave(key,dirty,rev,save);effects.splice(0).forEach(f=>f());return flush;},unmount(){slots.forEach(s=>s.cleanup?.())}};
}
test('E10 shared flush deduplicates concurrent work and leave-pro never waits or locks',async()=>{
  gate.resetEditorHandoffForTests();const host=mount();let calls=0,finish;
  const save=()=>{calls++;return new Promise(resolve=>finish=resolve)};
  const flush=host.render('a',true,1,save);const first=flush();assert.equal(flush(),first);await Promise.resolve();assert.equal(calls,1);
  host.render('a',true,2,save);
  const leaving=gate.saveBeforeLeavePro('a');
  assert.equal(await leaving,true,'saveBeforeLeavePro must not block setMode');
  finish({ok:true});assert.equal((await first).ok,true);
  host.unmount();
});
test('E10 key changes isolate pending saves and cleanup does not remove the next owner',async()=>{
  gate.resetEditorHandoffForTests();const host=mount();let finish;
  const old=host.render('a',true,1,()=>new Promise(resolve=>finish=resolve));const pending=old();await Promise.resolve();
  const fresh=host.render('b',true,1,async()=>({ok:true,owner:'b'}));assert.equal(gate.hasUnsavedProChanges('a'),false);
  assert.equal((await fresh()).owner,'b');finish({ok:true,owner:'a'});assert.equal((await pending).owner,'a');
  assert.equal((await old()).owner,'a');host.unmount();assert.equal(gate.hasUnsavedProChanges('b'),false);
});
test('E10 failed saves release their flight for retry, including after unmount; leave-pro still returns true',async()=>{
  const host=mount();let calls=0;const flush=host.render('retry',true,1,async()=>{calls++;if(calls===1)throw Error('offline');return {ok:calls>2}});
  const first=flush();
  assert.equal(await gate.saveBeforeLeavePro('retry'),true);
  assert.equal((await first).ok,false);
  host.unmount();
  assert.equal((await flush()).ok,false);
  assert.equal((await flush()).ok,true);
  assert.equal(calls,3);
});
