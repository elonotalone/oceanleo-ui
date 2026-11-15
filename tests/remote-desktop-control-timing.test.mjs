import test from 'node:test';
import assert from 'node:assert/strict';
import {RemoteControlTimings} from '../src/api/remote-desktop-control-timing.ts';

test('terminal receipts report one monotonic interval and preserve the actual outcome',()=>{
 let now=100;const samples=[];const timing=new RemoteControlTimings(()=>now,s=>samples.push(s));
 timing.sent(1,true);now=125;timing.receipt({seq:1,status:'merged',executed_at_ms:9000000000000});
 timing.receipt({seq:1,status:'executed',executed_at_ms:1});
 assert.deepEqual(samples,[{seq:1,stage:'input_receipt',status:'merged',elapsedMs:25}]);
 assert.equal(timing.accepted,undefined);assert.equal(timing.completedThrough,undefined);assert.equal(timing.admittedThrough,undefined);
});
test('unwritten, evicted and disposed history cannot produce timing samples',()=>{
 let now=0;const samples=[];const timing=new RemoteControlTimings(()=>now,s=>samples.push(s));
 for(let i=1;i<=300;i++)timing.sent(i,true);now=10;
 for(let i=1;i<=300;i++)timing.receipt({seq:i,status:'executed',executed_at_ms:1});
 assert.equal(samples.length,256);assert.equal(samples[0].seq,45);
 timing.sent(301,true);timing.dispose();timing.receipt({seq:301,status:'executed',executed_at_ms:1});assert.equal(samples.length,256);
});
test('invalid clocks and throwing observers cannot affect input',()=>{
 let now=100;const samples=[];const timing=new RemoteControlTimings(()=>now,s=>samples.push(s));
 timing.sent(1,true);now=NaN;timing.receipt({seq:1,status:'executed',executed_at_ms:1});assert.equal(samples.length,0);
 const throwing=new RemoteControlTimings(()=>100,()=>{throw Error('diagnostic-only')});throwing.sent(2,true);assert.doesNotThrow(()=>throwing.receipt({seq:2,status:'rejected',executed_at_ms:1}));
});
