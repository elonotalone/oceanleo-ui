import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/shell/RestartDraftButton.tsx", import.meta.url),
  "utf8",
);
const providerSource = await readFile(
  new URL("../src/shell/WorkspaceSession.tsx", import.meta.url),
  "utf8",
);

test("我的任务详情新建时保存旧会话并切到新唯一 URL", () => {
  assert.match(source, /workspace\?\.mode === "history"/);
  assert.match(source, /workspace\.startNew\(/);
  assert.match(source, /router\.replace\(historySessionHref\(next\.id\)\)/);
  assert.doesNotMatch(source, /workspaceAppHref/);
});

test("新建单击保存且反馈进入我的任务", () => {
  assert.doesNotMatch(source, /arming|tt\("确认清空？"\)/);
  assert.match(source, /if \(inFlightRef\.current\) return/);
  assert.match(source, /inFlightRef\.current = true/);
  assert.match(source, /workspace\?\.restartFeedback \?\? localFeedback/);
  assert.match(
    providerSource,
    /setRestartFeedback\(result === "archived" \? "saved" : "reset"\)/,
  );
  assert.match(providerSource, /return "empty"/);
  assert.match(providerSource, /return "archived"/);
  assert.match(source, /tt\("已保存到我的任务"\)/);
  assert.match(source, /tt\("将当前工作保存到我的任务，并打开一个干净工作台"\)/);
  assert.match(source, /label \?\? tt\("新建"\)/);
});

test("我的任务命令层拒绝再次归档或影响 live cache", () => {
  assert.match(
    providerSource,
    /if \(mode === "history"\) return false;[\s\S]*?const active = sessionRef\.current/,
  );
  assert.doesNotMatch(providerSource, /archiveAppSession\(live\.id\)/);
});
