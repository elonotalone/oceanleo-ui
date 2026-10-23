import assert from 'node:assert/strict';
import test from 'node:test';
import { Y, makeClient, sampleWorkbook, gridFromY } from './collab-grid-sim.mjs';
import { readGridEntityState, normalizeGridSnapshot } from '../src/shell/collab/adapters/grid.ts';
import { parseGridCellIdKey } from '../src/shell/doc-editors/grid-univer/collab-layout-model.ts';

function reopen(snapshot, remoteEdit) {
  const source = new Y.Doc();
  const original = makeClient({ doc:source, needsSeed:true, snapshot });
  if (remoteEdit) { original.edit(remoteEdit); original.tick(); }
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(source), 'relay');
  const client = makeClient({ doc, needsSeed:false, snapshot });
  return { original, source, doc, client };
}

test('reopen cannot replace ids-v2 keys with position keys before its first room alignment', () => {
  const snapshot = sampleWorkbook({ rows:20, cols:8, filled:6 });
  const { client, doc } = reopen(snapshot);
  client.edit(() => {}); // Univer emits initialization/painting commands too.
  client.tick();
  const beforeSync = readGridEntityState(doc);
  assert.equal(Object.keys(beforeSync.entities).length, 48);
  assert.ok(Object.keys(beforeSync.entities).every(parseGridCellIdKey), 'every shared key remains a stable row/column id');
  client.room.setStatus('synced');
  client.tick();
  assert.deepEqual(normalizeGridSnapshot(client.live), normalizeGridSnapshot(snapshot));
  assert.deepEqual(normalizeGridSnapshot(gridFromY(doc)), normalizeGridSnapshot(snapshot));
});

test('a local edit queued before first alignment preserves both the room edit and the local edit', () => {
  const snapshot = sampleWorkbook({ rows:20, cols:8, filled:6 });
  const { client, doc } = reopen(snapshot, s => { s.sheets.s1.cellData[0][0] = { v:'remote-new' }; });
  client.setCell('s1', 0, 1, { v:'local-before-sync' });
  client.tick();
  assert.equal(gridFromY(doc).sheets.s1.cellData[0][0].v, 'remote-new', 'pending local write cannot overwrite an unread room');
  client.room.setStatus('synced');
  client.tick();
  assert.equal(client.cell('s1',0,0).v, 'remote-new');
  assert.equal(client.cell('s1',0,1).v, 'local-before-sync');
  assert.equal(gridFromY(doc).sheets.s1.cellData[0][0].v, 'remote-new');
  assert.equal(gridFromY(doc).sheets.s1.cellData[0][1].v, 'local-before-sync');
});
