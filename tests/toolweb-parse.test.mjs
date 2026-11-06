import assert from 'node:assert/strict';
import test from 'node:test';
import {buildProcessEntries} from '../src/lib/agent-progress.ts';
import {applyDialog, initialDialogState} from '../src/shell/cloud-computer/agent-dialog/reduce.ts';
import {dialogToAgentMessages} from '../src/shell/native-thread/map-dialog.ts';

const message = card => ({id: 1, role: 'assistant', kind: 'step', content: 'Read', meta: {tool_card: card}});
const entry = card => buildProcessEntries([message(card)])[0];

test('timeline preserves structured and scalar canonical/legacy raw fields without inventing missing fields', () => {
  for (const value of [{path: 'a.txt'}, [1, 2], null, false, 0, '']) {
    for (const fields of [{rawInput: value, rawOutput: value}, {raw_input: value, raw_output: value}]) {
      const parsed = entry({id: 'read', ...fields});
      assert.deepEqual(parsed.rawInput, value);
      assert.deepEqual(parsed.rawOutput, value);
    }
  }
  for (const card of [undefined, null, {}, {rawInput: undefined, rawOutput: undefined}]) {
    const parsed = entry(card);
    assert.equal(Object.hasOwn(parsed, 'rawInput'), false);
    assert.equal(Object.hasOwn(parsed, 'rawOutput'), false);
  }
});

test('canonical redaction and explicit empty values win over aliases in parent and nested tools', () => {
  const raw = {
    id: 'parent', rawInput: {redacted: true}, raw_input: {hidden: 'synthetic-hidden'},
    rawOutput: null, raw_output: 'synthetic-hidden',
    children: [{id: 'child', raw_input: {path: 'a.txt'}, raw_output: false,
      children: [{id: 'grandchild', rawInput: '', raw_input: 'synthetic-hidden', rawOutput: 0}]}],
  };
  const before = structuredClone(raw);
  const parsed = entry(raw);
  assert.deepEqual(parsed.rawInput, {redacted: true});
  assert.equal(parsed.rawOutput, null);
  assert.deepEqual(parsed.children[0].rawInput, {path: 'a.txt'});
  assert.equal(parsed.children[0].rawOutput, false);
  assert.equal(parsed.children[0].children[0].rawInput, '');
  assert.equal(parsed.children[0].children[0].rawOutput, 0);
  assert.deepEqual(raw, before, 'normalization must not mutate the transcript');
});

test('live and archived reducer/map/timeline preserve raw object patches and child updates', () => {
  let state = {...initialDialogState(), program: 'codex', activeSession: 's'};
  const frames = [
    {t: 'turn_start'},
    {t: 'tool', id: 'parent', title: 'Task', raw_input: {request: 'check', options: {one: true}}},
    {t: 'tool', id: 'parent', rawInput: {options: {two: true}}},
    {t: 'tool', id: 'child', parent: 'parent', raw_input: {path: 'a.txt'}, raw_output: {stdout: 'first'}},
    {t: 'tool', id: 'child', rawOutput: {stderr: 'warning'}},
    {t: 'tool', id: 'child', rawInput: undefined, status: 'completed'},
    {t: 'tool', id: 'parent', status: 'completed'},
  ];
  for (const frame of frames) state = applyDialog(state, {type: 'frame', frame: {program: 'codex', acp_session: 's', ...frame}});
  for (const live of [true, false]) {
    const parsed = buildProcessEntries(dialogToAgentMessages(state.messages, {live}))[0];
    assert.deepEqual(parsed.rawInput, {request: 'check', options: {one: true, two: true}});
    assert.deepEqual(parsed.children[0].rawInput, {path: 'a.txt'});
    assert.deepEqual(parsed.children[0].rawOutput, {stdout: 'first', stderr: 'warning'});
    assert.equal(parsed.children[0].status, 'done');
  }
});
