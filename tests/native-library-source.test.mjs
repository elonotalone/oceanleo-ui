import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const { nativeLibrarySourceOf, readNativeLibraryFile } = await import(await compileModule(process.env.NATIVE_LIBRARY_SOURCE_FILE || "src/shell/native-library-source.ts", {
  "../lib/attachment-url": dataModule("export const PRIVATE_ATTACHMENT_MAX_BYTES=20*1024*1024;export async function resolveAttachmentDisplayUrl(...args){globalThis.__nlsLookups.push(args);return globalThis.__nlsGrant();}"),
}));
const source=(extra={})=>({artifactId:'artifact',revisionId:'revision',name:'selected.txt',mime:'text/plain',...extra});
const gate=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const previousFetch=globalThis.fetch;
test.beforeEach(()=>{globalThis.__nlsLookups=[];globalThis.__nlsGrant=async()=>"https://gateway.test/v1/artifact-renditions/access/private-grant";globalThis.__nlsFetches=[];globalThis.fetch=async(url,options)=>{globalThis.__nlsFetches.push({url,options});return new Response('bytes',{headers:{'content-type':'text/plain','content-length':'5'}});};});
test.afterEach(()=>{globalThis.fetch=previousFetch;delete globalThis.__nlsLookups;delete globalThis.__nlsGrant;delete globalThis.__nlsFetches;});

test("source reader uses the exact private artifact/revision source grant, never a display URL",async()=>{
  // [UC-5 §8.5](../../oceandino/docs/architecture/oceanleo-untrusted-content-isolation.md#85-uc-5-新表必须同时有-rls-与配额): private source grant only; a display/public fallback would bypass the private read boundary.
  const signal=new AbortController().signal;const file=await readNativeLibraryFile(source({url:'https://public.test/preview.png'}),{signal});
  assert.deepEqual(globalThis.__nlsLookups,[[{artifactId:'artifact',revisionId:'revision'},'source']]);
  assert.match(globalThis.__nlsFetches[0].url,/^https:\/\/gateway.test\/v1\/artifact-renditions\/access\//);assert.equal(globalThis.__nlsFetches[0].options.signal,signal);
  assert.equal(file.name,'selected.txt');assert.equal(file.type,'text/plain');assert.equal(await file.text(),'bytes');
});
test("selection snapshot pins source identity and integrity metadata before later host mutations",()=>{
  // [UC-5 §8.5](../../oceandino/docs/architecture/oceanleo-untrusted-content-isolation.md#85-uc-5-新表必须同时有-rls-与配额): client companion pins private source/revision metadata; not a database policy test.
  const item={id:'artifact',artifactId:'artifact',revisionId:'revision',name:'selected.txt',libraryItem:{artifact:{artifactId:'artifact',revisionId:'revision',renditions:{source:{revisionId:'revision',byteSize:5,digest:'a'.repeat(64)}}}}};
  const selected=nativeLibrarySourceOf(item);item.revisionId='new-revision';item.libraryItem.artifact.renditions.source.byteSize=100;
  assert.equal(selected.revisionId,'revision');assert.equal(selected.byteSize,5);assert.equal(selected.metadataMismatch,false);
});
for(const status of [401,403,503])test(`HTTP ${status} is a visible-capable typed read failure`,async()=>{
  // [UC-5 §8.5](../../oceandino/docs/architecture/oceanleo-untrusted-content-isolation.md#85-uc-5-新表必须同时有-rls-与配额): refusal/unavailability of private bytes must not turn into a public fallback.
  globalThis.fetch=async()=>new Response('',{status});await assert.rejects(readNativeLibraryFile(source()),error=>error.name==='NativeLibraryReadError'&&error.code==='source-http-error'&&error.status===status);
});
test("missing/invalid private metadata fails before any source request",async()=>{
  // [UC-5 §8.5](../../oceandino/docs/architecture/oceanleo-untrusted-content-isolation.md#85-uc-5-新表必须同时有-rls-与配额): private-reference and bounded-byte preflight is a client companion, not backend RLS/quota proof.
  for(const value of [{},{artifactId:'a'},source({artifactId:' '}),source({artifactId:7}),source({metadataMismatch:true}),source({byteSize:-1}),source({digest:'invalid'}),source({digest:7}),source({byteSize:20*1024*1024+1})])await assert.rejects(readNativeLibraryFile(value));
  assert.equal(globalThis.__nlsLookups.length,0);assert.equal(globalThis.__nlsFetches.length,0);
});
test("failed source grant cannot silently become a missing file",async()=>{
  // [UC-5 §8.5](../../oceandino/docs/architecture/oceanleo-untrusted-content-isolation.md#85-uc-5-新表必须同时有-rls-与配额): private grant refusal stays a refusal; no alternate public object is fetched.
  globalThis.__nlsGrant=async()=>undefined;await assert.rejects(readNativeLibraryFile(source()),error=>error.code==='source-unavailable');assert.equal(globalThis.__nlsFetches.length,0);
});
test("declared source size, HTTP size and digest mismatches are refused",async()=>{
  // [UC-5 §8.5](../../oceandino/docs/architecture/oceanleo-untrusted-content-isolation.md#85-uc-5-新表必须同时有-rls-与配额): client checks bytes against the selected private revision; this is not a database hard-quota test.
  await assert.rejects(readNativeLibraryFile(source({byteSize:6})),error=>error.code==='source-size-mismatch');
  globalThis.fetch=async()=>new Response('bytes',{headers:{'content-length':'9'}});await assert.rejects(readNativeLibraryFile(source()),error=>error.code==='http-size-mismatch');
  globalThis.fetch=async()=>new Response('bytes');await assert.rejects(readNativeLibraryFile(source({digest:'0'.repeat(64)})),error=>error.code==='source-digest-mismatch');
});
test("exact digest/size match is accepted and encoded Content-Length is not confused with decoded bytes",async()=>{
  // [UC-5 §8.5](../../oceandino/docs/architecture/oceanleo-untrusted-content-isolation.md#85-uc-5-新表必须同时有-rls-与配额): private-source integrity is checked on decoded bytes without weakening the owner-bound source grant.
  globalThis.fetch=async()=>new Response('bytes',{headers:{'content-length':'2','content-encoding':'gzip'}});
  const file=await readNativeLibraryFile(source({byteSize:5,digest:createHash('sha256').update('bytes').digest('hex')}));assert.equal(await file.text(),'bytes');
});
test("cancelled shared grant lookup never starts an owned byte fetch",async()=>{
  // UC-NONE: cancellation ownership, without changing shared grants or backend authorization.
  const held=gate();globalThis.__nlsGrant=()=>held.promise;const controller=new AbortController();const selected=readNativeLibraryFile(source(),{signal:controller.signal});controller.abort();held.resolve('https://gateway.test/v1/artifact-renditions/access/grant');
  await assert.rejects(selected,error=>error.name==='AbortError');assert.equal(globalThis.__nlsFetches.length,0);
});
test("cancelled held byte read ignores late bytes even if a transport does not honor AbortSignal",async()=>{
  // UC-NONE: transport lifecycle cancellation, not RLS or domain isolation coverage.
  const held=gate();globalThis.fetch=async()=>({ok:true,status:200,headers:new Headers(),blob:()=>held.promise});const controller=new AbortController();
  const selected=readNativeLibraryFile(source(),{signal:controller.signal});await Promise.resolve();await Promise.resolve();controller.abort();held.resolve(new Blob(['bytes']));await assert.rejects(selected,error=>error.name==='AbortError');
});
test("body read and network errors retain a typed source failure",async()=>{
  // UC-NONE: network error classification/UX, no security boundary is asserted.
  globalThis.fetch=async()=>{throw Error('network unavailable');};await assert.rejects(readNativeLibraryFile(source()),error=>error.code==='source-unavailable');
  globalThis.fetch=async()=>({ok:true,status:200,headers:new Headers(),async blob(){throw Error('body cut short');}});await assert.rejects(readNativeLibraryFile(source()),error=>error.code==='source-read-error');
});
