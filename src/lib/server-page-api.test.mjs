import assert from 'node:assert/strict';
import test from 'node:test';
import {compileModule,dataModule} from '../../tests/helpers/module-bench.mjs';
const {createServerPageApi}=await import(await compileModule('src/lib/server-page-api.ts',{'./cloud-computer-api':dataModule(`export async function cloudComputerRequest(){throw new Error('unexpected network')}`)}));
test('typed client paths, verb and exact JSON match the dispatch contract',async()=>{
 const calls=[];const api=createServerPageApi(async(path,init)=>{calls.push({path,method:init?.method??'GET',body:init?.body?JSON.parse(init.body):undefined});return {sentinel:true};});const id='cc/a ?';const prefix='/v1/computers/cc%2Fa%20%3F';
 const cases=[
 ['getOverview',[id],'/cloud/overview','GET'],['getMetrics',[id,'7d'],'/metrics?range=7d','GET'],['getCloudMonitor',[id,'net_out','24h'],'/cloud/monitor?metric=net_out&range=24h','GET'],['getSystemEvents',[id],'/cloud/system-events','GET'],['getCustomInfo',[id],'/custom-info','GET'],['getNode',[id],'/node','GET'],['setAutoUpgrade',[id,true],'/node/auto-upgrade','PUT',{enabled:true}],['reboot',[id,true],'/reboot','POST',{force:true}],
 ['getSnapshots',[id],'/snapshots','GET'],['createSnapshot',[id,'before'],'/snapshots','POST',{note:'before'}],['deleteSnapshot',[id,'s/a',false],'/snapshots/s%2Fa','DELETE',{confirmed:false}],['deleteSnapshot',[id,'s/a',true],'/snapshots/s%2Fa','DELETE',{confirmed:true}],['setSnapshotPolicy',[id,{enabled:true,time_utc:'02:00',retention_days:7}],'/snapshots/policy','PUT',{enabled:true,time_utc:'02:00',retention_days:7}],['rollback',[id,'s/a',false],'/snapshots/s%2Fa/rollback','POST',{confirmed:false}],['reinstall',[id,true],'/reinstall','POST',{confirmed:true,keep_data_disks:true}],['diagnose',[id],'/rescue/diagnose','POST'],
 ['getRules',[id],'/security-group','GET'],['addRule',[id,{direction:'in',protocol:'tcp',port_range:'22/22',source:'192.0.2.0/24',policy:'accept',description:'SSH',confirmed:true,dedicated_group_confirmed:true}],'/security-group/rules','POST',{direction:'in',protocol:'tcp',port_range:'22/22',source:'192.0.2.0/24',policy:'accept',description:'SSH',confirmed:true,dedicated_group_confirmed:true}],['deleteRule',[id,'r/a',true,true],'/security-group/rules/r%2Fa','DELETE',{confirmed:true,dedicated_group_confirmed:true}],['deleteRule',[id,'r/a'],'/security-group/rules/r%2Fa','DELETE',{confirmed:false,dedicated_group_confirmed:false}],['getUsageLimit',[id],'/usage-limit','GET'],['setUsageLimit',[id,{monthly_limit:null,on_reach:'notify'}],'/usage-limit','PUT',{monthly_limit:null,on_reach:'notify'}]
 ];
 for(const [method,args,suffix,verb,body] of cases){assert.deepEqual(await api[method](...args),{sentinel:true});assert.deepEqual(calls.at(-1),{path:prefix+suffix,method:verb,body});}
});
test('typed client preserves gateway error detail for permission and confirmation UI',async()=>{
 const failure={status:409,code:'needs_confirmation',detail:{loses:'system disk'}};const api=createServerPageApi(async()=>{throw failure;});await assert.rejects(api.reinstall('cc',false),error=>error===failure);
});
for(const failure of [
 {status:409,code:'needs_dedicated_group',message:'Use a dedicated firewall'},
 {status:403,code:'not_allowed',message:'Cannot change this firewall'},
 {status:409,code:'invalid_state',message:'Node preference unavailable'},
 {status:503,code:'metering_unavailable',detail:{reason:'usage_storage_unavailable'}},
])test(`typed client preserves ${failure.code} for the UI`,async()=>{
 const api=createServerPageApi(async()=>{throw failure;});
 for(const request of [()=>api.deleteRule('cc','rule'),()=>api.setAutoUpgrade('cc',true),()=>api.getUsageLimit('cc'),()=>api.setUsageLimit('cc',{monthly_limit:null,on_reach:'notify'})])await assert.rejects(request,error=>error===failure);
});
test('typed client preserves the final snapshots, created items, rules, node and awaiting-enrolment responses',async()=>{
 const snapshots={items:[{id:'s',disk_id:'d',kind:'manual',size_gb:null,created_at:'2026-11-18T00:00:00Z',status:'accomplished',note:''}],policy:{enabled:false,time_utc:'19:00',retention_days:7},monthly_cost:null,policy_choice:{enabled:true,time_utc:'19:00',retention_days:7},policy_error:{code:'permission_missing',message:'Policy unavailable'},billing_unavailable_reason:'No measured storage',operation:{operation_name:'rollback',operation_stage:'resetting_disk',operation_active:true,operation_error:null}};
 let response=snapshots;const api=createServerPageApi(async()=>response);
 assert.equal(await api.getSnapshots('cc'),snapshots);assert.equal(await api.setSnapshotPolicy('cc',snapshots.policy),snapshots);
 response={items:[{id:'s',disk_id:'d'}]};assert.equal(await api.createSnapshot('cc',''),response);
 response={rules:[],shared:true};assert.equal(await api.getRules('cc'),response);assert.equal(await api.deleteRule('cc','rule',true,true),response);
 response={version:'v1',latest_version:'v2',needs_upgrade:true,auto_upgrade:false,auto_upgrade_available:false,caps:[]};assert.equal(await api.getNode('cc'),response);assert.equal(await api.setAutoUpgrade('cc',true),response);
 response={id:'cc',node_status:'awaiting_enrolment'};assert.equal(await api.reinstall('cc',true),response);
});
