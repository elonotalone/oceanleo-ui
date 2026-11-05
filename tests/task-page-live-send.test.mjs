import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const agentChat = await readFile(new URL("../src/shell/AgentChat.tsx", import.meta.url), "utf8");
const workspaceCopy = await readFile(
  new URL("../src/i18n/ui/messages/computer-task-workspace-copy.ts", import.meta.url),
  "utf8",
);

function between(source, start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing ${start}`);
  const to = end ? source.indexOf(end, from + start.length) : source.length;
  assert.notEqual(to, -1, `missing ${end}`);
  return source.slice(from, to);
}

test("computer task submit paints locally before its POST and settles the same id", () => {
  const sendBranch = between(
    agentChat,
    "    if (computerTask) {\n      setBusy(true);",
    "      return;\n    }\n    setBusy(true);",
  );
  const localAt = sendBranch.indexOf("timeline.sendLocal(");
  const postAt = sendBranch.indexOf("sendTimelineMessage(taskId");
  assert.ok(localAt >= 0, "computer sends must create the local row");
  assert.ok(postAt > localAt, "the local row must render before the network request");
  assert.match(sendBranch, /clientMessageId/);
  assert.match(sendBranch, /timeline\.settleLocal\(clientMessageId/);
  assert.match(sendBranch, /pendingTaskSubmissionRef\.current = null/);
  assert.match(sendBranch, /taskTimelineFailureText/);
  assert.doesNotMatch(sendBranch, /restoreSubmission\(\)/, "a failed computer send must keep the composer empty");
});

test("unsent task rows expose a retry action and the header shares the timeline", () => {
  assert.match(agentChat, /data-task-timeline-unsent=/);
  assert.match(agentChat, /retryTimelineMessage\(clientMessageId\)/);
  assert.match(agentChat, /messages: computerTask \? timelineMessages : messages/);
  assert.match(agentChat, /computerTask \? \(\n\s*<ShareEntryButton/);
  assert.match(agentChat, /share\.enter\("all"\)/);
  assert.match(agentChat, /native: computerTask \?/);
});

test("the computer task page auto-loads older pages and preserves the reader anchor", () => {
  assert.match(agentChat, /shouldLoadOlder\(scrollMetricsOf\(el\)/);
  assert.match(agentChat, /current\.loadOlder\(\)/);
  assert.match(agentChat, /timelineOlderAnchor/);
  assert.match(agentChat, /el\.scrollTop \+= el\.scrollHeight - anchor\.scrollHeight/);
  assert.match(agentChat, /data-native-older-loading=/);
  assert.doesNotMatch(agentChat, /tt\("读取更早消息"\)/);
  assert.doesNotMatch(agentChat, /tt\("Read earlier messages"\)/);
  assert.doesNotMatch(workspaceCopy, /loadEarlierMessages/);
});

test("task timeline status clears itself and keeps reconnects quiet", () => {
  assert.match(agentChat, /timelineStatus\.liveNotice/);
  assert.match(agentChat, /text-stone-400.*正在重新连接/);
  assert.match(agentChat, /timelineReadError/);
  assert.match(agentChat, /onClick=\{retryTimelineRead\}/);
  assert.doesNotMatch(agentChat, /timeline\.error && <p className="text-\[13px\] text-rose-500"/);
  assert.match(agentChat, /timelineOlderError/);
  assert.match(agentChat, /onClick=\{retryTimelineOlder\}/);
});

test("computer recipients use a neutral follow-up placeholder", () => {
  assert.match(agentChat, /computerTask[\s\S]{0,180}tt\("继续追问"\)/);
  assert.doesNotMatch(agentChat, /computerTask[\s\S]{0,120}给 OceanLeo 布置/);
});

