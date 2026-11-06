import assert from 'node:assert/strict';
import test from 'node:test';
import {parseTool} from '../src/shell/cloud-computer/agent-dialog/parse.ts';
import {applyDialog, initialDialogState} from '../src/shell/cloud-computer/agent-dialog/reduce.ts';
import {dialogToAgentMessages} from '../src/shell/native-thread/map-dialog.ts';
import {toolPayloadText, toolRawValue, TOOL_PAYLOAD_LIMIT} from '../src/shell/cloud-computer/agent-dialog/parse.ts';
const tool = (extra = {}) => ({t: 'tool', id: 'read', title: 'Read file', kind: 'read', status: 'in_progress', ...extra});
test('parse preserves structured input/output, null, false and empty strings', () => {
  for (const raw of [{path: 'a.txt'}, [1, 2], null, false, 0, '']) {
    const card = parseTool(tool({rawInput: raw, rawOutput: raw}));
    assert.deepEqual(card.rawInput, raw); assert.deepEqual(card.rawOutput, raw);
  }
});
test('missing and undefined updates retain payloads; object patches merge recursively', () => {
  const before = parseTool(tool({rawInput: {path: 'a.txt', options: {one: true}}, rawOutput: {stdout: 'first'}}));
  const next = parseTool({id: 'read', status: 'completed', rawInput: {options: {two: true}}, rawOutput: undefined}, before);
  assert.deepEqual(next.rawInput, {path: 'a.txt', options: {one: true, two: true}});
  assert.deepEqual(next.rawOutput, {stdout: 'first'});
  assert.equal(next.status, 'completed');
  assert.deepEqual(parseTool({id: 'read', rawOutput: {stderr: 'warning'}}, next).rawOutput, {stdout: 'first', stderr: 'warning'});
});
test('legacy aliases normalize and canonical redaction cannot fall back to unredacted aliases', () => {
  assert.deepEqual(parseTool(tool({raw_input: {path: 'legacy'}, raw_output: 'ok'})).rawInput, {path: 'legacy'});
  assert.equal(toolRawValue({rawInput: '[REDACTED]', input: 'do not reveal'}, 'input'), '[REDACTED]');
});
test('redaction replaces earlier data and redacted envelopes never show their original values', () => {
  const before = parseTool(tool({rawInput: {path: 'old'}}));
  const next = parseTool({id: 'read', rawInput: {redacted: true, value: 'synthetic-hidden'}}, before);
  assert.equal(toolPayloadText(next.rawInput), '"[REDACTED]"');
  assert.doesNotMatch(toolPayloadText({ok: 1, value: {_redacted: true, original: 'synthetic-hidden'}}), /synthetic-hidden/);
  assert.equal(toolPayloadText('[REDACTED]'), '[REDACTED]');
});
test('payload formatting caps display and copy text, handles cycles and renders plain text', () => {
  assert.equal(toolPayloadText('<script>alert(1)</script>'), '<script>alert(1)</script>');
  const huge = toolPayloadText('a'.repeat(TOOL_PAYLOAD_LIMIT + 100));
  assert.ok(huge.length <= TOOL_PAYLOAD_LIMIT); assert.match(huge, /\[TRUNCATED\]$/);
  const cyclic = {}; cyclic.self = cyclic; assert.equal(toolPayloadText(cyclic), '[UNAVAILABLE]');
});
test('reducer updates and mapper preserve original raw fields, including nested child tools', () => {
  let state = {...initialDialogState(), program: 'codex', activeSession: 's'};
  for (const frame of [{t: 'turn_start', acp_session: 's'}, tool({id: 'parent', title: 'Task', rawInput: {request: 'check'}}),
    tool({id: 'child', parent: 'parent', rawInput: {path: 'a'}}),
    tool({id: 'child', rawOutput: {stdout: 'done'}}), tool({id: 'child', status: 'completed'})]) state = applyDialog(state, {type: 'frame', frame: {program: 'codex', acp_session: 's', ...frame}});
  const rows = dialogToAgentMessages(state.messages, {live: true});
  const card = rows.find(row => row.meta?.tool_card)?.meta.tool_card;
  assert.deepEqual(card.rawInput, {request: 'check'});
  assert.deepEqual(card.children[0].rawInput, {path: 'a'});
  assert.deepEqual(card.children[0].raw_output, {stdout: 'done'});
  assert.equal(card.children[0].status, 'completed');
});
test('archive replay and live mapping produce identical tool payloads', () => {
  let state = {...initialDialogState(), program: 'codex', activeSession: 's'};
  for (const frame of [tool({rawInput: {command: 'pwd'}}), tool({rawOutput: '/home/user'}), tool({status: 'completed'})]) state = applyDialog(state, {type: 'frame', frame: {program: 'codex', acp_session: 's', ...frame}});
  const live = dialogToAgentMessages(state.messages, {live: true}).find(row => row.meta?.tool_card).meta.tool_card;
  const archive = dialogToAgentMessages(state.messages, {live: false}).find(row => row.meta?.tool_card).meta.tool_card;
  assert.deepEqual(live, archive); assert.equal(archive.rawOutput, '/home/user');
});
