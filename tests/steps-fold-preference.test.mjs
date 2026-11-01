import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const provider = await readFile(new URL("../src/shell/steps-fold-preference.tsx", import.meta.url), "utf8");
const progress = await readFile(new URL("../src/shell/AgentProgress.tsx", import.meta.url), "utf8");

test("steps fold preference is persisted per task", () => {
  assert.match(provider, /oceanleo_steps_fold:v1:/);
  assert.match(provider, /localStorage\.getItem/);
  assert.match(provider, /localStorage\.setItem/);
  assert.match(provider, /taskId: string \| null \| undefined/);
});

test("only running top-level process toggles update the task preference", () => {
  assert.match(progress, /const foldPreference = useStepsFoldPreference\(\)/);
  assert.match(progress, /if \(live\) onRunningToggle\?\.\(next\)/);
  assert.match(progress, /if \(live\) onRunningToggle\?\.\(false\)/);
  assert.match(progress, /foldPreference \? foldPreference\.setPreference : undefined/);
});
