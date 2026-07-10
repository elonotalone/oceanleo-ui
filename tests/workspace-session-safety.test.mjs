import assert from "node:assert/strict";
import test from "node:test";

import { appSessionBodySupportsKeepalive } from "../src/lib/app-session-transport.ts";
import {
  isStaleSessionResponse,
  isWorkspaceSessionReadOnly,
  snapshotTargetsCurrentSession,
} from "../src/shell/workspace-session-safety.ts";

const active = {
  id: "session-1",
  site_id: "word",
  app_id: "proposal",
  status: "active",
  schema_version: 1,
  revision: 3,
  created_at: "2026-07-10T01:00:00Z",
  last_activity_at: "2026-07-10T02:00:00Z",
};

test("我的任务中的 archived session 可续编，live/embed 防止误写", () => {
  assert.equal(isWorkspaceSessionReadOnly("history", active), false);
  assert.equal(
    isWorkspaceSessionReadOnly("workspace", {
      ...active,
      status: "archived",
      archived_at: "2026-07-10T03:00:00Z",
    }),
    true,
  );
  assert.equal(
    isWorkspaceSessionReadOnly("history", {
      ...active,
      status: "archived",
      archived_at: "2026-07-10T03:00:00Z",
    }),
    false,
  );
  assert.equal(
    isWorkspaceSessionReadOnly("embed", {
      ...active,
      status: "archived",
      archived_at: "2026-07-10T03:00:00Z",
    }),
    true,
  );
  assert.equal(isWorkspaceSessionReadOnly("workspace", active), false);
});

test("restart/切 session 后到达的旧 flush 会被 expectedSessionId 拒绝", () => {
  assert.equal(snapshotTargetsCurrentSession(active, active.id), true);
  assert.equal(snapshotTargetsCurrentSession(null, active.id), false);
  assert.equal(
    snapshotTargetsCurrentSession({ ...active, id: "session-2" }, active.id),
    false,
  );
  assert.equal(snapshotTargetsCurrentSession(null), true);
});

test("较旧 revision 的异步读取不能倒灌覆盖刚保存结果", () => {
  assert.equal(
    isStaleSessionResponse(
      { ...active, revision: 5 },
      { ...active, revision: 4 },
    ),
    true,
  );
  assert.equal(
    isStaleSessionResponse(
      { ...active, revision: 5 },
      { ...active, revision: 6 },
    ),
    false,
  );
});

test("keepalive 上限按 UTF-8 字节而不是 JS 字符数计算", () => {
  assert.equal(appSessionBodySupportsKeepalive("a".repeat(59_999)), true);
  assert.equal(appSessionBodySupportsKeepalive("a".repeat(60_000)), false);
  // 30k 汉字只有 30k JS code units，但 UTF-8 为 90k bytes，必须禁用 keepalive。
  assert.equal(appSessionBodySupportsKeepalive("海".repeat(30_000)), false);
});
