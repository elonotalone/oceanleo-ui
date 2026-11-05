import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("task picker uses I-7a REST options and Claude operations", async () => {
  const [api, picker, chat] = await Promise.all([
    readFile("src/pages/devices/program-controls.ts", "utf8"),
    readFile("src/pages/devices/TaskProgramPicker.tsx", "utf8"),
    readFile("src/shell/AgentChat.tsx", "utf8"),
  ]);
  assert.match(api, /\/options/);
  assert.match(api, /\/install/);
  assert.match(api, /\/login\/code/);
  assert.match(api, /\/login\/cancel/);
  assert.match(api, /program-operations/);
  assert.match(api, /waitProgramOperation/);
  assert.match(api, /isProgramOperationTerminal/);
  assert.match(picker, /getProgramOptions/);
  assert.match(picker, /startProgramInstall/);
  assert.match(picker, /startProgramLogin/);
  assert.match(picker, /waitProgramOperation/);
  assert.match(picker, /submitProgramLoginCode/);
  assert.match(picker, /cancelProgramOperation/);
  for (const state of ["needs_code", "failed", "cancelled", "succeeded"]) assert.match(`${api}\n${picker}`, new RegExp(state));
  assert.match(picker, /refreshOptions/);
  assert.match(chat, /model: taskPreferences\.model/);
  assert.match(chat, /effort: taskPreferences\.effort/);
  assert.match(chat, /fast: taskPreferences\.fast/);
});
