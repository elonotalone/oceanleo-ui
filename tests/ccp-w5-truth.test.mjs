import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { compileModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const parseUrl = await compileModule("src/shell/cloud-computer/agent-dialog/parse.ts");
const noticeUrl = await compileModule("src/shell/cloud-computer/agent-dialog/notice.ts");
const memoryUrl = await compileModule("src/shell/cloud-computer/agent-dialog/model-param-memory.ts");
const { parsePrograms, parseModels, parseConfigOptions } = await import(parseUrl);
const { boolParamLabel, hiddenModelCopy, modelDisplayName, modelGroups, modelParamOptions, noticeCopy, noticeAction } = await import(noticeUrl);
const { mergeLiveParams, restoresForModel, tuningSummary } = await import(memoryUrl);

const tt = (value, vars) => value.replace(/\{(\w+)\}/g, (_, key) => String(vars?.[key] ?? `{${key}}`));

test("I7 status and model frames preserve provider truth", () => {
  const [status] = parsePrograms([{
    id: "hermes", installed: true, path: "/h", version: "1", auth: "login",
    dir_capability: "full", running: false,
    providers: [
      { id: "nous", label: "Nous Portal", auth: "login", tier: "free" },
      { id: "deepseek", label: "DeepSeek", auth: "key" },
    ],
    active_provider: "deepseek", account_kind: "api_key",
  }]);
  assert.deepEqual(status.providers, [
    { id: "nous", label: "Nous Portal", auth: "login", tier: "free" },
    { id: "deepseek", label: "DeepSeek", auth: "key" },
  ]);
  assert.equal(status.active_provider, "deepseek");
  assert.equal(status.account_kind, "api_key");

  const models = parseModels([
    { id: "nous-paid", name: "Nous Paid", default: false, provider: "nous", provider_label: "Nous Portal", usable: false, reason: "needs_credits" },
    { id: "deepseek-chat", name: "DeepSeek Chat", default: true, provider: "deepseek", provider_label: "DeepSeek", usable: true },
  ]);
  assert.equal(models[0].usable, false);
  assert.equal(models[0].reason, "needs_credits");
  assert.equal(models[1].provider_label, "DeepSeek");
});

test("unusable models are hidden and grouped by provider", () => {
  const models = [
    { id: "paid", name: "Paid", default: false, provider: "nous", provider_label: "Nous Portal", usable: false, reason: "needs_credits" },
    { id: "free", name: "Free", default: true, provider: "deepseek", provider_label: "DeepSeek", usable: true },
  ];
  assert.deepEqual(modelGroups(models), [{ label: "DeepSeek", models: [models[1]] }]);
  assert.deepEqual(hiddenModelCopy(tt, models), ["Nous Portal 的付费模型需要账户余额，已隐藏。"]);
});

test("provider credit notice names the provider and has no action", () => {
  assert.match(noticeCopy(tt, "provider_needs_credits", null, "nous"), /Nous Portal/);
  assert.equal(noticeAction("provider_needs_credits"), null);
});

test("config options keep Fast/High wires as selectable strings", () => {
  const options = parseConfigOptions([
    {
      id: "fast",
      name: "fast",
      category: "fast",
      current: true,
      options: [{ value: true, name: "Fast" }, { value: false, name: "Standard" }],
    },
    {
      id: "thought_level",
      name: "thinking",
      category: "thought_level",
      current: "high",
      options: [
        { value: "fast", name: "fast" },
        { value: "high", name: "high" },
        { value: "xhigh", name: "extra high" },
      ],
    },
    { id: "mode", name: "mode", category: "mode", current: "agent", options: [{ value: "agent", name: "Agent" }] },
  ]);
  assert.equal(options[0].options[0].value, "true");
  assert.equal(options[0].type, "bool");
  const params = modelParamOptions(options, "mode");
  assert.deepEqual(params.map((row) => row.id), ["fast", "thought_level"]);
  assert.equal(boolParamLabel(options[0], true, tt), "Fast");
  assert.equal(modelDisplayName({ id: "composer-2.5[fast=true]", name: "composer-2.5[fast=true]", default: false }), "composer-2.5 · fast");
  assert.equal(modelDisplayName({ id: "grok-4.6[effort=high]", name: "grok-4.6[effort=high]", default: false }), "grok-4.6 · high");

  const noFast = parseConfigOptions([
    { id: "mode", name: "mode", category: "mode", current: "agent", options: [{ value: "agent", name: "Agent" }] },
    { id: "fast", name: "fast", category: "fast", current: true, options: [{ value: true, name: "Fast" }] },
  ]);
  assert.deepEqual(modelParamOptions(noFast, "mode").map((row) => row.id), [], "a single Fast value is not a picker");

  const later = parseConfigOptions([
    { id: "thought_level", name: "thinking", category: "thought_level", current: "high", options: [{ value: "high", name: "high" }, { value: "xhigh", name: "extra high" }] },
  ]);
  assert.deepEqual(modelParamOptions(later, "mode").map((row) => row.id), ["thought_level"]);
});

test("remembered extra high restores only while the live model still offers it", () => {
  const withXhigh = parseConfigOptions([{
    id: "thought_level",
    name: "thinking",
    category: "thought_level",
    current: "high",
    options: [
      { value: "high", name: "high" },
      { value: "xhigh", name: "extra high" },
    ],
  }])[0];
  const restored = restoresForModel([withXhigh], { thought_level: "xhigh" });
  assert.equal(restored.length, 1);
  assert.equal(restored[0].wire, "xhigh");
  const onlyHigh = parseConfigOptions([{
    id: "thought_level",
    name: "thinking",
    category: "thought_level",
    current: "high",
    options: [{ value: "high", name: "high" }],
  }])[0];
  assert.equal(restoresForModel([onlyHigh], { thought_level: "xhigh" }).length, 0);
  assert.equal(mergeLiveParams({ thought_level: "xhigh", fast: "true" }, [onlyHigh]).fast, "true");
  assert.equal(mergeLiveParams({ thought_level: "xhigh" }, [onlyHigh]).thought_level, "high");
  assert.equal(tuningSummary([{ ...withXhigh, current: "xhigh" }], "Agent"), "extra high · Agent");
});
