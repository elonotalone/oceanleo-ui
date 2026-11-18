import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import '../../../tests/helpers/w1-jsdom-window.mjs';
import { compileModule, dataModule } from '../../../tests/helpers/module-bench.mjs';
const { createRoot } = await import('react-dom/client');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const i18n = dataModule('export const useWebsiteUI=()=> (s,v)=>s.replace(/\\{(\\w+)\\}/g,(_,k)=>v?.[k]||k); export const useWebsiteLanguage=()=>"zh";');
const ids = ['static', 'request_billed', 'server', 'heavy', 'own_accounts'];
globalThis.__tierRows = ids.map(id => ({ id, label: id, label_zh: id, audience: id+' audience', available: true, sample: { tier_id: id }, can_run: 'HTML', billing: 'Cost' }));
const pickerModule = await compileModule('src/shell/website-platform/HostingTierChoice.tsx', {
  './website-preview-i18n': i18n,
  '../works-workbench/WorkWorkbench': dataModule('export function WorkWorkbench({workId}){return workId;}'),
  '../../api/website-connectors': dataModule('export const websiteConnectorsApi={tiers:async()=>{if(globalThis.__tierError)throw Error("offline");return globalThis.__tierRows;},createSample:async(id)=>{globalThis.__samples.push(id);return {project:{project_id:"11111111-1111-4111-8111-111111111111"}};}};'),
});
const { HostingTierChoice } = await import(pickerModule);
globalThis.__creates = [];
const { CreateWebsiteEntry } = await import(await compileModule('src/shell/website-platform/create-website-entry.tsx', {
  './HostingTierChoice': pickerModule, './website-preview-i18n': i18n,
  '../collection-chrome': dataModule('export const COLLECTION_ACTION_BTN_PRIMARY="rounded bg-stone-800";'),
  './create-website': dataModule('export async function createWebsiteFromDescription(...args){globalThis.__creates.push(args); return {item:{artifactId:"artifact"}};}'),
}));
async function mount(Component, props) {
  const host=document.createElement('div'); document.body.append(host);const root=createRoot(host);
  await act(async()=>root.render(React.createElement(Component, props)));
  return {host, async destroy(){await act(async()=>root.unmount());host.remove();}};
}
const click = async node => { assert.ok(node); await act(async()=>node.click()); };
async function type(node, value) {await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(node,value);node.dispatchEvent(new window.Event('input',{bubbles:true}));});}
const submit = async host => {await act(async()=>host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));};

test('new work shows every tier and sample, submits only the user choice, and resets on reopen',async()=>{
  const opened=[]; globalThis.__creates=[];
  const m=await mount(CreateWebsiteEntry,{kind:'game',onCreated:item=>opened.push(item)});
  try {
    await click(m.host.querySelector('[data-library-create-website]'));
    assert.equal(m.host.querySelectorAll('input[type=radio]').length,5);
    assert.equal(m.host.querySelectorAll('input:checked').length,0);
    assert.match(m.host.textContent,/样板作品：.*小组任务板/);
    await type(m.host.querySelector('textarea'),'a portfolio');
    assert.equal(m.host.querySelector('[type=submit]').disabled,true);
    await submit(m.host); assert.equal(globalThis.__creates.length,0);
    await click(m.host.querySelector('input[value=request_billed]'));
    assert.equal(m.host.querySelector('[type=submit]').disabled,false);
    await submit(m.host);
    assert.deepEqual(globalThis.__creates,[['a portfolio','request_billed','game']]);
    assert.equal(opened.length,1);
    await click(m.host.querySelector('[data-library-create-website]'));
    assert.equal(m.host.querySelectorAll('input:checked').length,0);
  } finally {await m.destroy();}
});

test('unavailable and failed catalogs never select a fallback',async()=>{
  const saved=globalThis.__tierRows;
  globalThis.__tierRows=ids.map(id=>({...saved.find(row=>row.id===id),available:false,status:'not_ready'}));
  let choice='';const m=await mount(HostingTierChoice,{value:'',onChange:value=>{choice=value;}});
  try {for(const radio of m.host.querySelectorAll('input'))assert.equal(radio.disabled,true); assert.equal(choice,'');}
  finally {await m.destroy();globalThis.__tierRows=saved;}
  globalThis.__tierError=true;const failed=await mount(HostingTierChoice,{value:'',onChange:value=>{choice=value;}});
  try {assert.match(failed.host.querySelector('[role=alert]').textContent,/暂时无法读取/);assert.equal(failed.host.querySelectorAll('input').length,0);assert.equal(choice,'');}
  finally {await failed.destroy();delete globalThis.__tierError;}
});

test('client helper refuses omission before authentication or request',async()=>{
  const api=await import(await compileModule('src/shell/website-platform/create-website.ts',{
    '../../lib/auth/client':dataModule('export async function accessToken(){throw Error("auth must not run");}'),
    '../../lib/auth/config':dataModule('export const GATEWAY_BASE="https://gateway.invalid";'),
    '../artifact-client':dataModule('export async function getArtifactItem(){throw Error("must not load");}'),
  }));
  await assert.rejects(()=>api.createWebsiteFromDescription('a work',undefined),/请先选择服务层级/);
  await assert.rejects(()=>api.createWebsiteFromDescription('a work','imported_project'),/请先选择服务层级/);
});

const { ProjectImportPanel } = await import(await compileModule('src/shell/project-import/ProjectImportPanel.tsx', {
  '../website-platform/HostingTierChoice': pickerModule,
  './project-import-client': dataModule(`export const formatBytes=n=>String(n);export const isZipFile=f=>f.name.endsWith('.zip');export const collectPickedFolder=()=>[];export const previewProjectImport=async()=>({ok:false,error:'empty'});export async function importProjectArchive(file,options){globalThis.__importTier=options.tier;return {ok:true,value:{project:{project_id:'imported'},import:{warnings:[],skipped_groups:[],files:[]}}};}export const importProjectFolder=importProjectArchive;`),
}));
test('zip import also requires a fresh explicit tier before upload',async()=>{
  delete globalThis.__importTier;const imported=[];const m=await mount(ProjectImportPanel,{onImported:project=>imported.push(project)});
  try {
    const file=m.host.querySelector('input[accept]');
    await act(async()=>{Object.defineProperty(file,'files',{value:[new window.File(['zip'],'project.zip',{type:'application/zip'})]});file.dispatchEvent(new window.Event('change',{bubbles:true}));});
    const start=[...m.host.querySelectorAll('button')].find(node=>node.textContent==='开始导入');
    assert.equal(start.disabled,true);assert.equal(m.host.querySelectorAll('input:checked').length,0);
    await click(start);assert.equal(globalThis.__importTier,undefined);
    await click(m.host.querySelector('input[value=own_accounts]'));
    assert.equal(start.disabled,false);await click(start);assert.equal(globalThis.__importTier,'own_accounts');assert.equal(imported.length,1);
  } finally {await m.destroy();}
});

test('valid create transport sends the exact tier with the kind',async()=>{
  let sent; const previous=globalThis.fetch;
  const api=await import(await compileModule('src/shell/website-platform/create-website.ts',{
    '../../lib/auth/client':dataModule('export async function accessToken(){return null;}'),
    '../../lib/auth/config':dataModule('export const GATEWAY_BASE="https://gateway.invalid";'),
    '../artifact-client':dataModule('export async function getArtifactItem(){return {ok:true,data:{artifactId:"artifact"}};}'),
  }));
  globalThis.fetch=async(url,init)=>{sent={url,body:JSON.parse(init.body)};return {ok:true,json:async()=>({project_id:'project',artifact_id:'artifact',artifact_revision_id:'revision'})};};
  try {await api.createWebsiteFromDescription('a work','own_accounts','app');assert.deepEqual(sent.body,{request:'a work',kind:'app',tier:'own_accounts'});}
  finally {globalThis.fetch=previous;}
});

test('folder and zip transport reject missing tier before looking up account state',async()=>{
  const api=await import(await compileModule('src/shell/project-import/project-import-client.ts',{
    '../../lib/auth/config':dataModule('export const GATEWAY_BASE="https://gateway.invalid";'),
    '../../lib/auth/client':dataModule('export async function accessToken(){throw Error("account must not load");}'),
  }));
  assert.deepEqual(await api.importProjectArchive(new window.File(['x'],'work.zip')),{ok:false,error:'请先选择服务层级。'});
  assert.deepEqual(await api.importProjectFolder([],{}),{ok:false,error:'请先选择服务层级。'});
});


test('sample creation follows an explicit tier click and reopens its receipt without duplication',async()=>{
  globalThis.__samples=[];const choices=[];const m=await mount(HostingTierChoice,{value:'',onChange:value=>choices.push(value)});
  try {
    assert.deepEqual(globalThis.__samples,[]);
    const sampleButton=m.host.querySelector('[data-tier-id=server] button');
    await click(sampleButton);
    assert.deepEqual(globalThis.__samples,['server']);
    assert.ok(document.querySelector('[data-hosting-tier-sample]'));
    await click(document.querySelector('[data-hosting-tier-sample] button'));
    assert.equal(choices.at(-1),'server');
    await click(m.host.querySelector('[data-tier-id=server] button'));
    assert.deepEqual(globalThis.__samples,['server']);
  } finally {await m.destroy();}
});
