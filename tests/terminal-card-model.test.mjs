import assert from "node:assert/strict";
import test from "node:test";

import {
  orderedCliPrograms,
  runningCliTerminals,
  shellTerminalRecords,
  sortCliChats,
  sortTerminalRecords,
  terminalEndCopy,
} from "../src/shell/cloud-computer/terminal-card/model.ts";
import {
  CLI_SETTINGS_STORAGE_KEY,
  cliLaunchOptions,
  readCliProgramSettings,
  writeCliProgramSettings,
} from "../src/shell/cloud-computer/terminal-card/cli-settings.ts";

function record(overrides = {}) {
  return {
    id: "sid",
    title: "shell",
    created_at: "2026-09-23T08:00:00Z",
    alive: true,
    ended_at: null,
    exit_code: null,
    end_reason: null,
    kind: "shell",
    program: null,
    cwd: null,
    record_bytes: 0,
    ...overrides,
  };
}

function program(overrides = {}) {
  return {
    id: "cursor",
    label: "Cursor",
    installed: true,
    version: "1",
    supports_resume: true,
    options: [],
    ...overrides,
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    raw() {
      return values.get(CLI_SETTINGS_STORAGE_KEY) ?? null;
    },
  };
}

test("终端列表按活着优先、组内时间倒序，Shell 与 CLI 严格分组", () => {
  const rows = [
    record({
      id: "ended-old",
      alive: false,
      ended_at: "2026-09-23T08:00:00Z",
      exit_code: 0,
      end_reason: "exit",
    }),
    record({ id: "live-old", created_at: "2026-09-23T09:00:00Z" }),
    record({
      id: "cli-live",
      kind: "cli",
      program: "cursor",
      created_at: "2026-09-23T11:00:00Z",
    }),
    record({ id: "live-new", created_at: "2026-09-23T10:00:00Z" }),
    record({
      id: "ended-new",
      alive: false,
      ended_at: "2026-09-23T12:00:00Z",
      end_reason: "closed",
    }),
  ];

  assert.deepEqual(
    sortTerminalRecords(rows).map((item) => item.id),
    ["cli-live", "live-new", "live-old", "ended-new", "ended-old"],
  );
  assert.deepEqual(
    shellTerminalRecords(rows).map((item) => item.id),
    ["live-new", "live-old", "ended-new", "ended-old"],
  );
  assert.deepEqual(
    runningCliTerminals(rows, "cursor").map((item) => item.id),
    ["cli-live"],
  );
  assert.deepEqual(runningCliTerminals(rows, "claude"), []);
});

test("结束原因映射成人话，退出码 0 不丢失", () => {
  assert.deepEqual(
    terminalEndCopy(record({ alive: false, end_reason: "closed" })),
    { key: "已关闭" },
  );
  assert.deepEqual(
    terminalEndCopy(record({ alive: false, end_reason: "node_restart" })),
    { key: "节点重启" },
  );
  assert.deepEqual(
    terminalEndCopy(
      record({ alive: false, end_reason: "exit", exit_code: 0 }),
    ),
    { key: "已退出（代码 {code}）", vars: { code: 0 } },
  );
  assert.deepEqual(terminalEndCopy(record({ alive: false })), {
    key: "已结束",
  });
});

test("程序固定为 OceanLeo、Cursor、Claude Code、Codex、Hermes 顺序，历史最近优先", () => {
  const programs = orderedCliPrograms([
    program({ id: "custom", label: "A custom" }),
    program({ id: "codex", label: "Codex" }),
    program({ id: "oceanleo", label: "OceanLeo" }),
    program({ id: "hermes", label: "Hermes" }),
    program({ id: "cursor", label: "Cursor" }),
    program({ id: "claude", label: "Claude Code" }),
  ]);
  assert.deepEqual(
    programs.map((item) => item.id),
    ["oceanleo", "cursor", "claude", "codex", "hermes", "custom"],
  );
  assert.deepEqual(
    sortCliChats([
      { id: "old", title: "old", cwd: null, updated_at: "2026-09-23T08:00:00Z" },
      { id: "new", title: "new", cwd: null, updated_at: "2026-09-23T10:00:00Z" },
    ]).map((item) => item.id),
    ["new", "old"],
  );
});

test("CLI 设置按机器与程序隔离，并映射合法 options 与危险操作默认值", () => {
  const storage = memoryStorage();
  writeCliProgramSettings(
    "cc_1",
    "cursor",
    {
      options: { model: "pro", plan: true, ignored: 123 },
      confirmDangerous: false,
    },
    storage,
  );
  assert.deepEqual(readCliProgramSettings("cc_2", "cursor", storage), {
    options: {},
  });
  assert.deepEqual(readCliProgramSettings("cc_1", "claude", storage), {
    options: {},
  });
  const saved = readCliProgramSettings("cc_1", "cursor", storage);
  assert.deepEqual(saved, {
    options: { model: "pro", plan: true },
    confirmDangerous: false,
  });
  assert.ok(storage.raw());

  const cursor = program({
    options: [
      {
        key: "model",
        label: "Model",
        type: "select",
        choices: [
          { value: "auto", label: "Auto" },
          { value: "pro", label: "Pro" },
        ],
        default: "auto",
      },
      { key: "plan", label: "Plan", type: "bool", default: false },
    ],
  });
  assert.deepEqual(cliLaunchOptions(cursor, saved, true), {
    model: "pro",
    plan: true,
    confirm_dangerous: false,
  });
  assert.deepEqual(
    cliLaunchOptions(cursor, { options: { model: "missing" } }, true),
    { model: "auto", plan: false, confirm_dangerous: true },
  );
});
