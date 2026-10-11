import assert from "node:assert/strict";
import test from "node:test";

import {
  REVIEW_FILTERS,
  canFollowup,
  canReplyFollowup,
  canReplyReview,
  canVote,
  composerProblem,
  filterCount,
  filterLabel,
  followupDays,
  safePhotos,
  stepPhoto,
} from "../src/shell/bay/reviews/review-model.ts";

const summary = { total: 12, avg: 4.8, good: 9, mid: 2, bad: 1, photos: 4, followup: 3 };

test("REVIEW_FILTERS 顺序是 all, good, mid, bad, photos, followup", () => {
  assert.deepEqual([...REVIEW_FILTERS], ["all", "good", "mid", "bad", "photos", "followup"]);
});

test("filterCount 读汇总里对应字段，不受别的筛选影响", () => {
  assert.equal(filterCount(summary, "all"), 12);
  assert.equal(filterCount(summary, "good"), 9);
  assert.equal(filterCount(summary, "mid"), 2);
  assert.equal(filterCount(summary, "bad"), 1);
  assert.equal(filterCount(summary, "photos"), 4);
  assert.equal(filterCount(summary, "followup"), 3);
});

test("filterLabel 返回中文原文", () => {
  assert.equal(filterLabel("all"), "全部");
  assert.equal(filterLabel("good"), "好评");
  assert.equal(filterLabel("mid"), "中评");
  assert.equal(filterLabel("bad"), "差评");
  assert.equal(filterLabel("photos"), "有图");
  assert.equal(filterLabel("followup"), "有追评");
});

test("composerProblem：没选星、差评太短、超长、图太多、非 https", () => {
  assert.equal(composerProblem({ rating: 0, body: "", photos: [] }), "请先选星级");
  assert.equal(composerProblem({ rating: 6, body: "很好", photos: [] }), "请先选星级");
  assert.equal(composerProblem({ rating: 3.5, body: "很好", photos: [] }), "请先选星级");
  assert.equal(composerProblem({ rating: 1, body: "差", photos: [] }), "差评请写明原因（至少 5 个字）");
  assert.equal(composerProblem({ rating: 2, body: "abcd", photos: [] }), "差评请写明原因（至少 5 个字）");
  assert.equal(composerProblem({ rating: 2, body: "原因写够了", photos: [] }), null);
  assert.equal(composerProblem({ rating: 5, body: "", photos: [] }), null);
  assert.equal(composerProblem({ rating: 5, body: "x".repeat(2001), photos: [] }), "评价正文最多 2000 个字");
  assert.equal(composerProblem({ rating: 5, body: "", photos: Array.from({ length: 10 }, (_, i) => `https://cdn.example/${i}.png`) }), "最多上传 9 张图");
  assert.equal(composerProblem({ rating: 5, body: "", photos: ["http://cdn.example/a.png"] }), "图片地址必须是 https:// 开头");
  assert.equal(composerProblem({ rating: 5, body: "", photos: ["javascript:alert(1)"] }), "图片地址必须是 https:// 开头");
  assert.equal(composerProblem({ rating: 4, body: "ok", photos: ["https://cdn.example/a.png"] }), null);
});

test("followupDays：向下取整、至少 0、缺日期为 null", () => {
  assert.equal(followupDays("2026-01-01T00:00:00Z", "2026-01-03T12:00:00Z"), 2);
  assert.equal(followupDays("2026-01-01T00:00:00Z", "2026-01-01T12:00:00Z"), 0);
  assert.equal(followupDays("2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z"), 0);
  assert.equal(followupDays(null, "2026-01-02T00:00:00Z"), null);
  assert.equal(followupDays("2026-01-01T00:00:00Z", null), null);
  assert.equal(followupDays("not-a-date", "2026-01-02T00:00:00Z"), null);
});

test("canFollowup / canReply* / canVote", () => {
  assert.equal(canFollowup({ viewer_is_author: true, followup_body: null }), true);
  assert.equal(canFollowup({ viewer_is_author: true, followup_body: "" }), true);
  assert.equal(canFollowup({ viewer_is_author: true, followup_body: "已追" }), false);
  assert.equal(canFollowup({ viewer_is_author: false, followup_body: null }), false);
  assert.equal(canReplyReview({ viewer_is_seller: true, seller_reply: "" }), true);
  assert.equal(canReplyReview({ viewer_is_seller: true, seller_reply: "回了" }), false);
  assert.equal(canReplyReview({ viewer_is_seller: false, seller_reply: "" }), false);
  assert.equal(canReplyFollowup({ viewer_is_seller: true, followup_body: "追", followup_reply: null }), true);
  assert.equal(canReplyFollowup({ viewer_is_seller: true, followup_body: "追", followup_reply: "回" }), false);
  assert.equal(canReplyFollowup({ viewer_is_seller: true, followup_body: null, followup_reply: null }), false);
  assert.equal(canReplyFollowup({ viewer_is_seller: false, followup_body: "追", followup_reply: null }), false);
  assert.equal(canVote({ viewer_is_author: false }), true);
  assert.equal(canVote({ viewer_is_author: true }), false);
});

test("safePhotos 只留 https，最多 9 张", () => {
  assert.deepEqual(
    safePhotos(["https://a.com/1.png", "http://b.com/2.png", "javascript:x", " https://c.com/3.png ", ""]),
    ["https://a.com/1.png", "https://c.com/3.png"],
  );
  const many = Array.from({ length: 12 }, (_, i) => `https://cdn.example/${i}.png`);
  assert.equal(safePhotos(many).length, 9);
  assert.deepEqual(safePhotos([]), []);
});

test("stepPhoto 循环", () => {
  assert.equal(stepPhoto(0, 3, 1), 1);
  assert.equal(stepPhoto(2, 3, 1), 0);
  assert.equal(stepPhoto(0, 3, -1), 2);
  assert.equal(stepPhoto(0, 1, 1), 0);
  assert.equal(stepPhoto(0, 0, 1), 0);
});
