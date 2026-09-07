/**
 * W13 → 2026-09-07：表格两种模式是**同一个 Univer 实例**的同一份文档。
 *
 * 旧核删掉（core-swap:delete grid）之前这里还钉「会话交接」：旧核「编辑」页与
 * Univer「专业」页是两棵树，切页靠 globalThis 上的交接把内存里的表带过去。
 * 现在没有第二棵树，交接连同 flush 登记一起删了，这份只钉打开优先级、
 * 快照灌画布、崩溃恢复只认 Univer 快照。画布那半在浏览器里验。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  GRID_LEGACY_PROJECT_SCHEMA,
  GRID_UNIVER_PROJECT_SCHEMA,
} from "../src/shell/doc-editors/grid-univer/legacy-conversion.ts";
import {
  GRID_PRO_LABEL,
  GRID_UNIVER_RECOVERY_EDITOR_ID,
  isUniverWorkbookSnapshot,
  paintUniverWorkbookFromSnapshot,
  planGridSameDocumentOpen,
  listUniverSnapshotValues,
  replaceUniverWorkbookWithSnapshot,
  sheetsFromLegacyProjectData,
} from "../src/shell/doc-editors/grid-univer/same-document.ts";

const route = readFileSync("src/shell/advanced-routes/GridRoute.tsx", "utf8");
const leaf = readFileSync("src/shell/doc-editors/GridUniverStage.tsx", "utf8");
const sameDocument = readFileSync(
  "src/shell/doc-editors/grid-univer/same-document.ts",
  "utf8",
);

function sheet(cell) {
  return {
    id: "s1",
    name: "Sheet1",
    rows: [["", cell]],
    formats: {},
    merges: [],
    conditionalFormats: [],
  };
}

test("会话交接已随旧核一起删：没有 handoff / flush 登记，路由不再 flush", () => {
  const sameDocumentCode = sameDocument
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(
    sameDocumentCode,
    /Handoff\b|registerGridLiveFlush|flushGridLiveDocument|from "\.\/live-handoff"/,
  );
  assert.doesNotMatch(leaf, /Handoff\b|registerGridLiveFlush|flushGridLiveDocument/);
  assert.doesNotMatch(route, /flushGridLiveDocument|GridLegacyGate/);
});

test("专业页签名字由同一常量给出，舞台用它；路由不再自己拼 adapter", () => {
  assert.equal(GRID_PRO_LABEL, "Univer");
  assert.match(leaf, /proLabel:\s*GRID_PRO_LABEL/);
  assert.match(leaf, /planGridSameDocumentOpen/);
  assert.doesNotMatch(route, /proLabel/);
});

test("库存旧档只读打开，不静默改写", () => {
  const plan = planGridSameDocumentOpen({
    schema: GRID_LEGACY_PROJECT_SCHEMA,
    title: "旧表",
    legacySheets: [sheet("库存")],
  });
  assert.equal(plan.kind, "legacy-stored");
  assert.equal(plan.editable, false);
  assert.ok(plan.snapshot);
});

test("Univer 工程档优先于 office xlsx", () => {
  const plan = planGridSameDocumentOpen({
    schema: GRID_UNIVER_PROJECT_SCHEMA,
    title: "新表",
    univerSnapshot: { id: "wb-univer", name: "新表" },
    officeSheets: [sheet("xlsx")],
  });
  assert.equal(plan.kind, "univer");
  assert.equal(plan.editable, true);
  assert.equal(plan.snapshot.id, "wb-univer");
});

test("office xlsx 可编辑打开；什么都没有就是空表", () => {
  const office = planGridSameDocumentOpen({
    title: "B",
    officeSheets: [sheet("B自己的")],
  });
  assert.equal(office.kind, "office");
  assert.equal(office.editable, true);
  assert.equal(office.sheets[0].rows[0][1], "B自己的");
  assert.ok(
    listUniverSnapshotValues(office.snapshot).some((cell) => cell.value === "B自己的"),
  );

  const empty = planGridSameDocumentOpen({ title: "空" });
  assert.equal(empty.kind, "empty");
  assert.equal(empty.editable, true);
  assert.ok(empty.snapshot && typeof empty.snapshot === "object");
});

test("legacy 工程档的 data.sheets 能抽出来", () => {
  assert.equal(sheetsFromLegacyProjectData(null), null);
  assert.deepEqual(
    sheetsFromLegacyProjectData({ sheets: [sheet("x")] })[0].rows[0][1],
    "x",
  );
});

test("快照里的格子能列出来，并写到当前可见工作簿", () => {
  const plan = planGridSameDocumentOpen({
    title: "表",
    officeSheets: [sheet("agent-test-w13-paint")],
  });
  const cells = listUniverSnapshotValues(plan.snapshot);
  assert.ok(cells.some((cell) => cell.value === "agent-test-w13-paint"));

  const writes = [];
  const painted = paintUniverWorkbookFromSnapshot(
    {
      getActiveSheet() {
        return {
          getRange(row, col) {
            return {
              setValue(value) {
                writes.push(`${row}:${col}:${value}`);
              },
            };
          },
        };
      },
    },
    plan.snapshot,
  );
  assert.ok(painted >= 1);
  assert.ok(writes.some((row) => row.endsWith(":agent-test-w13-paint")));
});

test("换核先建带数据的表再卸空簿；快照格子补上 p 才能画出来", () => {
  const order = [];
  let received = null;
  const result = replaceUniverWorkbookWithSnapshot(
    {
      getActiveWorkbook() {
        return { getId: () => "empty-default" };
      },
      createWorkbook(data) {
        order.push("create");
        received = data;
        return {
          getId: () => "with-data",
          setEditable(value) {
            order.push(`edit:${value}`);
          },
        };
      },
      disposeUnit(id) {
        order.push(`dispose:${id}`);
      },
    },
    {
      name: "表",
      sheets: {
        s1: { cellData: { 0: { 1: { v: "agent-test-w13-cell", t: 1 } } } },
      },
    },
  );
  assert.equal(result.createdId, "with-data");
  assert.equal(result.disposedId, "empty-default");
  assert.equal(order[0], "create");
  assert.ok(order.includes("dispose:empty-default"));
  assert.ok(order.includes("edit:true"));
  assert.equal(received.sheets.s1.cellData[0][1].v, "agent-test-w13-cell");
  assert.ok(received.sheets.s1.cellData[0][1].p.body.dataStream.includes("agent-test-w13-cell"));
});

// ---- 崩溃恢复（父 agent 收尾 W13 时补，浏览器实测：同键互灌导致 Univer 白画布） ----

test("Univer 崩溃恢复键是 grid-univer：库里旧核留下的 grid:* 草稿不会被灌进来", () => {
  assert.equal(GRID_UNIVER_RECOVERY_EDITOR_ID, "grid-univer");
  assert.ok(
    leaf.includes("advancedRecoveryKey(GRID_UNIVER_RECOVERY_EDITOR_ID, item)"),
    "Univer 舞台必须用自己的恢复键",
  );
  assert.ok(!route.includes("advancedRecoveryKey("), "路由不再自己挂恢复");
});

test("Univer 只认工作簿快照：旧核 {sheets:[…]} 草稿被拒", () => {
  assert.equal(isUniverWorkbookSnapshot({ sheets: [sheet("x")], activeSheetId: "s1" }), false);
  assert.equal(isUniverWorkbookSnapshot({ sheets: {} }), false);
  assert.equal(isUniverWorkbookSnapshot(null), false);
  assert.equal(isUniverWorkbookSnapshot({ sheets: { s1: { cellData: {} } } }), true);
});

test("恢复路径先过 isUniverWorkbookSnapshot，再先建后卸", () => {
  assert.ok(leaf.includes("if (!isUniverWorkbookSnapshot(payload)) return false;"));
  assert.ok(
    !leaf.includes("if (unitId) api?.disposeUnit?.(unitId);\n              api?.createWorkbook?.(payload);"),
    "恢复不再先卸后建",
  );
});
