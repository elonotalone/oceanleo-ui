import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const agentChat = readFileSync(
  new URL("../src/shell/AgentChat.tsx", import.meta.url),
  "utf8",
);
const transcript = readFileSync(
  new URL("../src/shell/AgentTranscriptBubble.tsx", import.meta.url),
  "utf8",
);

test("history-reopened chat fills its constrained parent instead of recounting 100dvh", () => {
  assert.match(agentChat, /<SplitWorkspace[\s\S]*?\bfillParent\b/);
  assert.match(agentChat, /if \(!topBar\) return split/);
});

test("assistant prose stays plain while every structured artifact is a card", () => {
  assert.match(
    transcript,
    /className="max-w-full px-1 text-neutral-900"[\s\S]*?<TypewriterMarkdown/,
  );
  assert.match(
    transcript,
    /if \(message\.meta\?\.artifact\) \{[\s\S]*?<button[\s\S]*?onClick=\{onArtifactOpen\}/,
  );
  assert.doesNotMatch(transcript, /message\.meta\?\.artifact && message\.meta\.final/);
});

test("task menu exposes complete management actions", () => {
  const menu = readFileSync(
    new URL("../src/shell/HistoryRowActions.tsx", import.meta.url),
    "utf8",
  );
  for (const action of [
    "在新标签打开",
    "复制链接",
    "分享",
    "重命名",
    "置顶",
    "收藏",
    "移动到项目",
    "删除",
  ]) {
    assert.match(menu, new RegExp(action));
  }
});
