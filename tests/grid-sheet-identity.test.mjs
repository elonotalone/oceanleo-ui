import assert from "node:assert/strict";
import test from "node:test";

import {
  isValidGridSheetId,
  normalizeGridSheetIdentities,
  resolveGridActiveSheetId,
} from "../src/shell/doc-editors/grid-sheet-identity.ts";

function reopenIdentityProject(project) {
  const normalized = normalizeGridSheetIdentities(
    project.sheets.map((sheet) => sheet.id),
    project.activeSheetId,
  );
  return {
    sheets: project.sheets.map((sheet, index) => ({
      ...sheet,
      id: normalized.ids[index],
    })),
    activeSheetId: normalized.activeSheetId,
  };
}

test("two-sheet save and reopen roundtrip keeps the second sheet active", () => {
  const edited = reopenIdentityProject({
    sheets: [
      { id: "sheet-budget", name: "预算", rows: [["收入", "成本"]] },
      { id: "sheet-forecast", name: "预测", rows: [["Q1", "Q2"]] },
    ],
    activeSheetId: "sheet-forecast",
  });
  const saved = JSON.parse(JSON.stringify(edited));
  const reopened = reopenIdentityProject(saved);

  assert.deepEqual(
    reopened.sheets.map((sheet) => sheet.id),
    ["sheet-budget", "sheet-forecast"],
  );
  assert.equal(reopened.activeSheetId, "sheet-forecast");
  assert.deepEqual(reopened, edited);
});

test("duplicate, missing, and malicious sheet IDs migrate deterministically", () => {
  const malicious = `"><script>alert("sheet")</script>`;
  const rawIds = [
    "stable-sheet",
    "stable-sheet",
    "__proto__",
    malicious,
    undefined,
    "sheet-5",
  ];
  const migrated = normalizeGridSheetIdentities(rawIds, malicious);
  const repeated = normalizeGridSheetIdentities(rawIds, malicious);

  assert.deepEqual(repeated, migrated);
  assert.equal(migrated.ids[0], "stable-sheet");
  assert.notEqual(migrated.ids[1], "stable-sheet");
  assert.equal(migrated.ids[5], "sheet-5");
  assert.equal(migrated.activeSheetId, migrated.ids[3]);
  assert.equal(new Set(migrated.ids).size, migrated.ids.length);
  assert.ok(migrated.ids.every(isValidGridSheetId));
  assert.ok(!migrated.ids.includes("__proto__"));
  assert.ok(!migrated.ids.includes(malicious));

  const reopened = normalizeGridSheetIdentities(
    migrated.ids,
    migrated.activeSheetId,
  );
  assert.deepEqual(reopened, migrated);
});

test("sheet additions select the new sheet and deletions use a valid fallback", () => {
  const initial = [{ id: "sheet-one" }, { id: "sheet-two" }];
  const afterAdd = [...initial, { id: "sheet-three" }];
  assert.equal(
    resolveGridActiveSheetId(afterAdd, "sheet-three"),
    "sheet-three",
  );

  const afterDeleteAdded = afterAdd.filter(
    (sheet) => sheet.id !== "sheet-three",
  );
  assert.equal(
    resolveGridActiveSheetId(
      afterDeleteAdded,
      "sheet-three",
      "sheet-two",
    ),
    "sheet-two",
  );

  const afterDeleteSecond = afterDeleteAdded.filter(
    (sheet) => sheet.id !== "sheet-two",
  );
  assert.equal(
    resolveGridActiveSheetId(afterDeleteSecond, "sheet-two"),
    "sheet-one",
  );
  assert.equal(resolveGridActiveSheetId([], "sheet-one"), "");
});
