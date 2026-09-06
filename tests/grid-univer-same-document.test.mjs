/**
 * W13：表格「编辑」与「专业编辑」是同一份文档。
 *
 * 钉住的是打开优先级和会话交接，不是 Univer 画布本身。
 * 画布那半在浏览器里验。
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
  clearGridLiveHandoff,
  flushGridLiveDocument,
  gridItemKey,
  itemWithoutUniverProjectPin,
  peekGridLiveHandoff,
  paintUniverWorkbookFromSnapshot,
  planGridSameDocumentOpen,
  publishGridLiveHandoff,
  registerGridLiveFlush,
  listUniverSnapshotValues,
  replaceUniverWorkbookWithSnapshot,
  sheetsFromLegacyProjectData,
  takeGridLiveHandoff,
} from "../src/shell/doc-editors/grid-univer/same-document.ts";

const route = readFileSync("src/shell/advanced-routes/GridRoute.tsx", "utf8");
const leaf = readFileSync("src/shell/doc-editors/GridUniverStage.tsx", "utf8");

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

test("live-handoff 用 globalThis 而不是模块 let，避免 dynamic chunk 各持一份", () => {
  const source = readFileSync(
    "src/shell/doc-editors/grid-univer/live-handoff.ts",
    "utf8",
  );
  assert.match(source, /__oceanleoGridLiveHandoff/);
  assert.match(source, /globalThis/);
  assert.doesNotMatch(source, /^let liveHandoff/m);
});

test("专业页签名字由同一常量给出，舞台和路由都用它", () => {
  assert.equal(GRID_PRO_LABEL, "Univer");
  assert.match(route, /proLabel:\s*GRID_PRO_LABEL/);
  assert.match(leaf, /proLabel:\s*GRID_PRO_LABEL/);
  assert.match(route, /flushGridLiveDocument/);
  assert.match(leaf, /planGridSameDocumentOpen/);
});

test("会话交接优先于空的 office 表：刚打的格子不会变成空表", () => {
  clearGridLiveHandoff();
  const live = [sheet("agent-test-w13-cell")];
  const plan = planGridSameDocumentOpen({
    itemKey: "grid-1",
    schema: GRID_LEGACY_PROJECT_SCHEMA,
    title: "表",
    handoff: {
      itemKey: "grid-1",
      sheets: live,
      source: "legacy",
    },
    officeSheets: [
      {
        id: "empty",
        name: "Sheet1",
        rows: [[""]],
        formats: {},
        merges: [],
        conditionalFormats: [],
      },
    ],
  });
  assert.equal(plan.kind, "legacy-live");
  assert.equal(plan.editable, true);
  assert.equal(plan.sheets[0].rows[0][1], "agent-test-w13-cell");
});

test("库存旧档、没有交接时仍只读，不静默改写", () => {
  const plan = planGridSameDocumentOpen({
    itemKey: "grid-old",
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
    itemKey: "grid-u",
    schema: GRID_UNIVER_PROJECT_SCHEMA,
    title: "新表",
    univerSnapshot: { id: "wb-univer", name: "新表" },
    officeSheets: [sheet("xlsx")],
  });
  assert.equal(plan.kind, "univer");
  assert.equal(plan.editable, true);
  assert.equal(plan.snapshot.id, "wb-univer");
});

test("另一份文档的交接不会串过来", () => {
  const plan = planGridSameDocumentOpen({
    itemKey: "grid-b",
    title: "B",
    handoff: {
      itemKey: "grid-a",
      sheets: [sheet("A的格子")],
      source: "legacy",
    },
    officeSheets: [sheet("B自己的")],
  });
  assert.equal(plan.kind, "office");
  assert.equal(plan.sheets[0].rows[0][1], "B自己的");
});

test("交接挂在 globalThis 上，两个 chunk 读的是同一份", () => {
  clearGridLiveHandoff();
  publishGridLiveHandoff({
    itemKey: "shared",
    sheets: [sheet("跨chunk")],
    source: "legacy",
  });
  const store = globalThis.__oceanleoGridLiveHandoff;
  assert.ok(store);
  assert.equal(store.handoff.sheets[0].rows[0][1], "跨chunk");
  assert.equal(peekGridLiveHandoff("shared")?.sheets[0].rows[0][1], "跨chunk");
});

test("publish / peek / take 按文档钥匙隔离", () => {
  clearGridLiveHandoff();
  publishGridLiveHandoff({
    itemKey: "k1",
    sheets: [sheet("一")],
    source: "legacy",
  });
  assert.equal(peekGridLiveHandoff("k2"), null);
  assert.equal(peekGridLiveHandoff("k1")?.sheets[0].rows[0][1], "一");
  assert.equal(takeGridLiveHandoff("k1")?.source, "legacy");
  assert.equal(peekGridLiveHandoff("k1"), null);
});

test("切页前登记的 flush 真的会被叫到", async () => {
  let calls = 0;
  registerGridLiveFlush(async () => {
    calls += 1;
    return { ok: true };
  });
  const result = await flushGridLiveDocument();
  assert.equal(result.ok, true);
  assert.equal(calls, 1);
  registerGridLiveFlush(null);
  const skipped = await flushGridLiveDocument();
  assert.equal(skipped.ok, true);
  assert.equal(calls, 1);
});

test("旧核打开 Univer 存档时摘掉工程 pin，避免 schema 对不上落到空表", () => {
  const item = {
    id: "g1",
    meta: {
      editor_project_schema: GRID_UNIVER_PROJECT_SCHEMA,
      editor_project_url: "https://example.test/proj.json",
    },
  };
  const stripped = itemWithoutUniverProjectPin(item);
  assert.equal(stripped.meta.editor_project_url, "");
  assert.equal(stripped.meta.editor_project_schema, "");
  const legacy = {
    id: "g2",
    meta: {
      editor_project_schema: GRID_LEGACY_PROJECT_SCHEMA,
      editor_project_url: "https://example.test/old.json",
    },
  };
  assert.equal(itemWithoutUniverProjectPin(legacy), legacy);
});

test("legacy 工程档的 data.sheets 能抽出来", () => {
  assert.equal(sheetsFromLegacyProjectData(null), null);
  assert.deepEqual(
    sheetsFromLegacyProjectData({ sheets: [sheet("x")] })[0].rows[0][1],
    "x",
  );
});

test("gridItemKey 认 key 再认 id", () => {
  assert.equal(gridItemKey({ key: "creation:1", id: "1" }), "creation:1");
  assert.equal(gridItemKey({ id: "only" }), "only");
});

test("快照里的格子能列出来，并写到当前可见工作簿", () => {
  const plan = planGridSameDocumentOpen({
    itemKey: "grid-paint",
    title: "表",
    handoff: {
      itemKey: "grid-paint",
      sheets: [sheet("agent-test-w13-paint")],
      source: "legacy",
    },
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

// ---- 崩溃恢复与交接的先后（父 agent 收尾 W13 时补，浏览器实测：同键互灌导致 Univer 白画布） ----
import {
  GRID_UNIVER_RECOVERY_EDITOR_ID,
  isUniverWorkbookSnapshot,
  shouldRestoreGridRecovery,
} from "../src/shell/doc-editors/grid-univer/live-handoff.ts";

test("两页崩溃恢复键不同名：旧核 grid、Univer grid-univer", () => {
  assert.equal(GRID_UNIVER_RECOVERY_EDITOR_ID, "grid-univer");
  assert.ok(
    leaf.includes("advancedRecoveryKey(GRID_UNIVER_RECOVERY_EDITOR_ID, item)"),
    "Univer 舞台必须用自己的恢复键",
  );
  assert.ok(
    route.includes('advancedRecoveryKey("grid", item)'),
    "旧核保持 grid 键",
  );
});

test("Univer 只认工作簿快照：旧核 {sheets:[…]} 草稿被拒", () => {
  assert.equal(isUniverWorkbookSnapshot({ sheets: [sheet("x")], activeSheetId: "s1" }), false);
  assert.equal(isUniverWorkbookSnapshot({ sheets: {} }), false);
  assert.equal(isUniverWorkbookSnapshot(null), false);
  assert.equal(isUniverWorkbookSnapshot({ sheets: { s1: { cellData: {} } } }), true);
});

test("刚从交接打开时，崩溃草稿让路，不会盖掉交接内容", () => {
  let called = 0;
  const accept = () => {
    called += 1;
    return true;
  };
  assert.equal(
    shouldRestoreGridRecovery({ openedFromHandoff: true, payload: { sheets: { s1: {} } }, accept }),
    false,
  );
  assert.equal(called, 0);
  assert.equal(
    shouldRestoreGridRecovery({ openedFromHandoff: false, payload: { sheets: { s1: {} } }, accept }),
    true,
  );
  assert.equal(called, 1);
});

test("两条路由都经 shouldRestoreGridRecovery 再恢复", () => {
  assert.ok(leaf.includes("shouldRestoreGridRecovery({"));
  assert.ok(route.includes("shouldRestoreGridRecovery({"));
  assert.ok(route.includes("openedFromHandoff: Boolean(pendingUniverHandoff)"));
  assert.ok(!leaf.includes("if (unitId) api?.disposeUnit?.(unitId);\n              api?.createWorkbook?.(payload);"), "恢复不再先卸后建");
});
