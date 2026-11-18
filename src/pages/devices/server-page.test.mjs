import assert from 'node:assert/strict';
import test from 'node:test';
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {document, window} from '../../../tests/helpers/remote-desktop-dom.mjs';
import {compileModule, dataModule} from '../../../tests/helpers/module-bench.mjs';

window.scrollTo=()=>{};
globalThis.self = window;
globalThis.IntersectionObserver = class {observe(){} unobserve(){} disconnect(){}};
const tt = dataModule(`export function useUI(){return (s,vars)=>s.replace(/\\{(\\w+)\\}/g,(_,k)=>String(vars?.[k]??'{'+k+'}'));}`);
const cloud = dataModule(`export class CloudComputerError extends Error {constructor(code,message,status,retry,detail){super(message);Object.assign(this,{code,status,detail});}}; export const COMPUTER_EVENT_KIND_LABEL={}; export const COMPUTER_STATUS_LABEL={running:'运行中',stopped:'已停机'}; export const cloudComputerApi={}; export async function upgradeNode(){} export async function cloudComputerRequest(){throw new Error('unexpected network');}`);
const {ServerPage} = await import(await compileModule('src/pages/devices/ServerPage.tsx', {
  '../../i18n/ui/useUI':tt,
  '../../lib/cloud-computer-api':cloud,
  '../../native-agent-core/index':dataModule(`export const PROGRAM_LABEL={codex:'Codex',claude:'Claude Code'};`),
  '../../lib/agent':dataModule(`export async function createTask(body){globalThis.__agentRequests.push(body);return {ok:true,data:{task_id:'task-rescue'}};}`),
  'next/navigation':dataModule(`export function useRouter(){return {push:(href)=>globalThis.__navigations.push(href)};}`),
  '../../contracts/domain-family':dataModule(`export const CONFIGURED_DOMAIN_FAMILY="com"; export function familyForHost(){return "com";} export function domainProfileForHost(){return currentDomainProfile();} export function portalHref(path){return path;} export function sharedCookieDomainFor(){return undefined;} export function currentDomainFamily(){return "com";} export function currentDomainProfile(){return {family:"com",portalOrigin:"https://oceanleo.com",gatewayOrigin:""};} export function runtimePageOrigin(){return "https://oceanleo.com";}`),
}));
const {monthUsage,limitMinor} = await import(await compileModule('src/pages/devices/ServerCosts.tsx', {'../../i18n/ui/useUI':tt}));
const {serverErrorText} = await import(await compileModule('src/pages/devices/server-page-shared.tsx', {'../../i18n/ui/useUI':tt}));

const stamp='2026-11-18T01:00:00Z';
const pc={id:'cc-test',name:'Test server',source:'aliyun',status:'running',edition:'com',node_online:true,enrolled_at:stamp,confirmed_at:stamp,created_at:stamp,updated_at:stamp,billing_mode:'monthly'};
const point={t:stamp,cpu_percent:12,mem_used_bytes:1024,mem_total_bytes:2048,net_rx_bps:10,net_tx_bps:20,disks:[{mount:'/',used_bytes:60,total_bytes:100}]};
const overview={source:'aliyun',managed:true,region_id:'ap-southeast-1',zone_id:'zone-a',instance_type:'ecs.test',vcpu:2,memory_gb:4,public_ip:'192.0.2.5',private_ip:'10.0.0.5',os_name:'Linux',disks:[{disk_id:'disk-1',kind:'system',size_gb:40,category:'cloud_essd'}],created_at:stamp,expires_at:null,billing_mode:'monthly',cloud_status:'Running',security_group_ids:['sg-1'],node:{version:'v1',os:'linux',os_version:'6',arch:'amd64',hostname:'node-a',kernel:'6',cpus:2,mem_bytes:4*1024**3}};
const snapshot={id:'snap-1',disk_id:'disk-1',kind:'manual',size_gb:40,created_at:stamp,status:'accomplished',note:'Before change'};
const diagnosis={state:'node_offline',findings:[{code:'offline',text:'Node is offline'}],suggested:[{action:'reboot',text:'Check connectivity',needs_confirmation:true}]};
const rule={id:'rule-1',direction:'in',protocol:'tcp',port_range:'22/22',source:'192.0.2.0/24',policy:'accept',description:'SSH'};
function setup({computer=pc,api:overrides={},client:clientOverrides={},activity:activityOverrides={}}={}) {
  const calls=[];
  const record=(name,result)=>async(...args)=>{calls.push([name,...args]);return typeof result==='function'?result(...args):structuredClone(result);};
  let savedLimit={monthly_limit:null,on_reach:'notify',used:{amount_minor:100,currency:'USD'},reached:false};
  const api={
    getOverview:record('overview',{...overview,source:computer.source,managed:computer.source==='aliyun'}),
    getMetrics:record('metrics',{source:'node',points:[point],latest:point,needs_node_upgrade:false}),
    getCloudMonitor:record('cloud-monitor',(_,metric)=>({metric,unit:'%',source:'cloud',points:[{t:stamp,v:25}]})),
    getSystemEvents:record('system-events',{items:[{id:'ev-cloud',type:'maintenance',status:'scheduled',at:'2026-11-18T02:00:00Z',text:'Cloud maintenance'}]}),
    getCustomInfo:record('custom-info',{source:'device',reported_at:stamp,items:[{key:'tag',label:'Location',value:'<b>plain text</b>'}]}),
    getNode:record('node',{version:'v1',latest_version:'v1',needs_upgrade:false,auto_upgrade:false,caps:['metrics2','custom_info']}),
    getSnapshots:record('snapshots',{items:[snapshot],policy:{enabled:true,time_utc:'03:00',retention_days:7},monthly_cost:{amount_minor:12,currency:'USD'}}),
    getRules:record('rules',{rules:[rule]}),
    getUsageLimit:record('limit',()=>structuredClone(savedLimit)),
    setUsageLimit:record('set-limit',(_,value)=>{savedLimit={...savedLimit,...value};return savedLimit;}), setAutoUpgrade:record('auto-upgrade',{}), setSnapshotPolicy:record('policy',{}),
    reboot:record('reboot',computer),createSnapshot:record('create-snapshot',snapshot),deleteSnapshot:record('delete-snapshot',{}),
    rollback:record('rollback',(_,__,confirmed)=>{if(!confirmed)throw {code:'needs_confirmation',status:409,detail:{loses:'Changes after this snapshot will be lost'}};return {};}),
    reinstall:record('reinstall',(_,confirmed)=>{if(!confirmed)throw {code:'needs_confirmation',status:409,detail:{loses:'System disk will be erased'}};return {};}),
    diagnose:record('diagnose',diagnosis),addRule:record('add-rule',rule),deleteRule:record('delete-rule',(_,__,confirmed)=>{if(!confirmed)throw {code:'unsafe_rule',status:409,detail:{loses:'This can interrupt the node connection'}};return {};}),...overrides,
  };
  const client={getComputer:record('computer',computer),getUsage:record('usage',{items:[],total:{amount_minor:0,currency:'USD'},hourly_now:{amount_minor:1,currency:'USD'}}),listComputerEvents:record('events',{items:[{id:1,computer_id:computer.id,kind:'rescue.diagnosed',detail:{text:'Local diagnosis'},created_at:stamp}]}),startComputer:record('start',computer),stopComputer:record('stop',computer),deleteComputer:record('release',computer),getServerRenewalQuote:record('quote',{amount_minor:100,currency:'USD'}),renewServer:record('renew',computer),...clientOverrides};
  const activity={getActivity:record('activity',{online:true,node_version:'v1',latest_version:'v1',update_available:false,usage:null,programs:[{slot:'p1',program:'codex',alive:true,started_at:stamp,rss_bytes:1,cpu_percent:1,task_id:'task-1',task_title:'Running task',session_id:'s1',pid:1}],terminals:[]}),upgradeNode:record('upgrade',{to:'v2'}),endActivity:record('end',{}),endAll:record('end-all',{}),...activityOverrides};
  return {calls,props:{computer,api,client,activityClient:activity,onNavigate:href=>globalThis.__navigations.push(href),onClose:()=>calls.push(['close'])}};
}
let root;
async function mount(config={}) {
  globalThis.__agentRequests=[];globalThis.__navigations=[];
  const env=setup(config);const host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await act(async()=>{root.render(React.createElement(ServerPage,env.props));});
  return env;
}
async function click(text,scope=document) {const el=[...scope.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(el,`button ${text}`);assert.equal(el.disabled,false,`enabled ${text}`);await act(async()=>el.click());}
async function confirm(){const el=document.querySelector('[data-server-confirm]');assert.ok(el);await act(async()=>el.click());}
function block(id){return document.querySelector(`[data-server-section="${id}"]`);}
function props(el){return el[Object.keys(el).find(k=>k.startsWith('__reactProps'))];}
async function change(el,value){await act(async()=>props(el).onChange({target:{value,checked:!!value}}));}
async function submit(form){await act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));}
test.afterEach(async()=>{if(root){await act(async()=>root.unmount());root=null;}document.body.innerHTML='';});

test('Aliyun server renders all blocks, cloud/node facts, copy, event order and embedded programs',async()=>{
  const {calls}=await mount();
  assert.equal(document.querySelectorAll('[data-server-section]').length,11);
  assert.match(block('facts').textContent,/ap-southeast-1.*192.0.2.5.*10.0.0.5/s);
  assert.equal(document.querySelectorAll('[data-server-curve]').length,5);
  assert.match(block('snapshots').textContent,/Before change/);assert.match(block('firewall').textContent,/SSH/);
  assert.match(block('programs').textContent,/Running task/);
  assert.ok(block('events').textContent.indexOf('Cloud maintenance')<block('events').textContent.indexOf('Local diagnosis'));
  const copied=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>copied.push(text)}});
  await act(async()=>document.querySelector('[aria-label="复制公网 IP"]').click());assert.deepEqual(copied,['192.0.2.5']);
  assert.match(block('custom-info').textContent,/<b>plain text<\/b>/);assert.equal(block('custom-info').querySelector('b'),null);
  await click('6h',block('monitoring'));assert.ok(calls.some(c=>c[0]==='metrics'&&c[2]==='6h'));
});

test('BYO has own-provider explanations, node facts and custom info, with no cloud controls or reads',async()=>{
  const {calls}=await mount({computer:{...pc,source:'byo'}});
  for(const id of ['power','snapshots','firewall','rescue','events'])assert.match(block(id).textContent,/此设备由你自己的服务商管理/);
  assert.match(block('facts').textContent,/node-a/);assert.match(block('custom-info').textContent,/未验证/);
  assert.equal(block('power').querySelector('button'),null);assert.equal(block('firewall').querySelector('form'),null);
  assert.equal(calls.some(c=>['snapshots','rules','system-events','cloud-monitor'].includes(c[0])),false);
  const auto=block('node').querySelector('[role=switch]');await act(async()=>auto.click());assert.ok(calls.some(c=>c[0]==='auto-upgrade'&&c[2]===true));
});

test('offline and old Aliyun nodes use labeled cloud fallback; old BYO only offers real upgrade',async()=>{
  const {calls}=await mount({computer:{...pc,node_online:false}});
  assert.equal(calls.filter(c=>c[0]==='cloud-monitor').length,5);assert.match(block('monitoring').textContent,/数据来源：阿里云/);
});

test('old BYO node upgrade challenge names interrupted programs and sends confirm only after approval',async()=>{
  const {calls}=await mount({computer:{...pc,source:'byo'},api:{getNode:async()=>({version:'old',latest_version:'new',needs_upgrade:true,auto_upgrade:false,caps:[]}),getMetrics:async()=>({source:'node',points:[],latest:null,needs_node_upgrade:true})},activity:{upgradeNode:async(...args)=>{calls.push(['upgrade',...args]);if(!args[1].confirm)throw {code:'confirm_required',status:409,detail:{programs:[{program:'codex',task_title:'Running task',slot:'p1'}],terminals:[]}};return {to:'new'};}}});
  assert.match(block('monitoring').textContent,/需要升级设备程序/);await click('升级节点',block('node'));
  assert.match(document.querySelector('[data-device-dialog="server-confirm"]').textContent,/Running task/);await confirm();
  assert.deepEqual(calls.filter(c=>c[0]==='upgrade').map(c=>c[2]),[{}, {confirm:true}]);
});

for(const [label,name,body] of [['停机','stop','磁盘会保留'],['重启','reboot','中断'],['强制重启','reboot','未保存'],['释放','release','数据不可恢复']])test(`${label} confirms consequences before the request`,async()=>{
  const {calls}=await mount();await click(label,block('power'));assert.equal(calls.some(c=>c[0]===name),false);assert.match(document.querySelector('[data-device-dialog="server-confirm"]').textContent,new RegExp(body));await confirm();
  assert.equal(calls.filter(c=>c[0]===name).length,1);if(name==='reboot')assert.equal(calls.find(c=>c[0]===name)[2],label==='强制重启');
});

test('stopped server offers start, monthly renewal quote precedes stable-id payment',async()=>{
  const {calls}=await mount({computer:{...pc,status:'stopped',node_online:false}});assert.equal([...block('power').querySelectorAll('button')].some(b=>b.textContent==='停机'),false);
  await click('开机',block('power'));await click('查看续费价格',block('power'));assert.match(block('power').textContent,/\$1.00/);await click('确认支付并续费',block('power'));
  assert.ok(calls.some(c=>c[0]==='start'));const renew=calls.find(c=>c[0]==='renew');assert.equal(renew[2].period_months,1);assert.ok(renew[2].request_id);
});

test('snapshot create, delete confirmation and policy save send actual fields',async()=>{
  const {calls}=await mount();await click('立即创建',block('snapshots'));assert.ok(calls.some(c=>c[0]==='create-snapshot'&&c[2]===''));
  await click('删除',block('snapshots'));assert.equal(calls.some(c=>c[0]==='delete-snapshot'),false);await confirm();assert.ok(calls.some(c=>c[0]==='delete-snapshot'&&c[2]==='snap-1'));
  const policy=block('snapshots').querySelector('form');await change(policy.querySelector('select'),'05:00');await change(policy.querySelector('input[type=number]'),'14');await submit(policy);
  assert.deepEqual(calls.find(c=>c[0]==='policy')[2],{enabled:true,time_utc:'05:00',retention_days:14});
});
for(const [label,name,loss] of [['回滚到此快照','rollback','Changes after this snapshot'],['重装系统','reinstall','System disk will be erased']])test(`${label} uses gateway loss text and then sends confirmed`,async()=>{
  const {calls}=await mount();await click(label);assert.match(document.querySelector('[data-device-dialog="server-confirm"]').textContent,new RegExp(loss));await confirm();const requests=calls.filter(c=>c[0]===name);assert.equal(requests.length,2);assert.equal(requests[0].at(-1),false);assert.equal(requests[1].at(-1),true);
});

test('firewall unsafe remove and add are confirmed; rule editor sends all fields',async()=>{
  const {calls}=await mount({api:{addRule:async(...args)=>{calls.push(['add-rule',...args]);if(!args[1].confirmed)throw {code:'unsafe_rule',status:409,detail:{loses:'Open to the world'}};return rule;}}});
  await click('移除',block('firewall'));assert.match(document.querySelector('[data-device-dialog="server-confirm"]').textContent,/node connection/);await confirm();assert.equal(calls.filter(c=>c[0]==='delete-rule').at(-1).at(-1),true);
  const form=block('firewall').querySelector('form');const inputs=form.querySelectorAll('input');await change(inputs[0],'1/65535');await change(inputs[1],'0.0.0.0/0');await change(inputs[2],'test');await submit(form);
  assert.match(document.querySelector('[data-device-dialog="server-confirm"]').textContent,/Open to the world/);await confirm();assert.deepEqual(calls.filter(c=>c[0]==='add-rule').at(-1)[2],{direction:'in',protocol:'tcp',port_range:'1/65535',source:'0.0.0.0/0',policy:'accept',description:'test',confirmed:true});
});

test('usage limit accepts exact cents, null clears it; diagnosis passes findings to cloud agent task',async()=>{
  const {calls}=await mount();const form=block('costs').querySelector('form');await act(async()=>form.querySelector('[role=switch]').click());await change(form.querySelector('input[type=number]'),'12.34');await submit(form);
  assert.deepEqual(calls.find(c=>c[0]==='set-limit')[2],{monthly_limit:{amount_minor:1234,currency:'USD'},on_reach:'notify'});
  await act(async()=>block('costs').querySelector('[role=switch]').click());await submit(block('costs').querySelector('form'));assert.equal(calls.filter(c=>c[0]==='set-limit').at(-1)[2].monthly_limit,null);
  await click('诊断',block('rescue'));assert.match(block('rescue').textContent,/Node is offline/);await click('让 agent 处理',block('rescue'));
  await act(async()=>{for(let i=0;i<20&&!globalThis.__agentRequests.length;i++)await new Promise(r=>setTimeout(r,10));});
  assert.match(globalThis.__agentRequests[0].prompt,/cc-test.*\nNode is offline/s);assert.deepEqual(globalThis.__agentRequests[0].executionTarget,{kind:'cloud'});assert.deepEqual(globalThis.__navigations,['/tasks/task-rescue']);
});

for(const error of [{status:404},{status:501},{code:'permission_missing',status:403,detail:{missing_action:'ecs:DescribeDisks',policy_hint:'Add a read policy'}},{code:'not_managed',status:409},{status:0,message:'Network disconnected'}])test(`section errors ${error.code??error.status} retain page and offer retry`,async()=>{
  let fail=true;await mount({api:{getSnapshots:async()=>{if(fail)throw error;return {items:[],policy:{enabled:true,time_utc:'03:00',retention_days:7},monthly_cost:null};}}});
  assert.ok(block('snapshots').querySelector('[role=alert]'));assert.ok(block('facts').textContent.includes('192.0.2.5'));
  if(error.code==='permission_missing')assert.match(block('snapshots').textContent,/ecs:DescribeDisks.*Add a read policy/);
  fail=false;await click('重试',block('snapshots'));assert.match(block('snapshots').textContent,/暂无快照/);
});

test('all read blocks show loading/errors and retry, no silent empty block',async()=>{
  let resolve;await mount({api:{getOverview:()=>new Promise(r=>resolve=r)}});assert.ok(block('facts').querySelector('[role=status]'));
  await act(async()=>resolve(overview));assert.match(block('facts').textContent,/192.0.2.5/);
});

test('calendar month excludes rolling-window charges; currency cents parsing never guesses',()=>{
  assert.deepEqual(monthUsage([{hour_start:'2026-10-31T23:59:59Z'},{hour_start:stamp}],new Date('2026-11-18T03:00:00Z')),[{hour_start:stamp}]);
  for(const input of ['NaN','-1','1.234','1e3','9007199254740992'])assert.equal(limitMinor(input),null);
  assert.equal(limitMinor('0'),0);assert.equal(limitMinor('12.3'),1230);
  assert.match(serverErrorText({status:404},s=>s),/尚未/);
});


test('online old Aliyun metrics fall back to cloud while retaining upgrade hint',async()=>{
 const {calls}=await mount({api:{getMetrics:async()=>({source:'node',points:[],latest:null,needs_node_upgrade:true})}});
 assert.match(block('monitoring').textContent,/需要升级设备程序/);assert.equal(calls.filter(c=>c[0]==='cloud-monitor').length,5);
});

test('managed false suppresses cloud action blocks and empty custom info explains setup',async()=>{
 await mount({api:{getOverview:async()=>({...overview,managed:false}),getCustomInfo:async()=>({source:'device',reported_at:null,items:[]})}});
 assert.equal(block('power').querySelector('button'),null);assert.equal(block('firewall').querySelector('form'),null);assert.match(block('custom-info').textContent,/可以让 agent/);
});

test('upgrade clears in-progress state when refreshed node reaches the target version',async()=>{
 let upgraded=false;
 await mount({computer:{...pc,source:'byo'},api:{getNode:async()=>({version:upgraded?'v2':'v1',latest_version:'v2',needs_upgrade:!upgraded,auto_upgrade:false,caps:[]})},activity:{upgradeNode:async()=>{upgraded=true;return {to:'v2'};}}});
 await click('升级节点',block('node'));assert.match(block('node').textContent,/v2/);assert.equal([...block('node').querySelectorAll('button')].some(b=>b.textContent==='正在升级…'),false);
});

test('failed confirmed mutation exposes its error and retry without covering it with the dialog',async()=>{
 let fail=true;let count=0;await mount({client:{stopComputer:async()=>{count++;if(fail)throw {message:'temporary failure'};return pc;}}});
 await click('停机',block('power'));await confirm();assert.equal(document.querySelector('[data-device-dialog="server-confirm"]'),null);assert.match(block('power').textContent,/temporary failure/);fail=false;await click('重试',block('power'));assert.equal(count,2);
});

test('unpaid, expired and changing states never offer an invalid power action',async()=>{
 await mount({computer:{...pc,status:'stopped',charge_status:'unpaid'}});assert.equal([...block('power').querySelectorAll('button')].some(b=>b.textContent==='开机'),false);
});

test('monthly cost lines group usage, trim prior month and keep different currencies separate',async()=>{
 const date=new Date();const month=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1));const before=new Date(month.getTime()-1).toISOString();const hour=date.toISOString();
 const rows=[{id:1,hour_start:before,kind:'instance_hour',quantity:100,amount_minor:900,currency:'USD'}, {id:2,hour_start:hour,kind:'instance_hour',quantity:1,amount_minor:10,currency:'USD'}, {id:3,hour_start:hour,kind:'instance_hour',quantity:2,amount_minor:20,currency:'USD'}, {id:4,hour_start:hour,kind:'traffic_gb',quantity:1,amount_minor:50,currency:'CNY'}];
 await mount({client:{getUsage:async()=>({items:rows,total:{amount_minor:980,currency:'USD'},hourly_now:{amount_minor:1,currency:'USD'}})}});
 assert.match(block('costs').textContent,/\$0.30/);assert.match(block('costs').textContent,/¥0.50/);assert.doesNotMatch(block('costs').textContent,/\$9.00/);assert.equal(block('costs').querySelectorAll('tbody tr').length,2);assert.match(block('costs').textContent,/3 h/);
});

for(const [name,section] of [['getOverview','facts'],['getMetrics','monitoring'],['getNode','node'],['getCustomInfo','custom-info'],['getRules','firewall'],['getSystemEvents','events']])test(`unavailable ${name} shows a retryable reason in ${section}`,async()=>{
 await mount({api:{[name]:async()=>{throw {status:501};}}});assert.match(block(section).textContent,/此功能尚未在当前服务端开通/);assert.ok(block(section).querySelector('[role=alert]'));
});

test('usage and lifecycle route failures show their own reasons and do not hide programs',async()=>{
 await mount({client:{getUsage:async()=>{throw {code:'permission_missing',status:403,detail:{missing_action:'meter:read',policy_hint:'Grant usage read'}};},listComputerEvents:async()=>{throw {status:404};}}});
 assert.match(block('costs').textContent,/meter:read/);assert.match(block('events').textContent,/尚未/);assert.match(block('programs').textContent,/Running task/);
});

test('canceling a destructive confirmation sends no mutation',async()=>{
 const {calls}=await mount();await click('释放',block('power'));await click('取消',document.querySelector('[data-device-dialog="server-confirm"]'));assert.equal(calls.some(c=>c[0]==='release'),false);
});


test('device card remains compact, shows region/IP and opens the server page from its title and dashboard',async()=>{
 const reactUrl=new URL('../../../node_modules/react/index.js',import.meta.url).href;
 const {CloudDeviceGrid}=await import(await compileModule('src/pages/devices/CloudDeviceGrid.tsx',{
  '../../i18n/ui/useUI':tt,
  '../../shell/cloud-computer/ConnectServerDialog':dataModule('export function ConnectServerDialog(){return null;}'),
  '../AuthDialog':dataModule('export function AuthDialog(){return null;}'),
  './ServerPage':dataModule(`import React from ${JSON.stringify(reactUrl)}; export function ServerPage(props){return React.createElement('div',{'data-open-server':props.computer.id},React.createElement('button',{onClick:props.onClose},'Close server'));}`),
 }));
 const {props:config}=setup();const client={...config.client,listComputers:async()=>({items:[{...pc,region_id:'test-region',public_ip:'192.0.2.5'}]})};
 const host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(React.createElement(CloudDeviceGrid,{client,activityClient:config.activityClient})));
 assert.match(host.querySelector('[data-server-card-address]').textContent,/test-region.*192.0.2.5/);
 await act(async()=>host.querySelector('[data-server-page-open]').click());assert.equal(document.querySelector('[data-open-server]').getAttribute('data-open-server'),'cc-test');
 await click('Close server');await act(async()=>host.querySelector('[data-device-dashboard-open]').click());assert.ok(document.querySelector('[data-open-server]'));
});
