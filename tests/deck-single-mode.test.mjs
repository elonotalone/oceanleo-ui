import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("src/shell/advanced-routes/DeckRoute.tsx", "utf8");

test("deck is one native mode: no hosted route, no pro page, no mode gate", () => {
  for (const gone of [
    "DeckHostedRoute",
    "DeckHostedContextToolbar",
    "deck-hosted-save",
    "deck-hosted-selection-command",
  ]) {
    assert.doesNotMatch(route, new RegExp(gone), `${gone} must not be referenced`);
  }
  assert.doesNotMatch(route, /PluginModeSwitchGate|usePluginMode|useModeSwitchReady|resolveEditorCore|editor-handoff|proLabel|PPTist/);
  assert.doesNotMatch(route, /mode:\s*\{/, "no mode adapter (no Edit/Pro tabs)");
  assert.match(route, /<DeckStage/);
});

test("PPTist hosted files are deleted", () => {
  for (const file of [
    "DeckHostedRoute.tsx",
    "DeckHostedContextToolbar.tsx",
    "deck-hosted-save.ts",
    "deck-hosted-selection-command.ts",
  ]) {
    assert.equal(existsSync(`src/shell/advanced-routes/${file}`), false, file);
  }
});

test("pptist carrier stays a clean-room format converter (no AGPL app code)", () => {
  const carrier = readFileSync("src/shell/doc-editors/deck-pptist-carrier.ts", "utf8");
  assert.doesNotMatch(carrier, /from\s+["'](?:pptist|@pptist)/i);
  assert.match(carrier, /AGPL/);
});
