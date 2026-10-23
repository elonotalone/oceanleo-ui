/**
 * W10（2026-10-23 编辑器整改 R2）：
 * - 打开时外壳的「恢复草稿」要等协同首同步把房间内容套进画布之后再开始，
 *   否则打开即「最新服务器草稿暂时无法恢复，自动保存已暂停」（开发槽实测）。
 * - 素材库点图片 = 在当前格子插浮动图片：走 Univer 插图命令（进撤销栈），图片存成 data URL，
 *   只收 PNG / JPEG / GIF；登记 W02 的 command 契约。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { gridRecoveryReady } from "../src/shell/doc-editors/grid-univer/open-settle.ts";
import {
  GRID_IMAGE_MAX_BYTES,
  gridAcceptsImageMaterial,
  gridImageDataUrlFromBlob,
  insertGridImageAtSelection,
  sniffGridImageType,
} from "../src/shell/doc-editors/grid-univer/material-image.ts";

const stage = readFileSync(new URL("../src/shell/doc-editors/GridUniverStage.tsx", import.meta.url), "utf8");

test("恢复草稿：源没好不放；协同关着源好即放；协同开着要首同步完成且绑定器已套用", () => {
  const base = { snapshotReady: true, loading: false, sourceFailed: false, collabOn: false, collabPhase: "off", collabBound: false };
  assert.equal(gridRecoveryReady(base), true);
  assert.equal(gridRecoveryReady({ ...base, snapshotReady: false }), false);
  assert.equal(gridRecoveryReady({ ...base, loading: true }), false);
  assert.equal(gridRecoveryReady({ ...base, sourceFailed: true }), false);
  const collab = { ...base, collabOn: true };
  assert.equal(gridRecoveryReady({ ...collab, collabPhase: "waiting", collabBound: true }), false);
  assert.equal(gridRecoveryReady({ ...collab, collabPhase: "live", collabBound: false }), false);
  assert.equal(gridRecoveryReady({ ...collab, collabPhase: "live", collabBound: true }), true);
  // 舞台真的用它，而不是旧的「snapshotReady && !loading && !sourceFailed」。
  assert.match(stage, /ready:\s*recoveryReady,/);
  assert.match(stage, /gridRecoveryReady\(\{\s*snapshotReady, loading, sourceFailed, collabOn, collabPhase, collabBound,\s*\}\)/);
  assert.match(stage, /setCollabBound\(true\)/);
});

test("素材：只收能原样导出 XLSX 的图片（PNG / JPEG / GIF），没有地址不收", () => {
  const item = (over) => ({ kind: "image", url: "https://x/a.png?sig=1", meta: {}, ...over });
  assert.equal(gridAcceptsImageMaterial(item({})), true);
  assert.equal(gridAcceptsImageMaterial(item({ url: "https://x/a.webp" })), false);
  assert.equal(gridAcceptsImageMaterial(item({ url: "https://x/raw", meta: { format: "jpeg" } })), true);
  assert.equal(gridAcceptsImageMaterial(item({ url: "", previewUrl: "" })), false);
  assert.equal(gridAcceptsImageMaterial(item({ kind: "sheet", url: "https://x/t.xlsx" })), false);
});

test("素材：按文件头认类型，转 data URL；非图片、过大拒绝", async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  assert.equal(sniffGridImageType(png), "image/png");
  assert.equal(sniffGridImageType(new Uint8Array([0xff, 0xd8, 0xff, 0])), "image/jpeg");
  assert.equal(sniffGridImageType(new Uint8Array([0x47, 0x49, 0x46, 0x38])), "image/gif");
  const url = await gridImageDataUrlFromBlob(new Blob([png], { type: "application/octet-stream" }));
  assert.match(url, /^data:image\/png;base64,/);
  await assert.rejects(gridImageDataUrlFromBlob(new Blob(["<svg/>"])), /PNG、JPEG 或 GIF/);
  const big = { size: GRID_IMAGE_MAX_BYTES + 1, arrayBuffer: async () => png.buffer };
  await assert.rejects(gridImageDataUrlFromBlob(big), /5 MB/);
});

test("素材：插在活动格子处（走 facade 的 insertImage），拿不到工作表返回 false", async () => {
  const calls = [];
  const api = {
    getActiveWorkbook: () => ({
      getActiveSheet: () => ({
        insertImage: async (u, col, row) => { calls.push([u, col, row]); return true; },
        getSelection: () => ({ getActiveRange: () => ({ getRow: () => 4, getColumn: () => 2 }) }),
      }),
    }),
  };
  assert.equal(await insertGridImageAtSelection(api, "data:image/png;base64,AA"), true);
  assert.deepEqual(calls, [["data:image/png;base64,AA", 2, 4]]);
  assert.equal(await insertGridImageAtSelection(null, "x"), false);
  assert.equal(await insertGridImageAtSelection({ getActiveWorkbook: () => null }, "x"), false);
});

test("舞台：素材适配器只申报 insert 图片，并登记 W02 的 command 契约（基线 = 当前 revision）", () => {
  assert.match(stage, /id:\s*"grid-materials@3"/);
  assert.match(stage, /actions:\s*\["insert"\]/);
  assert.match(stage, /materialTypes:\s*\["image"\]/);
  assert.match(stage, /withEditorHistoryCommand\(materialAdapter,\s*\{\s*documentId:\s*advancedRootItemId\(item\),\s*targetRevisionId:/);
  // 整份替换不进撤销历史，不再作为素材库动作。
  assert.doesNotMatch(stage, /actions:\s*\["replace"\]/);
});
