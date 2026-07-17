import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canDeleteHistoryEntry,
  isRestorableAppSession,
  mergeHistoryEntries,
  withLinkedAgentTask,
} from "../src/shell/history-model.ts";

const historySource = readFileSync(
  new URL("../src/shell/HistoryMasterDetail.tsx", import.meta.url),
  "utf8",
);

const baseSession = {
  id: "session-1",
  site_id: "word",
  app_id: "proposal",
  title: "项目建议书",
  status: "active",
  snapshot: { topic: "海洋项目" },
  schema_version: 2,
  revision: 3,
  created_at: "2026-07-10T01:00:00Z",
  updated_at: "2026-07-10T02:00:00Z",
  last_activity_at: "2026-07-10T02:00:00Z",
};

test("session 优先，已归属 session 的多次 run 不再重复成历史项", () => {
  const entries = mergeHistoryEntries(
    [baseSession],
    [
      {
        id: "run-1",
        title: "生成大纲",
        status: "done",
        mode: "console",
        session_id: "session-1",
        created_at: "2026-07-10T01:20:00Z",
      },
      {
        id: "legacy-1",
        title: "旧对话",
        status: "done",
        mode: "agent",
        created_at: "2026-07-09T01:00:00Z",
      },
    ],
  );

  assert.deepEqual(
    entries.map((entry) => [entry.kind, entry.id]),
    [
      ["session", "session-1"],
      ["task", "legacy-1"],
    ],
  );
});

test("session 与未迁移旧 task 按同一活动时间轴排序", () => {
  const entries = mergeHistoryEntries(
    [baseSession],
    [
      {
        id: "legacy-new",
        title: "刚完成的旧对话",
        status: "done",
        mode: "agent",
        updated_at: "2026-07-10T03:00:00Z",
      },
    ],
  );
  assert.deepEqual(
    entries.map((entry) => entry.id),
    ["legacy-new", "session-1"],
  );
});

test("session API 可用时绝不把已绑定 task 误装成可删除旧记录", () => {
  const entries = mergeHistoryEntries([], [
    {
      id: "bound-run-outside-session-page",
      status: "done",
      mode: "console",
      session_id: "older-session-not-in-first-page",
    },
    {
      id: "real-legacy-task",
      status: "done",
      mode: "agent",
    },
  ]);
  assert.deepEqual(entries.map((entry) => entry.id), ["real-legacy-task"]);
  assert.equal(canDeleteHistoryEntry(entries[0]), true);
});

test("旧后端可回放 session-bound task；聚合 session 使用独立永久删除", () => {
  const entries = mergeHistoryEntries(
    [],
    [
      {
        id: "compat-task",
        status: "done",
        mode: "agent",
        session_id: "unavailable-session-resource",
      },
    ],
    { sessionApiUnavailable: true },
  );
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, "task");
  assert.equal(canDeleteHistoryEntry(entries[0]), false);
  assert.equal(
    canDeleteHistoryEntry({ kind: "session", id: baseSession.id, session: baseSession }),
    true,
  );
});

test("操作台需真实 snapshot；标准 agent 可用真实 task thread 恢复 runtime", () => {
  assert.equal(isRestorableAppSession(baseSession), true);
  assert.equal(
    isRestorableAppSession({ ...baseSession, app_id: "" }),
    false,
  );
  assert.equal(
    isRestorableAppSession({ ...baseSession, snapshot: null }),
    false,
  );
  assert.equal(
    isRestorableAppSession({ ...baseSession, snapshot: [] }),
    false,
  );
  assert.equal(
    isRestorableAppSession({
      ...baseSession,
      app_id: "agent",
      snapshot: null,
      task_id: "task-1",
    }),
    true,
  );
  assert.equal(
    isRestorableAppSession({
      ...baseSession,
      app_id: "home-agent",
      snapshot: null,
      task_id: "home-task-1",
    }),
    true,
  );
  assert.equal(
    isRestorableAppSession({
      ...baseSession,
      app_id: "proposal",
      snapshot: null,
      task_id: "task-1",
    }),
    false,
  );
  const linkedAgent = withLinkedAgentTask(
    { ...baseSession, app_id: "agent", snapshot: null },
    "linked-task",
  );
  assert.equal(linkedAgent.task_id, "linked-task");
  assert.equal(isRestorableAppSession(linkedAgent), true);
  const linkedHomeAgent = withLinkedAgentTask(
    { ...baseSession, app_id: "home-agent", snapshot: null },
    "linked-home-task",
  );
  assert.equal(linkedHomeAgent.task_id, "linked-home-task");
  assert.equal(isRestorableAppSession(linkedHomeAgent), true);
});

test("完整 session 交给站点 runtime，旧任务直接回到可续聊对话", () => {
  assert.match(historySource, /withLinkedAgentTask\(/);
  assert.match(historySource, /renderWorkspace\(currentSession\)/);
  assert.match(historySource, /<WorkspaceSessionProvider/);
  assert.doesNotMatch(historySource, /旧记录信息不完整/);
  assert.match(historySource, /<AgentChat/);
});

test("HistoryMasterDetail 删除按资源类型守卫，且成功后清理深链", () => {
  assert.match(
    historySource,
    /if \(!canDeleteHistoryEntry\(entry\)\) return false;[\s\S]*?deleteTask\(entry\.task\.id\)/,
  );
  assert.doesNotMatch(historySource, /deleteTask\(entry\.id\)/);
  assert.match(historySource, /removed && target\.id === sel[\s\S]*?router\.replace\("\/history"\)/);
});

test("我的任务包含 active 会话并实时接收新任务，离开历史页不保留旧高亮", () => {
  assert.match(historySource, /includeArchived:\s*true/);
  assert.match(historySource, /surface:\s*"all"/);
  assert.match(historySource, /listTasks\(100, siteId, pending, "all"\)/);
  assert.doesNotMatch(historySource, /tt\("高级任务"\)/);
  assert.match(historySource, /historySessionHref\(entry\.id\)/);
  assert.doesNotMatch(historySource, /advancedFeatureHref/);
  assert.match(historySource, /HISTORY_CHANGED_EVENT/);
  assert.match(historySource, /setInterval\(\(\) => reload\(true\), 8000\)/);
  assert.doesNotMatch(
    historySource,
    /if \(!pending\) return;\s*const t = setInterval/,
  );
  assert.match(
    historySource,
    /includes\("history"\)\) \{\s*setSel\(null\);\s*return;/,
  );
});
