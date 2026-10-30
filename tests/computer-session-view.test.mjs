import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/computers/cc_1?card=terminal",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLButtonElement: window.HTMLButtonElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  localStorage: window.localStorage,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const reactUrl = pathToFileURL(require.resolve("react")).href;
const apiStub = dataModule(`
 export async function getComputerTaskTranscript(id, options) { return globalThis.__nativeTaskApi.transcript(id,options); }
 export async function bindComputerTaskSession(id,native) { return globalThis.__nativeTaskApi.bind(id,native); }
`);
const cardStub = dataModule(`
 import React from ${JSON.stringify(reactUrl)};
 function Card(props) { globalThis.__lastNativeProps=props; return React.createElement('div',{'data-native-card':props.taskSessionId || props.initialProgram || 'terminal','data-active':String(props.active)}); }
 export const AcpCard=Card; export const CliCard=Card; export const TerminalCard=Card;
`);
const attachmentStub = dataModule(`import React from ${JSON.stringify(reactUrl)}; export function ArchivedAttachmentLink({attachment}) { return React.createElement('span', {'data-archive-attachment':attachment.archive?.id},attachment.name); }`);
const { ComputerSessionView } = await import(await compileModule("src/shell/cloud-computer/task-workspace/ComputerSessionView.tsx", {
  "../../../lib/computer-task-api":apiStub,
  "../../../i18n/ui/useUI": dataModule('export function useUI(){return text=>text}'),
  "../agent-dialog/AcpCard":cardStub, "../terminal-card/CliCard":cardStub, "../terminal-card/TerminalCard":cardStub,
  "../agent-dialog/ArchivedAttachment":attachmentStub,
}));
const session = {id:"managed", task_id:"task", computer_id:"cc", computer_name:"Mac",kind:"acp",program:"cursor", native_session_id:"native",created_at:"",updated_at:"",sync_status:"saved"};
const saved = (text) => [
 {t:"user_message",program:"cursor",acp_session:"native",text,attachments:[{name:"report.pdf",mime:"application/pdf",archive:{id:"file",name:"report.pdf",mime:"application/pdf",size:4,download_path:"/v1/computer-task-sessions/managed/attachments/file"}}]},
 {t:"delta",program:"cursor",acp_session:"native",text:"Saved answer"},
 {t:"done",program:"cursor",acp_session:"native",stop:"end_turn"},
];
async function flush(){for(let i=0;i<6;i++) await act(async()=>{});}
async function renderView(props={}) {
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 let state={computer:{id:"cc",name:"Mac",node_online:false},session,active:true,settingsOpen:false,onSettingsContent:()=>{},...props};
 await act(async()=>root.render(React.createElement(ComputerSessionView,state)));await flush();
 return {host,async update(next){state={...state,...next};await act(async()=>root.render(React.createElement(ComputerSessionView,state)));await flush();},cleanup(){act(()=>root.unmount());host.remove();}};
}
test("offline task reads owner archive and earlier pages including private attachment metadata without executing",async()=>{
 const calls=[];globalThis.__nativeTaskApi={async transcript(id,options){calls.push({id,...options});return {session,frames:saved(options.before?'Earlier question':'Latest question'),saved_at:'now',sync_status:'saved',has_older:!options.before,next_before:options.before?null:9};},async bind(){throw Error('unexpected bind')}};
 const view=await renderView();try{
  assert.match(view.host.textContent,/Latest question/);assert.match(view.host.textContent,/Saved answer/);
  assert.ok(view.host.querySelector('[data-archive-attachment="file"]'));
  assert.equal(view.host.querySelector('[data-computer-archive-status]').getAttribute('data-computer-archive-status'),'saved');
  const older=[...view.host.querySelectorAll('button')].find(b=>b.textContent.includes('更早'));
  await act(async()=>older.click());await flush();
  assert.match(view.host.textContent,/Earlier question/);assert.match(view.host.textContent,/Latest question/);
  assert.equal(calls[1].before,9);
  assert.equal(view.host.querySelectorAll('[data-native-card]').length,0);
 }finally{view.cleanup();}
});
test("inactive bindings mount lazily then retain native card while hidden",async()=>{
 let reads=0;globalThis.__nativeTaskApi={async transcript(){reads++;return {session,frames:[],sync_status:'saved',saved_at:null}},async bind(){}};
 const view=await renderView({active:false});try{
  assert.equal(view.host.querySelector('[data-native-card]'),null);assert.equal(reads,0);
  await view.update({active:true,computer:{id:'cc',name:'Mac',node_online:true}});
  const card=view.host.querySelector('[data-native-card]');assert.ok(card);
  await view.update({active:false});assert.equal(view.host.querySelector('[data-native-card]'),card);
 }finally{view.cleanup();}
});

const { userAttachments } = await import('../src/shell/cloud-computer/agent-dialog/message-attachments.ts');
const { ArchivedAttachmentLink } = await import(await compileModule('src/shell/cloud-computer/agent-dialog/ArchivedAttachment.tsx',{
 '../../../lib/cloud-computer-api':dataModule('export async function cloudComputerRequest(path){return globalThis.__attachmentRequest(path)}'),
 '../../../i18n/ui/useUI':dataModule('export function useUI(){return text=>text}'),
}));
test('cloud attachments preserve bounded owner route and fetch signed URL only on explicit request',async()=>{
 const metadata={id:'file',name:'report.pdf',mime:'application/pdf',size:4,download_path:'/v1/computer-task-sessions/managed/attachments/file'};
 const [attachment]=userAttachments([{name:'report.pdf',mime:'application/pdf',archive:metadata}]);
 assert.equal(attachment.archive.download_path,metadata.download_path);
 for(const path of ['https://evil.test/steal','/v1/computer-task-sessions/../attachments/file','/v1/computer-task-sessions/managed/attachments/file?token=x']) {
  assert.equal(userAttachments([{name:'x',archive:{...metadata,download_path:path}}])[0].archive,undefined);
 }
 const calls=[];globalThis.__attachmentRequest=async(path)=>{calls.push(path);return {url:'https://storage.example.test/private-signed'}};
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(React.createElement(ArchivedAttachmentLink,{attachment})));
  assert.equal(calls.length,0);assert.equal(host.querySelector('a'),null);
  await act(async()=>host.querySelector('button').click());await flush();
  assert.deepEqual(calls,[metadata.download_path]);
  assert.equal(host.querySelector('a').href,'https://storage.example.test/private-signed');
 }finally{act(()=>root.unmount());host.remove();}
});

test('online machine with missing native history can always read saved history; reading pauses refresh and preserves older pages',async()=>{
 const callbacks=[];const original=setInterval;globalThis.setInterval=(fn)=>{callbacks.push(fn);return 999};
 let reads=0;globalThis.__nativeTaskApi={async transcript(id,options){reads++;return {session,frames:saved(options.before?'Earlier still readable':'Native files deleted'),sync_status:'saved',saved_at:'now',has_older:!options.before,next_before:options.before?null:9}},async bind(){}};
 const view=await renderView({computer:{id:'cc',name:'Mac',node_online:true}});
 try{
  assert.equal(view.host.querySelector('[data-computer-saved-transcript]'),null);
  await act(async()=>view.host.querySelector('[data-computer-history-toggle]').click());await flush();
  assert.match(view.host.textContent,/Native files deleted/);
  await act(async()=>[...view.host.querySelectorAll('button')].find(b=>b.textContent.includes('更早')).click());await flush();
  const archive=view.host.querySelector('[data-computer-saved-transcript]');archive.scrollTop=73;
  const before=reads;await act(async()=>callbacks.forEach(fn=>fn()));await flush();
  assert.equal(reads,before);assert.match(archive.textContent,/Earlier still readable/);assert.equal(archive.scrollTop,73);
  assert.equal(view.host.querySelector('[data-computer-archive-status]').getAttribute('data-computer-archive-status'),'pending');
  await act(async()=>globalThis.__lastNativeProps.onArchiveStatus('error'));await flush();
  assert.equal(view.host.querySelector('[data-computer-archive-status]').getAttribute('data-computer-archive-status'),'error');
 }finally{view.cleanup();globalThis.setInterval=original;}
});
test('initial offline view never mounts native adapter and still publishes offline settings',async()=>{
 let settings;globalThis.__nativeTaskApi={async transcript(){return {session,frames:[],sync_status:'saved'}},async bind(){}};
 const view=await renderView({settingsOpen:true,onSettingsContent:value=>{settings=value}});
 try{assert.equal(view.host.querySelector('[data-native-card]'),null);assert.ok(settings);}finally{view.cleanup();}
});
