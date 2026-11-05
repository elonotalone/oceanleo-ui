import assert from "node:assert/strict";
import test from "node:test";

import {
  lastProgramKey,
  modelParamMemoryKey,
  programSelectionKey,
  readLastProgram,
  rememberProgramPreferences,
  restoreProgramPreferences,
} from "../src/pages/devices/program-memory.ts";

function storageFixture() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); },
    values,
  };
}

const options = {
  models: [{id: "opus", default: true}, {id: "sonnet"}],
  modes: [{id: "default", default: true}, {id: "plan"}],
  efforts: [{id: "default", default: true}, {id: "high"}],
  fast: {available: true},
};

test("picker memory survives reload and a new task on the same computer", () => {
  const localStorage = storageFixture();
  globalThis.window = {localStorage};
  rememberProgramPreferences("cc-memory", "claude", {model: "sonnet", mode: "plan", effort: "high", fast: false});
  assert.equal(readLastProgram("cc-memory"), "claude");
  assert.deepEqual(restoreProgramPreferences("cc-memory", "claude", options), {model: "sonnet", mode: "plan", effort: "high", fast: false});
  assert.equal(localStorage.getItem(lastProgramKey("cc-memory")), "claude");
  assert.deepEqual(JSON.parse(localStorage.getItem(programSelectionKey("cc-memory", "claude"))), {model: "sonnet", mode: "plan"});
  assert.deepEqual(JSON.parse(localStorage.getItem(modelParamMemoryKey("cc-memory", "claude"))), {sonnet: {mode: "plan", reasoning_effort: "high", fast_mode: "false"}});
  assert.deepEqual(restoreProgramPreferences("cc-memory", "claude", options), {model: "sonnet", mode: "plan", effort: "high", fast: false});
});

test("unknown saved model falls back to the offered default", () => {
  const localStorage = storageFixture();
  globalThis.window = {localStorage};
  localStorage.setItem(programSelectionKey("cc-unknown", "claude"), JSON.stringify({model: "retired-model", mode: "retired-mode"}));
  localStorage.setItem(modelParamMemoryKey("cc-unknown", "claude"), JSON.stringify({"retired-model": {reasoning_effort: "retired-effort", fast_mode: "false"}}));
  assert.deepEqual(restoreProgramPreferences("cc-unknown", "claude", options), {model: "opus", mode: "default", effort: "default", fast: true});
});

test("picker memory tolerates unavailable local storage", () => {
  globalThis.window = {get localStorage() { throw new Error("blocked"); }};
  assert.doesNotThrow(() => rememberProgramPreferences("cc-blocked", "claude", {model: "opus", effort: "high", fast: true}));
  assert.deepEqual(restoreProgramPreferences("cc-blocked", "claude", options), {model: "opus", mode: "default", effort: "default", fast: true});
});
