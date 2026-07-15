import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const composer = await readFile(
  new URL("../src/shell/LeoComposer.tsx", import.meta.url),
  "utf8",
);
const functionChat = await readFile(
  new URL("../src/shell/FunctionAgentChat.tsx", import.meta.url),
  "utf8",
);
const agentChat = await readFile(
  new URL("../src/shell/AgentChat.tsx", import.meta.url),
  "utf8",
);
const markdown = await readFile(
  new URL("../src/shell/Markdown.tsx", import.meta.url),
  "utf8",
);
const transcriptBubble = await readFile(
  new URL("../src/shell/AgentTranscriptBubble.tsx", import.meta.url),
  "utf8",
);

test("普通发送不会被误认成操作台 override，输入和附件会清空", () => {
  assert.match(functionChat, /onSubmit=\{\(\) => void send\(\)\}/);
  assert.match(functionChat, /if \(!override\) \{\s*setInput\(""\);\s*atts\.clear\(\)/);
  assert.match(agentChat, /onSubmit=\{\(\) => void send\(\)\}/);
});

test("发送失败只在没有新草稿时恢复原输入和附件", () => {
  assert.match(functionChat, /const restoreSubmission = \(\) =>/);
  assert.match(agentChat, /const restoreSubmission = \(\) =>/);
  assert.match(
    functionChat,
    /setInput\(\(current\) => \(current \? current : submittedInput\)\)/,
  );
  assert.match(agentChat, /atts\.restoreReady\(submittedAttachments\)/);
});

test("附件可以单独发送，上传完成前发送键保持禁用", () => {
  assert.match(composer, /value\.trim\(\) \|\| attachments\?\.length/);
  assert.match(
    composer,
    /!attachments\?\.some\(\(attachment\) => attachment\.uploading\)/,
  );
});

test("完整消息原子渲染，不逐帧重解析 Markdown", () => {
  assert.doesNotMatch(markdown, /content\.slice\(0,\s*shown\)/);
  assert.doesNotMatch(markdown, /setTimeout\(/);
  assert.match(markdown, /return <Markdown className=\{className\}>\{content\}<\/Markdown>/);
});

test("主站与专业站复用同一个对话消息渲染器", () => {
  assert.match(agentChat, /<AgentTranscriptBubble/);
  assert.match(functionChat, /<AgentTranscriptBubble/);
  assert.match(transcriptBubble, /message\.kind === "gate"/);
  assert.match(transcriptBubble, /if \(message\.meta\?\.artifact\)/);
  assert.doesNotMatch(
    transcriptBubble,
    /message\.meta\?\.artifact && message\.meta\.final/,
  );
});
