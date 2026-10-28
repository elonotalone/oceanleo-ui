import test from 'node:test';
import assert from 'node:assert/strict';
import {RemoteControlTimings} from '../src/api/remote-desktop-control-timing.ts';

test('accepted and native completion are separate same-end monotonic intervals',()=>{
 let now=100;const samples=[];const timing=new RemoteControlTimings(()=>now,s=>samples.push(s));
 timing.sent(1);now=125;timing.accepted(1);assert.deepEqual(samples,[{seq:1,stage:'accepted',elapsedMs:25}]);
 now=190;timing.completedThrough(1);assert.deepEqual(samples[1],{seq:1,stage:'completion_watermark',elapsedMs:90});
 timing.accepted(1);timing.completedThrough(1);assert.equal(samples.length,2);
 assert.deepEqual(Object.keys(samples[0]),['seq','stage','elapsedMs']);
});
test('coalesced watermark is numeric diagnostics only, bounded and disposed per stream',()=>{
 let now=0;const samples=[];const timing=new RemoteControlTimings(()=>now,s=>samples.push(s));
 for(let i=1;i<=300;i++)timing.sent(i);now=10;timing.completedThrough(300);
 assert.equal(samples.length,256);assert.equal(samples[0].seq,45);assert.equal(samples.at(-1).seq,300);
 timing.sent(301);timing.dispose();timing.completedThrough(301);assert.equal(samples.length,256);
});
test('retry resets measured write time and invalid clocks/reporters cannot affect controls',()=>{
 let now=100;const samples=[];const timing=new RemoteControlTimings(()=>now,s=>samples.push(s));
 timing.sent(1);now=150;timing.sent(1);now=160;timing.accepted(1);assert.equal(samples[0].elapsedMs,10);
 now=NaN;timing.completedThrough(1);assert.equal(samples.length,1);
 const throwing=new RemoteControlTimings(()=>100,()=>{throw Error('diagnostic-only')});throwing.sent(2);assert.doesNotThrow(()=>throwing.accepted(2));
});
