import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/shell/SiteCatalogConsole.tsx", import.meta.url),
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
  assert.match(source, /<WorkspaceSessionProvider[\s\S]*?\{consoleNode\}/);
  assert.match(source, /const effectiveHistorySession =\s*inheritedHistorySession \|\| historySession/);
  assert.match(source, /if \(reusingHistoryProvider\) return consoleNode/);
});

test("旧 task 深链明确降级回放，不伪造成当前操作台", () => {
  assert.match(
    source,
    /isAppSessionApiUnavailableStatus\(result\.status\)[\s\S]*?getTask\(historySessionId\)/,
  );
  assert.match(source, /旧记录信息不完整，无法恢复当时操作台/);
  assert.match(source, /不会用当前草稿或默认值伪装历史/);
  assert.match(source, /taskId=\{taskId\}[\s\S]*?\breadOnly\b/);
});
