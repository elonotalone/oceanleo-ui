/** Read-only live home/CDN acceptance; no browser, credentials or data writes.
 * UC-1/UC-7: docs/architecture/oceanleo-untrusted-content-isolation.md.
 * Run with the repository's tests/ts-extension-loader.mjs + --experimental-strip-types.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolvePublicAssetMedia} from '../src/lib/asset-delivery.ts';

const args=process.argv.slice(2);
if(args.includes('--help')) {
  console.log('Usage: node --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs tests/asset-delivery-home-http-w4-cdnextra.mjs [--api-origin http://127.0.0.1:8008] [--manifest /root/.cache/oceanleo-asset-mirror/manifest.json]');
  process.exit(0);
}
function option(flag,fallback) {const i=args.indexOf(flag);if(i<0)return fallback;assert.ok(args[i+1],`missing ${flag}`);return args[i+1];}
const api=option('--api-origin','http://127.0.0.1:8008');
const manifest=JSON.parse(await readFile(option('--manifest','/root/.cache/oceanleo-asset-mirror/manifest.json'),'utf8'));
const response=await fetch(new URL('/v1/home/assets',api),{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(30000)});
assert.equal(response.status,200,'anonymous home API');
const payload=await response.json();
assert.deepEqual(payload.sections.map(section=>section.id),['video','image','website','essay']);
const byKey=new Map(manifest.objects.map(row=>[row.key,row]));
const urls=new Set();let resolved=0,cn=0;
for(const section of payload.sections) for(const item of section.items) {
  const raw=item.preview.key || item.preview.url || '';
  assert.ok(raw,`missing ${section.id} preview`);
  for(const family of ['com','ws']) {
    const url=resolvePublicAssetMedia(raw,{purpose:'thumb',family});
    assert.equal(new URL(url).hostname,'assets.oceanleo.com',`${family} ${section.id} must use CDN`);
    assert.equal(byKey.get(new URL(url).pathname.slice(1))?.status,'verified',`missing verified receipt: ${url}`);
    urls.add(url);resolved++;
  }
  assert.equal(new URL(resolvePublicAssetMedia(raw,{purpose:'thumb',family:'cn'})).hostname,'oceanleo-assets.oss-cn-guangzhou.aliyuncs.com');cn++;
}
assert.ok(urls.size,'empty home cannot pass delivery acceptance');
let verified=0;
for(const url of urls) {
  const image=await fetch(url,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(30000)});
  const receipt=byKey.get(new URL(url).pathname.slice(1));
  assert.equal(image.status,200,url);
  assert.equal(image.headers.get('content-type').split(';')[0],receipt.contentType,url);
  assert.equal(image.headers.get('cache-control'),receipt.cacheControl,url);
  const body=Buffer.from(await image.arrayBuffer());
  assert.equal(body.length,receipt.bytes,url);
  assert.equal(createHash('sha256').update(body).digest('hex'),receipt.sha256,url);
  verified++;
}
console.log(JSON.stringify({sections:payload.sections.map(s=>({id:s.id,count:s.items.length})),comWsResolved:resolved,guangzhouFallbacks:0,cnSourcePreserved:cn,httpImagesVerified:verified,pass:true}));
