import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { zipSync, strToU8 } from 'fflate';
import * as cache from '../src/shell/office-editor/office-source-cache.ts';
import { officePackageKindForItem, officeRenditionPurposes, fetchValidatedOfficePackage } from '../src/shell/doc-editors/office-file.ts';

// Run the real hook body and its mount effect. Only React scheduling and the
// already-resolved rendition are supplied by the harness; caching/fetch are real.
const source = readFileSync(new URL('../src/shell/office-editor/useOfficeArtifactSource.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('hook.ts', source, ts.ScriptTarget.Latest, true);
const declaration = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'useOfficeArtifactSource');
const js = ts.transpileModule(declaration.getText(ast).replace('export ', ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function mount(item) {
  const effects = [];
  const deps = { ...cache, officePackageKindForItem, officeRenditionPurposes,
    useEffect: effect => effects.push(effect), useMemo: factory => factory(),
    isDurableLibraryItem: () => true,
    useArtifactRendition: value => ({ url: value.url, purpose: 'source', loading: false, error: '', version: 0, retry() {}, resourceFailed() {} }),
    withResolvedRendition: (value, rendition) => ({ ...value, url: rendition.url }),
  };
  const hook = new Function(...Object.keys(deps), `${js}; return useOfficeArtifactSource;`)(...Object.values(deps));
  const result = hook(item);
  effects.forEach(effect => effect());
  return result;
}
const packet = zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'ppt/presentation.xml': strToU8('<presentation/>') });
function material(kind = 'ppt', extension = 'pptx') {
  const url = `https://assets.oceanleo.app/test.${extension}`;
  return { id: 'a', artifactId: 'a', revisionId: 'r1', kind, title: `a.${extension}`, url, meta: { extension },
    artifact: { artifactId: 'a', revisionId: 'r1', sourceFormat: extension, renditions: { source: { url, revisionId: 'r1', purpose: 'source', mediaType: 'application/octet-stream' } } } };
}
function stubFetch(t, response) {
  cache.resetOfficeSourceCacheForTests(); let calls = 0;
  const old = globalThis.fetch; globalThis.fetch = async () => { calls++; return response(); };
  t.after(() => { globalThis.fetch = old; cache.resetOfficeSourceCacheForTests(); });
  return () => calls;
}
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };

for (const [kind, ext] of [['audio','mp3'], ['pdf','pdf'], ['model','glb'], ['chart','json']]) {
  test(`${kind}: mounting still resolves a source URL but does not download cache bytes`, async t => {
    const count = stubFetch(t, () => new Response(new Uint8Array(8)));
    const item = material(kind, ext), result = mount(item); await settle();
    assert.equal(result.url, item.url); assert.equal(result.loading, false);
    assert.equal(count(), 0); assert.equal(cache.officeSourceCacheStats().size, 0);
  });
}
test('Office mount, strict-mode remount, preview and editor still share one download', async t => {
  const count = stubFetch(t, () => new Response(packet)); const item = material();
  mount(item); mount({ ...item, meta: { ...item.meta } });
  const [preview, editor] = await Promise.all([
    fetchValidatedOfficePackage(item.url, 'pptx', { item }),
    cache.loadOfficeSource(item.url, item.revisionId, item),
  ]);
  assert.equal(count(), 1); assert.deepEqual(new Uint8Array(preview.arrayBuffer), packet); assert.deepEqual(new Uint8Array(editor.bytes), packet);
});
test('prewarm failure produces no unhandled rejection and the editor still reports the error', async t => {
  const count = stubFetch(t, () => new Response('', { status: 403 }));
  const unhandled = []; const listener = reason => unhandled.push(reason);
  process.on('unhandledRejection', listener); t.after(() => process.off('unhandledRejection', listener));
  const item = material(); mount(item); await settle();
  assert.equal(count(), 1); assert.equal(unhandled.length, 0); assert.equal(cache.officeSourceCacheStats().size, 0);
  let denied = 0;
  await assert.rejects(fetchValidatedOfficePackage(item.url, 'pptx', { item, onAccessDenied: () => denied++ }), { code: 'signed-url-expired' });
  assert.equal(denied, 1); assert.equal(count(), 2);
});
