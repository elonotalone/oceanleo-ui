import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cardPath = new URL("../src/shell/cloud-computer/terminal-card/CliCard.tsx", import.meta.url);
const settingsPath = new URL("../src/shell/cloud-computer/terminal-card/CliSettingsPanel.tsx", import.meta.url);

test("W10 CLI card contract keeps shared strip, shallow URL and compact settings", async () => {
  const [card, settings] = await Promise.all([
    readFile(cardPath, "utf8"),
    readFile(settingsPath, "utf8"),
  ]);
  assert.match(card, /ServerPageStripPortal/);
  assert.match(card, /ProgramStrip/);
  assert.match(card, /replaceServerPageUrl/);
  assert.doesNotMatch(card, /useRouter\(/);
  assert.doesNotMatch(card, /programsCollapsed/);
  assert.match(card, /flex h-full min-h-0/);
  assert.match(settings, /text-\[13px\]/);
  assert.match(settings, /size-4/);
  assert.doesNotMatch(settings, /size-11|min-h-11/);
});

test("CLI card and settings panel carry no dangerous-action override and read no whole-computer settings", async () => {
  const [card, settings] = await Promise.all([
    readFile(cardPath, "utf8"),
    readFile(settingsPath, "utf8"),
  ]);
  for (const source of [card, settings]) {
    assert.doesNotMatch(source, /confirm_dangerous|confirmDangerous|data-oceanleo-confirm-dangerous/);
    assert.doesNotMatch(source, /危险操作/);
  }
  assert.doesNotMatch(card, /getAgentSettings/, "a CLI launch never waits on the whole-computer settings");
});
