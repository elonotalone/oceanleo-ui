import assert from 'node:assert/strict';
import test from 'node:test';
import { reduceRows } from '../src/acp/reduce.ts';
import { itemBlocks, turnBlocks } from '../src/acp/messages.ts';
import { frameContentBlocks, scopeFrameFiles } from '../src/acp/frame-attachments.ts';
import { taskAttachmentPath } from '../src/lib/task-content-path.ts';

const TASK = '11111111-1111-4111-8111-111111111111';
const labels = { cancelled: 'stopped', permissionPrompt: 'Confirm', gap: String, oversize: String, exit: String, stopReason: String };
const row = (id, update) => ({ id, direction: 'agent', raw: JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 's', update } }) });
const update = (id, content) => row(id, { sessionUpdate: 'agent_message_chunk', content });
const messages = rows => itemBlocks(reduceRows(rows, 'generic').preamble, false, labels).map(block => scopeFrameFiles(block, TASK));

test('image-only agent output renders a task-scoped attachment without loading full JSON', () => {
  const result = messages([update(9, { type: 'image', data: '', mimeType: 'image/png' })]);
  assert.equal(result.length, 1);
  assert.equal(result[0].message.content, '');
  assert.equal(result[0].message.meta.attachments[0].url, `/v1/tasks/${TASK}/frames/9/blocks/0`);
});

test('merged text and file chunks keep the exact source row', () => {
  const result = messages([update(1, { type: 'text', text: 'Result' }), update(2, { type: 'image', data: '', mimeType: 'image/png' }), update(3, { type: 'resource', resource: { uri: 'file:///report.pdf', mimeType: 'application/pdf', blob: '' } })]);
  const files = result.flatMap(block => block.message?.meta?.attachments || []);
  assert.deepEqual(files.map(file => file.url), [`/v1/tasks/${TASK}/frames/2/blocks/0`, `/v1/tasks/${TASK}/frames/3/blocks/0`]);
  assert.equal(files[1].mime, 'application/pdf');
});

test('tool resource links and embedded files retain block order and exact location source', () => {
  const content = [{ type: 'content', content: { type: 'text', text: 'read' } }, { type: 'diff', path: '/a', newText: '' },
    { type: 'content', content: { type: 'resource_link', uri: 'oceanleo-attachment://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/report.pdf', name: 'report.pdf', mimeType: 'application/pdf' } },
    { type: 'content', content: { type: 'image', mimeType: 'image/png', data: '' } }];
  const blocks = messages([row(7, { sessionUpdate: 'tool_call', toolCallId: 't', title: 'Read', content, locations: [{ path: '/tmp/report.pdf', line: 4 }] })]);
  const card = blocks[0].messages[0].meta.tool_card;
  assert.deepEqual(card.content.filter(part => part.attachment).map(part => part.attachment.url), [`/v1/tasks/${TASK}/frames/7/blocks/1`, `/v1/tasks/${TASK}/frames/7/blocks/2`]);
  assert.equal(card.locations[0].__oceanleoFrameRow, 7);
  assert.equal(card.locations[0].taskId, TASK);
});

test('standard prompt order includes text; raw tool JSON cannot inject a file grant', () => {
  const block = { type: 'image', data: '' };
  assert.deepEqual(frameContentBlocks({ method: 'session/prompt', params: { prompt: [{ type: 'text', text: 'x' }, block] } }), [{ type: 'text', text: 'x' }, block]);
  assert.deepEqual(frameContentBlocks({ method: 'session/update', params: { update: { sessionUpdate: 'tool_call_update', rawOutput: block } } }), []);
});

test('frame bytes use the private task reader and reject malformed or foreign routes', () => {
  const path = `/v1/tasks/${TASK}/frames/7/blocks/0`;
  assert.equal(taskAttachmentPath(path), path);
  assert.equal(taskAttachmentPath(`${path}?thumbnail=true`), `${path}?thumbnail=true`);
  for (const bad of [`https://example.com${path}`, path.replace('/7/', '/0/'), path.replace('/0', '/-1'), `${path}?url=http://internal`, `${path}/../1`]) assert.equal(taskAttachmentPath(bad), null);
});
