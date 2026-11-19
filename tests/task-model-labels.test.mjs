import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
import { reduceRows } from '../src/acp/reduce.ts';
import { viewBlocks } from '../src/acp/messages.ts';
import { buildAgentRenderItems } from '../src/lib/agent-progress.ts';

const stubs = { '../i18n/ui/useUI': dataModule('export function useUI(){return value => value;}') };
const { AgentTranscriptBubble } = await import(await compileModule('src/shell/AgentTranscriptBubble.tsx', stubs));
const { AcpTranscript } = await import(await compileModule('src/acp/AcpTranscript.tsx', stubs));
let id = 0;
const row = (direction, message, model) => ({ id: ++id, direction, node_seq: null,
  raw: JSON.stringify(message), received_at: '2026-11-19T10:00:00Z', ...(model ? { model } : {}) });
const request = (id, method, params = {}) => row('client', { id, method, params });
const response = (id, result, model) => row('agent', { id, result }, model);
const prompt = id => request(id, 'session/prompt', { sessionId: 's', prompt: [{ type: 'text', text: 'Question' }] });
const update = update => row('agent', { method: 'session/update', params: { sessionId: 's', update } });
const words = text => update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } });
const tool = () => update({ sessionUpdate: 'tool_call', toolCallId: 't', title: 'Read', kind: 'read', status: 'completed' });
const modelOptions = value => [{ id: 'pick', category: 'model', name: 'Model', currentValue: value,
  options: [{ group: 'Models', options: [{ value: 'm1', name: 'Model one' }, { value: 'm2', name: 'Model two' }] }] }];
const setup = () => [request(1, 'session/new'), response(1, { sessionId: 's', configOptions: modelOptions('m1') })];
const finish = (id, model) => response(id, { stopReason: 'end_turn' }, model);
const labels = { gap: String, oversize: String, exit: String, stopReason: String, cancelled: 'Stopped', permissionPrompt: 'Permission' };
const render = rows => renderToStaticMarkup(React.createElement(AcpTranscript, { rows }));
const countLabels = html => (html.match(/data-agent-model=/g) || []).length;

test('running ACP turn snapshots the standard config option name, without a program switch', () => {
  const rows = [...setup(), prompt(2), words('First answer')];
  for (const program of ['', 'any-program', 'claude', 'codex', 'hermes']) {
    const view = reduceRows(rows, program);
    assert.deepEqual(view.turns[0].model, { id: 'm1', label: 'Model one' });
  }
  assert.equal(countLabels(render(rows)), 1);
  assert.match(render(rows), /Model one/);
});

test('persisted prompt response overrides session model and survives history without setup rows', () => {
  const model = { id: 'actual', label: 'Actual model' };
  const rows = [prompt(2), words('Answer'), finish(2, model)];
  assert.deepEqual(reduceRows(rows).turns[0].model, model);
  assert.equal(countLabels(render(rows)), 1);
  assert.match(render(rows), /Actual model/);
});

test('model selection in a later turn never rewrites an earlier turn', () => {
  const rows = [...setup(), prompt(2), words('First'), finish(2, { id: 'm1', label: 'Model one' }),
    update({ sessionUpdate: 'config_option_update', configOptions: modelOptions('m2') }), prompt(3), words('Second')];
  assert.deepEqual(reduceRows(rows).turns.map(turn => turn.model?.id), ['m1', 'm2']);
  assert.equal(countLabels(render(rows)), 2);
});

test('only the first assistant output of an ACP turn carries the model line, across tools', () => {
  const rows = [...setup(), prompt(2), words('Before'), tool(), words('After'),
    finish(2, { id: 'm1', label: 'Model one' })];
  const blocks = viewBlocks(reduceRows(rows), labels);
  assert.equal(blocks.filter(block => block.type === 'bubble' && block.message.meta?.model).length, 1);
  assert.equal(countLabels(render(rows)), 1);
});

test('completed legacy ACP turns and errors with no assistant output show no model', () => {
  assert.equal(countLabels(render([...setup(), prompt(2), words('Legacy answer'), finish(2)])), 0);
  assert.equal(countLabels(render([...setup(), prompt(2), row('agent', { id: 2, error: { code: -1, message: 'Failed' } })])), 0);
});

test('standard models list also supplies the running turn display name', () => {
  const rows = [request(1, 'session/new'), response(1, { sessionId: 's', models: {
    currentModelId: 'm', availableModels: [{ modelId: 'm', name: 'Advertised name' }] } }), prompt(2), words('Answer')];
  assert.equal(reduceRows(rows).turns[0].model.label, 'Advertised name');
});

test('cloud grouping renders one shared 12px model line per turn without mutating archive messages', () => {
  const model = { provider: 'provider', id: 'm', label: 'Cloud model' };
  const messages = [
    { id: 1, role: 'user', kind: 'text', content: 'Question' },
    { id: 2, role: 'assistant', kind: 'text', content: 'First', meta: { model } },
    { id: 3, role: 'assistant', kind: 'step', content: 'Working' },
    { id: 4, role: 'assistant', kind: 'text', content: 'Last', meta: { model } },
    { id: 5, role: 'user', kind: 'text', content: 'Next' },
    { id: 6, role: 'assistant', kind: 'text', content: 'Next answer', meta: { model } },
  ];
  const html = buildAgentRenderItems(messages).filter(item => item.type === 'message').map(item =>
    renderToStaticMarkup(React.createElement(AgentTranscriptBubble, { message: item.message }))).join('');
  assert.equal(countLabels(html), 2);
  assert.match(html, /data-agent-model="" class="mb-1 text-\[12px\] text-stone-400"/);
  assert.equal(messages[1].meta.show_model, undefined);
});

test('legacy cloud output and system errors remain unlabeled', () => {
  for (const message of [
    { id: 1, role: 'assistant', kind: 'text', content: 'Legacy' },
    { id: 2, role: 'assistant', kind: 'error', content: 'Failed', meta: { model: { id: 'm', label: 'Model' } } },
  ]) assert.equal(countLabels(renderToStaticMarkup(React.createElement(AgentTranscriptBubble, { message }))), 0);
});

test('an empty cloud streaming row does not add a second model label before the real output', () => {
  const model = { id: 'm', label: 'Model' };
  const items = buildAgentRenderItems([
    { id: 1, role: 'user', kind: 'text', content: 'Question' },
    { id: 2, role: 'assistant', kind: 'text', content: '', meta: { model, streaming: true } },
    { id: 3, role: 'assistant', kind: 'text', content: 'Answer', meta: { model } },
  ]);
  const html = items.filter(item => item.type === 'message').map(item =>
    renderToStaticMarkup(React.createElement(AgentTranscriptBubble, { message: item.message }))).join('');
  assert.equal(countLabels(html), 1);
});
