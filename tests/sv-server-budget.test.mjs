import './helpers/w1-jsdom-window.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {compileModule, dataModule} from './helpers/module-bench.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const ui = dataModule('const tt=(s)=>s; export function useUI(){return tt;}');
const parts = dataModule('export const CARD="",CARD_TITLE="",CARD_DESC="",QUIET="";');
const {ServerBudgetPanel} = await import(await compileModule('src/pages/settings/ServerBudgetPanel.tsx', {
  '../../i18n/ui/useUI':ui, './personalization/parts':parts,
}));
const {ServerSettingsPanel} = await import(await compileModule('src/pages/settings/ServerSettingsPanel.tsx', {
  '../../i18n/ui/useUI':ui, './personalization/parts':parts,
  '../../ui':dataModule('export function ConfirmDialog(){return null;}'),
  '../../shell/cloud-computer/ConnectServerDialog':dataModule('export function ConnectServerDialog(){return null;}'),
  '../../shell/cloud-computer/computer-state':dataModule('export function computerDisplayState(){return "stopped";} export function isConnectedComputer(){return false;}'),
  '../devices/DeviceCard':dataModule('export function DeviceIcon(){return null;}'),
  '../devices/DeviceActivityPanel':dataModule('export function DeviceActivityPanel(){return null;}'),
  '../devices/DeviceTasksDialog':dataModule('export function formatDeviceTime(t){return t;}'),
  '../devices/CloudDeviceGrid':dataModule('export const STATE_LABEL={stopped:"已停机"};'),
  './server-environments/EnvironmentCard':dataModule('export function EnvironmentCard(){return null;}'),
}));
const allowance = {enabled:false,currency:'USD',monthly_cap_minor:10000,max_hourly_minor:null,max_servers:null,committed_minor:2000,remaining_minor:8000};
async function flush(){for(let i=0;i<12;i++) await act(async()=>{});}
async function mount(Component,props){
  const errors=[]; const old=console.error; console.error=(...args)=>errors.push(args);
  const host=document.createElement('div'); document.body.append(host); const root=createRoot(host);
  await act(async()=>root.render(React.createElement(Component,props))); await flush();
  return {host,text:()=>host.textContent,async click(label){const button=[...host.querySelectorAll('button')].find(b=>b.textContent===label); assert.ok(button,label); await act(async()=>button.click());await flush();},
    async input(label,value){const el=host.querySelector(`input[aria-label="${label}"]`);assert.ok(el,label);await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new window.Event('input',{bubbles:true}));});await flush();},
    close(){act(()=>root.unmount());host.remove();console.error=old;assert.deepEqual(errors,[],'real component must render without console errors');}};
}

test('allowance loads, owner saves limits, committed and remaining money are shown',async()=>{
  const writes=[];
  const client={getServerAllowance:async()=>allowance,saveServerAllowance:async value=>{writes.push(value);return {...allowance,...value};}};
  const view=await mount(ServerBudgetPanel,{client,onPurchased(){}});
  assert.match(view.text(),/已承诺 \$20.00/);assert.match(view.text(),/剩余额度 \$80.00/);
  await view.input('每月上限','300.50');await view.input('单台每小时上限（可选）','1.25');await view.input('最多服务器数量（可选）','3');
  await act(async()=>view.host.querySelector('[role=switch]').click());await flush();
  await view.click('保存授权');
  assert.deepEqual(writes,[{enabled:true,monthly_cap_minor:30050,max_hourly_minor:125,max_servers:3}]);
  assert.match(view.text(),/预算授权已保存/);view.close();
});

test('saving refusal stays visible and never claims authorization succeeded',async()=>{
  const view=await mount(ServerBudgetPanel,{client:{getServerAllowance:async()=>allowance,saveServerAllowance:async()=>{throw new Error('预算不能低于已承诺的费用');}},onPurchased(){}});
  await view.input('每月上限','1');await view.click('保存授权');
  assert.match(view.host.querySelector('[role=alert]').textContent,/已承诺/);
  assert.doesNotMatch(view.text(),/预算授权已保存/);view.close();
});

test('purchase uses provider quote, displays reclaim notice and waits for explicit payment click',async()=>{
  const bought=[];let purchased=0;
  const client={getServerAllowance:async()=>({...allowance,enabled:true}),saveServerAllowance:async v=>({...allowance,...v}),
    getCatalog:async()=>({recommended_region_id:'ap-southeast-1',regions:[{id:'ap-southeast-1',label:'新加坡'}],tiers:[{id:'ecs.test',label:'2 CPU',available:true}],disk:{min_gb:20,max_gb:500,step_gb:10}}),
    getServerOffers:async()=>({bandwidth_mbps:1,offers:[{billing_mode:'preemptible',available:true,price:{amount_minor:10,currency:'USD'},commitment_minor:7000}]}),
    buyBudgetServer:async v=>{bought.push(v);return {id:'cc-test',status:'running'};}};
  const view=await mount(ServerBudgetPanel,{client,onPurchased(){purchased++;}});
  await view.click('按预算购买服务器');
  const selects=view.host.querySelectorAll('select');
  await act(async()=>{selects[2].value='preemptible';selects[2].dispatchEvent(new window.Event('change',{bubbles:true}));});await flush();
  assert.match(view.text(),/可能被阿里云回收/);assert.match(view.text(),/预算预留 \$70.00/);
  const input=view.host.querySelector('[data-server-budget-purchase] input');
  await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'测试服务器');input.dispatchEvent(new window.Event('input',{bubbles:true}));});
  assert.equal(bought.length,0);
  const pay=[...view.host.querySelectorAll('button')].find(b=>b.textContent==='确认支付并创建');assert.equal(pay.disabled,true);
  await act(async()=>view.host.querySelector('[data-server-budget-purchase] input[type=checkbox]').click());await flush();
  await view.click('确认支付并创建');
  assert.equal(bought.length,1);assert.equal(bought[0].billing_mode,'preemptible');assert.equal(bought[0].name,'测试服务器');assert.ok(bought[0].request_id);assert.equal(purchased,1);view.close();
});

test('real server panel shows committed money, renewal, expiry and reclaim event lines',async()=>{
  const events=[{id:1,kind:'server.purchase_reserved',detail:{amount_minor:7000,currency:'USD'}},
    {id:2,kind:'server.renewed',detail:{amount_minor:1000,currency:'USD'}},
    {id:3,kind:'server.expiring',detail:{expires_at:'2026-12-01T00:00:00Z'}},
    {id:4,kind:'aliyun.system_event',detail:{event_type:'ecs:Instance:SpotInterruption'}}].map(e=>({...e,created_at:'today',computer_id:'cc-test'}));
  const view=await mount(ServerSettingsPanel,{computer:{id:'cc-test',source:'aliyun',name:'test',node_online:false,billing_mode:'preemptible'},client:{listComputerEvents:async()=>({items:events})},onUpdated(){},onRemoved(){}});
  assert.match(view.text(),/已预留服务器预算 · \$70.00/);assert.match(view.text(),/包月服务器已续费 · \$10.00/);assert.match(view.text(),/到期时间 2026-12-01/);assert.match(view.text(),/抢占式服务器收到回收通知/);view.close();
});
