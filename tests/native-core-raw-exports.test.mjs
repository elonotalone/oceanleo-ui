import assert from 'node:assert/strict';
import test from 'node:test';
import * as core from '../src/native-agent-core/index.ts';
import * as browser from '../src/shell/cloud-computer/agent-dialog/types.ts';
import * as parser from '../src/shell/cloud-computer/agent-dialog/parse.ts';

test('legacy browser/parser raw helpers are the same pure core functions', () => {
  assert.equal(browser.toolRawValue, core.toolRawValue);
  assert.equal(parser.toolRawValue, core.toolRawValue);
  assert.equal(parser.toolPayloadText, core.toolPayloadText);
  assert.equal(parser.TOOL_PAYLOAD_LIMIT, core.TOOL_PAYLOAD_LIMIT);
  const raw = {rawInput: {command: 'echo hello'}, rawOutput: {_redacted: true, value: 'hidden'}};
  const tool = parser.parseTool({id: 'tool', ...raw});
  assert.deepEqual(core.toolRawValue(tool, 'input'), raw.rawInput);
  assert.equal(core.toolPayloadText(core.toolRawValue(tool, 'output')), '"[REDACTED]"');
});
