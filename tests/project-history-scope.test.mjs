import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

const taskClient = source("../src/lib/agent.ts");
const sessionClient = source("../src/lib/app-session.ts");
const masterDetail = source("../src/shell/HistoryMasterDetail.tsx");
const historyPage = source("../src/shell/HistoryPage.tsx");

test("history clients accept unassigned by default and only explicit all overrides it", () => {
  assert.match(
    taskClient,
    /projectScope:\s*ProjectScope\s*=\s*"unassigned"/,
  );
  assert.match(
    taskClient,
    /if \(projectScope === "all"\) params\.set\("project_scope", "all"\)/,
  );
  assert.equal(
    taskClient.match(/params\.set\("project_scope"/g)?.length,
    1,
  );

  assert.match(sessionClient, /projectScope\?:\s*ProjectScope/);
  assert.match(
    sessionClient,
    /if \(options\.projectScope === "all"\) params\.set\("project_scope", "all"\)/,
  );
  assert.equal(
    sessionClient.match(/params\.set\("project_scope"/g)?.length,
    1,
  );
});

test("ordinary shared history keeps each consumer site; the sidebar lists the caller's own project rows", () => {
  // D11（2026-10-24，仲裁 A-12 划给 W11）：侧栏显式 project_scope=all；网关列表本来就只返回本人记录。
  assert.match(
    masterDetail,
    /listAppSessions\(\{[\s\S]*?siteId,[\s\S]*?projectScope: "all"/,
  );
  assert.match(masterDetail, /listTasks\(100, siteId, pending, "all", "all"\)/);
  assert.doesNotMatch(masterDetail, /project_id == null/);
  assert.doesNotMatch(masterDetail, /siteId\s*=\s*"oceanleo"/);

  // 旧整页 HistoryPage 不在 D11 范围内，仍只列未归属项目的记录。
  assert.match(
    historyPage,
    /listTasks\(100, siteId, false, "app", "unassigned"\)/,
  );
  assert.match(
    historyPage,
    /\.filter\(\(task\) => task\.project_id == null\)/,
  );
  assert.doesNotMatch(historyPage, /siteId\s*=\s*"oceanleo"/);
});

test("project records open in place under /history (no interstitial)", () => {
  assert.doesNotMatch(masterDetail, /loaded\.kind === "project"/);
  assert.doesNotMatch(masterDetail, /kind: "project"/);
  assert.doesNotMatch(masterDetail, /项目记录不会显示在普通历史中/);
  // 站点归属守卫仍在：别站的会话 / 旧任务照旧拒绝。
  assert.match(masterDetail, /siteId && session\.site_id !== siteId/);
  assert.match(masterDetail, /siteId &&\n\s*taskResult\.data\.task\.site_id/);
  // 移进项目不再把行从列表删掉，只换项目标注。
  assert.doesNotMatch(masterDetail, /patch\.project_id[\s\S]{0,40}list\.filter/);
});
