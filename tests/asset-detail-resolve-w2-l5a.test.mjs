// Projection/rights only: no DOM, iframe or executable content changes.
import assert from 'node:assert/strict';
import test from 'node:test';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
import { bayAssetToLibraryEntry } from '../src/shell/bay/asset/library-entry-adapter.ts';

const url = 'https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/assets/charts/funnel-inside-label/cover.webp';
const e11 = {
  id: 'library:fd99ee4c-e474-4c3b-82d3-fbc34f2e7578', source: 'library', type: 'image',
  title: '转化漏斗 · 内嵌标签漏斗图', thumb_url: url + '?thumb', preview_url: url + '?preview', full_url: url,
  format: 'webp', mime_type: 'image/webp', width: 1240, height: 800, author: 'OceanLeo', origin: 'first-party',
  created_at: '2026-07-02T18:36:00Z', license: { code: 'OceanLeo-Free-1.0', commercial_ok: true, modify_ok: true },
  price_fen: 0, currency: 'CNY',
};
const ref = { kind: 'platform', id: e11.id.slice(8) };
const context = {
  surface: 'bay', ref, owned: false,
  commerce: { priceFen: 0, currency: 'CNY', free: true, purchaseState: 'none' },
  rights: { canView: true, canDownload: false, canDownloadSource: false, canEdit: false, canUseInTask: false, canAddToLibrary: true },
  author: { name: 'OceanLeo' }, createdAt: e11.created_at,
};
const network = { calls: [], resolve: null, artifact: null };
globalThis.__assetResolveL5A = network;
const { resolveAssetDetail } = await import(await compileModule('src/shell/asset-detail/resolve.ts', {
  '../../lib/bay/assets': dataModule(`export async function resolveBayAsset(ref, options) { const n=globalThis.__assetResolveL5A; n.calls.push({kind:'resolve',ref,options}); return n.resolve; }`),
  '../artifact-client': dataModule(`export async function getArtifactItem(id, revision, signal) { const n=globalThis.__assetResolveL5A; n.calls.push({kind:'artifact',id,revision,signal}); return n.artifact; }`),
}));

test('E11 image uses full content, independent thumbnail/preview and the real date', () => {
  const entry = bayAssetToLibraryEntry(e11);
  assert.equal(entry.kind, 'image');
  assert.equal(entry.libraryItem.url, url);
  assert.equal(entry.libraryItem.previewUrl, e11.preview_url);
  assert.equal(entry.thumbUrl, e11.thumb_url);
  assert.equal(entry.libraryItem.createdAt, '2026-07-02T18:36:00Z');
  assert.equal(entry.uploader, 'OceanLeo');
  assert.equal(entry.libraryItem.meta.mime_type, 'image/webp');
  assert.equal(entry.libraryItem.meta.width, 1240);
  assert.equal(entry.libraryItem.meta.height, 800);
  assert.equal(entry.purchased, false);
  assert.equal(entry.libraryItem.meta.bay_asset_source_rights, false);
});

test('unknown price remains null and is omitted from legacy numeric detail', () => {
  for (const value of [undefined, null, '', -1, false, 1.2]) {
    const entry = bayAssetToLibraryEntry({ ...e11, price_fen: value });
    assert.equal(entry.priceFen, null);
    assert.equal(entry.libraryItem.meta.bay_asset_price_fen, null);
    assert.equal(entry.detail.priceFen, undefined);
  }
});

test('seller cover never becomes document/video content or fabricated durable identity', () => {
  const entry = bayAssetToLibraryEntry({ id: 'listing', listing_id: 'listing', title: 'Clip', type: 'video', cover_url: url, price_fen: 100, seller_id: 'seller', artifact_id: 'private-root', revision_id: 'private-rev' });
  assert.equal(entry.kind, 'video');
  assert.equal(entry.thumbUrl, url);
  assert.equal(entry.libraryItem.url, undefined);
  assert.equal(entry.libraryItem.artifactId, undefined);
});

test('supported catalog types retain viewer semantics', () => {
  const expected = { single_file_image: 'image', vector_image: 'image', composite_image: 'image', deck: 'ppt', model_3d: 'threed', grid: 'sheet', pdf: 'document', video_workflow: 'video_canvas', interactive_doc: 'interactive_doc' };
  for (const [type, kind] of Object.entries(expected)) assert.equal(bayAssetToLibraryEntry({ ...e11, type }).kind, kind);
});

test('platform resolver preserves server rights and the chosen surface', async () => {
  network.calls = [];
  network.resolve = { asset: e11, actionContext: context };
  const signal = new AbortController().signal;
  const result = await resolveAssetDetail(ref, { signal, surface: 'home' });
  assert.equal(result.entry.libraryItem.url, url);
  assert.equal(result.actionContext.surface, 'home');
  assert.equal(result.actionContext.owned, false);
  assert.deepEqual(result.actionContext.rights, context.rights);
  assert.equal(network.calls.length, 1);
  assert.equal(network.calls[0].options.signal, signal);
});

test('after claim only server-confirmed ownership and rights appear', async () => {
  network.resolve = { asset: e11, actionContext: { ...context, owned: true, commerce: { ...context.commerce, purchaseState: 'settled' }, rights: { ...context.rights, canDownload: true, canUseInTask: true, canAddToLibrary: false } } };
  const result = await resolveAssetDetail(ref);
  assert.equal(result.actionContext.owned, true);
  assert.equal(result.actionContext.commerce.purchaseState, 'settled');
  assert.equal(result.entry.purchased, true);
  assert.equal(result.entry.libraryItem.meta.bay_asset_source_rights, false);
});

test('artifact, template and purchased listing fetch the exact server-approved root/revision', async () => {
  for (const requested of [{ kind: 'artifact', artifactId: 'root', revisionId: 'selected' }, { kind: 'template', id: 'same-uuid' }, { kind: 'listing', id: 'same-uuid' }]) {
    network.calls = [];
    network.resolve = { artifactRef: { kind: 'artifact', artifactId: 'root', revisionId: 'selected' }, actionContext: { ...context, ref: requested } };
    network.artifact = { ok: true, data: { key: 'artifact:root', id: 'root', artifactId: 'root', revisionId: 'selected', source: 'artifact', title: 'Fixed', kind: 'image', meta: {} } };
    const result = await resolveAssetDetail(requested);
    assert.equal(network.calls[1].id, 'root');
    assert.equal(network.calls[1].revision, 'selected');
    assert.deepEqual(result.actionContext.ref, requested);
  }
});

test('wrong root, wrong revision and failed reads never enter the detail', async () => {
  network.resolve = { artifactRef: { kind: 'artifact', artifactId: 'root', revisionId: 'selected' }, actionContext: context };
  for (const artifact of [{ ok: false }, { ok: true, data: { artifactId: 'other', revisionId: 'selected' } }, { ok: true, data: { artifactId: 'root', revisionId: 'new-head' } }]) {
    network.artifact = artifact;
    await assert.rejects(resolveAssetDetail(ref));
  }
});

test('cancelled resolver never returns stale selected content', async () => {
  network.resolve = { asset: e11, actionContext: context };
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(resolveAssetDetail(ref, { signal: abort.signal }), { name: 'AbortError' });
});

const requests = [];
globalThis.__assetClientL5A = requests;
const clients = await import(await compileModule('src/lib/bay/assets.ts', {
  './http': dataModule(`export async function bayGet(path, options){globalThis.__assetClientL5A.push({method:'GET',path,options});return {};}; export async function bayPost(path,body){globalThis.__assetClientL5A.push({method:'POST',path,body});return {};}`),
}));

test('platform claims and seller purchases use distinct endpoints and identities', async () => {
  requests.length = 0;
  await clients.claimBayAsset(ref);
  await clients.purchaseBayAsset('seller-listing', { idempotency_key: 'purchase-1' });
  assert.equal(requests[0].path, '/v1/bay/assets/claim');
  assert.deepEqual(requests[0].body, { ref });
  assert.equal(requests[1].path, '/v1/bay/assets/seller-listing/purchase');
});

test('resolve client carries identity kind, revision and auth-preserving anonymous option', async () => {
  requests.length = 0;
  const signal = new AbortController().signal;
  await clients.resolveBayAsset({ kind: 'artifact', artifactId: 'root', revisionId: 'pinned' }, { signal });
  const request = requests[0];
  const parsed = new URL(request.path, 'https://example.invalid');
  assert.equal(parsed.searchParams.get('kind'), 'artifact');
  assert.equal(parsed.searchParams.get('revision_id'), 'pinned');
  assert.equal(request.options.anonymous, true);
  assert.equal(request.options.signal, signal);
});
