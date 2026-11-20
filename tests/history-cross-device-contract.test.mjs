import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

const root = resolve(new URL("..", import.meta.url).pathname);
const source = (path) => readFileSync(resolve(root, path), "utf8");

test("history APIs resolve the injected desktop gateway at request time", () => {
  const config = source("src/lib/auth/config.ts");
  const agent = source("src/lib/agent.ts");
  const computer = source("src/lib/cloud-computer-api.ts");
  assert.match(config, /export function gatewayBase\(\): string/);
  assert.match(agent, /sharedGatewayFetch\(`\$\{gatewayBase\(\)\}\$\{path\}/);
  assert.match(computer, /sharedGatewayFetch\(`\$\{gatewayBase\(\)\}\$\{path\}/);
  assert.doesNotMatch(agent, /fetch\(`\$\{GATEWAY_BASE\}/);
  assert.doesNotMatch(computer, /fetch\(`\$\{GATEWAY_BASE\}/);
});

test("desktop and web portal history include tasks from every site", () => {
  // Paired worktree (<unit>-oceanleo next to <unit>-oceanleo-ui), then sibling checkouts, then the main checkout via the git common dir.
  const commonDir = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: root, encoding: "utf8" }).trim();
  const namedPortal = resolve(dirname(root), basename(root).replace(/oceanleo-ui$/, "oceanleo"));
  const portal = [namedPortal, "../oceanleo", "../../oceanleo", resolve(dirname(commonDir), "../oceanleo")].find((path) => existsSync(resolve(root, path, "app/history/page.tsx")));
  assert.ok(portal, "portal checkout is present alongside main or worktree root");
  const page = source(`${portal}/app/history/page.tsx`);
  assert.doesNotMatch(page, /useOptionalClientHost|historySiteId|siteId="oceanleo"/);
  assert.match(page, /<HistoryDetail(?:\s|\/)/);
});

test("task history keeps the session list and first-send race contracts wired", () => {
  const chat = source("src/shell/AgentChat.tsx");
  assert.match(chat, /listComputerTaskSessions\(taskId, \{ signal: controller\.signal \}\)/);
  assert.match(chat, /if \(workspace\.taskId\)/);
  assert.match(chat, /if \(!local \|\| !sessionId \|\| workspace\.readOnly\) return/);
});
