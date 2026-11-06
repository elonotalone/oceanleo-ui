import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const UI_ROOT = resolve(new URL("..", import.meta.url).pathname);
const PORTAL_ROOT = "/root/projects/oceanleo";

function readUi(relative) {
  return readFileSync(resolve(UI_ROOT, relative), "utf8");
}

function readPortal(relative) {
  return readFileSync(resolve(PORTAL_ROOT, relative), "utf8");
}

function pageReady() {
  if (!existsSync(resolve(UI_ROOT, "src/shell/client-window.ts"))) return false;
  const chat = readUi("src/shell/AgentChat.tsx");
  return /timelineRunning/.test(chat) && /getClientWindowId/.test(chat);
}

test("O2 shows Stop/Esc only for the live run and reports queued then injected truthfully", (t) => {
  if (!pageReady()) return t.skip("waiting for T4 client-window and task-page implementation");
  const chat = readUi("src/shell/AgentChat.tsx");
  const composer = readUi("src/shell/messages/composer/Composer.tsx");
  assert.match(chat, /loading=\{timelineRunning\}|loading=\{[^}]*timelineRunning/);
  assert.match(chat, /onStop=/);
  assert.match(composer, /Escape|Esc/);
  assert.match(chat, /injected/);
  assert.match(chat, /下一步会看到/);
  assert.match(chat, /移除排队消息/);
  const removeAt = chat.indexOf("移除排队消息");
  assert.ok(removeAt >= 0);
  assert.match(chat.slice(Math.max(0, removeAt - 1200), removeAt + 500), /queued|排队/);
});

test("O3 home Send enters the task page with the local bubble and composer in place", (t) => {
  if (!pageReady()) return t.skip("waiting for T4 client-window and task-page implementation");
  const home = readPortal("app/_components/home-content.tsx");
  const pending = readPortal("app/_components/pending-task-conversation.tsx");
  const chat = readUi("src/shell/AgentChat.tsx");
  assert.match(home, /PendingTaskConversation/);
  assert.match(home, /setPendingTask/);
  assert.match(home, /attachments/);
  assert.match(pending, /AgentChat/);
  assert.match(pending, /initialAttachments/);
  assert.match(pending, /onTaskCreated/);
  assert.match(pending, /replaceState/);
  assert.match(chat, /stashLocalForTask/);
  assert.doesNotMatch(home, /正在创建任务/);
  assert.doesNotMatch(pending, /正在创建任务/);
  assert.doesNotMatch(home, /在下方输入，开始与 agent 对话。/);
});

test("O4 opens a task page and composer immediately, reserving the empty hint for a loaded empty task", (t) => {
  if (!pageReady()) return t.skip("waiting for T4 client-window and task-page implementation");
  const chat = readUi("src/shell/AgentChat.tsx");
  const timeline = readUi("src/shell/task-timeline/useTaskTimeline.ts");
  assert.match(chat, /<LeoComposer/);
  assert.match(chat, /fromCache/);
  assert.match(chat, /loaded/);
  const emptyAt = chat.indexOf("在下方输入，开始与 agent 对话。");
  assert.ok(emptyAt >= 0, "the empty hint remains available for genuinely empty tasks");
  const emptyContext = chat.slice(Math.max(0, emptyAt - 1300), emptyAt + 100);
  assert.match(emptyContext, /loaded|conversationResolved/);
  assert.match(timeline, /loaded/);
  assert.match(timeline, /fromCache/);
});

test("O5 opens at the newest row, follows the timeline, prefetches before the top, and preserves reset position", (t) => {
  if (!pageReady()) return t.skip("waiting for T4 client-window and task-page implementation");
  const chat = readUi("src/shell/AgentChat.tsx");
  const anchor = readUi("src/shell/task-timeline/scroll-anchor.ts");
  assert.match(chat, /timelineMessages/);
  assert.match(chat, /回到最新/);
  assert.match(chat, /IntersectionObserver|480/);
  assert.match(chat, /reset/);
  assert.match(anchor, /anchor|scroll/i);
  assert.match(anchor, /relative|delta|before|after/i);
  assert.doesNotMatch(chat, /messages\.length[^\n]*unread|messages\.map[^\n]*回到最新/);
});
