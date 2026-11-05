import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptedTaskMessage,
  localTaskMessage,
  mapTaskTimelineEntries,
  mergeTaskTimelineUserRows,
} from '../src/shell/task-timeline/map.ts';
import { filterCoveredInflight } from '../src/shell/task-timeline/useTaskTimeline.ts';

const native = (cursor, frame, session = 'cts-live', program = 'codex') => ({
  cursor,
  source: 'native',
  program,
  session_id: session,
  created_at: '2026-11-05T10:00:00Z',
  frame: { program, acp_session: session, ...frame },
});

const inflight = (s, frame, epoch = 'epoch-a', session = 'cts-live', program = 'codex') => ({
  session_id: session,
  program,
  epoch,
  s,
  at: '2026-11-05T10:00:01Z',
  frame: { program, acp_session: session, ...frame },
});

test('in-flight delta projects before a committed archive entry exists', () => {
  const rows = mapTaskTimelineEntries(
    [native('c1', { t: 'turn_start', turn_id: 'turn-1' })],
    { inflight: [inflight(2, { t: 'delta', turn_id: 'turn-1', text: 'streamed first' })] },
  );
  assert.deepEqual(rows.filter((row) => row.role === 'assistant').map((row) => row.content), ['streamed first']);
  assert.equal(rows[0].meta.task_timeline_inflight, true);
});

test('covered coalesced delta leaves one committed text row', () => {
  const committed = [
    native('c1', { t: 'turn_start', turn_id: 'turn-1' }),
    native('c2', { t: 'delta', turn_id: 'turn-1', text: 'hello world' }),
  ];
  const live = [inflight(2, { t: 'delta', turn_id: 'turn-1', text: 'hello world' })];
  const beforeCoverage = mapTaskTimelineEntries(committed, { inflight: live });
  assert.equal(beforeCoverage.filter((row) => row.role === 'assistant').length, 1);
  const afterCoverage = mapTaskTimelineEntries(committed);
  assert.deepEqual(afterCoverage.filter((row) => row.role === 'assistant').map((row) => row.content), ['hello world']);
});

test('a late covered in-flight frame is ignored by the coverage filter', () => {
  const frame = inflight(7, { t: 'delta', turn_id: 'turn-1', text: 'late' });
  const covers = new Map([['cts-live:epoch-a', 7]]);
  assert.deepEqual(filterCoveredInflight([frame], covers), []);
  assert.equal(filterCoveredInflight([frame], new Map([['cts-live:epoch-a', 6]])).length, 1);
});

test('accepted, in-flight, committed, queued, and local user rows have D8 precedence and one stable id', () => {
  const accepted = acceptedTaskMessage({
    client_message_id: 'message-1',
    session_id: 'cts-live',
    program: 'codex',
    text: 'send me',
    created_at: '2026-11-05T10:00:00Z',
  });
  const local = localTaskMessage({ clientMessageId: 'message-1', text: 'send me', attachments: [], program: 'codex' });
  const queued = { ...local, meta: { ...local.meta, task_timeline_local: false, task_timeline_queued: true, queued: true } };
  const live = mapTaskTimelineEntries([], {
    inflight: [inflight(3, { t: 'user_message', message_id: 'message-1', turn_id: 'turn-2', text: 'send me' })],
  });
  const committed = mapTaskTimelineEntries([
    native('c3', { t: 'user_message', message_id: 'message-1', turn_id: 'turn-2', text: 'send me' }),
  ]);
  const acceptedId = accepted.id;
  const liveRow = mergeTaskTimelineUserRows([accepted, local, queued, ...live])[0];
  const committedRow = mergeTaskTimelineUserRows([accepted, local, queued, ...live, ...committed])[0];
  assert.equal(liveRow.content, 'send me');
  assert.equal(liveRow.id, acceptedId);
  assert.equal(committedRow.id, acceptedId);
  assert.equal(committedRow.meta.task_timeline_committed, true);
});

test('local delivery lifecycle metadata stays on the same canonical row', () => {
  const input = { clientMessageId: 'local-1', text: 'retry this', attachments: [], program: 'claude' };
  const sending = localTaskMessage(input, 'sending');
  const unsent = localTaskMessage(input, 'unsent', 'gateway refused');
  const sent = localTaskMessage(input, 'sent');
  assert.equal(sending.meta.delivery, 'sending');
  assert.equal(unsent.meta.delivery, 'unsent');
  assert.equal(unsent.meta.unsent_reason, 'gateway refused');
  assert.equal(sent.meta.delivery, 'sent');
  assert.equal(sending.id, unsent.id);
  assert.equal(unsent.id, sent.id);
});
