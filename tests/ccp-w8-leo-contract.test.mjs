import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const assistant = readFileSync(new URL("../src/shell/LeoAssistant.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../src/shell/leo/leo-api.ts", import.meta.url), "utf8");
const composer = readFileSync(new URL("../src/shell/leo/LeoPanelComposer.tsx", import.meta.url), "utf8");

test("W8 leo 会话与终端选区合同落在 UI", () => {
  assert.match(api, /export async function leoSessions\(/);
  assert.match(api, /export function leoCreateSession\(/);
  assert.match(api, /export function leoRenameSession\(/);
  assert.match(api, /export async function leoDeleteSession\(/);
  assert.match(api, /session_id=\$\{encodeURIComponent\(session_id\)\}/);
  assert.match(assistant, /subscribeLeoSelection\(showExternal\)/);
  assert.match(assistant, /openLeoAssistant\(\{ text, source: "selection", anchor: rect \}\)/);
  assert.match(assistant, /data-leo-sessions/);
  assert.match(assistant, /aria-label=\{expanded \? tt\("缩小"\) : tt\("放大"\)\}/);
});

test("W8 composer 保持可见的多行输入区", () => {
  assert.match(composer, /rows=\{2\}/);
  assert.match(composer, /min-h-\[52px\]/);
  assert.match(assistant, /data-leo-transcript/);
  assert.match(assistant, /flex min-h-0 flex-1 flex-col overflow-hidden/);
});
