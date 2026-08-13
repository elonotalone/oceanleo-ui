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

test("ordinary shared history keeps each consumer site and fails closed on project rows", () => {
  assert.match(
    masterDetail,
    /listAppSessions\(\{[\s\S]*?siteId,[\s\S]*?projectScope: "unassigned"/,
  );
  assert.match(
    masterDetail,
    /listTasks\(100, siteId, pending, "all"\)/,
  );
  assert.match(
    masterDetail,
    /sessionsResult\.data\?\.items \|\| \[\]\)\.filter\([\s\S]*?session\.project_id == null/,
  );
  assert.match(
    masterDetail,
    /tasksResult\.data\?\.items \|\| \[\]\)\.filter\([\s\S]*?task\.project_id == null/,
  );
  assert.doesNotMatch(masterDetail, /projectScope:\s*"all"/);
  assert.doesNotMatch(masterDetail, /siteId\s*=\s*"oceanleo"/);

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

test("old project deep links stop before playback and expose only a safe project route", () => {
  const sessionProjectGuard = masterDetail.indexOf(
    "if (session.project_id)",
  );
  const sessionSiteGuard = masterDetail.indexOf(
    "if (siteId && session.site_id !== siteId)",
  );
  const taskProjectGuard = masterDetail.indexOf(
    "if (taskResult.data.task.project_id)",
  );
  const taskSiteGuard = masterDetail.indexOf(
    "siteId &&\n          taskResult.data.task.site_id",
  );
  assert.ok(sessionProjectGuard > -1);
  assert.ok(sessionProjectGuard < sessionSiteGuard);
  assert.ok(taskProjectGuard > -1);
  assert.ok(taskProjectGuard < taskSiteGuard);

  const projectFallback = masterDetail.indexOf(
    'if (loaded.kind === "project")',
  );
  const playback = masterDetail.indexOf("const runtimeSession");
  assert.ok(projectFallback > -1);
  assert.ok(projectFallback < playback);
  assert.match(
    masterDetail,
    /if \(!base \|\| !base\.startsWith\("\/"\) \|\| base\.startsWith\("\/\/"\)\) return null/,
  );
  assert.match(masterDetail, /encodeURIComponent\(projectId\)/);
  assert.match(masterDetail, /项目记录不会显示在普通历史中/);
  assert.match(masterDetail, /patch\.project_id[\s\S]*?list\.filter/);
});
