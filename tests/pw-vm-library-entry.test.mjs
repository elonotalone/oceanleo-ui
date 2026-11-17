import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import http from "node:http";
import { compileModule, dataModule, realModule } from "./helpers/module-bench.mjs";
import { PW_VM_MESSAGES } from "../src/i18n/ui/messages/pw-vm-copy.ts";
import { LOCALES } from "../src/i18n/config.ts";
const item = { id: "root", artifactId: "root", revisionId: "r1", artifactType: "workflow", artifact: { sourceFormat: "oceanleo.video.project.v2" } };
const png = new Blob([Uint8Array.from([137,80,78,71,13,10,26,10])], { type: "image/png" });

test("catalog capability descriptions have all UI locales", () => {
  assert.deepEqual(Object.keys(PW_VM_MESSAGES).sort(), [...LOCALES].sort());
  const keys = Object.keys(PW_VM_MESSAGES.zh);
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(PW_VM_MESSAGES[locale]), keys);
    for (const text of Object.values(PW_VM_MESSAGES[locale])) assert.ok(text.length > 5);
  }
});
