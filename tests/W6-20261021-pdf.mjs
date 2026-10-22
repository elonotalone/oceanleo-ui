/**
 * W6: local PDF annotation / mutation increments the shared user-edit
 * generation. Silent source replace and collab do not.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPdfUserEditSession,
  applyPdfEditEngineUserEditSession,
} from "../src/shell/media-editors/use-pdf-edit-engine.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  resetUserEditSession,
  userEditItemKey,
  userMutationGeneration,
} from "../src/shell/user-edit-session.ts";

const workbench = await import(
  await compileModule("src/shell/media-editors/use-pdf-workbench.ts", {
    "../../i18n/ui/useUI": dataModule(
      "const tt = (zh) => zh; export function useUI() { return tt; }",
    ),
  })
);

function pdfItem(id) {
  return { key: `artifact:${id}:r1`, id };
}

test("pdf local-annotation increments userMutationGeneration", () => {
  resetUserEditSession();
  const item = pdfItem("pdf-w6");
  assert.equal(userMutationGeneration(userEditItemKey(item)), 0);
  assert.equal(applyPdfUserEditSession(item, "local-annotation"), 1);
  assert.equal(applyPdfEditEngineUserEditSession(item, "local-annotation"), 2);
  assert.equal(userMutationGeneration(userEditItemKey(item)), 2);
});

test("pdf silent-replace and collab do not record a person mutation", () => {
  resetUserEditSession();
  const item = pdfItem("pdf-w6-silent");
  assert.equal(applyPdfUserEditSession(item, "silent-replace"), 0);
  assert.equal(applyPdfUserEditSession(item, "collab"), 0);
  applyPdfUserEditSession(item, "local-annotation");
  assert.equal(applyPdfUserEditSession(item, "silent-replace"), 1);
  assert.equal(applyPdfUserEditSession(item, "collab"), 1);
  assert.equal(userMutationGeneration(userEditItemKey(item)), 1);
});

test("pdf workbench re-exports the same live helper", () => {
  resetUserEditSession();
  const item = pdfItem("pdf-w6-workbench");
  assert.equal(
    workbench.applyPdfWorkbenchUserEditSession(item, "local-annotation"),
    1,
  );
  assert.equal(workbench.applyPdfUserEditSession(item, "silent-replace"), 1);
  assert.equal(userMutationGeneration(userEditItemKey(item)), 1);
});
