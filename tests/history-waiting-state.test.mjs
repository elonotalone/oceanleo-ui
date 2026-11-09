import assert from "node:assert/strict";
import test from "node:test";
import { compileModule } from "./helpers/module-bench.mjs";

const url = await compileModule("src/shell/history-model.ts", {
  "../lib/agent": { AgentTask: {} },
  "../lib/app-session": { AppSession: {} },
});
const { isHistoryEntryWaiting, isTaskWorking } = await import(url);

test("computer task waiting_user state gets a waiting marker without counting as working", () => {
  const entry = {
    kind: "task",
    id: "task-waiting",
    task: { id: "task-waiting", status: "running", mode: "computer", activity_state: "waiting_user" },
    activity_state: "waiting_user",
  };
  assert.equal(isHistoryEntryWaiting(entry), true);
  assert.equal(isTaskWorking(entry.task), false);
});
