import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/shell/SiteCatalogConsole.tsx", import.meta.url),
  "utf8",
);
const operatorSource = await readFile(
  new URL("../src/shell/OperatorConsole.tsx", import.meta.url),
  "utf8",
);
const hydrationSource = await readFile(
  new URL("../src/shell/workspace-runtime-hydration.tsx", import.meta.url),
  "utf8",
);

test("普通模式、历史和 embed 都把解析后的 app 身份交给 OperatorConsole", () => {
  assert.match(source, /<OperatorConsole[\s\S]*?\bvalue=\{activeAppId\}/);
  assert.doesNotMatch(source, /value=\{embed\s*\?\s*value\s*:\s*undefined\}/);
});

test("目录选择同步宿主状态并进入 canonical path", () => {
  assert.match(source, /<OperatorConsole[\s\S]*?\bonChange=\{changeApp\}/);
  assert.match(source, /router\.push\(canonicalAppHref\(id\)\)/);
  assert.match(source, /if \(embed\) \{\s*onChange\?\.\(id\)/);
  assert.match(
    source,
    /if \(embed\)[\s\S]*?return;\s*\}\s*[\s\S]*?onChange\?\.\(id\);[\s\S]*?router\.push/,
  );
});

test("旧 query 深链优先于本地受控选择并收敛到 canonical path", () => {
  const legacyIndex = source.indexOf("legacyRouteAppId ||");
  const valueIndex = source.indexOf("((embed || solo) ? value : \"\")", legacyIndex);
  assert.notEqual(legacyIndex, -1);
  assert.ok(valueIndex > legacyIndex);
  assert.match(source, /legacyAppAliases\?\.\[rawRequestedAppId\]/);
  assert.match(source, /router\.replace\(canonicalAppHref\(activeAppId, true\)\)/);
});

test("普通页面以 pathname 为真源，浏览器后退到 workspace 不被旧 value 弹回", () => {
  assert.match(source, /\(\(embed \|\| solo\) \? value : ""\)/);
  assert.doesNotMatch(
    source,
    /pathAppId \|\|\s*value \|\|/,
  );
});

test("真实 app runtime 总是在 WorkspaceSessionProvider 内", () => {
  assert.match(source, /<WorkspaceSessionProvider[\s\S]*?\{hydratedConsoleNode\}/);
  assert.match(source, /const effectiveHistorySession =\s*inheritedHistorySession \|\| historySession/);
  assert.match(source, /if \(reusingHistoryProvider\) return hydratedConsoleNode/);
  assert.match(
    source,
    /<WorkspaceRuntimeBoundary[\s\S]*?scope=\{activeAppId\}[\s\S]*?onRegisterBeforeLeave=\{registerBeforeLeave\}/,
  );
});

test("受控目录只在 canonical value 到达后打开 app，不会先错画第一张卡", () => {
  assert.match(operatorSource, /const controlled = value !== undefined/);
  assert.match(operatorSource, /if \(!controlled\) setOpened\(id\)/);
  assert.match(
    operatorSource,
    /const isOpened = controlled \? Boolean\(value\) : opened !== null/,
  );
});

test("app 初始化与 session 恢复完成前 runtime 保持不可见", () => {
  assert.match(source, /hydration\?\.markAppInitialized\(\)/);
  assert.match(hydrationSource, /workspace\.availability !== "loading"/);
  assert.match(hydrationSource, /current\.appInitialized[\s\S]*?current\.runtimeReady/);
  assert.match(
    hydrationSource,
    /className=\{ready \? "h-full" : "invisible h-full"\}/,
  );
});

test("live session 从 new 解析为服务端 id 时不重置 app runtime 身份", () => {
  const identityStart = hydrationSource.indexOf("const identity =");
  const identityEnd = hydrationSource.indexOf("const [state", identityStart);
  assert.notEqual(identityStart, -1);
  assert.ok(identityEnd > identityStart);
  const identityBlock = hydrationSource.slice(identityStart, identityEnd);
  assert.match(
    identityBlock,
    /workspace\.mode.*workspace\.siteId.*workspace\.appId.*scope/s,
  );
  assert.doesNotMatch(identityBlock, /sessionId/);
});

test("退出或切换 app 前尽力冲刷 snapshot，但失败或挂起都不能锁死返回按钮", () => {
  assert.match(
    source,
    /await beforeLeaveWithDeadline\(beforeLeaveRef\.current\)/,
  );
  assert.doesNotMatch(source, /if \(!saved\) return/);
  assert.match(source, /Promise\.race\([\s\S]*?setTimeout\(\(\) => resolve\(false\), timeoutMs\)/);
  assert.match(source, /\.catch\(\(\) => false\)/);
  assert.match(
    source,
    /onRegisterBeforeLeave=\{registerBeforeLeave\}/,
  );
});

test("旧 task 深链直接回到原对话并允许分支续聊", () => {
  assert.match(
    source,
    /isAppSessionApiUnavailableStatus\(result\.status\)[\s\S]*?getTask\(historySessionId\)/,
  );
  assert.doesNotMatch(source, /旧记录信息不完整/);
  assert.match(source, /taskId=\{taskId\}/);
  assert.doesNotMatch(source, /taskId=\{taskId\}[\s\S]{0,100}\breadOnly\b/);
});
