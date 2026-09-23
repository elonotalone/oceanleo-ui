import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { compileModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const parseUrl = await compileModule("src/shell/cloud-computer/agent-dialog/parse.ts");
const noticeUrl = await compileModule("src/shell/cloud-computer/agent-dialog/notice.ts");
const { parsePrograms, parseModels } = await import(parseUrl);
const { hiddenModelCopy, modelGroups, noticeCopy, noticeAction } = await import(noticeUrl);

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
