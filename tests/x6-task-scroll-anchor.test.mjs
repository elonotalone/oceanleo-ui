import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { compileModule } from "./helpers/module-bench.mjs";

const { restoreOlderScrollAnchor } = await import(
  await compileModule("src/shell/task-timeline/scroll-anchor.ts")
);
const agentChat = await readFile(new URL("../src/shell/AgentChat.tsx", import.meta.url), "utf8");

test("older transcript pages preserve the reader's scroll position by the rendered height delta", () => {
  const element = { scrollTop: 44, scrollHeight: 1_000 };
  const anchor = { scrollTop: element.scrollTop, scrollHeight: element.scrollHeight };
  element.scrollHeight = 2_509;

  assert.equal(restoreOlderScrollAnchor(element, anchor), 1_509);
  assert.equal(element.scrollTop, 1_553);
});

test("task transcript opts out of browser anchoring before applying its explicit compensation", () => {
  assert.match(agentChat, /style=\{\{ overflowAnchor: "none" \}\}/);
  assert.match(agentChat, /restoreOlderScrollAnchor\(el, anchor, anchor\.visualAnchor\)/);
  assert.match(agentChat, /captureTimelineVisualAnchor\(el\)/);
  assert.match(agentChat, /data-task-timeline-item/);
  assert.match(agentChat, /timelineStatus\.olderError/);
});
