// 注释 sidecar + 存量只读兼容与一键转换。W06 · editor-core-swap 判据 3 / 4。
//
// 这份闸守四件事：
//   §1 subtype 数值与上游 enum 对得上（对不上说明上游改了，转换会静默错位）；
//   §2 坐标换算是一次纯缩放，且**没有多翻一次 y**（这是换核最常见的一种错）；
//   §3 认得出存量数据、认不出的按只读处理而不是硬转；
//   §4 转不了的逐条有原因，且原始载荷一个字节没动。

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  PDF_ANNOTATION_SIDECAR_SCHEMA,
  PDF_ANNOTATION_SIDECAR_VERSION,
  PDF_LEGACY_KIND_TO_SUBTYPE,
  PDF_NEXT_ANNOTATION_SUBTYPES,
  classifyPdfAnnotationPayload,
  convertLegacyPdfAnnotation,
  convertLegacyPdfAnnotations,
  isLegacyPdfAnnotation,
  isPdfAnnotationSidecar,
  legacyVisualRectToNextRect,
  pdfAnnotationLegacyIsReadOnly,
  sidecarToTransferItems,
} from "../src/shell/media-editors/pdf-next-annotations.ts";
import { PDF_ANNOTATION_SUBTYPES } from "../src/shell/media-editors/pdf-annotation-operations.ts";

const repoFile = (relative) =>
  fileURLToPath(new URL(`../${relative}`, import.meta.url));

const A4 = { index: 0, widthPt: 595, heightPt: 842 };

function legacy(overrides = {}) {
  return {
    id: "annot-1",
    kind: "text",
    contents: "看这里",
    rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    color: "#ff0000",
    opacity: 1,
    pageIndex: 0,
    ...overrides,
  };
}

// ── §1 subtype 数值必须与上游 enum 一致 ─────────────────────────────────

test("subtype 数值与 @embedpdf/models 的 enum 逐条对得上", async () => {
  const source = await readFile(
    repoFile("node_modules/@embedpdf/models/dist/pdf.d.ts"),
    "utf8",
  );
  const block = source.slice(
    source.indexOf("export declare enum PdfAnnotationSubtype"),
  );
  const body = block.slice(0, block.indexOf("}"));
  // 先验正则本身（`_COMMON.md` §6：零命中最贵）——上游一定有 HIGHLIGHT = 9。
  assert.match(body, /HIGHLIGHT = 9/, "没抓到上游 enum，正则或路径错了");
  for (const [name, value] of Object.entries(PDF_NEXT_ANNOTATION_SUBTYPES)) {
    assert.match(
      body,
      new RegExp(`\\b${name} = ${value}\\b`),
      `上游 PdfAnnotationSubtype.${name} 不再是 ${value}，转换会静默错位`,
    );
  }
});

test("旧核 11 种 kind 一种都没漏，且都指到一个登记过的 subtype", () => {
  const legacyKinds = Object.keys(PDF_ANNOTATION_SUBTYPES);
  assert.equal(legacyKinds.length, 11, `旧核 kind 数变了：${legacyKinds.length}`);
  for (const kind of legacyKinds) {
    const name = PDF_LEGACY_KIND_TO_SUBTYPE[kind];
    assert.ok(name, `存量 kind「${kind}」没有对应的新核 subtype`);
    assert.ok(
      Object.prototype.hasOwnProperty.call(PDF_NEXT_ANNOTATION_SUBTYPES, name),
      `${kind} 指到的 ${name} 不在 subtype 表里`,
    );
  }
  // arrow 与 line 落到同一个 subtype，是旧核就有的事实，不是映射写错。
  assert.equal(PDF_LEGACY_KIND_TO_SUBTYPE.arrow, "LINE");
  assert.equal(PDF_LEGACY_KIND_TO_SUBTYPE.line, "LINE");
  assert.equal(PDF_ANNOTATION_SUBTYPES.arrow, "Line");
});

// ── §2 坐标：一次纯缩放，没有多翻一次 y ─────────────────────────────────

test("视觉矩形按页面尺寸缩放，原点仍在左上", () => {
  const rect = legacyVisualRectToNextRect(
    { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    A4,
  );
  assert.deepEqual(rect, {
    origin: { x: 59.5, y: 168.4 },
    size: { width: 178.5, height: 336.8 },
  });
});

test("贴着顶边的注释转过去仍然贴着顶边（多翻一次 y 这条会当场红）", () => {
  const top = legacyVisualRectToNextRect(
    { x: 0, y: 0, width: 1, height: 0.1 },
    A4,
  );
  assert.equal(top.origin.y, 0, "顶边注释跑到别处了：说明多做了一次 y 翻转");
  const bottom = legacyVisualRectToNextRect(
    { x: 0, y: 0.9, width: 1, height: 0.1 },
    A4,
  );
  assert.equal(Math.round(bottom.origin.y), 758);
  // 两者不可交换：若实现里翻了 y，这两个断言会互换成立。
  assert.notEqual(top.origin.y, bottom.origin.y);
});

// ── §3 存量识别：认不出的按只读处理 ─────────────────────────────────────

test("认得出一条存量注释，也认得出不是的", () => {
  assert.equal(isLegacyPdfAnnotation(legacy()), true);
  assert.equal(isLegacyPdfAnnotation({ ...legacy(), kind: "hologram" }), false);
  assert.equal(isLegacyPdfAnnotation({ ...legacy(), rect: { x: 1 } }), false);
  assert.equal(isLegacyPdfAnnotation({ ...legacy(), id: "" }), false);
  assert.equal(isLegacyPdfAnnotation(null), false);
  assert.equal(isLegacyPdfAnnotation("annot"), false);
});

test("载荷分流：新 schema / 存量 / 空 / 认不出", () => {
  const sidecar = convertLegacyPdfAnnotations([legacy()], [A4]).sidecar;
  assert.equal(isPdfAnnotationSidecar(sidecar), true);
  assert.equal(classifyPdfAnnotationPayload(sidecar).kind, "sidecar-v2");
  assert.equal(classifyPdfAnnotationPayload([legacy()]).kind, "legacy-annotations");
  assert.equal(
    classifyPdfAnnotationPayload({ annotations: [legacy()] }).kind,
    "legacy-annotations",
  );
  assert.equal(classifyPdfAnnotationPayload([]).kind, "empty");

  const alien = classifyPdfAnnotationPayload({ shapes: [1, 2] });
  assert.equal(alien.kind, "unrecognized");
  assert.notEqual(alien.reason, "", "认不出也要说清为什么，不能静默");

  const wrongRows = classifyPdfAnnotationPayload([{ foo: 1 }, { bar: 2 }]);
  assert.equal(wrongRows.kind, "unrecognized");
  assert.match(wrongRows.reason, /只读/);
});

test("版本号不对的 sidecar 不认成新 schema（否则会拿旧字段去 import）", () => {
  const sidecar = convertLegacyPdfAnnotations([legacy()], [A4]).sidecar;
  assert.equal(isPdfAnnotationSidecar({ ...sidecar, version: 1 }), false);
  assert.equal(
    isPdfAnnotationSidecar({ ...sidecar, schema: "pdf-annotations@1" }),
    false,
  );
});

// ── §4 一键转换：逐条有原因，原载荷不动 ─────────────────────────────────

test("四种几何各自带对了随行字段", () => {
  const highlight = convertLegacyPdfAnnotation(
    legacy({
      id: "h",
      kind: "highlight",
      quads: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.02 }],
    }),
    A4,
  );
  assert.equal(highlight.ok, true);
  assert.equal(highlight.annotation.segmentRects.length, 1);
  assert.equal(highlight.annotation.type, 9);

  const ink = convertLegacyPdfAnnotation(
    legacy({ id: "i", kind: "freehand", strokes: [[{ x: 0.1, y: 0.1 }]] }),
    A4,
  );
  assert.equal(ink.ok, true);
  assert.deepEqual(ink.annotation.inkList, [{ points: [{ x: 59.5, y: 84.2 }] }]);

  const arrow = convertLegacyPdfAnnotation(
    legacy({
      id: "a",
      kind: "arrow",
      endpoints: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    }),
    A4,
  );
  assert.equal(arrow.ok, true);
  assert.equal(arrow.annotation.intent, "LineArrow");
  assert.deepEqual(arrow.annotation.linePoints.end, { x: 595, y: 842 });

  const stamp = convertLegacyPdfAnnotation(
    legacy({ id: "s", kind: "stamp", stampName: "Approved" }),
    A4,
  );
  assert.equal(stamp.ok, true);
  assert.equal(stamp.annotation.stampName, "Approved");
});

test("转不了的五种情形逐条有原因，且原因不是空串", () => {
  const cases = [
    ["图片图章", legacy({ kind: "stamp" })],
    ["没有 quads 的高亮", legacy({ kind: "highlight" })],
    ["没有笔迹的手绘", legacy({ kind: "freehand", strokes: [] })],
    ["没有两端的线", legacy({ kind: "line" })],
  ];
  for (const [label, record] of cases) {
    const outcome = convertLegacyPdfAnnotation(record, A4);
    assert.equal(outcome.ok, false, `${label} 本该转不了却转成功了`);
    assert.notEqual(outcome.reason, "", `${label} 没给原因`);
    assert.ok(outcome.reason.length > 8, `${label} 的原因太短，等于没说`);
  }
  // 第五种：页面尺寸读不出来。
  const broken = convertLegacyPdfAnnotation(legacy(), {
    index: 0,
    widthPt: 0,
    heightPt: 0,
  });
  assert.equal(broken.ok, false);
  assert.match(broken.reason, /尺寸/);
});

test("部分成功是正常结果：能转的转，转不了的留原因", () => {
  const records = [
    legacy({ id: "ok-1" }),
    legacy({ id: "img-stamp", kind: "stamp" }),
    legacy({ id: "ok-2", kind: "square" }),
    { not: "an annotation" },
    legacy({ id: "off-page", pageIndex: 9 }),
  ];
  const result = convertLegacyPdfAnnotations(records, [A4], {
    editorRevision: 7,
  });
  assert.equal(result.ok, true);
  assert.equal(result.converted, 2);
  assert.equal(result.skipped.length, 3);
  for (const skip of result.skipped) {
    assert.notEqual(skip.reason, "", `${skip.id} 没给原因`);
  }
  assert.match(
    result.skipped.find((s) => s.id === "off-page").reason,
    /没有这一页/,
  );
  assert.equal(result.sidecar.source, "legacy-converted");
  assert.equal(result.sidecar.editorRevision, 7);
  assert.equal(result.sidecar.schema, PDF_ANNOTATION_SIDECAR_SCHEMA);
  assert.equal(result.sidecar.version, PDF_ANNOTATION_SIDECAR_VERSION);
  assert.match(result.summary, /5 条里转换了 2 条/);
});

test("重复 id 只认第一条，并说明为什么丢了后面那条", () => {
  const result = convertLegacyPdfAnnotations(
    [legacy({ id: "dup", contents: "第一条" }), legacy({ id: "dup", contents: "第二条" })],
    [A4],
  );
  assert.equal(result.converted, 1);
  assert.equal(result.sidecar.annotations[0].contents, "第一条");
  assert.match(result.skipped[0].reason, /重复/);
});

test("一键转换不改存量载荷一个字节（R7 只读）", () => {
  const records = [legacy({ id: "keep" }), legacy({ id: "img", kind: "stamp" })];
  const before = JSON.stringify(records);
  convertLegacyPdfAnnotations(records, [A4]);
  assert.equal(JSON.stringify(records), before, "一键转换改动了存量数据");
  assert.equal(pdfAnnotationLegacyIsReadOnly(), true);
});

test("sidecar 能变成 importAnnotations 吃的形状，且不带二进制", () => {
  const result = convertLegacyPdfAnnotations(
    [
      legacy({ id: "h", kind: "highlight", quads: [{ x: 0, y: 0, width: 0.1, height: 0.01 }] }),
      legacy({ id: "t" }),
    ],
    [A4],
  );
  const items = sidecarToTransferItems(result.sidecar);
  assert.equal(items.length, 2);
  for (const item of items) {
    assert.equal(typeof item.annotation.id, "string");
    assert.equal(typeof item.annotation.type, "number");
    assert.ok(item.annotation.rect.origin);
    // ctx 只有图片图章才需要，而图片图章根本进不了 sidecar。
    assert.equal("ctx" in item, false);
  }
  assert.equal(JSON.stringify(items).includes("undefined"), false);
});

test("空存量转换是成功而不是失败（没有注释也是一种合法状态）", () => {
  const result = convertLegacyPdfAnnotations([], [A4]);
  assert.equal(result.ok, true);
  assert.equal(result.converted, 0);
  assert.deepEqual(result.skipped, []);
});
