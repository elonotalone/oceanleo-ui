import assert from 'node:assert/strict';
import test from 'node:test';
import { harness } from './helpers/remote-desktop-webrtc.mjs';

function location(t, hostname, search) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hostname, search } } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'window', previous) : delete globalThis.window);
}
for (const hostname of ['localhost','127.0.0.1','[::1]','p-fixture.dev.oceanleo.com']) {
  test(`explicit debug relay switch works on ${hostname}, including peer recovery`, async t => {
    location(t, hostname, '?__rd_debug=1&__rd_ice=relay');
    const h = await harness(t); await h.viewer.start(); h.open();
    assert.equal(h.viewer.pc.configuration.iceTransportPolicy, 'relay');
    h.viewer.pc.state('failed'); await h.advance(200);
    assert.equal(h.viewer.gen, 2); assert.equal(h.viewer.pc.configuration.iceTransportPolicy, 'relay');
  });
}
for (const [hostname, search] of [
  ['localhost','?__rd_ice=relay'], ['localhost','?__rd_debug=1'],
  ['oceanbizs.com','?__rd_debug=1&__rd_ice=relay'],
  ['oceanleo.com','?__rd_debug=1&__rd_ice=relay'],
  ['p-fixture.dev.oceanleo.com.evil.test','?__rd_debug=1&__rd_ice=relay'],
]) test(`normal candidate policy remains on ${hostname} ${search}`, async t => {
  location(t, hostname, search); const h = await harness(t); await h.viewer.start();
  assert.equal(h.viewer.pc.configuration.iceTransportPolicy, 'all');
});

test('supported capture timestamp extension is enabled before offering, other headers unchanged', async t => {
  const { FakePeer } = await import('./helpers/remote-desktop-webrtc.mjs');
  const add = FakePeer.prototype.addTransceiver; let selected;
  const other = {uri:'urn:ietf:params:rtp-hdrext:sdes:mid',direction:'sendrecv'};
  t.mock.method(FakePeer.prototype,'addTransceiver',function(...args){
    const tr=add.apply(this,args);
    tr.getHeaderExtensionsToNegotiate=()=>[other,{uri:'http://www.webrtc.org/experiments/rtp-hdrext/abs-capture-time',direction:'stopped'}];
    tr.setHeaderExtensionsToNegotiate=value=>{assert.equal(this.offers.length,0);selected=value;};return tr;
  });
  const h=await harness(t);await h.viewer.start();
  assert.equal(selected[0],other);assert.equal(selected[1].direction,'recvonly');assert.equal(h.viewer.pc.offers.length,1);
});
test('timing header API failures leave the picture negotiation alive', async t => {
  const { FakePeer } = await import('./helpers/remote-desktop-webrtc.mjs');const add=FakePeer.prototype.addTransceiver;
  t.mock.method(FakePeer.prototype,'addTransceiver',function(...args){const tr=add.apply(this,args);tr.getHeaderExtensionsToNegotiate=()=>{throw Error('unsupported');};return tr;});
  const h=await harness(t);await h.viewer.start();assert.equal(h.viewer.pc.offers.length,1);assert.deepEqual(h.terminals,[]);
});
