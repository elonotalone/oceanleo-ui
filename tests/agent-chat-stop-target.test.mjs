// The task Stop key must reach the computer when the task is a computer task (acceptance item 5,
// 2026-11-06): `stop` captured computerTask=false from the first render (missing hook dependency),
// so every Stop on a computer task went to /v1/agent/tasks/:id/stop and the program ran on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/shell/AgentChat.tsx", import.meta.url), "utf8");

test("stop callback re-binds when the task turns out to be a computer task", () => {
  const start = src.indexOf("const stop = useCallback(async () => {");
  assert.ok(start > 0, "stop callback not found");
  const body = src.slice(start, src.indexOf("\n  }, [", start) + 200);
  assert.match(body, /if \(computerTask\)/);
  const deps = body.slice(body.indexOf("\n  }, [")).match(/\[([^\]]*)\]/)[1].split(",").map((d) => d.trim());
  assert.ok(deps.includes("computerTask"), `stop deps: ${deps.join(", ")}`);
});
