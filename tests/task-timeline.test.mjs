import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mapTaskState,
  mapTaskTimelineEntries,
  queuedTaskMessages,
  uniqueTimelineEntries,
} from '../src/shell/task-timeline/map.ts';

const native = (cursor, frame, program = 'codex', session_id = 'cts-one') => ({
  cursor,
  source: 'native',
  program,
  session_id,
  created_at: '2026-11-04T10:00:00Z',
  frame: {program, acp_session: session_id, ...frame},
});

test('task mapper preserves Leo/native cursor interleave and updates native rows in place', () => {
  const entries = [
    native('0001', {t: 'user_message', message_id: 'm1', text: 'Build it'}),
    native('0002', {t: 'turn_start'}),
    {cursor: '0003', source: 'leo', program: 'oceanleo', session_id: null, created_at: '2026-11-04T10:00:03Z', message: {id: 21, role: 'assistant', kind: 'text', content: 'Leo note'}},
    native('0004', {t: 'delta', text: 'Done'}),
    native('0005', {t: 'done', reason: 'end_turn'}),
  ];
  const rows = mapTaskTimelineEntries(entries);
  assert.deepEqual(rows.map((row) => row.content), ['Build it', 'Leo note', 'Done']);
  assert.equal(rows[0].meta.engine, 'codex');
  assert.equal(rows[1].meta.engine_label, 'OceanLeo agent');
  assert.equal(rows[2].meta.final, true);
});

test('cursor de-duplication scales to a long page and keeps first-seen order', () => {
  const entries = Array.from({length: 7801}, (_, index) => ({
    cursor: `c${index}`,
    source: 'leo',
    program: 'oceanleo',
    session_id: null,
    created_at: '2026-11-04T10:00:00Z',
    message: {id: index + 1, role: 'user', kind: 'text', content: String(index)},
  }));
  entries.push(entries[100], entries[7800]);
  const unique = uniqueTimelineEntries(entries);
  assert.equal(unique.length, 7801);
  assert.equal(unique[0].cursor, 'c0');
  assert.equal(unique.at(-1).cursor, 'c7800');
});

test('I3 state mapping keeps offline and pending-stop facts explicit', () => {
  const base = {program: 'claude', session_id: 'cts-two', since: null, last_output_at: null, request: null, queued: [], reason: null, pending_stop: false, computer: {id: 'pc', online: true}};
  assert.equal(mapTaskState({...base, status: 'working'}).status, 'working');
  assert.equal(mapTaskState({...base, status: 'waiting_user'}).status, 'waiting_user');
  assert.equal(mapTaskState({...base, status: 'offline', pending_stop: true}).status, 'offline');
  assert.equal(mapTaskState({...base, status: 'failed', reason: 'runner failed'}).reason, 'runner failed');
  assert.equal(mapTaskState({...base, status: 'idle', reason: 'saving delayed'}).status, 'saving_delayed');
});

test('queued prompts carry immutable ids and the recipient engine label', () => {
  const rows = queuedTaskMessages({status: 'queued', program: 'hermes', session_id: null, since: null, last_output_at: null, request: null, queued: [{client_message_id: 'm-1', program: 'hermes', created_at: '2026-11-04T10:00:00Z'}], reason: null, pending_stop: false, computer: {id: null, online: false}});
  assert.equal(rows.length, 1);
  assert.equal(rows[0].meta.client_message_id, 'm-1');
  assert.equal(rows[0].meta.engine_label, 'Hermes');
  assert.equal(rows[0].meta.queued, true);
});
