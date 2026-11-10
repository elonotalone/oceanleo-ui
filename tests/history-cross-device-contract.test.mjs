import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(new URL("..", import.meta.url).pathname);
const source = (path) => readFileSync(resolve(root, path), "utf8");

test("history APIs resolve the injected desktop gateway at request time", () => {
  const config = source("src/lib/auth/config.ts");
  const agent = source("src/lib/agent.ts");
  const computer = source("src/lib/cloud-computer-api.ts");
  assert.match(config, /export function gatewayBase\(\): string/);
  assert.match(agent, /fetch\(`\$\{gatewayBase\(\)\}\$\{path\}/);
  assert.match(computer, /fetch\(`\$\{gatewayBase\(\)\}\$\{path\}/);
  assert.doesNotMatch(agent, /fetch\(`\$\{GATEWAY_BASE\}/);
  assert.doesNotMatch(computer, /fetch\(`\$\{GATEWAY_BASE\}/);
});

test("desktop history is account-wide while the web portal keeps main-site scope", () => {
  const portal = ["../oceanleo", "../../oceanleo"].find((path) => existsSync(resolve(root, path, "app/history/page.tsx")));
  assert.ok(portal, "portal checkout is present alongside main or worktree root");
  const page = source(`${portal}/app/history/page.tsx`);
  assert.match(page, /useOptionalClientHost/);
  assert.match(page, /platform === "desktop" \? undefined : "oceanleo"/);
  assert.match(page, /<HistoryDetail\s+siteId=\{historySiteId\}/);
});

test("task history keeps the session list and first-send race contracts wired", () => {
  const chat = source("src/shell/AgentChat.tsx");
  assert.match(chat, /listComputerTaskSessions\(taskId\)/);
  assert.match(chat, /if \(workspace\.taskId\)/);
  assert.match(chat, /if \(!local \|\| !sessionId \|\| workspace\.readOnly\) return/);
});
