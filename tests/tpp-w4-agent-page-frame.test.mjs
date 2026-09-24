import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/shell/SiteCatalogConsole.tsx", import.meta.url),
  "utf8",
);
const legacySource = await readFile(
  new URL("../src/shell/site-catalog-view-helpers.tsx", import.meta.url),
  "utf8",
);

test("新对话和历史会话共用受视口限制的 agent 外框", () => {
  const branch = source.split('activeAppId === "agent" && agentCard ? (')[1]?.split(') : (')[0];
  assert.ok(branch, "agent 分支存在");
  assert.ok(branch.includes("data-agent-page-frame"), "agent 分支有一屏框");
  assert.ok(branch.includes("100dvh"), "一屏框以动态视口限制高度");
  assert.ok(branch.includes("min-h-0"), "一屏框允许分栏收缩");
  assert.ok(branch.includes("<AgentChat"), "一屏框直接包住对话");
  assert.ok(source.includes("if (reusingHistoryProvider) return hydratedConsoleNode"), "继承的历史 provider 复用该视图");
  assert.ok(source.includes("{hydratedConsoleNode}"), "新会话和独立历史 provider 也复用该视图");
});

test("旧会话回放也有一屏上限，窄屏可缩小对话区", () => {
  const branch = legacySource.split("export function LegacyHistoryPlayback(")[1];
  assert.ok(branch, "旧会话回放存在");
  assert.ok(branch.includes("100dvh"), "旧会话回放限制在动态视口内");
  assert.ok(branch.includes("min-h-0 flex-1"), "对话区允许收缩");
  assert.ok(!branch.includes("min-h-[420px]"), "不会因固定最小高度撑出手机屏幕");
});
