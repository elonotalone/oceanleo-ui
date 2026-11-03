import assert from 'node:assert/strict';
import test from 'node:test';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
import { normalizeWorkspaceAction, workspaceMaterialAssetRef, workspaceMaterialsActionFromSearch, FIXED_WORKSPACE_SLOTS } from '../src/shell/workspace-actions.ts';
import { isLibraryDeepLinkSearch, legacyWorkspaceAppId } from '../src/shell/workspace-route.ts';
import { W4_SIDEBAR_MESSAGES } from '../src/i18n/ui/messages/w4-sidebar-copy.ts';
import { LOCALES } from '../src/i18n/config.ts';
const intent = await import(await compileModule('src/shell/library-edit-intent.ts', {
  './artifact-client': dataModule('export async function getCurrentArtifactItem(){ throw new Error("not used"); }'),
}));

test('legacy materials action becomes LeoBay browsing with all supported filters and pin intact', () => {
  const result = normalizeWorkspaceAction({ version: 1, tab: 'materials', query: ' poster ', category: 'image', itemId: 'artifact-id', entryId: 'catalog-id', revisionId: 'revision-id', intent: 'open' });
  assert.equal(result.tab, 'bay');
  assert.equal(result.view, 'materials');
  assert.equal(result.query, 'poster');
  assert.equal(result.category, 'image');
  assert.equal(result.entryId, 'catalog-id');
  assert.deepEqual(workspaceMaterialAssetRef(result), { kind: 'artifact', artifactId: 'artifact-id', revisionId: 'revision-id' });
  assert.equal(FIXED_WORKSPACE_SLOTS.includes('materials'), false);
});

test('a legacy materials bookmark retains its exact artifact/revision through parsing and action conversion', () => {
  for (const revisionKey of ['revisionId', 'revision']) {
    const parsed = intent.libraryPreviewIntentFromSearch(`?tab=materials&item=root&${revisionKey}=historical&mode=preview`);
    assert.equal(parsed.revisionId, 'historical');
    const action = normalizeWorkspaceAction(intent.libraryPreviewIntentAction(parsed));
    assert.deepEqual(workspaceMaterialAssetRef(action), { kind: 'artifact', artifactId: 'root', revisionId: 'historical' });
  }
});

test('materials tab mode belongs to the asset view even when its optional item is absent', () => {
  assert.equal(isLibraryDeepLinkSearch('?tab=materials&mode=preview'), true);
  assert.equal(legacyWorkspaceAppId('?tab=materials&mode=preview'), '');
  assert.equal(legacyWorkspaceAppId('?mode=preview'), 'preview', 'an actual legacy app called preview remains valid');
});

test('sidebar copy covers all locales and never falls back to Chinese for another language', () => {
  for (const locale of LOCALES) {
    assert.equal(Object.keys(W4_SIDEBAR_MESSAGES[locale]).length, 10, locale);
    for (const value of Object.values(W4_SIDEBAR_MESSAGES[locale])) {
      assert.ok(value.length > 0);
      if (locale !== 'zh' && locale !== 'zh-TW') assert.doesNotMatch(value, /\p{Script=Han}/u, locale);
    }
  }
});


test('old raw material URLs preserve platform identities and filter search when moved to LeoBay', () => {
  const action = workspaceMaterialsActionFromSearch('?tab=materials&asset=library%3Ap1&q=poster');
  assert.equal(action.tab, 'bay');
  assert.equal(action.view, 'materials');
  assert.equal(action.query, 'poster');
  assert.deepEqual(workspaceMaterialAssetRef(action), { kind: 'platform', id: 'p1' });
  assert.equal(workspaceMaterialsActionFromSearch('?tab=mine&asset=library%3Ap1'), null);
});
