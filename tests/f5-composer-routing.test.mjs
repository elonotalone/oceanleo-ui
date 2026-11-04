import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../src/shell/AgentChat.tsx', import.meta.url), 'utf8');

test('task composer sends to the selected native recipient while preserving the timeline', () => {
  assert.match(source, /export function taskTimelineRecipientProgram\(/);
  assert.match(source, /const timelineProgram = taskTimelineRecipientProgram\(conversation, timeline\.state\?\.program\)/);
  assert.match(source, /const timelineMessages = computerTask/);
  assert.match(source, /conversation\?\.kind === "native" \? conversation\.program/);
});

test('task composer retries reuse the same client message id and queued rows can be removed', () => {
  assert.match(source, /pendingTaskSubmissionRef = useRef/);
  assert.match(source, /taskSubmissionClientMessageId\(pending, submissionKey/);
  assert.match(source, /client_message_id: clientMessageId/);
  assert.match(source, /removeTimelineQueued\(taskId, clientMessageId\)/);
  assert.match(source, /data-task-queued-actions=/);
  assert.match(source, /tt\("queuedMessageHint", \{ from: sender, to: recipient \}\)/);
});
