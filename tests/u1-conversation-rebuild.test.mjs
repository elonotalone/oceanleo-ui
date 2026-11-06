import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("queued conversation copy is rendered as status, never as a raw i18n key", () => {
  const chat = read("src/shell/AgentChat.tsx");
  const copy = read("src/i18n/ui/messages/computer-task-workspace-copy.ts");
  assert.doesNotMatch(chat, /tt\(["']queuedMessageHint/);
  assert.match(chat, /已排队，等 \{to\} 完成这一轮后发送/);
  assert.match(chat, /\{from\} 做完这一轮后交给 \{to\}/);
  assert.match(copy, /已排队，等 \{to\} 完成这一轮后发送/);
  assert.match(copy, /\{from\} 做完这一轮后交给 \{to\}/);
  assert.match(copy, /移除排队消息/);
});

test("task identity and composer controls keep their intended visual affordances", () => {
  const bubble = read("src/shell/AgentTranscriptBubble.tsx");
  const composer = read("src/shell/LeoComposer.tsx");
  const chat = read("src/shell/AgentChat.tsx");
  assert.match(bubble, /message\.role !== "user" \|\| Boolean\(sourceTask\)/);
  assert.match(bubble, /TranscriptAttachment/);
  assert.match(composer, /data-composer-context-action=\{action\.id\}/);
  assert.match(composer, /action\.id === "get-help"/);
  assert.match(composer, /aria-label=\{action\.id === "get-help"/);
  assert.match(chat, /action: \{ version: 1, tab: "bay" \}/);
  assert.match(chat, /nativeModelPickerSlot: taskNativeThread\.modelPicker/);
});

test("terminal surfaces remain mounted and selectable for computer tasks", () => {
  const chat = read("src/shell/AgentChat.tsx");
  assert.match(chat, /surfaceSessions\.map\(\(session\) =>/);
  assert.match(chat, /NativeTerminalSurface/);
  assert.match(chat, /ConversationBar/);
});

