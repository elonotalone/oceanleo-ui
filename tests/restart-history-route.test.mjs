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

// 旧契约是「新建 → 立刻建出新 session → 跳它的 /history/<id>」。产出即建档之后，
// 新会话要等真有产出才存在，这里没有新 id 可跳，于是回该 app 的 live 工作台。
// 原本要保证的「离开旧任务的 URL、不在已保存任务上原地续写」照旧成立。
test("我的任务详情新建时离开旧任务 URL 并回到干净工作台", () => {
  assert.match(source, /workspace\?\.mode === "history"/);
  assert.match(source, /workspace\.startNew\(/);
  assert.match(source, /intent: "attach"/);
  assert.match(
    source,
    /router\.replace\(\s*workspaceAppHref\(workspace\.appId, undefined, pathname\),\s*\)/,
  );
  assert.doesNotMatch(source, /historySessionHref/);
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
