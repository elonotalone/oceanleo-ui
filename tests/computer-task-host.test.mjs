import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {compileModule,dataModule} from './helpers/module-bench.mjs';
const require=createRequire(import.meta.url);const fr=createRequire(require.resolve('fabric/node'));const canvas=fr.resolve('canvas');const prev=require.cache[canvas];require.cache[canvas]={id:canvas,filename:canvas,loaded:true,exports:{}};
const {JSDOM}=await import(pathToFileURL(fr.resolve('jsdom')).href);if(prev)require.cache[canvas]=prev;else delete require.cache[canvas];
const dom=new JSDOM('<html><body></body></html>',{url:'https://oceanleo.com/tasks/t?computerSession=s1'});
for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement}))Object.defineProperty(globalThis,key,{configurable:true,value});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__mounts=0;globalThis.__creates=[];
const react=JSON.stringify(pathToFileURL(require.resolve('react')).href);
const session=(id,kind='acp')=>({id,task_id:'t',computer_id:'cc',computer_name:'Offline',kind,program:'codex',native_session_id:null,sync_status:'saved'});
globalThis.__sessions=[session('s1'),session('s2','cli')];
const computer={id:'cc',name:'Offline',status:'active',node_online:false};globalThis.__computer=computer;
const {ComputerTaskWorkspace}=await import(await compileModule('src/shell/cloud-computer/task-host/ComputerTaskWorkspace.tsx',{
 'next/navigation':dataModule('export function useRouter(){return {push(){}}}'),
 '../../../lib/cloud-computer-api':dataModule('export async function listComputers(){return {items:[globalThis.__computer]}};export async function getComputer(){return globalThis.__computer}'),
 '../../../lib/computer-task-api':dataModule('export async function listComputerTaskSessions(){return {sessions:globalThis.__sessions}};export async function createComputerTaskSession(id,input){globalThis.__creates.push(input);return {task_id:"t",session:{id:"new",computer_id:id,...input}}}'),
 '../computer-state':dataModule('export function computerDisplayState(){return "offline"}'),
 '../task-workspace/ComputerSessionView':dataModule(`import React,{useEffect} from ${react};export function ComputerSessionView({session,active}){useEffect(()=>{globalThis.__mounts++;return()=>globalThis.__mounts--;},[]);return React.createElement('div',{'data-native':session.id,'data-active':String(active)},session.id)}`),
 '../../anchored-popover':dataModule(`import React from ${react};export function AnchoredPopover({open,children}){return open?React.createElement('div',null,children):null}`)
}));
test('switching managed views retains native instances, selection is passive, offline inspection and cloud default remain available',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);let settings=false;
 await act(async()=>{root.render(React.createElement(ComputerTaskWorkspace,{taskId:'t',cloud:React.createElement('div',null,'cloud content'),settingsOpen:false,onSettingsOpenChange:v=>settings=v,onSettingsContent(){}}));await new Promise(r=>setTimeout(r,0));});
 assert.equal(globalThis.__mounts,2);assert.equal(globalThis.__creates.length,0);assert.equal(host.querySelector('[data-native="s1"]').getAttribute('data-active'),'true');
 const click=async text=>{const b=[...host.querySelectorAll('button')].find(b=>b.textContent.includes(text));assert.ok(b,text);await act(async()=>b.click());};
 await click('独立 CLI');assert.equal(globalThis.__mounts,2);assert.equal(globalThis.__creates.length,0);assert.match(window.location.search,/computerSession=s2/);
 await click('⚙');assert.equal(settings,true);await click('云端 OceanLeo');assert.equal(globalThis.__mounts,2);
 await click('设备 ·');await click('Offline · 离线');assert.match(host.textContent,/选择程序不会执行任务/);assert.equal(globalThis.__creates.length,0);
 await click("返回设备"); assert.match(host.textContent,/管理设备/);
 await act(async()=>root.unmount());host.remove();
});

const {ComputerTaskSettingsPane}=await import(await compileModule('src/shell/cloud-computer/task-host/ComputerTaskSettingsPane.tsx'));
test('right settings close restores the exact prior content instance and edited state',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);let mounts=0;let close=0;
 function Preview(){React.useEffect(()=>{mounts++;return()=>mounts--;},[]);return React.createElement('input',{defaultValue:'prior tab draft'});}
 const render=async open=>act(async()=>root.render(React.createElement(ComputerTaskSettingsPane,{open,content:React.createElement('p',null,'machine-wide settings'),onClose:()=>close++},React.createElement(Preview))));
 await render(false);const input=host.querySelector('input');input.value='edited preview draft';await render(true);assert.equal(mounts,1);assert.equal(input.parentElement.hidden,true);assert.match(host.textContent,/machine-wide/);
 await act(async()=>host.querySelector('button').click());assert.equal(close,1);await render(false);assert.equal(host.querySelector('input'),input);assert.equal(input.value,'edited preview draft');assert.equal(input.parentElement.hidden,false);await act(async()=>root.unmount());host.remove();
});
const {ComputerTaskImport}=await import(await compileModule('src/shell/cloud-computer/task-host/ComputerTaskImport.tsx',{
 'next/navigation':dataModule('export function useRouter(){return {replace:url=>globalThis.__forward=url}};export function useSearchParams(){return new URLSearchParams("card=cli&program=codex&session=known-native")}'),
 '../../../lib/computer-task-api':dataModule('export async function createComputerTaskSession(id,input){globalThis.__imported={id,input};return {task_id:"existing",session:{id:"managed"}}}')
}));
test('legacy native deep link imports only its named identity into existing task and forwards once',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 await act(async()=>{root.render(React.createElement(React.StrictMode,null,React.createElement(ComputerTaskImport,{computerId:'cc',taskId:'existing'})));await new Promise(r=>setTimeout(r,0));});
 assert.equal(globalThis.__imported.id,'cc');assert.equal(globalThis.__imported.input.task_id,'existing');assert.equal(globalThis.__imported.input.native_session_id,'known-native');assert.equal(globalThis.__imported.input.kind,'cli');assert.equal(globalThis.__imported.input.program,'codex');assert.equal(globalThis.__forward,'/tasks/existing?computerSession=managed');await act(async()=>root.unmount());host.remove();
});
