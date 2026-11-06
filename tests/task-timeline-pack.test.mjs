import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {
  createTaskTimelineProjectionCache,
  mapTaskTimelineEntries,
} from '../src/shell/task-timeline/map.ts';
import {
  deserializeTaskTail,
  serializeTaskTail,
} from '../src/shell/task-timeline/tail-cache.ts';

const native = (cursor, frame, no = Number(cursor)) => ({
  cursor,
  source: 'native',
  program: 'claude',
  session_id: 'fixture-session',
  created_at: '2026-11-06T12:25:44.917Z',
  no_from: no,
  no_to: no,
  frame: { program: 'claude', acp_session: 'fixture-session', ...frame },
});

test('fixture user bubbles keep their own message ids through later deltas', () => {
  const path = '/root/.cache/tpp-fixtures/frames-all.json';
  if (!fs.existsSync(path)) {
    console.log('fixture missing; skipped');
    return;
  }
  const frames = JSON.parse(fs.readFileSync(path, 'utf8'));
  const entries = frames.map((item) => ({
    cursor: String(item.seq),
    source: 'native',
    program: item.frame.program || 'claude',
    session_id: item.frame.acp_session,
    created_at: item.created_at,
    no_from: item.no_from,
    no_to: item.no_to,
    frame: item.frame,
  }));
  const first = mapTaskTimelineEntries(entries.slice(0, 22));
  const firstUsers = first.filter((row) => row.role === 'user');
  assert.deepEqual(firstUsers.slice(0, 2).map((row) => row.content), ['hi', '你是谁']);
  assert.equal(new Set(firstUsers.slice(0, 2).map((row) => row.meta.client_message_id)).size, 2);
  const allUsers = mapTaskTimelineEntries(entries).filter((row) => row.role === 'user');
  assert.equal(allUsers.length >= 4, true);
  assert.equal(new Set(allUsers.map((row) => row.meta.client_message_id)).size, allUsers.length);
});

test('projection cache reuses untouched row objects when one delta changes', () => {
  const cache = createTaskTimelineProjectionCache();
  const base = [
    native('1', { t: 'user_message', message_id: 'm1', text: 'hi' }),
    native('2', { t: 'turn_start' }),
    native('3', { t: 'delta', text: 'one' }),
  ];
  const previous = mapTaskTimelineEntries(base, { cache });
  const next = mapTaskTimelineEntries([...base, native('4', { t: 'delta', text: 'two' }, 4)], { cache });
  assert.equal(next[0], previous[0]);
  assert.notEqual(next.at(-1), previous.at(-1));
});

test('tail serialization caps rows and text and drops attachment URLs', () => {
  const rows = Array.from({ length: 35 }, (_, index) => ({
    id: -index - 1,
    role: 'assistant',
    kind: 'text',
    content: 'x'.repeat(700),
    meta: { engine: 'claude', attachments: [{ url: 'secret-url' }], tool_card: { output: 'secret' } },
  }));
  const packed = serializeTaskTail(rows);
  assert.equal(packed.length, 30);
  assert.equal(packed.every((row) => row.content.length === 600), true);
  assert.equal(JSON.stringify(packed).includes('secret-url'), false);
  assert.equal(JSON.stringify(packed).includes('tool_card'), false);
  assert.equal(deserializeTaskTail(packed).length, 30);
});
