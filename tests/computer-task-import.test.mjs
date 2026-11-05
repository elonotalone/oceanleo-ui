import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  legacyComputerQuery,
  legacyImportErrorCode,
  legacyImportErrorCopy,
  shouldRetryLegacyImport,
} from "../src/lib/computer-task-import-state.ts";

test("legacy task imports classify foreign and missing computers immediately", async () => {
  assert.equal(legacyImportErrorCode(403), "forbidden");
  assert.equal(legacyImportErrorCode(404), "not-found");
  assert.match(legacyImportErrorCopy("forbidden"), /无权/);
  assert.match(legacyImportErrorCopy("not-found"), /不存在/);
  const source = await readFile("src/shell/cloud-computer/computer-task-import.tsx", "utf8");
  assert.match(source, /legacyImportError=\$\{code\}/);
  assert.match(source, /legacyImportError=not-found/);
  assert.doesNotMatch(source, /setFailed/);
});

test("legacy task imports retry one transient 5xx, then show a try-again device error", () => {
  assert.equal(shouldRetryLegacyImport(503, 0), true);
  assert.equal(shouldRetryLegacyImport(503, 1), false);
  assert.equal(shouldRetryLegacyImport(404, 0), false);
  assert.equal(legacyImportErrorCode(503), "try-again");
  assert.match(legacyImportErrorCopy("try-again"), /重试/);
});

test("known computer links omit the error while foreign and missing links keep it", async () => {
  assert.equal(legacyComputerQuery("cc_04a94a64dbc9", true), "?computer=cc_04a94a64dbc9");
  assert.equal(legacyComputerQuery("cc-foreign", false, 403), "?computer=cc-foreign&legacyImportError=forbidden");
  assert.equal(legacyComputerQuery("cc-missing", false, 404), "?computer=cc-missing&legacyImportError=not-found");
  const source = await readFile("src/shell/cloud-computer/computer-task-import.tsx", "utf8");
  assert.match(source, /loadComputer/);
  assert.match(source, /legacyComputerQuery\(computerId, true\)/);
  assert.match(source, /legacyComputerQuery\(computerId, false, statusOf\(error\)\)/);
  assert.match(source, /legacyImportError=not-found/);
});
