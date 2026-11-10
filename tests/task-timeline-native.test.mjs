import assert from 'node:assert/strict';
import test from 'node:test';
import {createTaskTimelineProjectionCache, localTaskMessage, mapTaskState, mapTaskTimelineEntries, mergeTaskTimelineUserRows, queuedTaskMessages} from '../src/shell/task-timeline/map.ts';

const state = {
  status: 'working', program: 'codex', session_id: 's', since: null, last_output_at: null,
  request: null, queued: [], reason: null, pending_stop: false, computer: {id: 'pc', online: true},
};

test('pure mapper preserves interleaved Leo and native messages and committed/live coverage', () => {
  const entries = [
    {cursor: '1', source: 'leo', program: 'oceanleo', session_id: null, created_at: '', message: {id: 1, role: 'user', content: 'hello'}},
    {cursor: '2', source: 'native', program: 'codex', session_id: 's', created_at: '', no_to: 1, frame: {t: 'delta', text: 'answer', acp_session: 's'}},
  ];
  const cache = createTaskTimelineProjectionCache();
  const rows = mapTaskTimelineEntries(entries, {cache});
  assert.equal(rows[0].content, 'hello');
  assert.ok(rows.some(row => row.content === 'answer'));
  assert.deepEqual(mapTaskTimelineEntries(entries, {cache, live: [{session_id: 's', program: 'codex', no: 1, at: '', frame: {t: 'delta', text: 'duplicate'}}]}), rows);
});

test('pure mapper retains private attachments and local identity when queued delivery arrives', () => {
  const attachments = [{url: '', artifact_id: 'a', revision_id: 'r', name: 'report.pdf'}];
  const local = localTaskMessage({clientMessageId: 'm', text: 'draft', attachments, program: 'codex'}, 'sending', undefined, '2026-11-11');
  const queued = queuedTaskMessages({...state, queued: [{client_message_id: 'm', program: 'codex', created_at: '2026-11-11', text: 'accepted', attachments}]});
  const rows = mergeTaskTimelineUserRows([local, ...queued]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, local.id);
  assert.equal(rows[0].content, 'accepted');
  assert.deepEqual(rows[0].meta.attachments, attachments);
  assert.equal(mapTaskState({...state, saving_delayed: true}).savingDelayed, true);
  assert.equal(mapTaskState({...state, status: 'offline'}).status, 'offline');
});
