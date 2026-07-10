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

test("从旧历史重启时也归档同 app 的另一条活跃会话", () => {
  assert.match(
    providerSource,
    /mode === "history"[\s\S]*?listAppSessions\(\{[\s\S]*?status: "active"[\s\S]*?archiveAppSession\(live\.id\)/,
  );
});
