import assert from 'node:assert/strict';
import test from 'node:test';
import {compileModule,dataModule} from '../../tests/helpers/module-bench.mjs';
const {createServerPageApi}=await import(await compileModule('src/lib/server-page-api.ts',{'./cloud-computer-api':dataModule(`export async function cloudComputerRequest(){throw new Error('unexpected network')}`)}));
test('typed client paths, verb and exact JSON match the dispatch contract',async()=>{
 const calls=[];const api=createServerPageApi(async(path,init)=>{calls.push({path,method:init?.method??'GET',body:init?.body?JSON.parse(init.body):undefined});return {sentinel:true};});const id='cc/a ?';const prefix='/v1/computers/cc%2Fa%20%3F';
 const cases=[
 ['getOverview',[id],'/cloud/overview','GET'],['getMetrics',[id,'7d'],'/metrics?range=7d','GET'],['getCloudMonitor',[id,'net_out','24h'],'/cloud/monitor?metric=net_out&range=24h','GET'],['getSystemEvents',[id],'/cloud/system-events','GET'],['getCustomInfo',[id],'/custom-info','GET'],['getNode',[id],'/node','GET'],['setAutoUpgrade',[id,true],'/node/auto-upgrade','PUT',{enabled:true}],['reboot',[id,true],'/reboot','POST',{force:true}],
 ['getSnapshots',[id],'/snapshots','GET'],['createSnapshot',[id,'before'],'/snapshots','POST',{note:'before'}],['deleteSnapshot',[id,'s/a'],'/snapshots/s%2Fa','DELETE'],['setSnapshotPolicy',[id,{enabled:true,time_utc:'02:00',retention_days:7}],'/snapshots/policy','PUT',{enabled:true,time_utc:'02:00',retention_days:7}],['rollback',[id,'s/a',false],'/snapshots/s%2Fa/rollback','POST',{confirmed:false}],['reinstall',[id,true],'/reinstall','POST',{confirmed:true,keep_data_disks:true}],['diagnose',[id],'/rescue/diagnose','POST'],
 ['getRules',[id],'/security-group','GET'],['addRule',[id,{direction:'in',protocol:'tcp',port_range:'22/22',source:'192.0.2.0/24',policy:'accept',description:'SSH',confirmed:true}],'/security-group/rules','POST',{direction:'in',protocol:'tcp',port_range:'22/22',source:'192.0.2.0/24',policy:'accept',description:'SSH',confirmed:true}],['deleteRule',[id,'r/a',true],'/security-group/rules/r%2Fa','DELETE',{confirmed:true}],['getUsageLimit',[id],'/usage-limit','GET'],['setUsageLimit',[id,{monthly_limit:null,on_reach:'notify'}],'/usage-limit','PUT',{monthly_limit:null,on_reach:'notify'}]
 ];
 for(const [method,args,suffix,verb,body] of cases){assert.deepEqual(await api[method](...args),{sentinel:true});assert.deepEqual(calls.at(-1),{path:prefix+suffix,method:verb,body});}
});
test('typed client preserves gateway error detail for permission and confirmation UI',async()=>{
 const failure={status:409,code:'needs_confirmation',detail:{loses:'system disk'}};const api=createServerPageApi(async()=>{throw failure;});await assert.rejects(api.reinstall('cc',false),error=>error===failure);
});
