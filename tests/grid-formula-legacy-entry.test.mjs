import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * §规范一 budget lock.
 *
 * `evaluateGridCell(rows, row, col)` cannot see a sibling sheet, so every call
 * site is a place where `Sheet2!B3` silently becomes `#REF!`. The entry stays
 * exported and working — `GridWorkbookExport.ts`, `grid-structure.ts` and
 * `grid-format/conditional-format.ts` still depend on it — but the count only
 * ever goes down. Raising `PENDING_LEGACY_EVAL` is not a way to make this test
 * pass; migrating a call site to `evaluateGridCellInWorkbook` is.
 */

const SOURCE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src",
);

/**
 * Measured 2026-08-31 after P1 removed all four `grid-model.ts` call sites.
 * The survivors are on other owners' exclusive surfaces, so this round cannot
 * migrate them; `signals/W12-request.md` asks their owners to.
 */
const PENDING_LEGACY_EVAL = 8;

/** Where the survivors live, so a reviewer can see the debt without grepping. */
const EXPECTED_BY_FILE = {
  "shell/doc-editors/GridWorkbookExport.ts": 4,
  "shell/doc-editors/grid-structure.ts": 2,
  "shell/doc-editors/grid-format/conditional-format.ts": 2,
};

/**
 * Counting is textual, so it excludes exactly two shapes that are not call
 * sites: the declaration itself, and the bare `evaluateGridCell()` that
 * `grid-structure.ts` writes inside a doc comment. Anything else that looks
 * like a call is counted, and the per-file assertion below makes a miscount
 * loud rather than silent.
 */

function sourceFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) found.push(full);
  }
  return found;
}

/**
 * Count calls, not mentions. The declaration in `grid-formula.ts` and the
 * longer names `evaluateGridCellTyped` / `evaluateGridCellInWorkbook` must not
 * be counted, or the budget would drift for reasons unrelated to the defect.
 */
function countLegacyCalls(body) {
  let count = 0;
  for (const match of body.matchAll(/(\w+\s+)?\bevaluateGridCell\((\)?)/g)) {
    if (match[1] && match[1].trim() === "function") continue;
    if (match[2] === ")") continue;
    count += 1;
  }
  return count;
}

test("旧求值入口的调用点只减不增", () => {
  const counts = {};
  let total = 0;
  for (const file of sourceFiles(SOURCE_ROOT)) {
    const calls = countLegacyCalls(readFileSync(file, "utf8"));
    if (calls === 0) continue;
    counts[path.relative(SOURCE_ROOT, file).split(path.sep).join("/")] = calls;
    total += calls;
  }
  assert.ok(
    total <= PENDING_LEGACY_EVAL,
    `旧入口调用点 ${total} > 预算 ${PENDING_LEGACY_EVAL}：` +
      `新增调用点请改用 evaluateGridCellInWorkbook。实测分布 ${JSON.stringify(counts)}`,
  );
  assert.deepEqual(counts, EXPECTED_BY_FILE);
});

test("P1 之后 grid-model.ts 一个旧入口调用点都不剩", () => {
  const body = readFileSync(
    path.join(SOURCE_ROOT, "shell/doc-editors/grid-model.ts"),
    "utf8",
  );
  assert.equal(countLegacyCalls(body), 0);
});

test("旧入口仍然导出可用，且标了 @deprecated", () => {
  const body = readFileSync(
    path.join(SOURCE_ROOT, "shell/doc-editors/grid-formula.ts"),
    "utf8",
  );
  const marker = "export function evaluateGridCell(";
  assert.ok(body.includes(marker));
  const head = body.slice(0, body.indexOf(marker));
  const docComment = head.slice(head.lastIndexOf("/**"));
  assert.ok(
    docComment.includes("@deprecated"),
    "evaluateGridCell 紧邻的文档注释里必须留着 @deprecated",
  );
  assert.ok(
    docComment.includes("evaluateGridCellInWorkbook"),
    "@deprecated 必须指明改用哪个入口，否则读到的人不知道往哪迁",
  );
});
