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

test("从历史会话重新开始后离开旧 session URL", () => {
  assert.match(source, /await onBeforeRestart\?\.\(\)/);
  assert.match(source, /await workspace\.restart\(\)/);
  assert.match(source, /await onRestart\?\.\(\)/);
  assert.match(
    source,
    /workspace\?\.mode === "history"[\s\S]*?router\.replace\(`\$\{workspaceAppHref\(workspace\.appId\)\}\$\{query\}`\)/,
  );
});

test("重新开始单击归档且成功反馈不再暗示清空", () => {
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
  assert.match(source, /tt\("已保存至历史记录"\)/);
  assert.match(source, /tt\("保存当前工作至历史记录并重新开始"\)/);
});

test("从旧历史重启时也归档同 app 的另一条活跃会话", () => {
  assert.match(
    providerSource,
    /mode === "history"[\s\S]*?listAppSessions\(\{[\s\S]*?status: "active"[\s\S]*?archiveAppSession\(live\.id\)/,
  );
});
