import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const card = await readFile(new URL("../src/shell/cloud-computer/terminal-card/TerminalCard.tsx", import.meta.url), "utf8");
const panel = await readFile(new URL("../src/shell/cloud-computer/TerminalPanel.tsx", import.meta.url), "utf8");

test("W9 terminal card keeps mounted state and uses the shallow URL API", () => {
  assert.match(card, /useState\(\(\) => initialSessionId/);
  assert.doesNotMatch(card, /router\.(push|replace)/);
  assert.match(card, /replaceServerPageUrl\(computer\.id, \{ card: "terminal", session: selectedId \}\)/);
  assert.match(card, /const terminalLists = new Map/);
  assert.match(card, /className=\{`relative flex h-full min-h-0/);
  assert.match(card, /<IconPlus className="size-3\.5" \/>\s*\{busyId === "new" \? tt\("正在创建…"\) : tt\("新终端"\)\}/s);
});

test("W9 terminal selection publishes leo anchors and fit is active-gated", () => {
  assert.match(panel, /announceLeoSelection\(\{ text, anchor, source: "terminal" \}\)/);
  assert.match(panel, /announceLeoSelection\(null\)/);
  assert.match(panel, /if \(active\) announceSize\(\)/);
  assert.match(panel, /if \(!term \|\| !activeRef\.current\) return;/);
  assert.match(panel, /term\.onSelectionChange/);
});
