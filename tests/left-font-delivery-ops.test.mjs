import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deliver } from '../scripts/deliver-editor-fonts.mjs';
const body = Buffer.from('wOF2fixture');
const object = { key:'assets/fonts/noto/version/font.woff2', type:'font/woff2', body, sha256:createHash('sha256').update(body).digest('hex') };

test('font delivery creates immutable public objects and verifies exact bytes', async () => {
  const requests=[];let added=false;
  await deliver([object], async request => {
    requests.push(request);
    if(request.method==='HEAD') return {status:404};
    if(request.method==='PUT') {added=true;return {status:200};}
    return {status:200,body};
  },{source:true});
  assert.ok(added);
  assert.equal(requests[1].headers['x-oss-forbid-overwrite'],'true');
  assert.equal(requests[1].headers['Content-Type'],'font/woff2');
  assert.ok(requests.every(request=>request.source));
});

test('font delivery never overwrites a differing existing object', async () => {
  const requests=[];
  await assert.rejects(deliver([object], async request => {
    requests.push(request);
    return request.method==='HEAD'?{status:200}:{status:200,body:Buffer.from('other')};
  },{source:false}),/overwrite refused/);
  assert.equal(requests.filter(request=>request.method==='PUT').length,0);
});

test('repeat exact delivery verifies without another write', async () => {
  const requests=[];
  await deliver([object],async request=>{requests.push(request);return {status:200,body};},{source:false});
  assert.equal(requests.filter(request=>request.method==='PUT').length,0);
});
