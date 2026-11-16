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
