import assert from "node:assert/strict";
import test from "node:test";

import {
  bundleProblems,
  bundleTotals,
  draftFromLesson,
  lessonDraftProblems,
  lessonPatch,
  lessonStatusLabel,
  moveChapter,
  parseLessonPriceFen,
  refundHoursLeft,
  sortSoldOrders,
} from "../src/shell/bay/lessons/lesson-editor-model.ts";

function toInput(fen) {
  return fen ? String(fen / 100) : "";
}

function toFen(text) {
  return parseLessonPriceFen(text);
}

function lesson(extra = {}) {
  return {
    id: "l1",
    owner_id: "u1",
    title: "Demo",
    summary: "A short line",
    description: "Longer text",
    cover_url: "https://cdn.example/cover.png",
    category: "website",
    posted_site: "oceanleo",
    price_fen: 1200,
    status: "draft",
    chapter_count: 1,
    sales_count: 0,
    rating_avg: 0,
    rating_count: 0,
    published_at: null,
    updated_at: null,
    moderation_hidden: false,
    created_at: null,
    ...extra,
  };
}

function purchase(extra = {}) {
  return {
    id: extra.id || "p1",
    buyer_id: "b1",
    seller_id: "s1",
    item_kind: "lesson",
    item_id: "l1",
    item_title: "Demo",
    contract_id: null,
    price_fen: 1200,
    status: "active",
    opened_at: null,
    refund_reason: null,
    refund_requested_at: null,
    refund_due_at: null,
    refund_decided_at: null,
    refund_note: null,
    confirm_due_at: null,
    created_at: "2026-10-11T10:00:00Z",
    instant_refund: false,
    ...extra,
  };
}

test("draftFromLesson 把空封面、空类目收成空串，价格走 toInput", () => {
  const draft = draftFromLesson(lesson({ cover_url: null, category: null, price_fen: 0 }), toInput);
  assert.equal(draft.coverUrl, "");
  assert.equal(draft.category, "");
  assert.equal(draft.price, "");
  assert.equal(draftFromLesson(lesson({ price_fen: 250 }), toInput).price, "2.5");
});

test("lessonPatch 只带改过的字段；空封面转 null；价格留空当 0", () => {
  const row = lesson();
  const draft = draftFromLesson(row, toInput);
  assert.deepEqual(lessonPatch(draft, row, toFen), {});
  assert.deepEqual(lessonPatch({ ...draft, title: "New" }, row, toFen), { title: "New" });
  assert.deepEqual(lessonPatch({ ...draft, summary: "Next" }, row, toFen), { summary: "Next" });
  assert.deepEqual(lessonPatch({ ...draft, description: "More" }, row, toFen), { description: "More" });
  assert.deepEqual(lessonPatch({ ...draft, category: "design" }, row, toFen), { category: "design" });
  assert.deepEqual(lessonPatch({ ...draft, coverUrl: "" }, row, toFen), { cover_url: null });
  assert.deepEqual(lessonPatch({ ...draft, price: "" }, row, toFen), { price_fen: 0 });
  assert.deepEqual(lessonPatch({ ...draft, price: "20" }, row, toFen), { price_fen: 2000 });
});

test("lessonDraftProblems 每一条", () => {
  const ok = { title: "T", summary: "s", description: "", coverUrl: "https://x", category: "website", price: "9" };
  assert.deepEqual(lessonDraftProblems({ ...ok, title: "" }, toFen), ["请填写名称"]);
  assert.ok(lessonDraftProblems({ ...ok, title: "x".repeat(81) }, toFen).includes("名称不能超过 80 个字"));
  assert.ok(lessonDraftProblems({ ...ok, summary: "" }, toFen).includes("请写一句话简介"));
  assert.ok(lessonDraftProblems({ ...ok, summary: "s".repeat(201) }, toFen).includes("一句话简介不能超过 200 个字"));
  assert.ok(lessonDraftProblems({ ...ok, description: "d".repeat(4001) }, toFen).includes("详细介绍不能超过 4000 个字"));
  assert.ok(lessonDraftProblems({ ...ok, coverUrl: "http://x" }, toFen).includes("封面图需要是 https 开头的图片地址"));
  assert.ok(lessonDraftProblems({ ...ok, category: "" }, toFen).includes("请选择一个站点类目"));
  assert.ok(lessonDraftProblems({ ...ok, price: "abc" }, toFen).includes("价格不是合法金额"));
  assert.ok(lessonDraftProblems({ ...ok, price: "-1" }, toFen).includes("价格不是合法金额"));
  assert.deepEqual(lessonDraftProblems({ ...ok, price: "" }, toFen), []);
  assert.deepEqual(lessonDraftProblems(ok, toFen), []);
});

test("moveChapter 到头不动，中间交换，未知 id 原样", () => {
  assert.deepEqual(moveChapter(["a", "b", "c"], "a", -1), ["a", "b", "c"]);
  assert.deepEqual(moveChapter(["a", "b", "c"], "c", 1), ["a", "b", "c"]);
  assert.deepEqual(moveChapter(["a", "b", "c"], "b", -1), ["b", "a", "c"]);
  assert.deepEqual(moveChapter(["a", "b", "c"], "b", 1), ["a", "c", "b"]);
  assert.deepEqual(moveChapter(["a", "b", "c"], "z", 1), ["a", "b", "c"]);
  const ids = ["a", "b"];
  const next = moveChapter(ids, "a", 1);
  assert.notEqual(next, ids);
});

test("bundleTotals 合计、节省、超价", () => {
  const lessons = [
    { id: "a", price_fen: 1000 },
    { id: "b", price_fen: 400 },
    { id: "c", price_fen: 200 },
  ];
  assert.deepEqual(bundleTotals(lessons, [], 0), { total: 0, saving: 0, overpriced: false });
  assert.deepEqual(bundleTotals(lessons, ["a", "b"], 800), { total: 1400, saving: 600, overpriced: false });
  assert.deepEqual(bundleTotals(lessons, ["a", "b"], 1400), { total: 1400, saving: 0, overpriced: false });
  assert.deepEqual(bundleTotals(lessons, ["a", "b"], 1500), { total: 1400, saving: -100, overpriced: true });
  assert.deepEqual(bundleTotals(lessons, ["z"], 1), { total: 0, saving: -1, overpriced: true });
});

test("bundleProblems 每一条", () => {
  const draft = { title: "T", summary: "s", coverUrl: "", price: "8" };
  assert.ok(bundleProblems({ ...draft, title: "" }, ["a", "b"], { overpriced: false }).includes("请填写名称"));
  assert.ok(bundleProblems({ ...draft, title: "x".repeat(81) }, ["a", "b"], { overpriced: false }).includes("名称不能超过 80 个字"));
  assert.ok(bundleProblems({ ...draft, summary: "" }, ["a", "b"], { overpriced: false }).includes("请写一句话简介"));
  assert.ok(bundleProblems({ ...draft, summary: "s".repeat(201) }, ["a", "b"], { overpriced: false }).includes("一句话简介不能超过 200 个字"));
  assert.ok(bundleProblems(draft, ["a"], { overpriced: false }).includes("至少要勾选两门课"));
  assert.ok(bundleProblems(draft, Array.from({ length: 21 }, (_, i) => String(i)), { overpriced: false }).includes("一套最多 20 门课"));
  assert.ok(bundleProblems(draft, ["a", "b"], { overpriced: true }).includes("套餐价不能高于里面课程单买的合计"));
  assert.deepEqual(bundleProblems(draft, ["a", "b"], { overpriced: false }), []);
});

test("sortSoldOrders：待处理退款最前，其余按创建时间从新到旧", () => {
  const rows = [
    purchase({ id: "old", status: "active", created_at: "2026-10-01T00:00:00Z" }),
    purchase({ id: "new", status: "completed", created_at: "2026-10-10T00:00:00Z" }),
    purchase({ id: "refund-old", status: "refund_requested", created_at: "2026-09-01T00:00:00Z" }),
    purchase({ id: "refund-new", status: "refund_requested", created_at: "2026-10-09T00:00:00Z" }),
  ];
  assert.deepEqual(
    sortSoldOrders(rows).map((row) => row.id),
    ["refund-new", "refund-old", "new", "old"],
  );
});

test("lessonStatusLabel 四种", () => {
  assert.equal(lessonStatusLabel({ status: "draft", moderation_hidden: true }), "已被平台隐藏");
  assert.equal(lessonStatusLabel({ status: "published", moderation_hidden: true }), "已被平台隐藏");
  assert.equal(lessonStatusLabel({ status: "draft", moderation_hidden: false }), "草稿");
  assert.equal(lessonStatusLabel({ status: "published", moderation_hidden: false }), "已上架");
  assert.equal(lessonStatusLabel({ status: "offline", moderation_hidden: false }), "已下架");
});

test("parseLessonPriceFen 留空当 0，非法为 null", () => {
  assert.equal(parseLessonPriceFen(""), 0);
  assert.equal(parseLessonPriceFen("  "), 0);
  assert.equal(parseLessonPriceFen("12"), 1200);
  assert.equal(parseLessonPriceFen("12.5"), 1250);
  assert.equal(parseLessonPriceFen("1,200"), 120000);
  assert.equal(parseLessonPriceFen("abc"), null);
  assert.equal(parseLessonPriceFen("-3"), null);
});

test("refundHoursLeft 向上取整，过期为 0", () => {
  const now = Date.parse("2026-10-11T10:00:00Z");
  assert.equal(refundHoursLeft(null, now), 0);
  assert.equal(refundHoursLeft("2026-10-11T12:01:00Z", now), 3);
  assert.equal(refundHoursLeft("2026-10-11T09:00:00Z", now), 0);
});
