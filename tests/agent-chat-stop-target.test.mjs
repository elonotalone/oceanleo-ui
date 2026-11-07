// The task Stop key must reach the computer when the task is a computer task (acceptance item 5,
// 2026-11-06: the cloud `stop` captured computerTask=false from the first render, so every Stop on a
// computer task went to /v1/agent/tasks/:id/stop and the program ran on). Since the thin-gateway wave
// (2026-11-07) a computer task has its own composer on the frames stream; its Stop is `stopAcpTurn` →
// `stop` of lib/acp-frames-api (POST /v1/tasks/{id}/stop), bound to the current task. The mounted
// behaviour (Stop posts /stop while a turn is open) is in agent-chat-conversations.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/shell/AgentChat.tsx", import.meta.url), "utf8");

test("a computer task's Stop goes to the frames client's stop for the current task, never the cloud stop", () => {
  const imports = src.match(/import \{([^}]*)\} from "\.\.\/lib\/acp-frames-api";/);
  assert.ok(imports, "frames client import not found");
  assert.match(imports[1], /\bstop as stopAcp\b/);

  const start = src.indexOf("const stopAcpTurn = useCallback(async () => {");
  assert.ok(start > 0, "stopAcpTurn not found");
  const end = src.indexOf("\n  }, [", start);
  const body = src.slice(start, end);
  assert.match(body, /await stopAcp\(taskId\)/);
  assert.doesNotMatch(body, /\bstopTask\(|streamAbortRef/, "the cloud task stop is not the computer's stop");
  const deps = src.slice(end).match(/\[([^\]]*)\]/)[1].split(",").map((d) => d.trim());
  assert.ok(deps.includes("taskId"), `stopAcpTurn deps: ${deps.join(", ")}`);

  // The frames stream's composer (the one that sends through sendAcpMessage) stops with stopAcpTurn.
  const at = src.indexOf("onSubmit={() => void sendAcpMessage()}");
  assert.ok(at > 0, "frames composer not found");
  const composer = src.slice(src.lastIndexOf("<LeoComposer", at), src.indexOf("/>", at));
  assert.match(composer, /onStop=\{\(\) => void stopAcpTurn\(\)\}/);
});
