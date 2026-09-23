import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const modal = readFileSync(new URL("../src/pages/settings/SettingsModal.tsx", import.meta.url), "utf8");
const hub = readFileSync(new URL("../src/pages/settings/SettingsHub.tsx", import.meta.url), "utf8");

test("SettingsModal is a blurred body portal with close and focus handling", () => {
  assert.match(modal, /createPortal\(/);
  assert.match(modal, /backdrop-blur/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /event\.key === "Escape"/);
  assert.match(modal, /focusin/);
  assert.match(modal, /onClick=\{onClose\}/);
  assert.match(modal, /✕/);
});

test("SettingsHub keeps page variant and uses callback tabs in modal variant", () => {
  assert.match(hub, /variant\?: "page" \| "modal"/);
  assert.match(hub, /variant === "modal" \? initialTab/);
  assert.match(hub, /onTabChange\?\./);
  assert.match(hub, /else writeTab\(id\)/);
});
