import assert from "node:assert/strict";
import test from "node:test";
import { compileModule } from "./helpers/module-bench.mjs";
const { modelControls } = await import(await compileModule("src/shell/cloud-computer/agent-dialog/model-controls.ts"));
const { visibleNoticeCopy } = await import(await compileModule("src/shell/cloud-computer/agent-dialog/notice.ts"));
const models = [
  { id: "gpt-example[low]", name: "Example (low)", default: false },
  { id: "gpt-example[high]", name: "Example (high)", default: true },
  { id: "gpt-next[medium]", name: "Next (medium)", default: false },
];
const config = [{ id: "model", category: "model", name: "Model", type: "select", current: "gpt-example", options: [{ value: "gpt-example", name: "Example" }, { value: "gpt-next", name: "Next" }] },
{ id: "reasoning_effort", category: "thought_level", name: "Reasoning effort", type: "select", current: "high", options: [{ value: "low", name: "Low" }, { value: "high", name: "High" }] }];
test("Codex model selector uses base config wires and effort remains an independent config", () => {
  const controls = modelControls("codex", models, config, "gpt-example[high]");
  assert.deepEqual(controls.models.map(model => model.id), ["gpt-example", "gpt-next"]);
  assert.equal(controls.selected, "gpt-example");
  assert.equal(controls.memoryModel, "gpt-example");
  assert.equal(controls.effort, null);
});
test("legacy Codex catalog is split without manufacturing model IDs or efforts", () => {
  const controls = modelControls("codex", models, [], "gpt-example[high]");
  assert.deepEqual(controls.models.map(model => model.name), ["Example", "Next"]);
  assert.deepEqual(controls.effort.options, [{ value: "gpt-example[low]", name: "low" }, { value: "gpt-example[high]", name: "high" }]);
  assert.equal(controls.selected, "gpt-example[high]");
  assert.equal(controls.memoryModel, "gpt-example");
});
test("other adapters preserve their exact parameterized model IDs", () => {
  const controls = modelControls("cursor", models, [], "gpt-example[high]");
  assert.deepEqual(controls.models, models);
  assert.equal(controls.effort, null);
});
test("Invalid params describes the failed application setting request", () => {
  const copy = visibleNoticeCopy(text => text, "invalid_argument", null, "Invalid params");
  assert.match(copy, /OceanLeo/);
  assert.match(copy, /设置没有生效/);
});
test("legacy model switches restore each model's advertised saved effort", () => {
  const catalog = [...models, { id: "gpt-next[high]", name: "Next (high)", default: false }];
  const controls = modelControls("codex", catalog, [], "gpt-example[low]", { "gpt-next": { reasoning_effort: "high" } });
  assert.deepEqual(controls.models.map(model => model.id), ["gpt-example[low]", "gpt-next[high]"]);
  const unsupported = modelControls("codex", catalog, [], "gpt-example[low]", { "gpt-next": { reasoning_effort: "ultra" } });
  assert.equal(unsupported.models[1].id, "gpt-next[medium]");
});
