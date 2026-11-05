import assert from 'node:assert/strict';
import test from 'node:test';
import {
  localTaskMessage,
  mapTaskTimelineEntries,
  mergeTaskTimelineUserRows,
} from '../src/shell/task-timeline/map.ts';
import { filterLiveFrames, mergeLiveFrame } from '../src/shell/task-timeline/useTaskTimeline.ts';

const native = (cursor, frame, noFrom = null, noTo = noFrom, session = 'cts-live', program = 'codex') => ({
  cursor,
  source: 'native',
  program,
  session_id: session,
  created_at: '2026-11-05T10:00:00Z',
  no_from: noFrom,
  no_to: noTo,
  frame: { program, acp_session: session, ...frame },
});

const live = (no, frame, session = 'cts-live', program = 'codex') => ({
  session_id: session,
  program,
  no,
  at: '2026-11-05T10:00:01Z',
  frame: { program, acp_session: session, ...frame },
});

test('live delta projects before its committed archive row exists', () => {
  const rows = mapTaskTimelineEntries(
    [native('c1', { t: 'turn_start', turn_id: 'turn-1' }, 1, 1)],
    { live: [live(2, { t: 'delta', turn_id: 'turn-1', text: 'streamed first' })] },
  );
  assert.deepEqual(rows.filter((row) => row.role === 'assistant').map((row) => row.content), ['streamed first']);
  assert.equal(rows[0].meta.task_timeline_live, true);
  assert.equal(rows[0].meta.task_timeline_server, true);
});

test('a coalesced committed no_from..no_to row covers live frames and shows text once', () => {
  const baseline = [native('c1', { t: 'turn_start', turn_id: 'turn-1' }, 1, 1)];
  const liveRows = mapTaskTimelineEntries(baseline, {
    live: [live(2, { t: 'delta', turn_id: 'turn-1', text: 'hello world' })],
  });
  assert.deepEqual(liveRows.filter((row) => row.role === 'assistant').map((row) => row.content), ['hello world']);

  const committed = [
    ...baseline,
    native('c2', { t: 'delta', turn_id: 'turn-1', text: 'hello world' }, 2, 3),
  ];
  const rows = mapTaskTimelineEntries(committed, {
    live: [live(2, { t: 'delta', turn_id: 'turn-1', text: 'hello world' })],
  });
  assert.deepEqual(rows.filter((row) => row.role === 'assistant').map((row) => row.content), ['hello world']);
  assert.equal(rows.filter((row) => row.role === 'assistant').length, 1);
  assert.equal(rows[0].meta.task_timeline_committed, true);
});

test('a late live frame at or below through is ignored', () => {
  const entries = [native('c1', { t: 'turn_start' }, 1, 4)];
  const late = live(4, { t: 'delta', text: 'late' });
  assert.deepEqual(mergeLiveFrame(entries, [], late), []);
  assert.deepEqual(filterLiveFrames(entries, [late, live(5, { t: 'delta', text: 'tail' })]).map((frame) => frame.no), [5]);
});

test('reconnect clears the old live tail and admits the resent tail once', () => {
  const entries = [native('c1', { t: 'turn_start' }, 1, 1)];
  const tail = live(2, { t: 'delta', turn_id: 'turn-1', text: 'tail' });
  const beforeReconnect = mapTaskTimelineEntries(entries, { live: [tail] });
  assert.equal(beforeReconnect.filter((row) => row.role === 'assistant').length, 1);

  const afterReconnect = mapTaskTimelineEntries(entries, { live: [] });
  assert.equal(afterReconnect.filter((row) => row.role === 'assistant').length, 0);
  const resent = mapTaskTimelineEntries(entries, { live: [tail] });
  assert.deepEqual(resent.filter((row) => row.role === 'assistant').map((row) => row.content), ['tail']);
});

test('local to live user_message to committed keeps one canonical row id', () => {
  const input = { clientMessageId: 'message-1', text: 'send me', attachments: [], program: 'codex' };
  const local = localTaskMessage(input);
  const liveRows = mapTaskTimelineEntries([], {
    live: [live(1, { t: 'user_message', message_id: 'message-1', turn_id: 'turn-1', text: 'send me' })],
  });
  const liveMerged = mergeTaskTimelineUserRows([local, ...liveRows]);
  assert.equal(liveMerged.length, 1);
  assert.equal(liveMerged[0].id, local.id);
  assert.equal(liveMerged[0].meta.task_timeline_live, true);

  const committedRows = mapTaskTimelineEntries([
    native('c1', { t: 'user_message', message_id: 'message-1', turn_id: 'turn-1', text: 'send me' }, 1, 1),
  ]);
  const committedMerged = mergeTaskTimelineUserRows([local, ...liveRows, ...committedRows]);
  assert.equal(committedMerged.length, 1);
  assert.equal(committedMerged[0].id, local.id);
  assert.equal(committedMerged[0].meta.task_timeline_committed, true);
});

test('legacy rows without no numbers still render', () => {
  const rows = mapTaskTimelineEntries([
    native('legacy-1', { t: 'user_message', message_id: 'legacy-message', text: 'old row' }, null, null),
    native('legacy-2', { t: 'delta', text: 'old output' }, null, null),
  ]);
  assert.deepEqual(rows.map((row) => row.content), ['old row', 'old output']);
});
