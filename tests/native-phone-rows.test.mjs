import assert from 'node:assert/strict';
import test from 'node:test';
import {applyDialog, initialDialogState, dialogToAgentMessages, mapNativeTranscript, mergeNativeDialogPages} from '../src/native-agent-core/index.ts';
import {phoneRowsFrames} from './fixtures/native-agent-core/phone-rows.mjs';

const start = () => ({...initialDialogState(), program: 'claude', activeSession: 'phone-session'});
const frame = (s, fields) => applyDialog(s, {type: 'frame', frame: {program: 'claude', acp_session: 'phone-session', ...fields}});
const replay = frames => frames.reduce((s, f) => frame(s, f), start());
const expected = ['Reply OK.', 'OK', 'Also reply OK2.', 'OK2'];

test('archived phone shapes produce exactly two prompts, two answers and two delivery labels after repeated Stop', () => {
  const state = replay(phoneRowsFrames);
  const rows = dialogToAgentMessages(state.messages, {live: true});
  assert.deepEqual(rows.map(row => row.content), expected);
  assert.equal(rows.filter(row => row.meta?.native_delivery).length, 2);
  assert.deepEqual(rows.filter(row => row.role === 'user').map(row => row.meta.native_delivery.state), ['started_new_turn', 'started_new_turn']);
  assert.equal(state.messages.length, 4, 'identity-less Stop must not create a dialog row');
  assert.deepEqual(state.messages.filter(row => row.kind === 'turn').map(row => row.stop), ['end_turn', 'end_turn']);
  assert.equal(state.busy, false);
  assert.ok(rows.filter(row => row.role === 'assistant').every(row => row.meta.final && !row.meta.native_streaming));
});

test('archive replay and saved/live union preserve the same four visible rows', () => {
  const state = replay(phoneRowsFrames);
  const history = frame(start(), {t: 'transcript', frames: phoneRowsFrames, live: false});
  const union = mergeNativeDialogPages(history.messages, state.messages);
  assert.deepEqual(dialogToAgentMessages(union, {live: true}).map(row => row.content), expected);
  const saved = mapNativeTranscript({id: 'archive', program: 'claude', native_session_id: 'phone-session', created_at: '2026-11-03T13:24:00Z'}, phoneRowsFrames);
  assert.deepEqual(saved.map(row => row.content), expected);
});

test('delivery updates may address the existing user by turn_id without adding an empty bubble', () => {
  let state = frame(start(), {t: 'user_message', message_id: 'one', turn_id: 't1', text: 'first'});
  state = frame(state, {t: 'user_message', message_id: 'two', turn_id: 't2', text: 'second'});
  for (const delivery of ['queued', 'injected', 'replaced', 'started_new_turn', 'unsent', 'cancelled']) {
    state = frame(state, {t: 'prompt_state', turn_id: 't1', state: delivery});
    assert.equal(state.messages.length, 2);
    assert.equal(state.messages[0].delivery?.state, delivery);
    assert.equal(state.messages[1].delivery, undefined);
  }
  state = frame(state, {t: 'prompt_state', message_id: 'foreign', turn_id: 't1', state: 'queued'});
  assert.equal(state.messages[0].delivery.state, 'cancelled', 'an explicit foreign message ID must not fall back to the turn');
});

test('mapper omits persisted empty delivery-only user rows but keeps attachment-only messages', () => {
  const messages = [
    {kind: 'user', id: 'empty', messageId: 'empty', text: '', delivery: {state: 'started_new_turn'}},
    {kind: 'user', id: 'file', messageId: 'file', text: '', attachments: [{name: 'photo.png', mime: 'image/png'}], delivery: {state: 'queued'}},
  ];
  const rows = dialogToAgentMessages(messages, {live: false});
  assert.equal(rows.length, 1);
  assert.equal(rows[0].meta.native_message_id, 'file');
  assert.equal(rows[0].meta.attachments[0].name, 'photo.png');
  assert.equal(rows[0].meta.native_delivery.state, 'queued');
});
