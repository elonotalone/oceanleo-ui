import assert from 'node:assert/strict';
import test from 'node:test';
import { AdvancedDraftSnapshotQueue, ADVANCED_DRAFT_META_KEY, advancedDraftAfterVersion,
  normalizeAdvancedDraftPointer, uploadAdvancedDraft, loadAdvancedDraft } from '../src/shell/advanced-draft.ts';
import { advancedSessionSnapshot, advancedSessionAppId, advancedItemFromSession,
  withInlineEditorHistoryHead, inlineEditorItemsFromSession, advancedDraftFromSnapshot } from '../src/shell/advanced-session.ts';
import { loadDeckServerDraft, DECK_DRAFT_SCHEMA } from '../src/shell/advanced-draft-deck.ts';
import { normalizeDeckDocument } from '../src/shell/doc-editors/deck-schema.ts';

const item = { id: 'base-1', key: 'ppt-root', source: 'creation', kind: 'ppt', siteId: 'ppt', title: 'Deck', favorite: false,
  url: 'https://files.example/base.pptx', meta: { parent_asset_id: 'root-1', source_format: 'pptx' } };
const pointer = { rootId: 'root-1', baseRevisionId: 'base-1', url: 'https://files.example/draft.json',
  schema: DECK_DRAFT_SCHEMA, editRevision: 3, savedAt: '2026-09-27T00:00:00Z' };
const session = snapshot => ({ id: 'session-1', app_id: advancedSessionAppId(item, 'deck'), revision: 1, snapshot });
const document = normalizeDeckDocument({ title: 'Saved working title', slides: [{ id: 'slide', title: 'Edited heading' }] });
const response = (data = { deck: document, draft: null }, extra = {}) => new Response(JSON.stringify({ ...pointer, version: 1, data, ...extra }));

test('inline and standalone snapshots round trip draft pointers alongside a version head', () => {
  for (const inline of [false, true]) {
    const snapshot = inline ? withInlineEditorHistoryHead({ console: { text: 'keep me' } }, item, 'deck', null, pointer)
      : advancedSessionSnapshot(item, 'deck', null, pointer);
    assert.deepEqual(advancedDraftFromSnapshot(snapshot, item), pointer);
    const restored = inline ? inlineEditorItemsFromSession(session(snapshot))[0] : advancedItemFromSession(session(snapshot));
    assert.deepEqual(restored.meta[ADVANCED_DRAFT_META_KEY], pointer);
    if (inline) assert.deepEqual(snapshot.console, { text: 'keep me' });
  }
});
test('version receipt clears covered draft in the same snapshot; a newer draft is preserved on the new base', () => {
  const newItem = { ...item, id: 'base-2' };
  assert.equal(advancedDraftAfterVersion(pointer, 3, 'base-2'), null);
  assert.equal(advancedDraftAfterVersion(pointer, 4, 'base-2'), null);
  const rebased = advancedDraftAfterVersion({ ...pointer, editRevision: 4 }, 3, 'base-2');
  assert.deepEqual(rebased, { ...pointer, editRevision: 4, baseRevisionId: 'base-2' });
  const original = withInlineEditorHistoryHead({ console: 'keep' }, item, 'deck', null, pointer);
  const committed = withInlineEditorHistoryHead(original, newItem, 'deck', null, advancedDraftAfterVersion(pointer, 3, 'base-2'));
  assert.equal(advancedDraftFromSnapshot(committed, newItem), null);
  assert.equal(inlineEditorItemsFromSession(session(committed))[0].id, 'base-2');
  assert.equal(committed.console, 'keep');
  const newer = withInlineEditorHistoryHead(original, newItem, 'deck', null, rebased);
  assert.deepEqual(advancedDraftFromSnapshot(newer, newItem), rebased);
});
test('old snapshots and foreign or malformed draft pointers remain compatible', () => {
  assert.equal(advancedDraftFromSnapshot(advancedSessionSnapshot(item, 'deck'), item), null);
  assert.ok(advancedItemFromSession(session(advancedSessionSnapshot(item, 'deck'))));
  for (const bad of [{ ...pointer, rootId: 'another-root' }, { ...pointer, baseRevisionId: 'old-base' }, { ...pointer, url: 'javascript:alert(1)' }, { ...pointer, editRevision: NaN }]) {
    assert.equal(advancedDraftFromSnapshot(advancedSessionSnapshot(item, 'deck', null, bad), item), null);
  }
  assert.equal(normalizeAdvancedDraftPointer({ ...pointer, url: 'https://user:pass@files.example/draft' }), null);
});
test('snapshot queue serializes both tiers and merges from the last confirmed receipt before React renders', async () => {
  const queue = new AdvancedDraftSnapshotQueue(), events = [];
  const initial = session(withInlineEditorHistoryHead({ console: 'keep' }, item, 'deck'));
  let release; const pending = new Promise(r => { release = r; });
  const draft = queue.run(async () => {
    events.push('draft:start'); await pending;
    queue.accept({ ...initial, revision: 2, snapshot: withInlineEditorHistoryHead(initial.snapshot, item, 'deck', null, pointer) });
    events.push('draft:ack');
  });
  const version = queue.run(async () => {
    events.push('version:start');
    const current = queue.current(initial);
    assert.equal(current.revision, 2); assert.deepEqual(advancedDraftFromSnapshot(current.snapshot, item), pointer);
  });
  await Promise.resolve(); assert.deepEqual(events, ['draft:start']);
  release(); await Promise.all([draft, version]);
  assert.deepEqual(events, ['draft:start','draft:ack','version:start']);
  const other = { ...initial, id: 'another-session' }; assert.equal(queue.current(other), other);
});
test('upload uses the existing file transport without creating a version; document/schema/revision round trip', async () => {
  let encoded, options;
  const uploaded = await uploadAdvancedDraft({ identity: { rootId: 'root-1', baseRevisionId: 'base-1' }, schema: DECK_DRAFT_SCHEMA,
    revision: 3, payload: { deck: document, draft: null }, siteId: 'ppt', title: 'Deck' }, {
    now: () => pointer.savedAt,
    upload: async (file, opts) => { encoded = await file.text(); options = opts; return { ok: true, data: { file: { url: pointer.url } } }; },
  });
  assert.deepEqual(uploaded, pointer); assert.equal(options.registerAsset, false);
  assert.match(options.idempotencyKey, /^advanced-draft:[a-f0-9]{64}$/);
  const data = await loadAdvancedDraft(uploaded, undefined, async () => new Response(encoded));
  assert.equal(data.deck.title, 'Saved working title');
});
test('upload failure or null capture cannot produce a durable pointer', async () => {
  const input = { identity: { rootId: 'root-1', baseRevisionId: 'base-1' }, schema: DECK_DRAFT_SCHEMA, revision: 3, payload: {}, siteId: 'ppt', title: 'Deck' };
  await assert.rejects(() => uploadAdvancedDraft({ ...input, payload: null }), /工作文档/);
  await assert.rejects(() => uploadAdvancedDraft(input, { upload: async () => ({ ok: false, error: 'offline' }) }), /offline/);
});
test('PPT reopening loads a matching server document; changed base or schema skips it without a request', async () => {
  const input = { ...item, meta: { ...item.meta, [ADVANCED_DRAFT_META_KEY]: pointer } };
  const loaded = await loadDeckServerDraft(input, undefined, async () => response());
  assert.equal(loaded.deck.title, 'Saved working title'); assert.deepEqual(loaded.serverDraft, pointer);
  let reads = 0;
  for (const stale of [{ ...input, id: 'base-2' }, { ...input, meta: { ...input.meta, [ADVANCED_DRAFT_META_KEY]: { ...pointer, schema: 'foreign' } } }]) {
    assert.equal(await loadDeckServerDraft(stale, undefined, async () => { reads++; return response(); }), null);
  }
  assert.equal(reads, 0);
});
test('matching draft load errors are surfaced instead of silently showing the old version', async () => {
  const input = { ...item, meta: { ...item.meta, [ADVANCED_DRAFT_META_KEY]: pointer } };
  await assert.rejects(() => loadDeckServerDraft(input, undefined, async () => new Response('', { status: 503 })), /重新载入/);
  await assert.rejects(() => loadDeckServerDraft(input, undefined, async () => response(undefined, { rootId: 'foreign' })), /不匹配/);
});
