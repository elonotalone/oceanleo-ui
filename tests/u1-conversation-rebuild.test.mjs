import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

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
});

test("terminal surfaces remain mounted and selectable for computer tasks", () => {
  const chat = read("src/shell/AgentChat.tsx");
  assert.match(chat, /surfaceSessions\.map\(\(session\) =>/);
  assert.match(chat, /NativeTerminalSurface/);
  assert.match(chat, /ConversationBar/);
});

