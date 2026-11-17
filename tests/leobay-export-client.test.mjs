import assert from 'node:assert/strict';
import test from 'node:test';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
const stubAuth=dataModule('export async function accessToken(){return "test-only-token";}');
const stubConfig=dataModule('export const GATEWAY_BASE="https://gateway.test";');
const stubPayer=dataModule('export function payerRequestFields(){return {org_id:"org-test"};}');
const url=await compileModule('src/shell/doc-editors/export-client.ts',{
  '../../lib/auth/client':stubAuth,'../../lib/auth/config':stubConfig,'../../lib/payer':stubPayer,
  './generated-pdf-metadata':dataModule('export async function labelGeneratedPdf(blob,generated){return new Blob([await blob.text(), generated ? "-labelled" : ""]);}'),
});
const api=await import(url);
const originalFetch=globalThis.fetch;
test.after(()=>{globalThis.fetch=originalFetch;});

test('capabilities coalesce concurrent requests and cache successful responses',async()=>{
  let requests=0;
  globalThis.fetch=async(url,options)=>{requests++;assert.ok(url.endsWith('/v1/convert/capabilities'));assert.equal(options.credentials,'omit');return Response.json({sources:{pdf:[{target:'docx',where:'server',label:'DOCX'}]}});};
  const [first,second]=await Promise.all([api.loadExportCapabilities(),api.loadExportCapabilities()]);
  assert.equal(requests,1);assert.equal(first,second);assert.equal(await api.loadExportCapabilities(),first);assert.equal(requests,1);
});
test('binary download conversions dispatch office, image and media without creating Library items',async()=>{
  const calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(new Blob(['converted']),{status:200});};
  for (const [filename,target,path] of [['source.pdf','docx','office'],['source.pptx','png-zip','office'],['source.svg','pdf','image'],['source.mp4','mp3','media']]) {
    const result=await api.convertExportFile({blob:new Blob(['source']),filename},target);
    assert.equal(await result.text(),'converted');const call=calls.at(-1);
    assert.ok(call.url.endsWith(`/v1/convert/${path}`));assert.equal(call.options.body.get('target'),target);
    assert.equal(call.options.body.get('file').name,filename);assert.equal(call.options.credentials,'include');
  }
  const source={blob:new Blob(['unchanged']),filename:'same.pdf'};assert.equal(await api.convertExportFile(source,'pdf'),source.blob);assert.equal(calls.length,4);
});
test('save submits edited bytes and both parent pins; links to the returned new item',async()=>{
  const parent={title:'Edited',artifactId:'parent',revisionId:'r2',meta:{}};
  globalThis.fetch=async(url,options)=>{
    assert.ok(url.endsWith('/v1/convert/save'));assert.equal(options.method,'POST');
    assert.equal(options.body.get('parent_artifact_id'),'parent');assert.equal(options.body.get('parent_revision_id'),'r2');
    assert.equal(options.body.get('title'),'Edited');assert.equal(options.body.get('target'),'pdf');
    assert.equal(await options.body.get('file').text(),'current edits');
    return Response.json({artifactId:'new item',revisionId:'new/rev'});
  };
  const saved=await api.saveExportToLibrary({blob:new Blob(['current edits']),filename:'edited.docx'},'pdf',parent);
  assert.equal(api.libraryExportHref(saved),'/library?item=new%20item&revisionId=new%2Frev');
});
test('failed conversion and invalid saved identity fail visibly',async()=>{
  globalThis.fetch=async()=>Response.json({detail:'No audio track'},{status:422});
  await assert.rejects(api.convertExportFile({blob:new Blob(['source']),filename:'video.mp4'},'mp3'),/No audio track/);
  globalThis.fetch=async()=>Response.json({ok:true});
  await assert.rejects(api.saveExportToLibrary({blob:new Blob(['source']),filename:'x.pdf'},'pdf',{title:'x'}),/导出失败/);
  globalThis.fetch=async()=>new Response(new Blob([]));
  await assert.rejects(api.convertExportFile({blob:new Blob(['source']),filename:'x.docx'},'pdf'),/导出失败/);
});

test('Library PDF → Word and Markdown use server bytes; PDF never passes through blob.text()',async()=>{
  const converted=[];const downloaded=[];let readText=0;
  const pdf=new Blob(['%PDF-binary'],{type:'application/pdf'});pdf.text=()=>{readText++;throw new Error('PDF decoded as text');};
  const mod=await import(await compileModule('src/shell/library-document-export.ts',{
    './artifact-client':dataModule('export async function getArtifactDownload(){return {ok:true,data:{url:"https://files.test/source.pdf",filename:"source.pdf",mediaType:"application/pdf"}};}'),
    './library-data':dataModule('export function isDurableLibraryItem(){return true;}'),
    './doc-editors/office-file':dataModule('export function officePackageKindForItem(){return null;}'),
    './doc-editors/office-convert-client':dataModule('export async function convertOfficeBlob(blob,name,target){globalThis.__udlConverted.push({blob,name,target});return new Blob(["converted-"+target]);}'),
  }));
  globalThis.__udlConverted=converted;
  const savedDoc=globalThis.document,savedWin=globalThis.window,savedCreate=URL.createObjectURL,savedRevoke=URL.revokeObjectURL;
  globalThis.document={createElement(){return {click(){downloaded.push(this.download);}};}};
  globalThis.window={setTimeout(fn){fn();}};URL.createObjectURL=()=> 'blob:test';URL.revokeObjectURL=()=>{};
  globalThis.fetch=async()=>({ok:true,blob:async()=>pdf});
  try {
    const item={kind:'document',title:'Report',artifactType:'pdf',meta:{filename:'report.pdf',mime:'application/pdf'},artifact:{renditions:{source:{mediaType:'application/pdf'}}}};
    assert.equal(await mod.downloadLibraryDocument(item,'docx'),'');assert.equal(await mod.downloadLibraryDocument(item,'md'),'');
    assert.equal(readText,0);assert.deepEqual(converted.map(c=>c.target),['docx','md']);assert.deepEqual(downloaded,['Report.docx','Report.md']);
  } finally {globalThis.document=savedDoc;globalThis.window=savedWin;URL.createObjectURL=savedCreate;URL.revokeObjectURL=savedRevoke;delete globalThis.__udlConverted;}
});

test('generated document PDF downloads retain their existing generation metadata step',async()=>{
  globalThis.fetch=async()=>new Response(new Blob(['converted-pdf']));
  const blob=await api.convertExportFile({blob:new Blob(['docx']),filename:'generated.docx',generated:true},'pdf');
  assert.equal(await blob.text(),'converted-pdf-labelled');
});
