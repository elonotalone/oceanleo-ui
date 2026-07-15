import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const apiSource = await readFile(
  new URL("../src/lib/app-session.ts", import.meta.url),
  "utf8",
);
const providerSource = await readFile(
  new URL("../src/shell/WorkspaceSession.tsx", import.meta.url),
  "utf8",
);
const agentSource = await readFile(
  new URL("../src/lib/agent.ts", import.meta.url),
  "utf8",
);
const runSource = await readFile(
  new URL("../src/shell/useConsoleRun.ts", import.meta.url),
  "utf8",
);
const draftSource = await readFile(
  new URL("../src/shell/useConsoleDraft.ts", import.meta.url),
  "utf8",
);
const chatSource = await readFile(
  new URL("../src/shell/FunctionAgentChat.tsx", import.meta.url),
  "utf8",
);
const agentChatSource = await readFile(
  new URL("../src/shell/AgentChat.tsx", import.meta.url),
  "utf8",
);
const taskLinkSource = await readFile(
  new URL("../src/shell/workspace-session-task.ts", import.meta.url),
  "utf8",
);

test("AppSession client 使用现有 agent REST 资源", () => {
  assert.match(apiSource, /APP_SESSION_API_BASE = "\/v1\/agent\/sessions"/);
  assert.match(
    apiSource,
    /`\/\$\{encodeURIComponent\(id\)\}\/snapshot`[\s\S]*?jsonMutation\("PUT", payload\)/,
  );
  assert.match(
    apiSource,
    /`\$\{suffix\}\/archive`, jsonMutation\("POST"\)/,
  );
  assert.match(
    apiSource,
    /deleteAppSession[\s\S]*?method: "DELETE"/,
  );
});

test("snapshot revision 冲突只重读最新版，不自动覆盖重试", () => {
  assert.match(
    providerSource,
    /blockedSnapshotSave\(conflictRef\.current\)/,
  );
  assert.equal(
    [...providerSource.matchAll(/blockedSnapshotSave\(conflictRef\.current\)/g)]
      .length,
    2,
  );
  const conflictStart = providerSource.indexOf("if (result.status === 409)");
  const conflictEnd = providerSource.indexOf(
    "reportFailure(result.status",
    conflictStart,
  );
  assert.notEqual(conflictStart, -1);
  assert.notEqual(conflictEnd, -1);
  const conflictBranch = providerSource.slice(conflictStart, conflictEnd);
  assert.match(
    conflictBranch,
    /getAppSession\(active\.id, sessionSurface\)/,
  );
  assert.doesNotMatch(conflictBranch, /updateAppSession\(/);
});

test("降级路径没有生成本地 session UUID", () => {
  assert.doesNotMatch(providerSource, /randomUUID|crypto\.randomUUID|uuidv4/);
});

test("新建任务只在任务保存成功后 remount 干净 runtime", () => {
  assert.match(
    providerSource,
    /const result = await archive\(\);[\s\S]*?if \(result\)[\s\S]*?setRuntimeEpoch/,
  );
  assert.match(
    providerSource,
    /<Fragment key=\{runtimeEpoch\}>\{children\}<\/Fragment>/,
  );
});

test("console run 与 FunctionAgentChat 都把真实 session_id 传给后端", () => {
  assert.match(agentSource, /session_id: body\.sessionId \|\| null/);
  assert.match(runSource, /sessionId: sessionId \|\| undefined/);
  assert.match(chatSource, /sessionId: linkedSessionId \|\| undefined/);
});

test("session API 返回 task_id 时不再扫描有限历史窗口", () => {
  assert.match(
    taskLinkSource,
    /if \(session\.task_id\) return session\.task_id;[\s\S]*?listTasks\(100, session\.site_id\)/,
  );
});

test("共享 AgentChat 可选复用 workspace task，并在首建前绑定真实 session", () => {
  assert.match(agentChatSource, /useOptionalWorkspaceSession\(\)/);
  assert.match(
    agentChatSource,
    /explicitTaskId !== undefined[\s\S]*?workspace\?\.taskId \|\| localTaskId/,
  );
  assert.match(
    agentChatSource,
    /await workspace\.ensureActive\(\{ title: prompt \}\)/,
  );
  assert.match(
    agentChatSource,
    /sessionId: linkedSessionId \|\| undefined/,
  );
  assert.match(
    agentChatSource,
    /await workspace\.bindTask\(createdTaskId, prompt\)/,
  );
  assert.match(
    agentChatSource,
    /if \(loadedTaskRef\.current === taskId\) return;[\s\S]*?void refresh\(taskId\)/,
  );
  assert.match(
    agentChatSource,
    /workspace\.mode !== "history"[\s\S]*?<RestartDraftButton[\s\S]*?label=\{tt\("新建"\)\}/,
  );
  assert.match(agentChatSource, /appId="home-agent"/);
  assert.match(agentChatSource, /startFreshSession/);
  assert.match(
    agentChatSource,
    /await workspace\.startNew\(\{[\s\S]*?remountRuntime: false/,
  );
  assert.match(
    providerSource,
    /listAppSessions\(\{[\s\S]*?appId: app,[\s\S]*?surface: sessionSurface,[\s\S]*?status: "active"[\s\S]*?archiveAppSession\(\s*activeSessionId,\s*sessionSurface/,
  );
  assert.match(agentChatSource, /router\.replace\(historySessionHref\(sessionId\)\)/);
  assert.match(agentChatSource, /const \[rightOpen, setRightOpen\] = useState\(hasOrgPanel\)/);
  assert.match(agentChatSource, /open: rightOpen/);
  const artifactAutoStart = agentChatSource.indexOf(
    "const seenArtRef = useRef",
  );
  const organizationAutoStart = agentChatSource.indexOf(
    "const orgAutoOpenedRef = useRef",
    artifactAutoStart,
  );
  assert.ok(artifactAutoStart >= 0 && organizationAutoStart > artifactAutoStart);
  assert.doesNotMatch(
    agentChatSource.slice(artifactAutoStart, organizationAutoStart),
    /setRightOpen\(true\)/,
  );
  assert.match(agentChatSource, /setActiveArtifactIds\([\s\S]*?r\.data\.artifacts/);
  assert.match(agentChatSource, /activeArtifactIds\.has\(artifact\.id\)/);
  assert.match(agentChatSource, /await deleteArtifact\(artifactId\)/);
  assert.match(
    agentChatSource,
    /if \(!taskId\)[\s\S]*?setWorkspaceAction\(null\)[\s\S]*?setRightOpen\(hasOrgPanel\)/,
  );
  assert.doesNotMatch(agentChatSource, /saveSnapshot\([\s\S]*?messages/);
});

test("真实操作台自动恢复、debounce 保存，并在卸载前 flush", () => {
  assert.match(
    chatSource,
    /const readSessionSnapshot = getSessionSnapshot \|\| getOpsState/,
  );
  assert.match(
    chatSource,
    /restoreSessionSnapshotRef\.current\?\.\(split\.runtime\)/,
  );
  assert.match(
    chatSource,
    /readSessionSnapshotRef\.current = readSessionSnapshot;[\s\S]*?restoreSessionSnapshotRef\.current = restoreSessionSnapshot;/,
  );
  assert.doesNotMatch(
    chatSource,
    /workspace\?\.session\?\.schema_version,[\s\S]{0,200}\breadSessionSnapshot,\s*\n\s*restoreSessionSnapshot,/,
  );
  assert.match(chatSource, /\.saveSnapshot\(\s*snapshot,\s*sessionSchemaVersion/);
  assert.match(chatSource, /setTimeout\(\(\) => void flushSnapshot\(\), 700\)/);
  assert.match(
    chatSource,
    /const flush = sessionSnapshotFlushRef\.current;[\s\S]*?if \(flush\) void flush\(\)/,
  );
  assert.match(chatSource, /window\.addEventListener\("pagehide", flushPending\)/);
  assert.match(chatSource, /document\.visibilityState === "hidden"/);
  assert.match(chatSource, /mergeWorkspaceSessionSnapshot\(/);
  assert.match(chatSource, /runtimeHydration\?\.restoreSharedUi\(split\.ui\)/);
  assert.match(chatSource, /onBeforeRestart=\{\(\) => restartFlushRef\.current\(\)\}/);
  assert.doesNotMatch(chatSource, /__oceanleo_note|sessionNoteField|记录这份工作的目的、版本或待办/);
  assert.match(apiSource, /keepalive: appSessionBodySupportsKeepalive\(body\)/);
  assert.match(
    agentSource,
    /init\?\.keepalive \? cachedAccessToken\(\) : null/,
  );
  assert.match(draftSource, /window\.addEventListener\("pagehide", flushPending\)/);
  assert.match(draftSource, /document\.visibilityState === "hidden"/);
});

test("灵感卡把原 prompt 和 nonce 一起交给操作台或纯 agent 输入框高亮", () => {
  assert.match(chatSource, /setFillTemplate\(text\)/);
  assert.match(
    chatSource,
    /<FillNonceProvider nonce=\{fillNonce\} template=\{fillTemplate\}>/,
  );
  assert.match(chatSource, /highlightTemplate=\{fillTemplate \|\| undefined\}/);
  assert.match(chatSource, /fillNonce=\{fillNonce\}/);
});

test("已保存任务在 history 原地续编，live 误写与旧 flush 受守卫", () => {
  assert.match(
    providerSource,
    /current &&[\s\S]*?\(!isArchivedAppSession\(current\) \|\| mode === "history"\)[\s\S]*?return current;[\s\S]*?if \(mode === "history"\) return null/,
  );
  assert.match(
    providerSource,
    /isArchivedAppSession\(active\) && mode !== "history"/,
  );
  assert.match(
    providerSource,
    /snapshotTargetsCurrentSession\([\s\S]*?options\.expectedSessionId/,
  );
  assert.match(
    providerSource,
    /const archivedForLive =[\s\S]*?mode !== "history"[\s\S]*?clearCurrent\(\)/,
  );
  assert.match(
    providerSource,
    /if \(mode === "history"\) return false;[\s\S]*?const active = sessionRef\.current/,
  );
  assert.match(
    chatSource,
    /workspace\.readOnly[\s\S]*?expectedSessionId: workspace\.session\?\.id/,
  );
  assert.match(
    chatSource,
    /workspace && workspace\.mode !== "history"[\s\S]*?<RestartDraftButton/,
  );
  assert.match(
    draftSource,
    /currentWorkspace\.readOnly[\s\S]*?expectedSessionId: currentWorkspace\.session\?\.id/,
  );
  assert.match(
    draftSource,
    /result\.ok \|\|[\s\S]*?result\.readOnly \|\|[\s\S]*?result\.stale/,
  );
});
