import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {privateSdk} from '../scripts/prepare-private-artc-sdk.mjs';

test('private remote SDK is exactly the reviewed deterministic patch; drift fails closed', async () => {
  const source = await readFile(new URL('../node_modules/aliyun-rtc-sdk/dist/aliyun-rtc-sdk.es.js', import.meta.url), 'utf8');
  const output = await readFile(new URL('../vendor/remote-artc/aliyun-rtc-sdk.private.mjs', import.meta.url), 'utf8');
  assert.equal(output, privateSdk(source));
  assert.match(output, /Ni = new Oo\([^\n]+disabled: true, deferRegionSet: !0/);
  assert.doesNotMatch(output, /disabled: window\.AliRtcOptionsDisableProxy/);
  assert.throws(() => privateSdk(source + '\n'), /Unreviewed/);
});
test('remote viewer cannot fall back to unpatched SDK or CDN', async () => {
  const loader = await readFile(new URL('../src/pages/remote-desktop-sdk.ts', import.meta.url), 'utf8');
  const viewer = await readFile(new URL('../src/pages/remote-desktop-media.ts', import.meta.url), 'utf8');
  assert.match(loader, /import\("\.\.\/\.\.\/vendor\/remote-artc\/aliyun-rtc-sdk\.private\.mjs"\)/);
  assert.match(loader, /OCEANLEO_REMOTE_PRIVACY !==/);
  assert.doesNotMatch(loader, /loadArtcSdk|loadFromCdn|createElement|import\("aliyun-rtc-sdk"\)/);
  assert.match(viewer, /sdkLoader:.*= loadRemoteArtcSdk/);
});
